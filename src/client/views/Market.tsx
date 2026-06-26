import type { MarketListing } from "../../shared/types";
import { RARITIES } from "../collection";
import { MissChip } from "./shared";

function ListingRow({ item }: { item: MarketListing }) {
  const ri = RARITIES.indexOf(item.rarity);
  const detail =
    item.status === "for_sale"
      ? item.askingPrice != null
        ? `${item.askingPrice} 元`
        : "價格面議"
      : item.wantInReturn
        ? `想換：${item.wantInReturn}`
        : "開放出價";
  return (
    <div className="market-row">
      <MissChip ri={ri} label={item.rarity} />
      <span className="market-where">
        {item.series} · {item.character}
      </span>
      <span className="market-meta">{detail}</span>
      {item.note ? <span className="market-note">{item.note}</span> : null}
    </div>
  );
}

function Panel({ title, items }: { title: string; items: MarketListing[] }) {
  return (
    <section className="trade-panel">
      <h3 className="trade-panel-title">
        {title}
        <span className="trade-panel-sub">{items.length} 張</span>
      </h3>
      {items.map((item) => (
        <ListingRow key={item.cardId} item={item} />
      ))}
    </section>
  );
}

export function MarketBoard({
  listings,
  error,
}: {
  listings: MarketListing[] | null;
  error?: string | null;
}) {
  if (error) {
    return (
      <section className="view view-market">
        <div className="trade-empty">無法載入交易資料：{error}</div>
      </section>
    );
  }
  if (listings === null) {
    return (
      <section className="view view-market">
        <div className="state-msg">載入中…</div>
      </section>
    );
  }

  const forSale = listings.filter((l) => l.status === "for_sale");
  const forTrade = listings.filter((l) => l.status === "for_trade");

  if (forSale.length === 0 && forTrade.length === 0) {
    return (
      <section className="view view-market">
        <div className="trade-empty">目前沒有上架中的卡片。</div>
      </section>
    );
  }

  // Only render panels that have listings; a single panel gets a narrower grid.
  const panels = [
    forSale.length > 0 ? (
      <Panel key="sale" title="待售" items={forSale} />
    ) : null,
    forTrade.length > 0 ? (
      <Panel key="trade" title="待換" items={forTrade} />
    ) : null,
  ].filter(Boolean);

  return (
    <section className="view view-market">
      <div
        className={`trade-grid${panels.length === 1 ? " trade-grid-single" : ""}`}
      >
        {panels}
      </div>
    </section>
  );
}
