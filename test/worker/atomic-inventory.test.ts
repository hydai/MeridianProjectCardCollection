import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import type {
  CreateReservationInput,
  RecordTxnInput,
} from "../../src/shared/types";
import {
  addCards,
  addPack,
  cancelReservation,
  closeTradePost,
  completeReservation,
  createPurchaseReservation,
  createReservation,
  createSeries,
  createTradePost,
  createTradePostReservation,
  getActivities,
  publishTradePost,
  reclassifyCard,
  recordTransaction,
  setCardHeld,
  setCatalogWant,
  undoActivity,
  updateCard,
} from "../../src/worker/db/queries";

const DATE = "2026-09-05";
let fixtureNumber = 0;

async function fixture(qty = 1) {
  const series = `ATOMIC INVENTORY ${++fixtureNumber}`;
  await createSeries(env.DB, {
    name: series,
    volume: 3,
    characters: ["Give", "Other", "Receive"],
    rarities: ["R"],
  });
  const give = { series, character: "Give", rarity: "R" as const };
  const other = { ...give, character: "Other" };
  const receive = { ...give, character: "Receive" };
  const ids = await addCards(
    env.DB,
    Array.from({ length: qty }, () => give),
  );
  const catalog = (
    await env.DB.prepare(
      "SELECT id, character FROM card_catalog WHERE series = ? ORDER BY id",
    )
      .bind(series)
      .all<{ id: number; character: string }>()
  ).results;
  const event = await env.DB.prepare(
    "SELECT acquired_event_id AS id FROM cards WHERE id = ?",
  )
    .bind(ids[0])
    .first<{ id: number }>();
  if (!event) throw new Error("expected acquisition");
  const reservation: CreateReservationInput = {
    reservedAt: DATE,
    give: [{ ...give, qty }],
    receive: [{ ...receive, qty: 1 }],
  };
  return {
    ids,
    give,
    other,
    receive,
    reservation,
    eventId: event.id,
    giveCatalogId: catalog[0].id,
    otherCatalogId: catalog[1].id,
    receiveCatalogId: catalog[2].id,
  };
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

const counts = () =>
  env.DB.prepare(
    `SELECT
       (SELECT COUNT(*) FROM cards) AS cards,
       (SELECT COUNT(*) FROM transactions) AS transactions,
       (SELECT COUNT(*) FROM activity_events) AS events,
       (SELECT COUNT(*) FROM activity_event_lines) AS eventLines,
       (SELECT COUNT(*) FROM trade_reservations) AS reservations,
       (SELECT COUNT(*) FROM trade_reservation_lines) AS reservationLines,
       (SELECT COUNT(*) FROM openings) AS openings`,
  ).first<Record<string, number>>();

const cardState = (id: number) =>
  env.DB.prepare(
    `SELECT catalog_id AS catalogId, status, held, note,
            mutation_version AS version
     FROM cards WHERE id = ?`,
  )
    .bind(id)
    .first();

async function rejectsWithoutWrites(
  stale: (db: D1Database) => Promise<unknown>,
  competing: () => Promise<unknown>,
) {
  let afterWinner: Awaited<ReturnType<typeof counts>> | undefined;
  const db = beforeBatch(async () => {
    await competing();
    afterWinner = await counts();
  });
  await expect(stale(db)).rejects.toThrow(/changed|later changes/);
  expect(afterWinner).toBeDefined();
  expect(await counts()).toEqual(afterWinner);
}

async function legacyReservation(input: CreateReservationInput) {
  const id = await createReservation(env.DB, input);
  await env.DB.prepare(
    `UPDATE trade_reservation_lines SET card_id = NULL
     WHERE reservation_id = ? AND direction = 'give'`,
  )
    .bind(id)
    .run();
  return id;
}

describe("atomic physical-card commands", () => {
  it.each(["sale", "trade", "gift"] as const)(
    "allows only one %s after both commands have read the same card",
    async (type) => {
      const f = await fixture();
      const input: RecordTxnInput = {
        type,
        happenedAt: DATE,
        ...(type === "trade"
          ? {
              receivedSeries: f.receive.series,
              receivedCharacter: f.receive.character,
              receivedRarity: f.receive.rarity,
            }
          : {}),
      };
      await rejectsWithoutWrites(
        (db) => recordTransaction(db, f.ids[0], input),
        () => recordTransaction(env.DB, f.ids[0], input),
      );
      expect(await cardState(f.ids[0])).toMatchObject({
        status: { sale: "sold", trade: "traded", gift: "gifted" }[type],
        held: 0,
        version: 1,
      });
      const transactions = (
        await env.DB.prepare(
          "SELECT received_card_id AS receivedCardId FROM transactions WHERE card_id = ?",
        )
          .bind(f.ids[0])
          .all<{ receivedCardId: number | null }>()
      ).results;
      expect(transactions).toHaveLength(1);
      expect(transactions[0].receivedCardId !== null).toBe(type === "trade");
      const incoming = await env.DB.prepare(
        "SELECT COUNT(*) AS count FROM cards WHERE catalog_id = ?",
      )
        .bind(f.receiveCatalogId)
        .first<{ count: number }>();
      expect(incoming?.count).toBe(type === "trade" ? 1 : 0);
    },
  );

  it("does not sell a card held after the sale's preflight", async () => {
    const f = await fixture();
    await rejectsWithoutWrites(
      (db) =>
        recordTransaction(db, f.ids[0], { type: "sale", happenedAt: DATE }),
      () => setCardHeld(env.DB, f.ids[0], true),
    );
    expect(await cardState(f.ids[0])).toMatchObject({
      status: "owned",
      held: 1,
    });
  });

  it("does not hold a card sold after the hold's preflight", async () => {
    const f = await fixture();
    await rejectsWithoutWrites(
      (db) => setCardHeld(db, f.ids[0], true),
      () =>
        recordTransaction(env.DB, f.ids[0], {
          type: "sale",
          happenedAt: DATE,
        }),
    );
    expect(await cardState(f.ids[0])).toMatchObject({
      status: "sold",
      held: 0,
    });
  });

  it.each(["edit", "reclassify"] as const)(
    "does not %s a card held after preflight",
    async (operation) => {
      const f = await fixture();
      await rejectsWithoutWrites(
        (db) =>
          operation === "edit"
            ? updateCard(db, f.ids[0], { status: "for_sale", askingPrice: 10 })
            : reclassifyCard(db, f.ids[0], {
                targetCatalogId: f.otherCatalogId,
                happenedAt: DATE,
              }),
        () => setCardHeld(env.DB, f.ids[0], true),
      );
      expect(await cardState(f.ids[0])).toMatchObject({
        catalogId: f.giveCatalogId,
        status: "owned",
        held: 1,
      });
    },
  );

  it("does not resurrect a card sold after a listing edit's preflight", async () => {
    const f = await fixture();
    await rejectsWithoutWrites(
      (db) => updateCard(db, f.ids[0], { status: "for_trade" }),
      () =>
        recordTransaction(env.DB, f.ids[0], {
          type: "sale",
          happenedAt: DATE,
        }),
    );
    expect(await cardState(f.ids[0])).toMatchObject({ status: "sold" });
  });

  it("does not overwrite an intervening reclassification or its history", async () => {
    const f = await fixture();
    await rejectsWithoutWrites(
      (db) =>
        reclassifyCard(db, f.ids[0], {
          targetCatalogId: f.otherCatalogId,
          happenedAt: DATE,
        }),
      () =>
        reclassifyCard(env.DB, f.ids[0], {
          targetCatalogId: f.receiveCatalogId,
          happenedAt: DATE,
        }),
    );
    expect(await cardState(f.ids[0])).toMatchObject({
      catalogId: f.receiveCatalogId,
    });
    const events = (await getActivities(env.DB)).filter(
      (event) =>
        event.kind === "card_reclassified" && event.sourceId === f.ids[0],
    );
    expect(events).toHaveLength(1);
    expect(events[0].lines).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          catalogId: f.giveCatalogId,
          action: "reclassified_from",
        }),
        expect.objectContaining({
          catalogId: f.receiveCatalogId,
          action: "reclassified_to",
        }),
      ]),
    );
  });

  it("detects a hold-and-release even when visible state returns to its old value", async () => {
    const f = await fixture();
    await rejectsWithoutWrites(
      (db) => updateCard(db, f.ids[0], { note: "stale edit" }),
      async () => {
        await setCardHeld(env.DB, f.ids[0], true);
        await setCardHeld(env.DB, f.ids[0], false);
      },
    );
    expect(await cardState(f.ids[0])).toMatchObject({
      status: "owned",
      held: 0,
      note: null,
      version: 2,
    });
  });
});

