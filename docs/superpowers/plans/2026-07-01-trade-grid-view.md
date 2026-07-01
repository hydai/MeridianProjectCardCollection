# 交換頁「格表」檢視模式 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在交換分頁加一顆「清單 / 格表」檢視開關，保留現有分組清單為預設，新增一個「角色 × 系列稀有度、格子放數字」的明細格表模式。

**Architecture:** 全部集中在 `src/client/views/Trade.tsx`：新增 `mode` state 與 `MODE_TOGGLE` 開關，把面板容器改成依 `mode` 條件渲染 —— `list` 走現有 `panelBody`（不動），`grid` 走新的 `TradeGrid` 區域元件。`TradeGrid` 消費既有的 `computeTradeWithPending` → `{ surplus, needs }`，不改資料層、不動 `Grid.tsx`/`collection.ts`。

**Tech Stack:** React 18 + TypeScript、Radix `ToggleGroup`（shadcn 包裝）、Tailwind v4（arbitrary values）、Vitest + @testing-library/react、Biome。

## Global Constraints

- 不改後端 / API / worker / DB / migration；`collection.ts` 不動（只 import）。
- 不改 `src/client/views/Grid.tsx`（收集格表）；格表 chrome 的 class 常數在 `Trade.tsx` 內建立本地副本。
- 清單模式（`list`）渲染邏輯與樣式完全不變。
- mode 開關**預設 `list`**、**不做 localStorage 持久化**（與 `Grid`/`Glance` 的 mode 慣例一致）。
- 想換入格子固定顯示 `1`；可換出格子顯示 `spare`（`擁有數 − 1`，恆 ≥ 1）。
- 只顯示「有東西」的角色列與系列欄（各表各自計算）；稀有度欄由頂部稀有度篩選（`filter`）決定。
- 提交前跑格式化：`npm run format`（Biome）；提交由 PreToolUse hook 再跑 format/lint/test。

## File Structure

- **Modify** `src/client/views/Trade.tsx`
  - 新增 `type TradeMode`、`TG_*` chrome 常數、`TradeGrid` 元件。
  - `Trade` 內新增 `mode` state、`shownRi`、`surplusTitle`/`needsTitle`、mode 開關 UI、依 `mode` 條件渲染面板容器。
  - `groupedList` / `panelBody` / `CopyButton` / `PendingCard` **維持不動**（清單模式續用）。
- **Modify** `test/client/views.test.tsx`
  - 新增 `describe("Trade view mode toggle", …)` 與 `describe("Trade grid edge cells", …)`。
- **Unchanged**：`Grid.tsx`、`collection.ts`、`shared.tsx`（僅被 import）、worker、migrations。

---

## Task 1: 檢視模式開關 + `TradeGrid`（數字格、欄列裁剪、篩選連動、空狀態）

**Files:**
- Modify: `src/client/views/Trade.tsx`
- Test: `test/client/views.test.tsx`

**Interfaces:**
- Consumes（既有，不變）：
  - `computeTradeWithPending(m, pending): { surplus: TradeItem[]; needs: TradeItem[] }`（`collection.ts`）
  - `TradeItem = { ri: number; si: number; ci: number; spare: number }`
  - `RARITIES: Rarity[]`、`RARITY_KEYS`、`RARITY_TEXT: string[]`（稀有度文字色）
  - shared：`Panel`、`PANEL_GRID`、`EMPTY_MSG`、`CARD_FRAME`、`MODE_TOGGLE`、`MODE_BTN`
  - shadcn：`ToggleGroup`、`ToggleGroupItem`
- Produces（供 Task 2 沿用）：
  - `type TradeMode = "list" | "grid"`
  - `function TradeGrid(props: { m: Matrix; items: TradeItem[]; kind: "surplus" | "needs"; shownRi: number[] }): JSX.Element`
  - DOM 測試鉤：容器 `div.trade-grid[data-kind]`、`table.trade-grid-table`、`th.trade-grid-series-head`、`th.trade-grid-rarity-head`
  - mode 開關：`radiogroup` 具可存取名稱 `"交換檢視模式"`，選項 `radio` 名稱 `"清單"` / `"格表"`

- [ ] **Step 1: 寫失敗測試（模式開關 + 格表數字 + 篩選連動）**

在 `test/client/views.test.tsx` 檔尾**新增**下列 describe（沿用檔內既有的 `render/screen/fireEvent/within`、`buildMatrix`、`OverviewResponse` import）：

