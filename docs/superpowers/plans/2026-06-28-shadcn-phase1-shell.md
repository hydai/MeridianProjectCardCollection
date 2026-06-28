# shadcn/ui Refactor — Phase 1 (App Shell) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **REQUIRED at execution time:** Invoke the `shadcn` skill before Task 1 to confirm the current `add tabs` command and the generated Tabs API (radix base).

**Goal:** Migrate the app shell — public hero / nav tabs / footer and the admin head / nav — from bespoke CSS to Tailwind utilities + shadcn `Tabs`/`Button`, preserving the editorial look, and delete the corresponding legacy CSS.

**Architecture:** Builds on the Phase 0 token bridge. Navs become shadcn `Tabs` (accessibility: real `tablist`/keyboard nav) restyled to the editorial underline; the admin back-link becomes `Button asChild`. Static branding (hero, footer, containers) becomes Tailwind utility classes using the bridged `font-serif`/`font-accent`/`font-mono` + semantic-color utilities. The shared `@keyframes rise` is relocated so later-phase elements keep animating.

**Tech Stack:** Tailwind v4, shadcn/ui (radix base, nova style), React 18, React Router 7, Vitest 4, @testing-library/react.

## Global Constraints

- **Dark-only**, brand values on `:root` (no `.dark`). Established in Phase 0.
- **Brand fonts via theme utilities:** `font-serif` (Noto Serif TC), `font-accent` (Cormorant Garamond), `font-mono` (JetBrains Mono), `font-sans` (IBM Plex Sans TC).
- **Semantic colors only:** `text-primary` (gold), `text-foreground`, `text-muted-foreground`, `border-border`, `bg-card`, etc. Never raw hex.
- **shadcn rules:** `className` for layout only; `cn()` for conditional classes; `TabsTrigger` must be inside `TabsList`; use `asChild` for custom trigger elements (anchors).
- **Preserve the `rise` entrance animation** (hero/stats/tabs/main share `@keyframes rise`). Do NOT delete the keyframes when deleting HERO.
- **Do NOT touch:** `collection.ts`, `api.ts`, `src/shared/**`, `src/worker/**`, view components other than the shell (StatsBar/Grid/tables/etc. are later phases — keep rendering them as-is).
- **Per commit:** `npm run lint` · `npm run typecheck` · `npm test` · `npm run build` all green; then `lineguard` the changed files.
- **Commits:** Conventional Commits ending with `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
- **Visual parity:** each task ends with a visual smoke check vs. pre-migration (same-spirit; minor refinement allowed).

---

## File Structure

| File | Responsibility | Action |
| --- | --- | --- |
| `src/client/components/ui/tabs.tsx` | Tabs primitive | Create (shadcn CLI) |
| `src/client/components/ui/button.tsx` | Button primitive | Exists (Phase 0) |
| `src/client/admin/Admin.tsx` | admin shell + nav | Modify |
| `src/client/admin/admin.css` | delete shell/nav rules | Modify |
| `src/client/PublicViewer.tsx` | hero, nav tabs, footer, container | Modify |
| `src/client/index.css` | delete HERO/TABS/FOOTER + container + their responsive rules; relocate `@keyframes rise` | Modify |
| `test/client/admin.test.tsx` | admin shell tests | Modify if selectors change |
| `test/client/app.test.tsx` | public shell tests | Verify (text-based; expected to pass unchanged) |

---

## Task 1: Add the shadcn Tabs primitive

**Files:**
- Create: `src/client/components/ui/tabs.tsx`
- Test: `test/client/components/ui.test.tsx` (extend)

**Interfaces:**
- Produces: `Tabs` (`value`, `onValueChange`), `TabsList`, `TabsTrigger` (`value`) from `@/components/ui/tabs`. Consumed by Tasks 2 and 4.

- [ ] **Step 1: Generate Tabs via the shadcn CLI**

Run:
```bash
npx shadcn@latest add tabs --yes
```
Expected: creates `src/client/components/ui/tabs.tsx` importing `@/lib/utils`. Decline any `index.css` overwrite.

- [ ] **Step 2: Read the generated file and format to repo style**

Read `src/client/components/ui/tabs.tsx`, confirm it exports `Tabs`, `TabsList`, `TabsTrigger`, `TabsContent`, then run:
```bash
npm run format
```

- [ ] **Step 3: Extend the UI test with a Tabs render/interaction test**

Append to `test/client/components/ui.test.tsx`:
```tsx
import { fireEvent } from "@testing-library/react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

