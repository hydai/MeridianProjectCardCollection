# 設計：收集格表依「彈」分群的系列篩選

- 日期：2026-06-27
- 狀態：待使用者審查
- 相關：`src/client/views/Grid.tsx`（filter UI／狀態／渲染）、`src/client/collection.ts`（新增 `buildVolumeRows` 純函式）、`seed/catalog-def.ts`（新增 `VOLUMES` 對應）、`test/client/views.test.tsx`（元件測試）、`.claude/skills/manage-card-catalog/SKILL.md`（流程文件）

## 1. 背景 / 問題

公開站「收集格表」分頁（`Grid.tsx`，僅在 `PublicViewer.tsx:51` 使用）目前把 `m.series` 的**所有系列**平鋪成欄位群組。系列會越收越多，整張表會越來越寬、越難聚焦。

使用者希望在格表上方「打勾／數量」切換的下面，新增一排**依「彈（Vol）」分群的系列篩選按鈕**，用來控制下方要顯示哪些系列欄位：

- 第一行 `Vol.1`：`New Year`、`Bunny Girl`、`Killer` 三顆按鈕
- 第二行 `Vol.2`：`MP 4TH`
- 未來第三彈 → 追加第三行 `Vol.3`，以此類推

## 2. 目標 / 非目標

### 目標
- 格表上方新增 filter 區，**依彈分列**、每個系列一顆**可獨立開關**的按鈕。
- **多選切換、預設全開**：每顆按鈕各自 on/off，初始全部顯示。
- 進度（表頭 `28/40 · 70%`）**只計算目前顯示中的系列**。
- 選取狀態以 **localStorage 記住**，跨重整／重新進站維持（每瀏覽器獨立）。

### 非目標（YAGNI）
- **不動 DB / API / worker**：不加 `volume` 欄、不寫 migration；volume 純為前端顯示概念。
- 不在其他分頁（角色／系列／稀有度／速覽／交換…）加同款 filter——本次只做格表。
- 不做「全選／重設」主控按鈕、不做每彈「全開/全關」快捷（保留日後再加的空間）。
- 不改格表既有的打勾／數量切換、圖例、cell 配色。

## 3. 現況分析

| 項目 | 位置 | 狀態 |
| --- | --- | --- |
| 系列欄位來源 | `m.series`（D1 catalog → overview API） | 不變；filter 只挑顯示子集 |
| 彈 → 系列對應 | 不存在（`catalog-def.ts` 是平的 `SERIES_CHARACTERS`） | **新增** `VOLUMES` 常數 |
| 進度計算 | `Grid.tsx:16-25` 雙重迴圈累加全部系列 | 改走「顯示中的系列」子集 |
| 表頭／表身 | `Grid.tsx:60-124` `m.series.map(...)` | 改走「顯示中的系列」（保留原 `si`） |
| 模式切換 | `Grid.tsx:11` `useState<"check"｜"count">` | 不變；filter 為獨立狀態 |
| 資料結構 | `Matrix{ series, characters, cards }`（`cards[si][ci]`） | 不變；以原 `si` 索引 |
| 樣式 | `.grid-header` / `.mode-toggle` / `.mode-btn`（`index.css`） | 新增 `.grid-filter` 族，沿用 `.mode-btn` 扁平按鈕風 |

## 4. 設計

### 4.1 彈定義（`seed/catalog-def.ts`）

```ts
// 彈（Vol）→ 系列。純前端顯示用；有序，陣列順序＝filter 列由上到下的順序。
export const VOLUMES: { label: string; series: string[] }[] = [
  { label: "Vol.1", series: ["NEW YEAR", "BUNNY GIRL", "KILLER"] },
  { label: "Vol.2", series: ["MP 4TH"] },
  // 第三彈 → 在此 append 一個物件
];
```

系列名沿用 `SERIES_CHARACTERS` 既有的大寫字串，與格表表頭一致。

### 4.2 Filter 列組裝（`src/client/collection.ts`，純函式）

```ts
export interface VolumeRow { label: string; series: string[]; }
export function buildVolumeRows(allSeries: string[]): VolumeRow[]
```

對齊「定義（`VOLUMES`）」與「實際資料（`allSeries = m.series`）」，雙向防呆：

1. 依 `VOLUMES` 順序，每彈**只保留 `allSeries` 內實際存在的系列**（定義了但 D1 還沒有 → 不出按鈕，避免指向空欄）。
2. 丟掉變空的彈。
3. `allSeries` 中**未被任何彈涵蓋的系列** → 收進結尾自動產生的 `{ label: "其他", series: [...] }` 列（避免新系列忘了分彈時在格表中消失）。

