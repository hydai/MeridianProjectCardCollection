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
import { Toggle } from "@/components/ui/toggle";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";
import { Check, Copy, TriangleAlert } from "lucide-react";
import { useRef, useState } from "react";
import type { PublicPendingTrade, ReservationLine } from "../../shared/types";
import {
  type Matrix,
  RARITIES,
  RARITY_KEYS,
  type RarityKey,
  type TradeItem,
  computeTradeWithPending,
  exists,
  formatTradeList,
} from "../collection";
import {
  CARD_FRAME,
  EMPTY_MSG,
  MODE_BTN,
  MODE_TOGGLE,
  MissChip,
  PANEL_GRID,
  PANEL_TITLE,
  Panel,
  RARITY_TEXT,
} from "./shared";

type Filter = "all" | RarityKey;

type TradeMode = "list" | "grid";

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
    // In an insecure context (e.g. http:// on a LAN IP) the Clipboard API is
    // absent and `navigator.clipboard` is undefined; guard before use, since a
    // `.catch()` cannot trap the synchronous throw from that member access.
    if (!navigator.clipboard) return;
    navigator.clipboard
      .writeText(text)
      .then(() => {
        setCopied(true);
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => setCopied(false), 1500);
      })
      .catch(() => {
        /* write rejected (e.g. permission denied) — skip feedback */
      });
  };
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="size-6 cursor-pointer text-[var(--text-tertiary)] hover:text-foreground"
      onClick={onClick}
      disabled={disabled}
      aria-label={copied ? "已複製" : label}
      title={label}
    >
      {copied ? <Check /> : <Copy />}
    </Button>
  );
}

// --- Grid-mode chrome ---------------------------------------------------
// Grid.tsx 的格線/邊框 chrome 本地副本，讓收集格表（Grid.tsx）維持不動。
// 若 Grid.tsx 的格表樣式調整，這裡需一併同步。
const TG_BORDER_STRONG_B = "[border-bottom:0.5px_solid_var(--border-strong)]";
const TG_BORDER_STRONG_R = "[border-right:0.5px_solid_var(--border-strong)]";
const TG_BORDER_STRONG_L = "[border-left:0.5px_solid_var(--border-strong)]";
const TG_CELL_BASE =
  "h-8 w-8 border-b-[0.5px] border-border p-0 text-center text-xs leading-none max-sm:h-7 max-sm:w-[26px]";
// 有值格：金色「持有」底（同 Grid.tsx 數量模式的 HAVE_TINT）。
// 可換出與想換入共用同一個金底，維持兩表底色一致。
const TG_HAVE_TINT = "bg-[rgba(201,161,74,0.16)] font-semibold text-primary";

