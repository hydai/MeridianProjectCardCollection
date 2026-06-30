# shadcn Phase 3c — Glance + Grid Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate the two remaining public legacy-CSS views — `Glance.tsx` (matrix wishlist/collection) and `Grid.tsx` (checklist grid) — onto shadcn primitives + Tailwind tokens, completing Phase 3 (特化視圖) and leaving only `.view` / `.state-msg` / `.trade-empty` plus the base `table`/`th`/`td` rules in `@layer legacy`.

**Architecture:** Same incremental playbook as Phase 3a/3b. **No new primitives or npm deps** — reuse the already-installed `Toggle`, `ToggleGroup`, `Badge`. Three toggle kinds get the spec's "順手升級" (§5.3): the two single-select *mode* switches (Glance 願望/收集, Grid 打勾/數量) become `ToggleGroup type="single"` (radio semantics, like the Phase 3b Trade summary filter); the two multi-select *filters* (Grid rarity, Grid series) become individual shadcn `Toggle` components — which render a native `<button>` with `aria-pressed`, preserving the role + ARIA contract the 17 existing Grid filter tests assert. The Grid table is **special-case 1** (§5.3): keep the bespoke `<table>` (multi-row sticky headers, striped N/A cells, rarity-coloured column heads) and only Tailwind-ize it; its semantic class names (`grid-series-head`, `grid-rarity-head`, `gr-*`, `grid-series-start`, `grid-table`, `grid-progress`, `grid-filter`) stay as structural markers — we relocate their *styling* to Tailwind utilities and delete only the CSS *rules*. Finish by deleting the now-dead `.glance-*` / `.grid-*` / `.gc-*` / `.gr-*` / `.mode-*` / `.swatch` / `.sw-*` legacy CSS and its `max-width: 540px` overrides. All work on one `feat/shadcn-phase3c` branch → one PR.

**Tech Stack:** React 18, React Router 7, Vite 6, Tailwind v4 (`@tailwindcss/vite`), shadcn (radix base), `radix-ui` (Toggle/ToggleGroup/Badge), `lucide-react` (unused here), Biome, Vitest + Testing Library.

## Global Constraints

These apply to **every** task; each task's requirements implicitly include them.

- **Visual parity is the acceptance bar.** The migrated UI must match the legacy rendering pixel-for-pixel. Legacy CSS lives in `@layer legacy` (below `utilities`) so migrated utilities win during coexistence; do not change the visual result.
- **Preserve the `.view` wrapper.** Every view keeps `<section className="view view-glance">` / `view-grid` — `test/client/views.test.tsx` asserts the views render, and `.view` carries the `fadeView` entrance animation.
- **Preserve all visible text and accessible names.** Existing tests query by text (`Vol.1`, `稀有度`, `（未選擇任何系列）`, `（未選擇任何稀有度）`) and by `getByRole("button", { name: "NEW YEAR" | "UR" | … })` with `aria-pressed`. Reskins must keep these stable.
- **Preserve the Grid structural class markers.** The Grid is a kept-bespoke table; tests select on `.grid-filter`, `.grid-series-head`, `.grid-rarity-head`, `.grid-rarity-head.gr-ur`, `.grid-rarity-head.gr-sr`, `.grid-series-start`, `.grid-table`, `.grid-progress`. Keep these class **names** on the same elements; move their **styling** to Tailwind utility classes on the same `className`.
- **Zero new npm dependencies.** `Toggle`, `ToggleGroup`, `Badge` are already in `src/client/components/ui/`.
- **Semantic-token bridge already exists** (`src/client/index.css` `:root` + `@theme inline`). Reuse the mapping in the reference table below; do not add new tokens.
- **Mobile breakpoint is 540px.** `--breakpoint-sm: 540px` is pinned so `max-sm:` matches the legacy `@media (max-width: 540px)` chrome. Translate every responsive override to a `max-sm:` utility.
- **Before each commit:** run `lineguard` on changed files, then `npm test` (must be green), then `npx biome check .` (clean). A PreToolUse hook also auto-runs format/lint/test on `git commit`.
- **Conventional Commits**, one concern per commit. Commit trailer (repo style):
  `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`
- **Additive git only** — no force-push, no rebase inside the loop.

## Design-token reference (legacy CSS var → Tailwind utility)

Use this table everywhere instead of raw hex. Where no semantic token exists, use the raw var via an arbitrary value (matches the Phase 3a/3b precedent).

| Legacy var | Value | Tailwind utility |
|---|---|---|
| `--surface` | `#181613` | `bg-card` |
| `--surface-elevated` | `#1f1c18` | `bg-secondary` |
| `--border` | `#2a2520` | `border-border` (+ `border-[0.5px]` for the hairline) |
| `--border-strong` | `#3a342c` | `[border-color:var(--border-strong)]` or arbitrary-property border (see below) |
| `--bg-subtle` | `#141210` | `bg-[var(--bg-subtle)]` |
| `--text` | `#ede8df` | `text-foreground` |
| `--text-secondary` | `#a39e93` | `text-muted-foreground` |
| `--text-tertiary` | `#6a6660` | `text-[var(--text-tertiary)]` |
| `--text-quaternary` | `#46433e` | `text-[var(--text-quaternary)]` |
| `--primary` | `#c9a14a` | `text-primary` / `border-primary` / `bg-primary` |
| `--r-color`/`--sr-color`/`--ssr-color`/`--ur-color` | rarity hues | `text-rarity-r` / `text-rarity-sr` / `text-rarity-ssr` / `text-rarity-ur` |
| serif display | Noto Serif TC | `font-serif` |
| italic accent | Cormorant Garamond | `font-accent` (add `italic`) |
| mono | JetBrains Mono | `font-mono` |
| sans | IBM Plex Sans TC | `font-sans` |

**Recurring arbitrary patterns (copy verbatim):**

