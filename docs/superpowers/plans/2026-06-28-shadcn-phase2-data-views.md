# shadcn/ui Refactor — Phase 2 (Public Data Views) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **REQUIRED at execution time:** Invoke the `shadcn` skill before Tasks 2 and 5 to confirm the current `add table` / `add skeleton` commands and the generated component APIs (radix base). Read every generated component before wiring it.

**Goal:** Migrate the public data views — the By-Character / By-Series / By-Rarity tables, the StatsBar, and the loading/error states — to shadcn `Table` + Tailwind, and fix the root cascade-layer conflict so shadcn/Tailwind reliably win over legacy element selectors.

**Architecture:** Builds on Phases 0–1. First wrap the remaining legacy CSS in an `@layer legacy` placed below Tailwind's `utilities` layer, so generic legacy element rules (`table`/`th`/`td`) no longer override shadcn components — without deleting them (Grid/Trade/Glance still need them until Phase 3). Then migrate the By-\* tables to shadcn `Table` with rarity-colored cells, Tailwind-ize StatsBar, and replace the loading state with `Skeleton`.

**Tech Stack:** Tailwind v4 (cascade layers), shadcn/ui `Table` + `Skeleton` (radix base), React 18, Vitest 4, @testing-library/react.

## Global Constraints

- **Dark-only**; semantic color utilities only (`text-rarity-r|sr|ssr|ur`, `text-muted-foreground`, `border-border`, `bg-card`). Never raw hex.
- **Brand fonts via utilities:** `font-mono` (JetBrains Mono — the table numbers), `font-serif`, `font-accent`, `font-sans`.
- **`cn()` for conditional classes.**
- **Do NOT touch:** `collection.ts`, `api.ts`, `src/shared/**`, `src/worker/**`, and the views deferred to Phase 3 (Wishlist, Glance, Grid, Trade, Market) — they keep their legacy CSS.
- **Shared legacy CSS stays:** generic `table`/`th`/`td` and the `.card*` rules are shared with Phase-3 views — keep them (the `@layer` makes shadcn win without deletion).
- **Per commit:** `npm run lint` · `npm run typecheck` · `npm test` · `npm run build` green; then `lineguard`.
- **Commits:** Conventional Commits ending with `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
- **Visual check:** restart the dev server fresh before each visual smoke check (HMR goes stale across large CSS edits); hard-refresh the browser.

---

## File Structure

| File | Responsibility | Action |
| --- | --- | --- |
| `src/client/index.css` | wrap legacy in `@layer legacy`; delete By-\*-only table CSS, STATS, LOADING/ERROR | Modify |
| `src/client/components/ui/table.tsx` | Table primitive | Create (shadcn CLI) |
| `src/client/components/ui/skeleton.tsx` | Skeleton primitive | Create (shadcn CLI) |
| `src/client/views/tables.tsx` | By-Char/Series/Rarity → shadcn Table | Modify |
| `src/client/views/shared.tsx` | `NumCell` → shadcn `TableCell` + rarity color | Modify |
| `src/client/views/StatsBar.tsx` | stats → Tailwind | Modify |
| `src/client/PublicViewer.tsx` | loading → Skeleton, error → Tailwind | Modify |
| `test/client/views.test.tsx` | table view tests | Verify / update selectors |
| `test/client/app.test.tsx` | stats/loading/error tests | Verify |

---

## Task 1: Wrap legacy CSS in `@layer legacy` (cascade root-fix)

The unlayered legacy rules outrank Tailwind's `@layer utilities` (Phase 1 hit this with `* {}`). Generic `table`/`th`/`td` would override shadcn `Table` next. Fix it once: put all legacy rules in an `@layer legacy` ordered **after** `base` (so legacy still beats preflight) and **before** `utilities` (so Tailwind/shadcn win).

**Files:** Modify `src/client/index.css`

- [ ] **Step 1: Declare the layer order**

In `src/client/index.css`, immediately after the `@import` lines (before the `:root` block), add:
```css
/* Legacy bespoke CSS lives in its own layer below `utilities`, so Tailwind
   and shadcn utilities always win, while legacy still beats preflight (base). */
