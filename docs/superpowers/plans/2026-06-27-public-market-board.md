# Public Market Board (交易看板) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surface the cards an admin marks `for_sale` / `for_trade` on a new public "交易看板 (Market)" tab, fed by the already-existing `GET /api/market`.

**Architecture:** Add one pure presentational view (`MarketBoard`) that receives `MarketListing[]` and renders 待售 / 待換 panels. The existing data container `PublicViewer` fetches `/api/market` via the existing `fetchMarket()` client and passes the result down — matching the repo's "container fetches, views are pure" convention. No backend changes.

**Tech Stack:** React 18 + TypeScript (strict), Vite, Vitest + @testing-library/react (jsdom), Biome (format/lint). Cloudflare Workers + Hono + D1 on the backend (untouched here).

## Global Constraints

- **Do NOT modify the backend.** `getMarket()` (`src/worker/db/queries.ts:73`), route `GET /api/market` (`src/worker/app.ts:29`), and `fetchMarket()` (`src/client/api.ts:38`) already exist and are tested. This feature is frontend-only.
- **Price display format:** `` `${askingPrice} 元` `` (matches admin `ManageCards`). No price → `價格面議`.
- **Trade condition format:** `` `想換：${wantInReturn}` ``. No want → `開放出價`.
- **Empty state (no listings at all):** `目前沒有上架中的卡片。`
- **Loading state:** `載入中…`. **Market load error:** `無法載入交易資料：<err>` (this tab only; must not break other tabs).
- **New tab:** `{ id: "market", zh: "交易看板", en: "Market" }`, appended **after** the existing `trade` tab.
- **Reuse existing visual language:** `.trade-grid`, `.trade-panel`, `.trade-panel-title`, `.trade-panel-sub`, `.trade-empty`, `.state-msg`, and `MissChip` (rarity chips). Add only minimal new CSS.
- **Type source of truth:** `MarketListing` in `src/shared/types.ts:34`.
- **`dist/` is gitignored** — `npm run build` is a local compile check only; going live is a separate `npm run deploy` run by the user. Never commit `dist/`.
- A PreToolUse hook auto-runs format/lint/test before every `git commit`.

---

## File Structure

| File | Responsibility |
| --- | --- |
| `src/client/views/Market.tsx` | **New.** Pure `MarketBoard({ listings, error })` view — splits listings into 待售/待換 panels, renders rows, handles loading/empty/error. |
| `src/client/index.css` | **Modify.** Add minimal `.market-row` / `.market-where` / `.market-meta` / `.market-note` / `.trade-grid-single` styles. |
| `src/client/PublicViewer.tsx` | **Modify.** Add the `market` tab, `listings`/`marketError` state + `fetchMarket()` effect, and the `ActiveView` case. |
| `test/client/views.test.tsx` | **Modify.** Add a `MarketBoard` describe block (loading / empty / details / error). |
| `test/client/app.test.tsx` | **Modify.** Add an integration test: clicking 交易看板 renders listings from a URL-aware fetch mock. |

---

## Task 1: `MarketBoard` pure view + styles

**Files:**
- Create: `src/client/views/Market.tsx`
- Modify: `src/client/index.css` (append market styles after the trade-panel block, ~line 1160)
- Test: `test/client/views.test.tsx` (add imports + new describe block)

**Interfaces:**
- Consumes: `MarketListing` from `src/shared/types.ts`; `RARITIES` from `src/client/collection.ts`; `MissChip` from `src/client/views/shared.tsx`.
- Produces: `export function MarketBoard({ listings, error }: { listings: MarketListing[] | null; error?: string | null }): JSX.Element` — consumed by Task 2.

- [ ] **Step 1: Write the failing test**

In `test/client/views.test.tsx`, change the testing-library import line (currently `import { render } from "@testing-library/react";`) to add `screen`:

```tsx
import { render, screen } from "@testing-library/react";
```

Add these imports near the other view imports at the top of the file:

```tsx
import { MarketBoard } from "../../src/client/views/Market";
import type { MarketListing } from "../../src/shared/types";
```

Append this new describe block to the end of the file:

