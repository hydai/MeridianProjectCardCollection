import { EMPTY_MSG, STATE_MSG } from "@/shared/states";
import { useEffect, useState } from "react";
import type { OpeningSummary } from "../../shared/types";
import { fetchOpenings } from "../api";
import {
  ERROR_TEXT,
  PANEL,
  PANEL_TITLE,
  SUMMARY_LINE,
  TABLE,
  TD,
  TD_MONO,
  TH,
} from "./ui";

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
      <section className={PANEL}>
        <div className={ERROR_TEXT}>{error}</div>
      </section>
    );
  }
  if (rows === null) {
    return (
      <section className={PANEL}>
        <div className={STATE_MSG}>載入中…</div>
      </section>
    );
  }

  const pricedRows = rows.filter(
    (opening): opening is OpeningSummary & { cost: number } =>
      opening.cost != null,
  );
  const totalCost = pricedRows.reduce((sum, opening) => sum + opening.cost, 0);
  const pricedCards = pricedRows.reduce(
    (sum, opening) => sum + opening.cardCount,
    0,
  );
  const avg = pricedCards > 0 ? totalCost / pricedCards : null;

  return (
    <section className={PANEL}>
      <h2 className={PANEL_TITLE}>開卡成本</h2>
      {rows.length === 0 ? (
        <div className={EMPTY_MSG}>
          尚無開卡紀錄。每次送出一包後會顯示在這裡。
        </div>
      ) : (
        <>
          <div className={SUMMARY_LINE}>
            共 <strong>{rows.length}</strong> 包 · 已記成本{" "}
            <strong>{pricedRows.length}</strong> 包 · 已記花費{" "}
            <strong>{totalCost}</strong> 元 · 已知成本平均每張{" "}
            <strong>{avg != null ? `${avg.toFixed(1)} 元` : "—"}</strong>
          </div>
          <div className="overflow-x-auto">
            <table className={`${TABLE} min-w-[680px]`}>
              <thead>
                <tr>
                  <th className={TH}>包號</th>
                  <th className={TH}>日期</th>
                  <th className={TH}>系列</th>
                  <th className={TH}>張數</th>
                  <th className={TH}>花費</th>
                  <th className={TH}>每張成本</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((o) => (
                  <tr key={o.id}>
                    <td className={TD_MONO}>第 {o.packNumber} 包</td>
                    <td className={TD_MONO}>{o.openedAt}</td>
                    <td className={TD}>{o.series ?? "—"}</td>
                    <td className={TD_MONO}>{o.cardCount}</td>
                    <td className={TD_MONO}>
                      {o.cost != null ? `${o.cost} 元` : "—"}
                    </td>
                    <td className={TD_MONO}>
                      {o.avgCost != null ? `${o.avgCost.toFixed(1)} 元` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
