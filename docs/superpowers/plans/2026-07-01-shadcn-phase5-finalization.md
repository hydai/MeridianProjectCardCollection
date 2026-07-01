# shadcn Phase 5 — Finalization (收尾) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close out the Tailwind v4 + shadcn/ui migration by adding the WAI-ARIA keyboard contract to the two bespoke tablists (roving tabindex + arrow/Home/End), clearing the last two hand-written CSS classes (`.state-msg` / `.trade-empty`) from `index.css`, removing the now-unused PostCSS + autoprefixer toolchain, and documenting the new UI stack — leaving `index.css` as pure theme + brand-soul and zero hand-written component CSS.

**Architecture:** Phase 5 is the final slice of the design doc (`docs/superpowers/specs/2026-06-28-shadcn-ui-refactor-design.md` §5.4, row "5 收尾"). Phases 0–4 platformed every view + panel onto Tailwind/shadcn and deleted `admin.css`; Phase 5 removes the residue. Four independent tasks land on one `feat/shadcn-phase5` branch → one PR. Task 1 (a11y) adds a small shared hook `useRovingTablist` and a unit test; the other three are cleanup with build/lint/typecheck as their gate. **Zero new npm dependencies; zero new shadcn primitives; zero behaviour change beyond the a11y keyboard additions.**

**Tech Stack:** React 18, React Router 7, Vite 6, Tailwind v4 (`@tailwindcss/vite`), shadcn (radix-nova base), Biome, Vitest + Testing Library.

## Global Constraints

These apply to **every** task; each task's requirements implicitly include them.

