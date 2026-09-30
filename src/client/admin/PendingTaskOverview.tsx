import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  fetchAdminPendingPurchases,
  fetchAdminPendingSales,
  fetchAdminPendingTrades,
} from "../api";

const TASKS = [
  { id: "purchase", label: "購入待收", load: fetchAdminPendingPurchases },
  { id: "reserve", label: "交換待完成", load: fetchAdminPendingTrades },
  { id: "sales", label: "出售待完成", load: fetchAdminPendingSales },
] as const;
export type PendingTaskId = (typeof TASKS)[number]["id"];
type Counts = Record<PendingTaskId, number | null>;

export function usePendingTaskCounts(enabled: boolean, activeTab: string) {
  const [counts, setCounts] = useState<Counts>({
    purchase: null,
    reserve: null,
    sales: null,
  });
  const [loading, setLoading] = useState(false);
  const generation = useRef(0);
  const revisions = useRef({ purchase: 0, reserve: 0, sales: 0 });
  const updateCount = useCallback((id: PendingTaskId, count: number | null) => {
    revisions.current[id]++;
    setCounts((current) => ({ ...current, [id]: count }));
  }, []);
  const refresh = useCallback(
    async (includeActive = true) => {
      if (!enabled) return;
      const request = ++generation.current;
      const tasks = TASKS.filter(
        (task) => includeActive || task.id !== activeTab,
      );
      const initialRevisions = { ...revisions.current };
      setLoading(true);
      const results = await Promise.allSettled(
        tasks.map(async (task) => {
          const items = await task.load();
          if (!Array.isArray(items))
            throw new Error("Invalid reservation response");
          return items.length;
        }),
      );
      if (request !== generation.current) return;
      setCounts((current) => {
        const next = { ...current };
        tasks.forEach((task, index) => {
          if (initialRevisions[task.id] !== revisions.current[task.id]) return;
          const result = results[index];
          next[task.id] = result.status === "fulfilled" ? result.value : null;
        });
        return next;
      });
      setLoading(false);
    },
    [enabled, activeTab],
  );
  useEffect(() => {
    void refresh(false);
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);
    return () => {
      generation.current++;
      window.removeEventListener("focus", onFocus);
    };
  }, [refresh]);
  return { counts, loading, refresh, updateCount };
}

export function PendingTaskOverview({
  counts,
  loading,
  onRefresh,
  onSelect,
}: {
  counts: Counts;
  loading: boolean;
  onRefresh: () => void;
  onSelect: (tab: PendingTaskId) => void;
}) {
  return (
    <section aria-label="待處理交易" className="mb-6 grid gap-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          待處理交易 · 以預約筆數計算
        </p>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="更新待處理筆數"
          disabled={loading}
          onClick={onRefresh}
        >
          <RefreshCw aria-hidden="true" data-icon="inline-start" />
        </Button>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {TASKS.map((task) => {
          const count = counts[task.id];
          const summary =
            count === null ? (loading ? "載入中…" : "待更新") : `${count} 筆`;
          return (
            <Button
              key={task.id}
              type="button"
              variant="outline"
              className="h-auto min-h-16 flex-col gap-2 px-2 py-3"
              aria-label={`前往${task.label}（${summary}）`}
              onClick={() => onSelect(task.id)}
            >
              {task.label}
              <Badge variant="secondary">{summary}</Badge>
            </Button>
          );
        })}
      </div>
    </section>
  );
}
