# shadcn/ui Refactor — Phase 1 (App Shell) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Approach revision (2026-06-28):** The original plan migrated both navs to shadcn `Tabs`. During execution, adding the radix-base `Tabs` surfaced two empirical problems: (1) nova's built-in active styling is written with the `data-active:` variant, but the radix primitive sets `data-state="active"`, so the built-in active/underline styling is **inert** with the radix base; (2) the radix trigger changes value on mousedown/focus, so `fireEvent.click` (used throughout this repo's tests, incl. `app.test.tsx`) does **not** fire `onValueChange`. Both are confirmed by tests. The shell navs are therefore kept as **semantic `<button role="tab">` elements** styled with Tailwind + ARIA — `fireEvent.click` works, the gold underline is fully controllable, no new test deps. `Button` (asChild) is still used for the admin back-link. This is the lighter approach the user approved after seeing the evidence.

**Goal:** Migrate the app shell — public hero / nav / footer and the admin head / nav — from bespoke CSS to Tailwind utilities (+ shadcn `Button` for the back-link), preserving the editorial look, and delete the corresponding legacy CSS.

**Architecture:** Builds on the Phase 0 token bridge. The nav button rows become accessible `role="tablist"` groups of `<button role="tab" aria-selected>` styled with Tailwind (gold text + `after:` underline on the active one) via `cn()`. Static branding (hero, footer, containers, admin head) becomes Tailwind utility classes using the bridged `font-serif`/`font-accent`/`font-mono` + semantic-color utilities. The shared `@keyframes rise` is relocated so later-phase elements keep animating.

**Tech Stack:** Tailwind v4, shadcn/ui `Button` (radix base, nova style), React 18, React Router 7, Vitest 4, @testing-library/react.

## Global Constraints

- **Dark-only**, brand values on `:root` (no `.dark`). Established in Phase 0.
- **Brand fonts via theme utilities:** `font-serif` (Noto Serif TC), `font-accent` (Cormorant Garamond), `font-mono` (JetBrains Mono), `font-sans` (IBM Plex Sans TC).
- **Semantic colors only:** `text-primary` (gold), `text-foreground`, `text-muted-foreground`, `border-border`, etc. Never raw hex.
- **`cn()` for conditional/active classes.** No template-literal ternaries for class strings.
- **Accessibility:** nav rows use `role="tablist"`; each option is `<button type="button" role="tab" aria-selected={...}>`.
- **Preserve the `rise` entrance animation** (hero/stats/tabs/main share `@keyframes rise`). Do NOT delete the keyframes when deleting HERO.
- **Do NOT touch:** `collection.ts`, `api.ts`, `src/shared/**`, `src/worker/**`, view/panel components other than the shell.
- **Per commit:** `npm run lint` · `npm run typecheck` · `npm test` · `npm run build` all green; then `lineguard` the changed files.
- **Commits:** Conventional Commits ending with `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
- **Visual parity:** each task ends with a visual smoke check vs. pre-migration (same-spirit; minor refinement allowed).

---

## File Structure

| File | Responsibility | Action |
| --- | --- | --- |
| `src/client/admin/Admin.tsx` | admin shell + nav | Modify |
| `src/client/admin/admin.css` | delete shell/nav rules (lines 3–64) | Modify |
| `src/client/PublicViewer.tsx` | hero, nav, footer, container | Modify |
| `src/client/index.css` | relocate `@keyframes rise`; delete `.container`, HERO, TABS, FOOTER + their `@media` rules | Modify |
| `test/client/admin.test.tsx` | admin shell tests | Modify if selectors change |
| `test/client/app.test.tsx` | public shell tests | Verify (text-based, fireEvent.click — expected to pass) |

A shared active-tab class helper keeps the two nav rows DRY:

```tsx
// Inlined in each file (small, local). The active trigger gets gold text + a
// gold underline via an ::after; inactive is dim and lightens on hover.
function tabClass(active: boolean, extra = "") {
  return cn(
    "relative cursor-pointer border-0 bg-transparent font-sans tracking-[0.15em] text-muted-foreground transition-colors hover:text-foreground",
    "after:absolute after:bottom-[-0.5px] after:left-1/2 after:h-px after:w-full after:-translate-x-1/2 after:bg-primary after:transition-opacity",
    active ? "text-primary after:opacity-100" : "after:opacity-0",
    extra,
  );
}
```

---

## Task 1: Migrate the admin shell + nav (Tailwind + ARIA tabs + Button back-link)

**Files:**
- Modify: `src/client/admin/Admin.tsx`
- Modify: `src/client/admin/admin.css` (delete `.admin`, `.admin-head`, `.admin-title`, `.admin-back`, `.admin-back:hover`, `.admin-nav`, `.admin-tab`, `.admin-tab:hover`, `.admin-tab.active`, `.admin-tab.active::after` — lines 3–64)
- Modify: `test/client/admin.test.tsx` (if selectors change)

**Interfaces:**
- Consumes: `Button` (Phase 0), `cn` from `@/lib/utils`.
- Produces: admin shell via Tailwind; nav as `role="tablist"` of `role="tab"` buttons; tab state stays local `useState<TabId>`.

- [ ] **Step 1: Rewrite `Admin.tsx`**

Replace the file body (keep the `TABS`/`TabId` definitions and panel imports):
```tsx
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import "./admin.css";
import { AddCards } from "./AddCards";
import { History } from "./History";
import { ManageCards } from "./ManageCards";
import { Openings } from "./Openings";
import { PendingTrades } from "./PendingTrades";

