# shadcn/ui Refactor — Phase 3a (Card + Badge + Wishlist) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **REQUIRED at execution time:** Invoke the `shadcn` skill before Task 1 to confirm the current `add card badge progress` commands and the generated APIs (radix base). Read every generated component before wiring it. **Data views need real data — verify visually with `npm run build` + `npm run preview` (wrangler dev + local D1 on a port like 8787/8788), NOT `npm run dev` (vite has no worker/data).**

> **Phase 3 is split** (it is the largest phase, with cross-view CSS coupling): **3a** = Card + Badge + Wishlist (this plan); **3b** = Market + Trade (shared `trade-*` CSS); **3c** = Glance; **3d** = Grid (bespoke checklist). Each is independently shippable on the existing PR #1.

**Goal:** Migrate the shared `.card` to shadcn `Card`, introduce `Badge` (rarity chips) and `Progress`, migrate the Wishlist view, and fix the Market loading regression — deleting the CARD and WISHLIST CSS.

**Architecture:** Builds on Phases 0–2 (token bridge, `@layer legacy` below `utilities`). `MissChip` (used by Wishlist/Market/Trade) becomes a rarity `Badge`. The `.card` wrapper (used by `tables.tsx` and `Wishlist.tsx`) becomes shadcn `Card` with the serif/mono title variants as Tailwind. Wishlist's progress bar becomes shadcn `Progress`.

**Tech Stack:** Tailwind v4, shadcn/ui `Card`/`Badge`/`Progress` (radix base), React 18, Vitest 4.

## Global Constraints

- **Dark-only**; semantic + rarity color utilities only (`text-rarity-*`, `bg-card`, `text-muted-foreground`, `border-border`, `text-primary`). Brand soft tints via the legacy `--*-soft` tokens where needed.
- **Brand fonts via utilities:** `font-serif`, `font-accent`, `font-mono`, `font-sans`.
- **`cn()` for conditional/rarity classes** (mirror the `NumCell` rarity-array pattern from `shared.tsx`).
- **Do NOT touch:** `collection.ts`, `api.ts`, `src/shared/**`, `src/worker/**`, and the views deferred to 3b–3d (Market beyond the loading fix, Trade, Glance, Grid) — their legacy CSS stays.
- **Keep shared legacy CSS** that 3b–3d still need: generic `table`/`th`/`td` (Glance/Grid/Trade), `trade-*`/`market-*` (Market/Trade), GLANCE/GRID sections, `.view`/`main`/`fadeView` (VIEWS), RESPONSIVE.
- **Per commit:** `npm run lint` · `npm run typecheck` · `npm test` · `npm run build` green; then `lineguard`.
- **Commits:** Conventional Commits ending with `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

---

## File Structure

| File | Responsibility | Action |
| --- | --- | --- |
| `src/client/components/ui/{card,badge,progress}.tsx` | primitives | Create (shadcn CLI) |
| `src/client/views/shared.tsx` | `MissChip` → rarity `Badge` | Modify |
| `src/client/views/tables.tsx` | `.card` wrapper → shadcn `Card` | Modify |
| `src/client/views/Wishlist.tsx` | full migration (Card + Progress + Tailwind) | Modify |
| `src/client/views/Market.tsx` | fix `.state-msg` loading regression | Modify |
| `src/client/index.css` | delete CARD + WISHLIST CSS (incl. `.miss-chip`) | Modify |
| `test/client/{components/ui,views}.test.tsx` | primitive + view tests | Modify |

Rarity helper (reuse the `shared.tsx` pattern), used by the Badge mapping:
```tsx
const RARITY_KEYS = ["r", "sr", "ssr", "ur"] as const; // already in collection.ts
```

---

## Task 1: Add Card, Badge, Progress primitives

- [ ] **Step 1: Generate** — `npx shadcn@latest add card badge progress --yes` (decline index.css overwrite). Read all three; confirm exports + `@/lib/utils` import. `npm run format`.

- [ ] **Step 2: Extend the UI test** — append to `test/client/components/ui.test.tsx`:
```tsx
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";

describe("Badge", () => {
  it("renders its label", () => {
    render(<Badge>SR</Badge>);
    expect(screen.getByText("SR")).toBeInTheDocument();
  });
});