- Gold hairline on active toggle: `shadow-[inset_0_0_0_0.5px_rgba(201,161,74,0.25)]`
- `--border-strong` edge (unambiguous, avoids width/colour ambiguity): `[border-bottom:0.5px_solid_var(--border-strong)]`, `[border-right:0.5px_solid_var(--border-strong)]`, `[border-left:0.5px_solid_var(--border-strong)]`
- Grid "have" cell tint / hover: `bg-[rgba(201,161,74,0.16)]` → `group-hover/row:bg-[rgba(201,161,74,0.26)]`
- Grid "miss" cell hover: `group-hover/row:bg-[rgba(255,255,255,0.025)]`
- N/A stripes (cell, 4px): `[background-image:repeating-linear-gradient(45deg,transparent,transparent_4px,rgba(255,255,255,0.018)_4px,rgba(255,255,255,0.018)_8px)]`
- N/A stripes (legend swatch, 3px): `[background-image:repeating-linear-gradient(45deg,transparent,transparent_3px,rgba(255,255,255,0.018)_3px,rgba(255,255,255,0.018)_6px)]`
- `is-complete` row tint: `[&_td]:bg-[rgba(201,161,74,0.025)]` (applied conditionally on the `<tr>`)

## Shared toggle constants (added to `src/client/views/shared.tsx` in Task 1)

Both views' mode switches share one pill style; the Grid filters share one standalone-outlined style. Extract three constants so Glance + Grid stay DRY (mirrors the existing `CARD_SHELL` / `PANEL_*` / `EMPTY_MSG` constants in the same file).

```tsx
// Pill segmented toggle (Glance + Grid mode switch): rebuilds the legacy
// .mode-toggle / .mode-btn / .mode-btn.active pill on shadcn ToggleGroup. The
// active segment gets the elevated fill + gold text + gold hairline. We override
// BOTH the Toggle base's `data-[state=on]:bg-muted` and its `aria-pressed:bg-muted`
// (Radix Toggle sets both attributes when on; different variant prefixes so
// tailwind-merge can't dedupe them — list both, last-in-source wins).
export const MODE_TOGGLE =
  "inline-flex w-fit gap-0.5 rounded-full border-[0.5px] border-border p-0.5";
export const MODE_BTN =
  "h-auto rounded-full px-4 py-1.5 font-sans text-xs font-normal tracking-[0.06em] text-[var(--text-tertiary)] transition-colors hover:bg-transparent hover:text-muted-foreground data-[state=on]:bg-secondary data-[state=on]:text-primary data-[state=on]:shadow-[inset_0_0_0_0.5px_rgba(201,161,74,0.25)] aria-pressed:bg-secondary aria-pressed:text-primary";

// Standalone multi-select filter toggle (Grid rarity + series): the legacy
// `.grid-filter .mode-btn` — same pill chip but with its own 0.5px outline so the
// off state still reads as tappable. Rendered via shadcn <Toggle> (native button +
// aria-pressed), so the existing role/aria-pressed Grid tests stay green.
export const FILTER_TOGGLE =
  "h-auto rounded-full border-[0.5px] border-border px-3.5 py-1.5 font-sans text-xs font-normal tracking-[0.06em] text-[var(--text-tertiary)] transition-colors hover:bg-transparent hover:text-muted-foreground data-[state=on]:bg-secondary data-[state=on]:text-primary data-[state=on]:shadow-[inset_0_0_0_0.5px_rgba(201,161,74,0.25)] aria-pressed:bg-secondary aria-pressed:text-primary";
```

> Why `Toggle` (not `ToggleGroup type="multiple"`) for the filters: the 17 Grid filter tests assert `getByRole("button", { name }).toHaveAttribute("aria-pressed", …)`. Radix `Toggle` renders a native `<button>` (implicit `role="button"`) and sets `aria-pressed` from its `pressed` prop — an exact match. `ToggleGroup type="single"` items render `role="radio"` instead, which would break those queries; reserve it for the mode switches that have no such tests.

---

## Task 1: Glance mode switch → ToggleGroup + shared toggle constants

**Files:**
- Modify: `src/client/views/shared.tsx` (add `MODE_TOGGLE`, `MODE_BTN`, `FILTER_TOGGLE`)
- Modify: `src/client/views/Glance.tsx:91-123` (the `.glance-header` block)
- Test: `test/client/views.test.tsx` (new `describe("Glance mode toggle")`)

**Interfaces:**
- Consumes: `ToggleGroup`, `ToggleGroupItem` from `@/components/ui/toggle-group`.
- Produces: `MODE_TOGGLE`, `MODE_BTN`, `FILTER_TOGGLE` exported strings (consumed by Glance Task 1, Grid Task 3, Grid Task 4).

- [ ] **Step 1: Add the shared toggle constants to `shared.tsx`**

Append the three constants from the "Shared toggle constants" section above to `src/client/views/shared.tsx` (after `EMPTY_MSG`, before `export function Panel`). Keep the explanatory comments verbatim.

- [ ] **Step 2: Write the failing regression test**

The Glance mode switch is currently untested (only the smoke "renders all seven views" test touches Glance). Add behavioural coverage for the new `ToggleGroup`. In `test/client/views.test.tsx`, after the `describe("Trade pending overlay")` block (or anywhere top-level after the `m` fixture is built), add:

```tsx
describe("Glance mode toggle", () => {
  it("switches wishlist↔collection via the radio toggle", () => {
    render(<Glance m={m} />);
    const wish = screen.getByRole("radio", { name: "願望清單" });
    const coll = screen.getByRole("radio", { name: "收集清單" });
    expect(wish).toHaveAttribute("aria-checked", "true");
    // collection mode shows the "已收集 … 種 · 共 … 張" progress line
    expect(screen.queryByText(/已收集/)).toBeNull();
    fireEvent.click(coll);
    expect(coll).toHaveAttribute("aria-checked", "true");
    expect(screen.getByText(/已收集/)).toBeInTheDocument();
  });
});
```