describe("atomic reservation allocation", () => {
  it.each(["hold", "sale", "reclassify"] as const)(
    "rejects the whole multi-card reservation when a concurrent %s wins",
    async (operation) => {
      const f = await fixture(2);
      await rejectsWithoutWrites(
        (db) => createReservation(db, f.reservation),
        () =>
          operation === "hold"
            ? setCardHeld(env.DB, f.ids[0], true)
            : operation === "sale"
              ? recordTransaction(env.DB, f.ids[0], {
                  type: "sale",
                  happenedAt: DATE,
                })
              : reclassifyCard(env.DB, f.ids[0], {
                  targetCatalogId: f.otherCatalogId,
                  happenedAt: DATE,
                }),
      );
      expect(
        await env.DB.prepare(
          "SELECT id FROM trade_reservation_lines WHERE card_id IN (?, ?)",
        )
          .bind(...f.ids)
          .all(),
      ).toMatchObject({ results: [] });
      expect(await cardState(f.ids[1])).toMatchObject({
        status: "owned",
        held: 0,
        version: 0,
      });
    },
  );

  it.each(["hold", "sale", "edit", "reclassify"] as const)(
    "rejects a stale %s after the card is reserved",
    async (operation) => {
      const f = await fixture();
      await rejectsWithoutWrites(
        (db) =>
          operation === "hold"
            ? setCardHeld(db, f.ids[0], true)
            : operation === "sale"
              ? recordTransaction(db, f.ids[0], {
                  type: "sale",
                  happenedAt: DATE,
                })
              : operation === "edit"
                ? updateCard(db, f.ids[0], { status: "for_sale" })
                : reclassifyCard(db, f.ids[0], {
                    targetCatalogId: f.otherCatalogId,
                    happenedAt: DATE,
                  }),
        () => createReservation(env.DB, f.reservation),
      );
      expect(await cardState(f.ids[0])).toMatchObject({
        catalogId: f.giveCatalogId,
        status: "owned",
        held: 0,
        version: 0,
      });
    },
  );

  it("gives unrelated reservations distinct generated IDs after interleaved reads", async () => {
    const f = await fixture();
    const [otherId] = await addCards(env.DB, [f.other]);
    let innerId = 0;
    const outerId = await createReservation(
      beforeBatch(async () => {
        innerId = await createReservation(env.DB, {
          reservedAt: DATE,
          counterparty: "inner",
          give: [{ ...f.other, qty: 1 }],
          receive: [],
        });
      }),
      { ...f.reservation, counterparty: "outer" },
    );
    expect(outerId).toBeGreaterThan(innerId);
    const links = (
      await env.DB.prepare(
        `SELECT r.id, r.counterparty, l.card_id AS cardId,
                e.source_id AS sourceId
         FROM trade_reservations r
         JOIN trade_reservation_lines l ON l.reservation_id = r.id
         JOIN activity_events e ON e.source_id = r.id
           AND e.source_type = 'trade_reservation' AND e.kind = 'trade_reserved'
         WHERE r.id IN (?, ?) AND l.direction = 'give'
         ORDER BY r.id`,
      )
        .bind(innerId, outerId)
        .all()
    ).results;
    expect(links).toEqual([
      {
        id: innerId,
        sourceId: innerId,
        counterparty: "inner",
        cardId: otherId,
      },
      {
        id: outerId,
        sourceId: outerId,
        counterparty: "outer",
        cardId: f.ids[0],
      },
    ]);
  });

  it("rejects an overlapping reservation without a header or event", async () => {
    const f = await fixture();
    await rejectsWithoutWrites(
      (db) => createReservation(db, f.reservation),
      () => createReservation(env.DB, f.reservation),
    );
  });

  it("rechecks legacy NULL-card reservations before a direct sale", async () => {
    const f = await fixture();
    await rejectsWithoutWrites(
      (db) =>
        recordTransaction(db, f.ids[0], { type: "sale", happenedAt: DATE }),
      () => legacyReservation(f.reservation),
    );
    expect(await cardState(f.ids[0])).toMatchObject({ status: "owned" });
  });

  it("does not allocate a card newly claimed by a legacy reservation", async () => {
    const f = await fixture(2);
    const one = { ...f.reservation, give: [{ ...f.give, qty: 1 }] };
    await rejectsWithoutWrites(
      (db) => createReservation(db, one),
      () => legacyReservation(one),
    );
    const id = await createReservation(env.DB, one);
    expect(
      await env.DB.prepare(
        "SELECT card_id AS cardId FROM trade_reservation_lines WHERE reservation_id = ? AND direction = 'give'",
      )
        .bind(id)
        .first(),
    ).toEqual({ cardId: f.ids[1] });
  });

  it.each(["close", "incoming purchase"] as const)(
    "rechecks announcement availability after a concurrent %s",
    async (operation) => {
      const f = await fixture();
      await updateCard(env.DB, f.ids[0], { status: "for_trade" });
      await setCatalogWant(env.DB, f.receiveCatalogId, { wantCount: 1 });
      const post = await createTradePost(env.DB, {
        give: [{ catalogId: f.giveCatalogId, qty: 1 }],
        want: [{ catalogId: f.receiveCatalogId, qty: 1 }],
      });
      await publishTradePost(env.DB, post.id);
      await rejectsWithoutWrites(
        (db) =>
          createTradePostReservation(db, post.id, {
            reservedAt: DATE,
            give: [{ catalogId: f.giveCatalogId, qty: 1 }],
            receive: [{ catalogId: f.receiveCatalogId, qty: 1 }],
          }),
        () =>
          operation === "close"
            ? closeTradePost(env.DB, post.id)
            : createPurchaseReservation(env.DB, {
                orderedAt: DATE,
                lines: [{ ...f.receive, qty: 1, unitPrice: 5 }],
              }),
      );
      expect(await cardState(f.ids[0])).toMatchObject({
        status: "for_trade",
        held: 0,
      });
    },
  );
});

