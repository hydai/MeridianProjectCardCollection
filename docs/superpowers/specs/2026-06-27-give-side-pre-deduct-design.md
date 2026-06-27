# 設計：給出側全面預扣（Give-side Pre-deduction）

- 日期：2026-06-27
- 狀態：待使用者審查
- 相關：`docs/superpowers/specs/2026-06-27-pending-trade-design.md`（暫定交換原始設計）。本設計**部分修訂**其 §2「pending 期間不得變動顯示數量」的決定：改為「給出側預約即時從顯示張數扣除」。

## 1. 背景 / 問題

暫定交換採「輕量疊加層」：建立 pending 預約**不動 `cards` 表**，只有交換分頁透過
`computeTradeWithPending` 把預約從「可換出 / 想換入」扣掉。結果是**不一致**：

- 交換分頁的可換出**有**反映預約（−1）。
- 收藏總覽 / 格表 / 速覽 / 頂部統計列 / 卡片管理 **沒有**——仍顯示實際持有張數。

於是一張「已經暫定答應給出」的卡，在交換分頁以外的地方數字看起來還是滿的、像是可交換，
**會誤導**（可能不小心又把它賣掉或另外掛交換）。

## 2. 目標 / 非目標

### 目標
- 把「pending **給出**行的 qty」從**所有顯示張數**的地方扣除：收藏總覽、格表、速覽、頂部統計列、以及交換分頁的可換出基準。
- 卡片管理（逐張列卡）以「重複標記用調整後數量重算 + `預約中 ×N` 徽章」對應。
- 公開頁的張數也跟著降（與已公開的「暫定交換列表」一致，不算新洩露）。
- 全程**不雙重扣**：給出側只在一處（後端 `getOverview`）處理。

### 非目標（YAGNI）
- **不**處理換入側：即將換入的卡維持原狀（在缺卡 / 總覽仍顯示未擁有），直到按「完成」才加入。
- **不**改動 `cards` 表、`completeReservation`、交易看板、認證。
- **不**動收藏完成度 / 缺卡 / Wishlist（見 §5：給出來自重複卡，扣完必 ≥1，這些本就不受影響）。

## 3. 現況與資料流（關鍵）

公開頁的所有收藏視圖都吃同一份 `matrix`，而 `matrix` 來自 `GET /api/overview`：

```
getOverview → /api/overview → buildMatrix → matrix
  ├─ 格表 (Grid) / 速覽 (Glance) / 角色·系列·稀有度表 (tables) / 頂部統計列 (StatsBar)
  └─ 交換分頁 (Trade)：computeTrade(matrix) → 可換出/想換入，再 computeTradeWithPending 疊加
```

→ **把預扣放進 `getOverview`，等於一次餵給上面全部**（含交換頁的可換出基準）。卡片管理走
另一條 `listCards` 查詢，需各別處理。

## 4. 設計

### 4.1 後端 `getOverview`：cells 扣掉給出預約（單一來源）

`cells` 的每個卡種 owned 改為「持有中張數 − 該卡種 pending 給出 qty」，clamp 在 0：

```sql
SELECT c.id AS catalogId, c.series, c.character, c.rarity,
       COUNT(k.id) AS owned,
       COALESCE(g.reserved, 0) AS reserved
FROM card_catalog c
LEFT JOIN cards k ON k.catalog_id = c.id AND k.status IN ('owned','for_sale','for_trade')
LEFT JOIN (
  SELECT catalog_id, SUM(qty) AS reserved
  FROM trade_reservation_lines
  WHERE direction = 'give'
  GROUP BY catalog_id
) g ON g.catalog_id = c.id
GROUP BY c.id
ORDER BY c.sort_order
```

JS 端：`owned: Math.max(0, owned - reserved)`（`reserved` 不進對外 DTO，只用來算 `owned`）。
`OverviewCell` 型別維持只有 `owned`。

**`progress`（收藏完成度）子查詢維持用實際持有 `COUNT`**（不扣給出）——給出來自重複卡、扣完
仍 ≥1，所以「已收集卡種數」本就不變；明確用實際持有計算可避免任何邊界誤差。

### 4.2 前端 `computeTradeWithPending` 瘦身為「只處理換入側」

給出側現在由 `getOverview` 上游處理，故 `computeTradeWithPending` **移除給出扣減**，只保留
「把換入卡種從 needs 移除」。避免在交換頁對給出側**雙重扣**。

驗證（owned 實際 3、給出預約 1）：
- `getOverview` 調整後 owned = 2 → `computeTrade` surplus spare = 2 − 1 = **1**。
- 與舊行為（實際 3：spare 2，疊加層 −1 = 1）**結果相同**。✓

