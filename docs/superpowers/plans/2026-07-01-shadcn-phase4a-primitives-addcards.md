# shadcn Phase 4a — Admin primitives + AddCards Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Open Phase 4 (後台) by laying its shared foundation — scope `admin.css` into `@layer legacy` for safe coexistence, add the `Input` primitive, and create a shared admin style module (`src/client/admin/ui.ts`) — then migrate the first admin panel, `AddCards`, off `admin.css` onto shadcn `Toggle`/`Button`/`Input` + Tailwind tokens.

**Architecture:** Phase 4 retires the entire 356-line `admin.css` across three shippable sub-phases (4a: primitives + AddCards; 4b: ManageCards + PendingTrades; 4c: Openings + History + delete `admin.css`). Per the agreed **pragmatic-reskin** fidelity choice, native `<select>` elements and inline expand-in-place forms are **kept** (just Tailwind-restyled) — shadcn's portal-based `Select`/`Dialog` would break the `<option>`-dependent admin tests and change behaviour in a zero-behaviour-change phase, the same way Phase 3c kept the bespoke Grid table (§5.3 special-case). 4a adds only the `Input` primitive and the inline toast stays an italic gold accent (no Sonner). The `.opt` tap chips become the spec's "順手升級" (§5.3): the single-select **series** + **rarity** rows become standalone shadcn `Toggle`s — which render a native `<button>` with `aria-pressed`, preserving the `getByRole("button", { name })` contract the existing AddCards tests assert (exactly the Phase 3c Grid-filter decision) — while the momentary **character** chips become `<Button variant="ghost">`. All shared admin class strings live in one `src/client/admin/ui.ts` so 4b/4c reuse them. All 4a work lands on one `feat/shadcn-phase4a` branch → one PR.

**Tech Stack:** React 18, React Router 7, Vite 6, Tailwind v4 (`@tailwindcss/vite`), shadcn (radix-nova base), unified `radix-ui` (Toggle), `class-variance-authority`, Biome, Vitest + Testing Library. **Zero new npm dependencies** (`radix-ui`, `cva`, `lucide-react` already installed; no `sonner`).

## Global Constraints

These apply to **every** task; each task's requirements implicitly include them.

- **Visual parity is the acceptance bar.** The migrated UI must match the legacy rendering. Class strings in `src/client/admin/ui.ts` are ported 1:1 from `admin.css` (see the token table). Do not change the visual result.
- **Zero behaviour change.** This is a UI re-platforming. No new features, no data/route/worker changes. The existing `test/client/admin.test.tsx` behavioural tests must stay green **unmodified** except for the one additive aria-pressed assertion in Task 3.
- **Preserve accessible names + roles.** AddCards tests query `getByRole("button", { name: "Mizuki" | "SR" | "NEW YEAR" | "新增 0 張" | "移除 NEW YEAR Rei SR" })`, `getByText("×2")`, `getByLabelText(/這是一次開箱/)`, `getByLabelText("開箱日期")`, and the toast `/已新增 1 張/`. Every reskin keeps these stable. Series/rarity Toggles MUST stay `role="button"` (standalone `Toggle`, **not** `ToggleGroup` whose items are `role="radio"`).
- **Coexistence via `@layer legacy`.** `admin.css` is wrapped in `@layer legacy` (Task 1) so migrated utilities win while un-migrated panels (ManageCards/PendingTrades/Openings/History) keep their legacy styling until 4b/4c.
- **Keep native `<select>` + inline forms** (pragmatic-reskin decision). Not exercised in 4a (AddCards has no `<select>`), but the `CONTROL` constant is authored to skin both `<Input>` and native `<select>` for 4b/4c.
- **`.state-msg` / `.trade-empty` survive.** They live in `index.css` `@layer legacy` and are shared with admin panels; do not touch them.
- **Before each commit:** run `lineguard` on changed files, then `npm test` (green), then `npx biome check .` (clean). A PreToolUse hook also auto-runs format/lint/test on `git commit`.
- **Conventional Commits**, one concern per commit. Commit trailer (repo style):
  `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`
- **Additive git only** — no force-push, no rebase inside the loop.

## Decisions carried from Phase 4 planning

