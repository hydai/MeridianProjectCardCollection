# shadcn Phase 3b — Market + Trade Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate the two remaining public legacy-CSS views — `Trade.tsx` and `Market.tsx` — onto shadcn primitives + Tailwind tokens, preserving the dark-gold editorial look pixel-for-pixel.

**Architecture:** Same incremental playbook as Phase 3a. Add two new shadcn primitives (`Alert`, `ToggleGroup`), introduce one shared `Panel` component (the DRY payoff of migrating both views together), then reskin each view section-by-section, swapping legacy classes for Tailwind utilities that resolve through the existing semantic-token bridge. Finish by deleting the now-dead legacy CSS that is exclusively used by these two views. All work on one `feat/shadcn-phase3b` branch → one PR.

**Tech Stack:** React 18, React Router 7, Vite 6, Tailwind v4 (`@tailwindcss/vite`), shadcn 4.12 (radix base / nova style), `radix-ui` 1.6, `lucide-react` 1.21, Biome, Vitest + Testing Library.

## Global Constraints

These apply to **every** task; each task's requirements implicitly include them.

- **Visual parity is the acceptance bar.** The migrated UI must match the legacy rendering. Legacy CSS lives in `@layer legacy` (below `utilities`) so migrated utilities win; do not change the visual result.
- **Preserve the `.view` wrapper.** Every view keeps `<section className="view view-market">` / `view-trade` — `test/client/views.test.tsx` asserts `section.view`, and `.view` carries the entrance animation.
- **Preserve all visible text and accessible names.** Existing tests query by text (`待售`, `載入中…`, `暫定交換列表`, …) and by `getByRole("button", { name: "複製可換出清單" })`. Reskins must keep these stable.
- **Zero new npm dependencies.** Both primitives ride the already-installed `radix-ui` + `class-variance-authority`; icons use the already-installed `lucide-react`.
- **Semantic-token bridge already exists** (`src/client/index.css` `:root` + `@theme inline`). Reuse the mapping in the reference table below; do not add new tokens.
- **Before each commit:** run `lineguard` on changed files, then `npm test` (must be green), then `npx biome check .` (clean). A PreToolUse hook also auto-runs format/lint/test on `git commit`.
- **Conventional Commits**, one concern per commit. Commit trailer (repo style):
  `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`
- **Additive git only** — no force-push, no rebase inside the loop.

## Design-token reference (legacy CSS var → Tailwind utility)

Use this table everywhere instead of raw hex. Where no semantic token exists, use the raw var (matches the Phase 3a precedent for `--*-soft` / `--border-strong`).

| Legacy var | Value | Tailwind utility |
|---|---|---|
| `--surface` | `#181613` | `bg-card` |
| `--surface-elevated` | `#1f1c18` | `bg-secondary` |
| `--border` | `#2a2520` | `border-border` (+ `border-[0.5px]` for the 0.5px hairline) |
| `--border-strong` | `#3a342c` | `[border-color:var(--border-strong)]` (hover only) |
| `--border-tertiary` | `#221e18` | `border-[var(--border-tertiary)]` |
| `--text` | `#ede8df` | `text-foreground` |
| `--text-secondary` | `#a39e93` | `text-muted-foreground` |
| `--text-tertiary` | `#6a6660` | `text-[var(--text-tertiary)]` |
| `--text-quaternary` | `#46433e` | `text-[var(--text-quaternary)]` |
| `--primary` | `#c9a14a` | `text-primary` / `border-primary` |
| `--r/sr/ssr/ur-color` | rarity palette | `text-rarity-r/sr/ssr/ur`, `border-rarity-*` |
| `--ur-soft` | `rgba(224,113,113,.1)` | `bg-[var(--ur-soft)]` |
| serif (`Noto Serif TC`) | — | `font-serif` |
| mono (`JetBrains Mono`) | — | `font-mono` |
| accent (`Cormorant Garamond` italic) | — | `font-accent italic` |

## File Structure

- **Create:** `src/client/components/ui/alert.tsx`, `src/client/components/ui/toggle.tsx`, `src/client/components/ui/toggle-group.tsx` — via `npx shadcn@latest add` (Task 1). Do not hand-write.
- **Modify:** `src/client/views/shared.tsx` — add the shared `Panel` component + `PANEL_*` class constants (Task 2). One responsibility: the editorial card-panel shell reused by Trade + Market.
- **Modify:** `src/client/views/Trade.tsx` — copy button (T3), summary→ToggleGroup (T4), warning→Alert + pending→Table/Card (T5), panels+series list (T6).
- **Modify:** `src/client/views/Market.tsx` — panels→Panel, rows→Tailwind (T7).
- **Modify:** `test/client/components/ui.test.tsx` — Alert + ToggleGroup + Panel render tests (T1, T2).
- **Modify:** `test/client/views.test.tsx` — one new Trade rarity-filter test (T4).
- **Modify:** `src/client/index.css` — delete Trade/Market-exclusive legacy blocks; keep `trade-empty` + `state-msg` (T8).