describe("atomic reservation completion", () => {
  it.each(["complete", "cancel"] as const)(
    "does not reuse a terminal event after a concurrent %s",
    async (operation) => {
      const f = await fixture();
      const id = await createReservation(env.DB, f.reservation);
      await rejectsWithoutWrites(
        (db) => completeReservation(db, id, DATE),
        () =>
          operation === "complete"
            ? completeReservation(env.DB, id, DATE)
            : cancelReservation(env.DB, id),
      );
      expect(await cardState(f.ids[0])).toMatchObject({
        status: operation === "complete" ? "traded" : "owned",
      });
    },
  );

  it("claims legacy allocations atomically across different reservation lifecycles", async () => {
    const f = await fixture(2);
    const one = { ...f.reservation, give: [{ ...f.give, qty: 1 }] };
    const first = await legacyReservation(one);
    const second = await legacyReservation(one);
    await rejectsWithoutWrites(
      (db) => completeReservation(db, first, DATE),
      () => completeReservation(env.DB, second, DATE),
    );
    expect(await cardState(f.ids[0])).toMatchObject({ status: "traded" });
    expect(await cardState(f.ids[1])).toMatchObject({ status: "owned" });
    expect(
      await env.DB.prepare("SELECT id FROM trade_reservations WHERE id = ?")
        .bind(first)
        .first(),
    ).toEqual({ id: first });
    await completeReservation(env.DB, first, DATE);
    expect(await cardState(f.ids[1])).toMatchObject({ status: "traded" });
    expect(
      await env.DB.prepare(
        "SELECT COUNT(*) AS count FROM cards WHERE catalog_id = ?",
      )
        .bind(f.receiveCatalogId)
        .first(),
    ).toEqual({ count: 2 });
  });
});

