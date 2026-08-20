import type { Rarity } from "./types";

export const RARITY_ORDER = [
  "R",
  "SR",
  "SSR",
  "UR",
] as const satisfies readonly Rarity[];

export function canonicalizeRarities(values: readonly Rarity[]): Rarity[] {
  const selected = new Set<Rarity>(values);
  return RARITY_ORDER.filter((rarity) => selected.has(rarity));
}
