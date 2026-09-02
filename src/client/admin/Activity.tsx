import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { EMPTY_MSG, STATE_MSG } from "@/shared/states";
import { useEffect, useMemo, useState } from "react";
import type {
  ActivityEvent,
  ActivityKind,
  ActivityLine,
  CardStatus,
} from "../../shared/types";
import { fetchActivities, undoActivity } from "../api";

type ActivityFilter = "all" | "collection" | "trade" | "adjustment";

const FILTERS: Array<{ id: ActivityFilter; label: string }> = [
  { id: "all", label: "全部" },
  { id: "collection", label: "入藏" },
  { id: "trade", label: "交易" },
  { id: "adjustment", label: "調整" },
];

const EVENT_LABEL: Record<ActivityKind, string> = {
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
  trade_post_published: "發布交換公告",
  trade_post_closed: "關閉交換公告",
  purchase_ordered: "建立購入預約",
  purchase_received: "購入到貨",
  purchase_cancelled: "取消購入預約",
  undo: "復原入藏紀錄",
};

const STATUS_LABEL: Record<CardStatus, string> = {
  owned: "持有",
  for_sale: "待售",
  for_trade: "待換",
  sold: "已售出",
  traded: "已交換",
};

const COLLECTION_KINDS = new Set<ActivityKind>([
  "opening",
  "purchase",
  "acquisition",
  "purchase_ordered",
  "purchase_received",
  "purchase_cancelled",
]);
const TRADE_KINDS = new Set<ActivityKind>([
  "sale",
  "trade",
  "trade_reserved",
  "trade_reservation_cancelled",
  "trade_completed",
  "trade_post_published",
  "trade_post_closed",
]);

function eventFilter(kind: ActivityKind): Exclude<ActivityFilter, "all"> {
  if (COLLECTION_KINDS.has(kind)) return "collection";
  if (TRADE_KINDS.has(kind)) return "trade";
  return "adjustment";
}

function dayOf(event: ActivityEvent): string {
  return event.occurredAt.slice(0, 10);
}

function dayLabel(day: string): string {
  const parsed = new Date(`${day}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return day;
  return new Intl.DateTimeFormat("zh-TW", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short",
  }).format(parsed);
}

function timeLabel(value: string): string {
  const time = value.match(/[T ](\d{2}:\d{2})/)?.[1];
  return time ?? "日期紀錄";
}

function money(value: number): string {
  return `${new Intl.NumberFormat("zh-TW", {
    maximumFractionDigits: 2,
  }).format(value)} 元`;
}

function lineAction(line: ActivityLine): string {
  if (line.action === "classified" && line.beforeStatus && line.afterStatus) {
    return `${STATUS_LABEL[line.beforeStatus]} → ${STATUS_LABEL[line.afterStatus]}`;
  }
  if (line.action === "held") return "設為保留";
  if (line.action === "released") return "取消保留";
  if (line.action === "updated") return "更新資料";
  if (line.action === "wanted") {
    return `Want ${line.beforeWant ?? 0} → ${line.afterWant ?? 0}`;
  }
  if (line.action === "ordered") return `預訂 ×${line.qty}`;
  if (line.action === "reserved_give") return `預約換出 ×${line.qty}`;
  if (line.action === "reserved_receive") return `預約換入 ×${line.qty}`;
  if (line.action === "advertised_give") return `公告換出 ×${line.qty}`;
  if (line.action === "advertised_want") return `公告想找 ×${line.qty}`;
  if (line.action === "cancelled") return `取消 ×${line.qty}`;
  if (line.action === "undone") return `移除 ×${line.qty}`;
  if (line.delta > 0) return `+${line.qty} 張`;
  if (line.delta < 0) return `−${line.qty} 張`;
  return `×${line.qty}`;
}

function EventCard({
  event,
  confirming,
  undoing,
  onAskUndo,
  onCancelUndo,
  onUndo,
}: {
  event: ActivityEvent;
  confirming: boolean;
  undoing: boolean;
  onAskUndo: () => void;
  onCancelUndo: () => void;
  onUndo: () => void;
}) {
  const totalQty = event.lines.reduce((sum, line) => sum + line.qty, 0);

  return (
    <Card
      size="sm"
      className={cn("gap-0 ring-border", event.reversedAt && "opacity-65")}
    >
      <CardHeader className="border-b border-border pb-3">
        <div className="flex min-w-0 items-center gap-2">
          <Badge
            variant={event.kind === "undo" ? "secondary" : "outline"}
            className="shrink-0"
          >
            {eventFilter(event.kind) === "collection"
              ? "入藏"
              : eventFilter(event.kind) === "trade"
                ? "交易"
                : "調整"}
          </Badge>
          <CardTitle className="truncate">{EVENT_LABEL[event.kind]}</CardTitle>
        </div>
        <CardDescription className="flex flex-wrap gap-x-2 gap-y-1">
          <time dateTime={event.occurredAt}>{timeLabel(event.occurredAt)}</time>
          {event.counterparty ? <span>· {event.counterparty}</span> : null}
          {event.amount != null ? <span>· {money(event.amount)}</span> : null}
          {event.note ? <span>· {event.note}</span> : null}
        </CardDescription>
        <CardAction>
          {event.reversedAt ? <Badge variant="secondary">已復原</Badge> : null}
        </CardAction>
      </CardHeader>

      <CardContent className="pt-3">
        {event.lines.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            這筆痕跡沒有卡片明細。
          </p>
        ) : (
          <ul
            className="grid gap-2"
            aria-label={`${EVENT_LABEL[event.kind]}明細`}
          >
            {event.lines.map((line, index) => (
              <li
                key={`${line.catalogId ?? "none"}-${line.action}-${index}`}
                className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-md bg-muted/45 px-3 py-2"
              >
                <span className="min-w-0 flex-1 text-sm text-foreground">
                  {line.series && line.character
                    ? `${line.series} · ${line.character}`
                    : "未連結卡片"}
                </span>
                {line.rarity ? (
                  <Badge variant="outline" className="font-mono">
                    {line.rarity}
                  </Badge>
                ) : null}
                <span
                  className={cn(
                    "font-mono text-xs",
                    line.delta > 0
                      ? "text-primary"
                      : line.delta < 0
                        ? "text-destructive"
                        : "text-muted-foreground",
                  )}
                >
                  {lineAction(line)}
                </span>
                {line.unitAmount != null ? (
                  <span className="w-full text-xs text-muted-foreground">
                    單價 {money(line.unitAmount)}
                  </span>
                ) : null}
                {line.note ? (
                  <span className="w-full text-xs text-muted-foreground">
                    {line.note}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </CardContent>

      <CardFooter className="mt-3 min-h-12 justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          {event.kind === "undo" && event.revertsEventId
            ? `復原痕跡 #${event.revertsEventId}`
            : `${event.lines.length} 種明細 · ${totalQty} 張`}
        </p>
        {event.canUndo && !confirming ? (
          <Button type="button" variant="ghost" size="sm" onClick={onAskUndo}>
            復原這筆入藏
          </Button>
        ) : null}
        {event.canUndo && confirming ? (
          <div className="flex flex-wrap items-center justify-end gap-2">
            <span className="text-xs text-muted-foreground">
              將移除這筆新增的卡片
            </span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={undoing}
              onClick={onCancelUndo}
            >
              返回
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              disabled={undoing}
              onClick={onUndo}
            >
              {undoing ? "復原中…" : "確認復原"}
            </Button>
          </div>
        ) : null}
      </CardFooter>
    </Card>
  );
}

