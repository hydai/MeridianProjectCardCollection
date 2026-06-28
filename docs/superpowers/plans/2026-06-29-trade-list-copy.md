# 交換清單一鍵複製 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在交換分頁（`Trade.tsx`）的「可換出 / 想換入」標題右側各加一顆 icon 複製按鈕，把目前篩選後可見的清單以 `角色, 系列, 數量`（依稀有度分群）複製到剪貼簿。

**Architecture:** 把「資料 → 字串」抽成 `collection.ts` 的純函式 `formatTradeList`（可單元測試）；`Trade.tsx` 內新增區域元件 `CopyButton`（自管 copied 狀態）與兩個 inline SVG icon，呼叫 `navigator.clipboard.writeText`。零新相依、零 API/DB 改動。

**Tech Stack:** React 18 + TypeScript、Vitest（jsdom + Testing Library）、Biome（format/lint）、CSS 變數（既有 editorial tokens）。

## Global Constraints

- **零新相依**：icon 用 inline SVG，**不**引入 `lucide-react`（那是 shadcn 分支才加的相依；本分支基於 master）。
- **複製格式**：每筆一行 `角色, 系列, 數量`（逗號加空格）；依稀有度分群，**群順序 UR → SSR → SR → R**；群間空一行；**尾端不留換行**；空清單 → `""`。
- **數量**：可換出（surplus）= `spare`；想換入（needs）= 恆 `1`。
- **群內排序**：稀有度高→低、系列 `si` 升冪、角色 `ci` 升冪（對齊畫面 `groupedList` 視覺順序）。
- **WYSIWYG**：複製吃 `filterItems` 後的陣列（套用目前稀有度篩選）。
- **a11y**：按鈕 `type="button"`、`aria-label`（可換出＝`複製可換出清單`、想換入＝`複製想換入清單`、複製後＝`已複製`）、`title`；SVG 加 `aria-hidden="true"`。
- **空面板**：該按鈕 `disabled`。
- **樣式**：沿用既有 token（`--text`、`--text-tertiary`、`--surface-elevated`）；自製 `.trade-copy-btn` 扁平按鈕（與本檢視既有自製按鈕一致，不用 shadcn `Button`）。
- **程式風格**：Biome（2-space、雙引號、分號、organizeImports）；提交前 `npx biome check --write` 會自動整理 import 排序。
- **分支**：`feat/trade-list-copy`（基於 master）。提交訊息結尾加 `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`。提交前 `lineguard` 與 `npm test`（CLAUDE.md 要求全測試）。

## File Structure

- `src/client/collection.ts` — **Modify（append）**：新增 `export function formatTradeList(items, m, kind)`。純函式，唯一新邏輯所在。
- `test/client/collection.test.ts` — **Modify（append）**：`formatTradeList` 單元測試（分群／排序／數量／空輸入）。
- `src/client/views/Trade.tsx` — **Modify**：新增 inline icon + `CopyButton`、hoist `fSurplus`/`fNeeds`、`panelBody` 改吃已篩選陣列、兩個面板標題接入按鈕。
- `src/client/index.css` — **Modify（append）**：`.trade-panel-titletext` 與 `.trade-copy-btn` 樣式。
- `test/client/views.test.tsx` — **Modify（append）**：元件測試（渲染兩顆按鈕、空面板 disabled、點擊複製預期字串）。

---

### Task 1: `formatTradeList` 純函式（序列化）

**Files:**
- Modify: `src/client/collection.ts`（append 到檔尾）
- Test: `test/client/collection.test.ts`（append 新 describe）

**Interfaces:**
- Consumes: 既有 `RARITIES: Rarity[]`、`interface Matrix { series: string[]; characters: string[]; cards: (Counts|null)[][] }`、`interface TradeItem { ri: number; si: number; ci: number; spare: number }`（皆已存在於 `collection.ts`）。
- Produces: `export function formatTradeList(items: TradeItem[], m: Matrix, kind: "surplus" | "needs"): string`。供 Task 2 的 `Trade.tsx` 使用。

