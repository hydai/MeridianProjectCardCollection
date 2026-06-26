import { useEffect, useState } from "react";
import type { TxnRecord } from "../../shared/types";
import { fetchTransactions } from "../api";

export function History() {
  const [rows, setRows] = useState<TxnRecord[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchTransactions()
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

  const income = rows
    .filter((t) => t.type === "sale")
    .reduce((s, t) => s + (t.price ?? 0), 0);

  return (
    <section className="panel">
      <h2 className="panel-title">交易歷史</h2>
      {rows.length === 0 ? (
        <div className="trade-empty">尚無成交紀錄。</div>
      ) : (
        <>
          <div className="summary-line">
            共 <strong>{rows.length}</strong> 筆 · 賣出收入合計{" "}
            <strong>{income}</strong> 元
          </div>
          <table className="admin-table">
            <thead>
              <tr>
                <th>日期</th>
                <th>類型</th>
                <th>卡片</th>
                <th>對象</th>
                <th>金額</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((t) => (
                <tr key={t.id}>
                  <td className="mono">{t.happenedAt}</td>
                  <td>
                    <span
                      className={`pill ${t.type === "sale" ? "sr" : "ssr"}`}
                    >
                      {t.type === "sale" ? "賣出" : "交換"}
                    </span>
                  </td>
                  <td>
                    {t.series} · {t.character}{" "}
                    <span
                      className={`pill ${t.rarity.toLowerCase()}`}
                      style={{ marginLeft: 4 }}
                    >
                      {t.rarity}
                    </span>
                  </td>
                  <td>{t.counterparty ?? "—"}</td>
                  <td className="mono">
                    {t.price != null ? `${t.price} 元` : "—"}
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
