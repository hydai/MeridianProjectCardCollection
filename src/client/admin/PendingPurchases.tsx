import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { todayLocal } from "@/lib/date";
import { cn } from "@/lib/utils";
import { EMPTY_MSG, STATE_MSG } from "@/shared/states";
import { useCallback, useEffect, useRef, useState } from "react";
import type {
  AdminPendingPurchase,
  CatalogSeries,
  CreatePurchaseReservationInput,
  Rarity,
} from "../../shared/types";
import {
  cancelPendingPurchase,
  completePendingPurchase,
  fetchAdminPendingPurchases,
  fetchCatalog,
  postPurchaseReservation,
} from "../api";
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
  PANEL,
  PANEL_TITLE,
  PILL_BASE,
  PILL_RESERVED,
  ROW_ACTIONS,
  TABLE,
  TD,
  TH,
} from "./ui";

interface LineDraft {
  key: number;
  series: string;
  character: string;
  rarity: Rarity;
  qty: number;
  unitPrice: string;
}

function firstLine(catalog: CatalogSeries[], key: number): LineDraft | null {
  const series = catalog.find(
    (item) => item.characters.length > 0 && item.rarities.length > 0,
  );
  const character = series?.characters[0];
  const rarity = series?.rarities[0];
  if (!series || !character || !rarity) return null;
  return {
    key,
    series: series.name,
    character,
    rarity,
    qty: 1,
    unitPrice: "",
  };
}

