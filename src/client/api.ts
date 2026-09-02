import type {
  ActivityEvent,
  AddCardInput,
  AdminPendingPurchase,
  AdminPendingTrade,
  CardRow,
  CatalogSeries,
  CreatePurchaseReservationInput,
  CreateReservationInput,
  CreateSeriesInput,
  MarketListing,
  MissingEntry,
  OpeningInput,
  OpeningSummary,
  OverviewResponse,
  PublicPendingPurchase,
  PublicPendingTrade,
  RecordTxnInput,
  StatsResponse,
  TxnRecord,
  UpdateCardInput,
  UpdateSeriesInput,
} from "../shared/types";

async function get<T>(path: string): Promise<T> {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`${path} → ${res.status}`);
  return (await res.json()) as T;
}

async function send<T>(
  method: string,
  path: string,
  body: unknown,
): Promise<T> {
  const res = await fetch(path, {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    let detail: string | null = null;
    try {
      const payload = (await res.json()) as { error?: unknown };
      if (typeof payload.error === "string") detail = payload.error;
    } catch {
      // Fall back to the endpoint/status message for non-JSON errors.
    }
    throw new Error(detail ?? `${path} → ${res.status}`);
  }
  return (await res.json()) as T;
}

// ---- Public ----
export const fetchOverview = () => get<OverviewResponse>("/api/overview");
export const fetchMissing = () => get<MissingEntry[]>("/api/missing");
export const fetchMarket = () => get<MarketListing[]>("/api/market");
export const fetchStats = () => get<StatsResponse>("/api/stats");
export const fetchCatalog = () => get<CatalogSeries[]>("/api/catalog");

// ---- Admin ----
export const postCards = (cards: AddCardInput[], opening?: OpeningInput) =>
  send<{
    ids: number[];
    opening?: { id: number; volume: number; packNumber: number };
  }>("POST", "/api/admin/cards", { cards, opening });

export const postSeries = (input: CreateSeriesInput) =>
  send<CatalogSeries>("POST", "/api/admin/series", input);

export const patchSeries = (name: string, input: UpdateSeriesInput) =>
  send<CatalogSeries>(
    "PATCH",
    `/api/admin/series/${encodeURIComponent(name)}`,
    input,
  );

export const patchCard = (id: number, update: UpdateCardInput) =>
  send<{ ok: true }>("PATCH", `/api/admin/cards/${id}`, update);

// Lock a card out of the tradeable list (保留); unhold releases it.
export const holdCard = (id: number) =>
  send<{ ok: true }>("POST", `/api/admin/cards/${id}/hold`, {});
export const unholdCard = (id: number) =>
  send<{ ok: true }>("DELETE", `/api/admin/cards/${id}/hold`, {});

export const listCards = (
  filter: { series?: string; status?: string } = {},
) => {
  const params = new URLSearchParams();
  if (filter.series) params.set("series", filter.series);
  if (filter.status) params.set("status", filter.status);
  const qs = params.toString();
  return get<CardRow[]>(`/api/admin/cards${qs ? `?${qs}` : ""}`);
};

export const postTransaction = (input: { cardId: number } & RecordTxnInput) =>
  send<{ id: number }>("POST", "/api/admin/transactions", input);

export const fetchOpenings = () => get<OpeningSummary[]>("/api/admin/openings");
export const fetchNextPackNumber = (volume: number) =>
  get<{ packNumber: number }>(
    `/api/admin/openings/next?${new URLSearchParams({ volume: String(volume) })}`,
  );
export const fetchTransactions = () =>
  get<TxnRecord[]>("/api/admin/transactions");
export const fetchActivities = (limit = 100) =>
  get<ActivityEvent[]>(
    `/api/admin/activities?${new URLSearchParams({ limit: String(limit) })}`,
  );
export const fetchCatalogActivities = (catalogId: number, limit = 50) =>
  get<ActivityEvent[]>(
    `/api/admin/catalog/${catalogId}/activities?${new URLSearchParams({ limit: String(limit) })}`,
  );
export const putCatalogWant = (catalogId: number, wantCount: number) =>
  send<{ wantCount: number }>("PUT", `/api/admin/catalog/${catalogId}/want`, {
    wantCount,
  });
export const undoActivity = (id: number) =>
  send<{ ok: true }>("POST", `/api/admin/activities/${id}/undo`, {});

// ---- Pending trades ----
export const fetchPendingTrades = () =>
  get<PublicPendingTrade[]>("/api/pending-trades");
export const fetchAdminPendingTrades = () =>
  get<AdminPendingTrade[]>("/api/admin/pending-trades");
export const postReservation = (input: CreateReservationInput) =>
  send<{ id: number }>("POST", "/api/admin/pending-trades", input);
export const completeReservation = (id: number, happenedAt: string) =>
  send<{ ok: true }>("POST", `/api/admin/pending-trades/${id}/complete`, {
    happenedAt,
  });
export const cancelReservation = (id: number) =>
  send<{ ok: true }>("DELETE", `/api/admin/pending-trades/${id}`, {});

// ---- Pending purchases ----
export const fetchPendingPurchases = () =>
  get<PublicPendingPurchase[]>("/api/pending-purchases");
export const fetchAdminPendingPurchases = () =>
  get<AdminPendingPurchase[]>("/api/admin/pending-purchases");
export const postPurchaseReservation = (
  input: CreatePurchaseReservationInput,
) => send<{ id: number }>("POST", "/api/admin/pending-purchases", input);
export const completePendingPurchase = (id: number) =>
  send<{ ok: true }>("POST", `/api/admin/pending-purchases/${id}/complete`, {});
export const cancelPendingPurchase = (id: number) =>
  send<{ ok: true }>("DELETE", `/api/admin/pending-purchases/${id}`, {});