```tsx
const sampleListings: MarketListing[] = [
  {
    cardId: 1,
    series: "MP 4TH",
    character: "Kirari",
    rarity: "UR",
    status: "for_sale",
    askingPrice: 1200,
    wantInReturn: null,
    note: null,
  },
  {
    cardId: 2,
    series: "MP 4TH",
    character: "Aria",
    rarity: "SSR",
    status: "for_sale",
    askingPrice: null,
    wantInReturn: null,
    note: "輕微邊緣磨損",
  },
  {
    cardId: 3,
    series: "KSP",
    character: "Mira",
    rarity: "SSR",
    status: "for_trade",
    askingPrice: null,
    wantInReturn: "KSP Kirari UR",
    note: null,
  },
  {
    cardId: 4,
    series: "KSP",
    character: "Kirari",
    rarity: "R",
    status: "for_trade",
    askingPrice: null,
    wantInReturn: null,
    note: null,
  },
];

describe("MarketBoard", () => {
  it("shows a loading state when listings is null", () => {
    render(<MarketBoard listings={null} />);
    expect(screen.getByText("載入中…")).toBeInTheDocument();
  });

  it("shows an empty state when there are no listings", () => {
    render(<MarketBoard listings={[]} />);
    expect(screen.getByText("目前沒有上架中的卡片。")).toBeInTheDocument();
  });

  it("renders for_sale and for_trade listings with details", () => {
    render(<MarketBoard listings={sampleListings} />);
    expect(screen.getByText("待售")).toBeInTheDocument();
    expect(screen.getByText("待換")).toBeInTheDocument();
    expect(screen.getByText("1200 元")).toBeInTheDocument();
    expect(screen.getByText("價格面議")).toBeInTheDocument();
    expect(screen.getByText("想換：KSP Kirari UR")).toBeInTheDocument();
    expect(screen.getByText("開放出價")).toBeInTheDocument();
    expect(screen.getByText("輕微邊緣磨損")).toBeInTheDocument();
  });

  it("shows an error message scoped to this view", () => {
    render(<MarketBoard listings={null} error="Error: /api/market → 500" />);
    expect(screen.getByText(/無法載入交易資料/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:client`
Expected: FAIL — the `MarketBoard` suite errors with "Failed to resolve import ... src/client/views/Market" (module does not exist yet).

- [ ] **Step 3: Create the component**

Create `src/client/views/Market.tsx`:

```tsx
import { RARITIES } from "../collection";
import type { MarketListing } from "../../shared/types";
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:client`
Expected: PASS — all four `MarketBoard` tests green; the existing "renders all seven views" suite still passes (it does not import `MarketBoard`).

- [ ] **Step 5: Add the styles**

In `src/client/index.css`, after the `.trade-panel-sub { ... }` rule (around line 1160), add:

```css
/* Market board (交易看板) — public listing view */
.trade-grid-single {
  grid-template-columns: 1fr;
  max-width: 520px;
}
.market-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  padding: 9px 0;
  border-bottom: 0.5px solid var(--border);
}
.market-row:last-child {
  border-bottom: none;
}
.market-where {
  font-size: 13px;
  color: var(--text-secondary);
  letter-spacing: 0.02em;
}
.market-meta {
  margin-left: auto;
  font-family: "JetBrains Mono", "IBM Plex Sans TC", monospace;
  font-size: 12px;
  color: var(--text);
}
.market-note {
  flex-basis: 100%;
  font-size: 12px;
  color: var(--text-tertiary);
  letter-spacing: 0.02em;
}
```

- [ ] **Step 6: Format, re-run, commit**

Run: `npx biome check --write src/client/views/Market.tsx src/client/index.css test/client/views.test.tsx`
Run: `npm run test:client`
Expected: PASS.

```bash
git add src/client/views/Market.tsx src/client/index.css test/client/views.test.tsx
git commit -m "feat: add public MarketBoard view for for_sale/for_trade listings"
```

---

## Task 2: Wire `MarketBoard` into `PublicViewer` (new 交易看板 tab)

**Files:**
- Modify: `src/client/PublicViewer.tsx`
- Test: `test/client/app.test.tsx`

**Interfaces:**
- Consumes: `MarketBoard` from `src/client/views/Market.tsx` (Task 1); `fetchMarket` from `src/client/api.ts`; `MarketListing` from `src/shared/types.ts`.
- Produces: a `market` tab whose panel renders `<MarketBoard listings={listings} error={marketError} />`.

- [ ] **Step 1: Write the failing integration test**

In `test/client/app.test.tsx`, change the testing-library import line to add `fireEvent`:

```tsx
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
```

Add this test inside the existing `describe("App", ...)` block:

```tsx
it("shows market listings on the 交易看板 tab", async () => {
  const listings = [
    {
      cardId: 1,
      series: "NEW YEAR",
      character: "Mizuki",
      rarity: "SR",
      status: "for_sale",
      askingPrice: 500,
      wantInReturn: null,
      note: null,
    },
  ];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => ({
      ok: true,
      json: async () =>
        String(url).includes("/api/market") ? listings : overview,
    })),
  );
  render(<App />);
  await waitFor(() =>
    expect(screen.getByText("子午計畫")).toBeInTheDocument(),
  );
  fireEvent.click(screen.getByText("交易看板"));
  await waitFor(() =>
    expect(screen.getByText("500 元")).toBeInTheDocument(),
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:client`
Expected: FAIL — `getByText("交易看板")` throws "Unable to find an element with the text: 交易看板" (the tab does not exist yet).

