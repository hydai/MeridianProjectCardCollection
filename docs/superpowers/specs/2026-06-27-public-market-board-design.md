# 設計：公開「交易看板」分頁（Public Market Board）

- 日期：2026-06-27
- 狀態：已通過設計審查，待寫實作計畫
- 相關：`SPEC.md §7.1`（原始「交易看板」需求）

## 1. 背景 / 問題

管理者可在 `/admin` 將任一卡片狀態設為 `for_sale`（待售，含 `asking_price`）或
`for_trade`（待換，含 `want_in_return`），資料寫入 `cards` 表。但這些「掛牌」
在公開頁**完全看不到** —— 沒有任何訪客能得知哪些卡可買或可換。

根因：公開頁現有的「交換（Trade）」分頁顯示的是 `computeTrade()` **自動推算**的
`surplus`（持有 ≥2 的重複卡）與 `needs`（持有 0 的缺卡），純粹由收藏數量導出，
**與實際掛牌無關**。原始 `SPEC.md §7.1` 規劃的公開「交易看板」要顯示
`status IN ('for_sale','for_trade')` 的實際清單（含價格 / 想換的 / 備註），
但這一層前端 UI 從未實作。

## 2. 目標 / 非目標

### 目標
- 公開頁新增一個獨立分頁，顯示所有 `for_sale` / `for_trade` 掛牌卡片。
- 顯示足夠資訊讓訪客判斷與洽談：系列、角色、稀有度、價格 / 想換條件、備註。
- 完全沿用既有架構與視覺語言，風險最小化。

### 非目標（YAGNI）
- 不動現有「交換」分析分頁（使用者選擇保留）。
- 不加線上金流、自動撮合、出價、聯絡表單（`SPEC.md §3` 明確排除）。
- 不重命名「交換」分頁（若日後覺得與「交易看板」易混淆，可另行處理）。
- 不改任何 DB schema、query、API route。

## 3. 現況分析（已存在、可直接沿用）

全棧資料契約早已鋪好，僅缺最後一層 UI：

| 層級 | 位置 | 狀態 |
| --- | --- | --- |
| DB 欄位 | `cards.status` / `asking_price` / `want_in_return` (`migrations/0001_init.sql`) | ✅ 已有 |
| Query | `getMarket()` (`src/worker/db/queries.ts:73`) | ✅ 已有，已測試 |
| Route | `GET /api/market` (`src/worker/app.ts:29`) | ✅ 已有，已測試 |
| Client API | `fetchMarket()` (`src/client/api.ts:38`) | ✅ 已有 |
| 型別 | `MarketListing` (`src/shared/types.ts:34`) | ✅ 已有 |
| **公開 UI** | —— | ❌ **缺，本設計補上** |

`MarketListing` 形狀：
```ts
interface MarketListing {
  cardId: number;
  series: string;
  character: string;
  rarity: Rarity;               // "R" | "SR" | "SSR" | "UR"
  status: "for_sale" | "for_trade";
  askingPrice: number | null;
  wantInReturn: string | null;
  note: string | null;
}
```
`getMarket()` 已依 `card_catalog.sort_order`（系列為主、稀有度次之）排序。

## 4. 設計

### 4.1 架構（沿用既有模式）

本 repo 的慣例：**`PublicViewer` 是唯一抓資料的容器，各 view 是純元件（吃 props、
易測試）**。本設計嚴格遵循，不引入新模式。

### 4.2 元件

**新檔 `src/client/views/Market.tsx`** —— 純展示元件：

```ts
export function MarketBoard({ listings }: { listings: MarketListing[] | null })
```

渲染規則：
- `listings === null` → `載入中…`
- 依 `status` 切成兩組：`forSale`（`for_sale`）、`forTrade`（`for_trade`）。
- 兩組皆空 → 單一空狀態訊息：`目前沒有上架中的卡片。`
- 只有一組有資料 → 只渲染該組面板（不顯示空面板）。
- 沿用 `.trade-panel` / `.trade-empty` 樣式與 `MissChip` 的稀有度色票，維持視覺一致。
- 外層 `<section className="view view-market">`（與其他 view 一致，便於測試以
  `section.view` 斷言）。

