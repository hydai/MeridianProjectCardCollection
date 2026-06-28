# 設計：收集格表依「稀有度」過濾

- 日期：2026-06-28
- 狀態：待使用者審查
- 相關：`src/client/views/Grid.tsx`（filter UI／狀態／渲染）、`src/client/collection.ts`（沿用既有 `RARITIES`／`RARITY_KEYS`，無需新增）、`test/client/views.test.tsx`（元件測試）

## 1. 背景 / 問題

公開站「收集格表」分頁（`Grid.tsx`，僅在 `PublicViewer.tsx` 使用）已有一排**依「彈（Vol）」分群的系列篩選按鈕**（見 `2026-06-27-grid-volume-filter-design.md`），可開關下方要顯示哪些**系列欄位群**。

使用者希望**再加一排按鈕式篩選**，依**稀有度**（`R`／`SR`／`SSR`／`UR`）控制要顯示哪些稀有度欄位。

差異重點：系列是格表的**外層欄位群**（每系列 `colSpan={4}`），稀有度則是每個系列群內的**內層欄位**。因此稀有度篩選會**橫切所有系列群**，需要動到系列篩選沒碰到的三個渲染點（colSpan、群組左邊界、進度計算）。

## 2. 目標 / 非目標

### 目標
- 在既有 `.grid-filter` 區**最上方**新增一列**稀有度篩選**，標籤 `稀有度`，四顆可獨立開關的按鈕 `R`／`SR`／`SSR`／`UR`。
- **多選切換、預設全開**：每顆按鈕各自 on/off，初始全部顯示。
- 進度（表頭 `28/40 · 70%`）**只計算目前顯示中的（系列 × 稀有度）格**。
- 選取狀態以 **localStorage 記住**（key：`mpc:grid:hiddenRarities`），跨重整／重新進站維持（每瀏覽器獨立）。
- 與既有系列篩選**互相獨立、同時生效**（AND）：關掉 `UR` 又關掉 `KILLER`，兩者效果疊加。

### 非目標（YAGNI）
- **不動 DB / API / worker**：稀有度本就是欄位維度，純前端挑顯示子集。
- 不在其他分頁（角色／系列／稀有度統計／速覽／交換…）加同款 filter——本次只做格表。
- 不做「全選／重設」主控按鈕。
- 不替稀有度按鈕加上稀有度配色（沿用系列按鈕的扁平 `.mode-btn` 風格，保持一致）。
- 不改格表既有的打勾／數量切換、圖例、cell 配色。

## 3. 現況分析

| 項目 | 位置 | 狀態 |
| --- | --- | --- |
| 稀有度定義 | `collection.ts:8-9` `RARITIES` / `RARITY_KEYS` | 不變；filter 只挑顯示子集 |
| 進度計算 | `Grid.tsx:60-68` 內層 `RARITIES.forEach` 累加全部稀有度 | 改走「顯示中的稀有度」子集 |
| 系列表頭 colSpan | `Grid.tsx:132` 寫死 `colSpan={4}` | 改為 `shownRarities.length` |
| 稀有度表頭列 | `Grid.tsx:140-151` `RARITIES.map(...)`，`ri === 0` 給 `grid-series-start` | 改走 `shownRarities`，左邊界改鎖「第一個顯示中的稀有度」 |
| 表身 cell | `Grid.tsx:158-192` 內層 `RARITIES.map(...)`，`ri === 0` 給 `grid-series-start` | 同上；cell 仍以原始 `ri` 取 `getN` / `RARITY_KEYS[ri]` |
| 系列篩選狀態 | `Grid.tsx:35` `hidden: Set<string>` + localStorage | 不變；稀有度為**獨立**狀態 |
| 樣式 | `.grid-filter` / `.grid-filter-row` / `.grid-filter-label` / `.grid-filter-btns` / `.mode-btn` | **沿用，零新 CSS** |

## 4. 設計

### 4.1 元件狀態（`src/client/views/Grid.tsx`）

新增與既有 `hidden`（系列）對稱的稀有度狀態：

```
hiddenR: Set<string>   // 被「關掉」的稀有度標籤（如 "UR"）；lazy init 自 localStorage
```

- localStorage key：`mpc:grid:hiddenRarities`，存稀有度標籤字串陣列。
- 載入時與 `RARITIES` 取交集，忽略未知值（防呆）。
- `useEffect` 在 `hiddenR` 變動時寫回 localStorage（與既有 `hidden` 的 `useEffect` 對稱）。
- `toggleRarity(rarity)` 鏡像既有 `toggle(s)`。
- **刻意存「hidden（關掉的）」而非「shown」**：與系列篩選保持一致的程式形狀，且天然「預設全開」。（稀有度集合固定為 4 個、不會長大，故「防未來新增」的理由較弱，但對稱性讓兩段邏輯統一、易讀。）
- 讀寫 localStorage 以 try/catch 包覆（沿用既有 `loadHidden`／`saveHidden` 模式），隱私模式／iframe 退化為「不記住」。

### 4.2 衍生的「顯示中稀有度」

```ts
const shownRarities = RARITIES
  .map((rarity, ri) => ({ rarity, ri }))   // 保留「原始 ri」——後續一律用 ri 取 getN(m,si,ci,ri) 與 RARITY_KEYS[ri]
  .filter(({ rarity }) => !hiddenR.has(rarity));
```