此函式不依賴 React，可單獨單元測試。

### 4.3 元件狀態與渲染（`src/client/views/Grid.tsx`）

```
mode: "check" | "count"            // 不變
hidden: Set<string>                // 被「關掉」的系列名；lazy init 自 localStorage
```

- **刻意存「hidden（關掉的）」而非「shown（開著的）」**：未來新增系列不在舊紀錄裡，自然預設可見。
- 衍生 `shown = m.series.map((s, si) => ({ s, si })).filter(({ s }) => !hidden.has(s))`——**保留原始 `si`**，後續一律用 `si` 索引 `m.cards[si][ci]`。
- 進度累加、`<thead>` 系列／稀有度表頭、`<tbody>` 每列的 cell，全部改成迭代 `shown`（取代原本的 `m.series.map`）。
- `useEffect` 在 `hidden` 變動時寫回 localStorage（key：`mpc:grid:hiddenSeries`，存系列名陣列）。
- 讀取時與當前 `m.series` 取交集，忽略已不存在的舊系列名。

### 4.4 Filter UI（置於 `.grid-header` 與 `.grid-wrap` 之間）

- 容器 `.grid-filter`：每個 `VolumeRow` 一列。
- 每列：左側 `label`（如 `Vol.1`），右側該彈系列的按鈕群。
- 按鈕沿用 `.mode-btn` 扁平風格；`active`＝該系列顯示中（即 `!hidden.has(s)`）。點擊 toggle 該系列於 `hidden` 的存在與否。
- 行動裝置 `flex-wrap` 自動換行。

### 4.5 資料流

```
VOLUMES（前端常數）┐
                   ├─ buildVolumeRows(m.series) ─▶ filter 列（按鈕）
m.series（D1 資料） ┘
                                  │ 點擊
                                  ▼
        hidden:Set<string> ⇄ localStorage("mpc:grid:hiddenSeries")
                                  │
                                  ▼
   shown =（m.series 保留原 si、濾掉 hidden）─▶ 進度 + 表頭 + 表身渲染
```

## 5. 邊界情況

- **全部關掉**：允許全關；格表區改顯示一行提示「（未選擇任何系列）」，進度顯示 `0/0`。比鎖住最後一顆按鈕更直覺。
- **「其他」列**：僅當 D1 出現未分彈的系列才出現；正常情況看不到。
- **定義有、資料無**（如先寫好 Vol.3 但卡片還沒進 D1）：該系列不出按鈕、該彈若全空則整列不顯示。
- **localStorage 內含已不存在的系列名**：載入時取交集忽略，不報錯。
- **localStorage 不可用**（隱私模式／iframe）：以 try/catch 包覆，退化為「不記住」，filter 仍可當下操作。

## 6. 測試

### 6.1 單元（`buildVolumeRows`，新增測試檔或併入 `collection` 測試）
- 正常分群：`["NEW YEAR","BUNNY GIRL","KILLER","MP 4TH"]` → Vol.1（3）+ Vol.2（1），無「其他」。
- 未分彈：出現 `"FOO"` → 結尾多一列「其他」含 `FOO`。
- 定義有資料無：`allSeries` 缺 `"MP 4TH"` → Vol.2 整列消失。

### 6.2 一致性測試（守住人為流程）
- 斷言 `SERIES_CHARACTERS` 的每個系列都被某個 `VOLUMES` 項目覆蓋（且無重複分彈）。新增系列忘了分彈時，`npm test` 直接紅。

### 6.3 元件（`test/client/views.test.tsx`）
- 格表渲染出 Vol.1／Vol.2 列與各系列按鈕。
- 點掉某系列 → 該系列欄位消失、進度分母／百分比隨之改變。
- 重新掛載時讀 localStorage，維持上次的 hidden。
- 全部關掉 → 顯示「未選擇任何系列」提示。

## 7. 流程文件

更新 `.claude/skills/manage-card-catalog/SKILL.md`：新增系列時，除了 `SERIES_CHARACTERS`，**也要把該系列加進某個 `VOLUMES` 項目**（否則它會落到格表的「其他」列，且一致性測試會紅）。

## 8. 風險

低。純前端、零 migration、零 API 改動。對齊邏輯集中在可測試的純函式，Grid 既有行為（打勾／數量／配色）不動，由 client 測試完整覆蓋。
