import { Toggle } from "@/components/ui/toggle";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useEffect, useState } from "react";
import {
  type Matrix,
  RARITIES,
  RARITY_KEYS,
  buildVolumeRows,
  exists,
  getN,
} from "../collection";
import {
  CARD_FRAME,
  FILTER_TOGGLE,
  MODE_BTN,
  MODE_TOGGLE,
  PROGRESS_LINE,
  RARITY_TEXT,
  VIEW_HEADER,
} from "./shared";

const SERIES_STORAGE_KEY = "mpc:grid:hiddenSeries";
const RARITY_STORAGE_KEY = "mpc:grid:hiddenRarities";

// Strong (heavier) hairline borders for the frozen first column + series
// dividers (legacy `var(--border-strong)`); repeated across the sticky corner,
// the series/rarity headers, the name cells, and each series-start cell.
const BORDER_STRONG_B = "[border-bottom:0.5px_solid_var(--border-strong)]";
const BORDER_STRONG_R = "[border-right:0.5px_solid_var(--border-strong)]";
const BORDER_STRONG_L = "[border-left:0.5px_solid_var(--border-strong)]";

// Grid body cell base (legacy `.grid-cell`): fixed 32px square, hairline bottom,
// centered. Each cell layers its state fill on top.
const GRID_CELL_BASE =
  "h-8 w-8 border-b-[0.5px] border-border p-0 text-center text-xs leading-none max-sm:h-7 max-sm:w-[26px]";

// Gold "have" tint (legacy `.gc-have` / `.sw-have`): shared by the filled grid
// cells and the legend's ✓ swatch so a retint stays in lockstep.
const HAVE_TINT = "bg-[rgba(201,161,74,0.16)] font-semibold text-primary";

// Grid legend chrome (legacy `.grid-legend`): each key is an inline row; the
// swatch is a 16px rounded box.
const LEGEND_ITEM = "inline-flex items-center gap-[7px]";
const LEGEND_SWATCH =
  "inline-flex h-4 w-4 items-center justify-center rounded-[3px]";

// Load a persisted "hidden" set, keeping only values still present in `valid`
// (drops stale entries — a removed series, or an unknown rarity). Returns an
// empty set if storage is unavailable or malformed.
function loadHiddenSet(key: string, valid: readonly string[]): Set<string> {
  try {
    const raw = localStorage.getItem(key);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr)
      ? new Set(
          arr.filter(
            (x): x is string => typeof x === "string" && valid.includes(x),
          ),
        )
      : new Set();
  } catch {
    return new Set();
  }
}

function saveHiddenSet(key: string, hidden: Set<string>): void {
  try {
    localStorage.setItem(key, JSON.stringify([...hidden]));
  } catch {
    // localStorage unavailable (private mode / sandboxed iframe) — skip persisting.
  }
}

