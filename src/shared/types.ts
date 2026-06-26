export type Rarity = "R" | "SR" | "SSR" | "UR";
export type CardStatus = "owned" | "for_sale" | "for_trade" | "sold" | "traded";
export type CardSource = "pull" | "purchase" | "trade_in";
export type TransactionType = "sale" | "trade";

// ---- Read DTOs (shared by worker queries, API routes, and client) ----

export interface OverviewCell {
  catalogId: number;
  series: string;
  character: string;
  rarity: Rarity;
  owned: number;
}

export interface SeriesProgress {
  series: string;
  collectedTypes: number;
  totalTypes: number;
}

export interface OverviewResponse {
  cells: OverviewCell[];
  progress: SeriesProgress[];
}

export interface MissingEntry {
  catalogId: number;
  series: string;
  character: string;
  rarity: Rarity;
}

export interface MarketListing {
  cardId: number;
  series: string;
  character: string;
  rarity: Rarity;
  status: "for_sale" | "for_trade";
  askingPrice: number | null;
  wantInReturn: string | null;
  note: string | null;
}

export interface RarityCount {
  rarity: Rarity;
  count: number;
}

export interface CharacterStat {
  character: string;
  R: number;
  SR: number;
  SSR: number;
  UR: number;
}

export interface PullRate {
  rarity: Rarity;
  count: number;
  pct: number;
}

export interface StatsResponse {
  byRarity: RarityCount[];
  byCharacter: CharacterStat[];
  pullRates: PullRate[];
}
