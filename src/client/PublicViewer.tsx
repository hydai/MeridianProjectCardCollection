import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { useRovingTablist } from "@/lib/tablist";
import { cn } from "@/lib/utils";
import { useEffect, useState } from "react";
import type {
  MarketListing,
  PublicPendingPurchase,
  PublicPendingTrade,
  TradePost,
} from "../shared/types";
import {
  fetchMarket,
  fetchOverview,
  fetchPendingPurchases,
  fetchPendingTrades,
  fetchTradePosts,
} from "./api";
import { type Matrix, buildMatrix } from "./collection";
import { Glance } from "./views/Glance";
import { Grid } from "./views/Grid";
import { MarketBoard } from "./views/Market";
import { StatsBar } from "./views/StatsBar";
import { Trade } from "./views/Trade";
import { TradePostsView } from "./views/TradePosts";
import { Wishlist } from "./views/Wishlist";
import { ByCharacter, ByRarity, BySeries } from "./views/tables";

const TABS = [
  { id: "char", zh: "角色", en: "By Character" },
  { id: "series", zh: "系列", en: "By Series" },
  { id: "rarity", zh: "稀有度", en: "By Rarity" },
  { id: "wishlist", zh: "缺卡", en: "Wishlist" },
  { id: "glance", zh: "速覽", en: "At a Glance" },
  { id: "grid", zh: "格表", en: "Grid" },
  { id: "posts", zh: "公告", en: "Posts" },
  { id: "trade", zh: "交換", en: "Trade" },
  { id: "market", zh: "交易看板", en: "Market" },
] as const;

type TabId = (typeof TABS)[number]["id"];

const SECTIONS = [
  {
    id: "collection",
    zh: "收藏",
    en: "Collection",
    tabs: ["char", "series", "rarity"],
  },
  {
    id: "inventory",
    zh: "盤點",
    en: "Inventory",
    tabs: ["glance", "grid", "wishlist"],
  },
  {
    id: "trade",
    zh: "交易",
    en: "Trade",
    tabs: ["posts", "trade", "market"],
  },
] as const satisfies ReadonlyArray<{
  id: string;
  zh: string;
  en: string;
  tabs: readonly TabId[];
}>;

type SectionId = (typeof SECTIONS)[number]["id"];

function sectionFor(tab: TabId) {
  return (
    SECTIONS.find((section) =>
      section.tabs.some((candidate) => candidate === tab),
    ) ?? SECTIONS[0]
  );
}

function tabFor(id: TabId) {
  const tab = TABS.find((candidate) => candidate.id === id);
  if (!tab) throw new Error(`Unknown public viewer tab: ${id}`);
  return tab;
}

function ActiveView({
  id,
  m,
  listings,
  marketError,
  pending,
  pendingError,
  pendingPurchases,
  pendingPurchaseError,
}: {
  id: TabId;
  m: Matrix;
  listings: MarketListing[] | null;
  marketError: string | null;
  pending: PublicPendingTrade[] | null;
  pendingError: string | null;
  pendingPurchases: PublicPendingPurchase[] | null;
  pendingPurchaseError: string | null;
}) {
  const incomingUnavailable = (error: string | null) =>
    error ? (
      <Alert variant="destructive">
        <AlertTitle>無法載入待收件資料</AlertTitle>
        <AlertDescription>
          為避免重複購入或交換，缺卡需求暫不顯示：{error}
        </AlertDescription>
      </Alert>
    ) : (
      <output className="flex flex-col gap-3 py-12">
        <Skeleton className="mx-auto h-6 w-40" />
        <Skeleton className="h-24 w-full" />
      </output>
    );

  switch (id) {
    case "char":
      return <ByCharacter m={m} />;
    case "series":
      return <BySeries m={m} />;
    case "rarity":
      return <ByRarity m={m} />;
    case "wishlist":
      if (pendingPurchases === null) {
        return incomingUnavailable(pendingPurchaseError);
      }
      return <Wishlist m={m} pendingPurchases={pendingPurchases} />;
    case "glance":
      return <Glance m={m} />;
    case "grid":
      return <Grid m={m} />;
    case "trade":
      if (pending === null || pendingPurchases === null) {
        return incomingUnavailable(pendingError ?? pendingPurchaseError);
      }
      return (
        <Trade m={m} pending={pending} pendingPurchases={pendingPurchases} />
      );
    case "market":
      return <MarketBoard listings={listings} error={marketError} />;
    default:
      return null;
  }
}

function initialTab(): TabId {
  const hash = location.hash.slice(1);
  return TABS.some((t) => t.id === hash) ? (hash as TabId) : "char";
}

