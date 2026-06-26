import { describe, expect, it } from "vitest";
import {
  buildMatrix,
  computeTrade,
  exists,
  getN,
  grandTotalByRarity,
} from "../../src/client/collection";
import type { OverviewResponse, Rarity } from "../../src/shared/types";

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