1. **Slicing = 4a/4b/4c** (mirrors 3a/3b/3c). 4a = this plan.
2. **Pragmatic reskin** — keep native `<select>` + inline forms; add only the `Input` primitive; inline toast (no `Select`/`Dialog`/`Sonner`). Rationale: the admin tests bind to native `<select>`/`<option>` semantics and inline form expansion; portal-based Radix would break ~6 tests + change behaviour.
3. **`admin.css` → `@layer legacy`** for coexistence (Task 1). Unlayered `.admin input` element rule would otherwise override migrated utilities in a real browser.
4. **Admin pills = styled `<span>`** (not `Badge`). The admin `.pill` is a 10px neutral-bordered chip, flatter/smaller than the views' `Badge`; coercing `Badge` (h-5, rounded-4xl, px-2) for every status/rarity variant fights more than it helps. Documented "special case," consistent with the keep-bespoke theme.
5. **No shadcn `Label`.** The forms use native wrapping `<label className="field"><span>caption</span><input/></label>`; `getByLabelText` relies on that association. A separate `Label` primitive would force `id`/`htmlFor` churn and risk those queries — YAGNI. Caption styling is the `FIELD_LABEL` constant on the existing `<span>`.

## Design-token reference (legacy `admin.css` value → Tailwind utility)

Use this table everywhere instead of raw hex. Where no semantic token exists, use the raw var via an arbitrary value (matches Phase 3 precedent).

| Legacy var / value | Tailwind utility |
|---|---|
| `--surface` `#181613` | `bg-card` |
| `--bg-subtle` `#141210` | `bg-[var(--bg-subtle)]` |
| `--border` `#2a2520` | `border-border` (+ `border-[0.5px]`) |
| `--border-strong` `#3a342c` | `border-[var(--border-strong)]` |
| `--text` `#ede8df` | `text-foreground` |
| `--text-secondary` `#a39e93` | `text-muted-foreground` |
| `--text-tertiary` `#6a6660` | `text-[var(--text-tertiary)]` |
| `--primary` `#c9a14a` | `text-primary` / `border-primary` / `to-primary` |
| `--primary-dim` `#8a7438` | `from-[var(--primary-dim)]` |
| `.btn-primary` text `#1a1612` | `text-[#1a1612]` |
| `--ur-color` (= `--destructive`) | `text-destructive` |
| `--r/sr/ssr/ur-color` | `text-rarity-r/sr/ssr/ur` |
| `.opt.active` fill `rgba(201,161,74,0.08)` | `bg-[rgba(201,161,74,0.08)]` |
| `.opt.rarity.r.active` `rgba(154,149,139,*)` | `border-[rgba(154,149,139,0.5)]` / `bg-[rgba(154,149,139,0.08)]` |
| `.opt.rarity.sr.active` `rgba(212,168,87,*)` | `border-[rgba(212,168,87,0.5)]` / `bg-[rgba(212,168,87,0.08)]` |
| `.opt.rarity.ssr.active` `rgba(214,138,163,*)` | `border-[rgba(214,138,163,0.5)]` / `bg-[rgba(214,138,163,0.08)]` |
| `.opt.rarity.ur.active` `rgba(224,113,113,*)` | `border-[rgba(224,113,113,0.5)]` / `bg-[rgba(224,113,113,0.08)]` |
| serif title | `font-serif` |
| italic accent (toast) | `font-accent italic` |
| mono | `font-mono` |
| sans | `font-sans` |

---

## Task 1: Scope `admin.css` into `@layer legacy` (Phase 4 coexistence)

**Files:**
- Modify: `src/client/admin/admin.css` (wrap entire body in `@layer legacy { … }`)

**Interfaces:**
- Consumes: the `@layer theme, base, components, legacy, utilities;` order already declared in `src/client/index.css:5`.
- Produces: `admin.css` rules now in the `legacy` layer (below `utilities`), so a migrated panel's utilities win over the still-present `.admin input` element rule. No visual change yet (nothing in `utilities` competes for admin elements until Task 3).

- [ ] **Step 1: Wrap the stylesheet in the `legacy` layer**

In `src/client/admin/admin.css`, keep the top comment line, then wrap **all** rules in a single `@layer legacy { … }` block. The file becomes:

```css
/* Admin UI — reuses the design tokens defined in index.css.
   Scoped to @layer legacy so migrated Phase-4 utilities win during the
   per-panel coexistence window (admin.css is fully deleted in Phase 4c). */
@layer legacy {
  .panel {
    background: var(--surface);
    border: 0.5px solid var(--border);
    border-radius: 4px;
    padding: 24px 26px;
    margin-bottom: 18px;
  }
  /* …every existing rule, indented one level, unchanged… */
  .tally-empty {
    margin-top: 16px;
    color: var(--text-tertiary);
    font-size: 13px;
    letter-spacing: 0.06em;
  }
}
```

