import { cn } from "@/lib/utils";
import type { MarketListing } from "../../shared/types";
import { RARITIES } from "../collection";
import { MissChip, Panel } from "./shared";

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
    <div className="flex flex-wrap items-center gap-2.5 border-b-[0.5px] border-border py-[9px] last:border-b-0">
      <MissChip ri={ri} label={item.rarity} />
      <span className="text-[13px] tracking-[0.02em] text-muted-foreground">
        {item.series} · {item.character}
      </span>
      <span className="ml-auto font-mono text-xs text-foreground">
        {detail}
      </span>
      {item.note ? (
        <span className="basis-full text-xs tracking-[0.02em] text-[var(--text-tertiary)]">
          {item.note}
        </span>
      ) : null}
    </div>
  );
}

function ListingPanel({
  title,
  items,
}: { title: string; items: MarketListing[] }) {
  return (
    <Panel title={title} sub={`${items.length} 張`}>
      {items.map((item) => (
        <ListingRow key={item.cardId} item={item} />
      ))}
    </Panel>
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
        <div className="px-0.5 py-3 text-[13px] tracking-[0.04em] text-[var(--text-tertiary)]">
          無法載入交易資料：{error}
        </div>
      </section>
    );
  }
  if (listings === null) {
    return (
      <section className="view view-market">
        <div className="py-12 text-center font-accent text-base italic tracking-[0.1em] text-[var(--text-tertiary)]">
          載入中…
        </div>
      </section>
    );
  }

  const forSale = listings.filter((l) => l.status === "for_sale");
  const forTrade = listings.filter((l) => l.status === "for_trade");

  if (forSale.length === 0 && forTrade.length === 0) {
    return (
      <section className="view view-market">
        <div className="px-0.5 py-3 text-[13px] tracking-[0.04em] text-[var(--text-tertiary)]">
          目前沒有上架中的卡片。
        </div>
      </section>
    );
  }

  // Only render panels that have listings; a single panel gets a narrower grid.
  const panels = [
    forSale.length > 0 ? (
      <ListingPanel key="sale" title="待售" items={forSale} />
    ) : null,
    forTrade.length > 0 ? (
      <ListingPanel key="trade" title="待換" items={forTrade} />
    ) : null,
  ].filter(Boolean);

  return (
    <section className="view view-market">
      <div
        className={cn(
          "grid grid-cols-2 gap-5 max-sm:grid-cols-1 max-sm:gap-4",
          panels.length === 1 && "max-w-[520px] grid-cols-1",
        )}
      >
        {panels}
      </div>
    </section>
  );
}
