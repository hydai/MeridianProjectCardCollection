import { CatalogCardVisual } from "@/components/CatalogCardVisual";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Empty, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import type { CatalogImageRef, MarketListing } from "../../shared/types";
import { type Matrix, RARITIES, getImage } from "../collection";

const MARKET_GRID = "grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4";

interface ListingGroup {
  key: string;
  item: MarketListing;
  quantity: number;
  reserved: number;
}

function groupListings(items: MarketListing[]): ListingGroup[] {
  const groups = new Map<string, ListingGroup>();
  for (const item of items) {
    // Only combine copies with the same public terms and condition notes.
    // Irrelevant stale fields (e.g. an old trade wish on a sale) are ignored.
    const key = JSON.stringify([
      item.series,
      item.character,
      item.rarity,
      item.status,
      item.status === "for_sale"
        ? item.askingPrice
        : item.wantInReturn?.trim() || null,
      item.note?.trim() || null,
    ]);
    const existing = groups.get(key);
    if (existing) {
      existing.quantity++;
      existing.reserved += Number(item.reserved);
    } else {
      groups.set(key, {
        key,
        item,
        quantity: 1,
        reserved: Number(item.reserved),
      });
    }
  }
  return [...groups.values()];
}

function listingTerms(item: MarketListing): string {
  return item.status === "for_sale"
    ? item.askingPrice == null
      ? "價格面議"
      : `${item.askingPrice} 元`
    : item.wantInReturn?.trim()
      ? `想換：${item.wantInReturn.trim()}`
      : "開放出價";
}

function ListingQuantity({ group }: { group: ListingGroup }) {
  const available = group.quantity - group.reserved;
  return (
    <div className="flex flex-col gap-1">
      <p className="font-mono text-sm">
        數量 <strong>{group.quantity}</strong> 張
      </p>
      {group.reserved > 0 ? (
        <p className="text-xs text-reservation">
          {available === 0
            ? "暫定交換中"
            : `${group.item.status === "for_sale" ? "可售" : "可換"} ${available} 張`}
          <span className="block">預約 {group.reserved} 張</span>
        </p>
      ) : null}
    </div>
  );
}

function ListingCard({
  group,
  image,
}: { group: ListingGroup; image: CatalogImageRef | null }) {
  const { item } = group;
  const label = `${item.series} ${item.character} ${item.rarity}`;
  return (
    <li className="min-w-0">
      <Card size="sm" className="h-full min-w-0">
        <CardContent>
          <Sheet>
            <SheetTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                className="h-auto w-full p-0"
                aria-label={`查看 ${label} 卡面與上架資訊`}
              >
                <CatalogCardVisual
                  src={image?.url}
                  thumbnailSrc={image?.thumbnailUrl}
                  sizes="(max-width: 639px) calc((100vw - 100px) / 2), (max-width: 767px) 170px, 160px"
                  alt={`${label} 卡面`}
                  className="w-full"
                />
              </Button>
            </SheetTrigger>
            <SheetContent className="overflow-y-auto data-[side=right]:w-full data-[side=right]:sm:max-w-md">
              <SheetHeader className="pr-12">
                <SheetTitle>
                  {item.character} · {item.rarity}
                </SheetTitle>
                <SheetDescription>
                  {item.series} · {item.status === "for_sale" ? "待售" : "待換"}
                </SheetDescription>
              </SheetHeader>
              <div className="flex flex-col gap-5 px-4 pb-6">
                <CatalogCardVisual
                  src={image?.url}
                  thumbnailSrc={image?.thumbnailUrl}
                  sizes="(max-width: 360px) calc(100vw - 32px), 320px"
                  alt={`${label} 放大卡面`}
                  className="mx-auto w-full max-w-80"
                />
                <ListingQuantity group={group} />
                <p className="wrap-anywhere text-sm">
                  {listingTerms(item)}
                  {item.status === "for_sale" && item.askingPrice != null
                    ? "／張"
                    : ""}
                </p>
                {item.note ? (
                  <p className="whitespace-pre-wrap wrap-anywhere text-sm text-muted-foreground">
                    {item.note}
                  </p>
                ) : null}
              </div>
            </SheetContent>
          </Sheet>
        </CardContent>
        <CardHeader>
          <CardTitle asChild>
            <h3 className="flex min-w-0 items-center justify-between gap-2">
              <span className="min-w-0 wrap-anywhere">{item.character}</span>
              <Badge variant="outline">{item.rarity}</Badge>
            </h3>
          </CardTitle>
          <CardDescription className="wrap-anywhere">
            {item.series}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-1 flex-col gap-2">
          <ListingQuantity group={group} />
          {item.note ? (
            <p className="line-clamp-2 wrap-anywhere text-xs text-muted-foreground">
              {item.note}
            </p>
          ) : null}
        </CardContent>
        <CardFooter className="flex-wrap gap-1">
          <p className="min-w-0 wrap-anywhere font-mono text-sm">
            {listingTerms(item)}
          </p>
          {item.status === "for_sale" && item.askingPrice != null ? (
            <span className="text-xs text-muted-foreground">／張</span>
          ) : null}
        </CardFooter>
      </Card>
    </li>
  );
}

