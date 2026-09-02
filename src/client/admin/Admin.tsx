import { Button } from "@/components/ui/button";
import { useRovingTablist } from "@/lib/tablist";
import { cn } from "@/lib/utils";
import { useState } from "react";
import { Activity } from "./Activity";
import { AddCards } from "./AddCards";
import { CatalogMedia } from "./CatalogMedia";
import { History } from "./History";
import { ManageCards } from "./ManageCards";
import { Openings } from "./Openings";
import { PendingPurchases } from "./PendingPurchases";
import { PendingTrades } from "./PendingTrades";
import { QuickPackOpening } from "./QuickPackOpening";
import { SeriesManager } from "./SeriesManager";
import { TradePosts } from "./TradePosts";

const SECTIONS = [
  {
    id: "collection",
    label: "收藏",
    hint: "入藏與維護",
    tabs: [
      { id: "pack", label: "單包開卡" },
      { id: "add", label: "批次入藏" },
      { id: "manage", label: "卡片管理" },
      { id: "media", label: "卡圖資料" },
      { id: "series", label: "系列設定" },
    ],
  },
  {
    id: "trade",
    label: "交易",
    hint: "進行中的約定",
    tabs: [
      { id: "posts", label: "交換公告" },
      { id: "reserve", label: "交換預約" },
      { id: "purchase", label: "購入預約" },
    ],
  },
  {
    id: "activity",
    label: "痕跡",
    hint: "事件流與報表",
    tabs: [
      { id: "activity", label: "全部痕跡" },
      { id: "openings", label: "開卡成本" },
      { id: "history", label: "交易歷史" },
    ],
  },
] as const;

type Section = (typeof SECTIONS)[number];
type SectionId = Section["id"];
type TabId = Section["tabs"][number]["id"];

const ALL_TAB_IDS = SECTIONS.flatMap((section) =>
  section.tabs.map((tab) => tab.id),
) as TabId[];

function initialTab(): TabId {
  const hash = location.hash.slice(1);
  return ALL_TAB_IDS.includes(hash as TabId) ? (hash as TabId) : "pack";
}

function sectionFor(tab: TabId): Section {
  return (
    SECTIONS.find((section) =>
      section.tabs.some((candidate) => candidate.id === tab),
    ) ?? SECTIONS[0]
  );
}

function ActivePanel({
  tab,
  onSelectTab,
}: {
  tab: TabId;
  onSelectTab: (tab: TabId) => void;
}) {
  switch (tab) {
    case "pack":
      return <QuickPackOpening />;
    case "add":
      return <AddCards />;
    case "manage":
      return <ManageCards />;
    case "media":
      return <CatalogMedia />;
    case "series":
      return <SeriesManager />;
    case "posts":
      return <TradePosts onOpenReservations={() => onSelectTab("reserve")} />;
    case "reserve":
      return <PendingTrades />;
    case "purchase":
      return <PendingPurchases />;
    case "activity":
      return <Activity />;
    case "openings":
      return <Openings />;
    case "history":
      return <History />;
  }
}

export default function Admin() {
  const [tab, setTab] = useState<TabId>(initialTab);
  const activeSection = sectionFor(tab);
  const activeTabIds = activeSection.tabs.map((item) => item.id);

  const selectTab = (id: TabId) => {
    setTab(id);
    try {
      history.replaceState(null, "", `#${id}`);
    } catch {
      // history mutation is blocked in sandboxed iframes; selection still works.
    }
  };
  const selectSection = (id: SectionId) => {
    const section = SECTIONS.find((candidate) => candidate.id === id);
    if (section) selectTab(section.tabs[0].id);
  };
  const tabProps = useRovingTablist(activeTabIds, selectTab);

  return (
    <main className="mx-auto max-w-[940px] px-7 pt-14 pb-24 max-sm:px-4 max-sm:pt-10 max-sm:pb-[72px]">
      <div className="flex flex-wrap items-baseline justify-between gap-2.5">
        <div>
          <h1 className="font-serif text-[26px] font-medium tracking-[0.06em] text-foreground">
            收藏工作台
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            依照收藏、交易與痕跡整理日常工作。
          </p>
        </div>
        <Button
          asChild
          variant="link"
          className="h-auto p-0 font-accent text-sm italic tracking-[0.1em] text-muted-foreground hover:text-primary"
        >
          <a href="/">← 回到收藏清冊</a>
        </Button>
      </div>

      <nav
        aria-label="管理功能分類"
        className="mt-8 grid grid-cols-3 gap-2 max-sm:grid-cols-1"
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
                "grid cursor-pointer gap-0.5 rounded-lg border px-4 py-3 text-left transition-colors",
                selected
                  ? "border-primary/50 bg-primary/8 text-foreground"
                  : "border-border bg-card text-muted-foreground hover:border-foreground/20 hover:text-foreground",
              )}
            >
              <span className="text-sm font-medium tracking-[0.08em]">
                {section.label}
              </span>
              <span className="text-xs text-muted-foreground">
                {section.hint}
              </span>
            </button>
          );
        })}
      </nav>

      <nav
        role="tablist"
        aria-label={`${activeSection.label}功能`}
        className="mt-4 mb-8 flex flex-wrap border-b border-border"
      >
        {activeSection.tabs.map((item, index) => (
          <button
            key={item.id}
            id={`admin-tab-${item.id}`}
            type="button"
            role="tab"
            aria-selected={tab === item.id}
            aria-controls={`admin-panel-${item.id}`}
            {...tabProps(index, tab === item.id)}
            onClick={() => selectTab(item.id)}
            className={cn(
              "relative cursor-pointer border-0 bg-transparent px-[22px] pt-3.5 pb-3 font-sans text-sm tracking-[0.1em] text-muted-foreground transition-colors hover:text-foreground",
              "after:absolute after:bottom-[-0.5px] after:left-0 after:h-px after:w-full after:bg-primary after:transition-opacity",
              tab === item.id
                ? "text-primary after:opacity-100"
                : "after:opacity-0",
            )}
          >
            {item.label}
          </button>
        ))}
      </nav>

      <div
        id={`admin-panel-${tab}`}
        role="tabpanel"
        aria-labelledby={`admin-tab-${tab}`}
      >
        <ActivePanel tab={tab} onSelectTab={selectTab} />
      </div>
    </main>
  );
}
