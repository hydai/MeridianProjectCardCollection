import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useState } from "react";
import "./admin.css";
import { AddCards } from "./AddCards";
import { History } from "./History";
import { ManageCards } from "./ManageCards";
import { Openings } from "./Openings";
import { PendingTrades } from "./PendingTrades";

const TABS = [
  { id: "add", label: "開箱新增" },
  { id: "manage", label: "卡片管理" },
  { id: "reserve", label: "交換預約" },
  { id: "openings", label: "開箱成本" },
  { id: "history", label: "交易歷史" },
] as const;

type TabId = (typeof TABS)[number]["id"];

export default function Admin() {
  const [tab, setTab] = useState<TabId>("add");

  return (
    <div className="mx-auto max-w-[940px] px-7 pt-14 pb-24">
      <div className="flex flex-wrap items-baseline justify-between gap-2.5">
        <h1 className="font-serif text-[26px] font-medium tracking-[0.06em] text-foreground">
          管理後台
        </h1>
        <Button
          asChild
          variant="link"
          className="h-auto p-0 font-accent text-sm italic tracking-[0.1em] text-muted-foreground hover:text-primary"
        >
          <a href="/">← 回到收藏清冊</a>
        </Button>
      </div>

      <nav
        role="tablist"
        className="mt-6 mb-8 flex flex-wrap border-b border-border"
      >
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              "relative cursor-pointer border-0 bg-transparent px-[22px] pt-3.5 pb-3 font-sans text-sm tracking-[0.1em] text-muted-foreground transition-colors hover:text-foreground",
              "after:absolute after:bottom-[-0.5px] after:left-0 after:h-px after:w-full after:bg-primary after:transition-opacity",
              tab === t.id
                ? "text-primary after:opacity-100"
                : "after:opacity-0",
            )}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {tab === "add" ? <AddCards /> : null}
      {tab === "manage" ? <ManageCards /> : null}
      {tab === "reserve" ? <PendingTrades /> : null}
      {tab === "openings" ? <Openings /> : null}
      {tab === "history" ? <History /> : null}
    </div>
  );
}