export default function PublicViewer() {
  const [matrix, setMatrix] = useState<Matrix | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<TabId>(initialTab);
  const [listings, setListings] = useState<MarketListing[] | null>(null);
  const [marketError, setMarketError] = useState<string | null>(null);
  const [pending, setPending] = useState<PublicPendingTrade[] | null>(null);
  const [pendingError, setPendingError] = useState<string | null>(null);
  const [pendingPurchases, setPendingPurchases] = useState<
    PublicPendingPurchase[] | null
  >(null);
  const [pendingPurchaseError, setPendingPurchaseError] = useState<
    string | null
  >(null);
  const [tradePosts, setTradePosts] = useState<TradePost[] | null>(null);
  const [tradePostsError, setTradePostsError] = useState<string | null>(null);

  useEffect(() => {
    fetchOverview()
      .then((o) => setMatrix(buildMatrix(o)))
      .catch((e) => setError(String(e)));
  }, []);

  useEffect(() => {
    fetchMarket()
      .then(setListings)
      .catch((e) => setMarketError(String(e)));
  }, []);

  useEffect(() => {
    fetchPendingTrades()
      .then(setPending)
      .catch((e) => setPendingError(String(e)));
  }, []);

  useEffect(() => {
    fetchPendingPurchases()
      .then(setPendingPurchases)
      .catch((e) => setPendingPurchaseError(String(e)));
  }, []);

  useEffect(() => {
    fetchTradePosts()
      .then(setTradePosts)
      .catch((e) => setTradePostsError(String(e)));
  }, []);

  const selectTab = (id: TabId) => {
    setTab(id);
    try {
      history.replaceState(null, "", `#${id}`);
    } catch {
      // history mutation is blocked in sandboxed iframes; tab still switches.
    }
  };

  const activeSection = sectionFor(tab);
  const activeTabs = activeSection.tabs.map(tabFor);
  const activeTabIds = activeTabs.map((item) => item.id);
  const selectSection = (id: SectionId) => {
    const section = SECTIONS.find((candidate) => candidate.id === id);
    if (section) selectTab(section.tabs[0]);
  };
  const tabProps = useRovingTablist(activeTabIds, selectTab);

  return (
    <main className="mx-auto max-w-[820px] px-7 pt-20 pb-24 max-sm:px-[18px] max-sm:pt-14 max-sm:pb-[72px]">
      <header className="mb-16 text-center animate-[rise_0.7s_ease_0.05s_both]">
        <p className="mb-7 font-accent text-sm italic uppercase tracking-[0.35em] text-primary opacity-85">
          <span className="opacity-60">—</span> A Living Archive · 永久收藏{" "}
          <span className="opacity-60">—</span>
        </p>
        <h1 className="mb-[18px] font-serif text-[clamp(52px,9vw,84px)] font-medium leading-none tracking-[0.12em] text-foreground max-sm:tracking-[0.08em]">
          子午計畫
        </h1>
        <p className="font-accent text-[19px] italic tracking-[0.04em] text-muted-foreground max-sm:text-base">
          Meridian Project · Card Collection
        </p>
        {matrix ? <StatsBar m={matrix} /> : null}
      </header>

      <nav
        aria-label="瀏覽分類"
        className="mt-16 grid grid-cols-3 gap-2 animate-[rise_0.7s_ease_0.35s_both] max-sm:grid-cols-1"
      >
        {SECTIONS.map((section) => {
          const selected = activeSection.id === section.id;
          return (
            <button
              key={section.id}
              type="button"
              aria-current={selected ? "page" : undefined}
              onClick={() => selectSection(section.id)}
              className={cn(
                "flex cursor-pointer flex-col items-center gap-0.5 rounded-lg border px-5 py-3 text-muted-foreground transition-colors",
                selected
                  ? "border-primary/45 bg-primary/8 text-primary"
                  : "border-border bg-card/60 hover:border-foreground/20 hover:text-foreground",
              )}
            >
              <span className="text-sm tracking-[0.15em]">{section.zh}</span>
              <span className="font-accent text-[11px] italic uppercase tracking-[0.18em]">
                {section.en}
              </span>
            </button>
          );
        })}
      </nav>

      <nav
        role="tablist"
        aria-label={`${activeSection.zh}檢視`}
        className="mt-4 mb-12 flex flex-wrap justify-center border-b border-border animate-[rise_0.7s_ease_0.4s_both]"
      >
        {activeTabs.map((t, i) => (
          <button
            key={t.id}
            id={`viewer-tab-${t.id}`}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            aria-controls={`viewer-panel-${t.id}`}
            {...tabProps(i, tab === t.id)}
            onClick={() => selectTab(t.id)}
            className={cn(
              "relative flex cursor-pointer flex-col items-center gap-1 border-0 bg-transparent px-7 pt-[18px] pb-4 font-sans text-sm tracking-[0.15em] text-muted-foreground transition-colors hover:text-foreground max-sm:px-3.5 max-sm:text-[13px]",
              "after:absolute after:bottom-[-0.5px] after:left-1/2 after:h-px after:w-full after:-translate-x-1/2 after:bg-primary after:transition-opacity",
              tab === t.id
                ? "text-primary after:opacity-100"
                : "after:opacity-0",
            )}
          >
            {t.zh}
            <span className="font-accent text-[11px] italic uppercase tracking-[0.18em] max-sm:text-[10px]">
              {t.en}
            </span>
          </button>
        ))}
      </nav>

      <div
        id={`viewer-panel-${tab}`}
        role="tabpanel"
        aria-labelledby={`viewer-tab-${tab}`}
      >
        {tab === "posts" ? (
          <TradePostsView posts={tradePosts} error={tradePostsError} />
        ) : error ? (
          <p className="py-12 text-center font-accent italic tracking-[0.1em] text-muted-foreground">
            無法載入資料：{error}
          </p>
        ) : matrix ? (
          <ActiveView
            id={tab}
            m={matrix}
            listings={listings}
            marketError={marketError}
            pending={pending}
            pendingError={pendingError}
            pendingPurchases={pendingPurchases}
            pendingPurchaseError={pendingPurchaseError}
          />
        ) : (
          <div className="flex flex-col gap-3 py-12">
            <Skeleton className="mx-auto h-6 w-40" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        )}
      </div>

      <footer className="mt-[72px] border-t border-border pt-7 text-center text-xs tracking-[0.12em] text-muted-foreground">
        <span>子午計畫 · Meridian Project</span>
        <span className="mx-3 opacity-50">·</span>
        <span className="mx-0.5 inline-block font-accent italic text-primary">
          ⌘
        </span>
        <span className="mx-3 opacity-50">·</span>
        <span>Curated by hydai</span>
      </footer>
    </main>
  );
}
