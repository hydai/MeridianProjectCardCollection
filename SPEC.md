# SPEC — 子午卡包收藏管理系統

> Meridian Project Card Collection Manager
> 版本：v1 設計定稿 · 日期：2026-06-27 · 狀態：待使用者最終 review

---

## 1. 目的與背景

收藏者目前用一份 Google Sheet 記錄子午（Meridian Project）卡片收藏，並用一個 Claude artifact 當展示介面。痛點是：**每次更新都要在 Sheet 改完，再手動複製貼上到 artifact**，流程慢且容易過期。

本專案打造一個部署在 Cloudflare 上的網站，讓收藏者能**即時**管理「開新卡包、賣出、交換」，並取代複製貼上流程。網站**公開可瀏覽**（收藏進度 + 交易看板），但**只有本人能編輯**。

## 2. 目標與非目標

### 目標（Goals）
- 取代「Sheet → 複製貼上 artifact」的手動流程，改為直接在網站即時編輯。
- 公開展示收藏進度、缺卡、可換/可售清單，方便與其他玩家交流交易。
- 管理重複卡的上架（待售/待換）與成交（賣出/交換）並保留歷史。
- 記錄開箱事件與花費，自動算出抽卡成本。
- 只有本人能編輯，認證交給 Cloudflare Access 託管。

### 非目標（Non-Goals，v1 不做）
- 卡片圖片上傳（之後可加 R2）。
- 多人協作 / 即時推播（WebSocket）。單人編輯即可。
- 線上金流 / 自動撮合交易。交易僅做記錄。
- 雙向同步 Google Sheet（改用網站當唯一來源）。
- 目錄自助新增系列的完整 UI（v1 以 seed 為主，新增卡種見 §11）。

## 3. 名詞定義（Glossary）

| 中文 | 英文 / DB 用詞 | 說明 |
|---|---|---|
| 系列 | series | NEW YEAR、BUNNY GIRL、KILLER、MP 4TH（未來會新增） |
| 角色 | character | 共通 11 位 + KSP（MP 4TH 限定），共 12 位 |
| 稀有度 | rarity | R / SR / SSR / UR |
| 卡種 | card type / catalog entry | 一組唯一的（系列, 角色, 稀有度）。全宇宙約 180 種 |
| 卡片 | card | 你實際擁有的一張實體卡，對應某個卡種 |
| 開箱事件 | opening | 一次開包，含日期與花費；多張卡可歸屬於此（選配） |
| 成交 | transaction | 一筆完成的賣出或交換，含對象/價格/日期 |
| 缺卡 | missing | 全宇宙中你目前一張都沒有的卡種（自動算） |
| 重複卡 | duplicate | 同一卡種你擁有 ≥ 2 張（自動算，是上架候選） |

## 4. 使用者與存取模型

- **訪客（公開、免登入）**：可瀏覽收藏總覽、交易看板（缺卡 + 可換/可售）、公開統計。**唯讀**。
- **擁有者（本人，需登入）**：可進行所有編輯操作。透過 Cloudflare Access + Google 帳號驗證身分。
- **私密資訊**：開箱花費與成本分析屬個人理財資訊，**不公開**，僅擁有者可見。

## 5. 技術架構

採「**單一 Worker + D1 + 靜態前端**」（Cloudflare 現行推薦模式）。

```
                ┌──────────────────────── Cloudflare ────────────────────────┐
   訪客  ─────► │  Worker (Hono)                                              │
   (公開讀)     │   ├─ 靜態前端 (Workers Static Assets, React SPA)           │
                │   ├─ 公開 API   GET /api/*          ← 任何人可讀            │
   擁有者 ─────►│   └─ 管理 API   /api/admin/*        ← Cloudflare Access 擋  │
   (Access登入) │                  /admin (SPA 管理頁) ← Cloudflare Access 擋 │
                │         │                                                   │
                │         ▼                                                   │
                │      D1 (SQLite)  card_catalog / cards / openings / txns    │
                └────────────────────────────────────────────────────────────┘
```

- **前端**：React（與既有 artifact 一致）+ Vite 打包，輸出由 Workers Static Assets 服務。
- **API**：Hono 路由跑在同一個 Worker。
- **資料庫**：Cloudflare D1（SQLite）。所有統計用 SQL 查詢即時算出，不存衍生表。
- **認證**：Cloudflare Access（見 §8）。
- **子請求量**：每個請求僅數條 D1 查詢，遠低於平台限制（付費 1000／免費 50）。

## 6. 資料模型（D1 / SQLite）

