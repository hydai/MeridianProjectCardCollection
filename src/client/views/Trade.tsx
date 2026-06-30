import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";
import { Check, Copy, TriangleAlert } from "lucide-react";
import { useRef, useState } from "react";
import type { PublicPendingTrade, ReservationLine } from "../../shared/types";
import {
  type Matrix,
  RARITIES,
  RARITY_KEYS,
  type TradeItem,
  computeTradeWithPending,
  formatTradeList,
} from "../collection";
import { MissChip } from "./shared";

type Filter = "all" | "r" | "sr" | "ssr" | "ur";
const RK_NAME: Record<string, string> = {
  r: "R",
  sr: "SR",
  ssr: "SSR",
  ur: "UR",
};

interface PendingRow {
  rarity: (typeof RARITIES)[number];
  give: string | null;
  receive: string | null;
}

// Expand by qty and pair give/receive by rarity for a compact display table.
function pendingRows(
  give: ReservationLine[],
  receive: ReservationLine[],
): PendingRow[] {
  const label = (l: ReservationLine) => `${l.series} ${l.character}`;
  const expand = (lines: ReservationLine[]) =>
    lines
      .flatMap((l) => Array.from({ length: l.qty }, () => l))
      .sort((a, b) => RARITIES.indexOf(a.rarity) - RARITIES.indexOf(b.rarity));
  const g = expand(give);
  const r = expand(receive);
  const rows: PendingRow[] = [];
  for (let i = 0; i < Math.max(g.length, r.length); i++) {
    const gi = g[i];
    const ri = r[i];
    rows.push({
      rarity: (gi ?? ri).rarity,
      give: gi ? label(gi) : null,
      receive: ri ? label(ri) : null,
    });
  }
  return rows;
}

function PendingCard({ p }: { p: PublicPendingTrade }) {
  const rows = pendingRows(p.give, p.receive);
  return (
    <Card className="mt-3 gap-0 rounded-[10px] border border-border bg-card px-3.5 py-3 ring-0">
      <div className="mb-1.5 text-xs text-[var(--text-tertiary)]">
        {p.reservedAt}
      </div>
      <Table>
        <TableHeader>
          <TableRow className="border-0 hover:bg-transparent">
            <TableHead className="h-auto px-2 py-1 text-left">稀有度</TableHead>
            <TableHead className="h-auto px-2 py-1 text-left">給出</TableHead>
            <TableHead className="h-auto px-2 py-1 text-left">換入</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row, i) => (
            <TableRow
              key={`${row.rarity}-${i}`}
              className="border-0 hover:bg-transparent"
            >
              <TableCell className="px-2 py-1">
                <MissChip
                  ri={RARITIES.indexOf(row.rarity)}
                  label={row.rarity}
                />
              </TableCell>
              <TableCell className="px-2 py-1 text-left text-foreground">
                {row.give ?? "—"}
              </TableCell>
              <TableCell className="px-2 py-1 text-left text-foreground">
                {row.receive ?? "—"}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  );
}

function CopyButton({
  text,
  label,
  disabled,
}: { text: string; label: string; disabled: boolean }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onClick = () => {
    navigator.clipboard
      .writeText(text)
      .then(() => {
        setCopied(true);
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => setCopied(false), 1500);
      })
      .catch(() => {
        /* clipboard unavailable (insecure context) — skip feedback */
      });
  };
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="size-6 text-[var(--text-tertiary)] hover:text-foreground"
      onClick={onClick}
      disabled={disabled}
      aria-label={copied ? "已複製" : label}
      title={label}
    >
      {copied ? <Check /> : <Copy />}
    </Button>
  );
}

