# 設計：等待交換中（暫定交換 Pending Trade）

- 日期：2026-06-27
- 狀態：待使用者審查
- 相關：`SPEC.md §6`（資料模型 / 狀態機）、`SPEC.md §7.1`（公開交換）、`docs/superpowers/specs/2026-06-27-public-market-board-design.md`（交易看板，另一條交易線）

## 1. 背景 / 問題

公開頁「交換（Trade）」分頁目前顯示 `computeTrade()` **自動推算**的兩欄：

- **可換出（surplus）**：持有 ≥ 2 的重複卡（`spare = owned − 1`）。
- **想換入（needs）**：持有 = 0 的缺卡。

兩者純由收藏數量即時導出，**沒有任何持久狀態**。

實務上，當有人跟收藏者**預約**一筆交換（例如下表）時，這筆「已經談好、等待當面完成」
的交易在系統裡無處可放：

| 稀有度 | 對方給（我換入） | 我給出 |
| :--- | :--- | :--- |
| **R** | 殺手 煌 | 四週年 橙 |
| **SR** | 殺手 幸 | 四週年 祈 |

收藏者希望能把這種預約「寫上去」，並讓交換頁**先反映**這筆暫定交易：可換出的卡
（四週年 橙 / 祈）數量先扣掉、想換入的卡（殺手 煌 / 幸）先從缺卡移除，最後在頁面
下方列出「暫定交換列表」。等實際當面交換完成後，再一鍵把卡的進出寫進真實持有庫。

## 2. 目標 / 非目標

### 目標
- 新增「等待交換中」概念：收藏者可在後台登記一筆預約（多行給出 / 換入 + 對象 + 日期 + 備註）。
- 公開交換頁即時反映 pending 預約：可換出 / 想換入數量各自扣減，並在最下方顯示「暫定交換列表」。
- **pending 期間完全不動 `cards` 表**（收藏總覽、統計、缺卡、交易看板皆不受影響）。
- 「完成」時協助收藏者把交易寫進真實持有庫（給出卡 → 離開持有、換入卡 → 加入持有）並留下交易歷史。
- 隱私：公開頁**不顯示對象與備註**；兩者僅後台可見。預約列於完成 / 取消後刪除；**完成**時對象 / 備註轉存進私人交易歷史（受 Access 保護、不對外），**取消**則不留任何紀錄。
- 支援不對稱交換（多換一 / 一換多）。

### 非目標（YAGNI）
- 不在 pending 期間綁定特定實體卡 id（給出卡來自重複卡，完成時再挑一張即可）。
- 不做線上撮合、出價、聊天、通知（`SPEC.md §2 非目標`）。
- 不改現有「交易看板（Market）」分頁——那是另一條獨立的掛牌資料線。
- 不在 `cards` 表新增 `pending`/`reserved` 狀態，也不改 `ACTIVE` 持有集合與既有任何 query。
- pending 預約**不留 status 欄位**：表內永遠只有 pending；完成與取消都是刪除。

## 3. 現況分析

| 層級 | 位置 | 狀態 |
| --- | --- | --- |
| 自動推算交換 | `computeTrade()` (`src/client/collection.ts:73`) | ✅ 已有，本設計在其輸出上**疊加扣減** |
| 公開交換 UI | `Trade.tsx` (`src/client/views/Trade.tsx`) | ✅ 已有，新增 pending 扣減 + 暫定列表 |
| 容器抓資料 | `PublicViewer.tsx` | ✅ 已有，多接一條 `pending-trades` 資料線 |
| 後台分頁框架 | `Admin.tsx` TABS + 各分頁元件 | ✅ 已有，新增「交換預約」分頁 |
| 後台動作表單樣式 | `ActionForm`/`.action-form` (`ManageCards.tsx`) | ✅ 沿用其 inline 表單 + 日期選擇模式 |
| catalog 解析 | `catalogId()` (`queries.ts:131`) | ✅ 沿用（由 系列/角色/稀有度 → catalog_id） |
| 交換成交寫入 | `recordTransaction()` (`queries.ts:219`) | ✅ 完成邏輯沿用其 trade 語義（卡→traded、換得卡→owned/trade_in、寫 transactions） |
| **pending 預約儲存** | —— | ❌ **缺，本設計新增兩張表** |