**每張掛牌列顯示**：
- 稀有度 chip（重用 `MissChip` 色票 / `RARITY_KEYS` class）＋ 系列 ＋ 角色。
- 待售（`for_sale`）：價格 ——
  - `askingPrice != null` → `{askingPrice} 元`（與 admin `ManageCards` 顯示一致）。
  - `askingPrice == null` → `價格面議`。
- 待換（`for_trade`）：想換條件 ——
  - `wantInReturn` 有值 → `想換：{wantInReturn}`。
  - `wantInReturn == null` → `開放出價`。
- `note` 有值 → 以次要文字（如 `var(--text-tertiary)`）顯示於該列下方。

### 4.3 容器接線

**改 `src/client/PublicViewer.tsx`**：
1. `TABS` 陣列尾端（接在 `trade` 之後）新增：
   `{ id: "market", zh: "交易看板", en: "Market" }`。
2. 新增 state：`const [listings, setListings] = useState<MarketListing[] | null>(null)`。
3. 新增 effect：`fetchMarket().then(setListings).catch(...)`（與既有 `fetchOverview`
   effect 並列；market 載入失敗不應阻擋其他分頁，錯誤僅影響本分頁顯示）。
4. `ActiveView` 增加 `listings` prop 與 `case "market": return <MarketBoard listings={listings} />`。

### 4.4 資料流

```
admin 設定狀態 → cards 表 → getMarket() → GET /api/market
→ fetchMarket() → PublicViewer.listings → <MarketBoard listings={...} />
```
後端三層（query / route / client API）**完全不動**。

### 4.5 邊界情況

| 情況 | 行為 |
| --- | --- |
| 尚未載入 | `MarketBoard` 顯示 `載入中…` |
| 無任何掛牌 | 顯示 `目前沒有上架中的卡片。` |
| 只有待售、無待換（或反之） | 只渲染有資料的那組面板 |
| 待售但無價格 | 顯示 `價格面議` |
| 待換但無想換條件 | 顯示 `開放出價` |
| `/api/market` 載入失敗 | 本分頁顯示錯誤訊息，不影響其他分頁 |

## 5. 測試

- **新增**：`test/client/views.test.tsx` 加入 `MarketBoard` 測試（同現有 view 風格，
  直接 `render(<MarketBoard listings={...} />)`）：
  - 餵含 `for_sale`（有價 / 無價）與 `for_trade`（有想換 / 無想換 / 有備註）的樣本，
    斷言價格、`想換：…`、`價格面議`、`開放出價`、備註正確渲染。
  - 餵 `[]` 斷言空狀態文字。
  - 餵 `null` 斷言 `載入中…`。
- **既有**：後端 `/api/market` 已有測試（`test/worker/queries-read.test.ts`、
  `api-public.test.ts`、`api-admin.test.ts`），不需新增。
- **建置**：最後 `npm run build` 重建 `dist/`，使已 commit 的前端 bundle 含新分頁。

## 6. 變更檔案清單

| 檔案 | 動作 |
| --- | --- |
| `src/client/views/Market.tsx` | 新增（純展示元件 `MarketBoard`） |
| `src/client/PublicViewer.tsx` | 改（新增 tab、`listings` state/effect、`ActiveView` case） |
| `src/client/index.css` | 視需要新增極少量 `.view-market` 列樣式（盡量重用既有 class） |
| `test/client/views.test.tsx` | 新增 `MarketBoard` 測試 |
| `dist/*` | `npm run build` 重新產生 |

## 7. 風險

低。不碰後端與資料庫；只新增一個純元件並在容器多接一條資料線。最壞情況是前端顯示
問題，可由元件測試攔截。