- [ ] **Step 3: Implement the wiring**

In `src/client/PublicViewer.tsx`:

(a) Replace the api import:

```tsx
import { fetchMarket, fetchOverview } from "./api";
```

(b) Add the type import near the top (next to the other imports):

```tsx
import type { MarketListing } from "../shared/types";
```

(c) Add the `MarketBoard` view import (next to the other `./views/...` imports):

```tsx
import { MarketBoard } from "./views/Market";
```

(d) Add the `market` tab to `TABS`, right after the `trade` entry:

```tsx
  { id: "trade", zh: "交換", en: "Trade" },
  { id: "market", zh: "交易看板", en: "Market" },
] as const;
```

(e) Replace the `ActiveView` function signature and add the `market` case:

```tsx
function ActiveView({
  id,
  m,
  listings,
  marketError,
}: {
  id: TabId;
  m: Matrix;
  listings: MarketListing[] | null;
  marketError: string | null;
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
      return <Trade m={m} />;
    case "market":
      return <MarketBoard listings={listings} error={marketError} />;
    default:
      return null;
  }
}
```

(f) Inside `PublicViewer`, add state + effect after the existing `matrix`/`error`/`tab` state and `fetchOverview` effect:

```tsx
  const [listings, setListings] = useState<MarketListing[] | null>(null);
  const [marketError, setMarketError] = useState<string | null>(null);

  useEffect(() => {
    fetchMarket()
      .then(setListings)
      .catch((e) => setMarketError(String(e)));
  }, []);
```

(g) Update the `ActiveView` usage in the returned JSX:

```tsx
          <ActiveView
            id={tab}
            m={matrix}
            listings={listings}
            marketError={marketError}
          />
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:client`
Expected: PASS — the new integration test is green, and both existing App tests ("renders the hero and stats", "shows an error state") still pass (their non–URL-aware mock returns `overview` for `/api/market`, but the market tab is never opened in those tests, so `MarketBoard` is not rendered).

- [ ] **Step 5: Full verification (types, full suite, production build)**

Run: `npm run typecheck`
Expected: PASS (no TS errors).

Run: `npm test`
Expected: PASS — worker suite + client suite both green.

Run: `npm run build`
Expected: `vite build` completes with no errors (verifies the production bundle compiles; `dist/` is gitignored and is **not** committed).

- [ ] **Step 6: Format and commit**

Run: `npx biome check --write src/client/PublicViewer.tsx test/client/app.test.tsx`
Run: `npm run test:client`
Expected: PASS.

```bash
git add src/client/PublicViewer.tsx test/client/app.test.tsx
git commit -m "feat: surface market listings via new 交易看板 public tab"
```

---

## Deployment (user action, after plan completes)

The new tab is in source but not live until deployed. The user runs:

```bash
npm run deploy   # vite build && wrangler deploy
```

(Stated for completeness — not part of the implementation commits, since deploying is an outward-facing action for the user to perform.)

---

## Self-Review

**Spec coverage** (against `2026-06-27-public-market-board-design.md`):
- §4.2 pure `MarketBoard` view + row fields (rarity chip, series·character, price/want, note) → Task 1, Step 3.
- §4.3 container wiring (tab, `listings` state, effect, `ActiveView` case) → Task 2, Step 3.
- §4.4 data flow uses existing `/api/market` only; backend untouched → Global Constraints + no backend tasks.
- §4.5 edge cases: loading / empty / one-section-only / `價格面議` / `開放出價` / market error → covered by Task 1 component logic and tests (loading, empty, details, error) and the `panels.filter(Boolean)` single-panel path.
- §5 testing: client component tests (Task 1) + integration test (Task 2) + existing backend tests untouched + `npm run build` check (Task 2, Step 5).
- §6 file list matches the File Structure table above.

**Placeholder scan:** No TBD/TODO/"handle edge cases" — every code step contains complete code.

**Type consistency:** `MarketBoard({ listings, error })` signature is identical in Task 1 (definition) and Task 2 (usage). `listings: MarketListing[] | null` and `marketError: string | null` thread consistently through `PublicViewer` state → `ActiveView` props → `MarketBoard` props. `MarketListing` fields used (`cardId`, `series`, `character`, `rarity`, `status`, `askingPrice`, `wantInReturn`, `note`) match `src/shared/types.ts:34`.
