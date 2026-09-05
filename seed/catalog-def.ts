import { BASE_RARITY_ORDER } from "../src/shared/rarity";
import type { Rarity } from "../src/shared/types";

// Historical catalog for the original import and its test fixtures.
// Live public views and admin controls read D1's series + card_catalog tables.
// Additions belong in the series manager or an explicit catalog:sync input,
// not here. See the manage-card-catalog skill.

// The checked-in seed contains only Vol.1–2. EX is introduced by the Vol.3
// migration and by the dynamic series manager, so legacy seed series keep the
// original four-rarity catalog.
export const RARITIES: Rarity[] = [...BASE_RARITY_ORDER];

// Characters shared by the original three series.
export const COMMON_CHARACTERS = [
  "Mizuki",
  "Rei",
  "Yuzumi",
  "Kirali",
  "Iruni",
  "Itsuki",
  "998",
  "Sachi",
  "Koyuki",
  "Hiyori",
  "Hitomi",
];

// Historical series -> ordered character list.
export const SERIES_CHARACTERS: Record<string, string[]> = {
  "NEW YEAR": COMMON_CHARACTERS,
  "BUNNY GIRL": COMMON_CHARACTERS,
  KILLER: COMMON_CHARACTERS,
  "MP 4TH": [...COMMON_CHARACTERS, "KSP"],
};

export const SERIES = Object.keys(SERIES_CHARACTERS);

// Historical volume assignments. Runtime volumes live in series.volume_number.
export const VOLUMES: { label: string; series: string[] }[] = [
  { label: "Vol.1", series: ["NEW YEAR", "BUNNY GIRL", "KILLER"] },
  { label: "Vol.2", series: ["MP 4TH"] },
];

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
