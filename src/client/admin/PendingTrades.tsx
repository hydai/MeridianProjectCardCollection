import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { EMPTY_MSG, STATE_MSG } from "@/shared/states";
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
  pendingReceiveByCoord,
  receivableCards,
} from "../collection";
import {
  ACTION_FORM,
  BTN_GHOST_SM,
  BTN_PRIMARY_SM,
  CONTROL,
  ERROR_TEXT,
  FIELD,
  FIELD_LABEL,
  INLINE_FIELDS,
  LINE_EDITOR,
  LINE_EDITOR_HEAD,
  LINE_ROW,
  PANEL,
  PANEL_TITLE,
  ROW_ACTIONS,
  TABLE,
  TD,
  TH,
} from "./ui";

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
    <div className={LINE_EDITOR}>
      <div className={LINE_EDITOR_HEAD}>
        <span className={FIELD_LABEL}>{title}</span>
        <Button
          type="button"
          variant="outline"
          className={BTN_GHOST_SM}
          onClick={add}
          disabled={opts.length === 0}
        >
          ＋ 新增{title}
        </Button>
      </div>
      {drafts.map((d, i) => {
        const opt = opts.find((o) => o.value === d.value);
        const max = opt?.max ?? 1;
        return (
          <div className={LINE_ROW} key={`${title}-${d.value}-${i}`}>
            <select
              className={cn(CONTROL, "min-w-[220px]")}
              value={d.value}
              onChange={(e) => update(i, { value: e.target.value, qty: 1 })}
            >
              {opts.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}（{o.hint}）
                </option>
              ))}
            </select>
            <Input
              type="number"
              min={1}
              max={max}
              className={cn(CONTROL, "w-[72px]")}
              value={d.qty}
              onChange={(e) =>
                update(i, {
                  qty: Math.max(1, Math.min(max, Number(e.target.value) || 1)),
                })
              }
            />
            <Button
              type="button"
              variant="outline"
              className={BTN_GHOST_SM}
              onClick={() => remove(i)}
            >
              移除
            </Button>
          </div>
        );
      })}
    </div>
  );
}

function ReservationForm({
  giveOpts,
  recvOpts,
  onDone,
}: {
  giveOpts: Opt[];
  recvOpts: Opt[];
  onDone: () => void;
}) {
  const [counterparty, setCounterparty] = useState("");
  const [reservedAt, setReservedAt] = useState(today());
  const [note, setNote] = useState("");
  const [gives, setGives] = useState<LineDraft[]>([]);
  const [receives, setReceives] = useState<LineDraft[]>([]);
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
        receive: toInputs(receives, recvOpts),
      });
      setGives([]);
      setReceives([]);
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
    <div className={ACTION_FORM}>
      <div className={INLINE_FIELDS}>
        <label className={FIELD}>
          <span className={FIELD_LABEL}>對象</span>
          <Input
            className={CONTROL}
            value={counterparty}
            onChange={(e) => setCounterparty(e.target.value)}
          />
        </label>
        <label className={FIELD}>
          <span className={FIELD_LABEL}>日期</span>
          <Input
            type="date"
            className={CONTROL}
            value={reservedAt}
            onChange={(e) => setReservedAt(e.target.value)}
          />
        </label>
        <label className={FIELD}>
          <span className={FIELD_LABEL}>備註</span>
          <Input
            className={CONTROL}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </label>
      </div>
      <LineEditor
        title="給出"
        opts={giveOpts}
        drafts={gives}
        setDrafts={setGives}
      />
      <LineEditor
        title="換入"
        opts={recvOpts}
        drafts={receives}
        setDrafts={setReceives}
      />
      <div className={INLINE_FIELDS}>
        <Button
          type="button"
          className={BTN_PRIMARY_SM}
          onClick={submit}
          disabled={busy}
        >
          {busy ? "處理中…" : "新增預約"}
        </Button>
      </div>
      {err ? <div className={cn(ERROR_TEXT, "mt-2")}>{err}</div> : null}
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
      <td className={TD}>{p.reservedAt}</td>
      <td className={TD}>{p.counterparty ?? "—"}</td>
      <td className={TD}>{summary(p.give)}</td>
      <td className={TD}>{summary(p.receive)}</td>
      <td className={TD}>
        {completing ? (
          <div className={INLINE_FIELDS}>
            <Input
              type="date"
              className={CONTROL}
              value={happenedAt}
              onChange={(e) => setHappenedAt(e.target.value)}
            />
            <Button
              type="button"
              className={BTN_PRIMARY_SM}
              disabled={busy}
              onClick={() => run(() => completeReservation(p.id, happenedAt))}
            >
              確認完成
            </Button>
            <Button
              type="button"
              variant="outline"
              className={BTN_GHOST_SM}
              onClick={() => setCompleting(false)}
            >
              返回
            </Button>
          </div>
        ) : (
          <div className={ROW_ACTIONS}>
            <Button
              type="button"
              variant="outline"
              className={BTN_GHOST_SM}
              onClick={() => setCompleting(true)}
            >
              完成
            </Button>
            <Button
              type="button"
              variant="outline"
              className={BTN_GHOST_SM}
              disabled={busy}
              onClick={() => run(() => cancelReservation(p.id))}
            >
              取消
            </Button>
          </div>
        )}
        {err ? <div className={cn(ERROR_TEXT, "mt-1.5")}>{err}</div> : null}
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

  const { giveOpts, recvOpts } = useMemo(() => {
    if (!m || !pending) return { giveOpts: [] as Opt[], recvOpts: [] as Opt[] };
    const { surplus } = computeTrade(m);
    const incoming = pendingReceiveByCoord(m, pending);
    return {
      giveOpts: surplus.map((t) => toOpt(m, t, t.spare)),
      // One unified 換入 list over the whole catalog: 持有 N for cards you hold,
      // 缺 for missing ones, plus ・已預定換入 M when another pending trade is
      // already bringing it in (so a card never hides between two sub-lists).
      recvOpts: receivableCards(m).map((t) => {
        const p = incoming.get(`${t.si}|${t.ci}|${t.ri}`) ?? 0;
        const base = t.spare >= 1 ? `持有 ${t.spare}` : "缺";
        return toOpt(
          m,
          t,
          RECEIVE_QTY_CAP,
          p > 0 ? `${base}・已預定換入 ${p}` : base,
        );
      }),
    };
  }, [m, pending]);

  return (
    <section className={PANEL}>
      <h2 className={PANEL_TITLE}>交換預約</h2>
      {error ? <div className={ERROR_TEXT}>{error}</div> : null}
      {!m || !pending ? (
        <div className={STATE_MSG}>載入中…</div>
      ) : (
        <>
          <ReservationForm
            giveOpts={giveOpts}
            recvOpts={recvOpts}
            onDone={reload}
          />
          {pending.length === 0 ? (
            <div className={EMPTY_MSG}>目前沒有暫定交換。</div>
          ) : (
            <table className={cn(TABLE, "mt-4")}>
              <thead>
                <tr>
                  <th className={TH}>日期</th>
                  <th className={TH}>對象</th>
                  <th className={TH}>給出</th>
                  <th className={TH}>換入</th>
                  <th className={TH}>操作</th>
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