// 角色 × 系列稀有度明細格表。surplus/needs 共用；差異在格子數值與填色。
// items 傳入完整 surplus 或 needs（未經 rarity 篩選）；shownRi 決定顯示哪些稀有度欄。
function TradeGrid({
  m,
  items,
  kind,
  shownRi,
}: {
  m: Matrix;
  items: TradeItem[];
  kind: "surplus" | "needs";
  shownRi: number[];
}) {
  // 值查表：surplus→spare、needs→1；僅收錄 shownRi。
  const val = new Map<string, number>();
  for (const it of items) {
    if (!shownRi.includes(it.ri)) continue;
    val.set(`${it.si}|${it.ci}|${it.ri}`, kind === "surplus" ? it.spare : 1);
  }

  // 逐系列只展開「真的有資料」的稀有度子欄，避免聯集（或全部）時出現整欄皆空
  // 的稀有度子欄；再據此留下有東西的角色列。
  const cols = m.series
    .map((_s, si) => ({
      si,
      ris: shownRi.filter((ri) =>
        m.characters.some((_c, ci) => val.has(`${si}|${ci}|${ri}`)),
      ),
    }))
    .filter((c) => c.ris.length > 0);
  const shownCi = m.characters
    .map((_c, ci) => ci)
    .filter((ci) =>
      cols.some((c) => c.ris.some((ri) => val.has(`${c.si}|${ci}|${ri}`))),
    );

  if (cols.length === 0 || shownCi.length === 0) {
    return (
      <div className={EMPTY_MSG}>
        {kind === "surplus" ? "目前沒有多餘的卡可換出。" : "已全部收集 ✓"}
      </div>
    );
  }

  return (
    <div
      className={`trade-grid overflow-x-auto ${CARD_FRAME}`}
      data-kind={kind}
    >
      <table className="trade-grid-table w-full border-collapse text-xs">
        <thead>
          <tr>
            <th
              rowSpan={2}
              className={`sticky left-0 z-[3] w-[92px] min-w-[92px] whitespace-nowrap bg-secondary px-3.5 py-2.5 text-left font-sans text-[11px] font-normal tracking-[0.15em] text-muted-foreground ${TG_BORDER_STRONG_B} ${TG_BORDER_STRONG_R} max-sm:w-[76px] max-sm:min-w-[76px] max-sm:px-2.5 max-sm:py-2 max-sm:text-[10px] max-sm:tracking-[0.1em]`}
            >
              角色
            </th>
            {cols.map((c) => (
              <th
                key={m.series[c.si]}
                colSpan={c.ris.length}
                className={`trade-grid-series-head border-b-[0.5px] border-border bg-secondary px-1.5 pt-2.5 pb-2 text-center font-accent text-xs font-medium uppercase italic tracking-[0.12em] text-foreground ${TG_BORDER_STRONG_L} max-sm:px-1 max-sm:pt-2 max-sm:pb-1.5 max-sm:text-[11px]`}
              >
                {m.series[c.si]}
              </th>
            ))}
          </tr>
          <tr>
            {cols.map((c) =>
              c.ris.map((ri, localRi) => (
                <th
                  key={`${m.series[c.si]}-${RARITIES[ri]}`}
                  className={`trade-grid-rarity-head min-w-[32px] bg-secondary px-0 py-1.5 text-center font-mono text-[10px] font-medium ${TG_BORDER_STRONG_B} max-sm:min-w-[26px] max-sm:text-[9px] ${RARITY_TEXT[ri]} ${
                    localRi === 0 ? TG_BORDER_STRONG_L : ""
                  }`}
                >
                  {RARITIES[ri]}
                </th>
              )),
            )}
          </tr>
        </thead>
        <tbody>
          {shownCi.map((ci) => (
            <tr key={m.characters[ci]} className="group/row">
              <td
                className={`sticky left-0 z-[2] w-[92px] min-w-[92px] overflow-hidden text-ellipsis whitespace-nowrap bg-card px-3.5 py-[9px] text-left font-sans text-[13px] text-foreground ${TG_BORDER_STRONG_R} group-hover/row:bg-secondary max-sm:w-[76px] max-sm:min-w-[76px] max-sm:px-2.5 max-sm:py-2 max-sm:text-xs`}
              >
                {m.characters[ci]}
              </td>
              {cols.map((c) =>
                c.ris.map((ri, localRi) => {
                  const si = c.si;
                  const startCls = localRi === 0 ? TG_BORDER_STRONG_L : "";
                  const cellKey = `${m.series[si]}-${RARITIES[ri]}`;
                  if (!exists(m, si, ci)) {
                    return (
                      <td
                        key={cellKey}
                        className={`${TG_CELL_BASE} trade-grid-na bg-[var(--bg-subtle)] [background-image:repeating-linear-gradient(45deg,transparent,transparent_4px,rgba(255,255,255,0.018)_4px,rgba(255,255,255,0.018)_8px)] ${startCls}`}
                      />
                    );
                  }
                  const v = val.get(`${si}|${ci}|${ri}`);
                  if (v == null) {
                    return (
                      <td
                        key={cellKey}
                        className={`${TG_CELL_BASE} text-muted-foreground/40 ${startCls}`}
                      >
                        ·
                      </td>
                    );
                  }
                  return (
                    <td
                      key={cellKey}
                      className={`${TG_CELL_BASE} ${TG_HAVE_TINT} ${startCls}`}
                    >
                      {v}
                    </td>
                  );
                }),
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Trade({
  m,
  pending,
}: { m: Matrix; pending?: PublicPendingTrade[] }) {
  const [rarities, setRarities] = useState<Set<RarityKey>>(new Set());
  const [mode, setMode] = useState<TradeMode>("list");
  const { surplus, needs } = computeTradeWithPending(m, pending ?? []);
  const totalSpare = surplus.reduce((s, x) => s + x.spare, 0);

  // Empty selection = 顯示全部；否則只顯示所選稀有度的聯集。
  const showAll = rarities.size === 0;
  const toggleRarity = (k: RarityKey) =>
    setRarities((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });

  const filterItems = (items: TradeItem[]) =>
    showAll ? items : items.filter((x) => rarities.has(RARITY_KEYS[x.ri]));

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
        cls: RARITY_TEXT[ri],
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
        <div className="mb-[18px] last:mb-0" key={RARITIES[ri]}>
          <div
            className={cn(
              "mb-2 font-mono text-xs font-medium tracking-[0.08em]",
              RARITY_TEXT[ri],
            )}
          >
            {RARITIES[ri]}
            <span className="ml-1 font-normal text-[var(--text-tertiary)]">
              {headCount}
            </span>
          </div>
          {m.series.map((sname, si) => {
            const sitems = ritems.filter((x) => x.si === si);
            if (sitems.length === 0) return null;
            return (
              <div
                className="grid grid-cols-[88px_1fr] items-start gap-2.5 py-[5px] [&+&]:border-t-[0.5px] [&+&]:border-[var(--border-tertiary)] max-sm:grid-cols-[72px_1fr] max-sm:gap-2"
                key={sname}
              >
                <span className="pt-0.5 font-accent text-[11px] italic uppercase tracking-[0.1em] text-[var(--text-tertiary)] max-sm:text-[10px]">
                  {sname}
                </span>
                <span className="flex flex-wrap gap-x-2.5 gap-y-[5px]">
                  {sitems.map((x) => (
                    <span
                      className="whitespace-nowrap text-[13px] text-foreground max-sm:text-xs"
                      key={m.characters[x.ci]}
                    >
                      {m.characters[x.ci]}
                      {kind === "surplus" ? (
                        <span className="ml-0.5 font-mono text-[10px] text-primary">
                          ×{x.spare}
                        </span>
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
      const rname = showAll
        ? ""
        : `${RARITIES.filter((_r, ri) => rarities.has(RARITY_KEYS[ri])).join("/")} `;
      return (
        <div className={EMPTY_MSG}>
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
    (showAll || rarities.has("ur")) && urNeed > 0 && urSpare === 0;

  const sumItemClass = (active: boolean, shortfall: boolean) =>
    cn(
      "flex h-auto w-full cursor-pointer flex-col items-stretch justify-start gap-2 rounded-[4px] border-[0.5px] border-border bg-card px-2.5 py-3.5 text-center transition-colors select-none hover:bg-card hover:[border-color:var(--border-strong)] hover:text-foreground max-sm:px-1.5 max-sm:py-[11px]",
      // Keep the shortfall tint on hover (the base `hover:bg-card` would win otherwise).
      shortfall &&
        !active &&
        "border-rarity-ur/40 bg-[var(--ur-soft)] hover:bg-[var(--ur-soft)]",
      // `data-[state=on]:bg-secondary` overrides the Toggle primitive's
      // `data-[state=on]:bg-muted` (equal specificity → last wins) so the active
      // card is the lighter elevated fill, not the darkest one.
      active &&
        "border-primary bg-secondary shadow-[inset_0_0_0_0.5px_rgba(201,161,74,0.45)] hover:bg-secondary data-[state=on]:bg-secondary",
    );

  const shownRi = showAll
    ? [0, 1, 2, 3]
    : [0, 1, 2, 3].filter((ri) => rarities.has(RARITY_KEYS[ri]));

  const surplusTitle = (
    <span className="inline-flex items-center gap-2">
      可換出
      <CopyButton
        text={formatTradeList(fSurplus, m, "surplus")}
        label="複製可換出清單"
        disabled={fSurplus.length === 0}
      />
    </span>
  );
  const needsTitle = (
    <span className="inline-flex items-center gap-2">
      想換入
      <CopyButton
        text={formatTradeList(fNeeds, m, "needs")}
        label="複製想換入清單"
        disabled={fNeeds.length === 0}
      />
    </span>
  );

  return (
    <section className="view view-trade">
      <div className="mb-[18px] grid w-full grid-cols-5 gap-2.5 max-sm:gap-[7px]">
        {summaryCards.map((c) => {
          const active =
            c.key === "all" ? showAll : rarities.has(c.key as RarityKey);
          return (
            <Toggle
              key={c.key}
              pressed={active}
              onPressedChange={() =>
                c.key === "all"
                  ? setRarities(new Set())
                  : toggleRarity(c.key as RarityKey)
              }
              aria-label={`${c.label} 缺 ${c.need} 餘 ${c.spare}`}
              className={sumItemClass(active, c.shortfall)}
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
            </Toggle>
          );
        })}
      </div>
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
      <div className="mb-[18px] flex items-center gap-3 px-1">
        <span className="font-mono text-[11px] tracking-[0.08em] text-[var(--text-tertiary)]">
          檢視
        </span>
        <ToggleGroup
          type="single"
          aria-label="交換檢視模式"
          value={mode}
          onValueChange={(v) => v && setMode(v as TradeMode)}
          className={MODE_TOGGLE}
        >
          <ToggleGroupItem value="list" className={MODE_BTN}>
            清單
          </ToggleGroupItem>
          <ToggleGroupItem value="grid" className={MODE_BTN}>
            格表
          </ToggleGroupItem>
        </ToggleGroup>
      </div>
      {mode === "list" ? (
        <div className={PANEL_GRID}>
          <Panel title={surplusTitle} sub={surplusSub}>
            {panelBody(fSurplus, "surplus")}
          </Panel>
          <Panel title={needsTitle} sub={needsSub}>
            {panelBody(fNeeds, "needs")}
          </Panel>
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          <Panel title={surplusTitle} sub={surplusSub}>
            <TradeGrid m={m} items={surplus} kind="surplus" shownRi={shownRi} />
          </Panel>
          <Panel title={needsTitle} sub={needsSub}>
            <TradeGrid m={m} items={needs} kind="needs" shownRi={shownRi} />
          </Panel>
        </div>
      )}
      {pending && pending.length > 0 ? (
        <section className="mt-6">
          <h3
            className={cn(
              PANEL_TITLE,
              "mb-4 border-b-[0.5px] border-border pb-3",
            )}
          >
            暫定交換列表
          </h3>
          {pending.map((p) => (
            <PendingCard key={p.id} p={p} />
          ))}
        </section>
      ) : null}
    </section>
  );
}
