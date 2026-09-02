import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import {
  addCards,
  addPack,
  cancelReservation,
  completeReservation,
  createReservation,
  getActivities,
  recordTransaction,
  undoActivity,
  updateCard,
} from "../../src/worker/db/queries";

async function acquisitionEventId(cardId: number): Promise<number> {
  const row = await env.DB.prepare(
    "SELECT acquired_event_id AS eventId FROM cards WHERE id = ?",
  )
    .bind(cardId)
    .first<{ eventId: number }>();
  if (!row) throw new Error(`card ${cardId} has no acquisition event`);
  return row.eventId;
}

describe("unified activity stream", () => {
  it("records a direct acquisition and appends an undo without deleting history", async () => {
    const [cardId] = await addCards(env.DB, [
      { series: "BUNNY GIRL", character: "Sachi", rarity: "SSR" },
    ]);
    const eventId = await acquisitionEventId(cardId);

    const before = (await getActivities(env.DB)).find(
      (event) => event.id === eventId,
    );
    expect(before).toMatchObject({
      kind: "acquisition",
      canUndo: true,
      reversedAt: null,
    });
    expect(before?.lines).toContainEqual(
      expect.objectContaining({
        series: "BUNNY GIRL",
        character: "Sachi",
        rarity: "SSR",
        action: "acquired",
        qty: 1,
        delta: 1,
      }),
    );

    await undoActivity(env.DB, eventId);

    expect(
      await env.DB.prepare("SELECT id FROM cards WHERE id = ?")
        .bind(cardId)
        .first(),
    ).toBeNull();
    const after = await getActivities(env.DB);
    expect(
      after.find((event) => event.id === eventId)?.reversedAt,
    ).not.toBeNull();
    expect(after).toContainEqual(
      expect.objectContaining({
        kind: "undo",
        revertsEventId: eventId,
        lines: [expect.objectContaining({ action: "undone", delta: -1 })],
      }),
    );
  });

  it("refuses to undo an acquisition after the physical card was edited", async () => {
    const [cardId] = await addCards(env.DB, [
      { series: "BUNNY GIRL", character: "Hitomi", rarity: "SR" },
    ]);
    const eventId = await acquisitionEventId(cardId);

    // This can happen in the same SQLite timestamp second as the INSERT, so
    // eligibility must be based on the later event, not timestamps alone.
    await updateCard(env.DB, cardId, { note: "放進卡冊" });

    expect(
      (await getActivities(env.DB)).find((event) => event.id === eventId)
        ?.canUndo,
    ).toBe(false);
    await expect(undoActivity(env.DB, eventId)).rejects.toThrow(
      /later changes/,
    );
  });

  it("undoes an untouched opening as one unit", async () => {
    const created = await addPack(
      env.DB,
      [
        { series: "MP 4TH", character: "KSP", rarity: "SR" },
        { series: "MP 4TH", character: "KSP", rarity: "R" },
      ],
      { volume: 2, openedAt: "2026-09-02", cost: 200 },
    );
    const eventId = await acquisitionEventId(created.ids[0]);

    expect(
      (await getActivities(env.DB)).find((event) => event.id === eventId),
    ).toMatchObject({ kind: "opening", amount: 200, canUndo: true });

    await undoActivity(env.DB, eventId);

    const remainingCards = await env.DB.prepare(
      "SELECT COUNT(*) AS count FROM cards WHERE opening_id = ?",
    )
      .bind(created.opening.id)
      .first<{ count: number }>();
    expect(remainingCards?.count).toBe(0);
    expect(
      await env.DB.prepare("SELECT id FROM openings WHERE id = ?")
        .bind(created.opening.id)
        .first(),
    ).toBeNull();
  });

  it("records both sides of an exchange and makes the source acquisition immutable", async () => {
    const [outgoingId] = await addCards(env.DB, [
      { series: "NEW YEAR", character: "Sachi", rarity: "R" },
    ]);
    const acquisitionId = await acquisitionEventId(outgoingId);

    await recordTransaction(env.DB, outgoingId, {
      type: "trade",
      counterparty: "交換對象",
      happenedAt: "2026-09-02",
      receivedSeries: "BUNNY GIRL",
      receivedCharacter: "Sachi",
      receivedRarity: "SR",
    });

    const events = await getActivities(env.DB);
    const trade = events.find(
      (event) => event.kind === "trade" && event.sourceId === outgoingId,
    );
    expect(trade?.counterparty).toBe("交換對象");
    expect(trade?.lines.map((line) => line.action)).toEqual([
      "given",
      "received",
    ]);
    expect(events.find((event) => event.id === acquisitionId)?.canUndo).toBe(
      false,
    );
  });

  it("allows only one terminal event when trade completion and cancellation race", async () => {
    await addCards(env.DB, [
      { series: "KILLER", character: "998", rarity: "R" },
      { series: "KILLER", character: "998", rarity: "R" },
    ]);
    const reservationId = await createReservation(env.DB, {
      reservedAt: "2026-09-02",
      give: [{ series: "KILLER", character: "998", rarity: "R", qty: 1 }],
      receive: [
        { series: "BUNNY GIRL", character: "Hitomi", rarity: "UR", qty: 1 },
      ],
    });
    const lifecycle = await env.DB.prepare(
      `SELECT id FROM activity_events
       WHERE source_type = 'trade_reservation'
         AND source_id = ? AND kind = 'trade_reserved'
       ORDER BY id DESC LIMIT 1`,
    )
      .bind(reservationId)
      .first<{ id: number }>();
    expect(lifecycle).not.toBeNull();

    const attempts = await Promise.allSettled([
      completeReservation(env.DB, reservationId, "2026-09-02"),
      cancelReservation(env.DB, reservationId),
    ]);
    expect(
      attempts.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);

    const terminal = await env.DB.prepare(
      "SELECT kind FROM activity_events WHERE source_key = ?",
    )
      .bind(`trade-terminal:${lifecycle?.id}`)
      .all<{ kind: string }>();
    expect(terminal.results).toHaveLength(1);
    expect(["trade_completed", "trade_reservation_cancelled"]).toContain(
      terminal.results[0].kind,
    );
  });
});
