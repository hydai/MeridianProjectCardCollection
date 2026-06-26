import type {
  AddCardInput,
  CardRow,
  MarketListing,
  MissingEntry,
  OpeningInput,
  OpeningSummary,
  OverviewResponse,
  RecordTxnInput,
  StatsResponse,
  TxnRecord,
  UpdateCardInput,
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
  if (!res.ok) throw new Error(`${path} → ${res.status}`);
  return (await res.json()) as T;
}

// ---- Public ----
export const fetchOverview = () => get<OverviewResponse>("/api/overview");
export const fetchMissing = () => get<MissingEntry[]>("/api/missing");
export const fetchMarket = () => get<MarketListing[]>("/api/market");
export const fetchStats = () => get<StatsResponse>("/api/stats");

// ---- Admin ----
export const postCards = (cards: AddCardInput[], opening?: OpeningInput) =>
  send<{ ids: number[] }>("POST", "/api/admin/cards", { cards, opening });

export const patchCard = (id: number, update: UpdateCardInput) =>
  send<{ ok: true }>("PATCH", `/api/admin/cards/${id}`, update);

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
export const fetchTransactions = () =>
  get<TxnRecord[]>("/api/admin/transactions");
