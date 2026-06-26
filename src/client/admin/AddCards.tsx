import { useRef, useState } from "react";
import { RARITIES, SERIES, charactersFor } from "../../../seed/catalog-def";
import type { AddCardInput, OpeningInput, Rarity } from "../../shared/types";
import { postCards } from "../api";

interface Row {
  id: number;
  character: string;
  rarity: Rarity;
}

export function AddCards() {
  const [series, setSeries] = useState<string>(SERIES[0]);
  const chars = charactersFor(series);
  const nextId = useRef(2);
  const [rows, setRows] = useState<Row[]>([
    { id: 1, character: chars[0], rarity: "R" },
  ]);
  const [isOpening, setIsOpening] = useState(false);
  const [openedAt, setOpenedAt] = useState("");
  const [cost, setCost] = useState("");
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const changeSeries = (s: string) => {
    setSeries(s);
    const valid = charactersFor(s);
    setRows((rs) =>
      rs.map((r) =>
        valid.includes(r.character) ? r : { ...r, character: valid[0] },
      ),
    );
  };

  const setRow = (id: number, patch: Partial<Row>) =>
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const addRow = () =>
    setRows((rs) => [
      ...rs,
      { id: nextId.current++, character: chars[0], rarity: "R" },
    ]);
  const removeRow = (id: number) =>
    setRows((rs) => (rs.length > 1 ? rs.filter((r) => r.id !== id) : rs));

  const submit = async () => {
    setBusy(true);
    setError(null);
    setToast(null);
    try {
      const cards: AddCardInput[] = rows.map((r) => ({
        series,
        character: r.character,
        rarity: r.rarity,
      }));
      let opening: OpeningInput | undefined;
      if (isOpening && openedAt) {
        opening = { series, openedAt, cost: cost ? Number(cost) : undefined };
      }
      const { ids } = await postCards(cards, opening);
      setToast(`已新增 ${ids.length} 張${opening ? "（已記為一次開箱）" : ""}`);
      setRows([{ id: nextId.current++, character: chars[0], rarity: "R" }]);
      setCost("");
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="panel">
      <h2 className="panel-title">開箱新增</h2>

      <label className="field" htmlFor="add-series">
        <span className="field-label">系列</span>
        <select
          id="add-series"
          value={series}
          onChange={(e) => changeSeries(e.target.value)}
        >
          {SERIES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </label>

      <div style={{ marginTop: 16 }}>
        {rows.map((r) => (
          <div className="add-row" key={r.id}>
            <label className="field">
              <span className="field-label">角色</span>
              <select
                value={r.character}
                onChange={(e) => setRow(r.id, { character: e.target.value })}
              >
                {chars.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span className="field-label">稀有度</span>
              <select
                value={r.rarity}
                onChange={(e) =>
                  setRow(r.id, { rarity: e.target.value as Rarity })
                }
              >
                {RARITIES.map((rr) => (
                  <option key={rr} value={rr}>
                    {rr}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => removeRow(r.id)}
              disabled={rows.length === 1}
            >
              移除
            </button>
          </div>
        ))}
      </div>

      <button type="button" className="btn btn-ghost" onClick={addRow}>
        + 新增一列
      </button>

      <label
        style={{
          display: "flex",
          gap: 8,
          alignItems: "center",
          margin: "20px 0 0",
          fontSize: 14,
          color: "var(--text-secondary)",
          cursor: "pointer",
        }}
      >
        <input
          type="checkbox"
          checked={isOpening}
          onChange={(e) => setIsOpening(e.target.checked)}
        />
        這是一次開箱（記錄花費，用於成本分析）
      </label>

      {isOpening ? (
        <div className="opening-fields">
          <label className="field">
            <span className="field-label">開箱日期</span>
            <input
              type="date"
              value={openedAt}
              onChange={(e) => setOpenedAt(e.target.value)}
            />
          </label>
          <label className="field">
            <span className="field-label">總花費 (TWD)</span>
            <input
              type="number"
              inputMode="numeric"
              value={cost}
              onChange={(e) => setCost(e.target.value)}
              placeholder="例如 600"
            />
          </label>
        </div>
      ) : null}

      <div className="add-actions">
        <button
          type="button"
          className="btn btn-primary"
          onClick={submit}
          disabled={busy}
        >
          {busy ? "新增中…" : `新增 ${rows.length} 張`}
        </button>
        {toast ? <span className="toast">{toast}</span> : null}
        {error ? <span className="error-text">{error}</span> : null}
      </div>
    </section>
  );
}