### 4.3 三個渲染觸點（稀有度橫切所有系列群）

1. **進度累加**（`Grid.tsx:60-68`）：內層 `RARITIES.forEach((_r, ri) => {...})` 改為迭代 `shownRarities`，分母只計顯示中的稀有度格。
2. **系列表頭 colSpan**（`Grid.tsx:132`）：`colSpan={4}` → `colSpan={shownRarities.length}`。
3. **`grid-series-start` 左邊界**（`Grid.tsx:144`、`Grid.tsx:160`）：原本鎖 `ri === 0`。改為迭代 `shownRarities.map(({ rarity, ri }, localRi) => ...)`，把左邊界鎖在 `localRi === 0`（**第一個顯示中的稀有度**）——即使 `R` 被關掉，群組左邊界仍正確落在第一欄。cell 內部仍用原始 `ri` 取值與配色 class。

> 表頭第二列與表身 cell 兩處都從 `RARITIES.map` 改為 `shownRarities.map`，並把 `ri === 0` 的判斷換成 `localRi === 0`。

### 4.4 Filter UI（置於既有 `.grid-filter` 最上方）

在 `volumeRows.map(...)` **之前**插入一列：

```tsx
<div className="grid-filter">
  <div className="grid-filter-row">
    <span className="grid-filter-label">稀有度</span>
    <div className="grid-filter-btns">
      {RARITIES.map((rarity) => (
        <button
          type="button"
          key={rarity}
          className={`mode-btn ${!hiddenR.has(rarity) ? "active" : ""}`}
          aria-pressed={!hiddenR.has(rarity)}
          onClick={() => toggleRarity(rarity)}
        >
          {rarity}
        </button>
      ))}
    </div>
  </div>
  {/* 既有：依彈分群的系列按鈕列 */}
  {volumeRows.map((row) => ( ... ))}
</div>
```

沿用 `.mode-btn` 扁平風格；`active` ＝ 該稀有度顯示中（即 `!hiddenR.has(rarity)`）。零新 CSS。

### 4.5 空狀態

擴充既有 `shown.length === 0` 的守門：

```tsx
{shown.length === 0 || shownRarities.length === 0 ? (
  <div className="grid-empty">
    {shown.length === 0 ? "（未選擇任何系列）" : "（未選擇任何稀有度）"}
  </div>
) : ( ...table... )}
```

- 系列全關 → `（未選擇任何系列）`（不變）。
- 稀有度全關（系列尚有）→ `（未選擇任何稀有度）`。
- 兩者皆全關 → 以系列訊息優先。
- 進度自然顯示 `0/0`：任一維度為空時，累加迴圈產出 0 格。

### 4.6 資料流

```
RARITIES（前端常數，固定 4 個）
        │ 點擊
        ▼
hiddenR:Set<string> ⇄ localStorage("mpc:grid:hiddenRarities")
        │
        ▼
shownRarities =（RARITIES 保留原 ri、濾掉 hiddenR）
        │
        ├─▶ 進度分母（× shown 系列）
        ├─▶ 系列表頭 colSpan
        ├─▶ 稀有度表頭列（localRi===0 給左邊界）
        └─▶ 表身每列 cell（localRi===0 給左邊界；原 ri 取值／配色）
```

## 5. 邊界情況

- **全部稀有度關掉**：允許全關；格表區改顯示 `（未選擇任何稀有度）`，進度 `0/0`。比鎖住最後一顆按鈕更直覺（與系列篩選一致）。
- **`R` 被關、其餘開著**：群組左邊界 `grid-series-start` 改落在第一個顯示中的稀有度（如 `SR`），不會出現缺左框。
- **系列與稀有度同時各關一些**：兩個 `Set` 獨立過濾，效果疊加（AND）。
- **localStorage 內含未知稀有度字串**：載入時與 `RARITIES` 取交集忽略，不報錯。
- **localStorage 不可用**（隱私模式／iframe）：try/catch 退化為「不記住」，filter 仍可當下操作。
- **預設全開**：`hiddenR` 為空 → `shownRarities.length === 4`、`colSpan === 4`，與現行行為完全一致（保護既有測試）。

## 6. 測試（`test/client/views.test.tsx`）

- **渲染**：格表出現「稀有度」列與 `R`／`SR`／`SSR`／`UR` 四顆按鈕（`aria-pressed` 預設皆 true）。
- **關掉一個稀有度**（如 `UR`）：每個系列群少一欄、系列表頭 `colSpan` 由 4 變 3、進度分母／百分比隨之改變。
- **關掉 `R`**：群組左邊界落在第一個顯示中的稀有度（驗證 `grid-series-start` 不缺）。
- **持久化**：toggle 後重新掛載，從 localStorage 還原上次的 hiddenR。
- **全關**：四顆全關 → 顯示 `（未選擇任何稀有度）`、進度 `0/0`。
- **與系列獨立**：同時關一個系列與一個稀有度，兩者效果疊加。
- **回歸**：預設全開時，既有系列篩選測試與格表行為不受影響。

## 7. 風險

低。純前端、零 migration、零 API 改動。稀有度集合固定為 4，無需 `buildVolumeRows` 那種動態對齊。預設全開時 `colSpan` 仍為 4，既有行為與測試不變；新行為由 client 測試覆蓋。