### 設計核心：投影疊加（projection overlay）

交換頁 = `computeTrade(owned counts) − pending reservations`。新表只被「交換頁」與
「後台交換預約分頁」兩個消費者讀取，故能做到「只動交換頁、其餘統計全不變」。

## 4. 資料模型（migration `0004_pending_trades.sql`）

一筆預約 = 一個人的一次交換，含多行給出 / 換入。父子表，沿用 `openings`/`cards` 風格：

```sql
-- 0004_pending_trades.sql — 暫定交換預約（SPEC：等待交換中）
-- 與 0002/0003 一致：不使用 BEGIN/COMMIT（遠端 D1 套用 migration 的限制）。

CREATE TABLE trade_reservations (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  counterparty TEXT,                              -- 對象（選填；僅後台可見，完成/取消時清除）
  reserved_at  TEXT    NOT NULL,                  -- 預約日期 YYYY-MM-DD
  note         TEXT,                              -- 備註（選填；僅後台可見，完成/取消時清除）
  created_at   TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE trade_reservation_lines (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  reservation_id INTEGER NOT NULL REFERENCES trade_reservations(id),
  direction      TEXT    NOT NULL,                -- 'give'（我給出）/ 'receive'（我換入）
  catalog_id     INTEGER NOT NULL REFERENCES card_catalog(id),
  qty            INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX idx_resv_lines_resv ON trade_reservation_lines(reservation_id);
```

- **無 status 欄位**：表內只存活躍中的 pending 預約。完成 / 取消都是 `DELETE`（連 lines 一併刪）。
- `direction` 用英文 enum（`give`/`receive`），與全系統「DB 用英文、UI 顯示中文」一致（`SPEC.md §6`）。

## 5. 型別（`src/shared/types.ts` 新增）

```ts
export type TradeDirection = "give" | "receive";

// 讀取用：一行（join catalog 帶出顯示欄位）
export interface ReservationLine {
  direction: TradeDirection;
  catalogId: number;
  series: string;
  character: string;
  rarity: Rarity;
  qty: number;
}

// 公開 DTO：不含 counterparty、不含 note
export interface PublicPendingTrade {
  id: number;
  reservedAt: string;
  give: ReservationLine[];      // direction='give'
  receive: ReservationLine[];   // direction='receive'
}

// 後台 DTO：額外帶出對象與備註
export interface AdminPendingTrade extends PublicPendingTrade {
  counterparty: string | null;
  note: string | null;
}

// 新增預約輸入：行以 系列/角色/稀有度 表示，後端用 catalogId() 解析（與 addCards 一致）
export interface ReservationLineInput {
  series: string;
  character: string;
  rarity: Rarity;
  qty: number;
}
export interface CreateReservationInput {
  counterparty?: string;
  reservedAt: string;
  note?: string;
  give: ReservationLineInput[];
  receive: ReservationLineInput[];
}

// 完成輸入：可選日期（預設今天由前端帶入）
export interface CompleteReservationInput {
  happenedAt: string;
}
```

## 6. API（`src/worker/app.ts` + `src/client/api.ts`）

### 後端路由

公開（免認證，唯讀）：
- `GET /api/pending-trades` → `PublicPendingTrade[]`（**不含對象 / 備註**）

管理（受 Cloudflare Access 保護，前綴 `/api/admin/*`）：
- `GET /api/admin/pending-trades` → `AdminPendingTrade[]`（含對象 / 備註，供後台列表與下拉扣減）
- `POST /api/admin/pending-trades`（`CreateReservationInput`）→ `{ id }`
- `POST /api/admin/pending-trades/:id/complete`（`CompleteReservationInput`）→ `{ ok: true }`（整合進真實庫存 + 刪預約）
- `DELETE /api/admin/pending-trades/:id` → `{ ok: true }`（取消 = 刪預約）