describe("Tabs", () => {
  it("renders triggers and fires onValueChange on click", () => {
    const onValueChange = vi.fn();
    render(
      <Tabs value="a" onValueChange={onValueChange}>
        <TabsList>
          <TabsTrigger value="a">甲</TabsTrigger>
          <TabsTrigger value="b">乙</TabsTrigger>
        </TabsList>
      </Tabs>,
    );
    fireEvent.click(screen.getByRole("tab", { name: "乙" }));
    expect(onValueChange).toHaveBeenCalledWith("b");
  });
});
```
(Add `vi` and `fireEvent` to the existing imports at the top of the file.)

- [ ] **Step 4: Run the UI tests**

Run:
```bash
npx vitest run --config vitest.client.config.ts test/client/components/ui.test.tsx
```
Expected: all tests PASS (Button, Card, Tabs).

- [ ] **Step 5: Commit**

```bash
lineguard src/client/components/ui/tabs.tsx test/client/components/ui.test.tsx
git add src/client/components/ui/tabs.tsx test/client/components/ui.test.tsx
git commit -m "$(cat <<'EOF'
feat: add shadcn Tabs primitive (radix base)

Generate Tabs into @/components/ui for the shell nav migration; render +
onValueChange test added. Not yet wired into pages.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Migrate the admin shell + nav

**Files:**
- Modify: `src/client/admin/Admin.tsx`
- Modify: `src/client/admin/admin.css` (delete `.admin`, `.admin-head`, `.admin-title`, `.admin-back`, `.admin-back:hover`, `.admin-nav`, `.admin-tab`, `.admin-tab:hover`, `.admin-tab.active`, `.admin-tab.active::after`)
- Modify: `test/client/admin.test.tsx` (if selectors change)

**Interfaces:**
- Consumes: `Tabs`/`TabsList`/`TabsTrigger` (Task 1), `Button` (Phase 0).
- Produces: admin shell rendered with Tailwind + shadcn; tab state still local `useState<TabId>`.

- [ ] **Step 1: Rewrite `Admin.tsx` shell with Tailwind + shadcn**

Replace the `return (...)` block in `src/client/admin/Admin.tsx` with:
```tsx
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
      <Tabs value={tab} onValueChange={(v) => setTab(v as TabId)} className="mt-6 mb-8">
        <TabsList className="flex h-auto w-full flex-wrap justify-start rounded-none border-b border-border bg-transparent p-0">
          {TABS.map((t) => (
            <TabsTrigger
              key={t.id}
              value={t.id}
              className="relative rounded-none border-0 bg-transparent px-[22px] pt-3.5 pb-3 font-sans text-sm tracking-[0.1em] text-muted-foreground shadow-none transition-colors data-[state=active]:bg-transparent data-[state=active]:text-primary data-[state=active]:shadow-none data-[state=active]:after:absolute data-[state=active]:after:-bottom-px data-[state=active]:after:left-0 data-[state=active]:after:h-px data-[state=active]:after:w-full data-[state=active]:after:bg-primary hover:text-foreground"
            >
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {tab === "add" ? <AddCards /> : null}
      {tab === "manage" ? <ManageCards /> : null}
      {tab === "reserve" ? <PendingTrades /> : null}
      {tab === "openings" ? <Openings /> : null}
      {tab === "history" ? <History /> : null}
    </div>
  );
```

- [ ] **Step 2: Update imports in `Admin.tsx`**

