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

// ---- Mutation DTOs ----

export interface AddCardInput {
  series: string;
  character: string;
  rarity: Rarity;
  source?: CardSource;
  note?: string;
}

export interface OpeningInput {
  series?: string;
  openedAt: string;
  cost?: number;
  note?: string;
}

export interface UpdateCardInput {
  status?: CardStatus;
  askingPrice?: number | null;
  wantInReturn?: string | null;
  note?: string | null;
}

export interface RecordTxnInput {
  type: TransactionType;
  counterparty?: string;
  price?: number;
  happenedAt: string;
  note?: string;
  // For trades: the card received in return (added to the collection).
  receivedSeries?: string;
  receivedCharacter?: string;
  receivedRarity?: Rarity;
}

export interface OpeningSummary {
  id: number;
  series: string | null;
  openedAt: string;
  cost: number | null;
  cardCount: number;
  avgCost: number | null;
}

export interface TxnRecord {
  id: number;
  cardId: number;
  type: TransactionType;
  counterparty: string | null;
  price: number | null;
  happenedAt: string;
  series: string;
  character: string;
  rarity: Rarity;
  note: string | null;
}

// A physical card joined with its catalog identity, plus whether the owner has
// a duplicate of that type (i.e. it is a candidate to sell or trade).
export interface CardRow {
  id: number;
  series: string;
  character: string;
  rarity: Rarity;
  status: CardStatus;
  source: CardSource;
  askingPrice: number | null;
  wantInReturn: string | null;
  note: string | null;
  duplicate: boolean;
}
