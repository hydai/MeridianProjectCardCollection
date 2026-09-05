import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useAcquisitionSubmission } from "@/lib/acquisition";
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
  useRef,
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
  reclassifyCard,
  unholdCard,
} from "../api";
import { AcquisitionFeedback } from "./AcquisitionFeedback";
import {
  ACTION_FORM,
  BTN_GHOST_SM,
  CONTROL,
  ERROR_TEXT,
  FIELD_LABEL,
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

type ActionKind =
  | "list_sale"
  | "list_trade"
  | "sale"
  | "trade"
  | "gift"
  | "reclassify";
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
  "gifted",
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
  { value: "gifted", label: "已贈送" },
];

const STATUS_LABEL: Record<string, string> = {
  owned: "持有",
  for_sale: "待售",
  for_trade: "待換",
  sold: "已售出",
  traded: "已交換",
  gifted: "已贈送",
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
          gifted: 0,
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
      gifted: 0,
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
  card_classified: "持有狀態變更",
  card_reclassified: "卡位更正",
  card_updated: "卡片資料更新",
  want_updated: "Want 目標變更",
  hold: "設為保留",
  unhold: "取消保留",
  sale: "售出卡片",
  trade: "交換卡片",
  gift: "贈送卡片",
  trade_reserved: "建立交換預約",
  trade_reservation_cancelled: "取消交換預約",
  trade_completed: "完成交換",
  trade_post_published: "發布交換公告",
  trade_post_closed: "關閉交換公告",
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
  catalogCells = [],
  kind,
  onDone,
  onCancel,
}: {
  card: CardRow;
  catalogCells: OverviewCell[];
  kind: ActionKind;
  onDone: () => void;
  onCancel: () => void;
}) {
  const fieldId = useId();
  const [price, setPrice] = useState("");
  const [want, setWant] = useState("");
  const [counterparty, setCounterparty] = useState("");
  const [happenedAt, setHappenedAt] = useState(todayLocal);
  const [note, setNote] = useState("");
  const currentCatalogId = catalogCells.find(
    (cell) =>
      cell.series === card.series &&
      cell.character === card.character &&
      cell.rarity === card.rarity,
  )?.catalogId;
  const targetCells =
    kind === "reclassify"
      ? catalogCells.filter((cell) => cell.catalogId !== currentCatalogId)
      : catalogCells;
  const [targetCatalogId, setTargetCatalogId] = useState("");
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);
  const [err, setErr] = useState<string | null>(null);
  const selectedTarget = catalogCells.find(
    (cell) => cell.catalogId === Number(targetCatalogId),
  );

  const actionLabel: Record<ActionKind, string> = {
    list_sale: "設為待售",
    list_trade: "設為待換",
    sale: "記錄售出",
    trade: "記錄交換",
    gift: "記錄贈送",
    reclassify: "更正卡位",
  };

  const submit = async () => {
    if (submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setErr(null);
    try {
      const priceText = price.trim();
      const numericPrice = priceText === "" ? undefined : Number(priceText);
      if (
        priceText !== "" &&
        (!/^\d+(?:\.\d{1,2})?$/.test(priceText) ||
          numericPrice === undefined ||
          !Number.isFinite(numericPrice))
      ) {
        throw new Error("金額必須是 0 以上、最多兩位小數的數字。");
      }
      if (
        (kind === "sale" ||
          kind === "trade" ||
          kind === "gift" ||
          kind === "reclassify") &&
        !happenedAt
      ) {
        throw new Error("請選擇日期。");
      }
      if (kind === "list_sale") {
        await patchCard(card.id, {
          status: "for_sale",
          askingPrice: numericPrice ?? null,
        });
      } else if (kind === "list_trade") {
        await patchCard(card.id, {
          status: "for_trade",
          wantInReturn: want.trim() || null,
        });
      } else if (kind === "sale") {
        await postTransaction({
          cardId: card.id,
          type: "sale",
          price: numericPrice,
          counterparty: counterparty.trim() || undefined,
          happenedAt,
          note: note.trim() || undefined,
        });
      } else if (kind === "trade") {
        if (!selectedTarget) throw new Error("請選擇換得的卡位。");
        await postTransaction({
          cardId: card.id,
          type: "trade",
          counterparty: counterparty.trim() || undefined,
          happenedAt,
          note: note.trim() || undefined,
          receivedSeries: selectedTarget.series,
          receivedCharacter: selectedTarget.character,
          receivedRarity: selectedTarget.rarity,
        });
      } else if (kind === "gift") {
        await postTransaction({
          cardId: card.id,
          type: "gift",
          counterparty: counterparty.trim() || undefined,
          happenedAt,
          note: note.trim() || undefined,
        });
      } else {
        if (!selectedTarget) throw new Error("請選擇正確的卡位。");
        await reclassifyCard(card.id, {
          targetCatalogId: selectedTarget.catalogId,
          happenedAt,
          note: note.trim() || undefined,
        });
      }
      onDone();
    } catch (e) {
      submitting.current = false;
      setErr(String(e));
      setBusy(false);
    }
  };

  return (
    <form
      className={ACTION_FORM}
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <p className="mb-3 text-sm font-medium text-foreground">
        {actionLabel[kind]}
      </p>
      <FieldGroup className="gap-3 sm:grid sm:grid-cols-2">
        {kind === "list_sale" || kind === "sale" ? (
          <Field>
            <FieldLabel htmlFor={`${fieldId}-price`}>價格 (TWD)</FieldLabel>
            <Input
              id={`${fieldId}-price`}
              type="number"
              min={0}
              step="0.01"
              inputMode="decimal"
              value={price}
              disabled={busy}
              onChange={(e) => setPrice(e.target.value)}
              placeholder="選填"
            />
          </Field>
        ) : null}
        {kind === "list_trade" ? (
          <Field className="sm:col-span-2">
            <FieldLabel htmlFor={`${fieldId}-want`}>想換的卡 / 條件</FieldLabel>
            <Input
              id={`${fieldId}-want`}
              value={want}
              disabled={busy}
              onChange={(e) => setWant(e.target.value)}
              placeholder="例如 KILLER Kirali UR"
            />
          </Field>
        ) : null}
        {kind === "sale" || kind === "trade" || kind === "gift" ? (
          <Field>
            <FieldLabel htmlFor={`${fieldId}-counterparty`}>
              {kind === "gift" ? "贈與對象" : "對象"}
            </FieldLabel>
            <Input
              id={`${fieldId}-counterparty`}
              maxLength={200}
              value={counterparty}
              disabled={busy}
              onChange={(e) => setCounterparty(e.target.value)}
              placeholder="選填"
            />
          </Field>
        ) : null}
        {kind === "sale" ||
        kind === "trade" ||
        kind === "gift" ||
        kind === "reclassify" ? (
          <Field>
            <FieldLabel htmlFor={`${fieldId}-date`}>日期</FieldLabel>
            <Input
              id={`${fieldId}-date`}
              type="date"
              required
              value={happenedAt}
              disabled={busy}
              onChange={(e) => setHappenedAt(e.target.value)}
            />
          </Field>
        ) : null}
        {kind === "trade" || kind === "reclassify" ? (
          <Field className="sm:col-span-2">
            <FieldLabel htmlFor={`${fieldId}-target`}>
              {kind === "trade" ? "換得卡位" : "正確卡位"}
            </FieldLabel>
            <select
              id={`${fieldId}-target`}
              className={CONTROL}
              value={targetCatalogId}
              disabled={busy}
              required
              onChange={(e) => setTargetCatalogId(e.target.value)}
            >
              {targetCells.length === 0 ? (
                <option value="">沒有其他卡位</option>
              ) : (
                <option value="" disabled>
                  {kind === "trade" ? "請選擇換得卡位" : "請選擇正確卡位"}
                </option>
              )}
              {Array.from(new Set(targetCells.map((cell) => cell.series))).map(
                (series) => (
                  <optgroup key={series} label={series}>
                    {targetCells
                      .filter((cell) => cell.series === series)
                      .map((cell) => (
                        <option key={cell.catalogId} value={cell.catalogId}>
                          {cell.series} · {cell.character} · {cell.rarity}
                        </option>
                      ))}
                  </optgroup>
                ),
              )}
            </select>
            <FieldDescription>
              {kind === "trade"
                ? "完成後會把這個卡位的新卡一併加入收藏。"
                : "只更正這張實體卡的歸屬，不會新增或刪除卡片。"}
            </FieldDescription>
          </Field>
        ) : null}
        {kind === "sale" ||
        kind === "trade" ||
        kind === "gift" ||
        kind === "reclassify" ? (
          <Field className="sm:col-span-2">
            <FieldLabel htmlFor={`${fieldId}-note`}>備註</FieldLabel>
            <Textarea
              id={`${fieldId}-note`}
              maxLength={1000}
              value={note}
              disabled={busy}
              onChange={(e) => setNote(e.target.value)}
              placeholder="選填"
            />
          </Field>
        ) : null}
        <div className="flex flex-wrap items-center gap-2 sm:col-span-2">
          <Button
            type="submit"
            size="sm"
            disabled={
              busy ||
              ((kind === "trade" || kind === "reclassify") &&
                (targetCells.length === 0 || !targetCatalogId))
            }
          >
            {busy ? "處理中…" : "確認"}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onCancel}
            disabled={busy}
          >
            取消
          </Button>
        </div>
      </FieldGroup>
      {err ? (
        <p role="alert" className={cn(ERROR_TEXT, "mt-3")}>
          {err}
        </p>
      ) : null}
    </form>
  );
}