- **Zero behaviour change** except the intentional a11y keyboard additions in Task 1 (mouse clicks, hash sync, tab selection, and all rendered content are unchanged). CSS cleanup is visual-parity-only; class strings ported from `index.css` are 1:1.
- **Preserve the brand soul in `index.css`.** Only `.state-msg` + `.trade-empty` are removed (Task 2). The body radial-gradient background, `@keyframes rise` (consumed by `PublicViewer`'s `animate-[rise_…]` utilities AND the legacy `main` rule), `.view` + `@keyframes fadeView` (LIVE — every `views/*.tsx` renders `<section className="view …">`), the base `table`/`th`/`td` element rules (still styling the bespoke admin + collection tables), the `@media (max-width: 540px)` block, fonts, and the shadcn token bridge all **stay**.
- **Automatic tab activation** (Task 1): moving focus with an arrow key also selects the tab (content reveal is instant → the WAI-ARIA "tabs with automatic activation" pattern). Roving tabindex and arrow keys ship **together** — roving tabindex alone would make inactive tabs keyboard-unreachable (design doc §5.4 note).
- **Before each commit:** run `lineguard` on changed files, then `npm test` (green), then `npx biome check .` (clean), then `npm run typecheck` (clean across all 3 tsconfigs) where the task touches TS/TSX. A PreToolUse hook also auto-runs format/lint/test on `git commit`.
- **Conventional Commits**, one concern per commit. Commit trailer (repo style):
  `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`
- **Additive git only** — no force-push, no rebase inside the loop.
- **Client tests need `--config vitest.client.config.ts`.** The default `vitest.config.ts` only includes `test/worker/**`. `npm test` runs both suites in sequence.

## Decisions for Phase 5

1. **Keep bespoke tablists; add the keyboard contract by hand.** The public (`PublicViewer.tsx`) and admin (`admin/Admin.tsx`) navs are hand-rolled `<button role="tab">` lists (chosen over Radix `Tabs` back in Phase 1 to preserve the two-line zh/en labels, the hash-sync, and exact visual parity). So Phase 5 supplies the roving tabindex + arrow-key navigation Radix would otherwise provide, via a shared hook rather than duplicating ~20 lines in each component (DRY).
2. **Shared hook home = `src/client/lib/tablist.ts`.** It owns a `useRef` array to focus siblings, so it must be a hook. `lib/` already holds `utils.ts` (`cn`), the established home for cross-cutting client helpers.
3. **Horizontal keys only.** These tablists wrap in a row (`flex flex-wrap`), so the hook binds **ArrowLeft/ArrowRight + Home/End** (with wrap-around) and deliberately ignores Up/Down (which would hijack vertical page scroll and isn't expected for a horizontal tablist). Matches design doc "Arrow/Home/End".
4. **Tabpanel wiring is OUT of scope.** The design doc scopes Phase 5 tabs to "roving tabindex + 方向鍵焦點導航" — the keyboard *reachability* fix. Adding `role="tabpanel"` + `aria-controls`/`aria-labelledby`/`id` across all 8 public views + 5 admin panels is a separate, larger, DOM-touching change with parity risk. Left as a possible future enhancement, flagged here so it's a conscious omission, not a gap. **Open for review:** say so if you want the full tabpanel semantics folded in.
5. **Shared state-line tokens move to a neutral `src/client/shared/states.ts`.** `.state-msg` (loading) and `.trade-empty` (empty) are rendered by BOTH the public views (via the existing `EMPTY_MSG` in `views/shared.tsx`) and the four admin panels. Rather than duplicate the string or add a public↔admin import edge, both tokens live in `@/shared/states` — the same neutral-home pattern already used by `@/shared/rarity` (`RARITY_TEXT`). `views/shared.tsx` re-exports `EMPTY_MSG` from there so `Trade`/`Market` need no change. **Open for review:** the lower-churn alternative is to add `STATE_MSG` to `admin/ui.ts` and have the admin panels import `EMPTY_MSG` straight from `@/views/shared`; chose the neutral module for clean layering.
6. **PostCSS + autoprefixer are removed, not kept "just in case."** Tailwind v4's `@tailwindcss/vite` plugin runs its own Lightning-CSS pipeline (vendor-prefixing included); `postcss.config.js` (autoprefixer-only) and the `autoprefixer` + `postcss` devDeps are dead. `postcss` stays in `node_modules` transitively via Vite — removing the direct devDep declarations is safe (verified by `npm run build`).
7. **`tw-animate-css` stays.** Not hand-written CSS and not in the design doc's Phase 5 removal list; leaving it is YAGNI-correct (removing it is unrelated churn/risk).
8. **One branch, one PR** (`feat/shadcn-phase5`), like Phase 4c bundled its three tasks. Each task is still an independent commit with its own green gate.

---

## Task 1: Roving-tabindex ARIA tablist hook + apply to both tablists

**Files:**
- Create: `src/client/lib/tablist.ts` (the `useRovingTablist` hook)
- Test: `test/client/tablist.test.tsx` (new — unit-tests the hook via a tiny harness)
- Modify: `src/client/PublicViewer.tsx` (public 8-tab nav)
- Modify: `src/client/admin/Admin.tsx` (admin 5-tab nav)

**Interfaces:**
- Consumes: `useRef`, `KeyboardEvent` from `react`.
- Produces: `useRovingTablist<Id extends string>(ids: readonly Id[], select: (id: Id) => void): (index: number, selected: boolean) => { ref: (el: HTMLButtonElement | null) => void; tabIndex: number; onKeyDown: (e: KeyboardEvent<HTMLButtonElement>) => void }` — a `tabProps` factory spread onto each `<button role="tab">`.

- [ ] **Step 1: Write the failing test** `test/client/tablist.test.tsx`

```tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { useRovingTablist } from "../../src/client/lib/tablist";

const IDS = ["a", "b", "c"] as const;

function Harness() {
  const [tab, setTab] = useState<(typeof IDS)[number]>("a");
  const tabProps = useRovingTablist(IDS, setTab);
  return (
    <div role="tablist">
      {IDS.map((id, i) => (
        <button
          key={id}
          type="button"
          role="tab"
          aria-selected={tab === id}
          {...tabProps(i, tab === id)}
        >
          {id}
        </button>
      ))}
    </div>
  );
}

describe("useRovingTablist", () => {
  it("gives only the selected tab tabIndex 0 (roving tabindex)", () => {
    render(<Harness />);
    const [a, b, c] = screen.getAllByRole("tab");
    expect(a).toHaveAttribute("tabindex", "0");
    expect(b).toHaveAttribute("tabindex", "-1");
    expect(c).toHaveAttribute("tabindex", "-1");
  });

  it("ArrowRight moves focus + selection to the next tab", () => {
    render(<Harness />);
    const [a, b] = screen.getAllByRole("tab");
    a.focus();
    fireEvent.keyDown(a, { key: "ArrowRight" });
    expect(b).toHaveFocus();
    expect(b).toHaveAttribute("aria-selected", "true");
    expect(b).toHaveAttribute("tabindex", "0");
  });

  it("ArrowLeft from the first tab wraps to the last", () => {
    render(<Harness />);
    const tabs = screen.getAllByRole("tab");
    tabs[0].focus();
    fireEvent.keyDown(tabs[0], { key: "ArrowLeft" });
    expect(tabs[2]).toHaveFocus();
    expect(tabs[2]).toHaveAttribute("aria-selected", "true");
  });

  it("Home and End jump to the first and last tab", () => {
    render(<Harness />);
    const tabs = screen.getAllByRole("tab");
    tabs[0].focus();
    fireEvent.keyDown(tabs[0], { key: "End" });
    expect(tabs[2]).toHaveFocus();
    fireEvent.keyDown(tabs[2], { key: "Home" });
    expect(tabs[0]).toHaveFocus();
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `npx vitest run --config vitest.client.config.ts test/client/tablist.test.tsx`
Expected: FAIL — `Failed to resolve import "../../src/client/lib/tablist"` / `useRovingTablist is not defined`.

- [ ] **Step 3: Implement `src/client/lib/tablist.ts`**

```ts
import type { KeyboardEvent } from "react";
import { useRef } from "react";

/**
 * Roving-tabindex + arrow-key focus navigation for a bespoke ARIA tablist.
 *
 * The public + admin nav bars are hand-rolled `<button role="tab">` lists (not
 * Radix `Tabs`), so they need the WAI-ARIA "tabs" keyboard contract added by
 * hand. This hook supplies it with *automatic activation* (the panel reveal is
 * instant, so moving focus also selects) — the recommended pattern for tabs
 * whose content is cheap to show. Roving tabindex without arrow keys would make
 * the inactive tabs unreachable by keyboard, so both ship together.
 *
 * Spread `tabProps(index, selected)` onto each tab button:
 *   - `tabIndex` is 0 for the selected tab, -1 for the rest (roving tabindex:
 *     the whole tablist is a single Tab stop; Arrow keys move within it).
 *   - `onKeyDown` handles ArrowLeft/ArrowRight (wrapping) + Home/End, moving DOM
 *     focus and calling `select` with the new id.
 *   - `ref` registers the button so the handler can focus its sibling.
 */
export function useRovingTablist<Id extends string>(
  ids: readonly Id[],
  select: (id: Id) => void,
) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  function onKeyDown(e: KeyboardEvent<HTMLButtonElement>, index: number) {
    const last = ids.length - 1;
    let next: number;
    switch (e.key) {
      case "ArrowRight":
        next = index === last ? 0 : index + 1;
        break;
      case "ArrowLeft":
        next = index === 0 ? last : index - 1;
        break;
      case "Home":
        next = 0;
        break;
      case "End":
        next = last;
        break;
      default:
        return;
    }
    e.preventDefault();
    select(ids[next]);
    refs.current[next]?.focus();
  }

  return function tabProps(index: number, selected: boolean) {
    return {
      ref: (el: HTMLButtonElement | null) => {
        refs.current[index] = el;
      },
      tabIndex: selected ? 0 : -1,
      onKeyDown: (e: KeyboardEvent<HTMLButtonElement>) => onKeyDown(e, index),
    };
  };
}
```

- [ ] **Step 4: Run — expect PASS**

Run: `npx vitest run --config vitest.client.config.ts test/client/tablist.test.tsx`
Expected: 4 PASS.

- [ ] **Step 5: Apply the hook to `src/client/PublicViewer.tsx`**

Add the import (with the other `@/` imports near the top, after line 2 `import { cn } from "@/lib/utils";`):

```tsx
import { useRovingTablist } from "@/lib/tablist";
```

Immediately after the `TABS` array declaration (the line `] as const;` on line 24), add a module-level id list:

```tsx
const TAB_IDS = TABS.map((t) => t.id);
```

Inside `PublicViewer`, right after the `selectTab` definition (after its closing `};` on line 103), add:

```tsx
  const tabProps = useRovingTablist(TAB_IDS, selectTab);
