import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import {
  addCards,
  createReservation,
  listCards,
  updateCard,
} from "../../src/worker/db/queries";

describe("listCards", () => {
  it("flags a card with multiple active copies as a duplicate", async () => {
    const [a] = await addCards(env.DB, [
      { series: "KILLER", character: "Rei", rarity: "UR" },
    ]);
    const [b] = await addCards(env.DB, [
      { series: "KILLER", character: "Rei", rarity: "UR" },
    ]);
    const rows = await listCards(env.DB, {
      status: "active",
      series: "KILLER",
    });
    const mine = rows.filter((r) => r.id === a || r.id === b);
    expect(mine).toHaveLength(2);
    expect(mine.every((r) => r.duplicate)).toBe(true);
  });

  it("excludes sold cards from status=active and surfaces listing details", async () => {
    const [id] = await addCards(env.DB, [
      { series: "BUNNY GIRL", character: "Rei", rarity: "R" },
    ]);
    await updateCard(env.DB, id, { status: "for_sale", askingPrice: 120 });
    const active = await listCards(env.DB, { status: "active" });
    const row = active.find((r) => r.id === id);
    expect(row?.status).toBe("for_sale");
    expect(row?.askingPrice).toBe(120);
  });

  it("reports reservedGive and adjusts the duplicate flag for pending gives", async () => {
    // Own 2 of a fresh type, reserve 1 to give → reservedGive 1, no longer a tradeable duplicate.
    // (Koyuki UR is unseeded, so activeCount is exactly the 2 we add here.)
    await addCards(env.DB, [
      { series: "BUNNY GIRL", character: "Koyuki", rarity: "UR" },
      { series: "BUNNY GIRL", character: "Koyuki", rarity: "UR" },
    ]);
    await createReservation(env.DB, {
      reservedAt: "2026-06-27",
      give: [
        { series: "BUNNY GIRL", character: "Koyuki", rarity: "UR", qty: 1 },
      ],
      receive: [],
    });
    const rows = await listCards(env.DB, { series: "BUNNY GIRL" });
    const koyuki = rows.filter(
      (r) => r.character === "Koyuki" && r.rarity === "UR",
    );
    expect(koyuki.length).toBeGreaterThanOrEqual(2);
    expect(koyuki[0].reservedGive).toBe(1);
    expect(koyuki.every((r) => r.duplicate === false)).toBe(true); // (2 - 1) > 1 is false
  });
});
