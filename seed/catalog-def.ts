import type { Rarity } from "../src/shared/types";

// The collectible-card universe — the single source of truth for which cards
// exist. Drives admin dropdowns (bundled into the client) and the catalog sync
// migration (which writes card_catalog in D1). See the manage-card-catalog skill.
//
//   - Add a SERIES: add an entry to SERIES_CHARACTERS (append at the end).
//   - Add a CHARACTER to a series: append it to that series's character list.
// Then run `npm run catalog:sync` and follow the skill.

export const RARITIES: Rarity[] = ["R", "SR", "SSR", "UR"];

// Characters shared by the original three series.
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

// series -> ordered character list. Insertion order here = display order.
export const SERIES_CHARACTERS: Record<string, string[]> = {
  "NEW YEAR": COMMON_CHARACTERS,
  "BUNNY GIRL": COMMON_CHARACTERS,
  KILLER: COMMON_CHARACTERS,
  "MP 4TH": [...COMMON_CHARACTERS, "KSP"],
};

export const SERIES = Object.keys(SERIES_CHARACTERS);

export function charactersFor(series: string): string[] {
  return SERIES_CHARACTERS[series] ?? [];
}

export interface CatalogRow {
  series: string;
  character: string;
  rarity: Rarity;
  sortOrder: number;
}

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
