import { useEffect, useState } from "react";
import { fetchOverview } from "./api";
import { type Matrix, buildMatrix } from "./collection";
import { Glance } from "./views/Glance";
import { Grid } from "./views/Grid";
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
] as const;

type TabId = (typeof TABS)[number]["id"];

function ActiveView({ id, m }: { id: TabId; m: Matrix }) {
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
      return <Trade m={m} />;
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

  useEffect(() => {
    fetchOverview()
      .then((o) => setMatrix(buildMatrix(o)))
      .catch((e) => setError(String(e)));
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
    <div className="container">
      <header className="hero">
        <p className="kicker">A Living Archive · 永久收藏</p>
        <h1 className="title">子午計畫</h1>
        <p className="subtitle">Meridian Project · Card Collection</p>
        {matrix ? <StatsBar m={matrix} /> : null}
      </header>

      <nav className="tabs">
        {TABS.map((t) => (
          <button
            type="button"
            key={t.id}
            className={`tab ${tab === t.id ? "active" : ""}`}
            onClick={() => selectTab(t.id)}
          >
            {t.zh}
            <span className="tab-en">{t.en}</span>
          </button>
        ))}
      </nav>

      <main>
        {error ? (
          <div className="state-msg">無法載入資料：{error}</div>
        ) : matrix ? (
          <ActiveView id={tab} m={matrix} />
        ) : (
          <div className="state-msg">載入中…</div>
        )}
      </main>

      <footer>
        <span>子午計畫 · Meridian Project</span>
        <span className="divider">·</span>
        <span className="accent-mark">⌘</span>
        <span className="divider">·</span>
        <span>Curated by hydai</span>
      </footer>
    </div>
  );
}
