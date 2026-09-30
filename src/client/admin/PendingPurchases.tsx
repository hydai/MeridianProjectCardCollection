import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Empty, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { todayLocal } from "@/lib/date";
import { STATE_MSG } from "@/shared/states";
import { useCallback, useEffect, useId, useRef, useState } from "react";
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
  const editorId = useId();
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
    <FieldSet>
      <FieldLegend>購買卡片</FieldLegend>
      <Button
        type="button"
        variant="outline"
        className="self-start"
        onClick={add}
        disabled={catalog.length === 0}
      >
        ＋ 新增卡片
      </Button>
      {drafts.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>尚未加入卡片。</EmptyTitle>
          </EmptyHeader>
        </Empty>
      ) : null}
      {drafts.map((draft, index) => {
        const selectedSeries = catalog.find(
          (item) => item.name === draft.series,
        );
        const unitPrice = Number(draft.unitPrice);
        const unitPriceInvalid =
          draft.unitPrice !== "" &&
          (!Number.isFinite(unitPrice) || unitPrice < 0);
        const lineId = `${editorId}-${draft.key}`;

        return (
          <FieldSet
            className="min-w-0 rounded-lg border border-border p-4"
            key={draft.key}
          >
            <FieldLegend variant="label">卡片 {index + 1}</FieldLegend>
            <FieldGroup className="grid grid-cols-2 gap-3 [container-type:normal] sm:grid-cols-3">
              <Field className="col-span-2 min-w-0 sm:col-span-1">
                <FieldLabel htmlFor={`${lineId}-series`}>系列</FieldLabel>
                <NativeSelect
                  id={`${lineId}-series`}
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
                    <NativeSelectOption key={item.name} value={item.name}>
                      {item.name}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </Field>
              <Field className="min-w-0">
                <FieldLabel htmlFor={`${lineId}-character`}>角色</FieldLabel>
                <NativeSelect
                  id={`${lineId}-character`}
                  value={draft.character}
                  onChange={(event) =>
                    update(draft.key, { character: event.target.value })
                  }
                >
                  {selectedSeries?.characters.map((character) => (
                    <NativeSelectOption key={character} value={character}>
                      {character}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </Field>
              <Field className="min-w-0">
                <FieldLabel htmlFor={`${lineId}-rarity`}>稀有度</FieldLabel>
                <NativeSelect
                  id={`${lineId}-rarity`}
                  value={draft.rarity}
                  onChange={(event) =>
                    update(draft.key, { rarity: event.target.value as Rarity })
                  }
                >
                  {selectedSeries?.rarities.map((rarity) => (
                    <NativeSelectOption key={rarity} value={rarity}>
                      {rarity}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </Field>
              <Field className="min-w-0">
                <FieldLabel htmlFor={`${lineId}-qty`}>數量</FieldLabel>
                <Input
                  id={`${lineId}-qty`}
                  type="number"
                  min={1}
                  max={99}
                  inputMode="numeric"
                  value={draft.qty}
                  onChange={(event) =>
                    update(draft.key, {
                      qty: Math.max(
                        1,
                        Math.min(
                          99,
                          Math.trunc(Number(event.target.value)) || 1,
                        ),
                      ),
                    })
                  }
                />
              </Field>
              <Field className="min-w-0" data-invalid={unitPriceInvalid}>
                <FieldLabel htmlFor={`${lineId}-price`}>單價 (TWD)</FieldLabel>
                <Input
                  id={`${lineId}-price`}
                  type="number"
                  min={0}
                  step="any"
                  inputMode="decimal"
                  value={draft.unitPrice}
                  onChange={(event) =>
                    update(draft.key, { unitPrice: event.target.value })
                  }
                  placeholder="必填"
                  aria-invalid={unitPriceInvalid}
                />
              </Field>
              <Button
                type="button"
                variant="outline"
                className="self-end justify-self-start"
                onClick={() => remove(draft.key)}
                aria-label={`移除卡片 ${index + 1}`}
              >
                移除
              </Button>
            </FieldGroup>
          </FieldSet>
        );
      })}
    </FieldSet>
  );
}

function PurchaseReservationForm({
  catalog,
  onDone,
}: {
  catalog: CatalogSeries[];
  onDone: () => void;
}) {
  const formId = useId();
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

  const totalQty = lines.reduce((sum, line) => sum + line.qty, 0);
  const total = lines.reduce(
    (sum, line) => sum + line.qty * Number(line.unitPrice),
    0,
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>建立購入預約</CardTitle>
        <CardDescription>
          同一位賣家的卡片可合併成一筆。填寫購入數量與單價，收到卡片後再確認收貨。
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="flex flex-col gap-5"
          onSubmit={(event) => {
            event.preventDefault();
            if (!busy) void submit();
          }}
        >
          <FieldSet disabled={busy}>
            <FieldLegend className="sr-only">購入預約資料</FieldLegend>
            <FieldGroup className="grid gap-4 [container-type:normal] sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor={`${formId}-seller`}>賣家</FieldLabel>
                <Input
                  id={`${formId}-seller`}
                  value={seller}
                  onChange={(event) => setSeller(event.target.value)}
                  placeholder="暱稱或聯絡名稱，選填"
                />
                <FieldDescription>僅後台可見。</FieldDescription>
              </Field>
              <Field data-invalid={!orderedAt}>
                <FieldLabel htmlFor={`${formId}-date`}>訂購日期</FieldLabel>
                <Input
                  id={`${formId}-date`}
                  type="date"
                  value={orderedAt}
                  onChange={(event) => setOrderedAt(event.target.value)}
                  aria-invalid={!orderedAt}
                  aria-describedby={
                    !orderedAt ? `${formId}-date-error` : undefined
                  }
                />
                {!orderedAt ? (
                  <FieldError id={`${formId}-date-error`}>
                    訂購日期為必填
                  </FieldError>
                ) : null}
              </Field>
            </FieldGroup>
            <PurchaseLineEditor
              catalog={catalog}
              drafts={lines}
              setDrafts={setLines}
            />
            <Field>
              <FieldLabel htmlFor={`${formId}-note`}>備註</FieldLabel>
              <Textarea
                id={`${formId}-note`}
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder="付款、寄送或面交約定，選填，僅後台可見"
              />
            </Field>
          </FieldSet>
          <output className="text-sm" aria-live="polite">
            已選 {totalQty} 張 · 購入總額{" "}
            {linesValid ? formatPrice(total) : "待填寫"}
          </output>
          {lines.length > 0 && !linesValid ? (
            <FieldError>每筆卡片都需要有效的數量與單價</FieldError>
          ) : null}
          {error ? (
            <Alert variant="destructive">
              <AlertTitle>無法建立購入預約</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
          <Button type="submit" disabled={busy || !orderedAt || !linesValid}>
            {busy ? "處理中…" : "新增購入預約"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function formatPrice(value: number) {
  return `${new Intl.NumberFormat("zh-TW", {
    maximumFractionDigits: 2,
  }).format(value)} 元`;
}

function PendingPurchaseReservation({
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
  const reservationRef = useRef<HTMLElement>(null);
  const restoreFocus = useRef<"complete" | "cancel" | null>(null);
  const totalQty = purchase.lines.reduce((sum, line) => sum + line.qty, 0);
  const total = purchase.lines.reduce(
    (sum, line) => sum + line.qty * line.unitPrice,
    0,
  );

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
      reservationRef.current
        ?.querySelector<HTMLButtonElement>('[data-purchase-action="confirm"]')
        ?.focus();
      return;
    }
    const trigger = restoreFocus.current;
    restoreFocus.current = null;
    if (trigger) {
      reservationRef.current
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
    <article ref={reservationRef} aria-label={`購入預約 #${purchase.id}`}>
      <Card size="sm">
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center justify-between gap-2">
            <span className="min-w-0 wrap-anywhere">
              {purchase.seller || "未填賣家"}
            </span>
            <Badge variant="secondary">待收件</Badge>
          </CardTitle>
          <CardDescription>
            預約 #{purchase.id} · {purchase.orderedAt} · {totalQty} 張 ·{" "}
            {formatPrice(total)}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <ul className="flex flex-col gap-2">
            {purchase.lines.map((line, index) => (
              <li
                key={`${line.catalogId}-${index}`}
                className="flex flex-wrap justify-between gap-1 text-sm"
              >
                <span className="min-w-0 wrap-anywhere">
                  {line.series} · {line.character} · {line.rarity}
                </span>
                <span className="text-muted-foreground">
                  {line.qty} 張 × {formatPrice(line.unitPrice)}
                </span>
              </li>
            ))}
          </ul>
          {purchase.note ? (
            <p className="whitespace-pre-wrap wrap-anywhere text-sm text-muted-foreground">
              {purchase.note}
            </p>
          ) : null}
          {error ? (
            <Alert variant="destructive">
              <AlertTitle>無法更新購入預約</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
        </CardContent>
        <CardFooter>
          {confirming ? (
            <FieldSet className="w-full">
              <FieldLegend className="sr-only">
                {confirming === "complete" ? "確認收貨" : "確認取消預約"}
              </FieldLegend>
              <p className="text-sm">
                {confirming === "complete"
                  ? `確認已收到 ${totalQty} 張卡片並加入收藏？`
                  : "確認取消這筆購入預約？"}
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  data-purchase-action="confirm"
                  type="button"
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
                  disabled={busy}
                  onClick={closeConfirmation}
                >
                  返回
                </Button>
              </div>
            </FieldSet>
          ) : (
            <div className="flex flex-wrap gap-2">
              <Button
                data-purchase-action="complete"
                type="button"
                onClick={() => setConfirming("complete")}
              >
                確認收貨
              </Button>
              <Button
                data-purchase-action="cancel"
                type="button"
                variant="outline"
                onClick={() => setConfirming("cancel")}
              >
                取消預約
              </Button>
            </div>
          )}
        </CardFooter>
      </Card>
    </article>
  );
}

export function PendingPurchases({
  onCountChange,
}: { onCountChange?: (count: number | null) => void }) {
  const [catalog, setCatalog] = useState<CatalogSeries[] | null>(null);
  const [pending, setPending] = useState<AdminPendingPurchase[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const requestGeneration = useRef(0);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (error) onCountChange?.(null);
    else if (pending !== null) onCountChange?.(pending.length);
  }, [pending, error, onCountChange]);

  const reload = useCallback(() => {
    const generation = ++requestGeneration.current;
    setError(null);
    setLoading(true);
    Promise.all([fetchCatalog(), fetchAdminPendingPurchases()])
      .then(([nextCatalog, nextPending]) => {
        if (generation !== requestGeneration.current) return;
        setCatalog(nextCatalog);
        setPending(nextPending);
      })
      .catch((reason) => {
        if (generation === requestGeneration.current) setError(String(reason));
      })
      .finally(() => {
        if (generation === requestGeneration.current) setLoading(false);
      });
  }, []);

  useEffect(() => {
    reload();
    return () => {
      requestGeneration.current += 1;
    };
  }, [reload]);

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-2">
          <h2 className="font-serif text-xl">購入預約</h2>
          <p className="text-sm text-muted-foreground">
            預約中的卡片不會計入收藏；收到實體卡片後再確認收貨。
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={reload}
          disabled={loading}
        >
          重新整理
        </Button>
      </div>
      {error ? (
        <Alert variant="destructive">
          <AlertTitle>無法載入購入預約</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      {!catalog || !pending ? (
        <output className={STATE_MSG}>
          {loading ? "載入中…" : "請重新整理後再試。"}
        </output>
      ) : (
        <>
          <PurchaseReservationForm catalog={catalog} onDone={reload} />
          <section
            aria-label="進行中的購入預約"
            className="flex flex-col gap-4"
          >
            <h3 className="text-lg">待收件 · {pending.length} 筆</h3>
            {pending.length === 0 ? (
              <Empty>
                <EmptyHeader>
                  <EmptyTitle>目前沒有待收件的購入預約。</EmptyTitle>
                </EmptyHeader>
              </Empty>
            ) : (
              pending.map((purchase) => (
                <PendingPurchaseReservation
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
              ))
            )}
          </section>
        </>
      )}
    </section>
  );
}
