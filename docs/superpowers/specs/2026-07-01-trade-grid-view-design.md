# 設計：交換頁「格表」檢視模式

- 日期：2026-07-01
- 狀態：待使用者審查
- 相關：
  - `src/client/views/Trade.tsx`（新增 `list`/`grid` mode 開關、`TradeGrid` 元件、依模式切換版面；**保留**現有 `groupedList`/`panelBody`）
  - `src/client/views/shared.tsx`（重用 `MODE_TOGGLE`/`MODE_BTN`/`Panel`/`CARD_FRAME`；格子數字沿用 `NumCell` 的視覺語言）
  - `src/client/views/Grid.tsx`（**不改**，僅作為格表 chrome 的視覺參考）
  - `src/client/collection.ts`（**不改**，重用 `computeTradeWithPending` / `TradeItem` / `exists`）
  - `test/client/views.test.tsx`（新增格表模式測試；既有交換測試保持綠燈）

## 1. 背景 / 問題

交換分頁（`Trade.tsx`）的 **可換出**（`surplus`，重複卡，`spare = 擁有數 − 1`）與 **想換入**（`needs`，未擁有的卡）目前以 `groupedList()` 渲染成「分組文字清單」：先依稀有度分群（UR→R），再依系列分列，最後把角色名平鋪成文字（可換出附 `×spare`）。資訊完整，但要「掃」而非「讀」，難以一眼看出「哪個角色、哪個系列、哪個稀有度」有多／缺。

使用者希望**新增**一個「格表」檢視：以角色 × 系列稀有度的二維矩陣呈現，格子裡是數字，像 `收集格表`（`Grid.tsx`）那樣一眼讀懂。

**關鍵：不是取代**。使用者要一顆開關，可在原本的「清單」與新的「格表」之間切換；預設保留清單。

## 2. 目標 / 非目標

### 目標

- 新增 **「清單 / 格表」檢視模式開關**（沿用 `MODE_TOGGLE`/`MODE_BTN` 藥丸型開關，與 `Grid`「打勾/數量」、`Glance`「願望/收集」同一慣用法）。
  - **一顆開關同時控制兩個面板**（可換出＋想換入一起切）。
  - **預設 = 清單**（保留現況第一眼體驗）。
  - **不做 localStorage 持久化**（與 `Grid`/`Glance` 的 mode 慣例一致，每次進頁面回到預設）。
- **清單模式（預設）**：維持現況 —— `PANEL_GRID` 左右雙欄 + `groupedList` 分組清單，**渲染邏輯完全不動**。
- **格表模式**：兩張明細格表**上下堆疊**、各自包在 `CARD_FRAME` 內可左右捲動。
  - 列 = 角色、欄 = 系列 × 稀有度（同 `收集格表` 結構）。
  - **可換出格** = 可換出張數（`spare`）；沿用 `收集格表` 數量模式的金色 `HAVE_TINT` 底。
  - **想換入格** = 固定「1」；與可換出**共用同一個金底**（缺卡固定只缺 1，數字無變化；兩表底色一致，符合使用者「裡面是數字」與「底色統一」的要求）。
  - **有此卡但無資料**的格 = 灰色 `·`（同 `NumCell` 的 0 呈現）。
  - **該系列無此角色** = 斜線底 N/A 格（同 `Grid.tsx`）。
  - **只顯示「有東西」的角色列與系列欄**（各表各自計算）——這是明細格表避免「太寬、太空」的關鍵，也是與 `收集格表`（顯示全部角色）刻意不同之處。
- **稀有度總覽卡續當篩選**（全部/R/SR/SSR/UR）：格表模式下 = 控制顯示哪幾個稀有度欄（選單一稀有度→每系列僅 1 欄；選「全部」→每系列 4 欄）。篩選 state 跨模式共用。
- 保留 **複製可換出/想換入清單** 按鈕、**UR 警告**、**暫定交換列表**，兩種模式皆吃。

### 非目標（YAGNI）

