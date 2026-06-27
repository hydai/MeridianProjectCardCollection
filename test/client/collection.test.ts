import { describe, expect, it } from "vitest";
import {
  RARITIES,
  buildMatrix,
  computeTrade,
  computeTradeWithPending,
  exists,
  getN,
  grandTotalByRarity,
} from "../../src/client/collection";
import type {
  OverviewResponse,
  PublicPendingTrade,
  Rarity,
} from "../../src/shared/types";

const cell = (
  series: string,
  character: string,
  rarity: Rarity,
  owned: number,
  id: number,
) => ({
  catalogId: id,
  series,
  character,
  rarity,
  owned,
});

const overview: OverviewResponse = {
  cells: [
    cell("NEW YEAR", "Mizuki", "R", 3, 1),
    cell("NEW YEAR", "Mizuki", "SR", 1, 2),
    cell("NEW YEAR", "Mizuki", "SSR", 0, 3),
    cell("NEW YEAR", "Mizuki", "UR", 0, 4),
    cell("MP 4TH", "Mizuki", "R", 2, 5),
    cell("MP 4TH", "Mizuki", "SR", 0, 6),
    cell("MP 4TH", "Mizuki", "SSR", 0, 7),
    cell("MP 4TH", "Mizuki", "UR", 0, 8),
    cell("MP 4TH", "KSP", "R", 1, 9),
    cell("MP 4TH", "KSP", "SR", 0, 10),
    cell("MP 4TH", "KSP", "SSR", 0, 11),
    cell("MP 4TH", "KSP", "UR", 0, 12),
  ],
  progress: [],
};

describe("buildMatrix", () => {
  it("derives series and characters in first-appearance order", () => {
    const m = buildMatrix(overview);
    expect(m.series).toEqual(["NEW YEAR", "MP 4TH"]);
    expect(m.characters).toEqual(["Mizuki", "KSP"]);
  });

  it("marks KSP null in NEW YEAR but present in MP 4TH", () => {
    const m = buildMatrix(overview);
    expect(exists(m, 0, 1)).toBe(false);
    expect(exists(m, 1, 1)).toBe(true);
  });

  it("places owned counts per rarity", () => {
    const m = buildMatrix(overview);
    expect(getN(m, 0, 0, 0)).toBe(3);
    expect(getN(m, 0, 0, 1)).toBe(1);
    expect(getN(m, 1, 1, 0)).toBe(1);
  });

  it("grand total by rarity sums all owned", () => {
    expect(grandTotalByRarity(buildMatrix(overview))).toEqual([6, 1, 0, 0]);
  });
});

describe("computeTrade", () => {
  it("classifies duplicates as surplus and zeros as needs", () => {
    const { surplus, needs } = computeTrade(buildMatrix(overview));
    expect(surplus).toHaveLength(2);
    expect(
      surplus.find((x) => x.si === 0 && x.ci === 0 && x.ri === 0)?.spare,
    ).toBe(2);
    expect(needs).toHaveLength(8);
  });
});

describe("computeTradeWithPending", () => {
  const m = buildMatrix(overview); // NEW YEAR/Mizuki R=3(spare2), MP 4TH/Mizuki R=2(spare1)

  it("equals computeTrade when there are no pending trades", () => {
    const base = computeTrade(m);
    const adj = computeTradeWithPending(m, []);
    expect(adj.surplus).toHaveLength(base.surplus.length);
    expect(adj.needs).toHaveLength(base.needs.length);
  });

  it("a give line decrements spare and drops it when it hits zero", () => {
    const pending: PublicPendingTrade[] = [
      {
        id: 1,
        reservedAt: "2026-06-27",
        give: [
          {
            direction: "give",
            catalogId: 5,
            series: "MP 4TH",
            character: "Mizuki",
            rarity: "R",
            qty: 1,
          },
        ],
        receive: [],
      },
    ];
    const adj = computeTradeWithPending(m, pending);
    // MP 4TH/Mizuki R had spare 1 → now 0 → removed; NEW YEAR/Mizuki R (spare 2) stays.
    expect(
      adj.surplus.some((s) => s.si === 1 && s.ci === 0 && s.ri === 0),
    ).toBe(false);
    expect(
      adj.surplus.find((s) => s.si === 0 && s.ci === 0 && s.ri === 0)?.spare,
    ).toBe(2);
  });

  it("a receive line removes the matching need", () => {
    const base = computeTrade(m);
    const target = base.needs[0]; // some missing (si,ci,ri)
    const pending: PublicPendingTrade[] = [
      {
        id: 2,
        reservedAt: "2026-06-27",
        give: [],
        receive: [
          {
            direction: "receive",
            catalogId: 0,
            series: m.series[target.si],
            character: m.characters[target.ci],
            rarity: RARITIES[target.ri],
            qty: 1,
          },
        ],
      },
    ];
    const adj = computeTradeWithPending(m, pending);
    expect(
      adj.needs.some(
        (n) => n.si === target.si && n.ci === target.ci && n.ri === target.ri,
      ),
    ).toBe(false);
    expect(adj.needs).toHaveLength(base.needs.length - 1);
  });
});