狀態與來源在 DB 用英文 enum，UI 顯示中文。

```sql
-- 6.1 卡種目錄：全宇宙。決定「總共有哪些卡」，是收藏進度與缺卡的基準。
CREATE TABLE card_catalog (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  series     TEXT    NOT NULL,                 -- NEW YEAR / BUNNY GIRL / KILLER / MP 4TH / ...
  character  TEXT    NOT NULL,                 -- Mizuki / ... / KSP
  rarity     TEXT    NOT NULL,                 -- R / SR / SSR / UR
  sort_order INTEGER NOT NULL DEFAULT 0,
  UNIQUE (series, character, rarity)
);

-- 6.2 系列中繼資料（排序、是否啟用；方便 UI 排序與未來擴充）
CREATE TABLE series (
  name       TEXT    PRIMARY KEY,              -- = card_catalog.series
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active  INTEGER NOT NULL DEFAULT 1        -- 0/1
);

-- 6.3 開箱事件（選配父層）
CREATE TABLE openings (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  series     TEXT,                             -- 該次開箱主要系列（可空）
  opened_at  TEXT    NOT NULL,                 -- ISO 日期 YYYY-MM-DD
  cost       REAL,                             -- 總花費（可空）
  currency   TEXT    NOT NULL DEFAULT 'TWD',
  note       TEXT,
  created_at TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- 6.4 你擁有（或曾擁有）的實體卡
CREATE TABLE cards (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  catalog_id     INTEGER NOT NULL REFERENCES card_catalog(id),
  status         TEXT    NOT NULL DEFAULT 'owned',  -- owned/for_sale/for_trade/sold/traded
  source         TEXT    NOT NULL DEFAULT 'pull',   -- pull/purchase/trade_in
  opening_id     INTEGER REFERENCES openings(id),   -- 選配
  asking_price   REAL,                              -- 待售價（status=for_sale）
  want_in_return TEXT,                              -- 待換想要的（status=for_trade）
  note           TEXT,
  created_at     TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- 6.5 成交歷史
CREATE TABLE transactions (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  card_id             INTEGER NOT NULL REFERENCES cards(id),
  type                TEXT    NOT NULL,              -- sale / trade
  counterparty        TEXT,                          -- 對象
  price               REAL,                          -- 賣出成交價（type=sale）
  currency            TEXT    DEFAULT 'TWD',
  received_catalog_id INTEGER REFERENCES card_catalog(id), -- 換得的卡種（type=trade）
  received_card_id    INTEGER REFERENCES cards(id),        -- 換得的卡在 cards 的對應列
  happened_at         TEXT    NOT NULL,              -- ISO 日期
  note                TEXT,
  created_at          TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_cards_catalog ON cards(catalog_id);
CREATE INDEX idx_cards_status  ON cards(status);
CREATE INDEX idx_cards_opening ON cards(opening_id);
CREATE INDEX idx_txn_card      ON transactions(card_id);
```

### 6.6 狀態機與庫存規則
- **持有庫存（active inventory）** = `status IN ('owned','for_sale','for_trade')`。所有收藏統計只算這些。
- `sold` / `traded` 的卡**退出收藏統計**，但保留在 `cards` 與 `transactions` 供歷史查詢。
- **賣出**：`cards.status → sold`，新增一筆 `transactions(type='sale', price, counterparty, happened_at)`。
- **交換出去**：`cards.status → traded`，新增 `transactions(type='trade', counterparty, received_catalog_id, happened_at)`；同時**換得的卡**新增一列 `cards(source='trade_in', status='owned')`，並回填 `transactions.received_card_id`。

### 6.7 衍生查詢（即時算，不存表）
- **持有數/卡種**：`SELECT catalog_id, COUNT(*) FROM cards WHERE status IN ('owned','for_sale','for_trade') GROUP BY catalog_id`
- **缺卡（wishlist）**：`card_catalog` 中持有數 = 0 者。
- **重複卡**：持有數 ≥ 2 者（上架候選）。
- **收藏進度/系列**：該系列已擁有的卡種數 ÷ 該系列卡種總數。
- **稀有度/角色統計、抽卡機率**：對 `cards` JOIN `card_catalog` 做 `GROUP BY`。
- **開箱成本**：每次 `openings.cost ÷ 該 opening_id 的卡片數`；每張稀有度成本可再 JOIN 細分。

## 7. 功能規格

### 7.1 公開（免登入，唯讀）
- **收藏總覽**：系列 × 角色 × 稀有度的格子圖，顯示各卡種持有數、各系列完成度 %、缺的格子標紅（重現 Sheet 體驗）。
- **交易看板**：
  - 「我想要」＝缺卡清單（自動算）。
  - 「我可換 / 可售」＝ `status IN ('for_sale','for_trade')` 的卡，含待售價或想換的卡 + 備註。
