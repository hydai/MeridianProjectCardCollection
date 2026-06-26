import { Fragment, useCallback, useEffect, useState } from "react";
import { RARITIES, SERIES, charactersFor } from "../../../seed/catalog-def";
import type { CardRow, Rarity } from "../../shared/types";
import { listCards, patchCard, postTransaction } from "../api";

type ActionKind = "list_sale" | "list_trade" | "sale" | "trade";

const STATUS_LABEL: Record<string, string> = {
  owned: "持有",
  for_sale: "待售",
  for_trade: "待換",
  sold: "已售出",
  traded: "已交換",
};

function ActionForm({
  card,
  kind,
  onDone,
  onCancel,
}: {
  card: CardRow;
  kind: ActionKind;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [price, setPrice] = useState("");
  const [want, setWant] = useState("");
  const [counterparty, setCounterparty] = useState("");
  const [happenedAt, setHappenedAt] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const [rSeries, setRSeries] = useState(SERIES[0]);
  const rChars = charactersFor(rSeries);
  const [rChar, setRChar] = useState(rChars[0]);
  const [rRarity, setRRarity] = useState<Rarity>("R");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setErr(null);
    try {
      if (kind === "list_sale") {
        await patchCard(card.id, {
          status: "for_sale",
          askingPrice: price ? Number(price) : null,
        });
      } else if (kind === "list_trade") {
        await patchCard(card.id, {
          status: "for_trade",
          wantInReturn: want || null,
        });
      } else if (kind === "sale") {
        await postTransaction({
          cardId: card.id,
          type: "sale",
          price: price ? Number(price) : undefined,
          counterparty: counterparty || undefined,
          happenedAt,
        });
      } else {
        await postTransaction({
          cardId: card.id,
          type: "trade",
          counterparty: counterparty || undefined,
          happenedAt,
          receivedSeries: rSeries,
          receivedCharacter: rChar,
          receivedRarity: rRarity,
        });
      }
      onDone();
    } catch (e) {
      setErr(String(e));
      setBusy(false);
    }
  };

  return (
    <div className="action-form">
      <div className="inline-fields">
        {kind === "list_sale" || kind === "sale" ? (
          <label className="field">
            <span className="field-label">價格 (TWD)</span>
            <input
              type="number"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
            />
          </label>
        ) : null}
        {kind === "list_trade" ? (
          <label className="field">
            <span className="field-label">想換的卡 / 條件</span>
            <input
              value={want}
              onChange={(e) => setWant(e.target.value)}
              placeholder="例如 KILLER Kirari UR"
            />
          </label>
        ) : null}
        {kind === "sale" || kind === "trade" ? (
          <>
            <label className="field">
              <span className="field-label">對象</span>
              <input
                value={counterparty}
                onChange={(e) => setCounterparty(e.target.value)}
              />
            </label>
            <label className="field">
              <span className="field-label">日期</span>
              <input
                type="date"
                value={happenedAt}
                onChange={(e) => setHappenedAt(e.target.value)}
              />
            </label>
          </>
        ) : null}
        {kind === "trade" ? (
          <>
            <label className="field">
              <span className="field-label">換得系列</span>
              <select
                value={rSeries}
                onChange={(e) => {
                  setRSeries(e.target.value);
                  setRChar(charactersFor(e.target.value)[0]);
                }}
              >
                {SERIES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span className="field-label">換得角色</span>
              <select value={rChar} onChange={(e) => setRChar(e.target.value)}>
                {rChars.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span className="field-label">稀有度</span>
              <select
                value={rRarity}
                onChange={(e) => setRRarity(e.target.value as Rarity)}
              >
                {RARITIES.map((rr) => (
                  <option key={rr} value={rr}>
                    {rr}
                  </option>
                ))}
              </select>
            </label>
          </>
        ) : null}
        <button
          type="button"
          className="btn btn-primary btn-sm"
          onClick={submit}
          disabled={busy}
        >
          {busy ? "處理中…" : "確認"}
        </button>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={onCancel}
        >
          取消
        </button>
      </div>
      {err ? (
        <div className="error-text" style={{ marginTop: 8 }}>
          {err}
        </div>
      ) : null}
    </div>
  );
}

export function ManageCards() {
  const [filterSeries, setFilterSeries] = useState("");
  const [filterStatus, setFilterStatus] = useState("active");
  const [rows, setRows] = useState<CardRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [action, setAction] = useState<{
    cardId: number;
    kind: ActionKind;
  } | null>(null);

  const reload = useCallback(() => {
    setRows(null);
    setError(null);
    listCards({
      series: filterSeries || undefined,
      status: filterStatus || undefined,
    })
      .then(setRows)
      .catch((e) => setError(String(e)));
  }, [filterSeries, filterStatus]);

  useEffect(() => {
    reload();
  }, [reload]);

  const onDone = () => {
    setAction(null);
    reload();
  };

  return (
    <section className="panel">
      <h2 className="panel-title">卡片管理</h2>
      <div className="filters">
        <label className="field">
          <span className="field-label">系列</span>
          <select
            value={filterSeries}
            onChange={(e) => setFilterSeries(e.target.value)}
          >
            <option value="">全部系列</option>
            {SERIES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span className="field-label">狀態</span>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
          >
            <option value="active">持有中（可管理）</option>
            <option value="for_sale">待售</option>
            <option value="for_trade">待換</option>
            <option value="owned">純持有</option>
            <option value="sold">已售出</option>
            <option value="traded">已交換</option>
          </select>
        </label>
      </div>

      {error ? <div className="error-text">{error}</div> : null}
      {rows === null ? (
        <div className="state-msg">載入中…</div>
      ) : rows.length === 0 ? (
        <div className="trade-empty">沒有符合的卡片。</div>
      ) : (
        <table className="admin-table">
          <thead>
            <tr>
              <th>系列</th>
              <th>角色</th>
              <th>稀有度</th>
              <th>狀態</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((card) => {
              const isActive =
                card.status === "owned" ||
                card.status === "for_sale" ||
                card.status === "for_trade";
              const open = action?.cardId === card.id;
              return (
                <Fragment key={card.id}>
                  <tr>
                    <td>{card.series}</td>
                    <td>{card.character}</td>
                    <td>
                      <span className={`pill ${card.rarity.toLowerCase()}`}>
                        {card.rarity}
                      </span>
                    </td>
                    <td>
                      <span className={`pill ${card.status}`}>
                        {STATUS_LABEL[card.status]}
                      </span>
                      {card.duplicate && isActive ? (
                        <span className="pill dup" style={{ marginLeft: 6 }}>
                          重複
                        </span>
                      ) : null}
                      {card.status === "for_sale" &&
                      card.askingPrice != null ? (
                        <span className="mono" style={{ marginLeft: 8 }}>
                          {card.askingPrice} 元
                        </span>
                      ) : null}
                      {card.status === "for_trade" && card.wantInReturn ? (
                        <span
                          style={{
                            marginLeft: 8,
                            color: "var(--text-tertiary)",
                          }}
                        >
                          想換：{card.wantInReturn}
                        </span>
                      ) : null}
                    </td>
                    <td>
                      {isActive ? (
                        <div className="row-actions">
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            onClick={() =>
                              setAction({ cardId: card.id, kind: "list_sale" })
                            }
                          >
                            待售
                          </button>
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            onClick={() =>
                              setAction({ cardId: card.id, kind: "list_trade" })
                            }
                          >
                            待換
                          </button>
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            onClick={() =>
                              setAction({ cardId: card.id, kind: "sale" })
                            }
                          >
                            賣出
                          </button>
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            onClick={() =>
                              setAction({ cardId: card.id, kind: "trade" })
                            }
                          >
                            交換
                          </button>
                          {card.status !== "owned" ? (
                            <button
                              type="button"
                              className="btn btn-ghost btn-sm"
                              onClick={() => {
                                patchCard(card.id, { status: "owned" })
                                  .then(reload)
                                  .catch(() => {});
                              }}
                            >
                              取消上架
                            </button>
                          ) : null}
                        </div>
                      ) : (
                        <span style={{ color: "var(--text-quaternary)" }}>
                          —
                        </span>
                      )}
                    </td>
                  </tr>
                  {open && action ? (
                    <tr>
                      <td colSpan={5}>
                        <ActionForm
                          card={card}
                          kind={action.kind}
                          onDone={onDone}
                          onCancel={() => setAction(null)}
                        />
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      )}
    </section>
  );
}