```tsx
describe("Trade view mode toggle", () => {
  const card = (
    character: string,
    rarity: "R" | "SR" | "SSR" | "UR",
    owned: number,
    id: number,
  ) => ({ catalogId: id, series: "MP 4TH", character, rarity, owned });

  // Kirari: SR owned 3 (spare 2) + UR owned 2 (spare 1) → 可換出;
  // SSR owned 0 → 想換入; R owned 1 → 兩者皆非。
  const mixed: OverviewResponse = {
    cells: [
      card("Kirari", "R", 1, 1),
      card("Kirari", "SR", 3, 2),
      card("Kirari", "SSR", 0, 3),
      card("Kirari", "UR", 2, 4),
    ],
    progress: [],
  };

  const toGrid = () =>
    fireEvent.click(
      within(
        screen.getByRole("radiogroup", { name: "交換檢視模式" }),
      ).getByRole("radio", { name: "格表" }),
    );

  it("defaults to list mode with the mode switch present", () => {
    const { container } = render(<Trade m={buildMatrix(mixed)} />);
    const group = screen.getByRole("radiogroup", { name: "交換檢視模式" });
    expect(within(group).getByRole("radio", { name: "清單" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(container.querySelectorAll(".trade-grid-table")).toHaveLength(0);
  });

  it("switches to grid mode showing a surplus and a needs table", () => {
    const { container } = render(<Trade m={buildMatrix(mixed)} />);
    toGrid();
    expect(container.querySelectorAll(".trade-grid-table")).toHaveLength(2);
    const surplus = container.querySelector(
      '[data-kind="surplus"]',
    ) as HTMLElement;
    const needs = container.querySelector('[data-kind="needs"]') as HTMLElement;
    expect(within(surplus).getByText("2")).toBeInTheDocument(); // SR spare 2
    expect(within(needs).getByText("1")).toBeInTheDocument(); // SSR 缺 → 1
  });

  it("switches back to list mode, removing the grid tables", () => {
    const { container } = render(<Trade m={buildMatrix(mixed)} />);
    toGrid();
    expect(container.querySelectorAll(".trade-grid-table")).toHaveLength(2);
    fireEvent.click(
      within(
        screen.getByRole("radiogroup", { name: "交換檢視模式" }),
      ).getByRole("radio", { name: "清單" }),
    );
    expect(container.querySelectorAll(".trade-grid-table")).toHaveLength(0);
  });

  it("scopes grid columns to the selected rarity", () => {
    const { container } = render(<Trade m={buildMatrix(mixed)} />);
    toGrid();
    const surplus = () =>
      container.querySelector('[data-kind="surplus"]') as HTMLElement;
    expect(surplus().querySelectorAll(".trade-grid-rarity-head")).toHaveLength(
      4,
    );
    // 頂部稀有度總覽卡是 role="radio"，可存取名稱以稀有度開頭（含 缺/餘 計數）。
    fireEvent.click(screen.getByRole("radio", { name: /^SR / }));
    expect(surplus().querySelectorAll(".trade-grid-rarity-head")).toHaveLength(
      1,
    );
  });

  it("shows the needs empty state when nothing is missing", () => {
    // 全持有 + UR 一張重複 → 有可換出、無想換入。
    const noNeeds: OverviewResponse = {
      cells: [
        card("Kirari", "R", 1, 1),
        card("Kirari", "SR", 1, 2),
        card("Kirari", "SSR", 1, 3),
        card("Kirari", "UR", 2, 4),
      ],
      progress: [],
    };
    const { container } = render(<Trade m={buildMatrix(noNeeds)} />);
    toGrid();
    expect(container.querySelectorAll(".trade-grid-table")).toHaveLength(1); // 只有可換出
    expect(screen.getByText("已全部收集 ✓")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: 執行測試，確認失敗**

Run: `npx vitest run --config vitest.client.config.ts test/client/views.test.tsx -t "Trade view mode toggle"`
Expected: FAIL —— 找不到 `radiogroup name "交換檢視模式"`（開關尚未存在）。

- [ ] **Step 3: 加入格表 chrome 常數與 `TradeGrid` 元件**

在 `Trade.tsx` 中，`CopyButton` 元件之後、`export function Trade` 之前，插入：

```tsx
// --- Grid-mode chrome ---------------------------------------------------
// Grid.tsx 的格線/邊框 chrome 本地副本，讓收集格表（Grid.tsx）維持不動。
// 若 Grid.tsx 的格表樣式調整，這裡需一併同步。
const TG_BORDER_STRONG_B = "[border-bottom:0.5px_solid_var(--border-strong)]";
const TG_BORDER_STRONG_R = "[border-right:0.5px_solid_var(--border-strong)]";
const TG_BORDER_STRONG_L = "[border-left:0.5px_solid_var(--border-strong)]";
const TG_CELL_BASE =
  "h-8 w-8 border-b-[0.5px] border-border p-0 text-center text-xs leading-none max-sm:h-7 max-sm:w-[26px]";
