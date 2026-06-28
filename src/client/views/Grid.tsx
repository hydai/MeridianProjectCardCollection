import { useEffect, useState } from "react";
import {
  type Matrix,
  RARITIES,
  RARITY_KEYS,
  buildVolumeRows,
  exists,
  getN,
} from "../collection";

const SERIES_STORAGE_KEY = "mpc:grid:hiddenSeries";
const RARITY_STORAGE_KEY = "mpc:grid:hiddenRarities";

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
      <div className="grid-header">
        <div className="grid-head-left">
          <span className="grid-title">收集格表</span>
          <div className="mode-toggle">
            <button
              type="button"
              className={`mode-btn ${!isCount ? "active" : ""}`}
              onClick={() => setMode("check")}
            >
              打勾
            </button>
            <button
              type="button"
              className={`mode-btn ${isCount ? "active" : ""}`}
              onClick={() => setMode("count")}
            >
              數量
            </button>
          </div>
        </div>
        <span className="grid-progress">
          <strong>{totalHave}</strong> / {totalSlots} · {pct}%
        </span>
      </div>

      <div className="grid-filter">
        <div className="grid-filter-row">
          <span className="grid-filter-label">稀有度</span>
          <div className="grid-filter-btns">
            {RARITIES.map((rarity) => (
              <button
                type="button"
                key={rarity}
                className={`mode-btn ${!hiddenR.has(rarity) ? "active" : ""}`}
                aria-pressed={!hiddenR.has(rarity)}
                onClick={() => toggleRarity(rarity)}
              >
                {rarity}
              </button>
            ))}
          </div>
        </div>
        {volumeRows.map((row) => (
          <div key={row.label} className="grid-filter-row">
            <span className="grid-filter-label">{row.label}</span>
            <div className="grid-filter-btns">
              {row.series.map((s) => (
                <button
                  type="button"
                  key={s}
                  className={`mode-btn ${!hidden.has(s) ? "active" : ""}`}
                  aria-pressed={!hidden.has(s)}
                  onClick={() => toggle(s)}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      {shown.length === 0 || shownRarities.length === 0 ? (
        <div className="grid-empty">
          {shown.length === 0 ? "（未選擇任何系列）" : "（未選擇任何稀有度）"}
        </div>
      ) : (
        <div className="grid-wrap">
          <table className="grid-table">
            <thead>
              <tr>
                <th className="grid-corner" rowSpan={2}>
                  角色
                </th>
                {shown.map(({ s }) => (
                  <th
                    key={s}
                    colSpan={shownRarities.length}
                    className="grid-series-head grid-series-start"
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
                      className={`grid-rarity-head gr-${RARITY_KEYS[ri]} ${
                        localRi === 0 ? "grid-series-start" : ""
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
                <tr key={charName}>
                  <td className="grid-name">{charName}</td>
                  {shown.map(({ s, si }) =>
                    shownRarities.map(({ rarity, ri }, localRi) => {
                      const startCls = localRi === 0 ? "grid-series-start" : "";
                      const cellKey = `${s}-${rarity}`;
                      if (!exists(m, si, ci)) {
                        return (
                          <td
                            key={cellKey}
                            className={`grid-cell gc-na ${startCls}`}
                          />
                        );
                      }
                      const n = getN(m, si, ci, ri);
                      if (n > 0) {
                        return (
                          <td
                            key={cellKey}
                            className={`grid-cell gc-have ${startCls}`}
                          >
                            {isCount ? (
                              <span className="gc-count">{n}</span>
                            ) : (
                              "✓"
                            )}
                          </td>
                        );
                      }
                      return (
                        <td
                          key={cellKey}
                          className={`grid-cell gc-miss ${startCls}`}
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

      <div className="grid-legend">
        <span>
          <span className="swatch sw-have">{isCount ? "2" : "✓"}</span>{" "}
          {isCount ? "數字＝持有張數（≥2 為重複）" : "已收集"}
        </span>
        <span>
          <span className="swatch sw-miss" /> 未收集
        </span>
        <span>
          <span className="swatch sw-na" /> 未收錄（此系列無此角色）
        </span>
      </div>
    </section>
  );
}