@layer theme, base, components, legacy, utilities;
```

- [ ] **Step 2: Open the legacy layer before the first legacy rule**

The `:root`, `@theme inline`, and the shared `@keyframes rise` stay OUTSIDE any layer (theme tokens + global keyframes). Insert `@layer legacy {` on its own line immediately before the first bespoke rule — the `html {` rule (just after the relocated `@keyframes rise` block).

- [ ] **Step 3: Close the legacy layer at end of file**

Append `}` as the last line of `src/client/index.css`.

- [ ] **Step 4: Format (re-indents the wrapped block — expected)**

Run `npm run format`. Biome re-indents the now-nested legacy rules by two spaces. This is a large but purely-whitespace diff — that is why this is its own commit.

- [ ] **Step 5: Build + full test**

Run `npm run build && npm test`. Expected: build exits 0; all tests PASS.

- [ ] **Step 6: Visual smoke check — ALL views unchanged**

Restart the dev server (`lsof -ti:5173 | xargs kill; npm run dev`), hard-refresh `/`. Click through every public tab (角色/系列/稀有度/缺卡/速覽/格表/交換/交易看板) and open `/admin`. Confirm **nothing** changed: legacy views (tables, Grid, Wishlist, Glance, Trade) still styled, Phase-1 shell still correct. (Legacy-in-a-layer must render identically to legacy-unlayered for views that use legacy classes.)

- [ ] **Step 7: Commit**

```bash
lineguard src/client/index.css
git add src/client/index.css
git commit -m "$(cat <<'EOF'
refactor: move legacy CSS into @layer legacy (below utilities)

Wrap all bespoke rules in @layer legacy, ordered after base and before
utilities, so Tailwind/shadcn utilities reliably win over generic legacy
element selectors (table/th/td) without deleting rules still used by
Phase-3 views. Pure-whitespace re-indent; no visual change.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Add the shadcn Table primitive

**Files:** Create `src/client/components/ui/table.tsx`; Test `test/client/components/ui.test.tsx` (extend)

**Interfaces:** Produces `Table`, `TableHeader`, `TableBody`, `TableRow`, `TableHead`, `TableCell`, `TableFooter` from `@/components/ui/table`. Consumed by Task 3.

- [ ] **Step 1: Generate via CLI** — `npx shadcn@latest add table --yes` (decline index.css overwrite). Read the file; confirm exports and that it imports `@/lib/utils`. Then `npm run format`.

- [ ] **Step 2: Add a render test**

Append to `test/client/components/ui.test.tsx`:
```tsx
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

describe("Table", () => {
  it("renders headers and cells", () => {
    render(
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>系列</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow>
            <TableCell>NEW YEAR</TableCell>
          </TableRow>
        </TableBody>
      </Table>,
    );
    expect(screen.getByText("系列")).toBeInTheDocument();
    expect(screen.getByText("NEW YEAR")).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run** — `npx vitest run --config vitest.client.config.ts test/client/components/ui.test.tsx`; expected PASS.

- [ ] **Step 4: Commit**

```bash
lineguard src/client/components/ui/table.tsx test/client/components/ui.test.tsx
git add src/client/components/ui/table.tsx test/client/components/ui.test.tsx
git commit -m "$(cat <<'EOF'
feat: add shadcn Table primitive (radix base)

Generate Table into @/components/ui for the data-view migration; render test
added. Not yet wired into pages.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Migrate the By-Character / By-Series / By-Rarity tables

Replace the bespoke `<table>` markup in `tables.tsx` with shadcn `Table`, and `NumCell` with a shadcn `TableCell` colored by rarity. Keep the `.card` wrapper (legacy, shared with Wishlist/Phase 3). Delete the By-\*-only table cell CSS (confirmed unused elsewhere).

**Files:** Modify `src/client/views/tables.tsx`, `src/client/views/shared.tsx`, `src/client/index.css`; Test `test/client/views.test.tsx`

**Interfaces:**
- Consumes: `Table*` (Task 2); `RARITY_KEYS`/`RARITIES`/`getN`/`exists`/`sumRow` (unchanged from `collection.ts`).
- Produces: `NumCell({ n, ri })` returns a `TableCell` (rarity-colored number, or a dim `·` when zero).

- [ ] **Step 1: Rewrite `NumCell` (and keep `MissChip` as-is) in `shared.tsx`**

Replace `NumCell` in `src/client/views/shared.tsx`:
```tsx
import { RARITY_KEYS } from "../collection";
import { cn } from "@/lib/utils";
import { TableCell } from "@/components/ui/table";

const RARITY_TEXT = [
  "text-rarity-r",
  "text-rarity-sr",
  "text-rarity-ssr",
  "text-rarity-ur",
] as const;

export function NumCell({ n, ri }: { n: number; ri: number }) {
  if (n === 0) {
    return (
      <TableCell className="text-center font-mono text-muted-foreground/40">
        ·
      </TableCell>
    );
  }
  return (
    <TableCell className={cn("text-center font-mono", RARITY_TEXT[ri])}>
      {n}
    </TableCell>
  );
}
```
(Keep the existing `MissChip` export unchanged — Wishlist/Phase 3 uses it.)

- [ ] **Step 2: Rewrite the three table views in `tables.tsx`**

For each of `ByCharacter` / `BySeries` / `ByRarity`, replace the `<table>…</table>` with the shadcn structure. Pattern (ByCharacter shown; apply the same shape to the other two, preserving their existing data logic and column sets):
```tsx
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
// ...keep existing imports (Matrix, RARITIES, exists, getN, sumRow, NumCell)

// inside the .map, replacing <table>...</table>:
<Table>
  <TableHeader>
    <TableRow>
      <TableHead className="text-left">系列</TableHead>
      <TableHead className="text-center text-rarity-r">R</TableHead>
      <TableHead className="text-center text-rarity-sr">SR</TableHead>
      <TableHead className="text-center text-rarity-ssr">SSR</TableHead>
      <TableHead className="text-center text-rarity-ur">UR</TableHead>
      <TableHead className="text-right">合計</TableHead>
    </TableRow>
  </TableHeader>
  <TableBody>
    {seriesIdxs.map((si) => {
      const rowTotal = RARITIES.reduce((s, _r, ri) => s + getN(m, si, ci, ri), 0);
      return (
        <TableRow key={m.series[si]}>
          <TableCell className="text-left font-sans">{m.series[si]}</TableCell>
          {RARITIES.map((rarity, ri) => (
            <NumCell key={rarity} n={getN(m, si, ci, ri)} ri={ri} />
          ))}
          <TableCell
            className={cn(
              "text-right font-mono",
              rowTotal === 0 && "text-muted-foreground/40",
            )}
          >
            {rowTotal}
          </TableCell>
        </TableRow>
      );
    })}
    <TableRow className="border-t border-border/60">
      <TableCell className="text-left font-sans text-muted-foreground">小計</TableCell>
      {RARITIES.map((rarity, ri) => (
        <NumCell key={rarity} n={totalsByRarity[ri]} ri={ri} />
      ))}
      <TableCell className="text-right font-mono">{charTotal}</TableCell>
    </TableRow>
  </TableBody>
</Table>
```
For `ByRarity`, the non-existent cells (`exists` false) keep a dim em-dash: `<TableCell className="text-center text-muted-foreground/40">—</TableCell>`. Add `import { cn } from "@/lib/utils";` to `tables.tsx`.

- [ ] **Step 3: Delete the By-\*-only table CSS**

In `src/client/index.css` (now inside `@layer legacy`), delete the class-scoped rules `th.col-name`, `th.col-total`, `th.th-r`, `th.th-sr`, `th.th-ssr`, `th.th-ur`, `td.col-name`, `.subtotal`, `td.na`/`.na`, `.zero`, `.num-r`/`.num-sr`/`.num-ssr`/`.num-ur` (and any `tr.subtotal`). **Keep** the bare `table {}`, `th {}`, `td {}` rules (shared with Grid/Trade/Glance) and the whole `.card*` block.

- [ ] **Step 4: Update tests** — `npx vitest run --config vitest.client.config.ts test/client/views.test.tsx`. The By-\* tables now render `role="table"`/`role="cell"`. Update any selector that queried `.col-total`/`td` directly to text or `getByRole("cell", …)`. Card titles/series names/numbers are unchanged text.

- [ ] **Step 5: Visual smoke check** — restart dev server; `/` 角色/系列/稀有度 tabs: tables render inside the cards, rarity-colored headers (R grey / SR gold / SSR pink / UR red), mono numbers colored by rarity, dim `·` for zeros, right-aligned totals, 小計 subtotal row.

- [ ] **Step 6: Full gate + commit**

```bash
lineguard src/client/views/tables.tsx src/client/views/shared.tsx src/client/index.css
git add src/client/views/tables.tsx src/client/views/shared.tsx src/client/index.css test/client/views.test.tsx
git commit -m "$(cat <<'EOF'
feat: migrate By-Character/Series/Rarity tables to shadcn Table

Replace bespoke <table> markup with shadcn Table; NumCell renders a rarity-
colored TableCell. Delete the By-*-only cell CSS (col-name/th-*/col-total/
subtotal/na/zero/num-*); keep the shared generic table/th/td and .card. The
@layer legacy ordering lets the shadcn Table win over generic table{}.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Migrate StatsBar to Tailwind

**Files:** Modify `src/client/views/StatsBar.tsx`, `src/client/index.css` (delete STATS block + its `@media` rules)

**Interfaces:** Consumes `grandTotalByRarity`/`sumRow` (unchanged). Produces the same 5-cell stats row via Tailwind.

- [ ] **Step 1: Rewrite `StatsBar.tsx`**

```tsx
import { type Matrix, grandTotalByRarity, sumRow } from "../collection";
import { cn } from "@/lib/utils";

export function StatsBar({ m }: { m: Matrix }) {
  const byRarity = grandTotalByRarity(m);
  const cells = [
    { value: sumRow(byRarity), label: "張總計", cls: "text-foreground" },
    { value: byRarity[0], label: "R", cls: "text-foreground" },
    { value: byRarity[1], label: "SR", cls: "text-rarity-sr" },
    { value: byRarity[2], label: "SSR", cls: "text-rarity-ssr" },
    { value: byRarity[3], label: "UR", cls: "text-rarity-ur" },
  ];
  return (
    <div className="mt-14 grid grid-cols-5 border-y border-border">
      {cells.map((c) => (
        <div
          key={c.label}
          className="border-r border-border px-2 py-[22px] text-center last:border-r-0"
        >
          <div className={cn("font-mono text-[28px] leading-none", c.cls)}>
            {c.value}
          </div>
          <div className="mt-2 text-[10px] uppercase tracking-[0.25em] text-muted-foreground max-sm:text-[9px] max-sm:tracking-[0.15em]">
            {c.label}
          </div>
        </div>
      ))}
    </div>
  );
}
```
(`max-sm:text-[22px]` on the value to match the old responsive rule — add it to the value div: `text-[28px] max-sm:text-[22px]`.)

- [ ] **Step 2: Delete the STATS CSS** — in `index.css`, delete the STATS block (`.stats`, `.stat`, `.stat:last-child`, `.stat-value`, `.stat-value.is-*`, `.stat-label`) and the `.stat-value`/`.stat-label` rules inside `@media (max-width:540px)`.

- [ ] **Step 3: Test + visual** — `npx vitest run --config vitest.client.config.ts test/client/app.test.tsx` (the "renders the hero and stats" test asserts `張總計` + the total `4`; text unchanged → PASS). Restart dev server; confirm the stats row (5 columns, mono numbers, SR/SSR/UR colored, dividers) matches.

- [ ] **Step 4: Full gate + commit**

```bash
lineguard src/client/views/StatsBar.tsx src/client/index.css
git add src/client/views/StatsBar.tsx src/client/index.css
git commit -m "$(cat <<'EOF'
feat: migrate StatsBar to Tailwind

Replace .stats/.stat/.stat-value/.stat-label CSS with a Tailwind grid using
font-mono + rarity color utilities and the bordered 5-column layout. Same look.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Replace the loading/error states (Skeleton + Tailwind)

**Files:** Create `src/client/components/ui/skeleton.tsx`; Modify `src/client/PublicViewer.tsx`, `src/client/index.css` (delete `.state-msg`)

- [ ] **Step 1: Add Skeleton** — `npx shadcn@latest add skeleton --yes`; read it; `npm run format`.

- [ ] **Step 2: Rewrite the loading/error branch in `PublicViewer.tsx`**

Replace:
```tsx
        {error ? (
          <div className="state-msg">無法載入資料：{error}</div>
        ) : matrix ? (
          <ActiveView … />
        ) : (
          <div className="state-msg">載入中…</div>
        )}
```
with:
```tsx
        {error ? (
          <p className="py-12 text-center font-accent italic tracking-[0.1em] text-muted-foreground">
            無法載入資料：{error}
          </p>
        ) : matrix ? (
          <ActiveView … />
        ) : (
          <div className="flex flex-col gap-3 py-12">
            <Skeleton className="mx-auto h-6 w-40" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        )}
```
Add `import { Skeleton } from "@/components/ui/skeleton";` to `PublicViewer.tsx`. (Keep the existing `ActiveView …` props.)

- [ ] **Step 3: Delete `.state-msg`** — in `index.css`, delete the LOADING/ERROR block.

- [ ] **Step 4: Test** — `npx vitest run --config vitest.client.config.ts test/client/app.test.tsx`. The error test asserts `/無法載入資料/` (still present in the `<p>`) → PASS. Loading is now a Skeleton (no "載入中…" text) — if a test asserted that text, update it to assert a skeleton (`document.querySelector('[data-slot="skeleton"]')`) or remove the assertion.

- [ ] **Step 5: Visual** — restart dev server; throttle/observe the brief loading skeleton, and force an error (stop worker) to see the italic error line.

- [ ] **Step 6: Full gate + commit**

```bash
lineguard src/client/components/ui/skeleton.tsx src/client/PublicViewer.tsx src/client/index.css
git add src/client/components/ui/skeleton.tsx src/client/PublicViewer.tsx src/client/index.css test/client/app.test.tsx
git commit -m "$(cat <<'EOF'
feat: loading → Skeleton, error → Tailwind (drop .state-msg)

Add shadcn Skeleton; the loading state shows skeleton bars and the error state
is a Tailwind italic line. Delete the .state-msg CSS.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Phase 2 acceptance gate + push

- [ ] **Step 1: Full suite** — `npm run lint && npm run typecheck && npm test && npm run build`; all exit 0.
- [ ] **Step 2: Cross-view visual check** — restart dev server; verify 角色/系列/稀有度 (shadcn tables), stats row, and loading/error, plus that the still-legacy views (缺卡/速覽/格表/交換/交易看板) are unchanged. Mobile width too.

Phase 2 acceptance checklist:
- [ ] Legacy CSS in `@layer legacy`; all legacy views visually unchanged.
- [ ] By-\* tables are shadcn `Table` (`role="table"`); rarity-colored headers + mono cells.
- [ ] StatsBar is Tailwind; loading is `Skeleton`; error is Tailwind.
- [ ] Generic `table`/`th`/`td` and `.card*` retained (Phase-3 views still use them).
- [ ] `npm test` green (worker + client).

- [ ] **Step 3: Push** — `git push` (updates PR #1).

## Self-Review

**1. Spec coverage (design §5.4 Phase 2):** tables → `Table` (Task 3); StatsBar (Task 4); loading/error → `Skeleton` (Task 5). The spec also named a rarity `Badge`; the By-\* tables use rarity-colored *text/cells* (no pill fits), so `Badge` is deferred to Phase 3 where `.miss-chip` (Wishlist) maps to it cleanly — noted here, not dropped. The `@layer` fix (Task 1) is added from the Phase-1 cascade learning. ✓

**2. Placeholder scan:** Table/Skeleton bodies are CLI-generated; all JSX/CSS edits show full code; CSS deletions name exact selectors. The `BySeries`/`ByRarity` rewrites say "same shape" but the full Table pattern + their existing data logic are both shown/preserved — not a "similar to Task N" hand-wave.

**3. Type consistency:** `NumCell({ n, ri })` signature unchanged (now returns `TableCell`). `Table*` imports match Task 2 exports. `RARITY_TEXT` indices align with `RARITY_KEYS`/`ri`. StatsBar consumes the same `collection.ts` helpers.

## Execution Handoff

Phase 2 of 5. Phases 3–5 each get their own just-in-time plan after this lands.