const TABS = [
  { id: "add", label: "開箱新增" },
  { id: "manage", label: "卡片管理" },
  { id: "reserve", label: "交換預約" },
  { id: "openings", label: "開箱成本" },
  { id: "history", label: "交易歷史" },
] as const;

type TabId = (typeof TABS)[number]["id"];

export default function Admin() {
  const [tab, setTab] = useState<TabId>("add");

  return (
    <div className="mx-auto max-w-[940px] px-7 pt-14 pb-24">
      <div className="flex flex-wrap items-baseline justify-between gap-2.5">
        <h1 className="font-serif text-[26px] font-medium tracking-[0.06em] text-foreground">
          管理後台
        </h1>
        <Button
          asChild
          variant="link"
          className="h-auto p-0 font-accent text-sm italic tracking-[0.1em] text-muted-foreground hover:text-primary"
        >
          <a href="/">← 回到收藏清冊</a>
        </Button>
      </div>

      <nav
        role="tablist"
        className="mt-6 mb-8 flex flex-wrap border-b border-border"
      >
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              "relative cursor-pointer border-0 bg-transparent px-[22px] pt-3.5 pb-3 font-sans text-sm tracking-[0.1em] text-muted-foreground transition-colors hover:text-foreground",
              "after:absolute after:bottom-[-0.5px] after:left-0 after:h-px after:w-full after:bg-primary after:transition-opacity",
              tab === t.id ? "text-primary after:opacity-100" : "after:opacity-0",
            )}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {tab === "add" ? <AddCards /> : null}
      {tab === "manage" ? <ManageCards /> : null}
      {tab === "reserve" ? <PendingTrades /> : null}
      {tab === "openings" ? <Openings /> : null}
      {tab === "history" ? <History /> : null}
    </div>
  );
}
```
(Note: `import "./admin.css";` stays — admin.css still holds the panel/form/table styles used by the panels below; only the shell/nav rules are deleted in Step 2.)

- [ ] **Step 2: Delete the migrated admin shell CSS**

In `src/client/admin/admin.css`, delete lines 3–64 (`.admin` … `.admin-tab.active::after`). Leave the panel/field/btn/table rules below.

- [ ] **Step 4: Run admin tests; fix selectors if needed**

Run: `npx vitest run --config vitest.client.config.ts test/client/admin.test.tsx`
Expected: PASS. If a test clicked a tab by `.admin-tab`/button role, update to `screen.getByRole("tab", { name: "<label>" })`. `fireEvent.click` works (plain button). Labels unchanged.

- [ ] **Step 5: Visual smoke check** — `npm run dev` → `/admin`: serif title, italic gold-hover back-link, 5-tab underline nav (active gold + underline), switching works.

- [ ] **Step 6: Full gate + commit**

`npm run lint && npm run typecheck && npm test && npm run build` (green), then:
```bash
lineguard src/client/admin/Admin.tsx src/client/admin/admin.css
git add src/client/admin/Admin.tsx src/client/admin/admin.css test/client/admin.test.tsx
git commit -m "$(cat <<'EOF'
feat: migrate admin shell to Tailwind + ARIA tabs + Button back-link

Replace the bespoke .admin shell/nav CSS with Tailwind utilities, an accessible
role=tablist button nav (gold active underline), and a Button asChild
back-link. Delete the migrated admin.css shell/nav rules. Same editorial look.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Migrate the public hero, container, and footer

**Files:**
- Modify: `src/client/PublicViewer.tsx`
- Modify: `src/client/index.css` (relocate `@keyframes rise`; delete `.container`, HERO block, FOOTER block; delete `.container`/`.title`/`.subtitle` in the `@media (max-width:540px)` block)

**Interfaces:**
- Produces: hero/footer/container via Tailwind; `StatsBar` still rendered as a child (untouched — Phase 2).

- [ ] **Step 1: Relocate `@keyframes rise`**

In `src/client/index.css`, move the `@keyframes rise { ... }` block (currently inside HERO) to just after the `@theme inline { ... }` block (a stable shared-animations spot), so `.stats`/`main`/the migrated hero keep animating after HERO is deleted.