describe("Progress", () => {
  it("renders with a value", () => {
    render(<Progress value={42} />);
    expect(screen.getByRole("progressbar")).toBeInTheDocument();
  });
});
```
(Card is already covered by the Phase-0 Card test.)

- [ ] **Step 3: Run** — `npx vitest run --config vitest.client.config.ts test/client/components/ui.test.tsx`; expected PASS.

- [ ] **Step 4: Commit**
```bash
lineguard src/client/components/ui/card.tsx src/client/components/ui/badge.tsx src/client/components/ui/progress.tsx test/client/components/ui.test.tsx
git add src/client/components/ui/card.tsx src/client/components/ui/badge.tsx src/client/components/ui/progress.tsx test/client/components/ui.test.tsx
git commit -m "$(cat <<'EOF'
feat: add shadcn Card, Badge, Progress primitives (radix base)

Generate the primitives for the Phase-3a view migration; render tests added.
(Card was generated in Phase 0; re-confirm it is present.)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```
(If `card.tsx` already exists from Phase 0, only `badge.tsx`/`progress.tsx` are new — adjust the `add` args and the git add list accordingly.)

---

## Task 2: Migrate `MissChip` → rarity `Badge`

`MissChip` is rendered by Wishlist, Market, and Trade. Converting it to a self-styled `Badge` updates all three at once; then the `.miss-chip` CSS can go.

**Files:** Modify `src/client/views/shared.tsx`, `src/client/index.css` (delete `.miss-chip` + variants)

- [ ] **Step 1: Rewrite `MissChip`** in `src/client/views/shared.tsx` (keep `NumCell` as-is):
```tsx
import { Badge } from "@/components/ui/badge";

// rarity pill: rarity text + rarity border + soft rarity tint (legacy --*-soft).
const RARITY_CHIP = [
  "border-rarity-r/35 bg-[var(--r-soft)] text-rarity-r",
  "border-rarity-sr/40 bg-[var(--sr-soft)] text-rarity-sr",
  "border-rarity-ssr/40 bg-[var(--ssr-soft)] text-rarity-ssr",
  "border-rarity-ur/45 bg-[var(--ur-soft)] text-rarity-ur",
] as const;

export function MissChip({
  ri,
  label,
  count,
}: { ri: number; label: string; count?: number }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "gap-1 rounded-full font-mono text-[11px] font-medium tracking-[0.12em]",
        RARITY_CHIP[ri],
      )}
    >
      {label}
      {count && count > 1 ? (
        <span className="opacity-70">{count}</span>
      ) : null}
    </Badge>
  );
}
```
(The `border-rarity-sr/40` opacity-modifier syntax works because `--color-rarity-*` are theme colors. Verify the soft tints render; if `bg-[var(--r-soft)]` reads wrong, fall back to `bg-rarity-r/10`.)

- [ ] **Step 2: Delete `.miss-chip` CSS** — in `index.css` (WISHLIST section), delete `.miss-chip` and `.miss-chip.r/.sr/.ssr/.ur` (lines defining the chip). Keep `.miss-chips` (flex container) and `.miss-grid`/`.miss-series` for Task 4.

- [ ] **Step 3: Test + visual** — `npm test`; then build + `npm run preview`, check the 缺卡 (Wishlist) and 交易看板 (Market) tabs render the rarity chips as Badges (rarity color + soft tint + pill). The `own-count` superscript becomes the dim count span.

- [ ] **Step 4: Commit**
```bash
lineguard src/client/views/shared.tsx src/client/index.css
git add src/client/views/shared.tsx src/client/index.css
git commit -m "$(cat <<'EOF'
feat: render MissChip as a rarity shadcn Badge

Convert the shared MissChip (Wishlist/Market/Trade) to a self-styled outline
Badge tinted by rarity; delete the .miss-chip CSS.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Migrate the `.card` wrapper → shadcn `Card` (tables + Wishlist)

`.card`/`.card-header`/`.card-title`(+is-series/is-rarity)/`.card-count` are used by `tables.tsx` and `Wishlist.tsx`. Migrate both, then delete the CARD CSS.

**Files:** Modify `src/client/views/tables.tsx`, `src/client/views/Wishlist.tsx` (card shells only — Wishlist body is Task 4), `src/client/index.css` (delete CARD section)

