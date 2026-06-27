import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import {
  cancelReservation,
  createReservation,
  getAdminPendingTrades,
  getPublicPendingTrades,
} from "../../src/worker/db/queries";

const sample = {
  counterparty: "阿明",
  reservedAt: "2026-06-27",
  note: "面交",
  give: [
    { series: "MP 4TH", character: "Mizuki", rarity: "R", qty: 1 } as const,
    { series: "MP 4TH", character: "Rei", rarity: "SR", qty: 1 } as const,
  ],
  receive: [
    { series: "KILLER", character: "Mizuki", rarity: "R", qty: 1 } as const,
    { series: "KILLER", character: "Rei", rarity: "SR", qty: 1 } as const,
  ],
};

describe("pending reservation read/create/cancel", () => {
  it("creates a reservation and reads it back grouped by direction", async () => {
    const id = await createReservation(env.DB, sample);
    const admin = await getAdminPendingTrades(env.DB);
    const row = admin.find((r) => r.id === id);
    expect(row?.counterparty).toBe("阿明");
    expect(row?.note).toBe("面交");
    expect(row?.give.map((l) => l.character)).toEqual(["Mizuki", "Rei"]);
    expect(row?.receive.map((l) => l.character)).toEqual(["Mizuki", "Rei"]);
    expect(row?.give.every((l) => typeof l.catalogId === "number")).toBe(true);
  });

  it("public read omits counterparty and note", async () => {
    const id = await createReservation(env.DB, sample);
    const pub = await getPublicPendingTrades(env.DB);
    const row = pub.find((r) => r.id === id) as
      | Record<string, unknown>
      | undefined;
    expect(row).toBeTruthy();
    expect("counterparty" in (row ?? {})).toBe(false);
    expect("note" in (row ?? {})).toBe(false);
    expect((row?.give as unknown[]).length).toBe(2);
  });

  it("cancel deletes the reservation and its lines", async () => {
    const id = await createReservation(env.DB, sample);
    await cancelReservation(env.DB, id);
    expect((await getAdminPendingTrades(env.DB)).some((r) => r.id === id)).toBe(
      false,
    );
    const lines = await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM trade_reservation_lines WHERE reservation_id = ?",
    )
      .bind(id)
      .first<{ n: number }>();
    expect(lines?.n).toBe(0);
  });
});