- [ ] **Step 2: Tailwind-ize container + hero in `PublicViewer.tsx`**

Replace:
```tsx
    <div className="container">
      <header className="hero">
        <p className="kicker">A Living Archive · 永久收藏</p>
        <h1 className="title">子午計畫</h1>
        <p className="subtitle">Meridian Project · Card Collection</p>
        {matrix ? <StatsBar m={matrix} /> : null}
      </header>
```
with:
```tsx
    <div className="mx-auto max-w-[820px] px-7 pt-20 pb-24 max-sm:px-[18px] max-sm:pt-14 max-sm:pb-[72px]">
      <header className="mb-16 text-center animate-[rise_0.7s_ease_0.05s_both]">
        <p className="mb-7 font-accent text-sm italic uppercase tracking-[0.35em] text-primary opacity-85 before:opacity-60 before:content-['—'] after:opacity-60 after:content-['—']">
          <span className="mx-2">A Living Archive · 永久收藏</span>
        </p>
        <h1 className="mb-[18px] font-serif text-[clamp(52px,9vw,84px)] font-medium leading-none tracking-[0.12em] text-foreground max-sm:tracking-[0.08em]">
          子午計畫
        </h1>
        <p className="font-accent text-[19px] italic tracking-[0.04em] text-muted-foreground max-sm:text-base">
          Meridian Project · Card Collection
        </p>
        {matrix ? <StatsBar m={matrix} /> : null}
      </header>
```
(Verify the kicker em-dash spacing visually in Step 5; nudge `mx-2` / content if needed.)

- [ ] **Step 3: Tailwind-ize the footer**

Replace:
```tsx
      <footer>
        <span>子午計畫 · Meridian Project</span>
        <span className="divider">·</span>
        <span className="accent-mark">⌘</span>
        <span className="divider">·</span>
        <span>Curated by hydai</span>
      </footer>
```
with:
```tsx
      <footer className="mt-[72px] border-t border-border pt-7 text-center text-xs tracking-[0.12em] text-muted-foreground">
        <span>子午計畫 · Meridian Project</span>
        <span className="mx-3 opacity-50">·</span>
        <span className="mx-0.5 inline-block font-accent italic text-primary">⌘</span>
        <span className="mx-3 opacity-50">·</span>
        <span>Curated by hydai</span>
      </footer>
```
(Footer text was `--text-tertiary`; `text-muted-foreground` is the nearest semantic token — same dim spirit. Verify in Step 5.)

- [ ] **Step 4: Delete the migrated CSS**

In `src/client/index.css`: delete `.container { … }`; the HERO block (`.hero`, `.kicker`, `.kicker::before,::after`, `.kicker::after`, `.title`, `.subtitle`) but NOT the relocated `@keyframes rise`; the FOOTER block (`footer`, `footer .divider`, `footer .accent-mark`). Inside `@media (max-width:540px)`, delete the `.container`, `.title`, `.subtitle` rules.

- [ ] **Step 5: Visual smoke check** — `/`: gold em-dash kicker, big serif title (clamp on resize), italic subtitle, footer with gold ⌘.

- [ ] **Step 6: Public shell test** — `npx vitest run --config vitest.client.config.ts test/client/app.test.tsx`; expected PASS (text queries).

- [ ] **Step 7: Full gate + commit**

```bash
lineguard src/client/PublicViewer.tsx src/client/index.css
git add src/client/PublicViewer.tsx src/client/index.css
git commit -m "$(cat <<'EOF'
feat: migrate public hero/container/footer to Tailwind

Replace .container/.hero/.kicker/.title/.subtitle/footer CSS with Tailwind
utilities using the bridged serif/accent fonts and semantic colors; relocate
@keyframes rise so stats/main keep animating. Same editorial look.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Migrate the public nav to Tailwind + ARIA tabs (hash-synced)

**Files:**
- Modify: `src/client/PublicViewer.tsx` (`<nav className="tabs">`)
- Modify: `src/client/index.css` (delete TABS block; delete `.tab`/`.tab .tab-en` in the `@media` block)

**Interfaces:**
- Consumes: existing `selectTab(id)` + `tab` state (hash sync preserved); `cn`.
- Produces: nav as `role="tablist"` of two-line `role="tab"` buttons; content still via `ActiveView`.

- [ ] **Step 1: Add the `cn` import to `PublicViewer.tsx`**

Add at the top: `import { cn } from "@/lib/utils";`

- [ ] **Step 2: Replace the nav**

Replace:
```tsx
      <nav className="tabs">
        {TABS.map((t) => (
          <button
            type="button"
            key={t.id}
            className={`tab ${tab === t.id ? "active" : ""}`}
            onClick={() => selectTab(t.id)}
          >
            {t.zh}
            <span className="tab-en">{t.en}</span>
          </button>
        ))}
      </nav>
