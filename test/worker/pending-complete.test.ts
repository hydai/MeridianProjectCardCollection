import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import type { OverviewCell } from "../../src/shared/types";
import {
  addCards,
  completeReservation,
  createReservation,
  getAdminPendingTrades,
  getOverview,
  getTransactions,
} from "../../src/worker/db/queries";

const ownedOf = (cells: OverviewCell[], s: string, ch: string, r: string) =>
  cells.find((c) => c.series === s && c.character === ch && c.rarity === r)
    ?.owned ?? 0;

describe("completeReservation", () => {
  it("symmetric: gives leave holdings, receives join, history records the trade, reservation purged", async () => {
    // Seed two duplicates to give away.
    await addCards(env.DB, [
      { series: "MP 4TH", character: "Mizuki", rarity: "R" },
      { series: "MP 4TH", character: "Mizuki", rarity: "R" },
      { series: "MP 4TH", character: "Rei", rarity: "SR" },
      { series: "MP 4TH", character: "Rei", rarity: "SR" },
    ]);
    const giveBefore = ownedOf(
      (await getOverview(env.DB)).cells,
      "MP 4TH",
      "Mizuki",
      "R",
    );
    const recvBefore = ownedOf(
      (await getOverview(env.DB)).cells,
      "KILLER",
      "Mizuki",
      "R",
    );

    const id = await createReservation(env.DB, {
      counterparty: "阿明",
      reservedAt: "2026-06-27",
      note: "面交",
      give: [
        { series: "MP 4TH", character: "Mizuki", rarity: "R", qty: 1 },
        { series: "MP 4TH", character: "Rei", rarity: "SR", qty: 1 },
      ],
      receive: [
        { series: "KILLER", character: "Mizuki", rarity: "R", qty: 1 },
        { series: "KILLER", character: "Rei", rarity: "SR", qty: 1 },
      ],
    });

    await completeReservation(env.DB, id, "2026-06-28");

    const cells = (await getOverview(env.DB)).cells;
    expect(ownedOf(cells, "MP 4TH", "Mizuki", "R")).toBe(giveBefore - 1);
    expect(ownedOf(cells, "KILLER", "Mizuki", "R")).toBe(recvBefore + 1);

    const txns = await getTransactions(env.DB);
    const trades = txns.filter(
      (t) => t.type === "trade" && t.counterparty === "阿明",
    );
    expect(trades.length).toBe(2);

    expect((await getAdminPendingTrades(env.DB)).some((r) => r.id === id)).toBe(
      false,
    );
  });

  it("many-for-one: extra give becomes a one-way trade-out (no received card)", async () => {
    await addCards(env.DB, [
      { series: "NEW YEAR", character: "Koyuki", rarity: "R" },
      { series: "NEW YEAR", character: "Koyuki", rarity: "R" },
    ]);
    const id = await createReservation(env.DB, {
      reservedAt: "2026-06-27",
      give: [{ series: "NEW YEAR", character: "Koyuki", rarity: "R", qty: 2 }],
      receive: [
        { series: "BUNNY GIRL", character: "Hitomi", rarity: "UR", qty: 1 },
      ],
    });
    await completeReservation(env.DB, id, "2026-06-28");
    const recv = ownedOf(
      (await getOverview(env.DB)).cells,
      "BUNNY GIRL",
      "Hitomi",
      "UR",
    );
    expect(recv).toBeGreaterThanOrEqual(1);
    // 2 give units → 2 traded cards → 2 trade transactions (one with no received card).
    const koyuki = await env.DB.prepare(
      `SELECT COUNT(*) AS n FROM cards k JOIN card_catalog c ON c.id = k.catalog_id
       WHERE c.series='NEW YEAR' AND c.character='Koyuki' AND c.rarity='R' AND k.status='traded'`,
    ).first<{ n: number }>();
    expect(koyuki?.n).toBe(2);
  });

  it("rejects completion with no give lines", async () => {
    const id = await createReservation(env.DB, {
      reservedAt: "2026-06-27",
      give: [],
      receive: [{ series: "KILLER", character: "998", rarity: "R", qty: 1 }],
    });
    await expect(
      completeReservation(env.DB, id, "2026-06-28"),
    ).rejects.toThrow();
  });
});
