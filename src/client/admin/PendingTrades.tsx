import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  AdminPendingTrade,
  Rarity,
  ReservationLineInput,
} from "../../shared/types";
import {
  cancelReservation,
  completeReservation,
  fetchAdminPendingTrades,
  fetchOverview,
  postReservation,
} from "../api";
import {
  type Matrix,
  RARITIES,
  type TradeItem,
  buildMatrix,
  computeTrade,
  ownedReceivable,
  pendingReceiveByCoord,
} from "../collection";

const today = () => new Date().toISOString().slice(0, 10);

// Already-owned cards have no natural receive cap; clamp the number input here.
const RECEIVE_QTY_CAP = 99;

interface Opt {
  value: string; // "si|ci|ri"
  label: string;
  series: string;
  character: string;
  rarity: Rarity;
  max: number;
  hint: string; // parenthetical shown in the dropdown, e.g. "餘 3" or "持有 2"
}

function toOpt(m: Matrix, t: TradeItem, max: number, hint?: string): Opt {
  const series = m.series[t.si];
  const character = m.characters[t.ci];
  const rarity = RARITIES[t.ri];
  return {
    value: `${t.si}|${t.ci}|${t.ri}`,
    label: `${series} ${character} ${rarity}`,
    series,
    character,
    rarity,
    max,
    hint: hint ?? `餘 ${max}`,
  };
}

interface LineDraft {
  value: string;
  qty: number;
}

function LineEditor({
  title,
  opts,
  drafts,
  setDrafts,
}: {
  title: string;
  opts: Opt[];
  drafts: LineDraft[];
  setDrafts: (d: LineDraft[]) => void;
}) {
  const add = () => {
    if (opts.length === 0) return;
    setDrafts([...drafts, { value: opts[0].value, qty: 1 }]);
  };
  const update = (i: number, patch: Partial<LineDraft>) =>
    setDrafts(drafts.map((d, j) => (j === i ? { ...d, ...patch } : d)));
  const remove = (i: number) => setDrafts(drafts.filter((_, j) => j !== i));

  return (
    <div className="line-editor">
      <div className="line-editor-head">
        <span className="field-label">{title}</span>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={add}
          disabled={opts.length === 0}
        >
          ＋ 新增{title}
        </button>
      </div>
      {drafts.map((d, i) => {
        const opt = opts.find((o) => o.value === d.value);
        const max = opt?.max ?? 1;
        return (
          <div className="line-row" key={`${title}-${d.value}-${i}`}>
            <select
              value={d.value}
              onChange={(e) => update(i, { value: e.target.value, qty: 1 })}
            >
              {opts.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}（{o.hint}）
                </option>
              ))}
            </select>
            <input
              type="number"
              min={1}
              max={max}
              value={d.qty}
              onChange={(e) =>
                update(i, {
                  qty: Math.max(1, Math.min(max, Number(e.target.value) || 1)),
                })
              }
            />
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => remove(i)}
            >
              移除
            </button>
          </div>
        );
      })}
    </div>
  );
}

