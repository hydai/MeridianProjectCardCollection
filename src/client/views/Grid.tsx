import { useEffect, useState } from "react";
import {
  type Matrix,
  RARITIES,
  RARITY_KEYS,
  buildVolumeRows,
  exists,
  getN,
} from "../collection";

const STORAGE_KEY = "mpc:grid:hiddenSeries";

function loadHidden(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr)
      ? new Set(arr.filter((x): x is string => typeof x === "string"))
      : new Set();
  } catch {
    return new Set();
  }
}

function saveHidden(hidden: Set<string>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...hidden]));
  } catch {
    // localStorage unavailable (private mode / sandboxed iframe) — skip persisting.
  }
}

export function Grid({ m }: { m: Matrix }) {
  const [mode, setMode] = useState<"check" | "count">("check");
  const [hidden, setHidden] = useState<Set<string>>(loadHidden);
  const isCount = mode === "count";

  useEffect(() => {
    saveHidden(hidden);
  }, [hidden]);

  const toggle = (s: string) =>
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s);
      else next.add(s);
      return next;
    });

  const volumeRows = buildVolumeRows(m.series);
  const shown = m.series
    .map((s, si) => ({ s, si }))
    .filter(({ s }) => !hidden.has(s));

  let totalHave = 0;
  let totalSlots = 0;
  for (const { si } of shown) {
    m.characters.forEach((_c, ci) => {
      if (!exists(m, si, ci)) return;
      RARITIES.forEach((_r, ri) => {
        totalSlots++;
        if (getN(m, si, ci, ri) > 0) totalHave++;
      });
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
        {volumeRows.map((row) => (
          <div key={row.label} className="grid-filter-row">
            <span className="grid-filter-label">{row.label}</span>
            <div className="grid-filter-btns">
              {row.series.map((s) => (
                <button
                  type="button"
                  key={s}
                  className={`mode-btn ${!hidden.has(s) ? "active" : ""}`}
                  onClick={() => toggle(s)}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      {shown.length === 0 ? (
        <div className="grid-empty">（未選擇任何系列）</div>
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
                    colSpan={4}
                    className="grid-series-head grid-series-start"
                  >
                    {s}
                  </th>
                ))}
              </tr>
              <tr>
                {shown.map(({ s }) =>
                  RARITIES.map((rarity, ri) => (
                    <th
                      key={`${s}-${rarity}`}
                      className={`grid-rarity-head gr-${RARITY_KEYS[ri]} ${
                        ri === 0 ? "grid-series-start" : ""
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
                    RARITIES.map((rarity, ri) => {
                      const startCls = ri === 0 ? "grid-series-start" : "";
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