- [ ] **Step 1: Define reusable card-title classes** (inline in each file or a tiny shared const):
```tsx
// plain (By-Character / Wishlist), is-series (By-Series), is-rarity (By-Rarity)
const CARD_TITLE = "font-serif text-[22px] font-medium tracking-[0.04em] text-foreground";
const CARD_TITLE_SERIES = "font-accent text-[26px] font-medium italic uppercase tracking-[0.08em] text-foreground";
const CARD_TITLE_RARITY = "font-mono text-2xl font-medium tracking-[0.1em]"; // + text-rarity-* per rarity
const CARD_COUNT = "font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground";
```

- [ ] **Step 2: Replace `.card` shells in `tables.tsx`** — for each of the three views, change `<article className="card">` → `<Card className="mb-[18px] gap-0 rounded-[4px] px-[26px] py-6">`, the `<header className="card-header">` → a `<CardHeader>`-styled flex row (`flex flex-row items-baseline justify-between gap-3 border-b border-border pb-3.5 [.border-b]:pb-3.5`), the `<h2 className="card-title…">` → `<CardTitle className={…}>` with the matching CARD_TITLE* constant (By-Series uses SERIES; By-Rarity uses `cn(CARD_TITLE_RARITY, RARITY_TEXT[ri])`), and the count span → `<span className={CARD_COUNT}>…<strong className="font-medium text-foreground">…</strong></span>`. Import `Card, CardHeader, CardTitle` from `@/components/ui/card`. Wrap the `<Table>` in `<CardContent className="px-0">`.

- [ ] **Step 3: Replace `.card` shells in `Wishlist.tsx`** — same Card/CardHeader/CardTitle treatment for the per-character cards (plain title). The `card-count.is-complete` → `text-primary` when complete. (The Wishlist card BODY — miss-grid/overall — is Task 4.)

- [ ] **Step 4: Delete the CARD CSS** — in `index.css`, delete the entire CARD section (`.card` … `.card-count.is-complete`, lines under `/* CARD */`). Keep the generic `table`/`th`/`td` immediately after it.

- [ ] **Step 5: Tests + visual** — `npx vitest run … views.test.tsx` (card titles/counts are text — should pass; update any `.card` selector). Build + preview; confirm 角色/系列/稀有度/缺卡 cards: serif/italic/mono titles, dim mono counts, border under header, gold "集齊" count.

- [ ] **Step 6: Full gate + commit**
```bash
lineguard src/client/views/tables.tsx src/client/views/Wishlist.tsx src/client/index.css
git add src/client/views/tables.tsx src/client/views/Wishlist.tsx src/client/index.css test/client/views.test.tsx
git commit -m "$(cat <<'EOF'
feat: migrate the .card wrapper to shadcn Card (tables + Wishlist)

Replace the bespoke .card/.card-header/.card-title(+is-series/is-rarity)/
.card-count CSS with shadcn Card + Tailwind title variants across tables.tsx
and Wishlist.tsx; delete the CARD section.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Migrate the Wishlist body (overall card + Progress + miss-grid)

**Files:** Modify `src/client/views/Wishlist.tsx`, `src/client/index.css` (delete remaining WISHLIST CSS)

- [ ] **Step 1: Migrate the `.overall` block** → a shadcn `Card` (centered) containing: the big mono stat (`font-mono text-[40px] leading-none text-foreground` + denom `text-[18px] text-muted-foreground`), the italic label (`font-accent italic uppercase tracking-[0.2em] text-muted-foreground`), a shadcn `<Progress value={pct}>` (≤340px, centered; gold fill — restyle the indicator via `className="[&>[data-slot=progress-indicator]]:bg-gradient-to-r [&>…]:from-[var(--primary-dim)] [&>…]:to-primary"` or a small wrapper), and the detail line (`text-xs text-muted-foreground tracking-[0.08em]`).

- [ ] **Step 2: Migrate `.miss-grid`/`.miss-series`/`.miss-chips`/`.miss-complete`** → Tailwind: grid `grid-cols-[110px_1fr] items-center gap-x-[18px] gap-y-3.5`; series label `font-accent italic uppercase text-[13px] tracking-[0.12em] text-muted-foreground`; chips `flex flex-wrap gap-1.5` (MissChip is already a Badge); complete line `font-accent italic text-[15px] text-primary tracking-[0.08em] text-center py-1`.

- [ ] **Step 2.5: Restyle Progress indicator to the gold gradient** — read the generated `progress.tsx`; the indicator has `data-slot="progress-indicator"` (or `bg-primary`). Override to the brand gradient via a className on `<Progress>` targeting the indicator, or add a `variant` — keep it minimal and verify visually.

- [ ] **Step 3: Delete the remaining WISHLIST CSS** — `.overall*`, `.progress-bar`, `.progress-fill`, `.overall-detail`, `.miss-grid`, `.miss-series`, `.miss-chips`, `.miss-complete` (the whole WISHLIST section). Also delete the WISHLIST rules in the `@media (max-width:540px)` block (`.miss-grid`, `.miss-series`, `.miss-chip`, `.overall`, `.overall-num`, `.overall-denom`).

- [ ] **Step 4: Tests + visual** — `npm test`; build + preview; confirm 缺卡: the overall card (big number, italic label, gold gradient progress bar, detail), per-character miss grids with rarity Badge chips, and "✓ Complete" for집齊 characters.

- [ ] **Step 5: Full gate + commit**
```bash
lineguard src/client/views/Wishlist.tsx src/client/index.css
git add src/client/views/Wishlist.tsx src/client/index.css
git commit -m "$(cat <<'EOF'
feat: migrate the Wishlist body to shadcn Card + Progress + Tailwind