`Glance` is already imported at the top of the file; `m` is the shared full-collection `Matrix` fixture. `render`, `screen`, `fireEvent` are already imported.

- [ ] **Step 3: Run the test — expect FAIL**

Run: `npx vitest run test/client/views.test.tsx -t "switches wishlist"`
Expected: FAIL — `Unable to find an accessible element with the role "radio"` (legacy `.mode-btn` are plain `<button>`s, no radio role).

- [ ] **Step 4: Migrate the Glance header to ToggleGroup**

In `src/client/views/Glance.tsx`: add to the imports
```tsx
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { MODE_BTN, MODE_TOGGLE, MissChip } from "./shared";
```
(merge the `MissChip` import that already exists from `./shared` into this line; remove the old standalone `MissChip` import). Replace the `.glance-header` block (lines 93-123) with:

```tsx
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2 px-1">
        <ToggleGroup
          type="single"
          value={mode}
          onValueChange={(v) => v && setMode(v as "wishlist" | "collection")}
          className={MODE_TOGGLE}
        >
          <ToggleGroupItem value="wishlist" className={MODE_BTN}>
            願望清單
          </ToggleGroupItem>
          <ToggleGroupItem value="collection" className={MODE_BTN}>
            收集清單
          </ToggleGroupItem>
        </ToggleGroup>
        <span className="font-mono text-xs tracking-[0.08em] text-[var(--text-tertiary)] [&_strong]:font-medium [&_strong]:text-foreground">
          {isWish ? (
            <>
              <strong>{collected}</strong> / {totalSlots} · {pct}% · 缺{" "}
              <strong>{totalMissing}</strong>
            </>
          ) : (
            <>
              已收集 <strong>{collected}</strong> / {totalSlots} 種 · 共{" "}
              <strong>{totalOwnedCards}</strong> 張
            </>
          )}
        </span>
      </div>
```

> `onValueChange={(v) => v && setMode(...)}` ignores the empty-string deselect that Radix single ToggleGroup emits when you click the active segment — the mode must never go blank (mirrors the Phase 3b Trade `(v || "all")` guard).

- [ ] **Step 5: Run the test — expect PASS**

Run: `npx vitest run test/client/views.test.tsx -t "switches wishlist"`
Expected: PASS. Then run the full client suite: `npx vitest run test/client/views.test.tsx` → all green (the smoke "renders all seven views" still passes).

- [ ] **Step 6: Lint + commit**

```bash
lineguard src/client/views/shared.tsx src/client/views/Glance.tsx test/client/views.test.tsx
npx biome check --write src/client/views/shared.tsx src/client/views/Glance.tsx test/client/views.test.tsx
npm test
git add src/client/views/shared.tsx src/client/views/Glance.tsx test/client/views.test.tsx
git commit -m "feat: migrate Glance mode switch to ToggleGroup"
```

---

## Task 2: Glance table + cells → Tailwind

**Files:**
- Modify: `src/client/views/Glance.tsx` (the `GlanceCell` component lines 8-51 + the `.glance-wrap`/`.glance-table` block lines 124-153)

**Interfaces:**
- Consumes: `Badge` from `@/components/ui/badge` (for the completion pill).
- Produces: nothing new; pure reskin. Guarded by the Task 1 toggle test + the smoke render test.

- [ ] **Step 1: Tailwind-ize the table wrapper, head, and body**

Replace the `.glance-wrap` block (lines 124-153) with:

```tsx
      <div className="overflow-hidden rounded-[4px] border-[0.5px] border-border bg-card">
        <table className="w-full table-fixed border-collapse text-[13px] max-sm:text-xs">
          <thead>
            <tr>
              <th className="w-[20%] border-b-[0.5px] border-border bg-secondary px-3 pt-3.5 pb-3 text-left font-sans text-[11px] font-normal tracking-[0.25em] text-foreground max-sm:w-[19%]">
                角色
              </th>
              {m.series.map((s) => (
                <th
                  key={s}
                  className="border-b-[0.5px] border-border bg-secondary px-3 pt-3.5 pb-3 text-center font-accent text-[11px] font-medium uppercase italic tracking-[0.18em] text-foreground max-sm:px-[7px] max-sm:py-2.5 max-sm:tracking-[0.12em] max-sm:text-[9px]"
                >
                  {s}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.charName}
                className={
                  row.isComplete
                    ? "[&_td]:bg-[rgba(201,161,74,0.025)] [&_td]:last:border-b-0"
                    : "[&_td]:last:border-b-0"
                }
              >
                <td className="border-b-[0.5px] border-border px-3 py-3 text-left align-middle font-sans text-sm text-foreground max-sm:px-[7px] max-sm:py-2.5 max-sm:text-[13px]">
                  {row.charName}
                  {row.isComplete ? (
                    <span className="ml-1.5 inline-block font-accent text-xs italic tracking-[0.1em] text-primary">
                      ✓
                    </span>
                  ) : null}
                </td>
                {row.cells.map((c, si) => (
                  <GlanceCell key={m.series[si]} cell={c} isWish={isWish} />
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
```

> The legacy `tbody tr:last-child td { border-bottom: none }` becomes `[&_td]:last:border-b-0` on the row. The `tr.is-complete td` gold tint becomes the conditional `[&_td]:bg-[rgba(201,161,74,0.025)]`. We drop the now-unused `is-complete`/`g-char` class names (no test selects them).

- [ ] **Step 2: Tailwind-ize the cell content (`GlanceCell`)**

In `GlanceCell` (lines 8-51) the body `<td>`s currently rely on `.glance-table tbody td` (centering/padding) which the new `<td>` cells above no longer provide for *these* inner `<td>`s — but note `GlanceCell` renders its own `<td>`. Give each `GlanceCell` `<td>` the same body-cell classes, and swap the two presentational spans:

