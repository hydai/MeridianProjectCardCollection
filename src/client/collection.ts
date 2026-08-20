import { RARITY_ORDER } from "../shared/rarity";
import type {
  OverviewResponse,
  PublicPendingPurchase,
  PublicPendingTrade,
  Rarity,
} from "../shared/types";

export const RARITIES = RARITY_ORDER;
export const RARITY_KEYS = ["r", "sr", "ssr", "ur", "ex"] as const;
export type RarityKey = (typeof RARITY_KEYS)[number];

export type Counts = [number, number, number, number, number];
export type Slots = [boolean, boolean, boolean, boolean, boolean];

// The artifact's data shape: cards[seriesIdx][charIdx] = [R,SR,SSR,UR,EX] or null
// (null = that character does not appear in that series, e.g. KSP outside MP 4TH).
export interface Matrix {
  series: string[];
  volumes: number[];
  characters: string[];
  cards: (Counts | null)[][];
  reserved: (Counts | null)[][];
  // Owner-held copies (保留) per cell — kept out of the tradeable pool like
  // reserved, but never surfaced publicly.
  held: (Counts | null)[][];
  slots: (Slots | null)[][];
}

const RARITY_INDEX: Record<Rarity, number> = {
  R: 0,
  SR: 1,
  SSR: 2,
  UR: 3,
  EX: 4,
};

export function buildMatrix(overview: OverviewResponse): Matrix {
  const series: string[] = [];
  const volumeBySeries = new Map<string, number>();
  const characters: string[] = [];
  const map = new Map<string, Counts>();
  const reservedMap = new Map<string, Counts>();
  const heldMap = new Map<string, Counts>();
  const slotMap = new Map<string, Slots>();

  // Cells arrive ordered by catalog sort_order (series-major, then character,
  // then rarity), so first-appearance order yields the canonical ordering.
  for (const cell of overview.cells) {
    if (!series.includes(cell.series)) series.push(cell.series);
    if (!volumeBySeries.has(cell.series)) {
      volumeBySeries.set(cell.series, cell.volume ?? 0);
    }
    if (!characters.includes(cell.character)) characters.push(cell.character);
    const key = `${cell.series}|${cell.character}`;
    let counts = map.get(key);
    if (!counts) {
      counts = [0, 0, 0, 0, 0];
      map.set(key, counts);
    }
    counts[RARITY_INDEX[cell.rarity]] = cell.owned;

    let reserved = reservedMap.get(key);
    if (!reserved) {
      reserved = [0, 0, 0, 0, 0];
      reservedMap.set(key, reserved);
    }
    reserved[RARITY_INDEX[cell.rarity]] = cell.reserved ?? 0;

    let held = heldMap.get(key);
    if (!held) {
      held = [0, 0, 0, 0, 0];
      heldMap.set(key, held);
    }
    held[RARITY_INDEX[cell.rarity]] = cell.held ?? 0;

    let slots = slotMap.get(key);
    if (!slots) {
      slots = [false, false, false, false, false];
      slotMap.set(key, slots);
    }
    slots[RARITY_INDEX[cell.rarity]] = true;
  }

  const cards = series.map((s) =>
    characters.map((c) => map.get(`${s}|${c}`) ?? null),
  );
  const reserved = series.map((s) =>
    characters.map((c) => reservedMap.get(`${s}|${c}`) ?? null),
  );
  const held = series.map((s) =>
    characters.map((c) => heldMap.get(`${s}|${c}`) ?? null),
  );
  const slots = series.map((s) =>
    characters.map((c) => slotMap.get(`${s}|${c}`) ?? null),
  );
  return {
    series,
    volumes: series.map((s) => volumeBySeries.get(s) ?? 0),
    characters,
    cards,
    reserved,
    held,
    slots,
  };
}

export interface VolumeRow {
  label: string;
  series: string[];
}

// Group live series by the volume metadata stored in D1. A zero/invalid volume
// is kept visible in a trailing fallback row for legacy or partially migrated
// data instead of silently disappearing from the grid.
export function buildVolumeRows(
  allSeries: string[],
  volumes: number[],
): VolumeRow[] {
  const byVolume = new Map<number, string[]>();
  const unassigned: string[] = [];
  allSeries.forEach((series, index) => {
    const volume = volumes[index];
    if (!Number.isInteger(volume) || volume < 1) {
      unassigned.push(series);
      return;
    }
    const members = byVolume.get(volume) ?? [];
    members.push(series);
    byVolume.set(volume, members);
  });

  const rows: VolumeRow[] = [];
  for (const [volume, members] of [...byVolume.entries()].sort(
    ([a], [b]) => a - b,
  )) {
    rows.push({ label: `Vol.${volume}`, series: members });
  }
  if (unassigned.length > 0) {
    rows.push({ label: "其他", series: unassigned });
  }
  return rows;
}

export const cellOf = (m: Matrix, s: number, c: number): Counts | null =>
  m.cards[s][c];
export const exists = (m: Matrix, s: number, c: number): boolean =>
  m.cards[s][c] !== null;
