import { useState } from "react";
import {
  type Matrix,
  RARITIES,
  RARITY_KEYS,
  type TradeItem,
  computeTrade,
} from "../collection";

type Filter = "all" | "r" | "sr" | "ssr" | "ur";
const RK_NAME: Record<string, string> = {
  r: "R",
  sr: "SR",
  ssr: "SSR",
  ur: "UR",
};

export function Trade({ m }: { m: Matrix }) {
  const [filter, setFilter] = useState<Filter>("all");
  const { surplus, needs } = computeTrade(m);
  const totalSpare = surplus.reduce((s, x) => s + x.spare, 0);

  const filterItems = (items: TradeItem[]) =>
    filter === "all"
      ? items
      : items.filter((x) => RARITY_KEYS[x.ri] === filter);

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

  const panelBody = (items: TradeItem[], kind: "surplus" | "needs") => {
    const filtered = filterItems(items);
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

  const surplusSub = `多餘 ${filterItems(surplus).reduce((s, x) => s + x.spare, 0)} 張`;
  const needsSub = `缺 ${filterItems(needs).length} 種`;

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
            可換出<span className="trade-panel-sub">{surplusSub}</span>
          </h3>
          {panelBody(surplus, "surplus")}
        </section>
        <section className="trade-panel">
          <h3 className="trade-panel-title">
            想換入<span className="trade-panel-sub">{needsSub}</span>
          </h3>
          {panelBody(needs, "needs")}
        </section>
      </div>
    </section>
  );
}