> Mechanical wrap only — do not edit any rule body, selector, or the `@media (max-width: 600px)` block (it goes inside the layer too). The layer name `legacy` matches the one `index.css` already orders below `utilities`; cascade layers merge by name across files.

- [ ] **Step 2: Verify build + full test suite**

Run: `npm run build && npm test`
Expected: build succeeds (CSS compiles), all tests green (jsdom ignores layers; behaviour unchanged).

- [ ] **Step 3: Visual smoke — admin unchanged**

Run: `npm run dev`, open `/admin`, click through all five tabs (開箱新增 / 卡片管理 / 交換預約 / 開箱成本 / 交易歷史). Everything must look **identical** to before — admin.css still beats Tailwind preflight (`base` < `legacy`), and no admin element has competing utilities yet.

- [ ] **Step 4: Lint + commit**

```bash
lineguard src/client/admin/admin.css
npx biome check --write src/client/admin/admin.css
npm test
git add src/client/admin/admin.css
git commit -m "refactor: scope admin.css to @layer legacy for phase-4 coexistence"
```

---

## Task 2: Add the `Input` primitive

**Files:**
- Create: `src/client/components/ui/input.tsx`
- Test: `test/client/components/ui.test.tsx` (append an `Input` describe block)

**Interfaces:**
- Produces: `Input` — `React.ComponentProps<"input">`, a styled native `<input>` with `data-slot="input"`, `className` merged via `cn`. Consumed by AddCards (Task 3) and 4b's ManageCards/PendingTrades.

- [ ] **Step 1: Write the failing test**

Append to `test/client/components/ui.test.tsx`. Add the import at the top (alongside the other `@/components/ui/*` imports):

```tsx
import { Input } from "@/components/ui/input";
```

Then add the describe block (`render`, `screen`, `fireEvent` are already imported):

```tsx
describe("Input", () => {
  it("renders a textbox and accepts a typed value", () => {
    render(<Input aria-label="價格" defaultValue="" />);
    const box = screen.getByRole("textbox", { name: "價格" });
    fireEvent.change(box, { target: { value: "600" } });
    expect((box as HTMLInputElement).value).toBe("600");
  });
  it("forwards type and merges a custom className", () => {
    render(<Input type="date" aria-label="日期" className="border-primary" />);
    const box = screen.getByLabelText("日期");
    expect(box).toHaveAttribute("type", "date");
    expect(box.className).toContain("border-primary");
  });
});
```

- [ ] **Step 2: Run the test — expect FAIL**

Run: `npx vitest run test/client/components/ui.test.tsx -t "Input"`
Expected: FAIL — `Cannot find module '@/components/ui/input'`.

- [ ] **Step 3: Create `src/client/components/ui/input.tsx`**

```tsx
import type * as React from "react";

import { cn } from "@/lib/utils";

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "flex h-9 w-full min-w-0 rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none selection:bg-primary selection:text-primary-foreground placeholder:text-muted-foreground disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 md:text-sm",
        className,
      )}
      {...props}
    />
  );
}

export { Input };
```