export const existsR = (m: Matrix, s: number, c: number, r: number): boolean =>
  m.slots[s]?.[c]?.[r] === true;
export const getN = (m: Matrix, s: number, c: number, r: number): number => {
  const x = m.cards[s][c];
  return x === null ? 0 : x[r];
};
export const getReservedN = (
  m: Matrix,
  s: number,
  c: number,
  r: number,
): number => {
  const x = m.reserved[s]?.[c];
  return x === null || x === undefined ? 0 : x[r];
};
export const getHeldN = (
  m: Matrix,
  s: number,
  c: number,
  r: number,
): number => {
  const x = m.held[s]?.[c];
  return x === null || x === undefined ? 0 : x[r];
};
// Tradeable copies exclude both pending-trade reservations and owner holds
// (保留). held and reserved never cover the same card, so subtracting both is safe.
export const getAvailableN = (
  m: Matrix,
  s: number,
  c: number,
  r: number,
): number =>
  Math.max(
    0,
    getN(m, s, c, r) - getReservedN(m, s, c, r) - getHeldN(m, s, c, r),
  );
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

export type TradeListLanguage = "en" | "zh";

const SERIES_ZH: Record<string, string> = {
  "BUNNY GIRL": "兔女郎",
  KILLER: "殺手",
  "NEW YEAR": "新年",
  "MP 4TH": "四週年",
};

const CHARACTER_ZH: Record<string, string> = {
  "998": "玖玖巴",
  Hiyori: "煦Hiyori",
  Hitomi: "実Hitomi",
  Iruni: "祈Iruni",
  Kirali: "煌Kirali",
  Koyuki: "雪Koyuki",
  KSP: "KSP",
  Itsuki: "玥Itsuki",
  Mizuki: "浠Mizuki",
  Rei: "澪Rei",
  Sachi: "幸Sachi",
  Yuzumi: "橙Yuzumi",
};

const localize = (
  value: string,
  language: TradeListLanguage,
  labels: Record<string, string>,
) => (language === "zh" ? (labels[value] ?? value) : value);

export function formatTradeLabel(
  value: string,
  language: TradeListLanguage,
  kind: "series" | "character",
): string {
  return localize(
    value,
    language,
    kind === "series" ? SERIES_ZH : CHARACTER_ZH,
  );
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
      RARITIES.forEach((_r, ri) => {
        if (!existsR(m, si, ci, ri)) return;
        const owned = getN(m, si, ci, ri);
        const available = getAvailableN(m, si, ci, ri);
        if (available >= 2) {
          surplus.push({ ri, si, ci, spare: available - 1 });
        } else if (owned === 0) {
          needs.push({ ri, si, ci, spare: 0 });
        }
      });
    }),
  );
  return { surplus, needs };
}

// Overlay pending receives on the derived trade view. Pending gives are already
// represented by Matrix.reserved, while owned remains the physical holding count.
export function computeTradeWithPending(
  m: Matrix,
  pending: PublicPendingTrade[],
  pendingPurchases: PublicPendingPurchase[] = [],
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

  const purchaseKeys = pendingPurchaseByCoord(m, pendingPurchases);

  const adjustedNeeds = needs.filter(
    (n) =>
      !receiveKeys.has(key(n.si, n.ci, n.ri)) &&
      !purchaseKeys.has(key(n.si, n.ci, n.ri)),
  );
  return { surplus, needs: adjustedNeeds };
}

// Every existing catalog card, as receive candidates for the unified 換入 list.
// spare carries the physical holding count (0 = missing) so the form can render
// 持有 N / 缺 inline. Give-side choices use computeTrade's available count;
// receive choices intentionally continue to describe physical ownership.
export function receivableCards(m: Matrix): TradeItem[] {
  const items: TradeItem[] = [];
  m.series.forEach((_s, si) =>
    m.characters.forEach((_c, ci) => {
      RARITIES.forEach((_r, ri) => {
        if (!existsR(m, si, ci, ri)) return;
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

// Sum of pending purchase qty per matrix coordinate "si|ci|ri". Pending
// purchases are intentionally kept outside Matrix.cards: they do not count as
// physically owned until the owner confirms receipt.
export function pendingPurchaseByCoord(
  m: Matrix,
  pendingPurchases: PublicPendingPurchase[],
): Map<string, number> {
  const out = new Map<string, number>();
  for (const purchase of pendingPurchases) {
    for (const line of purchase.lines) {
      const si = m.series.indexOf(line.series);
      const ci = m.characters.indexOf(line.character);
      const ri = RARITIES.indexOf(line.rarity);
      if (si < 0 || ci < 0 || ri < 0) continue;
      const key = `${si}|${ci}|${ri}`;
      out.set(key, (out.get(key) ?? 0) + line.qty);
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
  language: TradeListLanguage = "en",
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
    const character = formatTradeLabel(
      m.characters[it.ci],
      language,
      "character",
    );
    const series = formatTradeLabel(m.series[it.si], language, "series");
    lines.push(`${character}, ${series}, ${qty}`);
  }
  flush();
  return groups.join("\n\n");
}
