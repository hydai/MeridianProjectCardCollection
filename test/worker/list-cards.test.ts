import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { addCards, listCards, updateCard } from "../../src/worker/db/queries";

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
});
