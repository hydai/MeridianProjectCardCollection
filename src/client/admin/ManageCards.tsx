import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { todayLocal } from "@/lib/date";
import { cn } from "@/lib/utils";
import { EMPTY_MSG, STATE_MSG } from "@/shared/states";
import { ChevronDown, ChevronRight, Heart } from "lucide-react";
import {
  Fragment,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useState,
} from "react";
import { RARITY_ORDER } from "../../shared/rarity";
import type {
  ActivityEvent,
  CardRow,
  CardStatus,
  CatalogSeries,
  OverviewCell,
  OverviewResponse,
  Rarity,
} from "../../shared/types";
import {
  fetchCatalog,
  fetchCatalogActivities,
  fetchOverview,
  holdCard,
  listCards,
  patchCard,
  postTransaction,
  putCatalogWant,
  unholdCard,
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
  OPT_TOGGLE,
  PANEL,
  PANEL_TITLE,
  PILL_BASE,
  PILL_DUP,
  PILL_HELD,
  PILL_RARITY,
  PILL_RESERVED,
  PILL_STATUS,
  ROW_ACTIONS,
  TABLE,
  TD,
  TH,
} from "./ui";

type ActionKind = "list_sale" | "list_trade" | "sale" | "trade";
type StatusFilter = "catalog" | "wanted" | "active" | CardStatus;

type FilterValue = string | number;

interface FilterOption<T extends FilterValue> {
  value: T;
  label: string;
}

interface CardGroup {
  key: string;
  series: string;
  character: string;
  rarity: Rarity;
  cards: CardRow[];
  inventoryCount: number;
  reservedCount: number;
  heldCount: number;
  statusCounts: Record<CardStatus, number>;
}

const ALL_FILTER_VALUE = "all:";
const encodeFilterValue = (value: FilterValue) => `value:${String(value)}`;
const ACTIVE_STATUSES = new Set<CardStatus>(["owned", "for_sale", "for_trade"]);
const CARD_STATUSES: CardStatus[] = [
  "owned",
  "for_sale",
  "for_trade",
  "sold",
  "traded",
];
const FILTER_BUTTON = cn(
  OPT_TOGGLE,
  "min-h-8 max-w-full break-words px-3 py-1.5 text-center text-xs whitespace-normal tracking-[0.04em]",
);

const STATUS_FILTER_OPTIONS: FilterOption<StatusFilter>[] = [
  { value: "catalog", label: "全部卡位" },
  { value: "wanted", label: "已標記 Want" },
  { value: "active", label: "持有中（可管理）" },
  { value: "owned", label: "純持有" },
  { value: "for_sale", label: "待售" },
  { value: "for_trade", label: "待換" },
  { value: "sold", label: "已售出" },
  { value: "traded", label: "已交換" },
];

const STATUS_LABEL: Record<string, string> = {
  owned: "持有",
  for_sale: "待售",
  for_trade: "待換",
  sold: "已售出",
  traded: "已交換",
};

const cardGroupKey = (card: Pick<CardRow, "series" | "character" | "rarity">) =>
  JSON.stringify([card.series, card.character, card.rarity]);

function groupCards(visibleRows: CardRow[], allRows: CardRow[]): CardGroup[] {
  const inventoryCounts = new Map<string, number>();
  for (const card of allRows) {
    if (!ACTIVE_STATUSES.has(card.status)) continue;
    const key = cardGroupKey(card);
    inventoryCounts.set(key, (inventoryCounts.get(key) ?? 0) + 1);
  }

  const groups = new Map<string, CardGroup>();
  for (const card of visibleRows) {
    const key = cardGroupKey(card);
    let group = groups.get(key);
    if (!group) {
      group = {
        key,
        series: card.series,
        character: card.character,
        rarity: card.rarity,
        cards: [],
        inventoryCount: inventoryCounts.get(key) ?? 0,
        reservedCount: 0,
        heldCount: 0,
        statusCounts: {
          owned: 0,
          for_sale: 0,
          for_trade: 0,
          sold: 0,
          traded: 0,
        },
      };
      groups.set(key, group);
    }
    group.cards.push(card);
    group.statusCounts[card.status] += 1;
    if (card.reserved && ACTIVE_STATUSES.has(card.status)) {
      group.reservedCount += 1;
    }
    if (card.held && ACTIVE_STATUSES.has(card.status)) {
      group.heldCount += 1;
    }
  }

  return Array.from(groups.values());
}

function groupCatalogCells(
  cells: OverviewCell[],
  allRows: CardRow[],
): CardGroup[] {
  const cardsByKey = new Map<string, CardRow[]>();
  for (const card of allRows) {
    const key = cardGroupKey(card);
    const cards = cardsByKey.get(key) ?? [];
    cards.push(card);
    cardsByKey.set(key, cards);
  }

  return cells.map((cell) => {
    const key = cardGroupKey(cell);
    const cards = cardsByKey.get(key) ?? [];
    const statusCounts: Record<CardStatus, number> = {
      owned: 0,
      for_sale: 0,
      for_trade: 0,
      sold: 0,
      traded: 0,
    };
    for (const card of cards) statusCounts[card.status] += 1;
    return {
      key,
      series: cell.series,
      character: cell.character,
      rarity: cell.rarity,
      cards,
      inventoryCount: cell.owned,
      reservedCount: cell.reserved,
      heldCount: cell.held,
      statusCounts,
    };
  });
}

