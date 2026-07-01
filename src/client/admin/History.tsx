import { cn } from "@/lib/utils";
import { useEffect, useState } from "react";
import type { TxnRecord } from "../../shared/types";
import { fetchTransactions } from "../api";
import {
  ERROR_TEXT,
  PANEL,
  PANEL_TITLE,
  PILL_BASE,
  PILL_RARITY,
  SUMMARY_LINE,
  TABLE,
  TD,
  TD_MONO,
  TH,
} from "./ui";

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
      <section className={PANEL}>
        <div className={ERROR_TEXT}>{error}</div>
      </section>
    );
  }
  if (rows === null) {
    return (
      <section className={PANEL}>
        <div className="state-msg">載入中…</div>
      </section>
    );
  }

  const income = rows
    .filter((t) => t.type === "sale")
    .reduce((s, t) => s + (t.price ?? 0), 0);

  return (
    <section className={PANEL}>
      <h2 className={PANEL_TITLE}>交易歷史</h2>
      {rows.length === 0 ? (
        <div className="trade-empty">尚無成交紀錄。</div>
      ) : (
        <>
          <div className={SUMMARY_LINE}>
            共 <strong>{rows.length}</strong> 筆 · 賣出收入合計{" "}
            <strong>{income}</strong> 元
          </div>
          <table className={TABLE}>
            <thead>
              <tr>
                <th className={TH}>日期</th>
                <th className={TH}>類型</th>
                <th className={TH}>卡片</th>
                <th className={TH}>對象</th>
                <th className={TH}>金額</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((t) => (
                <tr key={t.id}>
                  <td className={TD_MONO}>{t.happenedAt}</td>
                  <td className={TD}>
                    <span
                      className={cn(
                        PILL_BASE,
                        t.type === "sale" ? PILL_RARITY.SR : PILL_RARITY.SSR,
                      )}
                    >
                      {t.type === "sale" ? "賣出" : "交換"}
                    </span>
                  </td>
                  <td className={TD}>
                    {t.series} · {t.character}{" "}
                    <span
                      className={cn(PILL_BASE, PILL_RARITY[t.rarity], "ml-1")}
                    >
                      {t.rarity}
                    </span>
                  </td>
                  <td className={TD}>{t.counterparty ?? "—"}</td>
                  <td className={TD_MONO}>
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