Replace the `na` return:
```tsx
  if (cell.na) {
    return (
      <td className="border-b-[0.5px] border-border px-3 py-3 text-center align-middle max-sm:px-[7px] max-sm:py-2.5">
        <span className="select-none font-mono text-[13px] text-[var(--text-quaternary)] opacity-45">
          —
        </span>
      </td>
    );
  }
```

The "complete" badge (wishlist mode, nothing missing) becomes a gold `Badge`:
```tsx
    if (missing.length === 0) {
      return (
        <td className="border-b-[0.5px] border-border px-3 py-3 text-center align-middle max-sm:px-[7px] max-sm:py-2.5">
          <Badge
            variant="outline"
            className="h-auto gap-1 rounded-full border-[0.5px] border-primary/35 bg-primary/[0.08] px-2.5 py-[3px] text-[10px] font-normal tracking-[0.12em] text-primary"
          >
            ✓ 完成
          </Badge>
        </td>
      );
    }
```

Wrap the remaining three returns' `<td>`s (the two `MissChip` lists and the collection-mode `—`) with the same body-cell `className` shown above (text-center, border, padding). Import `Badge`:
```tsx
import { Badge } from "@/components/ui/badge";
```

> The `MissChip` itself is already a shadcn `Badge` (from Phase 3a, in `shared.tsx`) — unchanged here.

- [ ] **Step 2.5: Sanity-check the legacy CSS is no longer reached by Glance**

The Glance JSX now sets all its own styling via utilities; the `.glance-*` rules in `index.css` are still present but overridden (utilities are in a higher layer). Confirm no Glance element still depends on a legacy class for layout:

Run: `grep -nE "glance-|g-char|complete-mark|is-complete|mode-btn|mode-toggle" src/client/views/Glance.tsx`
Expected: no output (all legacy class names removed from the component).

- [ ] **Step 3: Build + test (visual parity)**

Run: `npm run build && npm test`
Expected: build succeeds; all tests green (smoke render + Task 1 toggle test).

Visual smoke: `npm run dev`, open the 速覽 (Glance) view, toggle 願望/收集 — header pill, progress line, table head (italic serie names), character rows, the gold "✓ 完成" pills, the `—` N/A marks, and the faint gold tint on complete rows must all match the pre-migration look.

- [ ] **Step 4: Lint + commit**

```bash
lineguard src/client/views/Glance.tsx
npx biome check --write src/client/views/Glance.tsx
npm test
git add src/client/views/Glance.tsx
git commit -m "feat: migrate Glance table and cells to Tailwind"
```

---

## Task 3: Grid header + mode switch → ToggleGroup + Tailwind

**Files:**
- Modify: `src/client/views/Grid.tsx:97-121` (the `.grid-header` block)
- Test: `test/client/views.test.tsx` (new `describe("Grid mode toggle")`)

**Interfaces:**
- Consumes: `ToggleGroup`, `ToggleGroupItem` from `@/components/ui/toggle-group`; `MODE_TOGGLE`, `MODE_BTN` from `./shared`.
- Produces: keeps the `.grid-progress` marker class (Grid rarity-filter denominator test selects `.grid-progress`).

- [ ] **Step 1: Write the failing regression test**

The Grid mode switch (打勾/數量) is untested. Add:

```tsx
describe("Grid mode toggle", () => {
  it("switches check↔count via the radio toggle", () => {
    render(<Grid m={m} />);
    const check = screen.getByRole("radio", { name: "打勾" });
    const count = screen.getByRole("radio", { name: "數量" });
    expect(check).toHaveAttribute("aria-checked", "true");
    fireEvent.click(count);
    expect(count).toHaveAttribute("aria-checked", "true");
    // count mode swaps the legend copy to the "持有張數" wording
    expect(screen.getByText(/持有張數/)).toBeInTheDocument();
  });
});
```

`Grid` and `m` are already in scope in this test file.

- [ ] **Step 2: Run the test — expect FAIL**

Run: `npx vitest run test/client/views.test.tsx -t "switches check"`
Expected: FAIL — no `radio` role (legacy `.mode-btn` buttons).

- [ ] **Step 3: Migrate the Grid header**

In `src/client/views/Grid.tsx` add imports:
```tsx
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { MODE_BTN, MODE_TOGGLE } from "./shared";
```
Replace the `.grid-header` block (lines 98-121) with:

```tsx
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2 px-1">
        <div className="flex flex-wrap items-center gap-3.5">
          <span className="font-serif text-[15px] font-medium tracking-[0.08em] text-foreground">
            收集格表
          </span>
          <ToggleGroup
            type="single"
            value={mode}
            onValueChange={(v) => v && setMode(v as "check" | "count")}
            className={MODE_TOGGLE}
          >
            <ToggleGroupItem value="check" className={MODE_BTN}>
              打勾
            </ToggleGroupItem>
            <ToggleGroupItem value="count" className={MODE_BTN}>
              數量
            </ToggleGroupItem>
          </ToggleGroup>
        </div>
        <span className="grid-progress font-mono text-xs tracking-[0.08em] text-[var(--text-tertiary)] [&_strong]:font-medium [&_strong]:text-foreground">
          <strong>{totalHave}</strong> / {totalSlots} · {pct}%
        </span>
      </div>
```

> **Keep the `grid-progress` class** on the progress `<span>` — the "shrinks the progress denominator" test reads `.grid-progress` textContent. The Tailwind utilities provide the styling; `grid-progress` is now an inert structural marker.
> `value={mode}` where `mode` is `"check" | "count"` — the `ToggleGroupItem` values match the state union exactly, so no mapping needed.

- [ ] **Step 4: Run the test — expect PASS**

Run: `npx vitest run test/client/views.test.tsx -t "switches check"`
Expected: PASS. Then `npx vitest run test/client/views.test.tsx` → all Grid tests still green (the header change did not touch the filter/table DOM the other tests select).

- [ ] **Step 5: Lint + commit**

