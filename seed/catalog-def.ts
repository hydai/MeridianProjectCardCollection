import type { Rarity } from "../src/shared/types";

// The collectible-card universe. Source of truth for collection progress and
// "missing cards". See SPEC §3 and §9.
export const SERIES = ["NEW YEAR", "BUNNY GIRL", "KILLER", "MP 4TH"];

export const COMMON_CHARACTERS = [
  "Mizuki",
  "Rei",
  "Yuzumi",
  "Kirari",
  "Iruni",
  "Itsuki",
  "998",
  "Sachi",
  "Koyuki",
  "Hiyori",
  "Hitomi",
];

// KSP only exists in the MP 4TH series.
export const MP4TH_EXTRA = ["KSP"];

export const RARITIES: Rarity[] = ["R", "SR", "SSR", "UR"];

export function charactersFor(series: string): string[] {
  return series === "MP 4TH"
    ? [...COMMON_CHARACTERS, ...MP4TH_EXTRA]
    : COMMON_CHARACTERS;
}

export interface CatalogRow {
  series: string;
  character: string;
  rarity: Rarity;
  sortOrder: number;
}

// 44 + 44 + 44 + 48 = 180 card types.
export function buildCatalog(): CatalogRow[] {
  const rows: CatalogRow[] = [];
  let order = 0;
  for (const series of SERIES) {
    for (const character of charactersFor(series)) {
      for (const rarity of RARITIES) {
        rows.push({ series, character, rarity, sortOrder: order++ });
      }
    }
  }
  return rows;
}