Ensure the top of `src/client/admin/Admin.tsx` imports the primitives (keep existing panel imports):
```tsx
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import "./admin.css";
import { AddCards } from "./AddCards";
import { History } from "./History";
import { ManageCards } from "./ManageCards";
import { Openings } from "./Openings";
import { PendingTrades } from "./PendingTrades";
```
(Keep `import "./admin.css"` — admin.css still holds panel/form/table styles for later phases.)

- [ ] **Step 3: Delete the migrated admin shell CSS**

In `src/client/admin/admin.css`, delete the rules for `.admin`, `.admin-head`, `.admin-title`, `.admin-back`, `.admin-back:hover`, `.admin-nav`, `.admin-tab`, `.admin-tab:hover`, `.admin-tab.active`, and `.admin-tab.active::after` (the shell/nav block, lines 3–64). Leave the panel/field/btn/table rules below intact.

- [ ] **Step 4: Run admin tests; fix selectors if needed**

Run:
```bash
npx vitest run --config vitest.client.config.ts test/client/admin.test.tsx
```
Expected: PASS. If a test selected a tab via `.admin-tab` class or button role and now needs the tab role, update it to `screen.getByRole("tab", { name: "<label>" })`. Tab labels are unchanged (開箱新增 / 卡片管理 / 交換預約 / 開箱成本 / 交易歷史).

- [ ] **Step 5: Visual smoke check (admin)**

`npm run dev`, open `/admin`. Confirm: title `管理後台` (serif), the italic `← 回到收藏清冊` link (gold on hover), the 5-tab underline nav (active tab gold + underline), and switching tabs works.

- [ ] **Step 6: Full gate + commit**

Run: `npm run lint && npm run typecheck && npm test && npm run build` (all green), then:
```bash
lineguard src/client/admin/Admin.tsx src/client/admin/admin.css
git add src/client/admin/Admin.tsx src/client/admin/admin.css test/client/admin.test.tsx
git commit -m "$(cat <<'EOF'
feat: migrate admin shell to Tailwind + shadcn Tabs/Button

Replace the bespoke .admin shell/nav CSS with Tailwind utilities, a shadcn
Tabs underline nav, and a Button asChild back-link. Delete the migrated
admin.css shell/nav rules. Same editorial look.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Migrate the public hero, container, and footer

**Files:**
- Modify: `src/client/PublicViewer.tsx` (container wrapper, `<header className="hero">`, `<footer>`)
- Modify: `src/client/index.css` (relocate `@keyframes rise`; delete `.container`, HERO block lines 135–191 except the relocated keyframes, FOOTER block 520–543; delete `.container`/`.title`/`.subtitle` rules inside the `@media (max-width:540px)` block)

**Interfaces:**
- Consumes: theme utilities from Phase 0.
- Produces: hero/footer/container rendered via Tailwind; `StatsBar` still rendered as a child (untouched — Phase 2).

- [ ] **Step 1: Relocate `@keyframes rise` so it survives HERO deletion**

In `src/client/index.css`, cut the `@keyframes rise { ... }` block (currently inside HERO, lines 143–152) and paste it immediately after the `@theme inline { ... }` block near the top (a stable "shared animations" location). This keeps `.stats`, `main`, and the migrated hero/tabs animating across phases.

- [ ] **Step 2: Tailwind-ize the container + hero in `PublicViewer.tsx`**

In `src/client/PublicViewer.tsx`, change the outer wrapper and hero. Replace:
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
(The kicker em-dashes are rendered with `before:content-['—']`/`after:content-['—']` flanking a `mx-2` inner span for spacing — verify visually in Step 5 and nudge spacing if needed.)

- [ ] **Step 3: Tailwind-ize the footer in `PublicViewer.tsx`**

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
(Footer text color was `--text-tertiary`; `text-muted-foreground` is the nearest semantic token and reads as the same dim tone — acceptable under same-spirit. Verify in Step 5.)

- [ ] **Step 4: Delete the migrated CSS**

In `src/client/index.css`:
- Delete the `.container { ... }` rule.
- Delete the HERO block: `/* ----- HERO ----- */`, `.hero`, `.kicker`, `.kicker::before,::after`, `.kicker::after`, `.title`, `.subtitle` (but NOT `@keyframes rise` — already relocated in Step 1).
- Delete the FOOTER block: `footer`, `footer .divider`, `footer .accent-mark`.
- Inside `@media (max-width: 540px)`, delete the `.container`, `.title`, `.subtitle` rules (now handled by `max-sm:` utilities). Leave the `.stat*`, `.tab*`, `.card*`, `table`, grid rules (later phases).

- [ ] **Step 5: Visual smoke check (public hero/footer)**

`npm run dev`, open `/`. Confirm: the gold italic kicker with em-dashes, the large serif `子午計畫` title (clamp scaling on resize), the italic subtitle, and the footer with gold `⌘` all match the previous look. Adjust kicker `mx-*` / em-dash spacing if needed.

- [ ] **Step 6: Run the public shell test**

Run:
```bash
npx vitest run --config vitest.client.config.ts test/client/app.test.tsx
```
Expected: PASS unchanged (`子午計畫`, `張總計`, error text are text queries).

- [ ] **Step 7: Full gate + commit**

Run `npm run lint && npm run typecheck && npm test && npm run build` (green), then:
```bash
lineguard src/client/PublicViewer.tsx src/client/index.css
git add src/client/PublicViewer.tsx src/client/index.css
git commit -m "$(cat <<'EOF'
feat: migrate public hero/container/footer to Tailwind