```bash
lineguard src/client/views/Grid.tsx test/client/views.test.tsx
npx biome check --write src/client/views/Grid.tsx test/client/views.test.tsx
npm test
git add src/client/views/Grid.tsx test/client/views.test.tsx
git commit -m "feat: migrate Grid mode switch to ToggleGroup"
```

---

## Task 4: Grid rarity + series filters → shadcn Toggle

**Files:**
- Modify: `src/client/views/Grid.tsx:123-158` (the `.grid-filter` block)

**Interfaces:**
- Consumes: `Toggle` from `@/components/ui/toggle`; `FILTER_TOGGLE` from `./shared`.
- Produces: keeps `.grid-filter`, `.grid-filter-label` is dropped (not selected by tests; replaced by Tailwind). **Keeps `role="button"` + `aria-pressed`** on every rarity/series toggle (17 existing tests depend on this).

- [ ] **Step 1: Confirm the existing filter tests are green before the change**

Run: `npx vitest run test/client/views.test.tsx -t "Grid volume filter"` and `-t "Grid rarity filter"`
Expected: all PASS (baseline — these guard the reskin).

- [ ] **Step 2: Migrate the filter block to `Toggle`**

Add the import:
```tsx
import { Toggle } from "@/components/ui/toggle";
import { FILTER_TOGGLE } from "./shared";
```
Replace the `.grid-filter` block (lines 123-158) with:

```tsx
      <div className="grid-filter mb-4 flex flex-col gap-2 px-1">
        <div className="flex flex-wrap items-center gap-3">
          <span className="min-w-[42px] font-mono text-[11px] tracking-[0.08em] text-[var(--text-tertiary)]">
            稀有度
          </span>
          <div className="flex flex-wrap gap-1.5">
            {RARITIES.map((rarity) => (
              <Toggle
                key={rarity}
                pressed={!hiddenR.has(rarity)}
                onPressedChange={() => toggleRarity(rarity)}
                className={FILTER_TOGGLE}
              >
                {rarity}
              </Toggle>
            ))}
          </div>
        </div>
        {volumeRows.map((row) => (
          <div key={row.label} className="flex flex-wrap items-center gap-3">
            <span className="min-w-[42px] font-mono text-[11px] tracking-[0.08em] text-[var(--text-tertiary)]">
              {row.label}
            </span>
            <div className="flex flex-wrap gap-1.5">
              {row.series.map((s) => (
                <Toggle
                  key={s}
                  pressed={!hidden.has(s)}
                  onPressedChange={() => toggle(s)}
                  className={FILTER_TOGGLE}
                >
                  {s}
                </Toggle>
              ))}
            </div>
          </div>
        ))}
      </div>
```

> **Keep the `grid-filter` class** on the outer wrapper — every Grid test does `container.querySelector(".grid-filter")`.
> `Toggle`'s `pressed` prop drives Radix's `aria-pressed`; `onPressedChange` replaces the old `onClick`. We no longer hand-write `aria-pressed` or `type="button"` — Radix supplies both. The `data-[state=on]` / `aria-pressed` active styling lives in `FILTER_TOGGLE`.

- [ ] **Step 3: Run the filter tests — expect PASS (unchanged)**

Run: `npx vitest run test/client/views.test.tsx -t "Grid volume filter"` and `-t "Grid rarity filter"`
Expected: all 17 PASS unchanged. Key ones that prove the contract held:
- `exposes aria-pressed on each series button reflecting its shown state` → `getByRole("button", { name: "NEW YEAR" })` + `aria-pressed` flips on click.
- `renders a 稀有度 row with a button per rarity, all pressed by default` → all four rarity buttons `aria-pressed="true"`.
- `remembers hidden rarities/series across remounts via localStorage` → `onPressedChange` still calls `toggle*`, persistence intact.

If any fails because Radix didn't emit `aria-pressed`, **stop** — do not paper over it; verify against the rendered DOM (`screen.debug()`), since the whole filter-toggle approach hinges on this attribute.

- [ ] **Step 4: Build + full test + visual smoke**

Run: `npm run build && npm test`
Expected: build + all tests green.

Visual smoke (`npm run dev`, 格表 view): rarity row + per-volume series rows render as outlined pill chips; off (hidden) chips read muted, on chips show the elevated gold-hairline fill; toggling hides/show columns exactly as before.

- [ ] **Step 5: Lint + commit**

```bash
lineguard src/client/views/Grid.tsx src/client/views/shared.tsx
npx biome check --write src/client/views/Grid.tsx src/client/views/shared.tsx
npm test
git add src/client/views/Grid.tsx src/client/views/shared.tsx
git commit -m "feat: migrate Grid rarity/series filters to shadcn Toggle"
```

---

## Task 5: Grid table → Tailwind (keep bespoke structure + markers)

**Files:**
- Modify: `src/client/views/Grid.tsx:160-241` (the `.grid-empty` + `.grid-wrap`/`.grid-table` block)

**Interfaces:**
- Consumes: nothing new.
- Produces: keeps structural markers `grid-table`, `grid-series-head`, `grid-rarity-head`, `gr-{key}`, `grid-series-start`; relocates all styling to Tailwind. Row hover uses a named group (`group/row`) instead of `tbody tr:hover .gc-*` descendant selectors.

- [ ] **Step 1: Baseline the table-structure tests**

Run: `npx vitest run test/client/views.test.tsx -t "Grid rarity filter"`
Expected: PASS — includes `hides a rarity's column…` (`.grid-rarity-head.gr-ur` counts), `shrinks each series header's colSpan`, `moves the group left border…` (`.grid-rarity-head.grid-series-start` → `.gr-sr`), and the empty-hint tests (`.grid-table` absent). These are the contract for this task.

- [ ] **Step 2: Migrate the empty hint + table wrapper + headers**

Replace the empty-state + `.grid-wrap` opening through the `<thead>` (lines 160-196) with:

```tsx
      {shown.length === 0 || shownRarities.length === 0 ? (
        <div className="mb-4 rounded-[4px] border-[0.5px] border-border bg-card px-4 py-9 text-center text-[13px] tracking-[0.08em] text-[var(--text-tertiary)]">
          {shown.length === 0 ? "（未選擇任何系列）" : "（未選擇任何稀有度）"}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-[4px] border-[0.5px] border-border bg-card">
          <table className="grid-table w-full border-collapse text-xs">
            <thead>
              <tr>
                <th
                  rowSpan={2}
                  className="sticky left-0 z-[3] w-[92px] min-w-[92px] whitespace-nowrap bg-secondary px-3.5 py-2.5 text-left font-sans text-[11px] font-normal tracking-[0.15em] text-muted-foreground [border-bottom:0.5px_solid_var(--border-strong)] [border-right:0.5px_solid_var(--border-strong)] max-sm:w-[76px] max-sm:min-w-[76px] max-sm:px-2.5 max-sm:py-2 max-sm:text-[10px] max-sm:tracking-[0.1em]"
                >
                  角色
                </th>
                {shown.map(({ s }) => (
                  <th
                    key={s}
                    colSpan={shownRarities.length}
                    className="grid-series-head grid-series-start border-b-[0.5px] border-border bg-secondary px-1.5 pt-2.5 pb-2 text-center font-accent text-xs font-medium uppercase italic tracking-[0.12em] text-foreground [border-left:0.5px_solid_var(--border-strong)] max-sm:px-1 max-sm:pt-2 max-sm:pb-1.5 max-sm:text-[11px]"
                  >
                    {s}
                  </th>
                ))}
              </tr>
              <tr>
                {shown.map(({ s }) =>
                  shownRarities.map(({ rarity, ri }, localRi) => (
                    <th
                      key={`${s}-${rarity}`}
                      className={`grid-rarity-head gr-${RARITY_KEYS[ri]} min-w-[32px] bg-secondary px-0 py-1.5 text-center font-mono text-[10px] font-medium [border-bottom:0.5px_solid_var(--border-strong)] max-sm:min-w-[26px] max-sm:text-[9px] ${RARITY_TEXT[ri]} ${
                        localRi === 0
                          ? "grid-series-start [border-left:0.5px_solid_var(--border-strong)]"
                          : ""
                      }`}
                    >
                      {rarity}
                    </th>
                  )),
                )}
              </tr>
            </thead>
```

Import the rarity text colours:
```tsx
import { RARITY_TEXT } from "./shared";
```

> **Markers kept:** `grid-series-head`, `grid-series-start`, `grid-rarity-head`, `gr-${key}`. The rarity colour that legacy `.gr-r/.gr-sr/.gr-ssr/.gr-ur` provided now comes from `RARITY_TEXT[ri]` (`text-rarity-*`); the `gr-*` class stays purely as the test's column-identity marker.
> `grid-series-start` appears on the series header (always) and on the first **visible** rarity head (`localRi === 0`) — exactly the legacy logic the "moves the group left border" test checks. The left border itself is the arbitrary-property `[border-left:0.5px_solid_var(--border-strong)]`.

- [ ] **Step 3: Migrate the table body cells**

Replace the `<tbody>` (lines 197-239) with:

```tsx
            <tbody>
              {m.characters.map((charName, ci) => (
                <tr key={charName} className="group/row">
                  <td className="sticky left-0 z-[2] w-[92px] min-w-[92px] overflow-hidden text-ellipsis whitespace-nowrap bg-card px-3.5 py-[9px] text-left font-sans text-[13px] text-foreground [border-right:0.5px_solid_var(--border-strong)] group-hover/row:bg-secondary max-sm:w-[76px] max-sm:min-w-[76px] max-sm:px-2.5 max-sm:py-2 max-sm:text-xs">
                    {charName}
                  </td>
                  {shown.map(({ s, si }) =>
                    shownRarities.map(({ rarity, ri }, localRi) => {
                      const startCls =
                        localRi === 0
                          ? "[border-left:0.5px_solid_var(--border-strong)]"
                          : "";
                      const cellKey = `${s}-${rarity}`;
                      const base =
                        "h-8 w-8 border-b-[0.5px] border-border p-0 text-center text-xs leading-none max-sm:h-7 max-sm:w-[26px]";
                      if (!exists(m, si, ci)) {
                        return (
                          <td
                            key={cellKey}
                            className={`${base} bg-[var(--bg-subtle)] [background-image:repeating-linear-gradient(45deg,transparent,transparent_4px,rgba(255,255,255,0.018)_4px,rgba(255,255,255,0.018)_8px)] ${startCls}`}
                          />
                        );
                      }
                      const n = getN(m, si, ci, ri);
                      if (n > 0) {
                        return (
                          <td
                            key={cellKey}
                            className={`${base} bg-[rgba(201,161,74,0.16)] font-semibold text-primary group-hover/row:bg-[rgba(201,161,74,0.26)] ${startCls}`}
                          >
                            {isCount ? (
                              <span className="font-mono font-medium text-primary">
                                {n}
                              </span>
                            ) : (
                              "✓"
                            )}
                          </td>
                        );
                      }
                      return (
                        <td
                          key={cellKey}
                          className={`${base} bg-transparent group-hover/row:bg-[rgba(255,255,255,0.025)] ${startCls}`}
                        />
                      );
                    }),
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
```

> The legacy `tbody tr:hover .gc-have/.gc-miss/.grid-name` descendant-hover rules become `group/row` on the `<tr>` + `group-hover/row:` on the cells — the Tailwind-native equivalent. The N/A stripe and the gold tints are the verbatim arbitrary patterns from the token reference. The `gc-*` class names are dropped (no test selects them; hover no longer needs them as descendant hooks).

- [ ] **Step 4: Run the structure tests — expect PASS (unchanged)**