後台預約表單（`PendingTrades.tsx`）的「可給出」下拉來自調整後 matrix 的 surplus → 自動排除
已預約，仍**防重複預約**；「可換入」下拉仍由換入側疊加處理。

### 4.3 卡片管理 `listCards` + `ManageCards`（list-based，特別處理）

卡片管理逐張列卡、無單一數字可遞減。對應做法：

- `listCards` 每列加一個 `reservedGive`（該卡種 pending 給出 qty，來自同一個 give 聚合子查詢）。
- 「重複」標記改用**調整後數量**：`duplicate = (activeCount − reservedGive) > 1`。
- `ManageCards`：對 `reservedGive > 0` 的卡列顯示 `預約中 ×N` 徽章（pending 是**卡種層級**，
  無法精準指出哪一張實體卡，徽章表達「此卡種有 N 張被暫定承諾給出」）。

`CardRow` 型別新增 `reservedGive: number`。

### 4.4 不受影響（明確列出）
- `getMissing` / 缺卡 / Wishlist：給出永不使某卡種歸零（來自重複卡）→ 不變。
- 收藏完成度（progress）：同上 → 不變。
- `getStats` / `/api/stats`：目前公開頁的稀有度·角色表與頂部統計列**都吃 matrix**（非此端點），
  故自動反映；`getStats` 查詢本身不在本次範圍（若實作時發現有別的消費者再評估）。
- `completeReservation`、交易看板、認證：不動。

## 5. 邊界情況

| 情況 | 行為 |
| --- | --- |
| 給出來自重複卡（owned ≥ 2，最多預約 owned−1） | 調整後 owned ≥ 1，**永不歸零**、不變缺卡、不降完成度 |
| 經 API 異常塞入 give qty > 持有 | `Math.max(0, …)` clamp → owned 不為負（防禦性；UI/驗證本就擋住） |
| 交換頁可換出 | owned 已在 `getOverview` 扣過 → surplus 反映一次；疊加層只處理換入 → **不雙重扣** |
| 換入側 | 維持原狀（總覽/缺卡仍顯示未擁有），直到「完成」才加入持有 |
| 公開頁 | 張數跟著降（與公開的暫定交換列表一致） |

## 6. 變更檔案清單

| 檔案 | 動作 |
| --- | --- |
| `src/worker/db/queries.ts` | `getOverview` cells 扣給出（progress 不變）；`listCards` 加 `reservedGive` + 調整 `duplicate` |
| `src/shared/types.ts` | `CardRow` 新增 `reservedGive: number` |
| `src/client/collection.ts` | `computeTradeWithPending` 移除給出扣減，只留換入移除 |
| `src/client/admin/ManageCards.tsx` | `reservedGive > 0` 顯示 `預約中 ×N` 徽章 |
| `src/client/admin/admin.css` | `預約中` 徽章極少量樣式（可重用既有 pill） |
| `test/worker/queries-read.test.ts`（或新檔） | getOverview 給出扣減 + clamp；listCards reservedGive/duplicate |
| `test/client/collection.test.ts` | 改寫：computeTradeWithPending 不再扣給出（移到 getOverview）、仍移除換入 |
| `test/client/views.test.tsx` / `admin.test.tsx` | 視需要更新（Trade 不雙重扣；ManageCards 徽章） |

## 7. 測試

- **`getOverview`（worker）**：建立持有 + 一筆 give 預約 → 對應 cell `owned` 少 1；progress 完成度不變；缺卡不含該卡種；clamp 不為負。
- **`computeTradeWithPending`（client 純函式）**：餵 give 行**不再**改變 surplus（由 getOverview 負責）；receive 行仍從 needs 移除；空 pending = `computeTrade`。
- **交換頁不雙重扣**：給定「getOverview 已扣」的 matrix + 同一筆 pending，可換出只少 1（非 2）。
- **`listCards`**：`reservedGive` 正確；`duplicate` 用調整後數量。
- **`ManageCards`（render）**：`reservedGive > 0` 顯示 `預約中` 徽章。
- **回歸**：既有 worker + client 測試保持綠燈（缺卡/完成度/交易看板不受影響）。

## 8. 風險

中。核心風險是「雙重扣」——靠「給出只在 `getOverview` 處理、`computeTradeWithPending` 只處理換入」
這條清楚的職責切分，加上交換頁的不雙重扣測試來守住。其餘為純顯示層、由元件測試攔截。
`getOverview` 是公開 API 的對外形狀變更（張數語意從「實際持有」變為「實際持有 − 給出預約」），
但 `owned` 欄位名與型別不變，下游無需改動。