- [ ] **Step 1: 寫失敗測試** — 在 `test/client/collection.test.ts` 檔尾 append 下列 describe；並把檔案最上方 import 補上 `formatTradeList`、`type Matrix`、`type TradeItem`（加入既有 `from "../../src/client/collection"` 具名清單即可，順序交給 biome 整理）。

```ts
describe("formatTradeList", () => {
  // formatTradeList 只讀 m.series / m.characters，不讀 cards
  const m: Matrix = {
    series: ["MP 4TH", "MP 5TH"],
    characters: ["Kirari", "Mococo", "Fuwawa"],
    cards: [],
  };

  it("groups surplus by rarity (UR→R) as `角色, 系列, 數量`", () => {
    const items: TradeItem[] = [
      { ri: 2, si: 0, ci: 1, spare: 3 }, // SSR Mococo MP 4TH
      { ri: 3, si: 1, ci: 2, spare: 1 }, // UR  Fuwawa MP 5TH
      { ri: 3, si: 0, ci: 0, spare: 2 }, // UR  Kirari MP 4TH
    ];
    expect(formatTradeList(items, m, "surplus")).toBe(
      "UR\nKirari, MP 4TH, 2\nFuwawa, MP 5TH, 1\n\nSSR\nMococo, MP 4TH, 3",
    );
  });

  it("uses quantity 1 for every needs line regardless of spare", () => {
    const items: TradeItem[] = [
      { ri: 3, si: 0, ci: 0, spare: 0 }, // UR Kirari MP 4TH
      { ri: 0, si: 1, ci: 1, spare: 0 }, // R  Mococo MP 5TH
    ];
    expect(formatTradeList(items, m, "needs")).toBe(
      "UR\nKirari, MP 4TH, 1\n\nR\nMococo, MP 5TH, 1",
    );
  });

  it("orders within a rarity by series then character", () => {
    const items: TradeItem[] = [
      { ri: 3, si: 1, ci: 0, spare: 1 }, // UR Kirari MP 5TH
      { ri: 3, si: 0, ci: 2, spare: 1 }, // UR Fuwawa MP 4TH
      { ri: 3, si: 0, ci: 0, spare: 1 }, // UR Kirari MP 4TH
    ];
    expect(formatTradeList(items, m, "surplus")).toBe(
      "UR\nKirari, MP 4TH, 1\nFuwawa, MP 4TH, 1\nKirari, MP 5TH, 1",
    );
  });

  it("returns an empty string for no items", () => {
    expect(formatTradeList([], m, "surplus")).toBe("");
  });
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run --config vitest.client.config.ts test/client/collection.test.ts`
Expected: FAIL —`formatTradeList` 尚未匯出（型別錯誤／`formatTradeList is not a function`）。

- [ ] **Step 3: 寫最小實作** — append 到 `src/client/collection.ts` 檔尾：

```ts
// Serialize a trade list to `角色, 系列, 數量` lines, grouped by rarity
// (UR→R), blank line between groups. surplus uses spare as the quantity;
// needs is always 1. Mirrors the on-screen order in Trade's groupedList.
export function formatTradeList(
  items: TradeItem[],
  m: Matrix,
  kind: "surplus" | "needs",
): string {
  const ordered = [...items].sort(
    (a, b) => b.ri - a.ri || a.si - b.si || a.ci - b.ci,
  );
  const groups: string[] = [];
  let curRi = -1;
  let lines: string[] = [];
  const flush = () => {
    if (lines.length) groups.push(lines.join("\n"));
    lines = [];
  };
  for (const it of ordered) {
    if (it.ri !== curRi) {
      flush();
      curRi = it.ri;
      lines.push(RARITIES[it.ri]);
    }
    const qty = kind === "surplus" ? it.spare : 1;
    lines.push(`${m.characters[it.ci]}, ${m.series[it.si]}, ${qty}`);
  }
  flush();
  return groups.join("\n\n");
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `npx vitest run --config vitest.client.config.ts test/client/collection.test.ts`
Expected: PASS（含既有 buildMatrix/computeTrade/receivableCards/... 全綠）。

- [ ] **Step 5: 型別 + 格式 + lineguard**

Run:
```bash
npm run typecheck
npx biome check --write src/client/collection.ts test/client/collection.test.ts
lineguard src/client/collection.ts test/client/collection.test.ts
```
Expected: typecheck 無錯；biome 自動整理 import；lineguard 通過。

- [ ] **Step 6: 全測試 + commit**

Run: `npm test`（worker + client 皆綠）
```bash
git add src/client/collection.ts test/client/collection.test.ts
git commit -m "$(cat <<'EOF'
feat: add formatTradeList serializer for trade lists