export function Activity() {
  const [events, setEvents] = useState<ActivityEvent[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<ActivityFilter>("all");
  const [confirmingId, setConfirmingId] = useState<number | null>(null);
  const [undoingId, setUndoingId] = useState<number | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetchActivities()
      .then((rows) => {
        if (active) setEvents(rows);
      })
      .catch((caught) => {
        if (active) setError(String(caught));
      });
    return () => {
      active = false;
    };
  }, []);

  const visible = useMemo(
    () =>
      (events ?? []).filter(
        (event) => filter === "all" || eventFilter(event.kind) === filter,
      ),
    [events, filter],
  );
  const grouped = useMemo(() => {
    const groups = new Map<string, ActivityEvent[]>();
    for (const event of visible) {
      const day = dayOf(event);
      const current = groups.get(day) ?? [];
      current.push(event);
      groups.set(day, current);
    }
    return [...groups.entries()];
  }, [visible]);

  const handleUndo = async (id: number) => {
    setUndoingId(id);
    setError(null);
    setMessage(null);
    try {
      await undoActivity(id);
      setConfirmingId(null);
      setMessage("已復原入藏；原痕跡與復原痕跡都會保留。");
      try {
        setEvents(await fetchActivities());
      } catch {
        setError("復原已完成，但痕跡未能重新載入；請重新整理頁面。");
      }
    } catch (caught) {
      setError(String(caught));
    } finally {
      setUndoingId(null);
    }
  };

  if (events === null && !error) {
    return <div className={STATE_MSG}>載入痕跡中…</div>;
  }

  return (
    <section aria-labelledby="activity-title" className="grid gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="grid gap-1.5">
          <h2
            id="activity-title"
            className="font-serif text-xl font-medium tracking-[0.04em] text-foreground"
          >
            痕跡
          </h2>
          <p className="max-w-2xl text-sm text-muted-foreground">
            新增、狀態調整、預約與成交都集中在同一條事件流。尚未被修改或使用的直接入藏與開卡紀錄可以安全復原。
          </p>
        </div>
        <fieldset className="m-0 flex min-w-0 flex-wrap gap-2 border-0 p-0">
          <legend className="sr-only">痕跡篩選</legend>
          {FILTERS.map((option) => (
            <Button
              key={option.id}
              type="button"
              size="sm"
              variant={filter === option.id ? "secondary" : "ghost"}
              aria-pressed={filter === option.id}
              onClick={() => setFilter(option.id)}
            >
              {option.label}
            </Button>
          ))}
        </fieldset>
      </header>

      {message ? (
        <output className="block text-sm text-primary">{message}</output>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}

      {events === null ? null : visible.length === 0 ? (
        <div className={EMPTY_MSG}>
          {events?.length === 0 ? "尚無痕跡。" : "這個分類目前沒有痕跡。"}
        </div>
      ) : (
        <div className="grid gap-8">
          {grouped.map(([day, dayEvents]) => (
            <section key={day} aria-labelledby={`activity-day-${day}`}>
              <h3
                id={`activity-day-${day}`}
                className="mb-3 text-xs font-medium tracking-[0.14em] text-muted-foreground"
              >
                {dayLabel(day)}
              </h3>
              <div className="grid gap-3">
                {dayEvents.map((event) => (
                  <EventCard
                    key={event.id}
                    event={event}
                    confirming={confirmingId === event.id}
                    undoing={undoingId === event.id}
                    onAskUndo={() => setConfirmingId(event.id)}
                    onCancelUndo={() => setConfirmingId(null)}
                    onUndo={() => handleUndo(event.id)}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </section>
  );
}
