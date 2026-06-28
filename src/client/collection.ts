import { VOLUMES } from "../../seed/catalog-def";
import type {
  OverviewResponse,
  PublicPendingTrade,
  Rarity,
} from "../shared/types";

export const RARITIES: Rarity[] = ["R", "SR", "SSR", "UR"];
export const RARITY_KEYS = ["r", "sr", "ssr", "ur"] as const;
export type RarityKey = (typeof RARITY_KEYS)[number];

export type Counts = [number, number, number, number];

// The artifact's data shape: cards[seriesIdx][charIdx] = [R,SR,SSR,UR] or null
// (null = that character does not appear in that series, e.g. KSP outside MP 4TH).
export interface Matrix {
  series: string[];
  characters: string[];
  cards: (Counts | null)[][];
}

const RARITY_INDEX: Record<Rarity, number> = { R: 0, SR: 1, SSR: 2, UR: 3 };

export function buildMatrix(overview: OverviewResponse): Matrix {
  const series: string[] = [];
  const characters: string[] = [];
  const map = new Map<string, Counts>();

  // Cells arrive ordered by catalog sort_order (series-major, then character,
  // then rarity), so first-appearance order yields the canonical ordering.
  for (const cell of overview.cells) {
    if (!series.includes(cell.series)) series.push(cell.series);
    if (!characters.includes(cell.character)) characters.push(cell.character);
    const key = `${cell.series}|${cell.character}`;
    let counts = map.get(key);
    if (!counts) {
      counts = [0, 0, 0, 0];
      map.set(key, counts);
    }
    counts[RARITY_INDEX[cell.rarity]] = cell.owned;
  }

  const cards = series.map((s) =>
    characters.map((c) => map.get(`${s}|${c}`) ?? null),
  );
  return { series, characters, cards };
}

export interface VolumeRow {
  label: string;
  series: string[];
}

// Align the static VOLUMES map with the live series list: keep only series that
// actually exist, drop emptied volumes, and sweep any series not assigned to a
// volume into a trailing "其他" row so nothing silently vanishes from the grid.
export function buildVolumeRows(allSeries: string[]): VolumeRow[] {
  const assigned = new Set<string>();
  const rows: VolumeRow[] = [];
  for (const vol of VOLUMES) {
    const series = vol.series.filter((s) => allSeries.includes(s));
    for (const s of series) assigned.add(s);
    if (series.length > 0) rows.push({ label: vol.label, series });
  }
  const orphans = allSeries.filter((s) => !assigned.has(s));
  if (orphans.length > 0) rows.push({ label: "其他", series: orphans });
  return rows;
}

export const cellOf = (m: Matrix, s: number, c: number): Counts | null =>
  m.cards[s][c];
export const exists = (m: Matrix, s: number, c: number): boolean =>
  m.cards[s][c] !== null;
export const getN = (m: Matrix, s: number, c: number, r: number): number => {
  const x = m.cards[s][c];
  return x === null ? 0 : x[r];
};
export const sumRow = (arr: number[]): number => arr.reduce((a, b) => a + b, 0);

export function grandTotalByRarity(m: Matrix): Counts {
  return RARITIES.map((_, ri) =>
    m.series.reduce(
      (sum, _s, si) =>
        sum +
        m.characters.reduce((acc, _c, ci) => acc + getN(m, si, ci, ri), 0),
      0,
    ),
  ) as Counts;
}

export interface TradeItem {
  ri: number;
  si: number;
  ci: number;
  spare: number;
}

// Surplus = duplicates that could be traded away (count - 1); needs = missing.
export function computeTrade(m: Matrix): {
  surplus: TradeItem[];
  needs: TradeItem[];
} {
  const surplus: TradeItem[] = [];
  const needs: TradeItem[] = [];
  m.series.forEach((_s, si) =>
    m.characters.forEach((_c, ci) => {
      if (!exists(m, si, ci)) return;
      RARITIES.forEach((_r, ri) => {
        const n = getN(m, si, ci, ri);
        if (n >= 2) surplus.push({ ri, si, ci, spare: n - 1 });
        else if (n === 0) needs.push({ ri, si, ci, spare: 0 });
      });
    }),
  );
  return { surplus, needs };
}

