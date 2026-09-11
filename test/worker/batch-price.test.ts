import { SELF, env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { app } from "../../src/worker/app";
import {
  addCards,
  batchUpdatePrice,
  createReservation,
  createSaleReservation,
  createSeries,
  setCardHeld,
  updateCard,
} from "../../src/worker/db/queries";

let sequence = 0;
async function fixture() {
  const series = `PRICE ${++sequence}`;
  await createSeries(env.DB, {
    name: series,
    volume: 3,
    characters: ["Rei", "Other"],
    rarities: ["SSR"],
  });
  const card = { series, character: "Rei", rarity: "SSR" as const };
  const ids = await addCards(env.DB, [card, card, card]);
  const slot = await env.DB.prepare(
    "SELECT id FROM card_catalog WHERE series = ? AND character = 'Rei'",
  )
    .bind(series)
    .first<{ id: number }>();
  if (!slot) throw new Error("fixture catalog missing");
  for (const id of ids)
    await updateCard(env.DB, id, {
      status: "for_sale",
      askingPrice: 150,
      note: "卡況備註",
      wantInReturn: "舊條件",
    });
  return {
    ids,
    card,
    catalogId: slot.id,
    input: {
      askingPrice: 200,
      cards: ids.map((cardId) => ({
        cardId,
        catalogId: slot.id,
        currentPrice: 150,
      })),
    },
  };
}
const post = (body: unknown) =>
  SELF.fetch("https://example.com/api/admin/cards/batch-price", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
const states = async (ids: number[]) =>
  (
    await env.DB.prepare(
      "SELECT id, status, asking_price AS price, note, want_in_return AS want, mutation_version AS version FROM cards WHERE id IN (SELECT value FROM json_each(?)) ORDER BY id",
    )
      .bind(JSON.stringify(ids))
      .all()
  ).results;
const eventCount = () =>
  env.DB.prepare(
    "SELECT COUNT(*) FROM activity_events WHERE source_type = 'batch_price'",
  ).first<number>("COUNT(*)");

describe("batch sale price", () => {
  it("updates exact cards atomically, preserves metadata, and records grouped old/new prices", async () => {
    const f = await fixture();
    await updateCard(env.DB, f.ids[2], { askingPrice: 200 });
    f.input.cards[2].currentPrice = 200;
    expect(await (await post(f.input)).json()).toEqual({ count: 2 });
    expect(await states(f.ids)).toMatchObject(
      f.ids.map(() => ({
        status: "for_sale",
        price: 200,
        note: "卡況備註",
        want: "舊條件",
        version: 2,
      })),
    );
    const lines = (
      await env.DB.prepare(
        "SELECT l.qty, l.unit_amount AS price, l.note FROM activity_event_lines l JOIN activity_events e ON e.id = l.event_id WHERE e.source_type = 'batch_price' AND l.catalog_id = ?",
      )
        .bind(f.catalogId)
        .all()
    ).results;
    expect(lines).toEqual([
      { qty: 2, price: 200, note: "原售價 150 元 → 200 元" },
    ]);
    const before = await states(f.ids);
    const events = await eventCount();
    expect((await post(f.input)).status).toBe(409);
    expect(await states(f.ids)).toEqual(before);
    expect(await eventCount()).toBe(events);
  });

  it.each([
    "price",
    "held",
    "trade",
    "sale-reserved",
    "trade-reserved",
    "legacy-reserved",
    "missing",
    "wrong-catalog",
  ])("rejects the entire batch for %s changes", async (kind) => {
    const f = await fixture();
    if (kind === "price")
      await updateCard(env.DB, f.ids[0], { askingPrice: 175 });
    if (kind === "held") {
      await updateCard(env.DB, f.ids[0], { status: "owned" });
      await setCardHeld(env.DB, f.ids[0], true);
    }
    if (kind === "trade")
      await updateCard(env.DB, f.ids[0], { status: "for_trade" });
    if (kind === "sale-reserved")
      await createSaleReservation(env.DB, {
        reservedAt: "2026-09-11",
        cards: [{ cardId: f.ids[0], catalogId: f.catalogId, unitPrice: 150 }],
      });
    if (kind === "trade-reserved" || kind === "legacy-reserved") {
      const id = await createReservation(env.DB, {
        reservedAt: "2026-09-11",
        give: [{ ...f.card, qty: 1 }],
        receive: [{ ...f.card, character: "Other", qty: 1 }],
      });
      if (kind === "legacy-reserved")
        await env.DB.prepare(
          "UPDATE trade_reservation_lines SET card_id = NULL WHERE reservation_id = ? AND direction = 'give'",
        )
          .bind(id)
          .run();
    }
    if (kind === "missing") f.input.cards[0].cardId = 9999999;
    if (kind === "wrong-catalog") f.input.cards[0].catalogId = 9999999;
    const before = await states(f.ids);
    const events = await eventCount();
    expect((await post(f.input)).status).toBe(409);
    expect(await states(f.ids)).toEqual(before);
    expect(await eventCount()).toBe(events);
  });

  it("cancels all writes when a card changes after preflight", async () => {
    const f = await fixture();
    const events = await eventCount();
    let afterCompeting: Awaited<ReturnType<typeof states>> = [];
    const db = new Proxy(env.DB, {
      get(target, property) {
        if (property === "batch")
          return async (statements: D1PreparedStatement[]) => {
            await updateCard(env.DB, f.ids[0], { askingPrice: 180 });
            afterCompeting = await states(f.ids);
            return env.DB.batch(statements);
          };
        const value = Reflect.get(target, property);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
    await expect(batchUpdatePrice(db, f.input)).rejects.toThrow("庫存已變動");
    expect(await states(f.ids)).toEqual(afterCompeting);
    expect(await eventCount()).toBe(events);
  });

  it("supports a negotiable original price and zero as the new price", async () => {
    const f = await fixture();
    await updateCard(env.DB, f.ids[0], { askingPrice: null });
    expect(
      await (
        await post({
          askingPrice: 0,
          cards: [{ ...f.input.cards[0], currentPrice: null }],
        })
      ).json(),
    ).toEqual({ count: 1 });
    expect((await states(f.ids))[0]).toMatchObject({ price: 0 });
  });

  it.each([
    null,
    {},
    { askingPrice: -1, cards: [] },
    { askingPrice: 200, cards: [] },
    { askingPrice: 200.001, cards: [] },
    { askingPrice: "200", cards: [] },
    { askingPrice: 200, cards: [{ cardId: 1, catalogId: 1 }] },
    {
      askingPrice: 200,
      cards: Array.from({ length: 101 }, (_, i) => ({
        cardId: i + 1,
        catalogId: 1,
        currentPrice: 150,
      })),
    },
    {
      askingPrice: 200,
      cards: [
        { cardId: 1, catalogId: 1, currentPrice: 150 },
        { cardId: 1, catalogId: 1, currentPrice: 150 },
      ],
    },
  ])("rejects invalid input: %j", async (body) => {
    expect((await post(body)).status).toBe(400);
  });

  it("requires admin authorization and valid JSON", async () => {
    expect(
      (
        await SELF.fetch("https://example.com/api/admin/cards/batch-price", {
          method: "POST",
          body: "{",
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await app.request(
          "https://example.com/api/admin/cards/batch-price",
          { method: "POST", body: "{}" },
          { ...env, ALLOW_INSECURE_ADMIN: "0" },
        )
      ).status,
    ).toBe(403);
  });
});
