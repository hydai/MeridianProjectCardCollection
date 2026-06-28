import { describe, expect, it } from "vitest";
import {
  RARITIES,
  buildMatrix,
  computeTrade,
  computeTradeWithPending,
  exists,
  getN,
  grandTotalByRarity,
  ownedReceivable,
  pendingReceiveByCoord,
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

  it("does NOT change surplus for give lines (handled upstream in getOverview now)", () => {
    const base = computeTrade(m);
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
    expect(adj.surplus).toEqual(base.surplus); // unchanged — give subtraction moved to getOverview
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

describe("ownedReceivable", () => {
  const m = buildMatrix(overview);
  // overview owned≥1 cells: NEW YEAR/Mizuki R=3, NEW YEAR/Mizuki SR=1,
  // MP 4TH/Mizuki R=2, MP 4TH/KSP R=1  → 4 items. (NEW YEAR/KSP is a null cell.)

  it("returns every existing cell the owner holds at least one of", () => {
    expect(ownedReceivable(m)).toHaveLength(4);
  });

  it("carries the current holding count in spare", () => {
    const items = ownedReceivable(m);
    // NEW YEAR(si0)/Mizuki(ci0)/R(ri0) owned 3
    expect(
      items.find((x) => x.si === 0 && x.ci === 0 && x.ri === 0)?.spare,
    ).toBe(3);
    // MP 4TH(si1)/Mizuki(ci0)/R(ri0) owned 2
    expect(
      items.find((x) => x.si === 1 && x.ci === 0 && x.ri === 0)?.spare,
    ).toBe(2);
  });

  it("excludes owned-0 cells (disjoint from needs) and null cells", () => {
    const items = ownedReceivable(m);
    // every item is actually held
    expect(items.every((x) => getN(m, x.si, x.ci, x.ri) >= 1)).toBe(true);
    // NEW YEAR/KSP (si0,ci1) does not exist → never present
    expect(items.some((x) => x.si === 0 && x.ci === 1)).toBe(false);
  });
});

describe("pendingReceiveByCoord", () => {
  const m = buildMatrix(overview);

  it("sums pending receive qty per coordinate and skips unknown cards", () => {
    const pending: PublicPendingTrade[] = [
      {
        id: 1,
        reservedAt: "2026-06-29",
        give: [],
        receive: [
          {
            direction: "receive",
            catalogId: 3,
            series: "NEW YEAR",
            character: "Mizuki",
            rarity: "SSR",
            qty: 1,
          },
        ],
      },
      {
        id: 2,
        reservedAt: "2026-06-29",
        give: [],
        receive: [
          {
            direction: "receive",
            catalogId: 3,
            series: "NEW YEAR",
            character: "Mizuki",
            rarity: "SSR",
            qty: 2,
          },
          {
            direction: "receive",
            catalogId: 999,
            series: "ZZZ",
            character: "Nobody",
            rarity: "R",
            qty: 5,
          },
        ],
      },
    ];
    const map = pendingReceiveByCoord(m, pending);
    // NEW YEAR(si0)/Mizuki(ci0)/SSR(ri2): 1 + 2 = 3
    expect(map.get("0|0|2")).toBe(3);
    // unknown series ZZZ is skipped (not in the matrix)
    expect(map.size).toBe(1);
  });
});