> 用 `POST .../:id/complete`（動作有副作用）與 `DELETE`（取消），語義比一個多載的 PATCH 清楚，
> 且與既有 `POST /transactions`、`PATCH /cards/:id` 的風格一致。

### Client API（沿用 `get`/`send` helper）
```ts
export const fetchPendingTrades = () => get<PublicPendingTrade[]>("/api/pending-trades");
export const fetchAdminPendingTrades = () => get<AdminPendingTrade[]>("/api/admin/pending-trades");
export const postReservation = (input: CreateReservationInput) =>
  send<{ id: number }>("POST", "/api/admin/pending-trades", input);
export const completeReservation = (id: number, happenedAt: string) =>
  send<{ ok: true }>("POST", `/api/admin/pending-trades/${id}/complete`, { happenedAt });
export const cancelReservation = (id: number) =>
  send<{ ok: true }>("DELETE", `/api/admin/pending-trades/${id}`, {});
```

## 7. 後端查詢（`src/worker/db/queries.ts` 新增）

- `getPublicPendingTrades(db)` / `getAdminPendingTrades(db)`：撈 headers + lines（lines `JOIN card_catalog` 帶出 系列/角色/稀有度），在 JS 依 `reservation_id` 分組、依 `direction` 切成 `give`/`receive`。公開版 SELECT 不取 `counterparty`/`note`。
- `createReservation(db, input)`：INSERT header → 逐行 `catalogId()` 解析後 INSERT lines。
- `cancelReservation(db, id)`：DELETE lines + header。
- `completeReservation(db, id, happenedAt)`：見 §8。

## 8. 完成（complete）演算法 —— 整合進真實庫存

這是本功能最關鍵、也最需精確的部分。**保證與規則**：

### 8.1 持有庫保證（一定成立）
- 每個「給出」單位 → 從持有挑一張該卡種的卡（`status IN ('owned','for_sale','for_trade')`，
  **優先 `owned`**）標記 `traded`。給出卡來自重複卡，必有實體可消耗。
- 每個「換入」單位 → 新增一列 `cards(catalog_id, status='owned', source='trade_in')`。

完成後持有庫一定正確：給出卡離開 `ACTIVE`、換入卡加入 `ACTIVE`，收藏總覽 / 統計
此刻才（正確地）更新。

### 8.2 交易歷史配對
給出與換入各依稀有度排序（R→SR→SSR→UR），以索引逐一配對，產生 `transactions`
（`type='trade'`、帶 `counterparty`、`happened_at`、`note`，沿用 `recordTransaction` 的欄位語義）：

| 情境 | 處理 |
| --- | --- |
| 對稱（給出數 = 換入數） | N 筆交易，每筆 給出卡 ↔ 換入卡（`received_catalog_id` / `received_card_id` 填入配對的換入卡） |
| 多換一（給出 > 換入） | 配對到的照常；多出的給出寫成**單向送出**（`received_*` 留空） |
| 一換多（換入 > 給出） | 配對到的照常；多出的換入仍**加入持有**（§8.1 保證），並把這些卡列在**最後一筆交易的 `note`**，確保私人歷史可追溯 |

> 至少需一張「給出」（否則不構成交換、也無 `card_id` 可掛交易）。後台表單會擋下「給出」為空的送出。

### 8.3 量（qty）
每行可帶 `qty`（預設 1）。完成時把每行展開成 `qty` 個「單位」再做 §8.1 / §8.2。
給出行的 `qty` 上限 = 該卡種**目前調整後的可換出餘量**（見 §9），由後台表單限制。

### 8.4 收尾
- 完成後 `DELETE` 該預約（header + lines）→ 對象與備註一併清除（滿足隱私要求）。
- **對象 / 備註會保留在私人交易歷史**（`transactions.counterparty` / `transactions.note`）——
  交易歷史本就受 Access 保護、不公開，本質上即「不對外」。

### 8.5 原子性
完成牽涉多筆寫入（標 traded、insert 換入卡、insert transactions、delete 預約），且需用前一步
INSERT 的 id 串接 `received_card_id`，故採**循序 await**（與既有 `recordTransaction` 一致；
遠端 D1 不支援跨 await 的互動式交易）。本動作僅由本人在後台單機觸發、無併發，半完成風險極低；
列為已知取捨。