- **不改** 後端 / API / worker / DB / migration / 資料模型。
- **不改** `collection.ts`：格表由既有推導資料（`computeTradeWithPending` → `TradeItem[]`）直接渲染。
- **不改** `Grid.tsx`（收集格表）；格表 chrome 的 class 常數在 `Trade.tsx` 內自訂，保持隔離、零連動風險。
- 清單模式行為與樣式**完全不變**。
- 不加「系列篩選鈕」（非空欄裁剪已解決寬度問題）。
- 不做 localStorage 持久化、不做清單/格表以外的第三種檢視。
- 兩張格表各自裁剪列/欄，**不強制對齊**彼此的欄位（跨表對照為 nice-to-have，暫不做）。

## 3. 現況分析

| 項目 | 位置 | 狀態 |
| --- | --- | --- |
| 交換推導資料 | `collection.ts` `computeTradeWithPending` → `{ surplus, needs }`（`TradeItem[]`） | 不變；格表直接消費 |
| `TradeItem` 結構 | `collection.ts` `{ ri, si, ci, spare }` | 不變 |
| 稀有度篩選 | `Trade.tsx` `filter` state + `filterItems` / 頂部 `summaryCards` `ToggleGroup` | 續用；清單模式吃 `filterItems`，格表模式吃「顯示哪幾欄」 |
| 清單渲染 | `Trade.tsx` `groupedList` / `panelBody` | **保留**（清單模式用） |
| 面板外殼 | `shared.tsx` `Panel`（標題＋sub＋children）、`PANEL_GRID`（雙欄） | 續用；`PANEL_GRID` 僅清單模式用 |
| 複製按鈕 | `Trade.tsx` `CopyButton` + `formatTradeList` | 不變，兩模式共用 |
| 格子數字語言 | `shared.tsx` `NumCell`（稀有度色數字 / 灰 `·`） | 作為格表格子的視覺依據 |
| 表格 chrome | `Grid.tsx` sticky 首欄、系列×稀有度雙層表頭、`BORDER_STRONG_*`、`GRID_CELL_BASE`、`HAVE_TINT`、斜線底 N/A | 作為 `TradeGrid` 的視覺參考；常數在 `Trade.tsx` 自訂副本 |
| 模式開關慣用法 | `shared.tsx` `MODE_TOGGLE`/`MODE_BTN`；`Grid`/`Glance` 用法 | 續用，新增「清單/格表」 |

## 4. 設計

### 4.1 模式 state 與開關（`Trade.tsx`）

```tsx
type TradeMode = "list" | "grid";
// ...在 Trade 元件內：
const [mode, setMode] = useState<TradeMode>("list");
```

在頂部稀有度總覽卡（`summaryCards` 的 `ToggleGroup`）之後、面板容器之前，加一列模式開關（左對齊，比照 `Grid`/`Glance` 的 `VIEW_HEADER` 擺法）：

```tsx
<div className="mb-[18px] flex items-center gap-3 px-1">
  <span className="font-mono text-[11px] tracking-[0.08em] text-[var(--text-tertiary)]">
    檢視
  </span>
  <ToggleGroup
    type="single"
    aria-label="交換檢視模式"
    value={mode}
    onValueChange={(v) => v && setMode(v as TradeMode)}
    className={MODE_TOGGLE}
  >
    <ToggleGroupItem value="list" className={MODE_BTN}>清單</ToggleGroupItem>
    <ToggleGroupItem value="grid" className={MODE_BTN}>格表</ToggleGroupItem>
  </ToggleGroup>
</div>
```

### 4.2 依模式切換版面（`Trade.tsx`）

面板容器改為條件渲染。**清單模式維持現況**（雙欄 + `panelBody`）；**格表模式**改為上下堆疊、面板 body 換成 `TradeGrid`：

