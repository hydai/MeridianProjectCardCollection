import { useState } from "react";
import { RARITIES, SERIES, charactersFor } from "../../../seed/catalog-def";
import type { AddCardInput, OpeningInput, Rarity } from "../../shared/types";
import { postCards } from "../api";

interface TallyEntry {
  character: string;
  rarity: Rarity;
  qty: number;
}

export function AddCards() {
  const [series, setSeries] = useState<string>(SERIES[0]);
  const [rarity, setRarity] = useState<Rarity>("R");
  const [tally, setTally] = useState<TallyEntry[]>([]);
  const [isOpening, setIsOpening] = useState(false);
  const [openedAt, setOpenedAt] = useState("");
  const [cost, setCost] = useState("");
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const chars = charactersFor(series);
  const total = tally.reduce((n, e) => n + e.qty, 0);

  const changeSeries = (s: string) => {
    setSeries(s);
    const valid = charactersFor(s);
    setTally((t) => t.filter((e) => valid.includes(e.character)));
  };

  const addCard = (character: string) =>
    setTally((t) => {
      const i = t.findIndex(
        (e) => e.character === character && e.rarity === rarity,
      );
      if (i === -1) return [...t, { character, rarity, qty: 1 }];
      return t.map((e, j) => (j === i ? { ...e, qty: e.qty + 1 } : e));
    });

  const removeOne = (character: string, r: Rarity) =>
    setTally((t) =>
      t
        .map((e) =>
          e.character === character && e.rarity === r
            ? { ...e, qty: e.qty - 1 }
            : e,
        )
        .filter((e) => e.qty > 0),
    );

  const submit = async () => {
    setBusy(true);
    setError(null);
    setToast(null);
    try {
      const cards: AddCardInput[] = tally.flatMap((e) =>
        Array.from({ length: e.qty }, () => ({
          series,
          character: e.character,
          rarity: e.rarity,
        })),
      );
      let opening: OpeningInput | undefined;
      if (isOpening && openedAt) {
        opening = { series, openedAt, cost: cost ? Number(cost) : undefined };
      }
      const { ids } = await postCards(cards, opening);
      setToast(`已新增 ${ids.length} 張${opening ? "（已記為一次開箱）" : ""}`);
      setTally([]);
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

      <div className="field">
        <span className="field-label">系列</span>
        <div className="opt-group">
          {SERIES.map((s) => (
            <button
              key={s}
              type="button"
              className={`opt${s === series ? " active" : ""}`}
              onClick={() => changeSeries(s)}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      <div className="field" style={{ marginTop: 16 }}>
        <span className="field-label">稀有度</span>
        <div className="opt-group">
          {RARITIES.map((rr) => (
            <button
              key={rr}
              type="button"
              className={`opt rarity ${rr.toLowerCase()}${
                rr === rarity ? " active" : ""
              }`}
              onClick={() => setRarity(rr)}
            >
              {rr}
            </button>
          ))}
        </div>
      </div>

      <div className="field" style={{ marginTop: 16 }}>
        <span className="field-label">角色（點一下 = 加一張）</span>
        <div className="opt-group">
          {chars.map((c) => (
            <button
              key={c}
              type="button"
              className="opt"
              onClick={() => addCard(c)}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      {tally.length > 0 ? (
        <div className="tally">
          {tally.map((e) => (
            <div className="tally-row" key={`${e.character}-${e.rarity}`}>
              <span className="tally-name">{e.character}</span>
              <span className={`pill ${e.rarity.toLowerCase()}`}>
                {e.rarity}
              </span>
              <span className="tally-qty">×{e.qty}</span>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                aria-label={`移除 ${e.character} ${e.rarity}`}
                onClick={() => removeOne(e.character, e.rarity)}
              >
                –
              </button>
            </div>
          ))}
        </div>
      ) : (
        <p className="tally-empty">點上方角色加入卡片</p>
      )}

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
          disabled={busy || total === 0}
        >
          {busy ? "新增中…" : `新增 ${total} 張`}
        </button>
        {toast ? <span className="toast">{toast}</span> : null}
        {error ? <span className="error-text">{error}</span> : null}
      </div>
    </section>
  );
}