export function Grid({ m }: { m: Matrix }) {
  const [mode, setMode] = useState<"check" | "count">("check");
  const [hidden, setHidden] = useState<Set<string>>(() =>
    loadHiddenSet(SERIES_STORAGE_KEY, m.series),
  );
  const [hiddenR, setHiddenR] = useState<Set<string>>(() =>
    loadHiddenSet(RARITY_STORAGE_KEY, RARITIES),
  );
  const isCount = mode === "count";

  useEffect(() => {
    saveHiddenSet(SERIES_STORAGE_KEY, hidden);
  }, [hidden]);

  useEffect(() => {
    saveHiddenSet(RARITY_STORAGE_KEY, hiddenR);
  }, [hiddenR]);

  const toggle = (s: string) =>
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s);
      else next.add(s);
      return next;
    });

  const toggleRarity = (r: string) =>
    setHiddenR((prev) => {
      const next = new Set(prev);
      if (next.has(r)) next.delete(r);
      else next.add(r);
      return next;
    });

  const volumeRows = buildVolumeRows(m.series);
  const shown = m.series
    .map((s, si) => ({ s, si }))
    .filter(({ s }) => !hidden.has(s));
  const shownRarities = RARITIES.map((rarity, ri) => ({ rarity, ri })).filter(
    ({ rarity }) => !hiddenR.has(rarity),
  );

  let totalHave = 0;
  let totalSlots = 0;
  for (const { si } of shown) {
    m.characters.forEach((_c, ci) => {
      if (!exists(m, si, ci)) return;
      for (const { ri } of shownRarities) {
        totalSlots++;
        if (getN(m, si, ci, ri) > 0) totalHave++;
      }
    });
  }
  const pct = totalSlots ? Math.round((totalHave / totalSlots) * 100) : 0;

  return (
    <section className="view view-grid">
      <div className={VIEW_HEADER}>
        <div className="flex flex-wrap items-center gap-3.5">
          <span className="font-serif text-[15px] font-medium tracking-[0.08em] text-foreground">
            收集格表
          </span>
          <ToggleGroup
            type="single"
            aria-label="顯示模式"
            value={mode}
            onValueChange={(v) => v && setMode(v as "check" | "count")}
            className={MODE_TOGGLE}
          >
            <ToggleGroupItem value="check" className={MODE_BTN}>
              打勾
            </ToggleGroupItem>
            <ToggleGroupItem value="count" className={MODE_BTN}>
              數量
            </ToggleGroupItem>
          </ToggleGroup>
        </div>
        <span className={`grid-progress ${PROGRESS_LINE}`}>
          <strong>{totalHave}</strong> / {totalSlots} · {pct}%
        </span>
      </div>

      <div className="grid-filter mb-4 flex flex-col gap-2 px-1">
        <div className="flex flex-wrap items-center gap-3">
          <span className="min-w-[42px] font-mono text-[11px] tracking-[0.08em] text-[var(--text-tertiary)]">
            稀有度
          </span>
          <div className="flex flex-wrap gap-1.5">
            {RARITIES.map((rarity) => (
              <Toggle
                key={rarity}
                pressed={!hiddenR.has(rarity)}
                onPressedChange={() => toggleRarity(rarity)}
                className={FILTER_TOGGLE}
              >
                {rarity}
              </Toggle>
            ))}
          </div>
        </div>
        {volumeRows.map((row) => (
          <div key={row.label} className="flex flex-wrap items-center gap-3">
            <span className="min-w-[42px] font-mono text-[11px] tracking-[0.08em] text-[var(--text-tertiary)]">
              {row.label}
            </span>
            <div className="flex flex-wrap gap-1.5">
              {row.series.map((s) => (
                <Toggle
                  key={s}
                  pressed={!hidden.has(s)}
                  onPressedChange={() => toggle(s)}
                  className={FILTER_TOGGLE}
                >
                  {s}
                </Toggle>
              ))}
            </div>
          </div>
        ))}
      </div>

      {shown.length === 0 || shownRarities.length === 0 ? (
        <div
          className={`mb-4 ${CARD_FRAME} px-4 py-9 text-center text-[13px] tracking-[0.08em] text-[var(--text-tertiary)]`}
        >
          {shown.length === 0 ? "（未選擇任何系列）" : "（未選擇任何稀有度）"}
        </div>
      ) : (
        <div className={`overflow-x-auto ${CARD_FRAME}`}>
          <table className="grid-table w-full border-collapse text-xs">
            <thead>
              <tr>
                <th
                  rowSpan={2}
                  className={`sticky left-0 z-[3] w-[92px] min-w-[92px] whitespace-nowrap bg-secondary px-3.5 py-2.5 text-left font-sans text-[11px] font-normal tracking-[0.15em] text-muted-foreground ${BORDER_STRONG_B} ${BORDER_STRONG_R} max-sm:w-[76px] max-sm:min-w-[76px] max-sm:px-2.5 max-sm:py-2 max-sm:text-[10px] max-sm:tracking-[0.1em]`}
                >
                  角色
                </th>
                {shown.map(({ s }) => (
                  <th
                    key={s}
                    colSpan={shownRarities.length}
                    className={`grid-series-head grid-series-start border-b-[0.5px] border-border bg-secondary px-1.5 pt-2.5 pb-2 text-center font-accent text-xs font-medium uppercase italic tracking-[0.12em] text-foreground ${BORDER_STRONG_L} max-sm:px-1 max-sm:pt-2 max-sm:pb-1.5 max-sm:text-[11px]`}
                  >
                    {s}
                  </th>
                ))}
              </tr>
              <tr>
                {shown.map(({ s }) =>
                  shownRarities.map(({ rarity, ri }, localRi) => (
                    <th
                      key={`${s}-${rarity}`}
                      className={`grid-rarity-head gr-${RARITY_KEYS[ri]} min-w-[32px] bg-secondary px-0 py-1.5 text-center font-mono text-[10px] font-medium ${BORDER_STRONG_B} max-sm:min-w-[26px] max-sm:text-[9px] ${RARITY_TEXT[ri]} ${
                        localRi === 0
                          ? `grid-series-start ${BORDER_STRONG_L}`
                          : ""
                      }`}
                    >
                      {rarity}
                    </th>
                  )),
                )}
              </tr>
            </thead>
            <tbody>
              {m.characters.map((charName, ci) => (
                <tr key={charName} className="group/row">
                  <td
                    className={`sticky left-0 z-[2] w-[92px] min-w-[92px] overflow-hidden text-ellipsis whitespace-nowrap bg-card px-3.5 py-[9px] text-left font-sans text-[13px] text-foreground ${BORDER_STRONG_R} group-hover/row:bg-secondary max-sm:w-[76px] max-sm:min-w-[76px] max-sm:px-2.5 max-sm:py-2 max-sm:text-xs`}
                  >
                    {charName}
                  </td>
                  {shown.map(({ s, si }) =>
                    shownRarities.map(({ rarity, ri }, localRi) => {
                      const startCls = localRi === 0 ? BORDER_STRONG_L : "";
                      const cellKey = `${s}-${rarity}`;
                      if (!exists(m, si, ci)) {
                        return (
                          <td
                            key={cellKey}
                            className={`${GRID_CELL_BASE} bg-[var(--bg-subtle)] [background-image:repeating-linear-gradient(45deg,transparent,transparent_4px,rgba(255,255,255,0.018)_4px,rgba(255,255,255,0.018)_8px)] ${startCls}`}
                          />
                        );
                      }
                      const n = getN(m, si, ci, ri);
                      if (n > 0) {
                        return (
                          <td
                            key={cellKey}
                            className={`${GRID_CELL_BASE} ${HAVE_TINT} group-hover/row:bg-[rgba(201,161,74,0.26)] ${startCls}`}
                          >
                            {isCount ? (
                              <span className="font-mono font-medium text-primary">
                                {n}
                              </span>
                            ) : (
                              "✓"
                            )}
                          </td>
                        );
                      }
                      return (
                        <td
                          key={cellKey}
                          className={`${GRID_CELL_BASE} bg-transparent group-hover/row:bg-[rgba(255,255,255,0.025)] ${startCls}`}
                        />
                      );
                    }),
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-3.5 flex flex-wrap gap-[18px] pl-1 text-xs text-muted-foreground max-sm:gap-3 max-sm:text-[11px]">
        <span className={LEGEND_ITEM}>
          <span className={`${LEGEND_SWATCH} ${HAVE_TINT} text-[10px]`}>
            {isCount ? "2" : "✓"}
          </span>{" "}
          {isCount ? "數字＝持有張數（≥2 為重複）" : "已收集"}
        </span>
        <span className={LEGEND_ITEM}>
          <span
            className={`${LEGEND_SWATCH} bg-transparent [border:0.5px_solid_var(--border-strong)]`}
          />{" "}
          未收集
        </span>
        <span className={LEGEND_ITEM}>
          <span
            className={`${LEGEND_SWATCH} bg-[var(--bg-subtle)] [background-image:repeating-linear-gradient(45deg,transparent,transparent_3px,rgba(255,255,255,0.018)_3px,rgba(255,255,255,0.018)_6px)] [border:0.5px_solid_var(--border)]`}
          />{" "}
          未收錄（此系列無此角色）
        </span>
      </div>
    </section>
  );
}