Run: `npx vitest run test/client/views.test.tsx -t "Grid rarity filter"` and `-t "Grid volume filter"`
Expected: all PASS. Spot-checks:
- `.grid-rarity-head` count = visible series × visible rarities; `.grid-rarity-head.gr-ur` count = visible series.
- `firstHead().colSpan` shrinks from 4 → 3 when UR hidden.
- after hiding R, `.grid-rarity-head.grid-series-start` elements all also carry `gr-sr`.
- empty hints: `.grid-table` is absent when all series or all rarities hidden.

- [ ] **Step 5: Build + full test + visual smoke**

Run: `npm run build && npm test`
Expected: build + all tests green.

Visual smoke (`npm run dev`, 格表 view): sticky 角色 column + corner, italic series headers, rarity-coloured rarity heads, gold ✓ / count cells, striped N/A cells, group-start left borders, and the row-hover brightening must all match the legacy render. Toggle 打勾/數量 and the filters to exercise every cell state.

- [ ] **Step 6: Lint + commit**

```bash
lineguard src/client/views/Grid.tsx
npx biome check --write src/client/views/Grid.tsx
npm test
git add src/client/views/Grid.tsx
git commit -m "feat: migrate Grid table to Tailwind (keep bespoke structure)"
```

---

## Task 6: Grid legend → Tailwind

**Files:**
- Modify: `src/client/views/Grid.tsx:243-254` (the `.grid-legend` block)

**Interfaces:**
- Consumes: nothing new. Pure reskin; guarded by the Grid mode-toggle test (count-mode legend copy) + smoke render.

- [ ] **Step 1: Tailwind-ize the legend**

Replace the `.grid-legend` block (lines 243-254) with:

```tsx
      <div className="mt-3.5 flex flex-wrap gap-[18px] pl-1 text-xs text-muted-foreground max-sm:gap-3 max-sm:text-[11px]">
        <span className="inline-flex items-center gap-[7px]">
          <span className="inline-flex h-4 w-4 items-center justify-center rounded-[3px] bg-[rgba(201,161,74,0.16)] text-[10px] font-semibold text-primary">
            {isCount ? "2" : "✓"}
          </span>{" "}
          {isCount ? "數字＝持有張數（≥2 為重複）" : "已收集"}
        </span>
        <span className="inline-flex items-center gap-[7px]">
          <span className="inline-flex h-4 w-4 items-center justify-center rounded-[3px] bg-transparent [border:0.5px_solid_var(--border-strong)]" />{" "}
          未收集
        </span>
        <span className="inline-flex items-center gap-[7px]">
          <span className="inline-flex h-4 w-4 items-center justify-center rounded-[3px] bg-[var(--bg-subtle)] [background-image:repeating-linear-gradient(45deg,transparent,transparent_3px,rgba(255,255,255,0.018)_3px,rgba(255,255,255,0.018)_6px)] [border:0.5px_solid_var(--border)]" />{" "}
          未收錄（此系列無此角色）
        </span>
      </div>
```

> The legend's `sw-na` stripe uses the **3px** pattern (tighter than the cell's 4px) — kept verbatim.

- [ ] **Step 2: Confirm no legacy classes remain in Grid.tsx**

Run: `grep -nE "grid-header|grid-head-left|grid-title|grid-filter-|grid-empty|grid-wrap|grid-corner|grid-name|grid-cell|gc-|grid-legend|swatch|sw-|mode-btn|mode-toggle" src/client/views/Grid.tsx`
Expected: **no output**. The only legacy class names left in `Grid.tsx` are the intentional structural markers: `grid-progress`, `grid-filter`, `grid-table`, `grid-series-head`, `grid-rarity-head`, `gr-*`, `grid-series-start`. Confirm those are still present:

Run: `grep -nE "grid-progress|grid-filter\"|grid-table|grid-series-head|grid-rarity-head|gr-\\$|grid-series-start" src/client/views/Grid.tsx`
Expected: the marker classes appear (sanity that they were not stripped).

- [ ] **Step 3: Build + test + visual smoke**

Run: `npm run build && npm test`
Expected: build + all tests green; `數字＝持有張數` legend test (Task 3) passes in count mode.

- [ ] **Step 4: Lint + commit**

```bash
lineguard src/client/views/Grid.tsx
npx biome check --write src/client/views/Grid.tsx
npm test
git add src/client/views/Grid.tsx
git commit -m "feat: migrate Grid legend to Tailwind"
```

---

## Task 7: Delete the dead Glance + Grid legacy CSS

**Files:**
- Modify: `src/client/index.css` (remove the `.glance-*`, `.mode-*`, `.grid-*`, `.gc-*`, `.gr-*`, `.swatch`, `.sw-*` blocks and their `max-width: 540px` overrides)

**Interfaces:**
- Consumes: nothing. Pure deletion of now-overridden rules.
- Produces: an `@layer legacy` containing only `.view`, the base `table`/`th`/`td`, `.state-msg`, `.trade-empty`, and the shared `body`/`html`/`rise`/`fadeView` rules.

- [ ] **Step 1: Prove every class to be deleted is dead in the components**

Run:
```bash
for c in glance-header glance-title glance-progress glance-wrap glance-table g-char complete-mark glance-complete-badge glance-na mode-toggle mode-btn grid-header grid-head-left grid-title grid-progress grid-filter grid-filter-row grid-filter-label grid-filter-btns grid-empty grid-wrap grid-corner grid-name grid-series-head grid-rarity-head grid-cell gc-have gc-miss gc-na gc-count grid-series-start grid-legend swatch sw-have sw-miss sw-na; do
  hits=$(grep -rl "$c" src/client --include="*.tsx" | grep -v "components/ui/")
  [ -n "$hits" ] && echo "STILL USED: $c -> $hits"
done
echo "scan-done"
```
Expected: prints **only** lines for the kept structural markers that legitimately remain in `Grid.tsx` — `grid-progress`, `grid-filter`, `grid-series-head`, `grid-rarity-head`, `grid-series-start` (and `grid-table`, not in the loop above) — plus `scan-done`. Every *other* class must be absent. **Do not delete a CSS block for a class that still appears as a live styling dependency**; the kept markers are fine to delete the *rules* for (their styling moved to utilities) but verify they are markers, not the sole source of a needed style.

