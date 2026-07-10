import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { todayLocal } from "@/lib/date";
import { cn } from "@/lib/utils";
import { EMPTY_MSG, STATE_MSG } from "@/shared/states";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Fragment, useCallback, useEffect, useId, useState } from "react";
import type {
  CardRow,
  CardStatus,
  CatalogSeries,
  Rarity,
} from "../../shared/types";
import { fetchCatalog, listCards, patchCard, postTransaction } from "../api";
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
  PILL_RARITY,
  PILL_RESERVED,
  PILL_STATUS,
  ROW_ACTIONS,
  TABLE,
  TD,
  TH,
} from "./ui";

type ActionKind = "list_sale" | "list_trade" | "sale" | "trade";
type StatusFilter = "active" | CardStatus;

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
const RARITY_ORDER: Rarity[] = ["R", "SR", "SSR", "UR"];
const FILTER_BUTTON = cn(
  OPT_TOGGLE,
  "min-h-8 max-w-full break-words px-3 py-1.5 text-center text-xs whitespace-normal tracking-[0.04em]",
);

const STATUS_FILTER_OPTIONS: FilterOption<StatusFilter>[] = [
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
  }

  return Array.from(groups.values());
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
  const [error, setError] = useState<string | null>(null);
  const [action, setAction] = useState<{
    cardId: number;
    kind: ActionKind;
  } | null>(null);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(
    () => new Set(),
  );

  const reload = useCallback(() => {
    setRows(null);
    setError(null);
    listCards()
      .then(setRows)
      .catch((e) => setError(String(e)));
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  useEffect(() => {
    fetchCatalog()
      .then(setCatalog)
      .catch((e) => setError(String(e)));
  }, []);

  const onDone = () => {
    setAction(null);
    reload();
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
  const filteredRows = (rows ?? []).filter((card) => {
    const matchesStatus =
      filterStatus === null ||
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
  const cardGroups = groupCards(filteredRows, rows ?? []);

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
      {rows !== null && catalog !== null ? (
        <output
          className="mb-3 block font-mono text-[11px] text-[var(--text-tertiary)]"
          aria-live="polite"
        >
          顯示 {cardGroups.length} 種卡 · {filteredRows.length} / {rows.length}{" "}
          張
        </output>
      ) : null}
      {rows === null || catalog === null ? (
        error ? null : (
          <div className={STATE_MSG}>載入中…</div>
        )
      ) : filteredRows.length === 0 ? (
        <div className={EMPTY_MSG}>沒有符合的卡片。</div>
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
                <th className={TH}>實體卡明細</th>
              </tr>
            </thead>
            <tbody>
              {cardGroups.map((group, groupIndex) => {
                const expanded = expandedGroups.has(group.key);
                const detailsId = `${detailsIdPrefix}-group-${groupIndex}`;
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
                        </div>
                      </td>
                      <td className={TD}>
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
                              if (next.has(group.key)) next.delete(group.key);
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
                          {expanded ? "收合" : "展開"} {group.cards.length} 張
                        </Button>
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
                                          ) : (
                                            "交換換入"
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
                                          {isActive && !card.reserved ? (
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
    </section>
  );
}
