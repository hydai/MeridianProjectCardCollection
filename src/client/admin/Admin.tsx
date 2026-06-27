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
    <div className="admin">
      <div className="admin-head">
        <h1 className="admin-title">管理後台</h1>
        <a className="admin-back" href="/">
          ← 回到收藏清冊
        </a>
      </div>
      <nav className="admin-nav">
        {TABS.map((t) => (
          <button
            type="button"
            key={t.id}
            className={`admin-tab ${tab === t.id ? "active" : ""}`}
            onClick={() => setTab(t.id)}
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
