import type { Rarity } from "./types";

export const EX_MIN_VOLUME = 3;

export const BASE_RARITY_ORDER = [
  "R",
  "SR",
  "SSR",
  "UR",
] as const satisfies readonly Rarity[];

export const RARITY_ORDER = [
  ...BASE_RARITY_ORDER,
  "EX",
] as const satisfies readonly Rarity[];

export function canonicalizeRarities(values: readonly Rarity[]): Rarity[] {
  const selected = new Set<Rarity>(values);
  return RARITY_ORDER.filter((rarity) => selected.has(rarity));
}

export function supportsEx(volume: number): boolean {
  return Number.isInteger(volume) && volume >= EX_MIN_VOLUME;
}
