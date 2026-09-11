import { CatalogCardVisual } from "@/components/CatalogCardVisual";
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
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import { Field, FieldGroup, FieldLabel, FieldSet } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { todayLocal } from "@/lib/date";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { MAX_CARD_BATCH_SIZE } from "../../shared/card-batch";
import { parseSaleReservationInput } from "../../shared/sale-reservation";
import type {
  AdminPendingSale,
  CardRow,
  OverviewCell,
  OverviewResponse,
} from "../../shared/types";
import {
  cancelSaleReservation,
  completeSaleReservation,
  fetchAdminPendingSales,
  fetchOverview,
  listCards,
  postSaleReservation,
} from "../api";

interface SaleGroup {
  key: string;
  label: string;
  cell: OverviewCell;
  cards: CardRow[];
}

function saleGroups(cards: CardRow[], overview: OverviewResponse): SaleGroup[] {
  const cells = new Map(
    overview.cells.map((cell) => [
      JSON.stringify([cell.series, cell.character, cell.rarity]),
      cell,
    ]),
  );
  const groups = new Map<string, SaleGroup>();
  for (const card of cards) {
    if (card.status !== "for_sale" || card.held || card.reserved) continue;
    const cell = cells.get(
      JSON.stringify([card.series, card.character, card.rarity]),
    );
    if (!cell) continue;
    const key = JSON.stringify([
      cell.catalogId,
      card.askingPrice,
      card.note?.trim() || null,
    ]);
    const existing = groups.get(key);
    if (existing) existing.cards.push(card);
    else
      groups.set(key, {
        key,
        cell,
        cards: [card],
        label: `${card.series} · ${card.character} · ${card.rarity}`,
      });
  }
  return [...groups.values()];
}

const money = (value: number) =>
  `${new Intl.NumberFormat("zh-TW", { maximumFractionDigits: 2 }).format(value)} 元`;
const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