export function Trade({
  m,
  pending,
}: { m: Matrix; pending?: PublicPendingTrade[] }) {
  const [filter, setFilter] = useState<Filter>("all");
  const { surplus, needs } = computeTradeWithPending(m, pending ?? []);
  const totalSpare = surplus.reduce((s, x) => s + x.spare, 0);

  const filterItems = (items: TradeItem[]) =>
    filter === "all"
      ? items
      : items.filter((x) => RARITY_KEYS[x.ri] === filter);

  const fSurplus = filterItems(surplus);
  const fNeeds = filterItems(needs);

  const summaryCards: {
    key: Filter;
    label: string;
    cls: string;
    need: number;
    spare: number;
    shortfall: boolean;
  }[] = [
    {
      key: "all",
      label: "全部",
      cls: "text-muted-foreground",
      need: needs.length,
      spare: totalSpare,
      shortfall: false,
    },
    ...RARITIES.map((rarity, ri) => {
      const need = needs.filter((x) => x.ri === ri).length;
      const spare = surplus
        .filter((x) => x.ri === ri)
        .reduce((s, x) => s + x.spare, 0);
      return {
        key: RARITY_KEYS[ri] as Filter,
        label: rarity,
        cls: [
          "text-rarity-r",
          "text-rarity-sr",
          "text-rarity-ssr",
          "text-rarity-ur",
        ][ri],
        need,
        spare,
        shortfall: need > spare,
      };
    }),
  ];

  const groupedList = (items: TradeItem[], kind: "surplus" | "needs") =>
    [3, 2, 1, 0].map((ri) => {
      const ritems = items.filter((x) => x.ri === ri);
      if (ritems.length === 0) return null;
      const headCount =
        kind === "surplus"
          ? `${ritems.reduce((s, x) => s + x.spare, 0)} 張`
          : `缺 ${ritems.length}`;
      return (
        <div className="trade-rgroup" key={RARITIES[ri]}>
          <div className={`trade-rhead ts-${RARITY_KEYS[ri]}`}>
            {RARITIES[ri]}
            <span className="trade-rcount">{headCount}</span>
          </div>
          {m.series.map((sname, si) => {
            const sitems = ritems.filter((x) => x.si === si);
            if (sitems.length === 0) return null;
            return (
              <div className="trade-series-row" key={sname}>
                <span className="trade-series-label">{sname}</span>
                <span className="trade-names">
                  {sitems.map((x) => (
                    <span className="trade-name" key={m.characters[x.ci]}>
                      {m.characters[x.ci]}
                      {kind === "surplus" ? (
                        <span className="trade-x">×{x.spare}</span>
                      ) : null}
                    </span>
                  ))}
                </span>
              </div>
            );
          })}
        </div>
      );
    });

  const panelBody = (filtered: TradeItem[], kind: "surplus" | "needs") => {
    if (filtered.length === 0) {
      const rname = filter === "all" ? "" : `${RK_NAME[filter]} `;
      return (
        <div className="trade-empty">
          {kind === "surplus"
            ? `目前沒有多餘的 ${rname}卡可換出。`
            : `${rname}已全部收集 ✓`}
        </div>
      );
    }
    return groupedList(filtered, kind);
  };

  const surplusSub = `多餘 ${fSurplus.reduce((s, x) => s + x.spare, 0)} 張`;
  const needsSub = `缺 ${fNeeds.length} 種`;

  const urNeed = needs.filter((x) => x.ri === 3).length;
  const urSpare = surplus.filter((x) => x.ri === 3).length;
  const showWarning =
    (filter === "all" || filter === "ur") && urNeed > 0 && urSpare === 0;

  const sumItemClass = (key: Filter, shortfall: boolean) =>
    cn(
      "flex h-auto w-full flex-col items-stretch justify-start gap-2 rounded-[4px] border-[0.5px] border-border bg-card px-2.5 py-3.5 text-center transition-colors select-none hover:bg-card hover:[border-color:var(--border-strong)] hover:text-foreground max-sm:px-1.5 max-sm:py-[11px]",
      shortfall && filter !== key && "border-rarity-ur/40 bg-[var(--ur-soft)]",
      filter === key &&
        "border-primary bg-secondary shadow-[inset_0_0_0_0.5px_rgba(201,161,74,0.45)]",
    );

  return (
    <section className="view view-trade">
      <ToggleGroup
        type="single"
        value={filter}
        onValueChange={(v) => setFilter((v || "all") as Filter)}
        className="mb-[18px] grid w-full grid-cols-5 gap-2.5 max-sm:gap-[7px]"
      >
        {summaryCards.map((c) => (
          <ToggleGroupItem
            key={c.key}
            value={c.key}
            aria-label={c.label}
            className={sumItemClass(c.key, c.shortfall)}
          >
            <div
              className={cn(
                "mb-2 font-mono text-sm font-medium tracking-[0.08em] max-sm:text-xs",
                c.cls,
              )}
            >
              {c.label}
            </div>
            <div className="flex items-center justify-center gap-1.5 font-mono text-xs max-sm:flex-col max-sm:gap-1 max-sm:text-[11px]">
              <span className="text-muted-foreground">缺 {c.need}</span>
              <span className="text-[11px] text-[var(--text-quaternary)] max-sm:hidden">
                ↔
              </span>
              <span className="text-foreground">餘 {c.spare}</span>
            </div>
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      {showWarning ? (
        <Alert className="mb-[22px] gap-1 rounded-[4px] border-[0.5px] border-rarity-ur/35 bg-[var(--ur-soft)] px-[18px] py-3.5 text-[13px] leading-[1.6] text-muted-foreground">
          <TriangleAlert className="text-rarity-ur" />
          <AlertTitle className="font-medium text-rarity-ur">
            UR 沒有任何多餘可換出
          </AlertTitle>
          <AlertDescription className="text-[13px] leading-[1.6] text-muted-foreground">
            還缺 {urNeed} 張。同階互換補不齊 UR，需用多張低階卡換 1 張
            UR，或直接購入。其餘 R / SR / SSR 的重複都足以換回所缺。
          </AlertDescription>
        </Alert>
      ) : null}
      <div className="trade-grid">
        <section className="trade-panel">
          <h3 className="trade-panel-title">
            <span className="trade-panel-titletext">
              可換出
              <CopyButton
                text={formatTradeList(fSurplus, m, "surplus")}
                label="複製可換出清單"
                disabled={fSurplus.length === 0}
              />
            </span>
            <span className="trade-panel-sub">{surplusSub}</span>
          </h3>
          {panelBody(fSurplus, "surplus")}
        </section>
        <section className="trade-panel">
          <h3 className="trade-panel-title">
            <span className="trade-panel-titletext">
              想換入
              <CopyButton
                text={formatTradeList(fNeeds, m, "needs")}
                label="複製想換入清單"
                disabled={fNeeds.length === 0}
              />
            </span>
            <span className="trade-panel-sub">{needsSub}</span>
          </h3>
          {panelBody(fNeeds, "needs")}
        </section>
      </div>
      {pending && pending.length > 0 ? (
        <section className="mt-6">
          <h3 className="trade-panel-title">暫定交換列表</h3>
          {pending.map((p) => (
            <PendingCard key={p.id} p={p} />
          ))}
        </section>
      ) : null}
    </section>
  );
}