Pure function that turns surplus/needs TradeItem[] into clipboard text
(`角色, 系列, 數量`, grouped UR→R, blank line between groups). surplus
uses spare as quantity, needs always 1; ordering mirrors the Trade view.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Trade 面板複製按鈕（元件 + 樣式）

**Files:**
- Modify: `src/client/views/Trade.tsx`
- Modify: `src/client/index.css`（append `.trade-panel-sub` 規則之後，約 master line 1191）
- Test: `test/client/views.test.tsx`（append 新 describe）

**Interfaces:**
- Consumes: Task 1 的 `formatTradeList(items, m, kind)`；既有 `filterItems`、`fSurplus`/`fNeeds`、`RARITIES`/`RARITY_KEYS`、`Matrix`、`TradeItem`。
- Produces: 無對外匯出（區域 `CopyButton`/`CopyIcon`/`CheckIcon` 僅供本檔）。對測試暴露的契約：兩顆 `aria-label` 為 `複製可換出清單` / `複製想換入清單` 的 `<button>`，空面板時 `disabled`，點擊呼叫 `navigator.clipboard.writeText` 帶入格式化字串。

- [ ] **Step 1: 寫失敗測試** — 在 `test/client/views.test.tsx` 檔尾 append；並把第 2 行 vitest import 改為含 `vi`：
  - 將 `import { beforeEach, describe, expect, it } from "vitest";` 改為 `import { beforeEach, describe, expect, it, vi } from "vitest";`

```tsx
describe("Trade copy buttons", () => {
  const card = (
    character: string,
    rarity: "R" | "SR" | "SSR" | "UR",
    owned: number,
    id: number,
  ) => ({ catalogId: id, series: "MP 4TH", character, rarity, owned });

  // all owned = 1 → no duplicates, nothing missing → both panels empty
  const singles: OverviewResponse = {
    cells: [
      card("Kirari", "R", 1, 1),
      card("Kirari", "SR", 1, 2),
      card("Kirari", "SSR", 1, 3),
      card("Kirari", "UR", 1, 4),
    ],
    progress: [],
  };
  // Kirari UR owned 2 → exactly one surplus line; nothing missing
  const oneSurplus: OverviewResponse = {
    cells: [
      card("Kirari", "R", 1, 1),
      card("Kirari", "SR", 1, 2),
      card("Kirari", "SSR", 1, 3),
      card("Kirari", "UR", 2, 4),
    ],
    progress: [],
  };

  it("renders a copy button on each panel", () => {
    render(<Trade m={buildMatrix(oneSurplus)} />);
    expect(
      screen.getByRole("button", { name: "複製可換出清單" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "複製想換入清單" }),
    ).toBeInTheDocument();
  });

  it("disables a panel's copy button when it has nothing to copy", () => {
    render(<Trade m={buildMatrix(singles)} />);
    expect(
      screen.getByRole("button", { name: "複製可換出清單" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "複製想換入清單" }),
    ).toBeDisabled();
  });

  it("copies the visible surplus list in `角色, 系列, 數量` format", () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });
    render(<Trade m={buildMatrix(oneSurplus)} />);
    fireEvent.click(screen.getByRole("button", { name: "複製可換出清單" }));
    expect(writeText).toHaveBeenCalledWith("UR\nKirari, MP 4TH, 1");
  });
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run --config vitest.client.config.ts test/client/views.test.tsx`
Expected: FAIL — 找不到 `name: "複製可換出清單"` 的 button（按鈕尚未存在）。