// Overlay pending reservations on the derived trade view. Give-side deduction is
// done upstream in getOverview (so it shows everywhere), so here we only clear
// the needs that a pending receive line will fill.
export function computeTradeWithPending(
  m: Matrix,
  pending: PublicPendingTrade[],
): { surplus: TradeItem[]; needs: TradeItem[] } {
  const { surplus, needs } = computeTrade(m);
  const key = (si: number, ci: number, ri: number) => `${si}|${ci}|${ri}`;
  const coord = (series: string, character: string, rarity: Rarity) => {
    const si = m.series.indexOf(series);
    const ci = m.characters.indexOf(character);
    const ri = RARITIES.indexOf(rarity);
    return si < 0 || ci < 0 || ri < 0 ? null : { si, ci, ri };
  };

  const receiveKeys = new Set<string>();
  for (const p of pending) {
    for (const r of p.receive) {
      const k = coord(r.series, r.character, r.rarity);
      if (k) receiveKeys.add(key(k.si, k.ci, k.ri));
    }
  }

  const adjustedNeeds = needs.filter(
    (n) => !receiveKeys.has(key(n.si, n.ci, n.ri)),
  );
  return { surplus, needs: adjustedNeeds };
}

// Every existing catalog card, as receive candidates for the unified 換入 list.
// spare carries the current holding count (0 = missing) so the form can render
// 持有 N / 缺 inline. Excludes null cells. Give-side reservations are already
// deducted in the matrix by getOverview, so spare reflects effective holdings.
export function receivableCards(m: Matrix): TradeItem[] {
  const items: TradeItem[] = [];
  m.series.forEach((_s, si) =>
    m.characters.forEach((_c, ci) => {
      if (!exists(m, si, ci)) return;
      RARITIES.forEach((_r, ri) => {
        items.push({ ri, si, ci, spare: getN(m, si, ci, ri) });
      });
    }),
  );
  return items;
}

// Sum of pending RECEIVE qty per matrix coordinate "si|ci|ri". Lets the
// reservation form flag a missing card that another pending trade already
// brings in, so it stays selectable (with a heads-up) instead of vanishing
// from the needs list. Cards not in this matrix are skipped.
export function pendingReceiveByCoord(
  m: Matrix,
  pending: PublicPendingTrade[],
): Map<string, number> {
  const out = new Map<string, number>();
  for (const p of pending) {
    for (const r of p.receive) {
      const si = m.series.indexOf(r.series);
      const ci = m.characters.indexOf(r.character);
      const ri = RARITIES.indexOf(r.rarity);
      if (si < 0 || ci < 0 || ri < 0) continue;
      const k = `${si}|${ci}|${ri}`;
      out.set(k, (out.get(k) ?? 0) + r.qty);
    }
  }
  return out;
}

// Serialize a trade list to `角色, 系列, 數量` lines, grouped by rarity
// (UR→R) with a blank line between groups. surplus uses spare as the quantity;
// needs is always 1. Ordering mirrors the on-screen groupedList in Trade.
export function formatTradeList(
  items: TradeItem[],
  m: Matrix,
  kind: "surplus" | "needs",
): string {
  const ordered = [...items].sort(
    (a, b) => b.ri - a.ri || a.si - b.si || a.ci - b.ci,
  );
  const groups: string[] = [];
  let curRi = -1;
  let lines: string[] = [];
  const flush = () => {
    if (lines.length) groups.push(lines.join("\n"));
    lines = [];
  };
  for (const it of ordered) {
    if (it.ri !== curRi) {
      flush();
      curRi = it.ri;
      lines.push(RARITIES[it.ri]);
    }
    const qty = kind === "surplus" ? it.spare : 1;
    lines.push(`${m.characters[it.ci]}, ${m.series[it.si]}, ${qty}`);
  }
  flush();
  return groups.join("\n\n");
}