## 9. 投影扣減（`src/client/collection.ts` 新增純函式）

```ts
export function computeTradeWithPending(
  m: Matrix,
  pending: PublicPendingTrade[],
): { surplus: TradeItem[]; needs: TradeItem[] }
```

在 `computeTrade(m)` 的輸出上疊加：

1. 把 pending 各行的 `(series, character, rarity)` 映射到矩陣座標 `(si, ci, ri)`。
2. `give`：累加每卡種被預約的 `qty` → `surplus.spare -= giveQty`，餘量 ≤ 0 者**從可換出移除**。
3. `receive`：對應卡種**從想換入移除**（缺口即將補上；needs 為二元「缺 / 不缺」，任一 receive 即移除）。

`Trade.tsx` 改用此函式；後台表單的下拉清單也用同一函式算「目前可選的給出 / 換入」，
天然**防止重複預約**（已被預約的餘量不會再出現）。純函式、易單元測試，符合本 repo「view 吃 props、邏輯抽純函式測試」的慣例。

`★ 為什麼不會重複計算`：完成同時做「實體卡變動」＋「刪預約」。給出卡變 `traded`、
換入卡變 `owned`，`getOverview` 原始 surplus/needs 自然更新；同一刻預約被刪，疊加層不再扣 →
兩者剛好交棒，同一張卡永遠不會被 pending 與 completed 同時作用。

## 10. 公開交換頁變更（`Trade.tsx` / `PublicViewer.tsx`）

- `PublicViewer`：新增 `fetchPendingTrades().then(setPending)` effect（與 overview / market 並列；
  載入失敗只影響本分頁），把 `pending` 傳給 `<Trade m={m} pending={pending} />`。
- `Trade`：改用 `computeTradeWithPending(m, pending)` 取得 surplus/needs（其餘摘要、篩選、警告邏輯不變）。
- 在 `.trade-grid` 之後新增「**暫定交換列表**」`<section>`，每筆預約一張卡，**以「我」為視角**、
  **不顯示對象 / 備註**：

```
暫定交換列表
┌──────────────────────────────────┐
│ 2026-06-27                        │
│  稀有度    給出        換入        │
│   R       四週年 橙    殺手 煌     │
│   SR      四週年 祈    殺手 幸     │
└──────────────────────────────────┘
```

- pending 為空 → 不顯示此區塊（或顯示精簡空狀態）。

## 11. 後台「交換預約」分頁（`src/client/admin/PendingTrades.tsx` + `Admin.tsx`）

- `Admin.tsx` TABS 新增 `{ id: "reserve", label: "交換預約" }`，渲染 `<PendingTrades />`。
- 元件載入 `/api/overview`（→ `buildMatrix`）與 `/api/admin/pending-trades`，用 `computeTradeWithPending` 算出「目前可選的給出 / 換入」。
- **新增表單**（沿用 `.action-form` inline 樣式）：
  - 對象（選填）、日期（預設今天）、備註（選填）。
  - 動態增減「給出」行：下拉只列**目前可換出**的卡 + `qty`（上限為調整後餘量）。
  - 動態增減「換入」行：下拉只列**目前想換入**的卡 + `qty`。
  - 送出前驗證：至少一張給出、所有行皆有效；`POST` 後 reload。
- **pending 列表**：每筆顯示對象 + 日期 + 給出/換入摘要，附「完成」「取消」：
  - 「完成」展開 inline 日期選擇（預設今天）→ `POST .../:id/complete` → reload（比照 `ManageCards` 的 `ActionForm`）。
  - 「取消」→ `DELETE` → reload。

## 12. 資料流

```
後台新增預約 → POST /api/admin/pending-trades → trade_reservations(+lines)
                                                   │
       ┌───────────────────────────────────────────┤
       ▼ (公開)                                      ▼ (後台)
GET /api/pending-trades (無對象/備註)        GET /api/admin/pending-trades (含對象/備註)
       ▼                                              ▼
PublicViewer.pending → Trade               PendingTrades 列表 + 下拉扣減
  computeTradeWithPending(m, pending)
  → 扣減後的可換出/想換入 + 暫定交換列表

後台按「完成」→ POST /api/admin/pending-trades/:id/complete
  → 給出卡 status=traded、換入卡 insert owned/trade_in、寫 transactions、DELETE 預約
  → 之後 GET /api/overview 自然反映新持有；交易歷史可見此筆
```