describe("atomic acquisition undo", () => {
  it.each(["hold", "edit"] as const)(
    "preserves every acquired card after a concurrent %s",
    async (operation) => {
      const f = await fixture(2);
      await rejectsWithoutWrites(
        (db) => undoActivity(db, f.eventId),
        () =>
          operation === "hold"
            ? setCardHeld(env.DB, f.ids[0], true)
            : updateCard(env.DB, f.ids[0], { note: "keep this card" }),
      );
      for (const id of f.ids) expect(await cardState(id)).not.toBeNull();
      expect(
        (await getActivities(env.DB)).find((event) => event.id === f.eventId),
      ).toMatchObject({ reversedAt: null, canUndo: false });
    },
  );

  it.each(["hold", "edit", "trade"] as const)(
    "rejects a stale %s when acquisition undo deletes its card",
    async (operation) => {
      const f = await fixture();
      await rejectsWithoutWrites(
        (db) =>
          operation === "hold"
            ? setCardHeld(db, f.ids[0], true)
            : operation === "edit"
              ? updateCard(db, f.ids[0], { note: "stale edit" })
              : recordTransaction(db, f.ids[0], {
                  type: "trade",
                  happenedAt: DATE,
                  receivedSeries: f.receive.series,
                  receivedCharacter: f.receive.character,
                  receivedRarity: f.receive.rarity,
                }),
        () => undoActivity(env.DB, f.eventId),
      );
      expect(await cardState(f.ids[0])).toBeNull();
    },
  );

  it("does not duplicate reversal lines when two undo preflights succeed", async () => {
    const f = await fixture();
    await rejectsWithoutWrites(
      (db) => undoActivity(db, f.eventId),
      () => undoActivity(env.DB, f.eventId),
    );
    const events = (await getActivities(env.DB)).filter(
      (event) => event.revertsEventId === f.eventId,
    );
    expect(events).toHaveLength(1);
    expect(events[0].lines).toHaveLength(1);
    expect(await cardState(f.ids[0])).toBeNull();
  });

  it("preserves the opening and its entire pack when one card changes", async () => {
    const f = await fixture();
    const pack = await addPack(env.DB, [f.give, f.other], {
      volume: 3,
      openedAt: DATE,
    });
    const acquisition = await env.DB.prepare(
      "SELECT acquired_event_id AS id FROM cards WHERE id = ?",
    )
      .bind(pack.ids[0])
      .first<{ id: number }>();
    if (!acquisition) throw new Error("expected pack acquisition");
    await rejectsWithoutWrites(
      (db) => undoActivity(db, acquisition.id),
      () => setCardHeld(env.DB, pack.ids[0], true),
    );
    expect(
      await env.DB.prepare("SELECT id FROM openings WHERE id = ?")
        .bind(pack.opening.id)
        .first(),
    ).toEqual({ id: pack.opening.id });
    for (const id of pack.ids) expect(await cardState(id)).not.toBeNull();
  });

  it("cannot undo same-timestamp edits made without an activity event", async () => {
    const f = await fixture();
    await env.DB.prepare("UPDATE cards SET note = 'changed' WHERE id = ?")
      .bind(f.ids[0])
      .run();
    expect(await cardState(f.ids[0])).toMatchObject({ version: 1 });
    expect(
      (await getActivities(env.DB)).find((event) => event.id === f.eventId),
    ).toMatchObject({ canUndo: false });
    await expect(undoActivity(env.DB, f.eventId)).rejects.toThrow(
      /later changes/,
    );
  });
});