Replace .overall/.progress-bar/.miss-grid/.miss-series/.miss-complete with a
shadcn Card, a gold-gradient Progress, and Tailwind layout. Delete the WISHLIST
CSS (and its @media rules).

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Fix the Market loading regression

Phase-2 deleted `.state-msg`, but `Market.tsx` still uses it for its loading state.

**Files:** Modify `src/client/views/Market.tsx`

- [ ] **Step 1:** In `src/client/views/Market.tsx`, replace `<div className="state-msg">載入中…</div>` with a Tailwind line matching the new error style:
```tsx
<p className="py-12 text-center font-accent italic tracking-[0.1em] text-muted-foreground">
  載入中…
</p>
```
(The `.trade-empty` error/empty states stay legacy — Market is otherwise migrated in 3b.)

- [ ] **Step 2: Gate + commit**
```bash
lineguard src/client/views/Market.tsx
git add src/client/views/Market.tsx
git commit -m "$(cat <<'EOF'
fix: restore Market loading state after .state-msg removal

Phase 2 deleted .state-msg; Market still referenced it for its loading text.
Replace with the Tailwind italic line. (Market's full migration is Phase 3b.)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Phase 3a acceptance gate + push

- [ ] **Step 1: Full suite** — `npm run lint && npm run typecheck && npm test && npm run build`; all exit 0.
- [ ] **Step 2: Visual check (with data)** — build + `npm run preview`; verify 缺卡 (Wishlist: overall card, progress, rarity Badge chips), 角色/系列/稀有度 (cards), 交易看板 (Market chips + loading line), and that 速覽/格表/交換 (3b–3d, still legacy) are unchanged. Mobile width too.

Phase 3a acceptance checklist:
- [ ] `MissChip` is a rarity `Badge`; `.miss-chip` CSS gone.
- [ ] `.card` is shadcn `Card` in tables + Wishlist; CARD CSS gone.
- [ ] Wishlist uses `Card` + gold `Progress`; WISHLIST CSS gone.
- [ ] Market loading regression fixed.
- [ ] Glance/Trade/Grid (3b–3d) unchanged; `npm test` green.

- [ ] **Step 3: Push** — `git push` (updates PR #1).

## Self-Review

**1. Spec coverage (design §5.4 Phase 3):** Wishlist + `Badge` for the chips (Tasks 2,4); `.card` → `Card` (Task 3); Progress for the bar (Task 4). Market/Trade/Glance/Grid deferred to 3b–3d (documented split). The Market `.state-msg` regression (introduced Phase 2) is fixed (Task 5). ✓

**2. Placeholder scan:** Card/Badge/Progress bodies are CLI-generated; CSS deletions name exact selectors; the rarity-chip + title constants are concrete. The tables.tsx Card shell change is described per-view (the three views differ only in title variant — all shown).

**3. Type consistency:** `MissChip({ ri, label, count })` signature unchanged. `RARITY_CHIP`/`RARITY_TEXT` indices align with `ri`/`RARITY_KEYS`. `Card`/`Badge`/`Progress` imports match Task 1 exports.

## Execution Handoff

Phase 3a of the 3a–3d split. 3b (Market+Trade), 3c (Glance), 3d (Grid) each get their own just-in-time plan after this lands.