> Clarify the kept markers: `grid-progress`, `grid-filter`, `grid-table`, `grid-series-head`, `grid-rarity-head`, `gr-*`, `grid-series-start` remain in the JSX **as inert markers**. Their legacy CSS rules are still deleted in Step 2 because the styling is now in utilities. Re-run the visual smoke after deletion to be certain nothing depended on the rule.

- [ ] **Step 2: Delete the dead rule blocks**

In `src/client/index.css`, inside `@layer legacy`, delete:
- The entire **GLANCE** section: `.glance-header` through `.glance-na` (lines ~213-344).
- The **shared pill toggle**: `.mode-toggle`, `.mode-btn`, `.mode-btn:hover`, `.mode-btn.active` (lines ~346-377).
- The entire **GRID** section: `.grid-header` through `.grid-legend .sw-na` (lines ~379-642), i.e. every `.grid-*`, `.gc-*`, `.gr-*`, `.swatch`, `.sw-*` rule. **Stop before `.trade-empty`** (line ~647) — keep it.
- In the **RESPONSIVE** `@media (max-width: 540px)` block (lines ~656-732): delete the `.mode-btn`, `.grid-corner`, `.grid-name`, `.grid-series-head`, `.grid-rarity-head`, `.grid-cell`, `.grid-legend`, `.glance-table` (+ `thead th`, `thead th.g-char`, `tbody td`, `.g-char`, `.glance-complete-badge`), `.glance-header`, `.glance-title`, `.glance-progress` overrides. **Keep** the base `table` / `th` / `td` responsive overrides at the top of the media block (still used by admin tables in Phase 4).

**Keep:** `.view` + `fadeView`, the base `table`/`th`/`td` rules (lines ~177-200), `.state-msg`, `.trade-empty`, the `html`/`body`/`rise` rules, and the `@layer base` shadcn defaults at the file foot.

- [ ] **Step 3: Verify no orphaned Glance/Grid selectors remain in CSS**

Run: `grep -nE "\.(glance-|mode-(btn|toggle)|grid-(header|head-left|title|filter|empty|wrap|corner|name|series-head|rarity-head|cell|legend)|gc-|gr-(r|sr|ssr|ur)|swatch|sw-)" src/client/index.css`
Expected: **no output**.

Run: `grep -nE "\.(view|state-msg|trade-empty)" src/client/index.css`
Expected: still present (the survivors).

- [ ] **Step 4: Build + full test**

Run: `npm run build && npm test`
Expected: build succeeds (CSS still compiles), all tests green.

- [ ] **Step 5: Visual smoke + commit**

Eyeball Glance + Grid once more (`npm run dev`) — the deleted CSS was already overridden by utilities, but confirm nothing shifted (especially the sticky corner/column, striped N/A cells, and the toggle pills). Then:

```bash
lineguard src/client/index.css
npx biome check --write src/client/index.css
npm test
git add src/client/index.css
git commit -m "refactor: drop legacy glance/grid CSS superseded by shadcn"
```

---

## Finishing the branch

After Task 7, use **superpowers:finishing-a-development-branch**: verify `npm test` green, then push and open the PR (`feat/shadcn-phase3c`). PR body ends with:
`🤖 Generated with [Claude Code](https://claude.com/claude-code)`

Suggested PR summary: this completes **Phase 3 (特化視圖)** — all six public views are now on shadcn + Tailwind; the only `@layer legacy` survivors are `.view`, `.state-msg`, `.trade-empty`, and the base table rules (all shared with the still-legacy admin, Phase 4). Call out the "zero new npm deps" reuse of Toggle/ToggleGroup/Badge, the `Toggle`-preserves-`aria-pressed` decision that kept all 17 Grid filter tests green unmodified, and the kept-bespoke Grid table (§5.3 special-case 1). After merge, optionally drive Copilot review via `/pr-workflow:copilot-iterate`.

## Self-Review (completed by author)

- **Spec coverage (§5.4 Phase 3 remainder):** Glance → Tasks 1-2; Grid → Tasks 3-6; legacy-CSS removal → Task 7. The "順手升級" toggles (§5.3) are realized: single-select mode switches → `ToggleGroup type="single"` (T1, T3), multi-select filters → `Toggle` (T4). Grid special-case 1 (§5.3, keep bespoke table) → T5 keeps the `<table>` + markers, Tailwind-only. No Phase 3 view left on legacy CSS after T7. ✔
- **Placeholder scan:** every code step carries the exact JSX + class strings + commands; no TBD/"handle edge cases". Arbitrary patterns (stripes, border-strong edges, hover tints) are spelled out verbatim in the token reference and reused by ref. ✔
- **Type consistency:** `MODE_TOGGLE`/`MODE_BTN`/`FILTER_TOGGLE` defined in T1, consumed unchanged in T1/T3/T4; `RARITY_TEXT` (existing `shared.tsx` export) consumed in T5; `mode` state unions (`"wishlist"|"collection"`, `"check"|"count"`) match the `ToggleGroupItem value=` strings exactly; `pressed`/`onPressedChange` are the real Radix `Toggle` props (verified against `toggle.tsx`). ✔
- **Regression strategy:** the 17 existing Grid filter/structure tests guard T4-T6 unchanged (role=button + aria-pressed + legacy markers preserved); two **new** tests (Glance mode toggle T1, Grid mode toggle T3) cover the genuinely-new `ToggleGroup` radio structure and are written red-first; the smoke "renders all seven views" test guards every reskin against crashes. ✔
- **Marker risk:** the only subtlety is keeping inert legacy class names (`grid-*`, `gr-*`) as test hooks while deleting their CSS. Task 7 Step 1 + Step 3 explicitly verify which names are markers vs. live styling, and the visual smoke after deletion confirms no rule was load-bearing. ✔