## 13. 邊界情況

| 情況 | 行為 |
| --- | --- |
| 尚未載入 pending | 交換頁照常顯示未扣減的 surplus/needs；暫定列表顯示載入中 / 不顯示 |
| 無任何 pending 預約 | 不顯示「暫定交換列表」區塊；交換頁與現況完全相同 |
| `/api/pending-trades` 載入失敗 | 僅暫定列表 / 扣減不生效，不影響交換頁其餘部分與其他分頁 |
| 給出量超過目前餘量 | 後台下拉以調整後餘量為上限，從源頭擋下；不會出現負數 |
| 多換一 / 一換多 | 見 §8.2；持有庫一定正確，歷史盡力配對 |
| 完成時該卡種已無持有（被另途賣掉） | 完成回傳錯誤，不做半套變更；後台顯示錯誤訊息（罕見，pending 期間餘量已被扣以避免重複處置） |
| 公開頁 | 永不顯示對象與備註（只顯示日期 + 給出/換入卡種） |

## 14. 測試

- **`computeTradeWithPending`（純函式，新增 `test/client/collection.test.ts` 或併入既有）**：
  - give 扣 `spare`、歸 0 從可換出消失；receive 從想換入移除。
  - 多換一 / 一換多 / qty > 1。
  - 空 pending → 等同 `computeTrade`。
- **`completeReservation`（worker 測試）**：建立預約 → 完成 → 斷言給出卡 `traded`、換入卡
  `owned`/`trade_in`、`transactions` 筆數與配對、預約已刪、對象/備註進 transactions。涵蓋對稱 / 多換一 / 一換多。
- **API 測試**（比照 `api-public.test.ts` / `api-admin.test.ts`）：公開端點**不含**對象/備註、後台端點**含**；
  create / complete / cancel；admin 端點未過 Access 應擋下。
- **`Trade.tsx` 渲染測試**：餵 pending 斷言扣減後的數字與「暫定交換列表」內容、且**不渲染對象**。
- **建置**：`npm run build` 本機驗證前端可編譯（`dist/` 已 gitignore）；上線由 `npm run deploy`（使用者執行）。

## 15. 變更檔案清單

| 檔案 | 動作 |
| --- | --- |
| `migrations/0004_pending_trades.sql` | 新增（兩張表 + index） |
| `src/shared/types.ts` | 新增 pending 相關型別 |
| `src/worker/db/queries.ts` | 新增 get/create/complete/cancel 查詢 |
| `src/worker/app.ts` | 新增 1 公開 + 4 管理路由 |
| `src/client/api.ts` | 新增 5 個 client API |
| `src/client/collection.ts` | 新增 `computeTradeWithPending` 純函式 |
| `src/client/views/Trade.tsx` | 改用扣減後資料 + 暫定交換列表區塊 |
| `src/client/PublicViewer.tsx` | 新增 pending state/effect、傳入 Trade |
| `src/client/admin/PendingTrades.tsx` | 新增（後台分頁元件） |
| `src/client/admin/Admin.tsx` | 新增「交換預約」分頁 |
| `src/client/index.css` / `admin/admin.css` | 少量樣式（盡量重用 `.trade-*` / `.action-form`） |
| `test/client/*`、`test/worker/*` | 新增上述測試 |
| `worker-configuration.d.ts` | 不變（無新 binding） |

## 16. 風險

中低。pending 期間為純疊加層、不碰後端既有資料，風險僅在前端顯示（元件測試可攔）。
較高風險集中在 §8「完成」會寫真實庫存與歷史：以充分的 worker 測試覆蓋對稱 / 不對稱情境，
並確保完成失敗時不留半套變更（先檢查可消耗的持有卡是否足夠，再開始寫入）。