- [ ] **Step 3a: 改 import**（`src/client/views/Trade.tsx`）
  - `import { useState } from "react";` → `import { useRef, useState } from "react";`
  - 既有 `from "../collection"` 具名清單加入 `formatTradeList`（順序交給 biome）：
    ```ts
    import {
      type Matrix,
      RARITIES,
      RARITY_KEYS,
      type TradeItem,
      computeTradeWithPending,
      formatTradeList,
    } from "../collection";
    ```

- [ ] **Step 3b: 新增 icon 與 CopyButton** — 插入到 `export function Trade({` 之前（緊接 `PendingCard` 元件之後）：

```tsx
const ICON = {
  width: 15,
  height: 15,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

function CopyIcon() {
  return (
    <svg {...ICON} aria-hidden="true">
      <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
      <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg {...ICON} aria-hidden="true">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

function CopyButton({
  text,
  label,
  disabled,
}: { text: string; label: string; disabled: boolean }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onClick = () => {
    navigator.clipboard
      .writeText(text)
      .then(() => {
        setCopied(true);
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => setCopied(false), 1500);
      })
      .catch(() => {
        /* clipboard unavailable (insecure context) — skip feedback */
      });
  };
  return (
    <button
      type="button"
      className={`trade-copy-btn ${copied ? "copied" : ""}`}
      onClick={onClick}
      disabled={disabled}
      aria-label={copied ? "已複製" : label}
      title={label}
    >
      {copied ? <CheckIcon /> : <CopyIcon />}
    </button>
  );
}
```

- [ ] **Step 3c: hoist `fSurplus`/`fNeeds`** — 在 `filterItems` 定義（`const filterItems = (items: TradeItem[]) => ...`）之後新增：

```tsx
  const fSurplus = filterItems(surplus);
  const fNeeds = filterItems(needs);
```

- [ ] **Step 3d: 改 `surplusSub`/`needsSub` 用 hoisted 值**

把：
```tsx
  const surplusSub = `多餘 ${filterItems(surplus).reduce((s, x) => s + x.spare, 0)} 張`;
  const needsSub = `缺 ${filterItems(needs).length} 種`;
```
改為：
```tsx
  const surplusSub = `多餘 ${fSurplus.reduce((s, x) => s + x.spare, 0)} 張`;
  const needsSub = `缺 ${fNeeds.length} 種`;
```

- [ ] **Step 3e: `panelBody` 改吃已篩選陣列**

把：
```tsx
  const panelBody = (items: TradeItem[], kind: "surplus" | "needs") => {
    const filtered = filterItems(items);
    if (filtered.length === 0) {
```
改為（移除內部 `filterItems`）：
```tsx
  const panelBody = (filtered: TradeItem[], kind: "surplus" | "needs") => {
    if (filtered.length === 0) {
```

- [ ] **Step 3f: 兩個面板標題接入按鈕**