```tsx
{mode === "list" ? (
  <div className={PANEL_GRID}>
    <Panel title={<可換出標題+CopyButton/>} sub={surplusSub}>
      {panelBody(fSurplus, "surplus")}
    </Panel>
    <Panel title={<想換入標題+CopyButton/>} sub={needsSub}>
      {panelBody(fNeeds, "needs")}
    </Panel>
  </div>
) : (
  <div className="flex flex-col gap-5">
    <Panel title={<可換出標題+CopyButton/>} sub={surplusSub}>
      <TradeGrid m={m} items={surplus} kind="surplus" shownRi={shownRi} />
    </Panel>
    <Panel title={<想換入標題+CopyButton/>} sub={needsSub}>
      <TradeGrid m={m} items={needs} kind="needs" shownRi={shownRi} />
    </Panel>
  </div>
)}
```

其中稀有度篩選轉成「要顯示哪幾欄」：

```tsx
const shownRi = filter === "all" ? [0, 1, 2, 3] : [RARITY_KEYS.indexOf(filter)];
```

> 標題與 `CopyButton`、`surplusSub`/`needsSub` 兩模式共用；為避免重複，可把標題節點抽成區域變數（`surplusTitle` / `needsTitle`）在兩分支引用。

### 4.3 `TradeGrid` 區域元件（`Trade.tsx`）

surplus / needs 共用一個參數化元件；差異只在「格子數值」與「填色」。

```tsx
function TradeGrid({
  m,
  items,
  kind,
  shownRi,
}: {
  m: Matrix;
  items: TradeItem[];        // 完整 surplus 或 needs（未經 rarity 篩選）
  kind: "surplus" | "needs";
  shownRi: number[];         // 目前要顯示的稀有度欄（依頂部篩選）
}) {
  // 1) 值查表：surplus→spare、needs→1；僅收錄 shownRi
  const val = new Map<string, number>();
  for (const it of items) {
    if (!shownRi.includes(it.ri)) continue;
    val.set(`${it.si}|${it.ci}|${it.ri}`, kind === "surplus" ? it.spare : 1);
  }

  // 2) 只留「有東西」的系列欄
  const shownSi = m.series
    .map((_s, si) => si)
    .filter((si) =>
      m.characters.some((_c, ci) =>
        shownRi.some((ri) => val.has(`${si}|${ci}|${ri}`)),
      ),
    );

  // 3) 只留「有東西」的角色列
  const shownCi = m.characters
    .map((_c, ci) => ci)
    .filter((ci) =>
      shownSi.some((si) => shownRi.some((ri) => val.has(`${si}|${ci}|${ri}`))),
    );

  // 4) 空狀態
  if (shownSi.length === 0 || shownCi.length === 0) {
    return (
      <div className={EMPTY_MSG}>
        {kind === "surplus" ? "目前沒有多餘的卡可換出。" : "已全部收集 ✓"}
      </div>
    );
  }

  // 5) 渲染表格（結構同 Grid.tsx：sticky 首欄 + 系列×稀有度雙層表頭）
  return (
    <div className={`overflow-x-auto ${CARD_FRAME}`}>
      <table className="w-full border-collapse text-xs">
        <thead>
          {/* 第一列：角色（sticky, rowSpan=2）＋每個 shownSi 一格系列名（colSpan=shownRi.length） */}
          {/* 第二列：每個 shownSi、每個 shownRi 一格稀有度標頭（稀有度色） */}
        </thead>
        <tbody>
          {shownCi.map((ci) => (
            <tr key={m.characters[ci]}>
              {/* sticky 角色名格 */}
              {shownSi.map((si) =>
                shownRi.map((ri) => {
                  if (!exists(m, si, ci)) return /* 斜線底 N/A 格 */;
                  const v = val.get(`${si}|${ci}|${ri}`);
                  if (v == null) return /* 灰色 · 格 */;
                  return /* 金底數字格；可換出與想換入共用同一個金底 */;
                }),
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

格表 chrome 的 class 常數（`GRID_CELL_BASE`、`BORDER_STRONG_*`、`HAVE_TINT`、斜線底 N/A、sticky 首欄）在 `Trade.tsx` 內建立自訂副本，比照 `Grid.tsx` 的值（**不 import `Grid.tsx`、不動它**）。

### 4.4 格子視覺規則

| 情況 | 判斷 | 呈現 |
| --- | --- | --- |
| 可換出 有值 | `kind==="surplus"` 且 `val` 有 | 金色 `HAVE_TINT` 底 + 金色數字（同收集格表數量模式） |
| 想換入 有值 | `kind==="needs"` 且 `val` 有 | 金色 `HAVE_TINT` 底 + 金色「1」（與可換出一致） |
| 有此卡但無值 | `exists` 且 `val` 無 | 透明底 + 灰色 `·`（同 `NumCell` 的 0） |
| 系列無此角色 | `!exists(m, si, ci)` | 斜線底 N/A（同 `Grid.tsx`） |
| 稀有度標頭 | 表頭第二列 | `RARITY_TEXT[ri]` 稀有度色（同 `Grid.tsx`） |

> 顏色/填色為視覺細節，實作後可在畫面上微調（例如是否讓可換出數字也依稀有度上色）。以上為定稿起點。

### 4.5 資料流

```
computeTradeWithPending(m, pending) → { surplus, needs }（TradeItem[]，不變）
        │
        ├── 清單模式：filterItems → fSurplus/fNeeds → groupedList（現況，不動）
        │
        └── 格表模式：TradeGrid(items=surplus|needs, shownRi=依 filter)
                 │ 建 val 查表（surplus→spare / needs→1，僅 shownRi）
                 │ 算 shownSi（非空系列欄）、shownCi（非空角色列）
                 ▼
             <table> 角色 × 系列稀有度，格子放數字