// 可換出格：金色「持有」底（同 Grid.tsx 數量模式的 HAVE_TINT）。
const TG_HAVE_TINT = "bg-[rgba(201,161,74,0.16)] font-semibold text-primary";
// 想換入格：各稀有度 soft 底（同 MissChip 的 --*-soft 底色系）。
const TG_NEEDS_TINT = [
  "bg-[var(--r-soft)]",
  "bg-[var(--sr-soft)]",
  "bg-[var(--ssr-soft)]",
  "bg-[var(--ur-soft)]",
] as const;

// 角色 × 系列稀有度明細格表。surplus/needs 共用；差異在格子數值與填色。
// items 傳入完整 surplus 或 needs（未經 rarity 篩選）；shownRi 決定顯示哪些稀有度欄。
function TradeGrid({
  m,
  items,
  kind,
  shownRi,
}: {
  m: Matrix;
  items: TradeItem[];
  kind: "surplus" | "needs";
  shownRi: number[];
}) {
  // 值查表：surplus→spare、needs→1；僅收錄 shownRi。
  const val = new Map<string, number>();
  for (const it of items) {
    if (!shownRi.includes(it.ri)) continue;
    val.set(`${it.si}|${it.ci}|${it.ri}`, kind === "surplus" ? it.spare : 1);
  }

  // 只留「有東西」的系列欄與角色列。
  const shownSi = m.series
    .map((_s, si) => si)
    .filter((si) =>
      m.characters.some((_c, ci) =>
        shownRi.some((ri) => val.has(`${si}|${ci}|${ri}`)),
      ),
    );
  const shownCi = m.characters
    .map((_c, ci) => ci)
    .filter((ci) =>
      shownSi.some((si) => shownRi.some((ri) => val.has(`${si}|${ci}|${ri}`))),
    );

  if (shownSi.length === 0 || shownCi.length === 0) {
    return (
      <div className={EMPTY_MSG}>
        {kind === "surplus" ? "目前沒有多餘的卡可換出。" : "已全部收集 ✓"}
      </div>
    );
  }

  return (
    <div className={`trade-grid overflow-x-auto ${CARD_FRAME}`} data-kind={kind}>
      <table className="trade-grid-table w-full border-collapse text-xs">
        <thead>
          <tr>
            <th
              rowSpan={2}
              className={`sticky left-0 z-[3] w-[92px] min-w-[92px] whitespace-nowrap bg-secondary px-3.5 py-2.5 text-left font-sans text-[11px] font-normal tracking-[0.15em] text-muted-foreground ${TG_BORDER_STRONG_B} ${TG_BORDER_STRONG_R} max-sm:w-[76px] max-sm:min-w-[76px] max-sm:px-2.5 max-sm:py-2 max-sm:text-[10px] max-sm:tracking-[0.1em]`}
            >
              角色
            </th>
            {shownSi.map((si) => (
              <th
                key={m.series[si]}
                colSpan={shownRi.length}
                className={`trade-grid-series-head border-b-[0.5px] border-border bg-secondary px-1.5 pt-2.5 pb-2 text-center font-accent text-xs font-medium uppercase italic tracking-[0.12em] text-foreground ${TG_BORDER_STRONG_L} max-sm:px-1 max-sm:pt-2 max-sm:pb-1.5 max-sm:text-[11px]`}
              >
                {m.series[si]}
              </th>
            ))}
          </tr>
          <tr>
            {shownSi.map((si) =>
              shownRi.map((ri, localRi) => (
                <th
                  key={`${m.series[si]}-${RARITIES[ri]}`}
                  className={`trade-grid-rarity-head min-w-[32px] bg-secondary px-0 py-1.5 text-center font-mono text-[10px] font-medium ${TG_BORDER_STRONG_B} max-sm:min-w-[26px] max-sm:text-[9px] ${RARITY_TEXT[ri]} ${
                    localRi === 0 ? TG_BORDER_STRONG_L : ""
                  }`}
                >
                  {RARITIES[ri]}
                </th>
              )),
            )}
          </tr>
        </thead>
        <tbody>
          {shownCi.map((ci) => (
            <tr key={m.characters[ci]} className="group/row">
              <td
                className={`sticky left-0 z-[2] w-[92px] min-w-[92px] overflow-hidden text-ellipsis whitespace-nowrap bg-card px-3.5 py-[9px] text-left font-sans text-[13px] text-foreground ${TG_BORDER_STRONG_R} group-hover/row:bg-secondary max-sm:w-[76px] max-sm:min-w-[76px] max-sm:px-2.5 max-sm:py-2 max-sm:text-xs`}
              >
                {m.characters[ci]}
              </td>
              {shownSi.map((si) =>
                shownRi.map((ri, localRi) => {
                  const startCls = localRi === 0 ? TG_BORDER_STRONG_L : "";
                  const cellKey = `${m.series[si]}-${RARITIES[ri]}`;
                  const v = val.get(`${si}|${ci}|${ri}`);
                  if (v == null) {
                    return (
                      <td
                        key={cellKey}
                        className={`${TG_CELL_BASE} text-muted-foreground/40 ${startCls}`}
                      >
                        ·
                      </td>
                    );
                  }
                  if (kind === "surplus") {
                    return (
                      <td
                        key={cellKey}
                        className={`${TG_CELL_BASE} ${TG_HAVE_TINT} ${startCls}`}
                      >
                        {v}
                      </td>
                    );
                  }
                  return (
                    <td
                      key={cellKey}
                      className={`${TG_CELL_BASE} font-mono font-medium ${TG_NEEDS_TINT[ri]} ${RARITY_TEXT[ri]} ${startCls}`}
                    >
                      {v}
                    </td>
                  );
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

- [ ] **Step 4: 補上 import（shared 加 3 個具名匯出）**

把 `Trade.tsx` 的 shared import 由：

```tsx
import {
  EMPTY_MSG,
  MissChip,
  PANEL_GRID,
  PANEL_TITLE,
  Panel,
  RARITY_TEXT,
} from "./shared";
```

改為：

```tsx
import {
  CARD_FRAME,
  EMPTY_MSG,
  MODE_BTN,
  MODE_TOGGLE,
  MissChip,
  PANEL_GRID,
  PANEL_TITLE,
  Panel,
  RARITY_TEXT,
} from "./shared";
```

> `Matrix`、`RARITIES`、`RARITY_KEYS`、`TradeItem` 已在既有 collection import 內，無需更動。

- [ ] **Step 5: 加入 `TradeMode` 型別**

在 `type Filter = "all" | RarityKey;` 之後新增一行：

```tsx
type TradeMode = "list" | "grid";
```

- [ ] **Step 6: 加入 `mode` state**

在 `Trade` 元件內，`const [filter, setFilter] = useState<Filter>("all");` 之後新增：

```tsx
  const [mode, setMode] = useState<TradeMode>("list");
```

- [ ] **Step 7: 加入 `shownRi` 與共用標題節點**

在 `Trade` 元件內、`return (` 之前（`sumItemClass` 定義之後）新增：

```tsx
  const shownRi =
    filter === "all" ? [0, 1, 2, 3] : [RARITY_KEYS.indexOf(filter)];

  const surplusTitle = (
    <span className="inline-flex items-center gap-2">
      可換出
      <CopyButton
        text={formatTradeList(fSurplus, m, "surplus")}
        label="複製可換出清單"
        disabled={fSurplus.length === 0}
      />
    </span>
  );
  const needsTitle = (
    <span className="inline-flex items-center gap-2">
      想換入
      <CopyButton
        text={formatTradeList(fNeeds, m, "needs")}
        label="複製想換入清單"
        disabled={fNeeds.length === 0}
      />
    </span>
  );
```

- [ ] **Step 8: 加入 mode 開關並把面板容器改成條件渲染**

把 `Trade` 的 `return` 中，這整段面板容器：

```tsx
      <div className={PANEL_GRID}>
        <Panel
          title={
            <span className="inline-flex items-center gap-2">
              可換出
              <CopyButton
                text={formatTradeList(fSurplus, m, "surplus")}
                label="複製可換出清單"
                disabled={fSurplus.length === 0}
              />
            </span>
          }
          sub={surplusSub}
        >
          {panelBody(fSurplus, "surplus")}
        </Panel>
        <Panel
          title={
            <span className="inline-flex items-center gap-2">
              想換入
              <CopyButton
                text={formatTradeList(fNeeds, m, "needs")}
                label="複製想換入清單"
                disabled={fNeeds.length === 0}
              />
            </span>
          }
          sub={needsSub}
        >
          {panelBody(fNeeds, "needs")}
        </Panel>
      </div>
```

替換為（開關 + 依 `mode` 切換版面，標題改用共用節點）：

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
          <ToggleGroupItem value="list" className={MODE_BTN}>
            清單
          </ToggleGroupItem>
          <ToggleGroupItem value="grid" className={MODE_BTN}>
            格表
          </ToggleGroupItem>
        </ToggleGroup>
      </div>
      {mode === "list" ? (
        <div className={PANEL_GRID}>
          <Panel title={surplusTitle} sub={surplusSub}>
            {panelBody(fSurplus, "surplus")}
          </Panel>
          <Panel title={needsTitle} sub={needsSub}>
            {panelBody(fNeeds, "needs")}
          </Panel>
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          <Panel title={surplusTitle} sub={surplusSub}>
            <TradeGrid m={m} items={surplus} kind="surplus" shownRi={shownRi} />
          </Panel>
          <Panel title={needsTitle} sub={needsSub}>
            <TradeGrid m={m} items={needs} kind="needs" shownRi={shownRi} />
          </Panel>
        </div>
      )}
```

> `surplus` / `needs`（未篩選）來自元件頂部既有的 `const { surplus, needs } = computeTradeWithPending(...)`。

- [ ] **Step 9: 執行新測試，確認通過**

Run: `npx vitest run --config vitest.client.config.ts test/client/views.test.tsx -t "Trade view mode toggle"`
Expected: PASS（5 個 it 全綠）。

- [ ] **Step 10: 跑完整 client 測試 + 型別檢查（確認未回歸）**

Run: `npm run test:client`
Expected: PASS（既有 Trade 複製/篩選/暫定測試皆綠）。

Run: `npm run typecheck`
Expected: 無錯誤。

- [ ] **Step 11: 格式化並提交**

```bash
npm run format
git add src/client/views/Trade.tsx test/client/views.test.tsx
git commit -m "feat(trade): add 清單/格表 view toggle with a numeric detail grid

Add a mode switch to the trade page: keep the grouped list as the default
and add an opt-in character × series-rarity grid (surplus=spare, needs=1),
trimmed to non-empty rows/columns and scoped by the rarity filter.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: 未收錄（N/A）格斜線底

**Files:**
- Modify: `src/client/views/Trade.tsx`
- Test: `test/client/views.test.tsx`

**Interfaces:**
- Consumes：`exists(m, si, ci): boolean`（`collection.ts`，判斷該系列是否收錄此角色）；Task 1 的 `TradeGrid`、`TG_CELL_BASE`。
- Produces：N/A 格 DOM 鉤 `td.trade-grid-na`。

- [ ] **Step 1: 寫失敗測試（N/A 斜線格）**

在 `test/client/views.test.tsx` 檔尾**新增**：

```tsx
describe("Trade grid edge cells", () => {
  const toGrid = () =>
    fireEvent.click(
      within(
        screen.getByRole("radiogroup", { name: "交換檢視模式" }),
      ).getByRole("radio", { name: "格表" }),
    );

  it("renders hatched N/A cells where a character is absent from a shown series", () => {
    // Kirari 在 MP 4TH 有可換出；Mira 在 KSP 有可換出。兩系列與兩角色都顯示，
    // 於是 Kirari×KSP 與 Mira×MP 4TH 是未收錄（無 catalog cell）的洞。
    const overview: OverviewResponse = {
      cells: [
        {
          catalogId: 1,
          series: "MP 4TH",
          character: "Kirari",
          rarity: "SR",
          owned: 3,
        },
        {
          catalogId: 2,
          series: "KSP",
          character: "Mira",
          rarity: "SR",
          owned: 3,
        },
      ],
      progress: [],
    };
    const { container } = render(<Trade m={buildMatrix(overview)} />);
    toGrid();
    const surplus = container.querySelector(
      '[data-kind="surplus"]',
    ) as HTMLElement;
    expect(
      surplus.querySelectorAll(".trade-grid-na").length,
    ).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: 執行測試，確認失敗**

Run: `npx vitest run --config vitest.client.config.ts test/client/views.test.tsx -t "Trade grid edge cells"`
Expected: FAIL —— 找不到 `.trade-grid-na`（尚未特別處理未收錄格，目前落到 `·`）。

- [ ] **Step 3: 補 `exists` import**

把 `Trade.tsx` 的 collection import：

```tsx
import {
  type Matrix,
  RARITIES,
  RARITY_KEYS,
  type RarityKey,
  type TradeItem,
  computeTradeWithPending,
  formatTradeList,
} from "../collection";
```

改為（加入 `exists`）：

```tsx
import {
  type Matrix,
  RARITIES,
  RARITY_KEYS,
  type RarityKey,
  type TradeItem,
  computeTradeWithPending,
  exists,
  formatTradeList,
} from "../collection";
```

- [ ] **Step 4: 在 `TradeGrid` 格子渲染最前面加入 N/A 分支**

在 `TradeGrid` 的 body cell callback 內，`const v = val.get(...)` 之前插入：

```tsx
                  if (!exists(m, si, ci)) {
                    return (
                      <td
                        key={cellKey}
                        className={`${TG_CELL_BASE} trade-grid-na bg-[var(--bg-subtle)] [background-image:repeating-linear-gradient(45deg,transparent,transparent_4px,rgba(255,255,255,0.018)_4px,rgba(255,255,255,0.018)_8px)] ${startCls}`}
                      />
                    );
                  }
```

插入後該 callback 的順序為：`!exists` → 斜線底；`v == null` → 灰 `·`；`surplus` → 金底數字；否則 → 想換入稀有度色數字。

- [ ] **Step 5: 執行測試，確認通過**

Run: `npx vitest run --config vitest.client.config.ts test/client/views.test.tsx -t "Trade grid edge cells"`
Expected: PASS。

- [ ] **Step 6: 全量驗證（測試 + 型別 + 正式建置）**

Run: `npm test`
Expected: worker + client 全綠。

Run: `npm run typecheck`
Expected: 無錯誤。

Run: `npm run build`
Expected: vite build 成功、無錯誤。

- [ ] **Step 7: 格式化並提交**

```bash
npm run format
git add src/client/views/Trade.tsx test/client/views.test.tsx
git commit -m "feat(trade): hatch N/A cells in the trade grid

Cells where a character is not in a shown series render the collection-grid
hatched background instead of a dot, matching 收集格表.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Self-Review

**1. Spec coverage**（對照 `2026-07-01-trade-grid-view-design.md`）：

| Spec 要點 | 對應 |
| --- | --- |
| 清單/格表 開關、一顆控兩面板、預設清單、不持久化 | Task 1 Step 5–8（`useState("list")`、`MODE_TOGGLE`） |
| 清單模式維持現況 | Task 1 Step 8（`list` 分支續用 `panelBody`） |
| 格表：角色 × 系列稀有度、上下堆疊、可捲動 | Task 1 Step 3（`flex flex-col gap-5` + `overflow-x-auto`） |
| 可換出＝spare（金底）、想換入＝1（稀有度色） | Task 1 Step 3（`TG_HAVE_TINT` / `TG_NEEDS_TINT`+`RARITY_TEXT`） |
| 無值但存在＝灰 `·` | Task 1 Step 3（`v == null` 分支） |
| 系列無此角色＝斜線底 | Task 2 Step 4（`!exists` 分支） |
| 只顯示有東西的列/欄 | Task 1 Step 3（`shownSi` / `shownCi`） |
| 稀有度篩選＝控制顯示哪幾欄 | Task 1 Step 7（`shownRi`）+ 測試 "scopes grid columns" |
| 保留複製鈕/UR 警告/暫定列表 | 未觸及該段程式碼；`surplusTitle`/`needsTitle` 保留 CopyButton |
| 不動 Grid.tsx / collection.ts（除 import exists）/ 後端 | 僅 import；Task 2 只加 `exists` 匯入 |
| 空狀態 | Task 1 Step 3（空 guard）+ 測試 "needs empty state" |

**2. Placeholder scan：** 無 TBD/TODO；每個 code step 皆為完整可貼上的程式碼與命令。

**3. Type consistency：** `TradeGrid` 簽名 `{ m, items, kind, shownRi }` 在定義（Task 1 Step 3）與呼叫（Step 8）一致；`kind: "surplus" | "needs"` 與 `formatTradeList`/`panelBody` 既有用法一致；`shownRi: number[]` 與 `[0,1,2,3]` / `[RARITY_KEYS.indexOf(filter)]` 型別相符；測試鉤 class 名（`trade-grid-table`/`trade-grid-rarity-head`/`data-kind`/`trade-grid-na`）在實作與測試兩端字面一致。

---

## Execution Handoff

見主流程訊息。
