import { SELF, env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import type { BatchListingInput, MarketListing } from "../../src/shared/types";
import { app } from "../../src/worker/app";
import {
  addCards,
  batchListCards,
  createReservation,
  createSeries,
  getTradePostCandidates,
  recordTransaction,
  setCardHeld,
  updateCard,
} from "../../src/worker/db/queries";

let sequence = 0;
async function fixture(qty = 3) {
  const series = `BATCH LISTING ${++sequence}`;
  await createSeries(env.DB, {
    name: series,
    volume: 3,
    characters: ["Give", "Other"],
    rarities: ["R"],
  });
  const card = { series, character: "Give", rarity: "R" as const };
  const ids = await addCards(
    env.DB,
    Array.from({ length: qty }, () => card),
  );
  const catalog = (
    await env.DB.prepare(
      "SELECT id, character FROM card_catalog WHERE series = ? ORDER BY id",
    )
      .bind(series)
      .all<{ id: number; character: string }>()
  ).results;
  const catalogId = catalog[0].id;
  return {
    ids,
    card,
    catalogId,
    otherCatalogId: catalog[1].id,
    input: {
      status: "for_trade",
      cards: ids.slice(0, 2).map((cardId) => ({ cardId, catalogId })),
    } satisfies BatchListingInput,
  };
}

const post = (body: unknown) =>
  SELF.fetch("https://example.com/api/admin/cards/batch-listing", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
const states = async (ids: number[]) =>
  (
    await env.DB.prepare(
      `SELECT id, status, held, asking_price AS price, want_in_return AS want, note, mutation_version AS version
   FROM cards WHERE id IN (SELECT value FROM json_each(?)) ORDER BY id`,
    )
      .bind(JSON.stringify(ids))
      .all()
  ).results;
const activities = () =>
  env.DB.prepare(
    "SELECT COUNT(*) AS count FROM activity_events WHERE source_type = 'batch_listing'",
  ).first<{ count: number }>();

async function reserve(f: Awaited<ReturnType<typeof fixture>>, legacy = false) {
  const reservationId = await createReservation(env.DB, {
    reservedAt: "2026-09-11",
    give: [{ ...f.card, qty: 1 }],
    receive: [{ ...f.card, character: "Other", qty: 1 }],
  });
  if (legacy)
    await env.DB.prepare(
      "UPDATE trade_reservation_lines SET card_id = NULL WHERE reservation_id = ? AND direction = 'give'",
    )
      .bind(reservationId)
      .run();
}

function beforeBatch(action: () => Promise<unknown>): D1Database {
  let intercepted = false;
  const batch: D1Database["batch"] = async <T>(
    statements: D1PreparedStatement[],
  ) => {
    if (!intercepted) {
      intercepted = true;
      await action();
    }
    return env.DB.batch<T>(statements);
  };
  return new Proxy(env.DB, {
    get(target, property) {
      if (property === "batch") return batch;
      const value = Reflect.get(target, property);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}

describe("batch listing", () => {
  it("lists exact quantities across card kinds, preserves notes, and records one grouped activity", async () => {
    const f = await fixture();
    const [otherId] = await addCards(env.DB, [
      { ...f.card, character: "Other" },
    ]);
    await updateCard(env.DB, f.ids[0], {
      note: "private inventory note",
      wantInReturn: "old condition",
    });
    const before = await activities();
    const response = await post({
      ...f.input,
      status: "for_sale",
      askingPrice: 25.5,
      cards: [
        ...f.input.cards,
        { cardId: otherId, catalogId: f.otherCatalogId },
      ],
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ count: 3 });
    expect(await states(f.ids)).toMatchObject([
      {
        status: "for_sale",
        price: 25.5,
        want: null,
        note: "private inventory note",
      },
      { status: "for_sale", price: 25.5, version: 1 },
      { status: "owned", version: 0 },
    ]);
    const market = (await (
      await SELF.fetch("https://example.com/api/market")
    ).json()) as MarketListing[];
    expect(market.filter((item) => item.series === f.card.series)).toHaveLength(
      3,
    );
    expect((await activities())?.count).toBe((before?.count ?? 0) + 1);
    const lines = (
      await env.DB.prepare(
        `SELECT l.catalog_id AS catalogId, l.qty, l.before_status AS beforeStatus, l.after_status AS afterStatus, l.unit_amount AS price
       FROM activity_event_lines l JOIN activity_events e ON e.id = l.event_id
         WHERE e.source_type = 'batch_listing' AND l.catalog_id IN (?, ?) ORDER BY l.catalog_id`,
      )
        .bind(f.catalogId, f.otherCatalogId)
        .all()
    ).results;
    expect(lines).toEqual([
      {
        catalogId: f.catalogId,
        qty: 2,
        beforeStatus: "owned",
        afterStatus: "for_sale",
        price: 25.5,
      },
      {
        catalogId: f.otherCatalogId,
        qty: 1,
        beforeStatus: "owned",
        afterStatus: "for_sale",
        price: 25.5,
      },
    ]);
  });

  it("publishes trade conditions and makes the selected copies available to announcements", async () => {
    const f = await fixture();
    await updateCard(env.DB, f.ids[0], { askingPrice: 100 });
    expect(
      (await post({ ...f.input, wantInReturn: "  想換 UR  " })).status,
    ).toBe(200);
    expect(await states(f.ids)).toMatchObject([
      { price: null, want: "想換 UR" },
      { price: null, want: "想換 UR" },
      { status: "owned" },
    ]);
    expect(
      (await getTradePostCandidates(env.DB)).give.find(
        (line) => line.catalogId === f.catalogId,
      )?.availableQty,
    ).toBe(2);
  });

  it.each([null, 0])(
    "supports negotiable and zero sale prices: %s",
    async (askingPrice) => {
      const f = await fixture();
      expect(
        (await post({ ...f.input, status: "for_sale", askingPrice })).status,
      ).toBe(200);
      expect((await states(f.ids))[0]).toMatchObject({ price: askingPrice });
    },
  );

  it("does not list more copies when the exact request is retried", async () => {
    const f = await fixture();
    expect((await post(f.input)).status).toBe(200);
    const before = await states(f.ids);
    const events = await activities();
    expect((await post(f.input)).status).toBe(409);
    expect(await states(f.ids)).toEqual(before);
    expect(await activities()).toEqual(events);
  });

  it.each([
    "held",
    "listed",
    "sold",
    "reserved",
    "legacy",
    "wrong-catalog",
    "missing",
  ])("rejects the entire batch when a card is %s", async (kind) => {
    const f = await fixture();
    if (kind === "held") await setCardHeld(env.DB, f.ids[0], true);
    if (kind === "listed")
      await updateCard(env.DB, f.ids[0], { status: "for_sale" });
    if (kind === "sold")
      await recordTransaction(env.DB, f.ids[0], {
        type: "sale",
        happenedAt: "2026-09-11",
      });
    if (kind === "reserved" || kind === "legacy")
      await reserve(f, kind === "legacy");
    if (kind === "wrong-catalog") f.input.cards[0].catalogId = f.otherCatalogId;
    if (kind === "missing") f.input.cards[0].cardId = 9999999;
    const before = await states(f.ids);
    const events = await activities();
    expect((await post(f.input)).status).toBe(409);
    expect(await states(f.ids)).toEqual(before);
    expect(await activities()).toEqual(events);
  });

  it.each(["held", "reserved", "legacy", "updated"])(
    "cancels all writes when a card is %s after preflight",
    async (kind) => {
      const f = await fixture();
      const beforeEvents = await activities();
      let afterCompeting: Awaited<ReturnType<typeof states>> = [];
      const db = beforeBatch(async () => {
        if (kind === "held") await setCardHeld(env.DB, f.ids[0], true);
        if (kind === "reserved" || kind === "legacy")
          await reserve(f, kind === "legacy");
        if (kind === "updated")
          await updateCard(env.DB, f.ids[0], { note: "changed" });
        afterCompeting = await states(f.ids);
      });
      await expect(batchListCards(db, f.input)).rejects.toThrow("庫存已變動");
      expect(await states(f.ids)).toEqual(afterCompeting);
      expect(await activities()).toEqual(beforeEvents);
      const orphanLines = await env.DB.prepare(
        "SELECT COUNT(*) AS count FROM activity_event_lines l LEFT JOIN activity_events e ON e.id = l.event_id WHERE e.id IS NULL",
      ).first<{ count: number }>();
      expect(orphanLines?.count).toBe(0);
    },
  );

  it("supports a full 100-card batch", async () => {
    const f = await fixture(100);
    expect(
      (
        await post({
          ...f.input,
          cards: f.ids.map((cardId) => ({ cardId, catalogId: f.catalogId })),
        })
      ).status,
    ).toBe(200);
    expect(
      (await states(f.ids)).every((card) => card.status === "for_trade"),
    ).toBe(true);
  });

  it.each([
    null,
    [],
    true,
    {},
    { status: "owned", cards: [{ cardId: 1, catalogId: 1 }] },
    { status: "for_trade", cards: [] },
    {
      status: "for_trade",
      cards: Array.from({ length: 101 }, (_, i) => ({
        cardId: i + 1,
        catalogId: 1,
      })),
    },
    ...[0, -1, 1.5, "1", null].map((cardId) => ({
      status: "for_trade",
      cards: [{ cardId, catalogId: 1 }],
    })),
    {
      status: "for_trade",
      cards: [
        { cardId: 1, catalogId: 1 },
        { cardId: 1, catalogId: 2 },
      ],
    },
    { status: "for_trade", cards: [{ cardId: 1, catalogId: "1" }] },
    ...[-1, 1.001, "20", true, {}, 1e100].map((askingPrice) => ({
      status: "for_sale",
      cards: [{ cardId: 1, catalogId: 1 }],
      askingPrice,
    })),
    ...[false, {}, "x".repeat(1001)].map((wantInReturn) => ({
      status: "for_trade",
      cards: [{ cardId: 1, catalogId: 1 }],
      wantInReturn,
    })),
  ])("validates untrusted input without activity writes: %j", async (body) => {
    const before = await activities();
    expect((await post(body)).status).toBe(400);
    expect(await activities()).toEqual(before);
  });

  it("rejects malformed JSON and requires admin authorization", async () => {
    expect(
      (
        await SELF.fetch("https://example.com/api/admin/cards/batch-listing", {
          method: "POST",
          body: "{",
        })
      ).status,
    ).toBe(400);
    const response = await app.request(
      "https://example.com/api/admin/cards/batch-listing",
      { method: "POST", body: "{}" },
      { ...env, ALLOW_INSECURE_ADMIN: "0" },
    );
    expect(response.status).toBe(403);
  });
});