```
with:
```tsx
      <nav
        role="tablist"
        className="mt-16 mb-12 flex flex-wrap justify-center border-b border-border animate-[rise_0.7s_ease_0.35s_both]"
      >
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => selectTab(t.id)}
            className={cn(
              "relative flex cursor-pointer flex-col items-center gap-1 border-0 bg-transparent px-7 pt-[18px] pb-4 font-sans text-sm tracking-[0.15em] text-muted-foreground transition-colors hover:text-foreground max-sm:px-3.5 max-sm:text-[13px]",
              "after:absolute after:bottom-[-0.5px] after:left-1/2 after:h-px after:w-full after:-translate-x-1/2 after:bg-primary after:transition-opacity",
              tab === t.id ? "text-primary after:opacity-100" : "after:opacity-0",
            )}
          >
            {t.zh}
            <span
              className={cn(
                "font-accent text-[11px] italic uppercase tracking-[0.18em] transition-opacity max-sm:text-[10px]",
                tab === t.id ? "opacity-90" : "opacity-60",
              )}
            >
              {t.en}
            </span>
          </button>
        ))}
      </nav>
```

- [ ] **Step 3: Delete the migrated TABS CSS**

In `src/client/index.css`, delete the TABS block (`.tabs`, `.tab`, `.tab:hover`, `.tab .tab-en`, `.tab.active`, `.tab.active .tab-en`, `.tab.active::after`). Inside `@media (max-width:540px)`, delete the `.tab` and `.tab .tab-en` rules.

- [ ] **Step 4: Run the tab-interaction test**

Run: `npx vitest run --config vitest.client.config.ts test/client/app.test.tsx`
Expected: PASS — the "交易看板 tab" test does `fireEvent.click(screen.getByText("交易看板"))`; the plain `<button onClick>` fires `selectTab`, switching to the market view. (No radix activation quirk.)

- [ ] **Step 5: Visual smoke check** — `/`: centered two-line tabs (zh + italic en), bottom border, active gold + underline, hover lightens, click switches view + updates `#hash`.

- [ ] **Step 6: Full gate + commit**

```bash
lineguard src/client/PublicViewer.tsx src/client/index.css
git add src/client/PublicViewer.tsx src/client/index.css
git commit -m "$(cat <<'EOF'
feat: migrate public nav to Tailwind + ARIA tabs (hash-synced, two-line)

Replace the bespoke .tabs button row with an accessible role=tablist of
two-line (zh + italic en) buttons: gold active underline, location.hash sync
preserved, content still via ActiveView. Delete the migrated TABS CSS.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Phase 1 acceptance gate

- [ ] **Step 1: Full suite** — `npm run lint && npm run typecheck && npm test && npm run build`; every command exits 0.

- [ ] **Step 2: Cross-surface visual check** — `/` (hero, two-line tabs, footer) and `/admin` (head, back-link, nav) match the pre-Phase-1 look; resize to mobile width and confirm the `max-sm:` rules reproduce the old `@media (max-width:540px)` behavior.

Phase 1 acceptance checklist:
- [ ] Public + admin navs are `role="tablist"` with `role="tab"` + `aria-selected`; `fireEvent.click` switches tabs.
- [ ] Admin back-link is a `Button asChild` anchor.
- [ ] Hero/footer/container/admin-head render via Tailwind (no `.container`/`.hero`/`.tabs`/`footer`/`.admin*` shell CSS remains).
- [ ] `@keyframes rise` relocated; entrance animation still plays.
- [ ] No visual regression vs. Phase 0 on `/` or `/admin`, desktop and mobile.
- [ ] `npm test` green (worker + client).

- [ ] **Step 3: Push** — `git push` (updates the open PR #1).

## Self-Review

**1. Spec coverage (design doc §5.4 Phase 1):** hero/footer/nav + admin shell/nav → Tailwind (+ `Button` back-link); delete HERO/TABS/FOOTER/admin-shell CSS. The spec named shadcn `Tabs`; the revision note above documents the evidence-based switch to ARIA buttons (same accessibility intent, no radix friction). ✓ `@keyframes rise` preserved. ✓

**2. Placeholder scan:** All JSX/className edits show full code; CSS deletions name exact selectors; visual-verify steps name exact elements. No TBD/TODO.

**3. Type consistency:** `tabClass` helper is illustrative; each file inlines the `cn(...)` directly. `selectTab(id: TabId)`/`tab: TabId` (PublicViewer) and `setTab`/`TabId` (Admin) are existing symbols. Labels/text preserved so text-query + fireEvent.click tests survive.

## Execution Handoff

Phase 1 of the shell. Phases 2–5 each get their own just-in-time plan after this lands.
