import { describe, expect, it } from "vitest";
import { ownedCards } from "../../seed/cards";
import { buildCatalog } from "../../seed/catalog-def";

describe("seed data", () => {
  it("catalog has 180 unique types", () => {
    const c = buildCatalog();
    expect(c).toHaveLength(180);
    expect(
      new Set(c.map((x) => `${x.series}|${x.character}|${x.rarity}`)).size,
    ).toBe(180);
  });

  it("every owned card maps to a catalog type", () => {
    const valid = new Set(
      buildCatalog().map((x) => `${x.series}|${x.character}|${x.rarity}`),
    );
    for (const card of ownedCards) {
      expect(valid.has(`${card.series}|${card.character}|${card.rarity}`)).toBe(
        true,
      );
    }
  });

  it("matches the Sheet per-series and per-rarity totals", () => {
    const count = (pred: (c: (typeof ownedCards)[number]) => boolean) =>
      ownedCards.filter(pred).length;
    expect(ownedCards).toHaveLength(258);
    expect(count((c) => c.source === "purchase")).toBe(18);

    // [R, SR, SSR, UR] per series, from the Sheet's 稀有度統計 tab.
    const expected: Record<string, [number, number, number, number]> = {
      "NEW YEAR": [23, 15, 11, 1],
      "BUNNY GIRL": [15, 19, 9, 4],
      KILLER: [17, 12, 7, 5],
      "MP 4TH": [52, 43, 20, 5],
    };
    const rarities = ["R", "SR", "SSR", "UR"] as const;
    for (const [series, counts] of Object.entries(expected)) {
      rarities.forEach((r, i) => {
        expect(count((c) => c.series === series && c.rarity === r)).toBe(
          counts[i],
        );
      });
    }
  });
});
