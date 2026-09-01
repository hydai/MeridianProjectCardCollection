import { describe, expect, it } from "vitest";
import {
  type Matrix,
  RARITIES,
  type TradeItem,
  buildMatrix,
  computeTrade,
  computeTradeWithPending,
  exists,
  existsR,
  formatTradeList,
  getAvailableN,
  getHeldN,
  getN,
  getReservedN,
  grandTotalByRarity,
  pendingReceiveByCoord,
  receivableCards,
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
  reserved: 0,
  held: 0,
  available: owned,
  volume: series === "MP 4TH" ? 2 : 1,
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
  it("derives characters in first-appearance order and series in volume order", () => {
    const m = buildMatrix(overview);
    expect(m.series).toEqual(["NEW YEAR", "MP 4TH"]);
    expect(m.characters).toEqual(["Mizuki", "KSP"]);
  });

  it("groups series by volume while preserving order within each volume", () => {
    const m = buildMatrix({
      cells: [
        { ...cell("Tesseract Symphony", "Mizuki", "R", 1, 301), volume: 3 },
        { ...cell("YUKATA", "Mizuki", "R", 2, 302), volume: 4 },
        { ...cell("INTERMISSION", "Mizuki", "R", 3, 303), volume: 3 },
        { ...cell("RUBIC's CUBE", "Mizuki", "R", 4, 304), volume: 3 },
      ],
      progress: [],
    });

    expect(m.series).toEqual([
      "Tesseract Symphony",
      "INTERMISSION",
      "RUBIC's CUBE",
      "YUKATA",
    ]);
    expect(m.volumes).toEqual([3, 3, 3, 4]);
    expect(m.series.map((_series, si) => getN(m, si, 0, 0))).toEqual([
      1, 3, 4, 2,
    ]);
  });

  it("marks KSP null in NEW YEAR but present in MP 4TH", () => {
    const m = buildMatrix(overview);
    expect(exists(m, 0, 1)).toBe(false);
    expect(exists(m, 1, 1)).toBe(true);
  });

  it("distinguishes an unissued rarity from a missing issued card", () => {
    const limited: OverviewResponse = {
      cells: [
        cell("LIMITED", "Rei", "SR", 0, 101),
        cell("LIMITED", "Rei", "UR", 1, 102),
      ],
      progress: [],
    };
    const m = buildMatrix(limited);
    expect(existsR(m, 0, 0, 0)).toBe(false);
    expect(existsR(m, 0, 0, 1)).toBe(true);
    expect(computeTrade(m).needs).toEqual([{ si: 0, ci: 0, ri: 1, spare: 0 }]);
  });

  it("places owned counts per rarity", () => {
    const m = buildMatrix(overview);
    expect(getN(m, 0, 0, 0)).toBe(3);
    expect(getN(m, 0, 0, 1)).toBe(1);
    expect(getN(m, 1, 1, 0)).toBe(1);
  });

  it("places Vol.3 EX cards in the fifth slot without inventing legacy slots", () => {
    const m = buildMatrix({
      cells: [
        cell("LEGACY", "Mizuki", "R", 1, 201),
        { ...cell("THIRD", "Mizuki", "R", 1, 202), volume: 3 },
        { ...cell("THIRD", "Mizuki", "EX", 2, 203), volume: 3 },
      ],
      progress: [],
    });
    expect(existsR(m, 0, 0, 4)).toBe(false);
    expect(existsR(m, 1, 0, 4)).toBe(true);
    expect(getN(m, 1, 0, 4)).toBe(2);
  });

  it("keeps reserved holdings separate from available holdings", () => {
    const withReservation: OverviewResponse = {
      ...overview,
      cells: overview.cells.map((entry) =>
        entry.catalogId === 1 ? { ...entry, reserved: 2, available: 1 } : entry,
      ),
    };
    const m = buildMatrix(withReservation);
    expect(getN(m, 0, 0, 0)).toBe(3);
    expect(getReservedN(m, 0, 0, 0)).toBe(2);
    expect(getAvailableN(m, 0, 0, 0)).toBe(1);
  });

  it("grand total by rarity sums all owned", () => {
    expect(grandTotalByRarity(buildMatrix(overview))).toEqual([6, 1, 0, 0, 0]);
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

  it("uses reserved counts to remove unavailable give-side surplus", () => {
    const reservedOverview: OverviewResponse = {
      ...overview,
      cells: overview.cells.map((entry) =>
        entry.catalogId === 5 ? { ...entry, reserved: 1, available: 1 } : entry,
      ),
    };
    const reservedMatrix = buildMatrix(reservedOverview);
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
    const adj = computeTradeWithPending(reservedMatrix, pending);
    expect(adj.surplus.some((entry) => entry.si === 1 && entry.ri === 0)).toBe(
      false,
    );
    expect(getN(reservedMatrix, 1, 0, 0)).toBe(2);
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

describe("held cards (保留)", () => {
  // Mirror the reserved overlay: a held copy lowers availability without
  // touching the physical owned count.
  const heldOverview = (catalogId: number, held: number): OverviewResponse => ({
    ...overview,
    cells: overview.cells.map((entry) =>
      entry.catalogId === catalogId
        ? { ...entry, held, available: Math.max(0, entry.owned - held) }
        : entry,
    ),
  });

  it("keeps held copies out of availability and shrinks the surplus", () => {
    // NEW YEAR/Mizuki R: owned 3 (spare 2) → hold 1 → available 2, spare 1.
    const m = buildMatrix(heldOverview(1, 1));
    expect(getHeldN(m, 0, 0, 0)).toBe(1);
    expect(getN(m, 0, 0, 0)).toBe(3); // still physically owned
    expect(getAvailableN(m, 0, 0, 0)).toBe(2);
    const spare = computeTrade(m).surplus.find(
      (x) => x.si === 0 && x.ci === 0 && x.ri === 0,
    )?.spare;
    expect(spare).toBe(1);
  });

  it("drops a card from the surplus entirely when its only spare is held", () => {
    // MP 4TH/Mizuki R: owned 2 (spare 1) → hold 1 → available 1 → no surplus.
    const m = buildMatrix(heldOverview(5, 1));
    expect(getAvailableN(m, 1, 0, 0)).toBe(1);
    expect(
      computeTrade(m).surplus.some(
        (x) => x.si === 1 && x.ci === 0 && x.ri === 0,
      ),
    ).toBe(false);
    expect(getN(m, 1, 0, 0)).toBe(2); // still physically owned
  });
});

describe("receivableCards", () => {
  const m = buildMatrix(overview);
  // overview existing cells = 12 (2 series × 2 chars × 4 rarities = 16, minus
  // the 4 null NEW YEAR/KSP cells). The unified 換入 list spans the whole catalog.

  it("returns every existing cell with its owned count as spare", () => {
    const items = receivableCards(m);
    expect(items).toHaveLength(12);
    // NEW YEAR(si0)/Mizuki(ci0)/R(ri0) owned 3
    expect(
      items.find((x) => x.si === 0 && x.ci === 0 && x.ri === 0)?.spare,
    ).toBe(3);
    // NEW YEAR(si0)/Mizuki(ci0)/SSR(ri2) owned 0 → still listed, spare 0
    expect(
      items.find((x) => x.si === 0 && x.ci === 0 && x.ri === 2)?.spare,
    ).toBe(0);
  });

  it("excludes null cells (NEW YEAR/KSP never exists)", () => {
    expect(receivableCards(m).some((x) => x.si === 0 && x.ci === 1)).toBe(
      false,
    );
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

describe("formatTradeList", () => {
  // formatTradeList only reads m.series / m.characters, not cards
  const m: Matrix = {
    series: ["MP 4TH", "MP 5TH"],
    volumes: [2, 3],
    characters: ["Kirali", "Mococo", "Fuwawa"],
    cards: [],
    reserved: [],
    held: [],
    slots: [],
  };

  it("groups surplus by rarity (UR→R) as `角色, 系列, 數量`", () => {
    const items: TradeItem[] = [
      { ri: 2, si: 0, ci: 1, spare: 3 }, // SSR Mococo MP 4TH
      { ri: 3, si: 1, ci: 2, spare: 1 }, // UR  Fuwawa MP 5TH
      { ri: 3, si: 0, ci: 0, spare: 2 }, // UR  Kirali MP 4TH
    ];
    expect(formatTradeList(items, m, "surplus")).toBe(
      "UR\nKirali, MP 4TH, 2\nFuwawa, MP 5TH, 1\n\nSSR\nMococo, MP 4TH, 3",
    );
  });

  it("uses quantity 1 for every needs line regardless of spare", () => {
    const items: TradeItem[] = [
      { ri: 3, si: 0, ci: 0, spare: 0 }, // UR Kirali MP 4TH
      { ri: 0, si: 1, ci: 1, spare: 0 }, // R  Mococo MP 5TH
    ];
    expect(formatTradeList(items, m, "needs")).toBe(
      "UR\nKirali, MP 4TH, 1\n\nR\nMococo, MP 5TH, 1",
    );
  });

  it("orders within a rarity by series then character", () => {
    const items: TradeItem[] = [
      { ri: 3, si: 1, ci: 0, spare: 1 }, // UR Kirali MP 5TH
      { ri: 3, si: 0, ci: 2, spare: 1 }, // UR Fuwawa MP 4TH
      { ri: 3, si: 0, ci: 0, spare: 1 }, // UR Kirali MP 4TH
    ];
    expect(formatTradeList(items, m, "surplus")).toBe(
      "UR\nKirali, MP 4TH, 1\nFuwawa, MP 4TH, 1\nKirali, MP 5TH, 1",
    );
  });

  it("returns an empty string for no items", () => {
    expect(formatTradeList([], m, "surplus")).toBe("");
  });

  it("can format Chinese series and character names", () => {
    const zhMatrix: Matrix = {
      series: ["MP 4TH", "BUNNY GIRL", "MP 5TH"],
      volumes: [2, 1, 3],
      characters: ["Kirali", "Mizuki", "Unknown"],
      cards: [],
      reserved: [],
      held: [],
      slots: [],
    };
    const items: TradeItem[] = [
      { ri: 2, si: 1, ci: 1, spare: 1 }, // SSR Mizuki BUNNY GIRL
      { ri: 2, si: 2, ci: 2, spare: 4 }, // SSR Unknown MP 5TH
      { ri: 3, si: 0, ci: 0, spare: 2 }, // UR Kirali MP 4TH
    ];
    expect(formatTradeList(items, zhMatrix, "surplus", "zh")).toBe(
      "UR\n煌Kirali, 四週年, 2\n\nSSR\n浠Mizuki, 兔女郎, 1\nUnknown, MP 5TH, 4",
    );
  });
});