把：
```tsx
        <section className="trade-panel">
          <h3 className="trade-panel-title">
            可換出<span className="trade-panel-sub">{surplusSub}</span>
          </h3>
          {panelBody(surplus, "surplus")}
        </section>
        <section className="trade-panel">
          <h3 className="trade-panel-title">
            想換入<span className="trade-panel-sub">{needsSub}</span>
          </h3>
          {panelBody(needs, "needs")}
        </section>
```
改為：
```tsx
        <section className="trade-panel">
          <h3 className="trade-panel-title">
            <span className="trade-panel-titletext">
              可換出
              <CopyButton
                text={formatTradeList(fSurplus, m, "surplus")}
                label="複製可換出清單"
                disabled={fSurplus.length === 0}
              />
            </span>
            <span className="trade-panel-sub">{surplusSub}</span>
          </h3>
          {panelBody(fSurplus, "surplus")}
        </section>
        <section className="trade-panel">
          <h3 className="trade-panel-title">
            <span className="trade-panel-titletext">
              想換入
              <CopyButton
                text={formatTradeList(fNeeds, m, "needs")}
                label="複製想換入清單"
                disabled={fNeeds.length === 0}
              />
            </span>
            <span className="trade-panel-sub">{needsSub}</span>
          </h3>
          {panelBody(fNeeds, "needs")}
        </section>
```

- [ ] **Step 3g: 新增 CSS** — append 到 `src/client/index.css` 的 `.trade-panel-sub { ... }` 規則之後：

```css
.trade-panel-titletext {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}
.trade-copy-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 2px;
  border: none;
  border-radius: 3px;
  background: transparent;
  color: var(--text-tertiary);
  cursor: pointer;
  transition: color 0.15s, background 0.15s;
}
.trade-copy-btn:hover:not(:disabled) {
  color: var(--text);
  background: var(--surface-elevated);
}
.trade-copy-btn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}
.trade-copy-btn.copied {
  color: var(--text);
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `npx vitest run --config vitest.client.config.ts test/client/views.test.tsx`
Expected: PASS（含既有 7-views 渲染測試與 pending overlay 測試）。

- [ ] **Step 5: 型別 + 格式 + lineguard**

Run:
```bash
npm run typecheck
npx biome check --write src/client/views/Trade.tsx src/client/index.css test/client/views.test.tsx
lineguard src/client/views/Trade.tsx src/client/index.css test/client/views.test.tsx
```
Expected: typecheck 無錯（注意 `ICON` 的 `as const` 讓 `strokeLinecap` 等字面量型別符合 SVG props）；biome / lineguard 通過。

- [ ] **Step 6: 全建置驗證**（CLAUDE.md：完成前跑含測試的完整建置）

Run:
```bash
npm test
npm run build
```
Expected: 全測試綠；`vite build` 成功（無 TS/打包錯誤）。

- [ ] **Step 7（人工視覺驗收，選配但建議）**

Run: `npm run dev`，開交換分頁：
- 「可換出 / 想換入」標題右側各有一顆淡色 copy icon；hover 變亮。
- 點擊 → icon 暫變勾，剪貼簿內容符合 `角色, 系列, 數量` 格式。
- 切換上方稀有度篩選後再複製 → 內容只含該稀有度（WYSIWYG）。
- 已收齊 / 無多餘的面板 → 按鈕變淡且不可點。

- [ ] **Step 8: commit**

```bash
git add src/client/views/Trade.tsx src/client/index.css test/client/views.test.tsx
git commit -m "$(cat <<'EOF'
feat: add copy buttons to trade panels

Each of 可換出 / 想換入 gets an inline-SVG copy icon button that writes
the visible (filter-respecting) list to the clipboard via formatTradeList,
shows a check for ~1.5s, and disables when its panel is empty.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Notes for the implementer

- **TDD order matters**：Task 1 必須先合併，Task 2 的 `Trade.tsx` 才 import 得到 `formatTradeList`。
- **不要**安裝任何套件；icon 一律 inline SVG。
- **import 排序**：手寫順序不必完美，`npx biome check --write` 會自動整理；但別漏掉新具名匯入。
- **clipboard 測試**：用 `Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true })`；不要整顆 `vi.stubGlobal("navigator", …)`（會蓋掉 jsdom 其餘 navigator 屬性）。
- **act 警告**：點擊測試只斷言 `writeText` 被呼叫（同步）；`.then` 內的 `setCopied` 為微任務，可能印出 act 警告但不影響通過，可忽略。
