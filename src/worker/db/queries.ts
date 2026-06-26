import type {
  CharacterStat,
  MarketListing,
  MissingEntry,
  OverviewCell,
  OverviewResponse,
  Rarity,
  RarityCount,
  SeriesProgress,
  StatsResponse,
} from "../../shared/types";

// Cards still in the owner's possession (excludes sold/traded history).
const ACTIVE = "('owned','for_sale','for_trade')";
const RARITY_ORDER: Rarity[] = ["R", "SR", "SSR", "UR"];

export async function getOverview(db: D1Database): Promise<OverviewResponse> {
  const cells = (
    await db
      .prepare(
        `SELECT c.id AS catalogId, c.series, c.character, c.rarity,
                COUNT(k.id) AS owned
         FROM card_catalog c
         LEFT JOIN cards k ON k.catalog_id = c.id AND k.status IN ${ACTIVE}
         GROUP BY c.id
         ORDER BY c.sort_order`,
      )
      .all<OverviewCell>()
  ).results;

  const progress = (
    await db
      .prepare(
        `SELECT series,
                COUNT(*) AS totalTypes,
                SUM(CASE WHEN owned > 0 THEN 1 ELSE 0 END) AS collectedTypes
         FROM (
           SELECT c.id, c.series, COUNT(k.id) AS owned
           FROM card_catalog c
           LEFT JOIN cards k ON k.catalog_id = c.id AND k.status IN ${ACTIVE}
           GROUP BY c.id
         )
         GROUP BY series`,
      )
      .all<SeriesProgress>()
  ).results;

  return { cells, progress };
}

export async function getMissing(db: D1Database): Promise<MissingEntry[]> {
  return (
    await db
      .prepare(
        `SELECT c.id AS catalogId, c.series, c.character, c.rarity
         FROM card_catalog c
         WHERE NOT EXISTS (
           SELECT 1 FROM cards k WHERE k.catalog_id = c.id AND k.status IN ${ACTIVE}
         )
         ORDER BY c.sort_order`,
      )
      .all<MissingEntry>()
  ).results;
}

export async function getMarket(db: D1Database): Promise<MarketListing[]> {
  return (
    await db
      .prepare(
        `SELECT k.id AS cardId, c.series, c.character, c.rarity, k.status,
                k.asking_price AS askingPrice, k.want_in_return AS wantInReturn, k.note
         FROM cards k
         JOIN card_catalog c ON c.id = k.catalog_id
         WHERE k.status IN ('for_sale','for_trade')
         ORDER BY c.sort_order`,
      )
      .all<MarketListing>()
  ).results;
}

export async function getStats(db: D1Database): Promise<StatsResponse> {
  const rawRarity = (
    await db
      .prepare(
        `SELECT c.rarity, COUNT(k.id) AS count
         FROM cards k JOIN card_catalog c ON c.id = k.catalog_id
         WHERE k.status IN ${ACTIVE}
         GROUP BY c.rarity`,
      )
      .all<RarityCount>()
  ).results;

  const byCharacter = (
    await db
      .prepare(
        `SELECT c.character,
                SUM(c.rarity = 'R') AS R, SUM(c.rarity = 'SR') AS SR,
                SUM(c.rarity = 'SSR') AS SSR, SUM(c.rarity = 'UR') AS UR
         FROM cards k JOIN card_catalog c ON c.id = k.catalog_id
         WHERE k.status IN ${ACTIVE}
         GROUP BY c.character
         ORDER BY c.character`,
      )
      .all<CharacterStat>()
  ).results;

  // Normalise to all four rarities in display order, filling gaps with 0.
  const byRarity: RarityCount[] = RARITY_ORDER.map((rarity) => ({
    rarity,
    count: rawRarity.find((r) => r.rarity === rarity)?.count ?? 0,
  }));
  const total = byRarity.reduce((a, r) => a + r.count, 0) || 1;
  const pullRates = byRarity.map(({ rarity, count }) => ({
    rarity,
    count,
    pct: (count / total) * 100,
  }));

  return { byRarity, byCharacter, pullRates };
}
