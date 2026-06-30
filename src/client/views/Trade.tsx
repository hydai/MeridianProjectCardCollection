import { Button } from "@/components/ui/button";
import { Check, Copy } from "lucide-react";
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
    <div className="pending-card">
      <div className="pending-date">{p.reservedAt}</div>
      <table className="pending-table">
        <thead>
          <tr>
            <th>稀有度</th>
            <th>給出</th>
            <th>換入</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={`${row.rarity}-${i}`}>
              <td>
                <MissChip
                  ri={RARITIES.indexOf(row.rarity)}
                  label={row.rarity}
                />
              </td>
              <td>{row.give ?? "—"}</td>
              <td>{row.receive ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
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
      cls: "ts-all",
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
        cls: `ts-${RARITY_KEYS[ri]}`,
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

  const toggle = (f: Filter) =>
    setFilter((cur) => (cur === f && f !== "all" ? "all" : f));

  return (
    <section className="view view-trade">
      <div className="trade-summary">
        {summaryCards.map((c) => (
          <button
            type="button"
            key={c.key}
            className={`trade-sum-card ${c.shortfall ? "shortfall" : ""} ${
              filter === c.key ? "active" : ""
            }`}
            onClick={() => toggle(c.key)}
          >
            <div className={`trade-sum-rarity ${c.cls}`}>{c.label}</div>
            <div className="trade-sum-nums">
              <span className="ts-need">缺 {c.need}</span>
              <span className="ts-sep">↔</span>
              <span className="ts-spare">餘 {c.spare}</span>
            </div>
          </button>
        ))}
      </div>
      {showWarning ? (
        <div className="trade-warning">
          ⚠ <strong>UR 沒有任何多餘可換出</strong>，但還缺 {urNeed}{" "}
          張。同階互換補不齊 UR，需用多張低階卡換 1 張 UR，或直接購入。其餘 R /
          SR / SSR 的重複都足以換回所缺。
        </div>
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
        <section className="pending-list">
          <h3 className="trade-panel-title">暫定交換列表</h3>
          {pending.map((p) => (
            <PendingCard key={p.id} p={p} />
          ))}
        </section>
      ) : null}
    </section>
  );
}
