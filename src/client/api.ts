import type {
  AcquisitionEventInput,
  ActivityEvent,
  AddCardInput,
  AdminPendingPurchase,
  AdminPendingTrade,
  AdminTradePost,
  CardRow,
  CatalogMediaEntry,
  CatalogSeries,
  CreatePurchaseReservationInput,
  CreateReservationInput,
  CreateSeriesInput,
  CreateTradePostReservationInput,
  MarketListing,
  MissingEntry,
  OpeningInput,
  OpeningSummary,
  OverviewResponse,
  PublicPendingPurchase,
  PublicPendingTrade,
  ReclassifyCardInput,
  RecordTxnInput,
  SaveTradePostInput,
  StatsResponse,
  TradePost,
  TradePostCandidates,
  TxnRecord,
  UpdateCardInput,
  UpdateSeriesInput,
} from "../shared/types";

async function get<T>(path: string): Promise<T> {
  const res = await fetch(path);
  return readJson<T>(path, res);
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly acquisitionOutcome?: "rejected",
  ) {
    super(message);
  }
}

async function readJson<T>(path: string, res: Response): Promise<T> {
  if (!res.ok) {
    let detail: string | null = null;
    try {
      const payload = (await res.json()) as { error?: unknown };
      if (typeof payload.error === "string") detail = payload.error;
    } catch {
      // Fall back to the endpoint/status message for non-JSON errors.
    }
    throw new ApiError(
      res.status,
      detail ?? `${path} → ${res.status}`,
      res.headers?.get("x-acquisition-outcome") === "rejected"
        ? "rejected"
        : undefined,
    );
  }
  return (await res.json()) as T;
}

function readFileBytes(file: File): Promise<ArrayBuffer> {
  if (typeof file.arrayBuffer === "function") return file.arrayBuffer();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () =>
      reject(reader.error ?? new Error("image file could not be read"));
    reader.onload = () => {
      if (reader.result instanceof ArrayBuffer) resolve(reader.result);
      else reject(new Error("image file could not be read"));
    };
    reader.readAsArrayBuffer(file);
  });
}

async function send<T>(
  method: string,
  path: string,
  body: unknown,
  headers?: Record<string, string>,
): Promise<T> {
  const res = await fetch(path, {
    method,
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
  return readJson<T>(path, res);
}

// ---- Public ----
export const fetchOverview = () => get<OverviewResponse>("/api/overview");
export const fetchMissing = () => get<MissingEntry[]>("/api/missing");
export const fetchMarket = () => get<MarketListing[]>("/api/market");
export const fetchStats = () => get<StatsResponse>("/api/stats");
export const fetchCatalog = () => get<CatalogSeries[]>("/api/catalog");
export const fetchTradePosts = () => get<TradePost[]>("/api/trade-posts");
export const fetchTradePost = (publicId: string) =>
  get<TradePost>(`/api/trade-posts/${encodeURIComponent(publicId)}`);

// ---- Admin ----
export const postCards = (
  cards: AddCardInput[],
  opening?: OpeningInput,
  acquisition?: AcquisitionEventInput,
  operationId?: string,
) =>
  send<{
    ids: number[];
    opening?: { id: number; volume: number; packNumber: number };
  }>(
    "POST",
    "/api/admin/cards",
    { cards, opening, acquisition },
    operationId === undefined ? undefined : { "Idempotency-Key": operationId },
  );

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
export const reclassifyCard = (id: number, input: ReclassifyCardInput) =>
  send<{ ok: true }>("POST", `/api/admin/cards/${id}/reclassify`, input);

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

export const fetchCatalogMedia = () =>
  get<CatalogMediaEntry[]>("/api/admin/catalog-media");

export async function putCatalogImage(
  catalogId: number,
  file: File,
): Promise<{ ok: true; revision: number }> {
  const path = `/api/admin/catalog/${catalogId}/image`;
  // Files are bounded to 15 MB by the caller. Materializing the bytes before
  // fetch keeps the upload independent from the transient file-picker handle
  // (important on mobile browsers and automated Chromium sessions).
  const body = await readFileBytes(file);
  const res = await fetch(path, {
    method: "PUT",
    headers: {
      "content-type": file.type,
      "x-card-image-size": String(file.size),
      "x-card-image-filename": encodeURIComponent(file.name),
    },
    body,
  });
  return readJson(path, res);
}

export const deleteCatalogImage = (catalogId: number) =>
  send<{ ok: true }>("DELETE", `/api/admin/catalog/${catalogId}/image`, {});

// ---- Exchange announcements ----
export const fetchAdminTradePosts = () =>
  get<AdminTradePost[]>("/api/admin/trade-posts");
export const fetchTradePostCandidates = () =>
  get<TradePostCandidates>("/api/admin/trade-posts/candidates");
export const postTradePost = (input: SaveTradePostInput) =>
  send<TradePost>("POST", "/api/admin/trade-posts", input);
export const putTradePost = (id: number, input: SaveTradePostInput) =>
  send<TradePost>("PUT", `/api/admin/trade-posts/${id}`, input);
export const publishTradePost = (id: number) =>
  send<TradePost>("POST", `/api/admin/trade-posts/${id}/publish`, {});
export const closeTradePost = (id: number) =>
  send<TradePost>("POST", `/api/admin/trade-posts/${id}/close`, {});
export const deleteTradePost = (id: number) =>
  send<{ ok: true }>("DELETE", `/api/admin/trade-posts/${id}`, {});
export const postTradePostReservation = (
  id: number,
  input: CreateTradePostReservationInput,
) =>
  send<{ id: number }>(
    "POST",
    `/api/admin/trade-posts/${id}/reservations`,
    input,
  );

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