Replace .container/.hero/.kicker/.title/.subtitle/footer CSS with Tailwind
utilities using the bridged serif/accent fonts and semantic colors; relocate
@keyframes rise so stats/tabs/main keep animating. Same editorial look.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Migrate the public nav tabs to shadcn Tabs (hash-synced)

**Files:**
- Modify: `src/client/PublicViewer.tsx` (`<nav className="tabs">`)
- Modify: `src/client/index.css` (delete TABS block 243–303; delete `.tab`/`.tab .tab-en` rules in the `@media` block)

**Interfaces:**
- Consumes: `Tabs`/`TabsList`/`TabsTrigger` (Task 1); existing `selectTab(id)` + `tab` state (unchanged — hash sync preserved).
- Produces: nav rendered as shadcn Tabs; content still via `ActiveView` (NOT `TabsContent`).

- [ ] **Step 1: Replace the nav with shadcn Tabs**

In `src/client/PublicViewer.tsx`, replace:
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
      <Tabs
        value={tab}
        onValueChange={(v) => selectTab(v as TabId)}
        className="mt-16 mb-12"
      >
        <TabsList className="flex h-auto w-full flex-wrap justify-center gap-0 rounded-none border-b border-border bg-transparent p-0">
          {TABS.map((t) => (
            <TabsTrigger
              key={t.id}
              value={t.id}
              className="relative flex flex-col items-center gap-1 rounded-none border-0 bg-transparent px-7 pt-[18px] pb-4 font-sans text-sm tracking-[0.15em] text-muted-foreground shadow-none transition-colors hover:text-foreground data-[state=active]:bg-transparent data-[state=active]:text-primary data-[state=active]:shadow-none data-[state=active]:after:absolute data-[state=active]:after:-bottom-px data-[state=active]:after:left-1/2 data-[state=active]:after:h-px data-[state=active]:after:w-full data-[state=active]:after:-translate-x-1/2 data-[state=active]:after:bg-primary max-sm:px-3.5 max-sm:text-[13px]"
            >
              {t.zh}
              <span className="font-accent text-[11px] italic uppercase tracking-[0.18em] opacity-60 max-sm:text-[10px] in-data-[state=active]:opacity-90">
                {t.en}
              </span>
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
```

- [ ] **Step 2: Add the Tabs import to `PublicViewer.tsx`**

Add to the imports at the top:
```tsx
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
```

- [ ] **Step 3: Delete the migrated TABS CSS**

In `src/client/index.css`, delete the TABS block (`/* ----- TABS ----- */`, `.tabs`, `.tab`, `.tab:hover`, `.tab .tab-en`, `.tab.active`, `.tab.active .tab-en`, `.tab.active::after`). Inside the `@media (max-width: 540px)` block, delete the `.tab` and `.tab .tab-en` rules (now `max-sm:` utilities).

- [ ] **Step 4: Run the tab-interaction test**

Run:
```bash
npx vitest run --config vitest.client.config.ts test/client/app.test.tsx
```
Expected: PASS — the "交易看板 tab" test clicks `getByText("交易看板")` (still the trigger text) and asserts `500 元`; shadcn Tabs fires `onValueChange` → `selectTab`. If the click no longer switches, confirm the test targets the trigger (use `screen.getByRole("tab", { name: /交易看板/ })`).

- [ ] **Step 5: Visual smoke check (public tabs)**

`npm run dev`, open `/`. Confirm: centered two-line tabs (zh + italic en), bottom border, active tab gold with underline, hover lightens, and clicking switches the view + updates the URL hash.

- [ ] **Step 6: Full gate + commit**

Run `npm run lint && npm run typecheck && npm test && npm run build` (green), then:
```bash
lineguard src/client/PublicViewer.tsx src/client/index.css
git add src/client/PublicViewer.tsx src/client/index.css
git commit -m "$(cat <<'EOF'
feat: migrate public nav to shadcn Tabs (hash-synced, two-line)

Replace the bespoke .tabs button row with a shadcn Tabs underline nav that
keeps the zh+italic-en two-line label, gold active underline, and location.hash
sync. Content still rendered via ActiveView. Delete the migrated TABS CSS.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Phase 1 acceptance gate

**Files:** none (verification only).

- [ ] **Step 1: Full suite**

Run, in order:
```bash
npm run lint && npm run typecheck && npm test && npm run build
```
Expected: every command exits 0.

- [ ] **Step 2: Cross-surface visual check**

`npm run dev`. Confirm `/` (hero, two-line tabs, footer) and `/admin` (head, back-link, nav) match the pre-Phase-1 look. Resize to mobile width; confirm the `max-sm:` rules reproduce the old `@media (max-width:540px)` behavior for container/title/subtitle/tabs.

Phase 1 acceptance checklist:
- [ ] Public nav + admin nav are shadcn `Tabs` (role `tablist`/`tab`); keyboard arrow-nav works.
- [ ] Admin back-link is a `Button asChild` anchor.
- [ ] Hero/footer/container/admin-head render via Tailwind utilities (no `.container`/`.hero`/`.tabs`/`footer`/`.admin*` shell CSS remains).
- [ ] `@keyframes rise` relocated; entrance animation still plays on hero (and remaining `.stats`/`main`).
- [ ] No visual regression vs. Phase 0 on `/` or `/admin`, desktop and mobile widths.
- [ ] `npm test` green (worker + client).

- [ ] **Step 3: Push (branch already has an open PR #1)**

```bash
git push
```
The existing PR updates automatically with the Phase 1 commits.

## Self-Review

**1. Spec coverage (design doc §5.4 Phase 1):** hero/footer/tabs + admin shell/nav → Tailwind + shadcn `Tabs`/`Button` (Tasks 2–4); delete HERO/TABS/FOOTER/admin-shell CSS (Tasks 2–4 delete steps). ✓ `@keyframes rise` preservation (Task 3 Step 1) — not in the spec but required by the existing code. ✓

**2. Placeholder scan:** Tabs component body is CLI-generated (canonical). All JSX/className edits show full code. Visual-verify steps name the exact elements to check. No TBD/TODO.

**3. Type consistency:** `Tabs`/`TabsList`/`TabsTrigger` (Task 1) consumed in Tasks 2/4. `selectTab(id: TabId)` and `tab: TabId` are existing `PublicViewer` symbols; `onValueChange` casts `v as TabId`. Admin `setTab(v as TabId)` matches its existing `TabId`. Labels/text preserved so text-query tests survive.

## Execution Handoff

Phase 1 of the shell. Phases 2–5 each get their own just-in-time plan after this lands.
