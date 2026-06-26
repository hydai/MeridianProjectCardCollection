import type {
  MarketListing,
  MissingEntry,
  OverviewResponse,
  StatsResponse,
} from "../shared/types";

async function get<T>(path: string): Promise<T> {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`${path} → ${res.status}`);
  return (await res.json()) as T;
}

export const fetchOverview = () => get<OverviewResponse>("/api/overview");
export const fetchMissing = () => get<MissingEntry[]>("/api/missing");
export const fetchMarket = () => get<MarketListing[]>("/api/market");
export const fetchStats = () => get<StatsResponse>("/api/stats");
