export type Rarity = "R" | "SR" | "SSR" | "UR" | "EX";
export type CardStatus = "owned" | "for_sale" | "for_trade" | "sold" | "traded";
export type CardSource = "pull" | "purchase" | "trade_in";
export type TransactionType = "sale" | "trade";

export type ActivityKind =
  | "opening"
  | "purchase"
  | "acquisition"
  | "card_classified"
  | "card_updated"
  | "hold"
  | "unhold"
  | "sale"
  | "trade"
  | "trade_reserved"
  | "trade_reservation_cancelled"
  | "trade_completed"
  | "purchase_ordered"
  | "purchase_received"
  | "purchase_cancelled"
  | "undo";

export type ActivityLineAction =
  | "acquired"
  | "given"
  | "received"
  | "ordered"
  | "classified"
  | "updated"
  | "held"
  | "released"
  | "reserved_give"
  | "reserved_receive"
  | "cancelled"
  | "undone";

// ---- Read DTOs (shared by worker queries, API routes, and client) ----

export interface CatalogSeries {
  name: string;
  volume: number;
  sortOrder: number;
  characters: string[];
  rarities: Rarity[];
}

export interface CreateSeriesInput {
  name: string;
  volume: number;
  characters: string[];
  rarities: Rarity[];
}

export type UpdateSeriesInput = Omit<CreateSeriesInput, "name">;

export interface OverviewCell {
  catalogId: number;
  series: string;
  volume: number;
  character: string;
  rarity: Rarity;
  owned: number;
  reserved: number;
  // Owner-held copies (保留): still owned, but kept out of the tradeable pool.
  held: number;
  available: number;
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
  reserved: boolean;
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
  EX: number;
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
  purchasePrice?: number;
  note?: string;
}

export interface OpeningInput {
  volume: number;
  openedAt: string;
  cost?: number;
  note?: string;
}

export interface OpeningCreated {
  id: number;
  volume: number;
  packNumber: number;
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
  volume: number | null;
  series: string | null;
  packNumber: number;
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

// ---- Unified activity stream ----

export interface ActivityLine {
  catalogId: number | null;
  series: string | null;
  character: string | null;
  rarity: Rarity | null;
  action: ActivityLineAction;
  qty: number;
  delta: number;
  beforeStatus: CardStatus | null;
  afterStatus: CardStatus | null;
  unitAmount: number | null;
  note: string | null;
}

export interface ActivityEvent {
  id: number;
  kind: ActivityKind;
  occurredAt: string;
  sourceType: string | null;
  sourceId: number | null;
  counterparty: string | null;
  amount: number | null;
  note: string | null;
  revertsEventId: number | null;
  reversedAt: string | null;
  createdAt: string;
  canUndo: boolean;
  lines: ActivityLine[];
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
  purchasePrice: number | null;
  purchaseSeller?: string | null;
  purchaseOrderedAt?: string | null;
  purchaseNote?: string | null;
  askingPrice: number | null;
  wantInReturn: string | null;
  note: string | null;
  duplicate: boolean;
  reserved: boolean;
  reservedGive: number;
  // Owner has locked this exact physical card out of the tradeable list (保留).
  held: boolean;
}

// ---- Pending trade reservations ----
export type TradeDirection = "give" | "receive";

export interface ReservationLine {
  direction: TradeDirection;
  catalogId: number;
  series: string;
  character: string;
  rarity: Rarity;
  qty: number;
}

// Public DTO: never includes counterparty or note.
export interface PublicPendingTrade {
  id: number;
  reservedAt: string;
  give: ReservationLine[];
  receive: ReservationLine[];
}

export interface AdminPendingTrade extends PublicPendingTrade {
  counterparty: string | null;
  note: string | null;
}

export interface ReservationLineInput {
  series: string;
  character: string;
  rarity: Rarity;
  qty: number;
}

export interface CreateReservationInput {
  counterparty?: string;
  reservedAt: string;
  note?: string;
  give: ReservationLineInput[];
  receive: ReservationLineInput[];
}

export interface CompleteReservationInput {
  happenedAt: string;
}

// ---- Pending purchase reservations ----

export interface PurchaseReservationLine {
  catalogId: number;
  series: string;
  character: string;
  rarity: Rarity;
  qty: number;
}

export interface AdminPurchaseReservationLine extends PurchaseReservationLine {
  unitPrice: number;
}

// Public DTO: never includes seller, note, or unit price.
export interface PublicPendingPurchase {
  id: number;
  orderedAt: string;
  lines: PurchaseReservationLine[];
}

export interface AdminPendingPurchase extends PublicPendingPurchase {
  seller: string | null;
  note: string | null;
  lines: AdminPurchaseReservationLine[];
}

export interface PurchaseReservationLineInput {
  series: string;
  character: string;
  rarity: Rarity;
  qty: number;
  unitPrice: number;
}

export interface CreatePurchaseReservationInput {
  seller?: string;
  orderedAt: string;
  note?: string;
  lines: PurchaseReservationLineInput[];
}