```

## 5. 邊界情況

- **格表模式但完全無 surplus/needs**：`shownSi`/`shownCi` 為空 → 顯示空狀態訊息（同清單模式語氣）。
- **篩選到某稀有度後為空**：`shownRi` 僅該稀有度、`val` 無任何項 → 空狀態。
- **某系列/角色在此稀有度下全空**：不顯示該欄/列（裁剪邏輯）。
- **該系列無此角色**：斜線底 N/A，不誤顯示為 0 或空值。
- **想換入數值**：恆為 `1`（缺卡固定缺 1）。**可換出 `spare`**：恆 ≥ 1（`n ≥ 2` 才入列），不會出現 0。
- **寬表**：`overflow-x-auto` 左右捲動；sticky 首欄固定角色名（同 `收集格表`）。
- **切換模式**：`filter` state 保留，切回來篩選不重置；`mode` 不持久化，重新整理回「清單」。
- **暫定交換列表**：`computeTradeWithPending` 已把 pending 的 receive 從 needs 扣除，故格表模式的想換入自然反映扣抵結果（與清單一致）。

## 6. 測試（`test/client/views.test.tsx`）

- **預設在清單模式**：`render(<Trade m=.../>)` 後可見既有清單特徵、且無格表 `<table>`。
- **切到格表模式**：點「格表」後出現兩張 `<table>`；可換出格顯示正確 `spare` 數字、想換入格顯示 `1`。
- **N/A 格**：某角色不在某系列時，對應格為斜線底 N/A（非 0）。
- **裁剪**：無 surplus/needs 的系列欄與角色列不出現。
- **空狀態**：無多餘卡 / 已收齊時顯示空狀態訊息。
- **篩選連動**：選某稀有度後，格表每系列只剩該稀有度欄。
- **開關 a11y**：`ToggleGroup` 有可存取名稱、兩個選項可切換。
- **回歸**：既有「複製按鈕 / 篩選 scope 複製 / 暫定交換列表」測試保持綠燈（功能未動）。

## 7. 風險

低。純前端、零 migration、零 API 改動、**零新相依**（`shadcn`/`lucide`/`Tailwind` 皆已在 base）。清單模式渲染邏輯零改動、`Grid.tsx` 不動，變更集中於 `Trade.tsx` 新增（mode state、開關、`TradeGrid`、條件版面）。唯一新複雜度是 `TradeGrid` 的欄/列裁剪與格子分類邏輯，由元件測試覆蓋。