function SaleForm({
  cards,
  overview,
  onCreated,
}: {
  cards: CardRow[];
  overview: OverviewResponse;
  onCreated: () => Promise<void>;
}) {
  const formId = useId();
  const groups = saleGroups(cards, overview);
  const [search, setSearch] = useState("");
  const [selection, setSelection] = useState<
    Record<string, { qty: string; price: string }>
  >({});
  const [counterparty, setCounterparty] = useState("");
  const [reservedAt, setReservedAt] = useState(todayLocal);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const chosen = groups.filter(
    (group) => Number(selection[group.key]?.qty) > 0,
  );
  const quantity = chosen.reduce(
    (total, group) => total + Number(selection[group.key].qty),
    0,
  );
  const amount =
    chosen.reduce(
      (total, group) =>
        total +
        Number(selection[group.key].qty) *
          Math.round(Number(selection[group.key].price) * 100),
      0,
    ) / 100;
  const shown = groups.filter((group) =>
    group.label.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()),
  );
  const change = (group: SaleGroup, field: "qty" | "price", value: string) => {
    setSelection((current) => ({
      ...current,
      [group.key]: {
        ...(current[group.key] ?? {
          qty: "0",
          price:
            group.cards[0].askingPrice == null
              ? ""
              : String(group.cards[0].askingPrice),
        }),
        [field]: value,
      },
    }));
  };
  const submit = async () => {
    if (submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setError(null);
    try {
      const selectedCards = chosen.flatMap((group) => {
        const draft = selection[group.key];
        const qty = Number(draft.qty);
        if (!Number.isInteger(qty) || qty < 1 || qty > group.cards.length)
          throw new Error(`${group.label} 的數量超過可售張數或格式不正確。`);
        if (draft.price.trim() === "")
          throw new Error(`請填寫 ${group.label} 的約定單價。`);
        return group.cards.slice(0, qty).map((card) => ({
          cardId: card.id,
          catalogId: group.cell.catalogId,
          unitPrice: Number(draft.price),
        }));
      });
      const input = parseSaleReservationInput({
        counterparty,
        reservedAt,
        note,
        cards: selectedCards,
      });
      await postSaleReservation(input);
      setSelection({});
      setCounterparty("");
      setNote("");
      await onCreated();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  };
  return (
    <Card>
      <CardHeader>
        <CardTitle>建立出售預約</CardTitle>
        <CardDescription>
          同一位買家的卡片可合併成一筆。約定單價預填上架價格，可依實際約定修改。
        </CardDescription>
      </CardHeader>
      <CardContent>
        {groups.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyTitle>目前沒有可預約的待售卡片</EmptyTitle>
              <EmptyDescription>
                先到卡片管理上架卡片，或取消現有預約以恢復可售數量。
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void submit();
            }}
            className="flex flex-col gap-5"
          >
            <FieldSet disabled={busy}>
              <FieldGroup className="sm:grid sm:grid-cols-2">
                <Field>
                  <FieldLabel htmlFor={`${formId}-buyer`}>
                    買家（選填）
                  </FieldLabel>
                  <Input
                    id={`${formId}-buyer`}
                    value={counterparty}
                    onChange={(e) => setCounterparty(e.target.value)}
                    maxLength={200}
                    placeholder="暱稱或聯絡名稱，僅後台可見"
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor={`${formId}-date`}>預約日期</FieldLabel>
                  <Input
                    id={`${formId}-date`}
                    type="date"
                    required
                    value={reservedAt}
                    onChange={(e) => setReservedAt(e.target.value)}
                  />
                </Field>
                <Field className="sm:col-span-2">
                  <FieldLabel htmlFor={`${formId}-search`}>
                    尋找待售卡片
                  </FieldLabel>
                  <Input
                    id={`${formId}-search`}
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="輸入系列、角色或稀有度"
                  />
                </Field>
              </FieldGroup>
              <div className="max-h-96 overflow-y-auto rounded-lg border border-border p-3">
                {shown.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    沒有符合搜尋的待售卡片。
                  </p>
                ) : (
                  <FieldGroup className="[container-type:normal]">
                    {shown.map((group) => {
                      const index = groups.indexOf(group);
                      const labelId = `${formId}-card-${index}`;
                      const draft = selection[group.key];
                      return (
                        <FieldSet
                          key={group.key}
                          aria-labelledby={labelId}
                          className="border-b border-border pb-4 last:border-0 last:pb-0"
                        >
                          <div className="flex items-start gap-3">
                            <CatalogCardVisual
                              src={group.cell.image?.url}
                              thumbnailSrc={group.cell.image?.thumbnailUrl}
                              sizes="56px"
                              alt={`${group.label} 卡面`}
                              className="w-14 shrink-0"
                            />
                            <div className="flex min-w-0 flex-col gap-1">
                              <p id={labelId} className="wrap-anywhere text-sm">
                                {group.label}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                可售 {group.cards.length} 張 ·{" "}
                                {group.cards[0].askingPrice == null
                                  ? "價格面議"
                                  : `${money(group.cards[0].askingPrice)}／張`}
                              </p>
                              {group.cards[0].note ? (
                                <p className="line-clamp-2 wrap-anywhere text-xs text-muted-foreground">
                                  {group.cards[0].note}
                                </p>
                              ) : null}
                            </div>
                          </div>
                          <FieldGroup className="grid grid-cols-2 gap-3 [container-type:normal]">
                            <Field>
                              <FieldLabel htmlFor={`${labelId}-qty`}>
                                預約張數
                              </FieldLabel>
                              <Input
                                id={`${labelId}-qty`}
                                aria-label={`${group.label} 預約張數`}
                                type="number"
                                inputMode="numeric"
                                min={0}
                                max={group.cards.length}
                                step={1}
                                value={draft?.qty ?? "0"}
                                onChange={(e) =>
                                  change(group, "qty", e.target.value)
                                }
                              />
                            </Field>
                            <Field>
                              <FieldLabel htmlFor={`${labelId}-price`}>
                                約定單價（元／張）
                              </FieldLabel>
                              <Input
                                id={`${labelId}-price`}
                                aria-label={`${group.label} 約定單價`}
                                type="number"
                                inputMode="decimal"
                                min={0}
                                max={1_000_000_000}
                                step="0.01"
                                required={Number(draft?.qty) > 0}
                                value={
                                  draft?.price ??
                                  group.cards[0].askingPrice ??
                                  ""
                                }
                                onChange={(e) =>
                                  change(group, "price", e.target.value)
                                }
                              />
                            </Field>
                          </FieldGroup>
                        </FieldSet>
                      );
                    })}
                  </FieldGroup>
                )}
              </div>
              <Field>
                <FieldLabel htmlFor={`${formId}-note`}>
                  備註（選填，僅後台可見）
                </FieldLabel>
                <Textarea
                  id={`${formId}-note`}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  maxLength={2000}
                  placeholder="付款、寄送或面交約定"
                />
              </Field>
            </FieldSet>
            <output className="text-sm" aria-live="polite">
              已選 {quantity} 張 · 約定總額{" "}
              {Number.isFinite(amount) ? money(amount) : "待填寫"}
            </output>
            {quantity > MAX_CARD_BATCH_SIZE ? (
              <p role="alert" className="text-sm text-destructive">
                每筆最多 {MAX_CARD_BATCH_SIZE} 張。
              </p>
            ) : null}
            {error ? (
              <Alert variant="destructive">
                <AlertTitle>無法建立出售預約</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}
            <Button
              type="submit"
              disabled={busy || quantity < 1 || quantity > MAX_CARD_BATCH_SIZE}
            >
              {busy ? "建立中…" : "建立出售預約"}
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}

function SaleReservation({
  reservation,
  onChanged,
}: { reservation: AdminPendingSale; onChanged: () => Promise<void> }) {
  const [action, setAction] = useState<"complete" | "cancel" | null>(null);
  const [date, setDate] = useState(() =>
    todayLocal() < reservation.reservedAt
      ? reservation.reservedAt
      : todayLocal(),
  );
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const groups = new Map<
    string,
    { label: string; qty: number; unitPrice: number }
  >();
  for (const card of reservation.cards) {
    const key = JSON.stringify([card.catalogId, card.unitPrice]);
    const existing = groups.get(key);
    if (existing) existing.qty++;
    else
      groups.set(key, {
        label: `${card.series} · ${card.character} · ${card.rarity}`,
        qty: 1,
        unitPrice: card.unitPrice,
      });
  }
  const submit = async () => {
    if (submitting.current || !action) return;
    submitting.current = true;
    setBusy(true);
    setError(null);
    try {
      if (action === "complete")
        await completeSaleReservation(reservation.id, date);
      else await cancelSaleReservation(reservation.id);
      setAction(null);
      await onChanged();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  };
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center justify-between gap-2">
          <span>{reservation.counterparty ?? "未填買家"}</span>
          <Badge variant="secondary">預約出售</Badge>
        </CardTitle>
        <CardDescription>
          預約 #{reservation.id} · {reservation.reservedAt} ·{" "}
          {reservation.cards.length} 張 · {money(reservation.amount)}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <ul className="flex flex-col gap-2">
          {[...groups.entries()].map(([key, group]) => (
            <li
              key={key}
              className="flex flex-wrap justify-between gap-1 text-sm"
            >
              <span className="min-w-0 wrap-anywhere">{group.label}</span>
              <span className="text-muted-foreground">
                {group.qty} 張 × {money(group.unitPrice)}
              </span>
            </li>
          ))}
        </ul>
        {reservation.note ? (
          <p className="whitespace-pre-wrap wrap-anywhere text-sm text-muted-foreground">
            {reservation.note}
          </p>
        ) : null}
        {error ? (
          <Alert variant="destructive">
            <AlertTitle>無法處理預約</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
      </CardContent>
      <CardFooter>
        {action ? (
          <form
            aria-label={
              action === "complete" ? "確認完成出售" : "確認取消出售預約"
            }
            className="flex w-full flex-col gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              void submit();
            }}
          >
            <p className="text-sm">
              {action === "complete"
                ? `確認 ${reservation.cards.length} 張卡片已完成交易？將記錄成交 ${money(reservation.amount)}，並列為已售出。`
                : `取消後，${reservation.cards.length} 張卡片會恢復待售。`}
            </p>
            {action === "complete" ? (
              <Field>
                <FieldLabel htmlFor={`sale-complete-${reservation.id}`}>
                  成交日期
                </FieldLabel>
                <Input
                  id={`sale-complete-${reservation.id}`}
                  type="date"
                  min={reservation.reservedAt}
                  required
                  disabled={busy}
                  value={date}
                  onChange={(event) => setDate(event.target.value)}
                />
              </Field>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <Button type="submit" disabled={busy}>
                {busy
                  ? "處理中…"
                  : action === "complete"
                    ? "確認完成出售"
                    : "確認取消預約"}
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => setAction(null)}
              >
                返回
              </Button>
            </div>
          </form>
        ) : (
          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={() => setAction("complete")}>
              完成出售
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => setAction("cancel")}
            >
              取消預約
            </Button>
          </div>
        )}
      </CardFooter>
    </Card>
  );
}

export function PendingSales() {
  const [data, setData] = useState<{
    cards: CardRow[];
    overview: OverviewResponse;
    pending: AdminPendingSale[];
    revision: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const request = useRef(0);
  const load = useCallback(async () => {
    const id = ++request.current;
    setLoading(true);
    setError(null);
    try {
      const [cards, overview, pending] = await Promise.all([
        listCards({ status: "for_sale" }),
        fetchOverview(),
        fetchAdminPendingSales(),
      ]);
      if (request.current === id)
        setData({ cards, overview, pending, revision: id });
    } catch (err) {
      if (request.current === id) setError(errorMessage(err));
    } finally {
      if (request.current === id) setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
    return () => {
      request.current++;
    };
  }, [load]);
  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-2">
          <h2 className="font-serif text-xl">出售預約</h2>
          <p className="text-sm text-muted-foreground">
            待售 → 預約出售 → 已售出。預約期間仍持有卡片，完成出售後才扣除庫存。
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={() => void load()}
          disabled={loading}
        >
          重新整理
        </Button>
      </div>
      {error ? (
        <Alert variant="destructive">
          <AlertTitle>無法載入出售預約</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      {!data ? (
        <output>{loading ? "載入中…" : "請重新整理後再試。"}</output>
      ) : (
        <>
          <SaleForm
            key={data.revision}
            cards={data.cards}
            overview={data.overview}
            onCreated={load}
          />
          <section
            aria-label="進行中的出售預約"
            className="flex flex-col gap-4"
          >
            <h3 className="text-lg">交易中 · {data.pending.length} 筆</h3>
            {data.pending.length === 0 ? (
              <Empty>
                <EmptyHeader>
                  <EmptyTitle>目前沒有進行中的出售預約。</EmptyTitle>
                </EmptyHeader>
              </Empty>
            ) : (
              data.pending.map((reservation) => (
                <SaleReservation
                  key={reservation.id}
                  reservation={reservation}
                  onChanged={load}
                />
              ))
            )}
          </section>
        </>
      )}
    </section>
  );
}