> Canonical shadcn input. The admin look (bg-subtle, 0.5px border-strong, focus→primary border, no ring) is layered on per-use via the `CONTROL` constant in Task 3, which overrides bg/border/shadow/focus. (Alternative: `npx shadcn@latest add input` — the repo's `radix-nova` style emits equivalent code; the exact source above keeps the plan reproducible offline.)

- [ ] **Step 4: Run the test — expect PASS**

Run: `npx vitest run test/client/components/ui.test.tsx -t "Input"`
Expected: PASS. Then `npm test` → all green.

- [ ] **Step 5: Lint + commit**

```bash
lineguard src/client/components/ui/input.tsx test/client/components/ui.test.tsx
npx biome check --write src/client/components/ui/input.tsx test/client/components/ui.test.tsx
npm test
git add src/client/components/ui/input.tsx test/client/components/ui.test.tsx
git commit -m "feat: add shadcn Input primitive"
```

---

## Task 3: Migrate AddCards onto Toggle/Button/Input + shared admin constants

**Files:**
- Create: `src/client/admin/ui.ts` (shared admin style constants)
- Modify: `src/client/admin/AddCards.tsx` (full reskin; logic unchanged)
- Test: `test/client/admin.test.tsx` (add one additive aria-pressed assertion to `describe("AddCards")`)

**Interfaces:**
- Consumes: `Toggle` from `@/components/ui/toggle`, `Button` from `@/components/ui/button`, `Input` from `@/components/ui/input`, `cn` from `@/lib/utils`, `Rarity` from `../../shared/types`.
- Produces: `src/client/admin/ui.ts` exporting the constants below (reused by 4b/4c). AddCards renders the same DOM contract (button names, labels, tally text, toast) with shadcn primitives.

- [ ] **Step 1: Create the shared admin style module `src/client/admin/ui.ts`**

```ts
import type { Rarity } from "../../shared/types";

// === Admin design-system constants (Phase 4) =========================
// Tailwind rebuilds of admin.css, shared across the five admin panels so
// AddCards (4a), ManageCards/PendingTrades (4b), Openings/History (4c) stay
// DRY. Values are ported 1:1 from admin.css; see the plan's token table.

// Panel shell (.panel / .panel-title).
export const PANEL =
  "mb-[18px] rounded-[4px] border-[0.5px] border-border bg-card px-[26px] py-6";
export const PANEL_TITLE =
  "mb-[18px] font-serif text-[17px] font-medium tracking-[0.04em] text-foreground";

// Form field (.field / .field-label) + the shared input/select control
// (.admin input/select). CONTROL fully styles a native control, so it skins
// both <Input> and native <select> (kept native per the Phase 4 fidelity
// decision); it overrides the Input primitive's bg/border/shadow/focus.
export const FIELD = "flex flex-col gap-1.5";
export const FIELD_LABEL =
  "text-[11px] uppercase tracking-[0.15em] text-[var(--text-tertiary)]";
export const CONTROL =
  "w-full appearance-none rounded-[4px] border-[0.5px] border-[var(--border-strong)] bg-[var(--bg-subtle)] px-3 py-[9px] font-sans text-sm text-foreground shadow-none outline-none focus:border-primary focus-visible:border-primary focus-visible:ring-0";

// Buttons. .btn-primary is a gold gradient; rendered on shadcn <Button>, the
// gradient background-image paints over Button's solid bg-primary, so default-
// variant parity holds. .btn-ghost.btn-sm → <Button variant="outline">.
export const BTN_PRIMARY =
  "h-auto rounded-[4px] bg-gradient-to-r from-[var(--primary-dim)] to-primary px-[26px] py-[11px] font-sans text-sm font-semibold tracking-[0.06em] text-[#1a1612] hover:brightness-[1.08]";
export const BTN_GHOST_SM =
  "h-auto rounded-[4px] border-[0.5px] border-[var(--border-strong)] bg-transparent px-2.5 py-1 font-sans text-[11px] font-normal tracking-[0.06em] text-muted-foreground hover:border-primary hover:bg-transparent hover:text-primary";

// Flat option chips (.opt / .opt-group). Series + rarity are single-select
// shadcn <Toggle> (role=button + aria-pressed, like the Phase 3c Grid
// filters); character chips are momentary <Button variant="ghost">. OPT_TOGGLE
// overrides BOTH the toggleVariants base `data-[state=on]:bg-muted` and
// `aria-pressed:bg-muted` with the .opt.active gold fill (distinct variant
// prefixes, so tailwind-merge keeps both).
export const OPT_GROUP = "flex flex-wrap gap-2";
const OPT_BASE =
  "h-auto rounded-[4px] border-[0.5px] border-[var(--border-strong)] bg-[var(--bg-subtle)] px-3.5 py-2 font-sans text-[13px] font-normal tracking-[0.04em] text-muted-foreground transition-colors hover:border-primary hover:bg-[var(--bg-subtle)] hover:text-foreground";
export const OPT_CHIP = OPT_BASE;
export const OPT_TOGGLE = `${OPT_BASE} data-[state=on]:border-primary data-[state=on]:bg-[rgba(201,161,74,0.08)] data-[state=on]:text-primary aria-pressed:border-primary aria-pressed:bg-[rgba(201,161,74,0.08)] aria-pressed:text-primary`;
// Active rarity takes its own colour (.opt.rarity.<r>.active) — overrides the
// gold OPT_TOGGLE active block (same data-[state=on]/aria-pressed props, listed
// last so tailwind-merge keeps these).
export const OPT_RARITY: Record<Rarity, string> = {
  R: "data-[state=on]:border-[rgba(154,149,139,0.5)] data-[state=on]:bg-[rgba(154,149,139,0.08)] data-[state=on]:text-rarity-r aria-pressed:border-[rgba(154,149,139,0.5)] aria-pressed:bg-[rgba(154,149,139,0.08)] aria-pressed:text-rarity-r",
  SR: "data-[state=on]:border-[rgba(212,168,87,0.5)] data-[state=on]:bg-[rgba(212,168,87,0.08)] data-[state=on]:text-rarity-sr aria-pressed:border-[rgba(212,168,87,0.5)] aria-pressed:bg-[rgba(212,168,87,0.08)] aria-pressed:text-rarity-sr",
  SSR: "data-[state=on]:border-[rgba(214,138,163,0.5)] data-[state=on]:bg-[rgba(214,138,163,0.08)] data-[state=on]:text-rarity-ssr aria-pressed:border-[rgba(214,138,163,0.5)] aria-pressed:bg-[rgba(214,138,163,0.08)] aria-pressed:text-rarity-ssr",
  UR: "data-[state=on]:border-[rgba(224,113,113,0.5)] data-[state=on]:bg-[rgba(224,113,113,0.08)] data-[state=on]:text-rarity-ur aria-pressed:border-[rgba(224,113,113,0.5)] aria-pressed:bg-[rgba(224,113,113,0.08)] aria-pressed:text-rarity-ur",
};

// Admin pills (.pill + rarity colour) — 10px neutral-bordered chips kept as a
// styled <span> (smaller/flatter than the views' Badge; see Phase 4 note).
// 4b adds status/dup/reserved variants.
export const PILL_BASE =
  "inline-flex items-center whitespace-nowrap rounded-full border-[0.5px] border-[var(--border-strong)] px-[9px] py-0.5 text-[10px] tracking-[0.1em] text-[var(--text-tertiary)]";
export const PILL_RARITY: Record<Rarity, string> = {
  R: "text-rarity-r",
  SR: "text-rarity-sr",
  SSR: "text-rarity-ssr",
  UR: "text-rarity-ur",
};

// Running tally list (.tally*).
export const TALLY =
  "mt-4 rounded-[4px] border-[0.5px] border-border bg-[var(--bg-subtle)]";
export const TALLY_ROW =
  "flex items-center gap-2.5 border-b-[0.5px] border-border px-3 py-2 last:border-b-0";
export const TALLY_SERIES =
  "whitespace-nowrap text-[11px] tracking-[0.04em] text-[var(--text-tertiary)]";
export const TALLY_NAME = "min-w-[84px] text-sm text-foreground";
export const TALLY_QTY = "ml-auto font-mono text-[13px] text-muted-foreground";
export const TALLY_EMPTY =
  "mt-4 text-[13px] tracking-[0.06em] text-[var(--text-tertiary)]";

// Opening sub-form (.add-actions / .opening-fields) + checkbox row.
export const CHECKBOX_ROW =
  "mt-5 flex cursor-pointer items-center gap-2 text-sm text-muted-foreground";
export const CHECKBOX = "h-auto w-auto accent-primary";
export const OPENING_FIELDS =
  "mt-2 mb-4 grid grid-cols-2 gap-3 max-[600px]:grid-cols-1";
export const ADD_ACTIONS = "mt-4 flex flex-wrap items-center gap-3";

// Toast (.toast italic gold accent) + inline error (.error-text).
export const TOAST = "font-accent text-sm italic tracking-[0.06em] text-primary";
export const ERROR_TEXT = "text-[13px] text-destructive";
```

- [ ] **Step 2: Write the failing (additive) test**

In `test/client/admin.test.tsx`, inside `describe("AddCards")`, add one test locking the new `Toggle` semantics (the existing 8 tests stay unchanged):

```tsx
  it("marks the selected series and rarity as pressed toggles", () => {
    render(<AddCards />);
    // Defaults: series "NEW YEAR", rarity "R".
    expect(screen.getByRole("button", { name: "NEW YEAR" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "R" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "SR" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    fireEvent.click(screen.getByRole("button", { name: "SR" }));
    expect(screen.getByRole("button", { name: "SR" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "R" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });
```

- [ ] **Step 3: Run the test — expect FAIL**

Run: `npx vitest run test/client/admin.test.tsx -t "pressed toggles"`
Expected: FAIL — legacy `.opt` buttons render no `aria-pressed` attribute (`toHaveAttribute` fails).

- [ ] **Step 4: Rewrite `src/client/admin/AddCards.tsx`**

Replace the entire file with (state + handlers identical to the original; only imports and the returned JSX change):

```tsx
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Toggle } from "@/components/ui/toggle";
import { cn } from "@/lib/utils";
import { RARITIES, SERIES, charactersFor } from "../../../seed/catalog-def";
import type { AddCardInput, OpeningInput, Rarity } from "../../shared/types";
import { postCards } from "../api";
import {
  ADD_ACTIONS,
  BTN_GHOST_SM,
  BTN_PRIMARY,
  CHECKBOX,
  CHECKBOX_ROW,
  CONTROL,
  ERROR_TEXT,
  FIELD,
  FIELD_LABEL,
  OPENING_FIELDS,
  OPT_CHIP,
  OPT_GROUP,
  OPT_RARITY,
  OPT_TOGGLE,
  PANEL,
  PANEL_TITLE,
  PILL_BASE,
  PILL_RARITY,
  TALLY,
  TALLY_EMPTY,
  TALLY_NAME,
  TALLY_QTY,
  TALLY_ROW,
  TALLY_SERIES,
  TOAST,
} from "./ui";

interface TallyEntry {
  series: string;
  character: string;
  rarity: Rarity;
  qty: number;
}

export function AddCards() {
  const [series, setSeries] = useState<string>(SERIES[0]);
  const [rarity, setRarity] = useState<Rarity>("R");
  const [tally, setTally] = useState<TallyEntry[]>([]);
  const [isOpening, setIsOpening] = useState(false);
  const [openedAt, setOpenedAt] = useState("");
  const [cost, setCost] = useState("");
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const chars = charactersFor(series);
  const total = tally.reduce((n, e) => n + e.qty, 0);

  // Each tally row remembers the series it was tapped under, so switching the
  // series selector only affects *new* taps — existing rows keep their series.
  const addCard = (character: string) =>
    setTally((t) => {
      const i = t.findIndex(
        (e) =>
          e.series === series &&
          e.character === character &&
          e.rarity === rarity,
      );
      if (i === -1) return [...t, { series, character, rarity, qty: 1 }];
      return t.map((e, j) => (j === i ? { ...e, qty: e.qty + 1 } : e));
    });

  const removeOne = (s: string, character: string, r: Rarity) =>
    setTally((t) =>
      t
        .map((e) =>
          e.series === s && e.character === character && e.rarity === r
            ? { ...e, qty: e.qty - 1 }
            : e,
        )
        .filter((e) => e.qty > 0),
    );

  const submit = async () => {
    setBusy(true);
    setError(null);
    setToast(null);
    try {
      const cards: AddCardInput[] = tally.flatMap((e) =>
        Array.from({ length: e.qty }, () => ({
          series: e.series,
          character: e.character,
          rarity: e.rarity,
        })),
      );
      let opening: OpeningInput | undefined;
      if (isOpening && openedAt) {
        // Derive the opening's series from what was actually tallied: one
        // distinct series → that series; a mixed batch → none (NULL).
        const distinct = [...new Set(tally.map((e) => e.series))];
        opening = {
          series: distinct.length === 1 ? distinct[0] : undefined,
          openedAt,
          cost: cost ? Number(cost) : undefined,
        };
      }
      const { ids } = await postCards(cards, opening);
      setToast(`已新增 ${ids.length} 張${opening ? "（已記為一次開箱）" : ""}`);
      setTally([]);
      setCost("");
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className={PANEL}>
      <h2 className={PANEL_TITLE}>開箱新增</h2>

      <div className={FIELD}>
        <span className={FIELD_LABEL}>系列</span>
        <div className={OPT_GROUP}>
          {SERIES.map((s) => (
            <Toggle
              key={s}
              pressed={s === series}
              onPressedChange={() => setSeries(s)}
              className={OPT_TOGGLE}
            >
              {s}
            </Toggle>
          ))}
        </div>
      </div>

      <div className={cn(FIELD, "mt-4")}>
        <span className={FIELD_LABEL}>稀有度</span>
        <div className={OPT_GROUP}>
          {RARITIES.map((rr) => (
            <Toggle
              key={rr}
              pressed={rr === rarity}
              onPressedChange={() => setRarity(rr)}
              className={cn(OPT_TOGGLE, OPT_RARITY[rr])}
            >
              {rr}
            </Toggle>
          ))}
        </div>
      </div>

      <div className={cn(FIELD, "mt-4")}>
        <span className={FIELD_LABEL}>角色（點一下 = 加一張）</span>
        <div className={OPT_GROUP}>
          {chars.map((c) => (
            <Button
              key={c}
              type="button"
              variant="ghost"
              className={OPT_CHIP}
              onClick={() => addCard(c)}
            >
              {c}
            </Button>
          ))}
        </div>
      </div>

      {tally.length > 0 ? (
        <div className={TALLY}>
          {tally.map((e) => (
            <div
              className={TALLY_ROW}
              key={`${e.series}-${e.character}-${e.rarity}`}
            >
              <span className={TALLY_SERIES}>{e.series}</span>
              <span className={TALLY_NAME}>{e.character}</span>
              <span className={cn(PILL_BASE, PILL_RARITY[e.rarity])}>
                {e.rarity}
              </span>
              <span className={TALLY_QTY}>×{e.qty}</span>
              <Button
                type="button"
                variant="outline"
                className={BTN_GHOST_SM}
                aria-label={`移除 ${e.series} ${e.character} ${e.rarity}`}
                onClick={() => removeOne(e.series, e.character, e.rarity)}
              >
                –
              </Button>
            </div>
          ))}
        </div>
      ) : (
        <p className={TALLY_EMPTY}>點上方角色加入卡片</p>
      )}

      <label className={CHECKBOX_ROW}>
        <input
          type="checkbox"
          className={CHECKBOX}
          checked={isOpening}
          onChange={(e) => setIsOpening(e.target.checked)}
        />
        這是一次開箱（記錄花費，用於成本分析）
      </label>

      {isOpening ? (
        <div className={OPENING_FIELDS}>
          <label className={FIELD}>
            <span className={FIELD_LABEL}>開箱日期</span>
            <Input
              type="date"
              className={CONTROL}
              value={openedAt}
              onChange={(e) => setOpenedAt(e.target.value)}
            />
          </label>
          <label className={FIELD}>
            <span className={FIELD_LABEL}>總花費 (TWD)</span>
            <Input
              type="number"
              inputMode="numeric"
              className={CONTROL}
              value={cost}
              onChange={(e) => setCost(e.target.value)}
              placeholder="例如 600"
            />
          </label>
        </div>
      ) : null}

      <div className={ADD_ACTIONS}>
        <Button
          type="button"
          className={BTN_PRIMARY}
          onClick={submit}
          disabled={busy || total === 0}
        >
          {busy ? "新增中…" : `新增 ${total} 張`}
        </Button>
        {toast ? <span className={TOAST}>{toast}</span> : null}
        {error ? <span className={ERROR_TEXT}>{error}</span> : null}
      </div>
    </section>
  );
}
```

> `Toggle` (controlled `pressed` + `onPressedChange` ignoring the toggled value, re-setting the clicked value) gives single-select-via-toggles: the active series/rarity can't be deselected (matches `.opt.active` always-one-selected), and clicking a sibling moves the selection. Radix `Toggle` renders `<button>` + `aria-pressed`, so `getByRole("button", { name })` and the new aria-pressed assertion both hold. Character chips are `<Button variant="ghost">` (momentary, no pressed state).

- [ ] **Step 5: Confirm no legacy admin classes remain in AddCards**

Run: `grep -nE "panel|panel-title|field-label|opt-group|\bopt\b|tally|add-actions|opening-fields|btn-primary|btn-ghost|btn-sm|\btoast\b|error-text|\bpill\b" src/client/admin/AddCards.tsx`
Expected: matches appear **only** inside imported constant *names* (e.g. `PANEL_TITLE`, `OPT_TOGGLE`, `TALLY_ROW`, `BTN_PRIMARY`) — never as a bare `className="opt"` / `className="panel"` string literal. Eyeball that every `className=` references a constant or a `cn(...)`, not a legacy class string.

- [ ] **Step 6: Run the AddCards suite — expect PASS**

Run: `npx vitest run test/client/admin.test.tsx -t "AddCards"`
Expected: all 9 PASS (the original 8 behavioural tests + the new aria-pressed test). Spot-checks that prove the contract held:
- `disables the submit button while the tally is empty` → `getByRole("button", { name: "新增 0 張" })` is disabled.
- `adds a tapped character … submits via POST` → click `Mizuki` (Button) then `新增 1 張`; POST body unchanged; toast `/已新增 1 張/` renders.
- `adds at the chosen rarity and decrements …` → click `SR` (Toggle) + `Rei` ×2 + remove button by aria-label.
- `records a … opening` → `getByLabelText(/這是一次開箱/)` (native checkbox) + `getByLabelText("開箱日期")` (date `Input` in wrapping label).

If any fails because Radix didn't emit `aria-pressed`, **stop** and inspect with `screen.debug()` — the whole series/rarity approach hinges on `Toggle` → `role="button"` + `aria-pressed`.

- [ ] **Step 7: Build + full test + visual smoke**

Run: `npm run build && npm test`
Expected: build + all tests green.

Visual smoke (`npm run dev`, `/admin` → 開箱新增): series/rarity chips render as the bordered `.opt` pills; the active series + active rarity show the gold (and rarity-coloured) `.active` fill; tapping a character adds a tally row with the rarity pill + `×N` + the small `–` remove button; the "這是一次開箱" checkbox reveals the two-column date/cost inputs (one column < 600px); the gold-gradient **新增 N 張** button; after submit the italic gold toast. All must match the pre-migration look.

- [ ] **Step 8: Lint + commit**

```bash
lineguard src/client/admin/ui.ts src/client/admin/AddCards.tsx test/client/admin.test.tsx
npx biome check --write src/client/admin/ui.ts src/client/admin/AddCards.tsx test/client/admin.test.tsx
npm test
git add src/client/admin/ui.ts src/client/admin/AddCards.tsx test/client/admin.test.tsx
git commit -m "feat: migrate admin AddCards to shadcn Toggle/Button/Input"
```

---

## Finishing the branch

After Task 3, use **superpowers:finishing-a-development-branch**: verify `npm test` green + `npx biome check .` clean, then push and open the PR (`feat/shadcn-phase4a`). PR body ends with:
`🤖 Generated with [Claude Code](https://claude.com/claude-code)`

Suggested PR summary: opens **Phase 4 (後台)** — scopes `admin.css` into `@layer legacy` for safe per-panel coexistence, adds the `Input` primitive, introduces the shared `src/client/admin/ui.ts` style module, and migrates `AddCards` onto shadcn `Toggle`/`Button`/`Input`. Call out the **zero new npm deps**, the **pragmatic-reskin** decision (native `<select>`/inline forms kept; no Sonner/Dialog), the `Toggle`-keeps-`role=button`+`aria-pressed` choice that kept all 8 existing AddCards tests green unmodified, and that `admin.css` is **not yet deleted** (4c). After merge, optionally drive Copilot review via `/pr-workflow:copilot-iterate`.

## Self-Review (completed by author)

- **Spec coverage (§5.4 Phase 4, first slice):** `admin.css` coexistence → Task 1; `Input` primitive (§4.3 Input) → Task 2; AddCards `.opt`→Toggle "順手升級" (§5.3) + `.btn`→Button + `.pill`/tally/fields reskin → Task 3. ManageCards/PendingTrades deferred to 4b; Openings/History + `admin.css` deletion deferred to 4c (noted in PR summary). ✔
- **Placeholder scan:** every code step carries exact file contents, class strings (ported 1:1 from `admin.css`), and commands with expected output; no TBD/"handle edge cases". The full migrated `AddCards.tsx` and the complete `ui.ts` are spelled out. ✔
- **Type consistency:** `OPT_RARITY` / `PILL_RARITY` are `Record<Rarity, string>` keyed by the `Rarity` union (`"R"|"SR"|"SSR"|"UR"`), consumed as `OPT_RARITY[rr]` / `PILL_RARITY[e.rarity]` where `rr`/`e.rarity: Rarity`; `Toggle` props `pressed`/`onPressedChange` are the real Radix props (verified against `toggle.tsx`); `Input` is `React.ComponentProps<"input">`; `cn` from `@/lib/utils`. ✔
- **Regression strategy:** the 8 existing AddCards behavioural tests guard the reskin unmodified (button names, labels, tally text, toast, per-series submit logic); one **new** red-first test locks the `Toggle` aria-pressed semantics; the `Input` primitive gets its own red-first unit test. jsdom can't see CSS layers, so Task 1's correctness is guarded by the explicit visual-smoke step (the reason `@layer legacy` matters at all). ✔
- **Coexistence risk:** Task 1 moves `admin.css` into `@layer legacy` *before* any panel gains utilities, so migrated AddCards utilities win over the still-present `.admin input` element rule while ManageCards/PendingTrades/Openings/History keep their legacy styling until 4b/4c. The `.btn-primary` gradient-over-solid-bg and the `Toggle` base `data-[state=on]:bg-muted`/`aria-pressed:bg-muted` double-override are both explicitly handled in `ui.ts`. ✔