```

In the tab `.map`, add the index parameter and spread `tabProps` onto the button. Change the opening `{TABS.map((t) => (` to `{TABS.map((t, i) => (`, and add `{...tabProps(i, tab === t.id)}` directly after the `aria-selected` line. The button head becomes:

```tsx
        {TABS.map((t, i) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            {...tabProps(i, tab === t.id)}
            onClick={() => selectTab(t.id)}
            className={cn(
```

(Everything else in the button — `className`, the zh label, the en `<span>` — is unchanged. `onClick` stays for mouse; the spread adds `ref`/`tabIndex`/`onKeyDown` with no key collisions.)

- [ ] **Step 6: Apply the hook to `src/client/admin/Admin.tsx`**

Add the import after line 2 (`import { cn } from "@/lib/utils";`):

```tsx
import { useRovingTablist } from "@/lib/tablist";
```

After the `TABS` array's `] as const;` (line 16), add:

```tsx
const TAB_IDS = TABS.map((t) => t.id);
```

Inside `Admin`, after `const [tab, setTab] = useState<TabId>("add");` (line 21), add:

```tsx
  const tabProps = useRovingTablist(TAB_IDS, setTab);
```

In the `.map`, add the index and spread. Change `{TABS.map((t) => (` to `{TABS.map((t, i) => (`, and add `{...tabProps(i, tab === t.id)}` after `aria-selected`:

```tsx
        {TABS.map((t, i) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            {...tabProps(i, tab === t.id)}
            onClick={() => setTab(t.id)}
            className={cn(
```

- [ ] **Step 7: Typecheck + full test + build**

Run: `npm run typecheck && npm test && npm run build`
Expected: all green. `setTab` (a `Dispatch<SetStateAction<TabId>>`) satisfies the hook's `select: (id: Id) => void` param (contravariance: `SetStateAction<TabId>` is a supertype of `TabId`), so no cast is needed.

- [ ] **Step 8: Keyboard smoke**

Run `npm run dev`. On `/` and on `/admin`: press Tab until a nav tab is focused (the tablist is a single Tab stop). Press **ArrowRight/ArrowLeft** — focus + selection move along the tabs and wrap at the ends; **Home/End** jump to the first/last tab; **Tab again** leaves the tablist (into the panel content), not onto the next tab. Mouse clicks and the URL hash (public) still work exactly as before.

- [ ] **Step 9: Lint + commit**

```bash
lineguard src/client/lib/tablist.ts test/client/tablist.test.tsx src/client/PublicViewer.tsx src/client/admin/Admin.tsx
npx biome check --write src/client/lib/tablist.ts test/client/tablist.test.tsx src/client/PublicViewer.tsx src/client/admin/Admin.tsx
npm test
git add src/client/lib/tablist.ts test/client/tablist.test.tsx src/client/PublicViewer.tsx src/client/admin/Admin.tsx
git commit -m "feat: roving-tabindex + arrow-key nav for public and admin tablists"
```

---

## Task 2: Clear `.state-msg` / `.trade-empty` from `index.css`

**Files:**
- Create: `src/client/shared/states.ts` (`STATE_MSG`, `EMPTY_MSG`)
- Modify: `src/client/views/shared.tsx` (re-export `EMPTY_MSG` from the new module)
- Modify: `src/client/admin/Openings.tsx`, `src/client/admin/History.tsx`, `src/client/admin/ManageCards.tsx`, `src/client/admin/PendingTrades.tsx` (swap the two bare class strings for the constants)
- Modify: `src/client/index.css` (delete the two legacy rules)

**Interfaces:**
- Consumes: nothing new.
- Produces (from `@/shared/states`): `STATE_MSG: string` (loading line), `EMPTY_MSG: string` (empty line). `EMPTY_MSG` value is byte-identical to the current `views/shared.tsx` definition.

- [ ] **Step 1: Create `src/client/shared/states.ts`**

```ts
// Shared "state line" tokens, ported 1:1 from the legacy index.css `.state-msg`
// (loading) and `.trade-empty` (empty) rules so those two hand-written classes
// can be deleted (Phase 5). Kept in @/shared (like RARITY_TEXT) because both the
// public views and the admin panels render these lines — a neutral home avoids a
// public↔admin import edge.

// Loading line (legacy `.state-msg`): Cormorant italic, dim, centred, 48px pad.
export const STATE_MSG =
  "py-12 text-center font-accent italic tracking-[0.1em] text-[var(--text-tertiary)]";

// Empty line (legacy `.trade-empty`): dim, 13px, tight tracking, 12px/2px pad.
export const EMPTY_MSG =
  "px-0.5 py-3 text-[13px] tracking-[0.04em] text-[var(--text-tertiary)]";
```

> Port check — `.state-msg`: `text-align:center`→`text-center`, `color:var(--text-tertiary)`→`text-[var(--text-tertiary)]`, `font-family:"Cormorant Garamond",serif`→`font-accent`, `font-style:italic`→`italic`, `letter-spacing:0.1em`→`tracking-[0.1em]`, `padding:48px 0`→`py-12`. `.trade-empty`: `color`→`text-[var(--text-tertiary)]`, `font-size:13px`→`text-[13px]`, `padding:12px 2px`→`py-3 px-0.5`, `letter-spacing:0.04em`→`tracking-[0.04em]`.

- [ ] **Step 2: Re-export `EMPTY_MSG` from `views/shared.tsx`**

Replace the current definition (lines 48–50):

```tsx
// Empty/error state line (legacy `.trade-empty`), shared by Trade + Market.
export const EMPTY_MSG =
  "px-0.5 py-3 text-[13px] tracking-[0.04em] text-[var(--text-tertiary)]";
```

with a re-export (canonical definition now lives in `@/shared/states`):

```tsx
// Empty/error state line (legacy `.trade-empty`); canonical definition now in
// @/shared/states (shared with the admin panels). Re-exported so Trade + Market
// keep importing it from this view barrel unchanged.
export { EMPTY_MSG } from "@/shared/states";
```

- [ ] **Step 3: Verify Trade/Market still resolve `EMPTY_MSG`**

Run: `grep -rn "EMPTY_MSG" src/client/views/`
Expected: `Trade.tsx` and `Market.tsx` import `EMPTY_MSG` from `./shared` (unchanged), and `shared.tsx` now re-exports it. No direct `@/shared/states` import is required in the view files.

- [ ] **Step 4: Swap the class strings in the four admin panels**

In **each** of `Openings.tsx`, `History.tsx`, `ManageCards.tsx`, `PendingTrades.tsx`:

1. Add the import (next to the existing `./ui` import line):

```tsx
import { EMPTY_MSG, STATE_MSG } from "@/shared/states";
```

2. Replace `className="state-msg"` with `className={STATE_MSG}` (the loading `載入中…` line).
3. Replace `className="trade-empty"` with `className={EMPTY_MSG}` (the empty-state line).

Exact current sites (line numbers may drift ±1 after the import add — match on the string, not the line):
- `Openings.tsx:35` `state-msg`, `Openings.tsx:48` `trade-empty`
- `History.tsx:38` `state-msg`, `History.tsx:51` `trade-empty`
- `ManageCards.tsx:290` `state-msg`, `ManageCards.tsx:292` `trade-empty`
- `PendingTrades.tsx:403` `state-msg`, `PendingTrades.tsx:412` `trade-empty`

- [ ] **Step 5: Delete the two rules from `src/client/index.css`**

Remove this block (the `/* LOADING / ERROR … */` comment, the `.state-msg` rule, the `.trade-empty` comment, and the `.trade-empty` rule — currently lines 202–222 inside `@layer legacy`), so the `td { … }` rule is followed directly by the `/* ------------- RESPONSIVE ------------- */` comment:

```css
  /* LOADING / ERROR — interim: still used by admin panels
     (Phase 4); remove once those migrate. */
  .state-msg {
    text-align: center;
    color: var(--text-tertiary);
    font-family: "Cormorant Garamond", serif;
    font-style: italic;
    letter-spacing: 0.1em;
    padding: 48px 0;
  }

  /* .trade-empty / .state-msg: shared with admin panels (Phase 4). The Glance +
     Grid legacy CSS was removed in Phase 3c; Trade + Market in Phase 3b. */

  .trade-empty {
    color: var(--text-tertiary);
    font-size: 13px;
    padding: 12px 2px;
    letter-spacing: 0.04em;
  }
```

- [ ] **Step 6: Prove no `.state-msg` / `.trade-empty` reference survives**

Run: `grep -rnE "state-msg|trade-empty" src/client/`
Expected: **no matches** (not in any `.tsx`, not in `index.css`). Every loading/empty line is now `STATE_MSG` / `EMPTY_MSG`.

- [ ] **Step 7: Typecheck + full test + build + visual smoke**

Run: `npm run typecheck && npm test && npm run build`
Expected: all green. The admin render tests assert the loading/empty **text** (`載入中…`, `尚無開箱紀錄`, `尚無成交紀錄`, `沒有符合的卡片`, `目前沒有暫定交換`), which is unchanged, so they stay green.

Visual smoke (`npm run dev`): `/admin` → each panel's loading state (italic dim Cormorant "載入中…", centred, generous vertical pad) and empty state (small dim left-aligned line) look identical to before; `/#trade` and `/#market` empty states (which use the re-exported `EMPTY_MSG`) are unchanged.

- [ ] **Step 8: Lint + commit**

```bash
lineguard src/client/shared/states.ts src/client/views/shared.tsx src/client/admin/Openings.tsx src/client/admin/History.tsx src/client/admin/ManageCards.tsx src/client/admin/PendingTrades.tsx src/client/index.css
npx biome check --write src/client/shared/states.ts src/client/views/shared.tsx src/client/admin/Openings.tsx src/client/admin/History.tsx src/client/admin/ManageCards.tsx src/client/admin/PendingTrades.tsx
npm test
git add src/client/shared/states.ts src/client/views/shared.tsx src/client/admin/ src/client/index.css
git commit -m "refactor: retire .state-msg/.trade-empty for shared @/shared/states tokens"
```

---

## Task 3: Remove PostCSS + autoprefixer

**Files:**
- Delete: `postcss.config.js`
- Modify: `package.json` (drop `autoprefixer` + `postcss` devDeps)
- Modify: `package-lock.json` (regenerated by `npm install`)

**Interfaces:** none — build-tooling cleanup only.

- [ ] **Step 1: Confirm nothing else references PostCSS/autoprefixer**

Run: `grep -rnE "postcss|autoprefixer" --include=*.js --include=*.ts --include=*.mjs --include=*.cjs --include=*.json . | grep -v node_modules | grep -v package-lock.json`
Expected: only `package.json` (the two devDep lines) and `postcss.config.js` itself. `vite.config.ts` uses `@tailwindcss/vite` and has no PostCSS reference.

- [ ] **Step 2: Delete `postcss.config.js`**

Run: `git rm postcss.config.js`
Expected: `rm 'postcss.config.js'`.

- [ ] **Step 3: Remove the two devDependencies from `package.json`**

Delete these two lines from the `devDependencies` block:

```json
    "autoprefixer": "^10.4.0",
```
```json
    "postcss": "^8.4.0",
```

- [ ] **Step 4: Regenerate the lockfile**

Run: `npm install`
Expected: completes cleanly; `package-lock.json` updates (the two top-level dev entries drop; `postcss` remains as a transitive dependency of Vite). No peer-dependency errors.

- [ ] **Step 5: Build + full test — prove the CSS pipeline is intact**

Run: `npm run build && npm test`
Expected: build succeeds with no "cannot find PostCSS config" warning and no CSS errors; `dist/` contains the compiled + prefixed CSS (Tailwind v4's `@tailwindcss/vite` handles vendor prefixing via Lightning CSS). All tests green.

Visual smoke (`npm run dev`): the site renders identically — the radial-gradient hero background, gold accents, serif display type, rarity colours, and the Grid sticky headers are all present (any lost autoprefixing would show first on gradients / sticky positioning).

- [ ] **Step 6: Lint + commit**

```bash
lineguard package.json
npx biome check .
npm test
git add package.json package-lock.json postcss.config.js
git commit -m "chore: drop postcss + autoprefixer (Tailwind v4 vite plugin handles prefixing)"
```

---

## Task 4: Document the finished UI stack

**Files:**
- Modify: `README.md` (Tech-stack "Frontend" row + a short styling note)

**Interfaces:** none — docs only.

- [ ] **Step 1: Update the Tech-stack "Frontend" row**

In `README.md`, change the Frontend row (line 42):

```md
| Frontend | React + React Router, bundled by Vite, served via Workers Static Assets      |
```
to:
```md
| Frontend | React + React Router + Tailwind v4 + shadcn/ui, bundled by Vite, served via Workers Static Assets |
```

- [ ] **Step 2: Add a one-paragraph styling note after the Tech-stack table**

Immediately after the tech-stack table (after the `| Tooling | … |` row on line 44) and before the blank line preceding `## Architecture`, add:

```md

The UI is built with **Tailwind CSS v4 + shadcn/ui** (Radix primitives copied
into `src/client/components/ui/`), themed to a bespoke dark-gold "editorial"
palette via a CSS token bridge in `src/client/index.css` — dark mode only, no
theme switcher.
```

- [ ] **Step 3: Confirm no stale build note remains**

Run: `grep -niE "postcss|autoprefixer" README.md docs/DEPLOY.md`
Expected: **no matches** — neither doc mentions PostCSS/autoprefixer, so removing the toolchain (Task 3) needs no further doc edit. `docs/DEPLOY.md`'s build step is still `npm run deploy` (Vite build), unchanged.

- [ ] **Step 4: Commit**

```bash
lineguard README.md
git add README.md
git commit -m "docs: note the Tailwind v4 + shadcn/ui frontend stack"
```

---

## Finishing the branch

After Task 4, use **superpowers:finishing-a-development-branch**: verify `npm test` green (worker + client) + `npx biome check .` clean + `npm run typecheck` clean (3 tsconfigs) + `npm run build`, then push and open the PR (`feat/shadcn-phase5`). PR body ends with:
`🤖 Generated with [Claude Code](https://claude.com/claude-code)`

Suggested PR summary: completes the shadcn/Tailwind migration (design doc §5.4 "5 收尾"). Adds the WAI-ARIA keyboard contract (roving tabindex + Arrow/Home/End, automatic activation) to the two bespoke tablists via a shared `useRovingTablist` hook; retires the last two hand-written CSS classes (`.state-msg`/`.trade-empty`) onto shared `@/shared/states` tokens and deletes them from `index.css`; drops the dead `postcss.config.js` + `autoprefixer`/`postcss` devDeps (Tailwind v4's Vite plugin prefixes via Lightning CSS); and documents the frontend stack. Call out: **zero new deps / zero new primitives / zero behaviour change beyond the a11y keyboard additions**; **tabpanel `role`/`aria-controls` wiring intentionally out of scope** (Decision §4); `index.css` is now theme + brand-soul only. After merge, optionally drive Copilot review via `/pr-workflow:copilot-iterate`.

**Final visual + RWD acceptance (design doc §5.4 "RWD 與視覺 QA 總驗收"):** on desktop + a ≤540px viewport, walk `/` (all 8 tabs incl. Grid sticky headers, StatsBar, hero, footer) and `/admin` (all 5 panels), confirming the dark-gold theme, serif display type, rarity colours, entrance animations, and every table/pill/form control are unchanged from before Phase 5.

## Self-Review (completed by author)

- **Spec coverage (design doc §5.4 "5 收尾"):** "刪殘餘 CSS" → Task 2 (`.state-msg`/`.trade-empty`; the remaining `index.css` is theme + LIVE brand rules — body gradient, `rise`, `.view`/`fadeView`, base `table` element rules, responsive `@media` — explicitly preserved per Global Constraints, not residue). "移除 autoprefixer/postcss（v4 不需）" → Task 3. "ARIA tabs a11y 補強：roving tabindex + 方向鍵焦點導航（Arrow/Home/End，公開與後台兩個 tablist）" → Task 1 (both tablists, wrap-around Left/Right + Home/End, the "tabIndex-alone-is-unreachable" note honored by shipping arrows together). "RWD 與視覺 QA 總驗收" → per-task visual smoke + the final acceptance pass above. "更新 README/DEPLOY 註記" → Task 4 (README updated; DEPLOY verified to need no change). ✔
- **Placeholder scan:** every step carries exact file contents (the full hook, the full test file, the exact PublicViewer/Admin/`states.ts`/`views/shared.tsx` edits, the exact `index.css` block to delete, the exact `package.json`/README lines) and commands with expected output. No TBD / "handle edge cases". ✔
- **Type consistency:** the single new export is `useRovingTablist<Id extends string>(ids: readonly Id[], select: (id: Id) => void)` returning a `tabProps(index, selected)` factory; consumed by exactly that name in the test harness, `PublicViewer` (`Id = TabId`, `select = selectTab`), and `Admin` (`Id = TabId`, `select = setTab`). `setTab: Dispatch<SetStateAction<TabId>>` is assignable to `(id: TabId) => void` by parameter contravariance (no cast). `STATE_MSG`/`EMPTY_MSG` are `string`; `EMPTY_MSG` re-exported through `views/shared.tsx` keeps `Trade`/`Market` imports valid. ✔
- **Behaviour-change audit:** Task 1 is the only intentional behaviour change (keyboard nav); it adds `ref`/`tabIndex`/`onKeyDown` with no prop-key collisions and leaves `onClick`/hash-sync intact. Tasks 2–4 are visual-parity / tooling / docs only — the admin render tests (text-based) and the full build/typecheck are the regression gate. ✔
- **`.view` is LIVE (the subtle one):** every `views/*.tsx` renders `<section className="view …">`, so `.view` + `@keyframes fadeView` drive the tab-switch fade and are explicitly KEPT — only `.state-msg`/`.trade-empty` are removed. Verified by `grep -rnE 'className="[^"]*\bview\b'` returning 11 live matches. ✔
- **PostCSS removal safety:** `postcss.config.js` (autoprefixer-only) is the sole direct consumer; `vite.config.ts` uses `@tailwindcss/vite` (no PostCSS ref); `postcss` survives transitively under Vite so removing the direct devDeps can't break the build — gated by `npm run build` + a gradient/sticky visual smoke. ✔
