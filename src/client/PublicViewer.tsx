import { cn } from "@/lib/utils";
import { useEffect, useState } from "react";
import type { MarketListing, PublicPendingTrade } from "../shared/types";
import { fetchMarket, fetchOverview, fetchPendingTrades } from "./api";
import { type Matrix, buildMatrix } from "./collection";
import { Glance } from "./views/Glance";
import { Grid } from "./views/Grid";
import { MarketBoard } from "./views/Market";
import { StatsBar } from "./views/StatsBar";
import { Trade } from "./views/Trade";
import { Wishlist } from "./views/Wishlist";
import { ByCharacter, ByRarity, BySeries } from "./views/tables";

const TABS = [
  { id: "char", zh: "角色", en: "By Character" },
  { id: "series", zh: "系列", en: "By Series" },
  { id: "rarity", zh: "稀有度", en: "By Rarity" },
  { id: "wishlist", zh: "缺卡", en: "Wishlist" },
  { id: "glance", zh: "速覽", en: "At a Glance" },
  { id: "grid", zh: "格表", en: "Grid" },
  { id: "trade", zh: "交換", en: "Trade" },
  { id: "market", zh: "交易看板", en: "Market" },
] as const;

type TabId = (typeof TABS)[number]["id"];

function ActiveView({
  id,
  m,
  listings,
  marketError,
  pending,
}: {
  id: TabId;
  m: Matrix;
  listings: MarketListing[] | null;
  marketError: string | null;
  pending: PublicPendingTrade[];
}) {
  switch (id) {
    case "char":
      return <ByCharacter m={m} />;
    case "series":
      return <BySeries m={m} />;
    case "rarity":
      return <ByRarity m={m} />;
    case "wishlist":
      return <Wishlist m={m} />;
    case "glance":
      return <Glance m={m} />;
    case "grid":
      return <Grid m={m} />;
    case "trade":
      return <Trade m={m} pending={pending} />;
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
  const [pending, setPending] = useState<PublicPendingTrade[]>([]);

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
      .catch(() => {
        // pending overlay is non-critical; the rest of the Trade tab still works.
      });
  }, []);

  const selectTab = (id: TabId) => {
    setTab(id);
    try {
      history.replaceState(null, "", `#${id}`);
    } catch {
      // history mutation is blocked in sandboxed iframes; tab still switches.
    }
  };

  return (
    <div className="mx-auto max-w-[820px] px-7 pt-20 pb-24 max-sm:px-[18px] max-sm:pt-14 max-sm:pb-[72px]">
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
        role="tablist"
        className="mt-16 mb-12 flex flex-wrap justify-center border-b border-border animate-[rise_0.7s_ease_0.35s_both]"
      >
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
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
            <span
              className={cn(
                "font-accent text-[11px] italic uppercase tracking-[0.18em] transition-opacity max-sm:text-[10px]",
                tab === t.id ? "opacity-90" : "opacity-60",
              )}
            >
              {t.en}
            </span>
          </button>
        ))}
      </nav>

      <main>
        {error ? (
          <div className="state-msg">無法載入資料：{error}</div>
        ) : matrix ? (
          <ActiveView
            id={tab}
            m={matrix}
            listings={listings}
            marketError={marketError}
            pending={pending}
          />
        ) : (
          <div className="state-msg">載入中…</div>
        )}
      </main>

      <footer className="mt-[72px] border-t border-border pt-7 text-center text-xs tracking-[0.12em] text-muted-foreground">
        <span>子午計畫 · Meridian Project</span>
        <span className="mx-3 opacity-50">·</span>
        <span className="mx-0.5 inline-block font-accent italic text-primary">
          ⌘
        </span>
        <span className="mx-3 opacity-50">·</span>
        <span>Curated by hydai</span>
      </footer>
    </div>
  );
}
