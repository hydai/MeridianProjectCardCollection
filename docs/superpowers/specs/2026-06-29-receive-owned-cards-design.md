# 設計：換入「已持有的卡」（Receive Owned Cards）

- 日期：2026-06-29
- 狀態：待使用者審查
- 相關：`docs/superpowers/specs/2026-06-27-pending-trade-design.md`（暫定交換預約，本功能擴充其後台表單）、`SPEC.md §6`（資料模型）

## 1. 背景 / 問題

後台「交換預約」分頁（`src/client/admin/PendingTrades.tsx`）讓收藏者登記一筆暫定交換，
分「給出」與「換入」兩側。換入側的下拉選單目前只列出 **缺卡**（持有 = 0）：

```ts
// PendingTrades.tsx:341-348
const { surplus, needs } = computeTradeWithPending(m, pending);
return {
  giveOpts: surplus.map((t) => toOpt(m, t, t.spare)), // 給出 = 重複卡（持有 ≥ 2）
  recvOpts: needs.map((t) => toOpt(m, t, 1)),         // 換入 = 缺卡（持有 = 0）← 限制在此
};
```

實務上，**對方有時是拿「我已經有的卡」來跟我換**（例如我想多收一張、或對方手上只有我已有的卡，
但這筆交換對我仍划算）。目前換入下拉選不到任何已持有的卡。

### 核心觀察：限制純在前端

後端早已支援換入任意卡：

- `app.ts:104` `POST /api/admin/pending-trades` 只驗證「`reservedAt` 存在、給出 ≥ 1 行、所有 qty 為正整數」，
  **完全不檢查換入是否為缺卡**。
- `createReservation()`（`queries.ts:449`）對每一行（不分方向）都用 `catalogId()` 解析，接受任何卡種。
- `completeReservation()`（`queries.ts:509`）把每個換入單位插入 `cards(status='owned', source='trade_in')`，
  不論該卡種是否已持有。既有測試 `test/worker/pending-complete.test.ts:109`
  「never trades away a just-received card when give and receive share a catalog」
  已證明「換入一張已持有的卡」這條路徑後端正確。

故本功能本質上是 **前端把換入選單從「只有缺卡」擴大到「也能選已持有的卡」**，後端零改動。

## 2. 目標 / 非目標

### 目標
- 後台交換預約表單可在換入側選擇 **已持有（持有 ≥ 1）** 的卡。
- 不影響現有「換入缺卡」的行為與顯示。
- 已持有的換入行可帶 **多張**（qty ≥ 1）。

### 非目標（YAGNI）
- 不改後端任何 query / 路由 / 資料表（既有邏輯已支援）。
- 不改公開交換頁 `Trade.tsx` 的推算邏輯（換入已持有卡不影響 surplus/needs；暫定列表本就顯示所有換入行）。
- 不做「換入後自動更新可換出」之類的即時投影（完成時 `getOverview` 自然反映，沿用既有交棒機制）。
- 不阻止「同一卡種同時出現在給出與換入」（罕見、後端已正確處理、且有測試）。

## 3. 決策（brainstorming 已確認）

| 決策 | 選擇 | 理由 |
| --- | --- | --- |
| 換入已持有卡的呈現 | **獨立的「換入(我已有的卡)」區塊** | 改動最小、語意最清楚；現有「換入(缺卡)」列完全不動 |
| 已持有換入的數量上限 | **允許多張（qty ≥ 1）** | 已持有卡在換入側無天然上限；對方可能一次給多張 |

## 4. 變更

### 4.1 `src/client/collection.ts` — 新增純函式

```ts
// 持有 ≥ 1 的卡，作為「換入我已有的卡」候選。spare 帶當前持有數供顯示用。
// 排除不存在的格子（null cell）與持有 = 0（那些屬於 needs）。
export function ownedReceivable(m: Matrix): TradeItem[]
```

推導：對每個 `exists(m, si, ci)` 且 `getN(m, si, ci, ri) >= 1` 的座標，
推入 `{ ri, si, ci, spare: n }`（`spare` 在此語意為「目前持有數」，供顯示）。

- **獨立於 pending**：給出側預約扣減已在 `getOverview` 寫進 matrix；換入已持有卡不與 needs 清除邏輯互動，
  故無需經過 `computeTradeWithPending`。維持小而獨立、易單元測試（符合 repo「邏輯抽純函式」慣例）。
- 不更動 `computeTrade` / `computeTradeWithPending` 的簽章，避免波及既有呼叫端與測試。