function ListingSection({
  title,
  items,
  m,
}: { title: string; items: MarketListing[]; m?: Matrix | null }) {
  const groups = groupListings(items);
  const typeCount = new Set(
    items.map((item) =>
      JSON.stringify([item.series, item.character, item.rarity]),
    ),
  ).size;
  return (
    <section aria-label={title} className="flex flex-col gap-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border pb-3">
        <h2 className="font-serif text-xl">{title}</h2>
        <p className="font-mono text-xs text-muted-foreground">
          {typeCount} 款 · {items.length} 張
        </p>
      </div>
      <ul className={MARKET_GRID} aria-label={`${title}卡片`}>
        {groups.map((group) => {
          const image = m
            ? getImage(
                m,
                m.series.indexOf(group.item.series),
                m.characters.indexOf(group.item.character),
                RARITIES.indexOf(group.item.rarity),
              )
            : null;
          return <ListingCard key={group.key} group={group} image={image} />;
        })}
      </ul>
    </section>
  );
}

export function MarketBoard({
  listings,
  error,
  m,
}: {
  listings: MarketListing[] | null;
  error?: string | null;
  m?: Matrix | null;
}) {
  if (error) {
    return (
      <section className="view view-market">
        <Alert variant="destructive">
          <AlertTitle>無法載入交易資料</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      </section>
    );
  }
  if (listings === null) {
    return (
      <section className="view view-market">
        <output aria-label="載入交易看板" className={MARKET_GRID}>
          <span className="sr-only">載入中…</span>
          {[0, 1, 2, 3].map((index) => (
            <Skeleton key={index} className="aspect-[5/9] w-full" />
          ))}
        </output>
      </section>
    );
  }
  const forSale = listings.filter((item) => item.status === "for_sale");
  const forTrade = listings.filter((item) => item.status === "for_trade");
  if (forSale.length === 0 && forTrade.length === 0) {
    return (
      <section className="view view-market">
        <Empty>
          <EmptyHeader>
            <EmptyTitle>目前沒有上架中的卡片。</EmptyTitle>
          </EmptyHeader>
        </Empty>
      </section>
    );
  }
  return (
    <section className="view view-market flex flex-col gap-8">
      <p className="text-xs text-muted-foreground">
        同款、同條件合併顯示。點卡面可放大查看。
      </p>
      {forSale.length > 0 ? (
        <ListingSection title="待售" items={forSale} m={m} />
      ) : null}
      {forTrade.length > 0 ? (
        <ListingSection title="待換" items={forTrade} m={m} />
      ) : null}
    </section>
  );
}