const ACTIVITY_LABEL: Record<ActivityEvent["kind"], string> = {
  opening: "開卡入藏",
  purchase: "購入入藏",
  acquisition: "新增入藏",
  card_classified: "卡片分類變更",
  card_updated: "卡片資料更新",
  want_updated: "Want 目標變更",
  hold: "設為保留",
  unhold: "取消保留",
  sale: "售出卡片",
  trade: "交換卡片",
  trade_reserved: "建立交換預約",
  trade_reservation_cancelled: "取消交換預約",
  trade_completed: "完成交換",
  purchase_ordered: "建立購入預約",
  purchase_received: "購入到貨",
  purchase_cancelled: "取消購入預約",
  undo: "復原入藏紀錄",
};

function sourceLabel(card: CardRow): string {
  if (card.source === "pull") return "開卡";
  if (card.source === "trade_in") return "交換換入";
  if (card.source === "other") return "其他入藏";
  return card.purchasePrice == null
    ? "購入"
    : `購入 · ${card.purchasePrice} 元`;
}

function FilterButtonGroup<T extends FilterValue>({
  label,
  allLabel,
  value,
  options,
  onChange,
}: {
  label: string;
  allLabel: string;
  value: T | null;
  options: FilterOption<T>[];
  onChange: (value: T | null) => void;
}) {
  return (
    <div className="grid grid-cols-[76px_minmax(0,1fr)] items-start gap-3 max-[600px]:grid-cols-1 max-[600px]:gap-1.5">
      <span className={cn(FIELD_LABEL, "pt-2 max-[600px]:pt-0")}>{label}</span>
      <ToggleGroup
        type="single"
        value={value === null ? ALL_FILTER_VALUE : encodeFilterValue(value)}
        onValueChange={(next) => {
          if (!next) return;
          if (next === ALL_FILTER_VALUE) {
            onChange(null);
            return;
          }
          const selected = options.find(
            (option) => encodeFilterValue(option.value) === next,
          );
          if (selected) onChange(selected.value);
        }}
        aria-label={`${label}篩選`}
        className="flex w-full flex-wrap justify-start gap-1.5 rounded-none"
      >
        <ToggleGroupItem value={ALL_FILTER_VALUE} className={FILTER_BUTTON}>
          {allLabel}
        </ToggleGroupItem>
        {options.map((option) => (
          <ToggleGroupItem
            key={String(option.value)}
            value={encodeFilterValue(option.value)}
            className={FILTER_BUTTON}
          >
            {option.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </div>
  );
}

function ActionForm({
  card,
  catalog,
  kind,
  onDone,
  onCancel,
}: {
  card: CardRow;
  catalog: CatalogSeries[];
  kind: ActionKind;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [price, setPrice] = useState("");
  const [want, setWant] = useState("");
  const [counterparty, setCounterparty] = useState("");
  const [happenedAt, setHappenedAt] = useState(todayLocal);
  const firstSeries = catalog[0];
  const [rSeries, setRSeries] = useState(firstSeries?.name ?? "");
  const selectedSeries =
    catalog.find((entry) => entry.name === rSeries) ?? firstSeries;
  const rChars = selectedSeries?.characters ?? [];
  const rRarities = selectedSeries?.rarities ?? [];
  const [rChar, setRChar] = useState(rChars[0] ?? "");
  const [rRarity, setRRarity] = useState<Rarity>(rRarities[0] ?? "R");
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
    <div className={ACTION_FORM}>
      <div className={INLINE_FIELDS}>
        {kind === "list_sale" || kind === "sale" ? (
          <label className={FIELD}>
            <span className={FIELD_LABEL}>價格 (TWD)</span>
            <Input
              type="number"
              className={CONTROL}
              value={price}
              onChange={(e) => setPrice(e.target.value)}
            />
          </label>
        ) : null}
        {kind === "list_trade" ? (
          <label className={FIELD}>
            <span className={FIELD_LABEL}>想換的卡 / 條件</span>
            <Input
              className={CONTROL}
              value={want}
              onChange={(e) => setWant(e.target.value)}
              placeholder="例如 KILLER Kirali UR"
            />
          </label>
        ) : null}
        {kind === "sale" || kind === "trade" ? (
          <>
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
                value={happenedAt}
                onChange={(e) => setHappenedAt(e.target.value)}
              />
            </label>
          </>
        ) : null}
        {kind === "trade" ? (
          <>
            <label className={FIELD}>
              <span className={FIELD_LABEL}>換得系列</span>
              <select
                className={CONTROL}
                value={rSeries}
                onChange={(e) => {
                  const next = catalog.find(
                    (entry) => entry.name === e.target.value,
                  );
                  setRSeries(e.target.value);
                  setRChar(next?.characters[0] ?? "");
                  setRRarity(next?.rarities[0] ?? "R");
                }}
              >
                {catalog.map((entry) => (
                  <option key={entry.name} value={entry.name}>
                    {entry.name}
                  </option>
                ))}
              </select>
            </label>
            <label className={FIELD}>
              <span className={FIELD_LABEL}>換得角色</span>
              <select
                className={CONTROL}
                value={rChar}
                onChange={(e) => setRChar(e.target.value)}
              >
                {rChars.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
            <label className={FIELD}>
              <span className={FIELD_LABEL}>稀有度</span>
              <select
                className={CONTROL}
                value={rRarity}
                onChange={(e) => setRRarity(e.target.value as Rarity)}
              >
                {rRarities.map((rr) => (
                  <option key={rr} value={rr}>
                    {rr}
                  </option>
                ))}
              </select>
            </label>
          </>
        ) : null}
        <Button
          type="button"
          className={BTN_PRIMARY_SM}
          onClick={submit}
          disabled={busy}
        >
          {busy ? "處理中…" : "確認"}
        </Button>
        <Button
          type="button"
          variant="outline"
          className={BTN_GHOST_SM}
          onClick={onCancel}
        >
          取消
        </Button>
      </div>
      {err ? <div className={cn(ERROR_TEXT, "mt-2")}>{err}</div> : null}
    </div>
  );
}

function CardWorkspaceSheet({
  cell,
  cards,
  catalog,
  onOpenChange,
  onChanged,
}: {
  cell: OverviewCell | null;
  cards: CardRow[];
  catalog: CatalogSeries[];
  onOpenChange: (open: boolean) => void;
  onChanged: () => Promise<void>;
}) {
  const [wantInput, setWantInput] = useState("0");
  const [wantBusy, setWantBusy] = useState(false);
  const [wantError, setWantError] = useState<string | null>(null);
  const [cardError, setCardError] = useState<string | null>(null);
  const [action, setAction] = useState<{
    cardId: number;
    kind: ActionKind;
  } | null>(null);
  const [activities, setActivities] = useState<ActivityEvent[] | null>(null);
  const [activityError, setActivityError] = useState<string | null>(null);

  useEffect(() => {
    setWantInput(String(cell?.wantCount ?? 0));
    setWantError(null);
    setCardError(null);
    setAction(null);
  }, [cell]);

  useEffect(() => {
    if (!cell) {
      setActivities(null);
      return;
    }
    let active = true;
    setActivities(null);
    setActivityError(null);
    fetchCatalogActivities(cell.catalogId)
      .then((events) => {
        if (active) setActivities(events);
      })
      .catch((error) => {
        if (active) setActivityError(String(error));
      });
    return () => {
      active = false;
    };
  }, [cell]);

  const refresh = async () => {
    await onChanged();
  };

  const saveWant = async () => {
    if (!cell) return;
    const wantCount = Number(wantInput);
    if (!Number.isInteger(wantCount) || wantCount < 0 || wantCount > 99) {
      setWantError("Want 張數必須是 0 到 99 的整數。");
      return;
    }
    setWantBusy(true);
    setWantError(null);
    try {
      await putCatalogWant(cell.catalogId, wantCount);
      await refresh();
    } catch (error) {
      setWantError(String(error));
    } finally {
      setWantBusy(false);
    }
  };

  const runCardMutation = async (mutation: () => Promise<unknown>) => {
    setCardError(null);
    try {
      await mutation();
      await refresh();
    } catch (error) {
      setCardError(String(error));
    }
  };

  const wantCount = cell?.wantCount ?? 0;
  const incomingTrade = cell?.incomingTrade ?? 0;
  const incomingPurchase = cell?.incomingPurchase ?? 0;
  const incoming = incomingTrade + incomingPurchase;
  const remaining = cell ? Math.max(0, wantCount - cell.owned - incoming) : 0;

  return (
    <Sheet open={cell !== null} onOpenChange={onOpenChange}>
      <SheetContent
        className="overflow-y-auto"
        style={{ width: "min(100vw, 680px)", maxWidth: "none" }}
      >
        {cell ? (
          <>
            <SheetHeader className="border-b border-border pr-12">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className="font-mono">
                  {cell.rarity}
                </Badge>
                {wantCount > 0 ? (
                  <Badge variant={remaining > 0 ? "default" : "secondary"}>
                    <Heart data-icon="inline-start" />
                    {remaining > 0 ? `尚找 ${remaining}` : "Want 已滿足"}
                  </Badge>
                ) : null}
              </div>
              <SheetTitle className="font-serif text-xl tracking-[0.04em]">
                {cell.character} · {cell.series}
              </SheetTitle>
              <SheetDescription>
                第 {cell.volume} 彈 · 卡位 #{cell.catalogId}
              </SheetDescription>
            </SheetHeader>

            <div className="flex flex-col gap-6 px-4 pb-6">
              <section aria-labelledby="workspace-summary-title">
                <h3
                  id="workspace-summary-title"
                  className="mb-3 text-sm font-medium text-foreground"
                >
                  卡位現況
                </h3>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {[
                    ["持有", cell.owned],
                    ["可運用", cell.available],
                    ["暫定換出", cell.reserved],
                    ["保留", cell.held],
                  ].map(([label, value]) => (
                    <Card
                      key={label}
                      size="sm"
                      className="gap-1 py-3 ring-border"
                    >
                      <CardHeader className="px-3">
                        <CardDescription>{label}</CardDescription>
                        <CardTitle className="font-mono text-lg">
                          {value}
                        </CardTitle>
                      </CardHeader>
                    </Card>
                  ))}
                </div>
                {incoming > 0 ? (
                  <p className="mt-2 text-xs text-reservation">
                    待入手 {incoming} 張
                    {incomingTrade > 0 ? ` · 交換 ${incomingTrade}` : ""}
                    {incomingPurchase > 0 ? ` · 購入 ${incomingPurchase}` : ""}
                  </p>
                ) : null}
              </section>

              <Separator />

              <section aria-labelledby="workspace-want-title">
                <h3
                  id="workspace-want-title"
                  className="mb-3 text-sm font-medium text-foreground"
                >
                  Want 目標
                </h3>
                <FieldGroup className="gap-3">
                  <Field data-invalid={Boolean(wantError)}>
                    <FieldLabel htmlFor="workspace-want-count">
                      期望持有張數
                    </FieldLabel>
                    <div className="flex items-center gap-2">
                      <Input
                        id="workspace-want-count"
                        type="number"
                        min={0}
                        max={99}
                        step={1}
                        value={wantInput}
                        onChange={(event) => setWantInput(event.target.value)}
                        aria-invalid={Boolean(wantError)}
                        className="max-w-28"
                      />
                      <Button
                        type="button"
                        onClick={saveWant}
                        disabled={wantBusy}
                      >
                        {wantBusy ? "儲存中…" : "儲存 Want"}
                      </Button>
                      {wantCount > 0 ? (
                        <Button
                          type="button"
                          variant="ghost"
                          disabled={wantBusy}
                          onClick={() => setWantInput("0")}
                        >
                          設為 0
                        </Button>
                      ) : null}
                    </div>
                    <FieldDescription>
                      0 代表取消
                      Want。缺卡仍會保留在缺卡清單，但不會出現在想換入清單。
                    </FieldDescription>
                    <FieldError>{wantError}</FieldError>
                  </Field>
                </FieldGroup>
              </section>

              <Separator />

              <section aria-labelledby="workspace-cards-title">
                <div className="mb-3 flex items-baseline justify-between gap-3">
                  <h3
                    id="workspace-cards-title"
                    className="text-sm font-medium text-foreground"
                  >
                    實體卡
                  </h3>
                  <span className="font-mono text-xs text-muted-foreground">
                    {cards.length} 張歷史紀錄
                  </span>
                </div>
                {cardError ? (
                  <p role="alert" className="mb-3 text-sm text-destructive">
                    {cardError}
                  </p>
                ) : null}
                {cards.length === 0 ? (
                  <p className="rounded-md border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
                    尚未有這個卡位的實體卡紀錄。
                  </p>
                ) : (
                  <div className="flex flex-col gap-3">
                    {cards.map((card) => {
                      const isActive = ACTIVE_STATUSES.has(card.status);
                      const actionOpen = action?.cardId === card.id;
                      return (
                        <Card key={card.id} size="sm" className="ring-border">
                          <CardHeader>
                            <CardTitle className="font-mono">
                              實體卡 #{card.id}
                            </CardTitle>
                            <CardDescription>
                              {sourceLabel(card)}
                            </CardDescription>
                          </CardHeader>
                          <CardContent className="flex flex-col gap-3">
                            <div className="flex flex-wrap gap-1.5">
                              <Badge variant="outline">
                                {STATUS_LABEL[card.status]}
                              </Badge>
                              {card.duplicate && isActive ? (
                                <Badge variant="secondary">重複</Badge>
                              ) : null}
                              {card.reserved && isActive ? (
                                <Badge variant="secondary">暫定換出</Badge>
                              ) : null}
                              {card.held && isActive ? (
                                <Badge variant="secondary">保留</Badge>
                              ) : null}
                              {card.status === "for_sale" &&
                              card.askingPrice != null ? (
                                <Badge variant="outline">
                                  {card.askingPrice} 元
                                </Badge>
                              ) : null}
                            </div>
                            {card.note ? (
                              <p className="text-xs text-muted-foreground">
                                {card.note}
                              </p>
                            ) : null}
                            {card.held && isActive ? (
                              <div className={ROW_ACTIONS}>
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  onClick={() =>
                                    runCardMutation(() => unholdCard(card.id))
                                  }
                                >
                                  取消保留
                                </Button>
                              </div>
                            ) : isActive && !card.reserved ? (
                              <div className={ROW_ACTIONS}>
                                {(
                                  [
                                    ["list_sale", "待售"],
                                    ["list_trade", "待換"],
                                    ["sale", "賣出"],
                                    ["trade", "交換"],
                                  ] as const
                                ).map(([kind, label]) => (
                                  <Button
                                    key={kind}
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={() =>
                                      setAction({ cardId: card.id, kind })
                                    }
                                  >
                                    {label}
                                  </Button>
                                ))}
                                {card.status !== "owned" ? (
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={() =>
                                      runCardMutation(() =>
                                        patchCard(card.id, { status: "owned" }),
                                      )
                                    }
                                  >
                                    取消上架
                                  </Button>
                                ) : (
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={() =>
                                      runCardMutation(() => holdCard(card.id))
                                    }
                                  >
                                    保留
                                  </Button>
                                )}
                              </div>
                            ) : card.reserved && isActive ? (
                              <p className="text-xs text-reservation">
                                已由交換預約鎖定
                              </p>
                            ) : null}
                            {actionOpen && action ? (
                              <ActionForm
                                card={card}
                                catalog={catalog}
                                kind={action.kind}
                                onDone={() => {
                                  setAction(null);
                                  void refresh();
                                }}
                                onCancel={() => setAction(null)}
                              />
                            ) : null}
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                )}
              </section>

              <Separator />

              <section aria-labelledby="workspace-activity-title">
                <h3
                  id="workspace-activity-title"
                  className="mb-3 text-sm font-medium text-foreground"
                >
                  這張卡的痕跡
                </h3>
                {activityError ? (
                  <p role="alert" className="text-sm text-destructive">
                    {activityError}
                  </p>
                ) : activities === null ? (
                  <p className="text-sm text-muted-foreground">載入痕跡中…</p>
                ) : activities.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    還沒有與這個卡位相關的痕跡。
                  </p>
                ) : (
                  <ol className="flex flex-col gap-2">
                    {activities.map((event) => {
                      const line = event.lines[0];
                      return (
                        <li
                          key={event.id}
                          className="rounded-md border border-border px-3 py-2.5"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="text-sm text-foreground">
                              {ACTIVITY_LABEL[event.kind]}
                            </span>
                            <time
                              dateTime={event.occurredAt}
                              className="font-mono text-[11px] text-muted-foreground"
                            >
                              {event.occurredAt.slice(0, 16).replace("T", " ")}
                            </time>
                          </div>
                          {line?.action === "wanted" ? (
                            <p className="mt-1 text-xs text-muted-foreground">
                              Want {line.beforeWant ?? 0} →{" "}
                              {line.afterWant ?? 0}
                            </p>
                          ) : line ? (
                            <p className="mt-1 text-xs text-muted-foreground">
                              {line.delta > 0 ? "+" : ""}
                              {line.delta} 張
                              {line.note ? ` · ${line.note}` : ""}
                            </p>
                          ) : null}
                        </li>
                      );
                    })}
                  </ol>
                )}
              </section>
            </div>
          </>
        ) : (
          <SheetHeader>
            <SheetTitle>卡片工作面板</SheetTitle>
            <SheetDescription>選擇卡位後顯示內容。</SheetDescription>
          </SheetHeader>
        )}
      </SheetContent>
    </Sheet>
  );
}

export function ManageCards() {
  const detailsIdPrefix = useId();
  const [filterVolume, setFilterVolume] = useState<number | null>(null);
  const [filterSeries, setFilterSeries] = useState<string | null>(null);
  const [filterCharacter, setFilterCharacter] = useState<string | null>(null);
  const [filterRarity, setFilterRarity] = useState<Rarity | null>(null);
  const [filterStatus, setFilterStatus] = useState<StatusFilter | null>(
    "active",
  );
  const [rows, setRows] = useState<CardRow[] | null>(null);
  const [catalog, setCatalog] = useState<CatalogSeries[] | null>(null);
  const [overview, setOverview] = useState<OverviewResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedCatalogId, setSelectedCatalogId] = useState<number | null>(
    null,
  );
  const [action, setAction] = useState<{
    cardId: number;
    kind: ActionKind;
  } | null>(null);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(
    () => new Set(),
  );

  const reload = useCallback(async () => {
    setRows(null);
    setError(null);
    try {
      const [nextRows, nextOverview] = await Promise.all([
        listCards(),
        fetchOverview(),
      ]);
      setRows(nextRows);
      setOverview(nextOverview);
    } catch (caught) {
      setError(String(caught));
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    fetchCatalog()
      .then(setCatalog)
      .catch((e) => setError(String(e)));
  }, []);

  const onDone = () => {
    setAction(null);
    void reload();
  };

  const clearOpenState = () => {
    setAction(null);
    setExpandedGroups(new Set());
  };

  const allCatalog = catalog ?? [];
  const volumeOptions: FilterOption<number>[] = Array.from(
    new Set(allCatalog.map((entry) => entry.volume)),
  )
    .sort((a, b) => a - b)
    .map((volume) => ({ value: volume, label: `第 ${volume} 彈` }));
  const catalogInVolume = allCatalog.filter(
    (entry) => filterVolume === null || entry.volume === filterVolume,
  );
  const seriesOptions: FilterOption<string>[] = catalogInVolume.map(
    (entry) => ({ value: entry.name, label: entry.name }),
  );
  const catalogInSeries = catalogInVolume.filter(
    (entry) => filterSeries === null || entry.name === filterSeries,
  );
  const characterOptions: FilterOption<string>[] = Array.from(
    new Set(catalogInSeries.flatMap((entry) => entry.characters)),
  ).map((character) => ({ value: character, label: character }));
  const rarityOptions: FilterOption<Rarity>[] = RARITY_ORDER.filter((rarity) =>
    catalogInSeries.some((entry) => entry.rarities.includes(rarity)),
  ).map((rarity) => ({ value: rarity, label: rarity }));
  const volumeBySeries = new Map(
    allCatalog.map((entry) => [entry.name, entry.volume]),
  );
  const overviewCells = overview?.cells ?? [];
  const cellByKey = new Map(
    overviewCells.map((cell) => [cardGroupKey(cell), cell]),
  );
  const filteredRows = (rows ?? []).filter((card) => {
    const matchesStatus =
      filterStatus === null ||
      filterStatus === "catalog" ||
      filterStatus === "wanted" ||
      (filterStatus === "active"
        ? ACTIVE_STATUSES.has(card.status)
        : card.status === filterStatus);
    return (
      matchesStatus &&
      (filterVolume === null ||
        volumeBySeries.get(card.series) === filterVolume) &&
      (filterSeries === null || card.series === filterSeries) &&
      (filterCharacter === null || card.character === filterCharacter) &&
      (filterRarity === null || card.rarity === filterRarity)
    );
  });
  const filteredCells = overviewCells.filter(
    (cell) =>
      (filterVolume === null || cell.volume === filterVolume) &&
      (filterSeries === null || cell.series === filterSeries) &&
      (filterCharacter === null || cell.character === filterCharacter) &&
      (filterRarity === null || cell.rarity === filterRarity) &&
      (filterStatus !== "wanted" || (cell.wantCount ?? 0) > 0),
  );
  const catalogMode = filterStatus === "catalog" || filterStatus === "wanted";
  const cardGroups = catalogMode
    ? groupCatalogCells(filteredCells, rows ?? [])
    : groupCards(filteredRows, rows ?? []);
  const selectedCell =
    overviewCells.find((cell) => cell.catalogId === selectedCatalogId) ?? null;
  const selectedCards = useMemo(
    () =>
      selectedCell
        ? (rows ?? []).filter(
            (card) => cardGroupKey(card) === cardGroupKey(selectedCell),
          )
        : [],
    [rows, selectedCell],
  );

  return (
    <section className={PANEL}>
      <h2 className={PANEL_TITLE}>卡片管理</h2>
      <div className="card-filters mb-[18px] flex flex-col gap-3 rounded-[4px] border-[0.5px] border-border bg-[var(--bg-subtle)] p-3.5">
        <FilterButtonGroup
          label="彈數"
          allLabel="全部彈數"
          value={filterVolume}
          options={volumeOptions}
          onChange={(volume) => {
            setFilterVolume(volume);
            setFilterSeries(null);
            setFilterCharacter(null);
            setFilterRarity(null);
            clearOpenState();
          }}
        />
        <FilterButtonGroup
          label="系列"
          allLabel="全部系列"
          value={filterSeries}
          options={seriesOptions}
          onChange={(series) => {
            setFilterSeries(series);
            setFilterCharacter(null);
            setFilterRarity(null);
            clearOpenState();
          }}
        />
        <FilterButtonGroup
          label="角色"
          allLabel="全部角色"
          value={filterCharacter}
          options={characterOptions}
          onChange={(character) => {
            setFilterCharacter(character);
            clearOpenState();
          }}
        />
        <FilterButtonGroup
          label="級別"
          allLabel="全部級別"
          value={filterRarity}
          options={rarityOptions}
          onChange={(rarity) => {
            setFilterRarity(rarity);
            clearOpenState();
          }}
        />
        <FilterButtonGroup
          label="狀態"
          allLabel="全部狀態"
          value={filterStatus}
          options={STATUS_FILTER_OPTIONS}
          onChange={(status) => {
            setFilterStatus(status);
            clearOpenState();
          }}
        />
      </div>

      {error ? <div className={ERROR_TEXT}>{error}</div> : null}
      {rows !== null && catalog !== null && overview !== null ? (
        <output
          className="mb-3 block font-mono text-[11px] text-[var(--text-tertiary)]"
          aria-live="polite"
        >
          {catalogMode ? (
            <>
              顯示 {cardGroups.length} 個卡位 · 持有{" "}
              {cardGroups.reduce((sum, group) => sum + group.inventoryCount, 0)}{" "}
              張
            </>
          ) : (
            <>
              顯示 {cardGroups.length} 種卡 · {filteredRows.length} /{" "}
              {rows.length} 張
            </>
          )}
        </output>
      ) : null}
      {rows === null || catalog === null || overview === null ? (
        error ? null : (
          <div className={STATE_MSG}>載入中…</div>
        )
      ) : cardGroups.length === 0 ? (
        <div className={EMPTY_MSG}>
          {filterStatus === "wanted"
            ? "目前沒有符合條件的 Want。"
            : "沒有符合的卡片。"}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className={cn(TABLE, "min-w-[760px]")} aria-label="卡片群組">
            <thead>
              <tr>
                <th className={TH}>系列</th>
                <th className={TH}>角色</th>
                <th className={TH}>稀有度</th>
                <th className={TH}>庫存</th>
                <th className={TH}>狀態概況</th>
                <th className={TH}>工作面板與明細</th>
              </tr>
            </thead>
            <tbody>
              {cardGroups.map((group, groupIndex) => {
                const expanded = expandedGroups.has(group.key);
                const detailsId = `${detailsIdPrefix}-group-${groupIndex}`;
                const cell = cellByKey.get(group.key);
                return (
                  <Fragment key={group.key}>
                    <tr>
                      <td className={TD}>{group.series}</td>
                      <td className={TD}>{group.character}</td>
                      <td className={TD}>
                        <span
                          className={cn(PILL_BASE, PILL_RARITY[group.rarity])}
                        >
                          {group.rarity}
                        </span>
                      </td>
                      <td className={TD}>
                        <span
                          aria-label={`目前庫存 ${group.inventoryCount} 張`}
                        >
                          <strong className="font-mono text-base font-medium text-foreground">
                            {group.inventoryCount}
                          </strong>{" "}
                          張
                        </span>
                      </td>
                      <td className={TD}>
                        <div className="flex flex-wrap gap-1.5">
                          {CARD_STATUSES.map((status) =>
                            group.statusCounts[status] > 0 ? (
                              <span
                                key={status}
                                className={cn(PILL_BASE, PILL_STATUS[status])}
                              >
                                {STATUS_LABEL[status]}{" "}
                                {group.statusCounts[status]}
                              </span>
                            ) : null,
                          )}
                          {group.reservedCount > 0 ? (
                            <span className={cn(PILL_BASE, PILL_RESERVED)}>
                              暫定換出 {group.reservedCount}
                            </span>
                          ) : null}
                          {group.heldCount > 0 ? (
                            <span className={cn(PILL_BASE, PILL_HELD)}>
                              保留 {group.heldCount}
                            </span>
                          ) : null}
                          {(cell?.wantCount ?? 0) > 0 ? (
                            <span className={cn(PILL_BASE, PILL_DUP)}>
                              Want {cell?.wantCount}
                            </span>
                          ) : null}
                        </div>
                      </td>
                      <td className={TD}>
                        <div className={ROW_ACTIONS}>
                          {cell ? (
                            <Button
                              type="button"
                              variant="outline"
                              className={BTN_GHOST_SM}
                              aria-label={`開啟 ${group.series} ${group.character} ${group.rarity} 卡片工作面板`}
                              onClick={() =>
                                setSelectedCatalogId(cell.catalogId)
                              }
                            >
                              工作面板
                            </Button>
                          ) : null}
                          {group.cards.length > 0 ? (
                            <Button
                              type="button"
                              variant="outline"
                              className={BTN_GHOST_SM}
                              aria-expanded={expanded}
                              aria-controls={detailsId}
                              aria-label={`${expanded ? "收合" : "展開"} ${group.series} ${group.character} ${group.rarity}，${group.cards.length} 張明細`}
                              onClick={() => {
                                setExpandedGroups((current) => {
                                  const next = new Set(current);
                                  if (next.has(group.key))
                                    next.delete(group.key);
                                  else next.add(group.key);
                                  return next;
                                });
                                if (
                                  expanded &&
                                  action &&
                                  group.cards.some(
                                    (card) => card.id === action.cardId,
                                  )
                                ) {
                                  setAction(null);
                                }
                              }}
                            >
                              {expanded ? (
                                <ChevronDown data-icon="inline-start" />
                              ) : (
                                <ChevronRight data-icon="inline-start" />
                              )}
                              {expanded ? "收合" : "展開"} {group.cards.length}{" "}
                              張
                            </Button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                    {expanded ? (
                      <tr id={detailsId}>
                        <td
                          className={cn(TD, "bg-[var(--bg-subtle)] px-4 py-3")}
                          colSpan={6}
                        >
                          <div className="overflow-x-auto">
                            <table
                              className={cn(TABLE, "min-w-[650px]")}
                              aria-label={`${group.series} ${group.character} ${group.rarity} 實體卡明細`}
                            >
                              <thead>
                                <tr>
                                  <th className={TH}>實體卡</th>
                                  <th className={TH}>取得方式</th>
                                  <th className={TH}>狀態</th>
                                  <th className={TH}>操作</th>
                                </tr>
                              </thead>
                              <tbody>
                                {group.cards.map((card) => {
                                  const isActive = ACTIVE_STATUSES.has(
                                    card.status,
                                  );
                                  const open = action?.cardId === card.id;
                                  const purchaseMeta = [
                                    card.purchaseSeller
                                      ? `賣家 ${card.purchaseSeller}`
                                      : "",
                                    card.purchaseOrderedAt
                                      ? `訂購 ${card.purchaseOrderedAt}`
                                      : "",
                                  ]
                                    .filter(Boolean)
                                    .join(" · ");
                                  return (
                                    <Fragment key={card.id}>
                                      <tr
                                        className={cn(
                                          card.reserved &&
                                            isActive &&
                                            "[&_td]:bg-[var(--reservation-soft)] hover:[&_td]:bg-reservation/20",
                                          card.held &&
                                            isActive &&
                                            "[&_td]:bg-[rgba(255,255,255,0.035)] hover:[&_td]:bg-[rgba(255,255,255,0.05)]",
                                        )}
                                      >
                                        <td
                                          className={cn(
                                            TD,
                                            "font-mono text-foreground",
                                          )}
                                        >
                                          #{card.id}
                                        </td>
                                        <td className={TD}>
                                          {card.source === "pull" ? (
                                            "開卡"
                                          ) : card.source === "purchase" ? (
                                            <>
                                              <span>
                                                購入
                                                {card.purchasePrice != null
                                                  ? ` · ${card.purchasePrice} 元`
                                                  : ""}
                                              </span>
                                              {purchaseMeta ? (
                                                <span className="mt-1 block text-xs text-[var(--text-tertiary)]">
                                                  {purchaseMeta}
                                                </span>
                                              ) : null}
                                              {card.purchaseNote ? (
                                                <span className="mt-1 block text-xs text-[var(--text-tertiary)]">
                                                  {card.purchaseNote}
                                                </span>
                                              ) : null}
                                            </>
                                          ) : card.source === "trade_in" ? (
                                            "交換換入"
                                          ) : (
                                            "其他入藏"
                                          )}
                                        </td>
                                        <td className={TD}>
                                          <span
                                            className={cn(
                                              PILL_BASE,
                                              PILL_STATUS[card.status],
                                            )}
                                          >
                                            {STATUS_LABEL[card.status]}
                                          </span>
                                          {card.duplicate && isActive ? (
                                            <span
                                              className={cn(
                                                PILL_BASE,
                                                PILL_DUP,
                                                "ml-1.5",
                                              )}
                                            >
                                              重複
                                            </span>
                                          ) : null}
                                          {card.reserved && isActive ? (
                                            <span
                                              className={cn(
                                                PILL_BASE,
                                                PILL_RESERVED,
                                                "ml-1.5",
                                              )}
                                            >
                                              暫定換出
                                            </span>
                                          ) : null}
                                          {card.held && isActive ? (
                                            <span
                                              className={cn(
                                                PILL_BASE,
                                                PILL_HELD,
                                                "ml-1.5",
                                              )}
                                            >
                                              保留
                                            </span>
                                          ) : null}
                                          {card.status === "for_sale" &&
                                          card.askingPrice != null ? (
                                            <span className="ml-2">
                                              {card.askingPrice} 元
                                            </span>
                                          ) : null}
                                          {card.status === "for_trade" &&
                                          card.wantInReturn ? (
                                            <span className="ml-2 text-[var(--text-tertiary)]">
                                              想換：{card.wantInReturn}
                                            </span>
                                          ) : null}
                                        </td>
                                        <td className={TD}>
                                          {card.held && isActive ? (
                                            <div className={ROW_ACTIONS}>
                                              <Button
                                                type="button"
                                                variant="outline"
                                                className={BTN_GHOST_SM}
                                                onClick={() => {
                                                  unholdCard(card.id)
                                                    .then(onDone)
                                                    .catch((e) =>
                                                      setError(String(e)),
                                                    );
                                                }}
                                              >
                                                取消保留
                                              </Button>
                                            </div>
                                          ) : isActive && !card.reserved ? (
                                            <div className={ROW_ACTIONS}>
                                              <Button
                                                type="button"
                                                variant="outline"
                                                className={BTN_GHOST_SM}
                                                onClick={() =>
                                                  setAction({
                                                    cardId: card.id,
                                                    kind: "list_sale",
                                                  })
                                                }
                                              >
                                                待售
                                              </Button>
                                              <Button
                                                type="button"
                                                variant="outline"
                                                className={BTN_GHOST_SM}
                                                onClick={() =>
                                                  setAction({
                                                    cardId: card.id,
                                                    kind: "list_trade",
                                                  })
                                                }
                                              >
                                                待換
                                              </Button>
                                              <Button
                                                type="button"
                                                variant="outline"
                                                className={BTN_GHOST_SM}
                                                onClick={() =>
                                                  setAction({
                                                    cardId: card.id,
                                                    kind: "sale",
                                                  })
                                                }
                                              >
                                                賣出
                                              </Button>
                                              <Button
                                                type="button"
                                                variant="outline"
                                                className={BTN_GHOST_SM}
                                                onClick={() =>
                                                  setAction({
                                                    cardId: card.id,
                                                    kind: "trade",
                                                  })
                                                }
                                              >
                                                交換
                                              </Button>
                                              {card.status !== "owned" ? (
                                                <Button
                                                  type="button"
                                                  variant="outline"
                                                  className={BTN_GHOST_SM}
                                                  onClick={() => {
                                                    patchCard(card.id, {
                                                      status: "owned",
                                                    })
                                                      .then(onDone)
                                                      .catch(() => {});
                                                  }}
                                                >
                                                  取消上架
                                                </Button>
                                              ) : null}
                                              {card.status === "owned" ? (
                                                <Button
                                                  type="button"
                                                  variant="outline"
                                                  className={BTN_GHOST_SM}
                                                  onClick={() => {
                                                    holdCard(card.id)
                                                      .then(onDone)
                                                      .catch((e) =>
                                                        setError(String(e)),
                                                      );
                                                  }}
                                                >
                                                  保留
                                                </Button>
                                              ) : null}
                                            </div>
                                          ) : card.reserved && isActive ? (
                                            <span className="text-reservation">
                                              已鎖定
                                            </span>
                                          ) : (
                                            <span className="text-[var(--text-quaternary)]">
                                              —
                                            </span>
                                          )}
                                        </td>
                                      </tr>
                                      {open && action ? (
                                        <tr>
                                          <td className={TD} colSpan={4}>
                                            <ActionForm
                                              card={card}
                                              catalog={catalog}
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
                          </div>
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <CardWorkspaceSheet
        cell={selectedCell}
        cards={selectedCards}
        catalog={catalog ?? []}
        onOpenChange={(open) => {
          if (!open) setSelectedCatalogId(null);
        }}
        onChanged={reload}
      />
    </section>
  );
}