### 4.2 `src/client/admin/PendingTrades.tsx` — 第三個換入區 + 送出合併

1. **`Opt` / `toOpt` 加選填 `hint`**：下拉選項目前固定顯示 `{label}（餘 {max}）`。
   加一個選填 `hint` 欄位（預設為 `餘 ${max}`，**完全保留給出/缺卡的現有顯示**），
   讓已持有卡改顯示 `持有 N`。`LineEditor` 改用 `{label}（{hint}）` 渲染。

2. **新增 `recvOwnedOpts`**：
   ```ts
   const RECEIVE_QTY_CAP = 99; // 已持有換入的合理 qty 上限（number input 夾值用）
   recvOwnedOpts = ownedReceivable(m).map((t) =>
     toOpt(m, t, RECEIVE_QTY_CAP, `持有 ${t.spare}`));
   ```

3. **`ReservationForm` 新增第三區**：
   - 新增 `receivesOwned` state（`LineDraft[]`）。
   - 新增第三個 `<LineEditor title="換入(我已有的卡)" opts={recvOwnedOpts} .../>`。
   - 現有換入區標題由「換入」改為 **「換入(缺卡)」** 以區隔兩區。

4. **`submit` 合併**：
   ```ts
   receive: [
     ...toInputs(receives, recvOpts),
     ...toInputs(receivesOwned, recvOwnedOpts),
   ],
   ```
   送出後一併清空 `receivesOwned`。給出為空的既有驗證不變。

### 4.3 後端 / 公開頁 — 不動

- `src/worker/*`、`src/shared/types.ts`、`src/client/api.ts`：零改動。
- `src/client/views/Trade.tsx`、`PublicViewer.tsx`：零改動（暫定列表的 `PendingCard`/`pendingRows`
  已渲染所有換入行，已持有的換入會自動出現於「換入」欄）。

## 5. 資料流

```
後台表單：給出(surplus) + 換入缺卡(needs) + 換入已持有(ownedReceivable)
   → submit 合併 receive → POST /api/admin/pending-trades（後端不變）
   → trade_reservation_lines（direction='receive' 行可含已持有卡種）
   → 完成時 completeReservation 照常 insert owned/trade_in（既有路徑）
```

## 6. 測試

- **`test/client/collection.test.ts`（純函式）**：
  - `ownedReceivable` 回傳所有持有 ≥ 1 的座標，`spare` = 持有數。
  - 排除持有 = 0（與 `needs` 互斥）與不存在的格子（null cell）。
- **`test/client/admin.test.tsx`（表單）**：
  - 渲染出「換入(我已有的卡)」區（沿用既有 PendingTrades 測試的 mock 資料風格）。
  - 在該區選一張已持有卡並送出 → `postReservation` 收到的 `receive` 含該卡種的一行。
- **建置 / 既有測試**：`npm test` 全綠（基準 101 筆），`npm run build` 可編譯。
- **後端**：無新行為，不新增 worker 測試（換入已持有卡已由 `pending-complete.test.ts:109` 覆蓋）。

## 7. 邊界情況

| 情況 | 行為 |
| --- | --- |
| 持有 ≥ 2 的卡 | 同時出現在「給出」(surplus) 與「換入已持有」清單；刻意、無害（後端處理給出+換入同卡種，有測試） |
| 已持有換入的顯示數 | 顯示扣除 pending 給出後的持有數（matrix 已含扣減，與後台其餘一致） |
| 持有清單為空 | 「換入(我已有的卡)」新增鈕自動停用（沿用 `LineEditor` 的 `opts.length === 0`） |
| 換入仍可為空 | 允許（既有行為：只有給出也能成立一筆預約） |

## 8. 變更檔案清單

| 檔案 | 動作 |
| --- | --- |
| `src/client/collection.ts` | 新增 `ownedReceivable` 純函式 |
| `src/client/admin/PendingTrades.tsx` | `Opt`/`toOpt` 加 `hint`、新增換入已持有區、送出合併、現有換入區標題改「換入(缺卡)」 |
| `test/client/collection.test.ts` | 新增 `ownedReceivable` 測試 |
| `test/client/admin.test.tsx` | 新增「換入(我已有的卡)」區渲染 + 送出測試 |

## 9. 風險

低。純前端疊加，不碰後端與既有資料路徑；改動集中在一個後台表單與一個純函式，
既有 101 筆測試 + 新增測試可攔回歸。最大注意點是 `toOpt`/`LineEditor` 的 `hint`
改動需保持給出/缺卡顯示不變（以預設值保證向後相容）。