function DirectPurchaseForm({
  cell,
  onDone,
  onCancel,
}: {
  cell: OverviewCell;
  onDone: (quantity: number) => void;
  onCancel: () => void;
}) {
  const fieldId = useId();
  const [quantity, setQuantity] = useState("1");
  const [totalAmount, setTotalAmount] = useState("");
  const [seller, setSeller] = useState("");
  const [occurredAt, setOccurredAt] = useState(todayLocal);
  const [note, setNote] = useState("");
  const submission = useAcquisitionSubmission(`catalog-${cell.catalogId}`);
  const { busy, locked } = submission;
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    const numericQuantity = Number(quantity);
    const amountText = totalAmount.trim();
    if (
      !locked &&
      (!Number.isInteger(numericQuantity) ||
        numericQuantity < 1 ||
        numericQuantity > 99)
    ) {
      setError("張數必須是 1 到 99 的整數。");
      return;
    }
    if (
      !locked &&
      (!/^\d+(?:\.\d{1,2})?$/.test(amountText) ||
        !Number.isFinite(Number(amountText)))
    ) {
      setError("購入總額必須是 0 以上、最多兩位小數的數字。");
      return;
    }
    if (!locked && !occurredAt) {
      setError("請選擇入藏日期。");
      return;
    }

    setError(null);
    const saved = await submission.submit(() => {
      const totalCents = Math.round(Number(amountText) * 100);
      const baseCents = Math.floor(totalCents / numericQuantity);
      const remainder = totalCents % numericQuantity;
      const cards = Array.from({ length: numericQuantity }, (_, index) => ({
        series: cell.series,
        character: cell.character,
        rarity: cell.rarity,
        source: "purchase" as const,
        purchasePrice: (baseCents + (index < remainder ? 1 : 0)) / 100,
      }));
      return {
        cards,
        acquisition: {
          occurredAt,
          counterparty: seller.trim() || undefined,
          note: note.trim() || undefined,
        },
      };
    });
    if (saved) onDone(saved.request.cards.length);
  };

  return (
    <form
      className="rounded-lg border border-border bg-muted/20 p-4"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <AcquisitionFeedback submission={submission} onRetry={submit} />
      <FieldGroup className="gap-3 sm:grid sm:grid-cols-2">
        <Field>
          <FieldLabel htmlFor={`${fieldId}-quantity`}>張數</FieldLabel>
          <Input
            id={`${fieldId}-quantity`}
            type="number"
            min={1}
            max={99}
            step={1}
            inputMode="numeric"
            required
            value={quantity}
            disabled={locked}
            onChange={(event) => setQuantity(event.target.value)}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor={`${fieldId}-amount`}>購入總額 (TWD)</FieldLabel>
          <Input
            id={`${fieldId}-amount`}
            type="number"
            min={0}
            step="0.01"
            inputMode="decimal"
            required
            value={totalAmount}
            disabled={locked}
            onChange={(event) => setTotalAmount(event.target.value)}
            placeholder="必填"
          />
          <FieldDescription>總額會平均分攤到每張實體卡。</FieldDescription>
        </Field>
        <Field>
          <FieldLabel htmlFor={`${fieldId}-seller`}>賣家 / 來源</FieldLabel>
          <Input
            id={`${fieldId}-seller`}
            maxLength={200}
            value={seller}
            disabled={locked}
            onChange={(event) => setSeller(event.target.value)}
            placeholder="選填"
          />
        </Field>
        <Field>
          <FieldLabel htmlFor={`${fieldId}-date`}>入藏日期</FieldLabel>
          <Input
            id={`${fieldId}-date`}
            type="date"
            required
            value={occurredAt}
            disabled={locked}
            onChange={(event) => setOccurredAt(event.target.value)}
          />
        </Field>
        <Field className="sm:col-span-2">
          <FieldLabel htmlFor={`${fieldId}-note`}>備註</FieldLabel>
          <Textarea
            id={`${fieldId}-note`}
            maxLength={1000}
            value={note}
            disabled={locked}
            onChange={(event) => setNote(event.target.value)}
            placeholder="選填"
          />
        </Field>
        <div className="flex flex-wrap items-center gap-2 sm:col-span-2">
          <Button type="submit" size="sm" disabled={locked}>
            {busy ? "記錄中…" : "記錄購入"}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={onCancel}
          >
            取消
          </Button>
        </div>
      </FieldGroup>
      {error ? (
        <p role="alert" className="mt-3 text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </form>
  );
}

function CardWorkspaceSheet({
  cell,
  cards,
  catalogCells,
  revision,
  onOpenChange,
  onChanged,
}: {
  cell: OverviewCell | null;
  cards: CardRow[];
  catalogCells: OverviewCell[];
  revision: number;
  onOpenChange: (open: boolean) => void;
  onChanged: () => Promise<boolean>;
}) {
  const [wantDraft, setWantDraft] = useState<string | null>(null);
  const [wantBusy, setWantBusy] = useState(false);
  const [wantError, setWantError] = useState<string | null>(null);
  const [cardError, setCardError] = useState<string | null>(null);
  const [action, setAction] = useState<{
    cardId: number;
    kind: ActionKind;
  } | null>(null);
  const [activities, setActivities] = useState<ActivityEvent[] | null>(null);
  const [activityError, setActivityError] = useState<string | null>(null);
  const [purchaseOpen, setPurchaseOpen] = useState(false);
  const [purchaseMessage, setPurchaseMessage] = useState<string | null>(null);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [activityRetry, setActivityRetry] = useState(0);
  const [cardBusy, setCardBusy] = useState(false);
  const active = useRef(false);
  const cardInFlight = useRef(false);
  const activityRequest = useRef<{
    catalogId: number;
    revision: number;
    retry: number;
  } | null>(null);
  const catalogId = cell?.catalogId;
  const wantInput = wantDraft ?? String(cell?.wantCount ?? 0);

  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);

  useEffect(() => {
    if (catalogId === undefined) {
      setActivities(null);
      return;
    }
    const request = { catalogId, revision, retry: activityRetry };
    activityRequest.current = request;
    setActivities(null);
    setActivityError(null);
    fetchCatalogActivities(catalogId)
      .then((events) => {
        if (activityRequest.current === request) setActivities(events);
      })
      .catch((error) => {
        if (activityRequest.current === request)
          setActivityError(String(error));
      });
    return () => {
      if (activityRequest.current === request) activityRequest.current = null;
    };
  }, [catalogId, revision, activityRetry]);

  const refresh = async () => {
    const updated = await onChanged();
    if (active.current) {
      setRefreshError(
        updated ? null : "操作已完成，但卡片資料未能重新載入；請重試載入資料。",
      );
    }
    return updated;
  };

  const saveWant = async () => {
    if (!cell || wantBusy) return;
    const wantCount = Number(wantInput);
    if (!Number.isInteger(wantCount) || wantCount < 0 || wantCount > 99) {
      setWantError("Want 張數必須是 0 到 99 的整數。");
      return;
    }
    setWantBusy(true);
    setWantError(null);
    try {
      await putCatalogWant(cell.catalogId, wantCount);
      const updated = await refresh();
      if (updated && active.current) setWantDraft(null);
    } catch (error) {
      if (active.current) setWantError(String(error));
    } finally {
      if (active.current) setWantBusy(false);
    }
  };

  const runCardMutation = async (mutation: () => Promise<unknown>) => {
    if (cardInFlight.current) return;
    cardInFlight.current = true;
    setCardBusy(true);
    setCardError(null);
    try {
      await mutation();
      await refresh();
    } catch (error) {
      if (active.current) setCardError(String(error));
    } finally {
      cardInFlight.current = false;
      if (active.current) setCardBusy(false);
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
              {refreshError ? (
                <Alert variant="destructive">
                  <AlertTitle>卡片資料更新失敗</AlertTitle>
                  <AlertDescription>
                    <p>{refreshError}</p>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => void refresh()}
                    >
                      重新載入卡片資料
                    </Button>
                  </AlertDescription>
                </Alert>
              ) : null}
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
                        disabled={wantBusy}
                        onChange={(event) => setWantDraft(event.target.value)}
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
                          onClick={() => setWantDraft("0")}
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

              <section aria-labelledby="workspace-purchase-title">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3
                      id="workspace-purchase-title"
                      className="text-sm font-medium text-foreground"
                    >
                      直接購入
                    </h3>
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                      已收到卡片時直接入藏；尚未到貨的購入請先建立購入預約。
                    </p>
                  </div>
                  {!purchaseOpen ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setPurchaseOpen(true);
                        setPurchaseMessage(null);
                      }}
                    >
                      記錄購入
                    </Button>
                  ) : null}
                </div>
                {purchaseMessage ? (
                  <Alert className="mt-3 border-primary/30 bg-primary/5">
                    <AlertTitle>購入入藏完成</AlertTitle>
                    <AlertDescription>{purchaseMessage}</AlertDescription>
                  </Alert>
                ) : null}
                {purchaseOpen ? (
                  <div className="mt-3">
                    <DirectPurchaseForm
                      key={cell.catalogId}
                      cell={cell}
                      onDone={async (quantity) => {
                        setPurchaseOpen(false);
                        setPurchaseMessage(
                          `已新增 ${quantity} 張 ${cell.character} ${cell.rarity}。`,
                        );
                        try {
                          await refresh();
                        } catch (cause) {
                          setCardError(
                            `入藏已完成，但資料未能重新載入：${String(cause)}`,
                          );
                        }
                      }}
                      onCancel={() => setPurchaseOpen(false)}
                    />
                  </div>
                ) : null}
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
                            <CardDescription className="grid gap-0.5">
                              <span>{sourceLabel(card)}</span>
                              {card.source === "purchase" &&
                              (card.purchaseSeller ||
                                card.purchaseOrderedAt) ? (
                                <span className="text-xs">
                                  {[
                                    card.purchaseSeller
                                      ? `賣家 ${card.purchaseSeller}`
                                      : "",
                                    card.purchaseOrderedAt
                                      ? `日期 ${card.purchaseOrderedAt}`
                                      : "",
                                  ]
                                    .filter(Boolean)
                                    .join(" · ")}
                                </span>
                              ) : null}
                              {card.purchaseNote ? (
                                <span className="text-xs">
                                  {card.purchaseNote}
                                </span>
                              ) : null}
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
                                  disabled={cardBusy}
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
                                    ["gift", "贈送"],
                                  ] as const
                                ).map(([kind, label]) => (
                                  <Button
                                    key={kind}
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    disabled={cardBusy}
                                    onClick={() =>
                                      setAction({ cardId: card.id, kind })
                                    }
                                  >
                                    {label}
                                  </Button>
                                ))}
                                {card.status === "owned" ? (
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    disabled={cardBusy}
                                    onClick={() =>
                                      setAction({
                                        cardId: card.id,
                                        kind: "reclassify",
                                      })
                                    }
                                  >
                                    卡位更正
                                  </Button>
                                ) : null}
                                {card.status !== "owned" ? (
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    disabled={cardBusy}
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
                                    disabled={cardBusy}
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
                            {actionOpen &&
                            action &&
                            isActive &&
                            !card.reserved &&
                            !card.held ? (
                              <ActionForm
                                key={`${card.id}-${action.kind}`}
                                card={card}
                                catalogCells={catalogCells}
                                kind={action.kind}
                                onDone={() => {
                                  setAction((current) =>
                                    current === action ? null : current,
                                  );
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
                  <div role="alert" className="text-sm text-destructive">
                    <p>{activityError}</p>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setActivityRetry((current) => current + 1)}
                    >
                      重新載入痕跡
                    </Button>
                  </div>
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
                          ) : line?.action === "advertised_give" ? (
                            <p className="mt-1 text-xs text-muted-foreground">
                              公告換出 ×{line.qty}
                            </p>
                          ) : line?.action === "advertised_want" ? (
                            <p className="mt-1 text-xs text-muted-foreground">
                              公告想找 ×{line.qty}
                            </p>
                          ) : line?.action === "reclassified_from" ? (
                            <p className="mt-1 text-xs text-muted-foreground">
                              已從這個卡位移出
                            </p>
                          ) : line?.action === "reclassified_to" ? (
                            <p className="mt-1 text-xs text-muted-foreground">
                              已更正到這個卡位
                            </p>
                          ) : line ? (
                            <p className="mt-1 text-xs text-muted-foreground">
                              {line.delta > 0 ? "+" : ""}
                              {line.delta} 張
                              {line.note ? ` · ${line.note}` : ""}
                            </p>
                          ) : null}
                          {event.counterparty ||
                          event.amount != null ||
                          event.note ? (
                            <p className="mt-1 text-xs text-muted-foreground">
                              {[
                                event.counterparty
                                  ? `對象 ${event.counterparty}`
                                  : "",
                                event.amount != null
                                  ? `${event.amount} 元`
                                  : "",
                                event.note ?? "",
                              ]
                                .filter(Boolean)
                                .join(" · ")}
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
  const catalogRef = useRef<CatalogSeries[] | null>(null);
  const [overview, setOverview] = useState<OverviewResponse | null>(null);
  const [revision, setRevision] = useState(0);
  const requestGeneration = useRef(0);
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
    const generation = ++requestGeneration.current;
    setError(null);
    try {
      const [nextRows, nextOverview, nextCatalog] = await Promise.all([
        listCards(),
        fetchOverview(),
        catalogRef.current ?? fetchCatalog(),
      ]);
      if (generation !== requestGeneration.current) return true;
      setRows(nextRows);
      setOverview(nextOverview);
      catalogRef.current = nextCatalog;
      setCatalog(nextCatalog);
      setRevision((current) => current + 1);
      return true;
    } catch (caught) {
      if (generation !== requestGeneration.current) return true;
      setError(String(caught));
      return false;
    }
  }, []);

  useEffect(() => {
    void reload();
    return () => {
      requestGeneration.current += 1;
    };
  }, [reload]);

  const onDone = () => {
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

      {error ? (
        <div className={ERROR_TEXT} role="alert">
          {error}
          <Button type="button" variant="outline" onClick={() => void reload()}>
            重新載入資料
          </Button>
        </div>
      ) : null}
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
                                      ? `日期 ${card.purchaseOrderedAt}`
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
                                              <Button
                                                type="button"
                                                variant="outline"
                                                className={BTN_GHOST_SM}
                                                onClick={() =>
                                                  setAction({
                                                    cardId: card.id,
                                                    kind: "gift",
                                                  })
                                                }
                                              >
                                                贈送
                                              </Button>
                                              {card.status === "owned" ? (
                                                <Button
                                                  type="button"
                                                  variant="outline"
                                                  className={BTN_GHOST_SM}
                                                  onClick={() =>
                                                    setAction({
                                                      cardId: card.id,
                                                      kind: "reclassify",
                                                    })
                                                  }
                                                >
                                                  卡位更正
                                                </Button>
                                              ) : null}
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
                                                      .catch((cause) =>
                                                        setError(String(cause)),
                                                      );
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
                                      {open &&
                                      action &&
                                      isActive &&
                                      !card.reserved &&
                                      !card.held ? (
                                        <tr>
                                          <td className={TD} colSpan={4}>
                                            <ActionForm
                                              key={`${card.id}-${action.kind}`}
                                              card={card}
                                              catalogCells={overview.cells}
                                              kind={action.kind}
                                              onDone={() => {
                                                setAction((current) =>
                                                  current === action
                                                    ? null
                                                    : current,
                                                );
                                                onDone();
                                              }}
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
        key={selectedCatalogId ?? "closed"}
        cell={selectedCell}
        cards={selectedCards}
        catalogCells={overview?.cells ?? []}
        revision={revision}
        onOpenChange={(open) => {
          if (!open) setSelectedCatalogId(null);
        }}
        onChanged={reload}
      />
    </section>
  );
}
