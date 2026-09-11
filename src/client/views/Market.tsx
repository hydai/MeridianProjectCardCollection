import { CatalogCardVisual } from "@/components/CatalogCardVisual";
import { SaleShareSheet } from "@/components/SaleShareSheet";
import { SaleTextCopy } from "@/components/SaleTextCopy";
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
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  type ListingGroup,
  groupListings,
  listingTerms,
} from "@/lib/market-listings";
import { formatSaleList } from "@/lib/sale-text";
import { CheckIcon } from "lucide-react";
import { useMemo, useState } from "react";
import type { CatalogImageRef, MarketListing } from "../../shared/types";
import { type Matrix, RARITIES, getImage } from "../collection";

const MARKET_GRID = "grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4";

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
            ? group.reservedSale > 0
              ? "全數預約中"
              : "暫定交換中"
            : `${group.item.status === "for_sale" ? "可售" : "可換"} ${available} 張`}
          {group.reservedSale > 0 ? (
            <span className="block">預約出售 {group.reservedSale} 張</span>
          ) : null}
          {group.reserved > group.reservedSale ? (
            <span className="block">
              預約 {group.reserved - group.reservedSale} 張
            </span>
          ) : null}
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
  filterByRarity = false,
}: {
  title: string;
  items: MarketListing[];
  m?: Matrix | null;
  filterByRarity?: boolean;
}) {
  const [rarities, setRarities] = useState<string[]>([]);
  const [layout, setLayout] = useState("cards");
  const shownItems = useMemo(
    () =>
      !filterByRarity || rarities.length === 0
        ? items
        : items.filter((item) => rarities.includes(item.rarity)),
    [items, filterByRarity, rarities],
  );
  const groups = useMemo(() => groupListings(shownItems), [shownItems]);
  const saleText = useMemo(
    () => (filterByRarity ? formatSaleList(shownItems, m) : ""),
    [shownItems, m, filterByRarity],
  );
  const typeCount = new Set(
    shownItems.map((item) =>
      JSON.stringify([item.series, item.character, item.rarity]),
    ),
  ).size;
  return (
    <section aria-label={title} className="flex flex-col gap-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border pb-3">
        <h2 className="font-serif text-xl">{title}</h2>
        <p
          aria-live="polite"
          aria-atomic="true"
          className="font-mono text-xs text-muted-foreground"
        >
          {typeCount} 款 · {shownItems.length} 張
        </p>
      </div>
      {filterByRarity ? (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <ToggleGroup
              type="multiple"
              variant="outline"
              value={rarities.length ? rarities : ["all"]}
              onValueChange={(values) => {
                setRarities(
                  values.includes("all") && rarities.length > 0
                    ? []
                    : values.filter((value) => value !== "all"),
                );
              }}
              aria-label={`${title}稀有度篩選`}
              className="max-w-full flex-wrap"
            >
              <ToggleGroupItem value="all">
                {rarities.length === 0 ? (
                  <CheckIcon data-icon="inline-start" aria-hidden />
                ) : null}
                全部
              </ToggleGroupItem>
              {RARITIES.map((value) => (
                <ToggleGroupItem key={value} value={value}>
                  {rarities.includes(value) ? (
                    <CheckIcon data-icon="inline-start" aria-hidden />
                  ) : null}
                  {value}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
            <ToggleGroup
              type="single"
              variant="outline"
              value={layout}
              onValueChange={(value) => {
                if (value) setLayout(value);
              }}
              aria-label="待售顯示方式"
            >
              <ToggleGroupItem value="cards">卡片版</ToggleGroupItem>
              <ToggleGroupItem value="share">分享版</ToggleGroupItem>
            </ToggleGroup>
          </div>
          <p className="text-xs text-muted-foreground">
            稀有度可複選；選「全部」重設篩選。
          </p>
          <SaleTextCopy key={saleText} text={saleText} />
        </div>
      ) : null}
      {groups.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>
              目前沒有 {rarities.join("、")} 等級的{title}卡片。
            </EmptyTitle>
            <EmptyDescription>
              選擇其他稀有度或「全部」查看卡片。
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : filterByRarity && layout === "share" ? (
        <SaleShareSheet groups={groups} m={m} />
      ) : (
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
      )}
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
        <ListingSection
          key="sale"
          title="待售"
          items={forSale}
          m={m}
          filterByRarity
        />
      ) : null}
      {forTrade.length > 0 ? (
        <ListingSection key="trade" title="待換" items={forTrade} m={m} />
      ) : null}
    </section>
  );
}
