export type Rarity = "R" | "SR" | "SSR" | "UR" | "EX";
export type CardStatus =
  | "owned"
  | "for_sale"
  | "for_trade"
  | "sold"
  | "traded"
  | "gifted";
export type CardSource = "pull" | "purchase" | "trade_in" | "other";
export type TransactionType = "sale" | "trade" | "gift";

export type ActivityKind =
  | "opening"
  | "purchase"
  | "acquisition"
  | "card_classified"
  | "card_reclassified"
  | "card_updated"
  | "want_updated"
  | "hold"
  | "unhold"
  | "sale"
  | "trade"
  | "gift"
  | "trade_reserved"
  | "trade_reservation_cancelled"
  | "trade_completed"
  | "trade_post_published"
  | "trade_post_closed"
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
  | "reclassified_from"
  | "reclassified_to"
  | "updated"
  | "wanted"
  | "held"
  | "released"
  | "reserved_give"
  | "reserved_receive"
  | "advertised_give"
  | "advertised_want"
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

export type CatalogMediaSide = "front" | "back";

export interface CatalogMediaAsset {
  side: CatalogMediaSide;
  url: string;
  contentType: string;
  byteSize: number;
  originalFilename: string | null;
  revision: number;
  updatedAt: string;
}

export interface CatalogMediaEntry {
  catalogId: number;
  series: string;
  volume: number;
  character: string;
  rarity: Rarity;
  front: CatalogMediaAsset | null;
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
  // Explicit collection target. This is deliberately independent from
  // "missing": zero means the owner has not marked this catalog slot as Want.
  wantCount?: number;
  // Pending inbound quantities satisfy an active Want without entering the
  // physical collection until their reservation is completed.
  incomingTrade?: number;
  incomingPurchase?: number;
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

// ---- Shareable exchange announcements ----

export type TradePostStatus = "draft" | "published" | "closed";
export type TradePostDirection = "give" | "want";

export interface TradePostLine {
  direction: TradePostDirection;
  // Published snapshots survive catalog edits/removal. A null catalogId means
  // the live catalog entry no longer exists, so the line is necessarily stale.
  catalogId: number | null;
  series: string;
  character: string;
  rarity: Rarity;
  qty: number;
  availableQty: number;
  stale: boolean;
}

export interface TradePost {
  id: number;
  publicId: string;
  status: TradePostStatus;
  note: string | null;
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
  closedAt: string | null;
  stale: boolean;
  give: TradePostLine[];
  want: TradePostLine[];
}

export interface AdminTradePost extends TradePost {
  // Total remains after reservations complete/cancel; active counts only rows
  // still occupying inventory in the pending-trade workflow.
  reservationCount: number;
  activeReservationCount: number;
}

export interface TradePostCandidate {
  catalogId: number;
  series: string;
  character: string;
  rarity: Rarity;
  availableQty: number;
}

export interface TradePostCandidates {
  give: TradePostCandidate[];
  want: TradePostCandidate[];
}

export interface TradePostLineInput {
  catalogId: number;
  qty: number;
}

export interface SaveTradePostInput {
  note?: string;
  give: TradePostLineInput[];
  want: TradePostLineInput[];
}

export interface CreateTradePostReservationInput {
  counterparty?: string;
  reservedAt: string;
  note?: string;
  give: TradePostLineInput[];
  receive: TradePostLineInput[];
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

export interface AcquisitionEventInput {
  occurredAt: string;
  counterparty?: string;
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

export interface UpdateCatalogWantInput {
  wantCount: number;
}

export interface ReclassifyCardInput {
  targetCatalogId: number;
  happenedAt: string;
  note?: string;
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
  beforeWant?: number | null;
  afterWant?: number | null;
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
  tradePostId?: number | null;
  tradePostPublicId?: string | null;
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
  tradePostId?: number | null;
  tradePostPublicId?: string | null;
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