function PurchaseLineEditor({
  catalog,
  drafts,
  setDrafts,
}: {
  catalog: CatalogSeries[];
  drafts: LineDraft[];
  setDrafts: (drafts: LineDraft[]) => void;
}) {
  const add = () => {
    const next = firstLine(
      catalog,
      drafts.reduce((max, draft) => Math.max(max, draft.key), 0) + 1,
    );
    if (next) setDrafts([...drafts, next]);
  };
  const update = (key: number, patch: Partial<LineDraft>) =>
    setDrafts(
      drafts.map((draft) =>
        draft.key === key ? { ...draft, ...patch } : draft,
      ),
    );
  const remove = (key: number) =>
    setDrafts(drafts.filter((draft) => draft.key !== key));

  return (
    <div className={LINE_EDITOR}>
      <div className={LINE_EDITOR_HEAD}>
        <span className={FIELD_LABEL}>卡片</span>
        <Button
          type="button"
          variant="outline"
          className={BTN_GHOST_SM}
          onClick={add}
          disabled={catalog.length === 0}
        >
          ＋ 新增卡片
        </Button>
      </div>
      {drafts.length === 0 ? (
        <p className="text-[13px] text-[var(--text-tertiary)]">
          尚未加入卡片。
        </p>
      ) : null}
      {drafts.map((draft, index) => {
        const selectedSeries = catalog.find(
          (item) => item.name === draft.series,
        );
        const unitPrice = Number(draft.unitPrice);
        const unitPriceInvalid =
          draft.unitPrice !== "" &&
          (!Number.isFinite(unitPrice) || unitPrice < 0);

        return (
          <fieldset
            className="mt-2 grid grid-cols-[minmax(140px,1.3fr)_minmax(120px,1fr)_80px_72px_110px_auto] items-end gap-2 border-0 p-0 max-[760px]:grid-cols-2"
            key={draft.key}
          >
            <legend className="sr-only">卡片 {index + 1}</legend>
            <label className={FIELD}>
              <span className={FIELD_LABEL}>系列</span>
              <select
                className={CONTROL}
                value={draft.series}
                onChange={(event) => {
                  const nextSeries = catalog.find(
                    (item) => item.name === event.target.value,
                  );
                  const character = nextSeries?.characters[0];
                  const rarity = nextSeries?.rarities[0];
                  if (!nextSeries || !character || !rarity) return;
                  update(draft.key, {
                    series: nextSeries.name,
                    character,
                    rarity,
                  });
                }}
              >
                {catalog.map((item) => (
                  <option key={item.name} value={item.name}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
            <label className={FIELD}>
              <span className={FIELD_LABEL}>角色</span>
              <select
                className={CONTROL}
                value={draft.character}
                onChange={(event) =>
                  update(draft.key, { character: event.target.value })
                }
              >
                {selectedSeries?.characters.map((character) => (
                  <option key={character} value={character}>
                    {character}
                  </option>
                ))}
              </select>
            </label>
            <label className={FIELD}>
              <span className={FIELD_LABEL}>稀有度</span>
              <select
                className={CONTROL}
                value={draft.rarity}
                onChange={(event) =>
                  update(draft.key, { rarity: event.target.value as Rarity })
                }
              >
                {selectedSeries?.rarities.map((rarity) => (
                  <option key={rarity} value={rarity}>
                    {rarity}
                  </option>
                ))}
              </select>
            </label>
            <label className={FIELD}>
              <span className={FIELD_LABEL}>數量</span>
              <Input
                type="number"
                min={1}
                max={99}
                inputMode="numeric"
                className={CONTROL}
                value={draft.qty}
                onChange={(event) =>
                  update(draft.key, {
                    qty: Math.max(
                      1,
                      Math.min(99, Math.trunc(Number(event.target.value)) || 1),
                    ),
                  })
                }
              />
            </label>
            <label className={FIELD}>
              <span className={FIELD_LABEL}>單價 (TWD)</span>
              <Input
                type="number"
                min={0}
                inputMode="decimal"
                className={CONTROL}
                value={draft.unitPrice}
                onChange={(event) =>
                  update(draft.key, { unitPrice: event.target.value })
                }
                placeholder="必填"
                aria-invalid={unitPriceInvalid}
              />
            </label>
            <Button
              type="button"
              variant="outline"
              className={cn(BTN_GHOST_SM, "max-[760px]:justify-self-start")}
              onClick={() => remove(draft.key)}
              aria-label={`移除卡片 ${index + 1}`}
            >
              移除
            </Button>
          </fieldset>
        );
      })}
    </div>
  );
}

function PurchaseReservationForm({
  catalog,
  onDone,
}: {
  catalog: CatalogSeries[];
  onDone: () => void;
}) {
  const [seller, setSeller] = useState("");
  const [orderedAt, setOrderedAt] = useState(todayLocal);
  const [note, setNote] = useState("");
  const [lines, setLines] = useState<LineDraft[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const linesValid =
    lines.length > 0 &&
    lines.every((line) => {
      const unitPrice = Number(line.unitPrice);
      return (
        Number.isInteger(line.qty) &&
        line.qty > 0 &&
        line.unitPrice.trim() !== "" &&
        Number.isFinite(unitPrice) &&
        unitPrice >= 0
      );
    });

  const submit = async () => {
    if (!orderedAt || !linesValid) return;
    setBusy(true);
    setError(null);
    const input: CreatePurchaseReservationInput = {
      seller: seller.trim() || undefined,
      orderedAt,
      note: note.trim() || undefined,
      lines: lines.map((line) => ({
        series: line.series,
        character: line.character,
        rarity: line.rarity,
        qty: line.qty,
        unitPrice: Number(line.unitPrice),
      })),
    };
    try {
      await postPurchaseReservation(input);
      setSeller("");
      setNote("");
      setLines([]);
      onDone();
    } catch (reason) {
      setError(String(reason));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={ACTION_FORM}>
      <div className={INLINE_FIELDS}>
        <label className={FIELD}>
          <span className={FIELD_LABEL}>賣家</span>
          <Input
            className={CONTROL}
            value={seller}
            onChange={(event) => setSeller(event.target.value)}
          />
        </label>
        <label className={FIELD}>
          <span className={FIELD_LABEL}>訂購日期</span>
          <Input
            type="date"
            className={CONTROL}
            value={orderedAt}
            onChange={(event) => setOrderedAt(event.target.value)}
          />
        </label>
        <label className={FIELD}>
          <span className={FIELD_LABEL}>備註</span>
          <Input
            className={CONTROL}
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
        </label>
      </div>
      <PurchaseLineEditor
        catalog={catalog}
        drafts={lines}
        setDrafts={setLines}
      />
      <div className={cn(INLINE_FIELDS, "mt-3")}>
        <Button
          type="button"
          className={BTN_PRIMARY_SM}
          onClick={submit}
          disabled={busy || !orderedAt || !linesValid}
        >
          {busy ? "處理中…" : "新增購入預約"}
        </Button>
        {!orderedAt ? (
          <span className={ERROR_TEXT} role="alert">
            訂購日期為必填
          </span>
        ) : null}
        {lines.length > 0 && !linesValid ? (
          <span className={ERROR_TEXT} role="alert">
            每筆卡片都需要有效的數量與單價
          </span>
        ) : null}
      </div>
      {error ? (
        <div className={cn(ERROR_TEXT, "mt-2")} role="alert">
          {error}
        </div>
      ) : null}
    </div>
  );
}

function formatPrice(value: number) {
  return `${new Intl.NumberFormat("zh-TW", {
    maximumFractionDigits: 2,
  }).format(value)} 元`;
}

function PendingPurchaseRow({
  purchase,
  onChange,
}: {
  purchase: AdminPendingPurchase;
  onChange: (id: number) => void;
}) {
  const [confirming, setConfirming] = useState<"complete" | "cancel" | null>(
    null,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const rowRef = useRef<HTMLTableRowElement>(null);
  const restoreFocus = useRef<"complete" | "cancel" | null>(null);
  const totalQty = purchase.lines.reduce((sum, line) => sum + line.qty, 0);
  const total = purchase.lines.reduce(
    (sum, line) => sum + line.qty * line.unitPrice,
    0,
  );
  const summary =
    purchase.lines
      .map(
        (line) =>
          `${line.series} ${line.character} ${line.rarity}×${line.qty}（每張 ${formatPrice(line.unitPrice)}）`,
      )
      .join("、") || "—";

  const run = async (request: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await request();
      onChange(purchase.id);
    } catch (reason) {
      setError(String(reason));
      setBusy(false);
      restoreFocus.current = confirming;
      setConfirming(null);
    }
  };

  useEffect(() => {
    if (confirming) {
      rowRef.current
        ?.querySelector<HTMLButtonElement>('[data-purchase-action="confirm"]')
        ?.focus();
      return;
    }
    const trigger = restoreFocus.current;
    restoreFocus.current = null;
    if (trigger) {
      rowRef.current
        ?.querySelector<HTMLButtonElement>(
          `[data-purchase-action="${trigger}"]`,
        )
        ?.focus();
    }
  }, [confirming]);

  const closeConfirmation = () => {
    restoreFocus.current = confirming;
    setConfirming(null);
  };

  return (
    <tr ref={rowRef}>
      <td className={TD}>{purchase.orderedAt}</td>
      <td className={TD}>{purchase.seller ?? "—"}</td>
      <td className={TD}>{summary}</td>
      <td className={TD}>{formatPrice(total)}</td>
      <td className={TD}>
        <span className={cn(PILL_BASE, PILL_RESERVED)}>待收件</span>
      </td>
      <td className={TD}>{purchase.note ?? "—"}</td>
      <td
        className={cn(
          TD,
          "sticky right-0 min-w-[160px] bg-card shadow-[-8px_0_12px_-12px_rgba(0,0,0,0.8)]",
        )}
      >
        {confirming ? (
          <fieldset className="flex min-w-[180px] flex-col items-start gap-2 border-0 p-0">
            <legend className="sr-only">
              {confirming === "complete" ? "確認收貨" : "確認取消預約"}
            </legend>
            <span className="text-xs leading-5 text-foreground">
              {confirming === "complete"
                ? `確認已收到 ${totalQty} 張卡片並加入收藏？`
                : "確認取消這筆購入預約？"}
            </span>
            <div className={ROW_ACTIONS}>
              <Button
                data-purchase-action="confirm"
                type="button"
                className={BTN_PRIMARY_SM}
                disabled={busy}
                onClick={() =>
                  run(() =>
                    confirming === "complete"
                      ? completePendingPurchase(purchase.id)
                      : cancelPendingPurchase(purchase.id),
                  )
                }
              >
                {busy
                  ? "處理中…"
                  : confirming === "complete"
                    ? "確定收貨"
                    : "確定取消"}
              </Button>
              <Button
                type="button"
                variant="outline"
                className={BTN_GHOST_SM}
                disabled={busy}
                onClick={closeConfirmation}
              >
                返回
              </Button>
            </div>
          </fieldset>
        ) : (
          <div className={ROW_ACTIONS}>
            <Button
              data-purchase-action="complete"
              type="button"
              className={BTN_PRIMARY_SM}
              onClick={() => setConfirming("complete")}
            >
              確認收貨
            </Button>
            <Button
              data-purchase-action="cancel"
              type="button"
              variant="outline"
              className={BTN_GHOST_SM}
              onClick={() => setConfirming("cancel")}
            >
              取消預約
            </Button>
          </div>
        )}
        {error ? (
          <div className={cn(ERROR_TEXT, "mt-1.5")} role="alert">
            {error}
          </div>
        ) : null}
      </td>
    </tr>
  );
}

export function PendingPurchases() {
  const [catalog, setCatalog] = useState<CatalogSeries[] | null>(null);
  const [pending, setPending] = useState<AdminPendingPurchase[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const requestGeneration = useRef(0);

  const reload = useCallback(() => {
    const generation = ++requestGeneration.current;
    setError(null);
    Promise.all([fetchCatalog(), fetchAdminPendingPurchases()])
      .then(([nextCatalog, nextPending]) => {
        if (generation !== requestGeneration.current) return;
        setCatalog(nextCatalog);
        setPending(nextPending);
      })
      .catch((reason) => {
        if (generation === requestGeneration.current) setError(String(reason));
      });
  }, []);

  useEffect(() => {
    reload();
    return () => {
      requestGeneration.current += 1;
    };
  }, [reload]);

  return (
    <section className={PANEL}>
      <h2 className={PANEL_TITLE}>購入預約</h2>
      <p className="mb-4 text-[13px] text-muted-foreground">
        預約中的卡片不會計入收藏；收到實體卡片後再確認收貨。
      </p>
      {error ? (
        <div className={ERROR_TEXT} role="alert">
          {error}
        </div>
      ) : null}
      {!catalog || !pending ? (
        error ? null : (
          <output className={STATE_MSG}>載入中…</output>
        )
      ) : (
        <>
          <PurchaseReservationForm catalog={catalog} onDone={reload} />
          {pending.length === 0 ? (
            <output className={EMPTY_MSG}>目前沒有待收件的購入預約。</output>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className={cn(TABLE, "min-w-[980px]")}>
                <thead>
                  <tr>
                    <th className={TH}>訂購日期</th>
                    <th className={TH}>賣家</th>
                    <th className={TH}>卡片</th>
                    <th className={TH}>金額合計</th>
                    <th className={TH}>狀態</th>
                    <th className={TH}>備註</th>
                    <th
                      className={cn(
                        TH,
                        "sticky right-0 min-w-[160px] bg-card shadow-[-8px_0_12px_-12px_rgba(0,0,0,0.8)]",
                      )}
                    >
                      操作
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {pending.map((purchase) => (
                    <PendingPurchaseRow
                      key={purchase.id}
                      purchase={purchase}
                      onChange={(id) => {
                        setPending(
                          (current) =>
                            current?.filter((item) => item.id !== id) ?? [],
                        );
                        reload();
                      }}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </section>
  );
}