---

### Task 1: Add Alert + ToggleGroup primitives

**Files:**
- Create: `src/client/components/ui/alert.tsx`, `src/client/components/ui/toggle.tsx`, `src/client/components/ui/toggle-group.tsx`
- Test: `test/client/components/ui.test.tsx`

**Interfaces:**
- Produces: `Alert`, `AlertTitle`, `AlertDescription` (from `@/components/ui/alert`); `ToggleGroup`, `ToggleGroupItem` (from `@/components/ui/toggle-group`). `ToggleGroup` props: `type="single"`, `value`, `onValueChange`, `className`. `ToggleGroupItem` props: `value`, `aria-label`, `className`, children.

- [ ] **Step 1: Write the failing tests** in `test/client/components/ui.test.tsx`

Add these imports at the top (next to the existing UI imports):

```tsx
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { fireEvent } from "@testing-library/react";
```

Add these describe blocks at the end of the file:

```tsx
describe("Alert", () => {
  it("renders with role=alert and shows title + description", () => {
    render(
      <Alert>
        <AlertTitle>警告</AlertTitle>
        <AlertDescription>內容說明</AlertDescription>
      </Alert>,
    );
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByText("警告")).toBeInTheDocument();
    expect(screen.getByText("內容說明")).toBeInTheDocument();
  });
});

describe("ToggleGroup", () => {
  it("selects a single value and reports changes", () => {
    const onValueChange = vi.fn();
    render(
      <ToggleGroup type="single" value="all" onValueChange={onValueChange}>
        <ToggleGroupItem value="all" aria-label="全部">
          全部
        </ToggleGroupItem>
        <ToggleGroupItem value="ur" aria-label="UR">
          UR
        </ToggleGroupItem>
      </ToggleGroup>,
    );
    fireEvent.click(screen.getByRole("button", { name: "UR" }));
    expect(onValueChange).toHaveBeenCalledWith("ur");
  });
});
```

`vi` is already imported in this file's test setup? Check the top of `ui.test.tsx`; it currently imports `{ describe, expect, it }` from `vitest`. Add `vi` to that import.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test:client -- ui.test.tsx`
Expected: FAIL — `Cannot find module '@/components/ui/alert'` (and toggle-group).

- [ ] **Step 3: Add the components via the CLI**

Run: `npx shadcn@latest add alert toggle-group`
This writes `alert.tsx`, `toggle-group.tsx`, **and** `toggle.tsx` (a registry dependency of toggle-group). Accept any overwrite prompts only for these three new files.

- [ ] **Step 4: Verify the CLI installed the utility-class versions (not the nova CSS-class build)**

Run: `grep -lE "cn-alert|cn-toggle" src/client/components/ui/alert.tsx src/client/components/ui/toggle*.tsx`
Expected: **no output** (exit 1). If any file matches `cn-*` classes, STOP — the nova CSS layer is not set up in this project; report and do not proceed.