- **公開統計**：稀有度分布、角色統計、抽卡機率。

### 7.2 管理（需登入，本人）
- **開箱新增**：選系列 → 連續快速新增多張（角色 + 稀有度）；可建立一個「開箱事件」（日期 + 花費）把這批卡歸進去。
- **卡片管理**：搜尋 / 篩選（系列、角色、稀有度、狀態）；改狀態；設定待售價或待換想要的卡；標記成交（自動寫入歷史並退出持有統計）。
- **開箱成本分析**（私人）：每次開箱平均每張成本、每張 UR 成本等。
- **交易歷史**（私人）：所有成交紀錄。

### 7.3 API 介面（草案）
公開（GET，免認證）：
- `GET /api/overview`、`GET /api/missing`、`GET /api/market`、`GET /api/stats`

管理（需 Access，路徑前綴 `/api/admin/*`）：
- `POST /api/admin/cards`（單張或批次新增）
- `PATCH /api/admin/cards/:id`（改狀態 / 價格 / 備註）
- `DELETE /api/admin/cards/:id`
- `POST /api/admin/openings`、`GET /api/admin/openings`（含成本分析）
- `POST /api/admin/transactions`、`GET /api/admin/transactions`

## 8. 認證（Cloudflare Access）

- 網站掛在使用者**自有網域**（已託管於 Cloudflare）。
- 在 Cloudflare Zero Trust 建立 Access 應用，保護兩個路徑：
  - `/admin*`（管理 SPA）
  - `/api/admin/*`（所有寫入 API）
- 政策：**僅允許本人 Google 信箱**通過。
- 公開內容（`/`、`GET /api/*`）不受 Access 保護。
- **縱深防禦（建議）**：Worker 對管理路徑額外驗證 `Cf-Access-Jwt-Assertion` header（核對 Access 簽發者與信箱），即使路徑設定失誤也能擋下寫入。

## 9. 資料匯入（一次性）

從現有 Google Sheet 產生 seed 與匯入 SQL：

- **卡種目錄（約 180 筆）** 由「系列 × 角色 × 稀有度」產生：
  - 系列順序：`NEW YEAR, BUNNY GIRL, KILLER, MP 4TH`
  - 共通 11 角：`Mizuki, Rei, Yuzumi, Kirari, Iruni, Itsuki, 998, Sachi, Koyuki, Hiyori, Hitomi`
  - `MP 4TH` 另含 `KSP`（共 12 角）
  - 稀有度：`R, SR, SSR, UR`
  - → 44 + 44 + 44 + 48 = **180** 卡種
- **持有卡片（約 258 筆）** 來自「開箱記錄」工作表，每列對應一張 `cards`：
  - 對應到 `card_catalog`（系列+角色+稀有度）。
  - 備註為「購入」者 → `source='purchase'`，其餘 → `source='pull'`，狀態一律 `owned`。
- 匯入後跑驗證查詢，核對各系列/稀有度張數是否與 Sheet 統計一致（修正 Sheet 中 MP 4TH 進度分母 /44 → /48 的舊誤差）。

## 10. 部署

- 以 Wrangler 管理 Worker、D1 binding、Static Assets。
- 流程：建立 D1 → 套用 schema migration → seed 目錄 → 匯入持有卡 → 部署 Worker → 設定自訂網域路由 → 在 Zero Trust 設定 Access 應用與政策。
- 環境：本機 `wrangler dev`（含本地 D1）開發；`wrangler deploy` 上線。

## 11. v1 範圍與未來

### v1 範圍
資料匯入、公開（收藏總覽 + 交易看板 + 公開統計）、管理（開箱新增、卡片管理、開箱成本、交易歷史）、Cloudflare Access 認證、自訂網域部署。

### 未來（v1.1+）
- 卡片圖片（Cloudflare R2）。
- 卡種目錄自助管理 UI（新增 MP 5TH 等未來系列；v1 先以新增卡種的簡易管理 API 或重跑 seed 處理）。
- 一鍵匯出回 Google Sheet 備份。
- 進階統計與圖表。

## 12. 開放問題

- 前端視覺風格：以既有 artifact（`meridian-cards.html`）的外觀為基礎重建；實作階段請使用者提供截圖以精準對齊，否則採乾淨的卡片收藏風格設計。
- 幣別預設 TWD；若有跨幣別交易需求再擴充。
