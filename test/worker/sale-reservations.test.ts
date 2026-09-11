import { SELF, env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { app } from "../../src/worker/app";
import {
  addCards,
  batchListCards,
  cancelSaleReservation,
  completeSaleReservation,
  createReservation,
  createSaleReservation,
  createSeries,
  getActivities,
  getAdminPendingSales,
  getMarket,
  getOverview,
  listCards,
  reclassifyCard,
  recordTransaction,
  updateCard,
} from "../../src/worker/db/queries";

const DATE = "2026-09-11";
let seq = 0;
async function fixture(qty = 4) {
  const series = `SALE RESERVATION ${++seq}`;
  await createSeries(env.DB, {
    name: series,
    volume: 3,
    characters: ["Rei", "Other"],
    rarities: ["SR"],
  });
  const card = { series, character: "Rei", rarity: "SR" as const };
  const ids = await addCards(
    env.DB,
    Array.from({ length: qty }, () => card),
  );
  const catalogId = (
    await env.DB.prepare("SELECT catalog_id AS id FROM cards WHERE id = ?")
      .bind(ids[0])
      .first<{ id: number }>()
  )?.id;
  if (!catalogId) throw new Error("missing fixture catalog");
  await batchListCards(env.DB, {
    status: "for_sale",
    askingPrice: 50,
    cards: ids.map((cardId) => ({ cardId, catalogId })),
  });
  return {
    ids,
    card,
    catalogId,
    input: {
      reservedAt: DATE,
      counterparty: "private buyer",
      note: "private pickup",
      cards: ids
        .slice(0, 2)
        .map((cardId) => ({ cardId, catalogId, unitPrice: 40.5 })),
    },
  };
}

function beforeBatch(action: () => Promise<unknown>): D1Database {
  let once = false;
  const batch: D1Database["batch"] = async <T>(
    statements: D1PreparedStatement[],
  ) => {
    if (!once) {
      once = true;
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
const counts = () =>
  env.DB.prepare(`SELECT
  (SELECT COUNT(*) FROM sale_reservations) reservations,
  (SELECT COUNT(*) FROM sale_reservation_lines) lines,
  (SELECT COUNT(*) FROM transactions) transactions,
  (SELECT COUNT(*) FROM activity_events) events,
  (SELECT COUNT(*) FROM activity_event_lines) eventLines`).first();

describe("sale reservation lifecycle", () => {
  it("locks two physical copies, keeps holdings and listing terms, and exposes no buyer or agreed price", async () => {
    const f = await fixture();
    const id = await createSaleReservation(env.DB, f.input);
    expect(
      (await getAdminPendingSales(env.DB)).find((row) => row.id === id),
    ).toMatchObject({
      amount: 81,
      counterparty: "private buyer",
      note: "private pickup",
      cards: f.input.cards,
    });
    const cell = (await getOverview(env.DB)).cells.find(
      (c) => c.catalogId === f.catalogId,
    );
    expect(cell).toMatchObject({ owned: 4, reserved: 2, available: 2 });
    const market = (await getMarket(env.DB)).filter((c) =>
      f.ids.includes(c.cardId),
    );
    expect(market.filter((c) => c.reserved)).toHaveLength(2);
    expect(market[0]).toMatchObject({
      askingPrice: 50,
      reservationType: "sale",
      status: "for_sale",
    });
    expect(JSON.stringify(market)).not.toMatch(
      /private buyer|private pickup|unitPrice|40\.5/,
    );
    expect(
      (await listCards(env.DB, { series: f.card.series }))[0],
    ).toMatchObject({ reserved: true, reservationType: "sale" });
    await expect(
      recordTransaction(env.DB, f.ids[0], { type: "sale", happenedAt: DATE }),
    ).rejects.toThrow(/reserved/);
    await expect(
      updateCard(env.DB, f.ids[0], { status: "owned" }),
    ).rejects.toThrow(/reserved/);
    await expect(
      reclassifyCard(env.DB, f.ids[0], {
        targetCatalogId: f.catalogId + 1,
        happenedAt: DATE,
      }),
    ).rejects.toThrow(/reserved/);
    await expect(
      createReservation(env.DB, {
        reservedAt: DATE,
        give: [{ ...f.card, qty: 3 }],
        receive: [],
      }),
    ).rejects.toThrow(/unreserved/);
    const tradeId = await createReservation(env.DB, {
      reservedAt: DATE,
      give: [{ ...f.card, qty: 2 }],
      receive: [],
    });
    const locked = (
      await env.DB.prepare(
        "SELECT card_id AS id FROM trade_reservation_lines WHERE reservation_id = ?",
      )
        .bind(tradeId)
        .all<{ id: number }>()
    ).results;
    expect(locked.map((c) => c.id)).toEqual(f.ids.slice(2));
  });

  it("completes all copies once at agreed prices and records the correct inventory delta", async () => {
    const f = await fixture();
    const id = await createSaleReservation(env.DB, f.input);
    await completeSaleReservation(env.DB, id, DATE);
    expect((await getAdminPendingSales(env.DB)).some((r) => r.id === id)).toBe(
      false,
    );
    expect(
      (await getOverview(env.DB)).cells.find(
        (c) => c.catalogId === f.catalogId,
      ),
    ).toMatchObject({ owned: 2, reserved: 0, available: 2 });
    const transactions = (
      await env.DB.prepare(
        "SELECT type, price FROM transactions WHERE card_id IN (?, ?)",
      )
        .bind(...f.ids.slice(0, 2))
        .all()
    ).results;
    expect(transactions).toEqual([
      { type: "sale", price: 40.5 },
      { type: "sale", price: 40.5 },
    ]);
    const completed = (await getActivities(env.DB)).find(
      (e) =>
        e.sourceType === "sale_reservation" &&
        e.sourceId === id &&
        e.kind === "sale_completed",
    );
    expect(completed).toMatchObject({
      amount: 81,
      lines: [{ qty: 2, delta: -2, afterStatus: "sold", unitAmount: 40.5 }],
    });
    const before = await counts();
    await expect(completeSaleReservation(env.DB, id, DATE)).rejects.toThrow();
    await expect(cancelSaleReservation(env.DB, id)).rejects.toThrow();
    expect(await counts()).toEqual(before);
  });

  it("cancels without a transaction, releases the cards, and permits a new reservation", async () => {
    const f = await fixture();
    const id = await createSaleReservation(env.DB, f.input);
    const transactionCount = await env.DB.prepare(
      "SELECT COUNT(*) n FROM transactions",
    ).first();
    await cancelSaleReservation(env.DB, id);
    expect(
      await env.DB.prepare("SELECT COUNT(*) n FROM transactions").first(),
    ).toEqual(transactionCount);
    expect(
      (await getOverview(env.DB)).cells.find(
        (c) => c.catalogId === f.catalogId,
      ),
    ).toMatchObject({ owned: 4, reserved: 0, available: 4 });
    expect(
      (await getMarket(env.DB)).find((c) => c.cardId === f.ids[0]),
    ).toMatchObject({
      status: "for_sale",
      askingPrice: 50,
      reserved: false,
      reservationType: null,
    });
    expect(
      (await getActivities(env.DB)).find(
        (e) =>
          e.sourceType === "sale_reservation" &&
          e.sourceId === id &&
          e.kind === "sale_reservation_cancelled",
      )?.lines[0],
    ).toMatchObject({ delta: 0, qty: 2 });
    expect(await createSaleReservation(env.DB, f.input)).toBeGreaterThan(id);
  });

  it.each([false, true])(
    "excludes existing trade locks (legacy=%s)",
    async (legacy) => {
      const f = await fixture(2);
      const id = await createReservation(env.DB, {
        reservedAt: DATE,
        give: [{ ...f.card, qty: 1 }],
        receive: [],
      });
      if (legacy)
        await env.DB.prepare(
          "UPDATE trade_reservation_lines SET card_id = NULL WHERE reservation_id = ?",
        )
          .bind(id)
          .run();
      const before = await counts();
      await expect(createSaleReservation(env.DB, f.input)).rejects.toThrow();
      expect(await counts()).toEqual(before);
    },
  );

  it.each(["trade", "sale", "edit", "direct sale"] as const)(
    "rejects all writes after a concurrent %s takes a selected card",
    async (operation) => {
      const f = await fixture(2);
      let after: unknown;
      const db = beforeBatch(async () => {
        if (operation === "trade")
          await createReservation(env.DB, {
            reservedAt: DATE,
            give: [{ ...f.card, qty: 1 }],
            receive: [],
          });
        else if (operation === "sale")
          await createSaleReservation(env.DB, {
            ...f.input,
            cards: [f.input.cards[0]],
          });
        else if (operation === "edit")
          await updateCard(env.DB, f.ids[0], { askingPrice: 99 });
        else
          await recordTransaction(env.DB, f.ids[0], {
            type: "sale",
            happenedAt: DATE,
          });
        after = await counts();
      });
      await expect(createSaleReservation(db, f.input)).rejects.toThrow();
      expect(await counts()).toEqual(after);
    },
  );

  it.each(["trade", "direct sale", "edit"] as const)(
    "blocks a stale %s after a sale reservation wins",
    async (operation) => {
      const f = await fixture(2);
      let after: unknown;
      const db = beforeBatch(async () => {
        await createSaleReservation(env.DB, f.input);
        after = await counts();
      });
      await expect(
        operation === "trade"
          ? createReservation(db, {
              reservedAt: DATE,
              give: [{ ...f.card, qty: 1 }],
              receive: [],
            })
          : operation === "edit"
            ? updateCard(db, f.ids[0], { status: "owned" })
            : recordTransaction(db, f.ids[0], {
                type: "sale",
                happenedAt: DATE,
              }),
      ).rejects.toThrow();
      expect(await counts()).toEqual(after);
    },
  );

  it.each(["complete", "cancel"] as const)(
    "cannot complete twice or complete after concurrent %s",
    async (action) => {
      const f = await fixture();
      const id = await createSaleReservation(env.DB, f.input);
      let after: unknown;
      const db = beforeBatch(async () => {
        if (action === "complete")
          await completeSaleReservation(env.DB, id, DATE);
        else await cancelSaleReservation(env.DB, id);
        after = await counts();
      });
      await expect(completeSaleReservation(db, id, DATE)).rejects.toThrow();
      expect(await counts()).toEqual(after);
    },
  );

  it("supports a 100-card reservation without exceeding SQL binding limits", async () => {
    const f = await fixture(100);
    const id = await createSaleReservation(env.DB, {
      ...f.input,
      cards: f.ids.map((cardId) => ({
        cardId,
        catalogId: f.catalogId,
        unitPrice: 0.1,
      })),
    });
    expect(
      (await getAdminPendingSales(env.DB)).find((r) => r.id === id)?.amount,
    ).toBe(10);
    await completeSaleReservation(env.DB, id, DATE);
    expect(
      (await getOverview(env.DB)).cells.find((c) => c.catalogId === f.catalogId)
        ?.owned,
    ).toBe(0);
  });
});

const send = (path: string, body?: unknown, method = "POST") =>
  SELF.fetch(`https://example.com/api/admin/pending-sales${path}`, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

describe("sale reservation API", () => {
  it("validates malformed dates, prices, identifiers, duplicates and batch size", async () => {
    const f = await fixture();
    for (const body of [
      null,
      {},
      { ...f.input, reservedAt: "2026-02-30" },
      { ...f.input, cards: [] },
      { ...f.input, cards: [f.input.cards[0], f.input.cards[0]] },
      { ...f.input, cards: [{ ...f.input.cards[0], unitPrice: -1 }] },
      { ...f.input, cards: [{ ...f.input.cards[0], unitPrice: 1.001 }] },
      { ...f.input, cards: [{ ...f.input.cards[0], unitPrice: "50" }] },
      { ...f.input, cards: Array(101).fill(f.input.cards[0]) },
    ]) {
      expect((await send("", body)).status).toBe(400);
    }
    const response = await send("", f.input);
    expect(response.status).toBe(200);
    const { id } = (await response.json()) as { id: number };
    expect(
      (await send(`/${id}/complete`, { happenedAt: "invalid" })).status,
    ).toBe(400);
    expect(
      (await send(`/${id}/complete`, { happenedAt: "2026-09-10" })).status,
    ).toBe(409);
    expect((await send(`/${id}/complete`, { happenedAt: DATE })).status).toBe(
      200,
    );
    expect((await send(`/${id}`, undefined, "DELETE")).status).toBe(409);
  });

  it("keeps every sale reservation route behind the owner guard", async () => {
    for (const [path, method] of [
      ["", "GET"],
      ["", "POST"],
      ["/1/complete", "POST"],
      ["/1", "DELETE"],
    ]) {
      const response = await app.request(
        `https://example.com/api/admin/pending-sales${path}`,
        { method },
        { ...env, ALLOW_INSECURE_ADMIN: undefined },
      );
      expect(response.status).toBe(403);
    }
  });
});