Also verify imports were rewritten to the project alias:
Run: `grep -n "@/lib/utils\|@/components/ui/toggle\"" src/client/components/ui/toggle-group.tsx`
Expected: imports reference `@/lib/utils` and `@/components/ui/toggle` (not `@/registry/radix-nova/...`). If they still say `@/registry/...`, fix them to the project aliases.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm run test:client -- ui.test.tsx`
Expected: PASS (Alert + ToggleGroup blocks green, existing blocks still green).

- [ ] **Step 6: Lint + full test + commit**

```bash
lineguard src/client/components/ui/alert.tsx src/client/components/ui/toggle.tsx src/client/components/ui/toggle-group.tsx test/client/components/ui.test.tsx
npx biome check --write src/client/components/ui/alert.tsx src/client/components/ui/toggle.tsx src/client/components/ui/toggle-group.tsx test/client/components/ui.test.tsx
npm test
git add src/client/components/ui/alert.tsx src/client/components/ui/toggle.tsx src/client/components/ui/toggle-group.tsx test/client/components/ui.test.tsx
git commit -m "feat: add shadcn Alert + ToggleGroup primitives (radix base)"
```

---

### Task 2: Shared editorial `Panel` component

**Files:**
- Modify: `src/client/views/shared.tsx`
- Test: `test/client/components/ui.test.tsx`

**Interfaces:**
- Consumes: `Card`, `CardHeader`, `CardTitle`, `CardContent` from `@/components/ui/card`; `cn` from `@/lib/utils`.
- Produces: `Panel({ title, sub?, children, className? })` and the constants `PANEL_SHELL`, `PANEL_HEADER`, `PANEL_TITLE`, `PANEL_SUB`. `title` and `sub` are `React.ReactNode`. Used by Trade (T6) and Market (T7).

`Panel` renders the legacy `.trade-panel`: a 0.5px-bordered card (radius 4px, padding 20/22px) with a serif title, a mono sub on the right, and a 0.5px header divider. The title is rendered as the children of an `<h3>` (via `CardTitle asChild`) to preserve heading semantics — matching the legacy `<h3 className="trade-panel-title">`.

- [ ] **Step 1: Write the failing test** in `test/client/components/ui.test.tsx`

Add the import:

```tsx
import { Panel } from "@/views/shared";
```

(Confirm the `@/views` alias resolves; if `shared.tsx` is normally imported via a relative path in tests, import it as `import { Panel } from "../../../src/client/views/shared";` to match the repo's test import style.)

Add this describe block:

```tsx
describe("Panel", () => {
  it("renders an h3 title, a sub, and its children", () => {
    render(
      <Panel title="待售" sub="3 張">
        <div>row</div>
      </Panel>,
    );
    const heading = screen.getByRole("heading", { level: 3, name: "待售" });
    expect(heading).toBeInTheDocument();
    expect(screen.getByText("3 張")).toBeInTheDocument();
    expect(screen.getByText("row")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test:client -- ui.test.tsx`
Expected: FAIL — `Panel` is not exported from `shared.tsx`.

- [ ] **Step 3: Implement `Panel` in `src/client/views/shared.tsx`**

Add to the imports at the top:

```tsx
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
```

Add these exports (place after the existing `CARD_*` constants):

```tsx
// Editorial sub-panel (shared by Trade + Market): the legacy `.trade-panel`
// rebuilt on shadcn Card — 0.5px border, 4px radius, serif title with a mono
// sub on the right and a 0.5px header divider. Smaller than CARD_SHELL.
export const PANEL_SHELL =
  "gap-0 overflow-visible rounded-[4px] border-[0.5px] border-border bg-card px-[22px] py-5 ring-0 max-sm:px-4 max-sm:py-4";
export const PANEL_HEADER =
  "flex flex-row items-baseline justify-between gap-3 border-b-[0.5px] border-border px-0 pb-3 mb-4";
export const PANEL_TITLE =
  "font-serif text-base font-medium tracking-[0.04em] text-foreground";
export const PANEL_SUB =
  "font-mono text-[11px] font-normal tracking-[0.06em] text-[var(--text-tertiary)]";

export function Panel({
  title,
  sub,
  children,
  className,
}: {
  title: React.ReactNode;
  sub?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Card className={cn(PANEL_SHELL, className)}>
      <CardHeader className={PANEL_HEADER}>
        <CardTitle asChild className={PANEL_TITLE}>
          <h3>{title}</h3>
        </CardTitle>
        {sub != null ? <span className={PANEL_SUB}>{sub}</span> : null}
      </CardHeader>
      <CardContent className="px-0">{children}</CardContent>
    </Card>
  );
}
```

Add `import type * as React from "react";` if `shared.tsx` does not already import React types (check the top of the file).

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test:client -- ui.test.tsx`
Expected: PASS.

- [ ] **Step 5: Lint + full test + commit**

```bash
lineguard src/client/views/shared.tsx test/client/components/ui.test.tsx
npx biome check --write src/client/views/shared.tsx test/client/components/ui.test.tsx
npm test
git add src/client/views/shared.tsx test/client/components/ui.test.tsx
git commit -m "feat: add shared editorial Panel (Card) for trade/market"
```

---

### Task 3: Trade copy buttons → Button + lucide icons

**Files:**
- Modify: `src/client/views/Trade.tsx`

**Interfaces:**
- Consumes: `Button` from `@/components/ui/button`; `Copy`, `Check` from `lucide-react`.
- Regression-guarded by existing tests in `test/client/views.test.tsx` → `describe("Trade copy buttons")` (renders by name `複製可換出清單` / `複製想換入清單`, disabled state, clipboard payload). No new test needed; these must stay green. The accessible name (`aria-label` / `title`) MUST remain identical.

- [ ] **Step 1: Replace the hand-rolled icons + button**

In `src/client/views/Trade.tsx`:

1. Add imports at the top:

```tsx
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
```

2. Delete the `ICON` const object and the `CopyIcon` and `CheckIcon` function components (the inline `<svg>` definitions).

3. Replace the `CopyButton` return JSX with:

```tsx
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="size-6 text-[var(--text-tertiary)] hover:text-foreground"
      onClick={onClick}
      disabled={disabled}
      aria-label={copied ? "已複製" : label}
      title={label}
    >
      {copied ? <Check /> : <Copy />}
    </Button>
  );
```

Keep the `copied`/`timer`/`onClick` logic unchanged. Per the shadcn icon rule, do **not** put sizing classes on the lucide icons — `Button` sizes its `svg` children.

- [ ] **Step 2: Run the copy-button tests (must stay green)**

Run: `npm run test:client -- views.test.tsx -t "copy"`
Expected: PASS — all three "Trade copy buttons" tests + the disabled test green.

- [ ] **Step 3: Typecheck + build (the SVGs are gone; confirm nothing referenced them)**

Run: `npm run typecheck && npm run build`
Expected: both succeed.

- [ ] **Step 4: Lint + full test + commit**

```bash
lineguard src/client/views/Trade.tsx
npx biome check --write src/client/views/Trade.tsx
npm test
git add src/client/views/Trade.tsx
git commit -m "feat: migrate Trade copy buttons to Button + lucide icons"
```

---

### Task 4: Trade summary filter → ToggleGroup

**Files:**
- Modify: `src/client/views/Trade.tsx`
- Test: `test/client/views.test.tsx`

**Interfaces:**
- Consumes: `ToggleGroup`, `ToggleGroupItem` from `@/components/ui/toggle-group`.
- The 5 summary cards become a single-select ToggleGroup whose value is the existing `filter` state. Active styling is driven by `filter === c.key` (not `data-[state=on]`) so it composes cleanly with the shortfall state and matches legacy precedence (active wins over shortfall).

- [ ] **Step 1: Write the failing test** in `test/client/views.test.tsx`

Add inside the existing `describe("Trade copy buttons")` data scope (or a new describe) — reuse the `card` helper + `oneSurplus` pattern. Add a two-rarity-surplus fixture and a filter test:

```tsx
describe("Trade rarity filter", () => {
  const card = (
    character: string,
    rarity: "R" | "SR" | "SSR" | "UR",
    owned: number,
    id: number,
  ) => ({ catalogId: id, series: "MP 4TH", character, rarity, owned });

  // Kirari SR owned 2 AND Kirari UR owned 2 → surplus in two rarities.
  const twoSurplus: OverviewResponse = {
    cells: [
      card("Kirari", "R", 1, 1),
      card("Kirari", "SR", 2, 2),
      card("Kirari", "SSR", 1, 3),
      card("Kirari", "UR", 2, 4),
    ],
    progress: [],
  };

  it("scopes the 可換出 copy list to the selected rarity", () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });
    render(<Trade m={buildMatrix(twoSurplus)} />);
    fireEvent.click(screen.getByRole("button", { name: "SR" }));
    fireEvent.click(screen.getByRole("button", { name: "複製可換出清單" }));
    expect(writeText).toHaveBeenCalledWith("SR\nKirari, MP 4TH, 1");
  });
});
```

This depends on each ToggleGroupItem exposing `aria-label={c.label}` so `{ name: "SR" }` resolves exactly (and does not collide with `SSR`).

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test:client -- views.test.tsx -t "rarity filter"`
Expected: FAIL — multiple/zero buttons named `SR` (current summary buttons' accessible name is the concatenated `SR 缺 … ↔ 餘 …`), so the query throws.

- [ ] **Step 3: Migrate the summary block**

In `src/client/views/Trade.tsx`:

1. Add the import:

```tsx
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
```

2. In the `summaryCards` array definition, change the `cls` field from the legacy `ts-*` class to the Tailwind color utility:
   - `all` → `cls: "text-muted-foreground"`
   - each rarity → `cls: ["text-rarity-r", "text-rarity-sr", "text-rarity-ssr", "text-rarity-ur"][ri]`

3. Add an item-className builder near the top of the `Trade` component body (after `const toggle = …` is removed — see note below):

```tsx
  const sumItemClass = (key: Filter, shortfall: boolean) =>
    cn(
      "flex h-auto w-full flex-col items-stretch justify-start gap-2 rounded-[4px] border-[0.5px] border-border bg-card px-2.5 py-3.5 text-center transition-colors select-none hover:bg-card hover:[border-color:var(--border-strong)] hover:text-foreground max-sm:px-1.5 max-sm:py-[11px]",
      shortfall &&
        filter !== key &&
        "border-rarity-ur/40 bg-[var(--ur-soft)]",
      filter === key &&
        "border-primary bg-secondary shadow-[inset_0_0_0_0.5px_rgba(201,161,74,0.45)]",
    );
```

Add `cn` to the imports from `@/lib/utils` if not already present.

4. Replace the entire `<div className="trade-summary"> … </div>` block with:

```tsx
      <ToggleGroup
        type="single"
        value={filter}
        onValueChange={(v) => setFilter((v || "all") as Filter)}
        className="mb-[18px] grid w-full grid-cols-5 gap-2.5 max-sm:gap-[7px]"
      >
        {summaryCards.map((c) => (
          <ToggleGroupItem
            key={c.key}
            value={c.key}
            aria-label={c.label}
            className={sumItemClass(c.key, c.shortfall)}
          >
            <div
              className={cn(
                "mb-2 font-mono text-sm font-medium tracking-[0.08em] max-sm:text-xs",
                c.cls,
              )}
            >
              {c.label}
            </div>
            <div className="flex items-center justify-center gap-1.5 font-mono text-xs max-sm:flex-col max-sm:gap-1 max-sm:text-[11px]">
              <span className="text-muted-foreground">缺 {c.need}</span>
              <span className="text-[11px] text-[var(--text-quaternary)] max-sm:hidden">
                ↔
              </span>
              <span className="text-foreground">餘 {c.spare}</span>
            </div>
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
```

5. Remove the now-unused `toggle` helper (`const toggle = (f: Filter) => …`) — `onValueChange` replaces it. The legacy `toggle` returned to `"all"` when clicking the active non-`all` item; ToggleGroup single-select deselects to `""` on re-click, which `(v || "all")` maps back to `"all"` — identical behavior.

- [ ] **Step 4: Run the new test + the existing Trade tests**

Run: `npm run test:client -- views.test.tsx`
Expected: PASS — the new "rarity filter" test and all existing Trade/Market tests green.

- [ ] **Step 5: Typecheck + build**

Run: `npm run typecheck && npm run build`
Expected: both succeed (confirms `Filter` typing on `onValueChange` and no unused `toggle`).

- [ ] **Step 6: Lint + full test + commit**

```bash
lineguard src/client/views/Trade.tsx test/client/views.test.tsx
npx biome check --write src/client/views/Trade.tsx test/client/views.test.tsx
npm test
git add src/client/views/Trade.tsx test/client/views.test.tsx
git commit -m "feat: migrate Trade summary filter to ToggleGroup"
```

---

### Task 5: Trade warning → Alert; pending card/table → Card/Table

**Files:**
- Modify: `src/client/views/Trade.tsx`

**Interfaces:**
- Consumes: `Alert`, `AlertTitle`, `AlertDescription` from `@/components/ui/alert`; `TriangleAlert` from `lucide-react`; `Card` from `@/components/ui/card`; `Table`, `TableBody`, `TableCell`, `TableHead`, `TableHeader`, `TableRow` from `@/components/ui/table`.
- Regression-guarded by `describe("Trade pending overlay")` (asserts `暫定交換列表`, the date, and card-name text). Those texts must stay stable.

- [ ] **Step 1: Migrate the UR warning**

Add imports:

```tsx
import { TriangleAlert } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
```

Replace the `showWarning ? (<div className="trade-warning">…</div>) : null` block with:

```tsx
      {showWarning ? (
        <Alert className="mb-[22px] gap-1 rounded-[4px] border-[0.5px] border-rarity-ur/35 bg-[var(--ur-soft)] px-[18px] py-3.5 text-[13px] leading-[1.6] text-muted-foreground">
          <TriangleAlert className="text-rarity-ur" />
          <AlertTitle className="font-medium text-rarity-ur">
            UR 沒有任何多餘可換出
          </AlertTitle>
          <AlertDescription className="text-[13px] leading-[1.6] text-muted-foreground">
            還缺 {urNeed} 張。同階互換補不齊 UR，需用多張低階卡換 1 張 UR，或直接購入。其餘
            R / SR / SSR 的重複都足以換回所缺。
          </AlertDescription>
        </Alert>
      ) : null}
```

Note: the legacy callout inlined `⚠ **bold**, body`; Alert's `has-[>svg]` grid gives the `TriangleAlert` its own column with the title/description stacked beside it — a minor, intentional layout refinement within the editorial style.

- [ ] **Step 2: Migrate the pending card + table**

Add the Card + Table imports:

```tsx
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
```

Replace the `PendingCard` return JSX with:

```tsx
  return (
    <Card className="mt-3 gap-0 rounded-[10px] border border-border bg-card px-3.5 py-3 ring-0">
      <div className="mb-1.5 text-xs text-[var(--text-tertiary)]">
        {p.reservedAt}
      </div>
      <Table>
        <TableHeader>
          <TableRow className="border-0 hover:bg-transparent">
            <TableHead className="h-auto px-2 py-1 text-left">稀有度</TableHead>
            <TableHead className="h-auto px-2 py-1 text-left">給出</TableHead>
            <TableHead className="h-auto px-2 py-1 text-left">換入</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row, i) => (
            <TableRow
              key={`${row.rarity}-${i}`}
              className="border-0 hover:bg-transparent"
            >
              <TableCell className="px-2 py-1">
                <MissChip ri={RARITIES.indexOf(row.rarity)} label={row.rarity} />
              </TableCell>
              <TableCell className="px-2 py-1 text-left text-foreground">
                {row.give ?? "—"}
              </TableCell>
              <TableCell className="px-2 py-1 text-left text-foreground">
                {row.receive ?? "—"}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  );
```

Then change the pending wrapper `<section className="pending-list">` to `<section className="mt-6">` and keep the `<h3 className="trade-panel-title">暫定交換列表</h3>` for now — it is re-handled in Task 6 (or convert it here to `<h3 className={PANEL_TITLE}>` and import `PANEL_TITLE`; either is fine, keep one consistent choice).

The legacy `td/th` global rules (centered, mono) are overridden by the shadcn `Table` primitive's own cell styling; the explicit `text-left` + padding above restores the legacy pending-table look (left-aligned, 14px, 4px/8px padding).

- [ ] **Step 3: Run the pending tests (must stay green)**

Run: `npm run test:client -- views.test.tsx -t "pending"`
Expected: PASS — `暫定交換列表`, date, and card names still found.

- [ ] **Step 4: Typecheck + build**

Run: `npm run typecheck && npm run build`
Expected: both succeed.

- [ ] **Step 5: Lint + full test + commit**

```bash
lineguard src/client/views/Trade.tsx
npx biome check --write src/client/views/Trade.tsx
npm test
git add src/client/views/Trade.tsx
git commit -m "feat: migrate Trade UR warning to Alert and pending list to Table/Card"
```

---

### Task 6: Trade panels + series list → Panel / Tailwind

**Files:**
- Modify: `src/client/views/Trade.tsx`

**Interfaces:**
- Consumes: `Panel`, `PANEL_TITLE` from `@/views/shared` (Task 2).
- This retires the remaining `.trade-grid`, `.trade-panel`, `.trade-panel-title*`, `.trade-rgroup`, `.trade-rhead`, `.trade-rcount`, `.trade-series-*`, `.trade-names`, `.trade-name`, `.trade-x` markup in Trade.

- [ ] **Step 1: Migrate the two main panels to `Panel`**

Add to the imports from `./shared`:

```tsx
import { MissChip, Panel, PANEL_TITLE } from "./shared";
```

Replace the `<div className="trade-grid">` wrapper + its two `<section className="trade-panel">` children with:

```tsx
      <div className="grid grid-cols-2 gap-5 max-sm:grid-cols-1 max-sm:gap-4">
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

- [ ] **Step 2: Migrate the grouped series list (`groupedList`)**

Rewrite the `groupedList` JSX (the rarity-group → series-row structure) to Tailwind. The rarity-head color uses the same `text-rarity-*` map; `RARITY_KEYS[ri]` drives it. Replace the returned markup with:

```tsx
        <div className="mb-[18px] last:mb-0" key={RARITIES[ri]}>
          <div
            className={cn(
              "mb-2 font-mono text-xs font-medium tracking-[0.08em]",
              ["text-rarity-r", "text-rarity-sr", "text-rarity-ssr", "text-rarity-ur"][ri],
            )}
          >
            {RARITIES[ri]}
            <span className="ml-1 font-normal text-[var(--text-tertiary)]">
              {headCount}
            </span>
          </div>
          {m.series.map((sname, si) => {
            const sitems = ritems.filter((x) => x.si === si);
            if (sitems.length === 0) return null;
            return (
              <div
                className="grid grid-cols-[88px_1fr] items-start gap-2.5 py-[5px] [&+&]:border-t-[0.5px] [&+&]:border-[var(--border-tertiary)] max-sm:grid-cols-[72px_1fr] max-sm:gap-2"
                key={sname}
              >
                <span className="pt-0.5 font-accent text-[11px] italic uppercase tracking-[0.1em] text-[var(--text-tertiary)] max-sm:text-[10px]">
                  {sname}
                </span>
                <span className="flex flex-wrap gap-x-2.5 gap-y-[5px]">
                  {sitems.map((x) => (
                    <span
                      className="whitespace-nowrap text-[13px] text-foreground max-sm:text-xs"
                      key={m.characters[x.ci]}
                    >
                      {m.characters[x.ci]}
                      {kind === "surplus" ? (
                        <span className="ml-0.5 font-mono text-[10px] text-primary">
                          ×{x.spare}
                        </span>
                      ) : null}
                    </span>
                  ))}
                </span>
              </div>
            );
          })}
        </div>
```

Note the `[&+&]:border-t-[0.5px]` arbitrary variant reproduces the legacy `.trade-series-row + .trade-series-row { border-top }` sibling rule.

- [ ] **Step 3: Migrate `panelBody`'s empty state**

In `panelBody`, replace `<div className="trade-empty">…</div>` with:

```tsx
      return (
        <div className="px-0.5 py-3 text-[13px] tracking-[0.04em] text-[var(--text-tertiary)]">
          {kind === "surplus"
            ? `目前沒有多餘的 ${rname}卡可換出。`
            : `${rname}已全部收集 ✓`}
        </div>
      );
```

(`trade-empty` is retained in CSS for admin views, but Trade no longer references the class.)

If you kept `<h3 className="trade-panel-title">暫定交換列表</h3>` in Task 5, change it now to `<h3 className={PANEL_TITLE}>暫定交換列表</h3>`.

- [ ] **Step 4: Run all client tests**

Run: `npm run test:client -- views.test.tsx`
Expected: PASS — pending overlay, copy buttons, rarity filter all green.

- [ ] **Step 5: Typecheck + build + visual parity check**

Run: `npm run typecheck && npm run build`
Then start the preview and eyeball every Trade state:

```bash
npx wrangler dev --port 8788
```
Verify against the legacy look: summary toggle (all + each rarity, active + shortfall), UR warning, copy buttons (hover, disabled, copied check), both panels' grouped lists (rarity heads, series rows, ×N surplus marks), and the pending table. No `.trade-*` class should remain in Trade except `view`/`view-trade` and (optionally) the retained `暫定交換列表` heading handled above.

Run: `grep -nE "trade-(grid|panel|rgroup|rhead|rcount|series|names|name|x|summary|sum|warning|copy)" src/client/views/Trade.tsx`
Expected: no output (all migrated).

- [ ] **Step 6: Lint + full test + commit**

```bash
lineguard src/client/views/Trade.tsx
npx biome check --write src/client/views/Trade.tsx
npm test
git add src/client/views/Trade.tsx
git commit -m "feat: migrate Trade panels and series list to Panel + Tailwind"
```

---

### Task 7: Market board → shared Panel + Tailwind

**Files:**
- Modify: `src/client/views/Market.tsx`

**Interfaces:**
- Consumes: `Panel` from `./shared` (Task 2); existing `MissChip`.
- Regression-guarded by `describe("MarketBoard")` (loading `載入中…`, empty `目前沒有上架中的卡片。`, listing details, error). Keep those texts and the `section.view view-market` wrapper.

- [ ] **Step 1: Migrate the panel + rows**

In `src/client/views/Market.tsx`:

1. Update imports:

```tsx
import { MissChip, Panel } from "./shared";
```

2. Replace `ListingRow`'s `<div className="market-row">` body with:

```tsx
  return (
    <div className="flex flex-wrap items-center gap-2.5 border-b-[0.5px] border-border py-[9px] last:border-b-0">
      <MissChip ri={ri} label={item.rarity} />
      <span className="text-[13px] tracking-[0.02em] text-muted-foreground">
        {item.series} · {item.character}
      </span>
      <span className="ml-auto font-mono text-xs text-foreground">{detail}</span>
      {item.note ? (
        <span className="basis-full text-xs tracking-[0.02em] text-[var(--text-tertiary)]">
          {item.note}
        </span>
      ) : null}
    </div>
  );
```

3. Replace `Panel` (the local one) with the shared component. Rename the local `Panel` function to use the shared one — delete the local `function Panel({ title, items })` and inline it at the call sites, or keep a thin wrapper:

```tsx
function ListingPanel({ title, items }: { title: string; items: MarketListing[] }) {
  return (
    <Panel title={title} sub={`${items.length} 張`}>
      {items.map((item) => (
        <ListingRow key={item.cardId} item={item} />
      ))}
    </Panel>
  );
}
```

Update the two panel constructions in `MarketBoard` to use `<ListingPanel … />` (replacing `<Panel key="sale" title="待售" items={forSale} />` etc.).

4. Replace the `trade-grid` / `trade-grid-single` wrapper:

```tsx
      <div
        className={cn(
          "grid grid-cols-2 gap-5 max-sm:grid-cols-1 max-sm:gap-4",
          panels.length === 1 && "max-w-[520px] grid-cols-1",
        )}
      >
        {panels}
      </div>
```

Add `import { cn } from "@/lib/utils";`.

5. Replace the loading + empty + error `<div>`s:
   - loading: `<div className="py-12 text-center font-accent text-base italic tracking-[0.1em] text-[var(--text-tertiary)]">載入中…</div>` (mirrors legacy `.state-msg`; Market no longer uses the `state-msg` class, which is retained for admin).
   - empty + error: `<div className="px-0.5 py-3 text-[13px] tracking-[0.04em] text-[var(--text-tertiary)]">…</div>` (mirrors legacy `.trade-empty`).

   Keep the exact strings: `載入中…`, `目前沒有上架中的卡片。`, and `無法載入交易資料：{error}`.

- [ ] **Step 2: Run the Market tests (must stay green)**

Run: `npm run test:client -- views.test.tsx -t "MarketBoard"`
Expected: PASS — loading, empty, listings (待售/待換/1200 元/價格面議/想換/開放出價/note), error all green.

- [ ] **Step 3: Typecheck + build + visual parity check**

Run: `npm run typecheck && npm run build`
Then eyeball Market in the preview: dual-panel (sale + trade), single-panel (narrower, max 520px), empty, error. Confirm:

Run: `grep -nE "trade-|market-|state-msg|pending-" src/client/views/Market.tsx`
Expected: no output.

- [ ] **Step 4: Lint + full test + commit**

```bash
lineguard src/client/views/Market.tsx
npx biome check --write src/client/views/Market.tsx
npm test
git add src/client/views/Market.tsx
git commit -m "feat: migrate Market board to shared Panel + Tailwind"
```

---

### Task 8: Remove dead legacy CSS (Trade/Market-exclusive)

**Files:**
- Modify: `src/client/index.css`

**Interfaces:**
- Deletes only blocks that are now referenced by zero `.tsx` files. **Keeps `trade-empty` and `state-msg`** — `src/client/admin/{Openings,ManageCards,PendingTrades,History}.tsx` still use them (Phase 4).

- [ ] **Step 1: Re-verify the deletion set is dead**

For each class, confirm zero references outside `index.css`:

```bash
for c in trade-grid trade-grid-single trade-panel trade-panel-title trade-panel-sub trade-panel-titletext trade-copy-btn trade-summary trade-sum-card trade-sum-rarity trade-sum-nums trade-warning trade-rgroup trade-rhead trade-rcount trade-series-row trade-series-label trade-names trade-name trade-x ts-all ts-r ts-sr ts-ssr ts-ur ts-need ts-spare ts-sep market-row market-where market-meta market-note pending-list pending-card pending-date pending-table; do
  hits=$(grep -rl "$c" src --include=*.tsx | grep -v index.css)
  [ -n "$hits" ] && echo "STILL USED: $c -> $hits"
done
echo "done"
```
Expected: only `done` (no `STILL USED` lines). If any class is still used, do not delete it; leave it and note it.

- [ ] **Step 2: Verify the keep-set is still needed**

```bash
grep -rl "trade-empty\|state-msg" src/client/admin
```
Expected: lists the 4 admin files → these two classes stay.

- [ ] **Step 3: Delete the dead blocks**

In `src/client/index.css`, remove the rule blocks for every class confirmed dead in Step 1 — the contiguous `.trade-*`, `.ts-*`, `.market-*`, `.pending-*` definitions in the `@layer legacy` section (roughly the original lines 641–893 region, excluding `.trade-empty` at ~679–684), **and** their `@media (max-width: 540px)` overrides (the `.trade-grid`, `.trade-summary`, `.trade-sum-*`, `.trade-panel`, `.trade-series-*`, `.trade-name`, `.ts-sep` entries in the responsive block ~942–975). Keep `.trade-empty` and `.state-msg` and update the `.state-msg` breadcrumb comment to drop the "Market → Phase 3b" note (Market is migrated; admin remains).

- [ ] **Step 4: Build + full test (CSS still compiles, nothing visually regressed)**

Run: `npm run build && npm test`
Expected: build succeeds, all tests green.

Run: `grep -nE "\.(trade-(grid|panel|summary|sum|warning|rgroup|rhead|rcount|series|names|name|x|copy)|ts-|market-|pending-)" src/client/index.css`
Expected: no output (the only surviving `trade-` rule is `.trade-empty`).

- [ ] **Step 5: Visual smoke + commit**

Eyeball Trade + Market once more in the preview (the deleted CSS was dead, but confirm nothing shifted). Then:

```bash
lineguard src/client/index.css
npx biome check --write src/client/index.css
npm test
git add src/client/index.css
git commit -m "refactor: drop legacy trade/market CSS superseded by shadcn"
```

---

## Finishing the branch

After Task 8, use **superpowers:finishing-a-development-branch**: verify `npm test` green, then push and open the PR (`feat/shadcn-phase3b`). PR body ends with:
`🤖 Generated with [Claude Code](https://claude.com/claude-code)`

Suggested PR summary: the component-mapping table from the design, the "zero new npm deps" note, and the ToggleGroup-replaces-hand-rolled-active-state a11y win. After merge, optionally drive Copilot review via `/pr-workflow:copilot-iterate`.

## Self-Review (completed by author)

- **Spec coverage:** every legacy class in Trade (25) + Market (10) maps to a task — summary→T4, warning+pending→T5, panels+series+empty→T6, copy→T3, market rows/panels/states→T7, CSS removal→T8; primitives+Panel scaffolding in T1–T2. ✔
- **Placeholder scan:** all code steps carry exact class strings and commands; no TBD/“handle edge cases”. ✔
- **Type consistency:** `Panel({title,sub,children,className})` signature is identical in T2 (definition), T6, T7 (consumers); `onValueChange` returns `Filter`; `summaryCards[].cls` is a Tailwind string consumed in T4. ✔
- **Regression strategy:** existing `views.test.tsx` behavioral tests guard every reskin; new tests only for genuinely new structure (Alert/ToggleGroup/Panel render, ToggleGroup filter scoping). ✔