function ReservationForm({
  giveOpts,
  recvOpts,
  recvOwnedOpts,
  onDone,
}: {
  giveOpts: Opt[];
  recvOpts: Opt[];
  recvOwnedOpts: Opt[];
  onDone: () => void;
}) {
  const [counterparty, setCounterparty] = useState("");
  const [reservedAt, setReservedAt] = useState(today());
  const [note, setNote] = useState("");
  const [gives, setGives] = useState<LineDraft[]>([]);
  const [receives, setReceives] = useState<LineDraft[]>([]);
  const [receivesOwned, setReceivesOwned] = useState<LineDraft[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const toInputs = (drafts: LineDraft[], opts: Opt[]): ReservationLineInput[] =>
    drafts
      .map((d) => {
        const o = opts.find((x) => x.value === d.value);
        return o
          ? {
              series: o.series,
              character: o.character,
              rarity: o.rarity,
              qty: d.qty,
            }
          : null;
      })
      .filter((x): x is ReservationLineInput => x !== null);

  const submit = async () => {
    setErr(null);
    const give = toInputs(gives, giveOpts);
    if (give.length === 0) {
      setErr("至少要有一張給出");
      return;
    }
    setBusy(true);
    try {
      await postReservation({
        counterparty: counterparty || undefined,
        reservedAt,
        note: note || undefined,
        give,
        receive: [
          ...toInputs(receives, recvOpts),
          ...toInputs(receivesOwned, recvOwnedOpts),
        ],
      });
      setGives([]);
      setReceives([]);
      setReceivesOwned([]);
      setCounterparty("");
      setNote("");
      onDone();
    } catch (e) {
      setErr(String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="action-form">
      <div className="inline-fields">
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
            value={reservedAt}
            onChange={(e) => setReservedAt(e.target.value)}
          />
        </label>
        <label className="field">
          <span className="field-label">備註</span>
          <input value={note} onChange={(e) => setNote(e.target.value)} />
        </label>
      </div>
      <LineEditor
        title="給出"
        opts={giveOpts}
        drafts={gives}
        setDrafts={setGives}
      />
      <LineEditor
        title="換入（缺卡）"
        opts={recvOpts}
        drafts={receives}
        setDrafts={setReceives}
      />
      <LineEditor
        title="換入（我已有的卡）"
        opts={recvOwnedOpts}
        drafts={receivesOwned}
        setDrafts={setReceivesOwned}
      />
      <div className="inline-fields">
        <button
          type="button"
          className="btn btn-primary btn-sm"
          onClick={submit}
          disabled={busy}
        >
          {busy ? "處理中…" : "新增預約"}
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

function PendingRowItem({
  p,
  onChange,
}: {
  p: AdminPendingTrade;
  onChange: () => void;
}) {
  const [completing, setCompleting] = useState(false);
  const [happenedAt, setHappenedAt] = useState(today());
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const summary = (lines: AdminPendingTrade["give"]) =>
    lines
      .map((l) => `${l.series} ${l.character} ${l.rarity}×${l.qty}`)
      .join("、") || "—";

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setErr(null);
    try {
      await fn();
      onChange();
    } catch (e) {
      setErr(String(e));
      setBusy(false);
    }
  };

  return (
    <tr>
      <td>{p.reservedAt}</td>
      <td>{p.counterparty ?? "—"}</td>
      <td>{summary(p.give)}</td>
      <td>{summary(p.receive)}</td>
      <td>
        {completing ? (
          <div className="inline-fields">
            <input
              type="date"
              value={happenedAt}
              onChange={(e) => setHappenedAt(e.target.value)}
            />
            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={busy}
              onClick={() => run(() => completeReservation(p.id, happenedAt))}
            >
              確認完成
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => setCompleting(false)}
            >
              返回
            </button>
          </div>
        ) : (
          <div className="row-actions">
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => setCompleting(true)}
            >
              完成
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              disabled={busy}
              onClick={() => run(() => cancelReservation(p.id))}
            >
              取消
            </button>
          </div>
        )}
        {err ? (
          <div className="error-text" style={{ marginTop: 6 }}>
            {err}
          </div>
        ) : null}
      </td>
    </tr>
  );
}

export function PendingTrades() {
  const [m, setM] = useState<Matrix | null>(null);
  const [pending, setPending] = useState<AdminPendingTrade[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(() => {
    setError(null);
    Promise.all([fetchOverview(), fetchAdminPendingTrades()])
      .then(([ov, pt]) => {
        setM(buildMatrix(ov));
        setPending(pt);
      })
      .catch((e) => setError(String(e)));
  }, []);
  useEffect(() => reload(), [reload]);

  const { giveOpts, recvOpts, recvOwnedOpts } = useMemo(() => {
    if (!m || !pending)
      return {
        giveOpts: [] as Opt[],
        recvOpts: [] as Opt[],
        recvOwnedOpts: [] as Opt[],
      };
    // Needs come from the base trade view, NOT the pending-adjusted one: a card
    // another reservation already plans to receive must stay selectable here
    // (you can line up two trades for the same card). pendingReceiveByCoord only
    // adds a heads-up so you can tell it is already spoken for.
    const { surplus, needs } = computeTrade(m);
    const incoming = pendingReceiveByCoord(m, pending);
    return {
      giveOpts: surplus.map((t) => toOpt(m, t, t.spare)),
      recvOpts: needs.map((t) => {
        const n = incoming.get(`${t.si}|${t.ci}|${t.ri}`) ?? 0;
        return toOpt(m, t, 1, n > 0 ? `缺・已預定換入 ${n}` : "缺");
      }),
      recvOwnedOpts: ownedReceivable(m).map((t) =>
        toOpt(m, t, RECEIVE_QTY_CAP, `持有 ${t.spare}`),
      ),
    };
  }, [m, pending]);

  return (
    <section className="panel">
      <h2 className="panel-title">交換預約</h2>
      {error ? <div className="error-text">{error}</div> : null}
      {!m || !pending ? (
        <div className="state-msg">載入中…</div>
      ) : (
        <>
          <ReservationForm
            giveOpts={giveOpts}
            recvOpts={recvOpts}
            recvOwnedOpts={recvOwnedOpts}
            onDone={reload}
          />
          {pending.length === 0 ? (
            <div className="trade-empty">目前沒有暫定交換。</div>
          ) : (
            <table className="admin-table" style={{ marginTop: 16 }}>
              <thead>
                <tr>
                  <th>日期</th>
                  <th>對象</th>
                  <th>給出</th>
                  <th>換入</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {pending.map((p) => (
                  <PendingRowItem key={p.id} p={p} onChange={reload} />
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
    </section>
  );
}
