import { useEffect, useState } from "react";
import type { OpeningSummary } from "../../shared/types";
import { fetchOpenings } from "../api";

export function Openings() {
  const [rows, setRows] = useState<OpeningSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchOpenings()
      .then(setRows)
      .catch((e) => setError(String(e)));
  }, []);

  if (error) {
    return (
      <section className="panel">
        <div className="error-text">{error}</div>
      </section>
    );
  }
  if (rows === null) {
    return (
      <section className="panel">
        <div className="state-msg">載入中…</div>
      </section>
    );
  }

  const totalCost = rows.reduce((s, o) => s + (o.cost ?? 0), 0);
  const totalCards = rows.reduce((s, o) => s + o.cardCount, 0);
  const avg = totalCards ? totalCost / totalCards : 0;

  return (
    <section className="panel">
      <h2 className="panel-title">開箱成本</h2>
      {rows.length === 0 ? (
        <div className="trade-empty">
          尚無開箱紀錄。到「開箱新增」勾選「這是一次開箱」即可記錄花費。
        </div>
      ) : (
        <>
          <div className="summary-line">
            共 <strong>{rows.length}</strong> 次開箱 · 總花費{" "}
            <strong>{totalCost}</strong> 元 · 平均每張{" "}
            <strong>{avg.toFixed(1)}</strong> 元
          </div>
          <table className="admin-table">
            <thead>
              <tr>
                <th>日期</th>
                <th>系列</th>
                <th>張數</th>
                <th>花費</th>
                <th>每張成本</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((o) => (
                <tr key={o.id}>
                  <td className="mono">{o.openedAt}</td>
                  <td>{o.series ?? "—"}</td>
                  <td className="mono">{o.cardCount}</td>
                  <td className="mono">
                    {o.cost != null ? `${o.cost} 元` : "—"}
                  </td>
                  <td className="mono">
                    {o.avgCost != null ? `${o.avgCost.toFixed(1)} 元` : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </section>
  );
}
