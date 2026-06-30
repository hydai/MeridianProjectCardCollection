# shadcn Phase 4b — ManageCards + PendingTrades Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Continue Phase 4 (後台) by migrating the two remaining data-heavy admin panels — `ManageCards` and `PendingTrades` — off `admin.css` onto the shared `src/client/admin/ui.ts` token constants, shadcn `Button`/`Input`, and a **bespoke Tailwind-restyled `<table>`**, keeping native `<select>` and inline expand-in-place forms.

**Architecture:** Phase 4 retires the entire 359-line `admin.css` across three shippable sub-phases (4a: primitives + AddCards ✅ shipped; **4b: ManageCards + PendingTrades** ← this plan; 4c: Openings + History + delete `admin.css`). 4b adds **zero** new primitives and **zero** new npm deps — it only extends `ui.ts` with the remaining admin-table / status-pill / filter / line-editor constants and reskins the two panels. Per the agreed **bespoke-table decision** (see Decisions §2), the admin tables stay plain `<table>`/`<thead>`/`<tbody>` elements styled by shared `TABLE`/`TH`/`TD` constants ported 1:1 from `.admin-table` — *not* shadcn `<Table>`, whose 1px-row-border / `whitespace-nowrap` / last-row-stripped defaults would need ~8 override hacks to reach the design's 0.5px-per-cell-border + wrapping + `tr:hover` + last-row-border look. This mirrors the Phase 3c bespoke Grid table and the 4a native-`<select>` decision. Native `<select>` + inline forms are **kept** (the `PendingTrades` tests bind to `<option>` semantics via `{ selector: "option" }` and `owned.closest("select")`; shadcn portal-based `Select` would break them and change behaviour). All 4b work lands on one `feat/shadcn-phase4b` branch → one PR.

**Tech Stack:** React 18, React Router 7, Vite 6, Tailwind v4 (`@tailwindcss/vite`), shadcn (radix-nova base), `class-variance-authority`, Biome, Vitest + Testing Library. **Zero new npm dependencies; zero new shadcn primitives** (`Button`, `Input` already exist from earlier phases; no `Table`, `Select`, `Dialog`, `Sonner`).

## Global Constraints

These apply to **every** task; each task's requirements implicitly include them.

- **Visual parity is the acceptance bar.** The migrated UI must match the legacy rendering. Class strings in `src/client/admin/ui.ts` are ported 1:1 from `admin.css` (see the token table). Do not change the visual result.
- **Zero behaviour change.** This is a UI re-platforming. No new features, no data/route/worker changes. The existing `test/client/admin.test.tsx` behavioural tests (3 for `ManageCards`, 6 for `PendingTrades`) must stay green **unmodified**. 4b adds **no** new test (unlike 4a's aria-pressed test, there is no new semantic to lock — native `<select>`/`<button>`/`<input>` are kept; the existing suite is the full regression contract).
- **Preserve accessible names + roles + native semantics.**
  - `ManageCards` tests query `getByText("Rei" | "重複" | "Iruni" | "價格 (TWD)" | "對象")`, `getByText(/預約中/)`, `getByRole("button", { name: "賣出" })`, and `queryByText(/預約中/)`.
  - `PendingTrades` tests query `getByText("交換預約" | "阿明")`, `getByRole("button", { name: "完成" | "取消" | "確認完成" | "＋ 新增給出" | "＋ 新增換入" | "新增預約" })`, `getByText("MP 4TH Mizuki R（餘 1）" | "MP 4TH Mizuki R（持有 2）" | "KILLER Rei SR（缺・已預定換入 1）")`, `getAllByText(/（缺）$/, { selector: "option" })`, and `owned.closest("select")`.
  - **The give/receive/filter/trade dropdowns MUST stay native `<select>` with native `<option>`** (the two queries above hard-depend on it). Every reskin keeps these stable.
- **Keep native `<select>` + inline expand-in-place forms** (pragmatic-reskin decision from 4a). Restyle them via the `CONTROL` constant; do not introduce shadcn `Select`/`Dialog`.
- **Bespoke `<table>`, not shadcn `<Table>`** (Decision §2). Do not `import` from `@/components/ui/table`.
- **`.state-msg` / `.trade-empty` survive untouched.** They live in `index.css` `@layer legacy` (NOT `admin.css`), are shared with the public views, and are cleared in Phase 5 — keep the bare `className="state-msg"` / `className="trade-empty"` string literals as-is.
- **`admin.css` stays imported.** `Admin.tsx` keeps `import "./admin.css"` and the `.admin` wrapper class through 4b (un-migrated Openings/History still need it). The legacy `.admin input/select` element rule lives in `@layer legacy`, so the migrated `CONTROL` utility (in the higher `utilities` layer) wins on every migrated control — exactly as 4a's `Input` did. `admin.css` is deleted in 4c.
- **Before each commit:** run `lineguard` on changed files, then `npm test` (green), then `npx biome check .` (clean). A PreToolUse hook also auto-runs format/lint/test on `git commit`.
- **Conventional Commits**, one concern per commit. Commit trailer (repo style):
  `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`
- **Additive git only** — no force-push, no rebase inside the loop.

## Decisions carried from / made for Phase 4b

1. **Slicing = 4a/4b/4c** (mirrors 3a/3b/3c). 4b = ManageCards + PendingTrades (the two table+form panels). Openings/History + `admin.css` deletion are 4c.
2. **Bespoke `<table>` for the admin tables** (user-confirmed). Plain `<table>`/`<thead>`/`<tbody>`/`<tr>`/`<th>`/`<td>` styled by shared `TABLE`/`TH`/`TD` constants that port `.admin-table` 1:1 (0.5px per-cell bottom borders, wrapping cells, `tr:hover td` tint, last-row border kept). Rationale: shadcn `<Table>` would require ~8 override hacks (override `text-sm`→13px, `[&_tr]:border-b` 1px→0.5px, `font-medium`→`font-normal`, `p-2`→`p-2.5`, restore the `[&_tr:last-child]:border-0`-stripped last border, `whitespace-nowrap`→`whitespace-normal`, `hover:bg-muted/50`→custom) several of which rely on tailwind-merge resolving variant-prefixed arbitrary conflicts. The admin table shares almost no styling with the public `tables.tsx` table, so the shared-component win is nominal. Consistent with the Phase 3c bespoke Grid table and the keep-bespoke theme.
3. **Native `<select>` kept** (pragmatic reskin; tests bind to `<option>`). Restyled via `CONTROL` (already skins both `<input>` and native `<select>`; its `appearance-none` matches legacy `.admin select`, which also removed the native arrow).
4. **Inputs use the shadcn `<Input>` primitive** (from 4a) restyled via `CONTROL`, matching how 4a migrated AddCards's date/cost inputs. Width-specific inputs compose `cn(CONTROL, "w-[72px]")`.
5. **Admin pills = styled `<span>`** (not `Badge`), layered on the existing `PILL_BASE` (4a). 4b adds the status / dup / reserved colour variants.
6. **No new primitive, no Toggle.** Unlike AddCards, these panels have no single-select tap-chips — every chooser is a real multi-option dropdown, so `Toggle`/`ToggleGroup` do not apply.
7. **The asking-price `<span className="mono">` is intentionally NOT monospaced.** The legacy `.admin-table td.mono` compound selector matches a `<td class="mono">`, never the inner `<span class="mono">`, so the price currently renders in the inherited sans `<td>` font. Porting faithfully = drop the dead `mono` class, render `<span className="ml-2">`. Do **not** add `font-mono` (that would be a visual regression). Confirm in the visual smoke.

## Design-token reference (legacy `admin.css` value → Tailwind utility)

New 4b classes (4a's table — `PANEL`, `FIELD`, `CONTROL`, `BTN_PRIMARY`, `BTN_GHOST_SM`, `PILL_BASE`, `PILL_RARITY`, `ERROR_TEXT`, etc. — still applies and is reused). Where no semantic token exists, use the raw var via an arbitrary value (matches Phase 3/4a precedent).

| Legacy rule / value | Tailwind utility |
|---|---|
| `.admin-table` `font-size:13px` + `border-collapse` | `w-full border-collapse text-[13px]` |
| `.admin-table tr:hover td` `rgba(255,255,255,0.012)` | `[&_tr:hover_td]:bg-[rgba(255,255,255,0.012)]` (on the `<table>`) |
| `.admin-table th` `8px 10px` / `10px` font / `0.18em` / `400` / tertiary / `border-bottom .5px` | `border-b-[0.5px] border-border px-2.5 py-2 text-left text-[10px] font-normal uppercase tracking-[0.18em] text-[var(--text-tertiary)]` |
| `.admin-table td` `10px` / secondary / sans / `border-bottom .5px` / middle | `border-b-[0.5px] border-border p-2.5 text-left align-middle font-sans text-muted-foreground` |
| `.filters` `gap:14px` / wrap / end / `mb:18px` | `mb-[18px] flex flex-wrap items-end gap-[14px]` |
| `.filters .field` `min-width:150px` | `cn(FIELD, "min-w-[150px]")` |
| `.row-actions` `gap:6px` / wrap | `flex flex-wrap gap-1.5` |
| `.action-form` `bg-subtle` / `.5px border` / `4px` / `12px 14px` / `mt:8px` | `mt-2 rounded-[4px] border-[0.5px] border-border bg-[var(--bg-subtle)] px-3.5 py-3` |
| `.inline-fields` `gap:8px` / wrap / end | `flex flex-wrap items-end gap-2` |
| `.btn-primary.btn-sm` (gold gradient, `4px 10px`, `11px`, `600`) | `BTN_PRIMARY_SM` (see ui.ts) |
| `.pill.for_sale` sr colour + `rgba(212,168,87,.4)` border | `border-[rgba(212,168,87,0.4)] text-rarity-sr` |
| `.pill.for_trade` ssr colour + `rgba(214,138,163,.4)` border | `border-[rgba(214,138,163,0.4)] text-rarity-ssr` |
| `.pill.sold` / `.pill.traded` quaternary | `text-[var(--text-quaternary)]` |
| `.pill` (owned — no legacy rule) | `""` (base only) |
| `.pill.dup` primary + `rgba(201,161,74,.4)` border + `.08` fill | `border-[rgba(201,161,74,0.4)] bg-[rgba(201,161,74,0.08)] text-primary` |
| `.pill.reserved` `rgba(234,179,8,.15)` fill + `#a16207` (border unchanged) | `bg-[rgba(234,179,8,0.15)] text-[#a16207]` |
| `.line-editor` `mt:12px` | `mt-3` |
| `.line-editor-head` `gap:12px` / center / `mb:6px` | `mb-1.5 flex items-center gap-3` |
| `.line-row` `gap:8px` / center / `mt:6px` | `mt-1.5 flex items-center gap-2` |
| `.line-row select` `min-width:220px` | `cn(CONTROL, "min-w-[220px]")` |
| `.line-row input[type=number]` `width:72px` | `cn(CONTROL, "w-[72px]")` |
| `想換：` inline `var(--text-tertiary)` | `text-[var(--text-tertiary)]` |
| non-active `—` inline `var(--text-quaternary)` | `text-[var(--text-quaternary)]` |
| inline `style={{marginLeft:N}}` | `ml-1.5` (6px) / `ml-2` (8px) |
| inline `style={{marginTop:N}}` on error | `mt-1.5` (6px) / `mt-2` (8px) |

---

## Task 1: Migrate ManageCards + add the shared 4b table/pill/form constants

**Files:**
- Modify: `src/client/admin/ui.ts` (append the Phase-4b ManageCards constants)
- Modify: `src/client/admin/ManageCards.tsx` (full reskin; logic unchanged)
- Test: `test/client/admin.test.tsx` (no change — the 3 existing `ManageCards` tests guard the reskin)

**Interfaces:**
- Consumes (from 4a `ui.ts`): `PANEL`, `PANEL_TITLE`, `FIELD`, `FIELD_LABEL`, `CONTROL`, `BTN_GHOST_SM`, `ERROR_TEXT`, `PILL_BASE`, `PILL_RARITY`; `Button` from `@/components/ui/button`, `Input` from `@/components/ui/input`, `cn` from `@/lib/utils`.
- Produces (new `ui.ts` exports, reused by Task 2 + Phase 4c): `TABLE`, `TH`, `TD`, `FILTERS`, `ROW_ACTIONS`, `ACTION_FORM`, `INLINE_FIELDS`, `BTN_PRIMARY_SM`, `PILL_STATUS: Record<string,string>`, `PILL_DUP`, `PILL_RESERVED`.

- [ ] **Step 1: Confirm the baseline — existing ManageCards tests pass**

Run: `npx vitest run --config vitest.client.config.ts test/client/admin.test.tsx -t "ManageCards"`
Expected: 3 PASS (this is the green baseline the reskin must preserve). NB: the client tests need `--config vitest.client.config.ts` — the default `vitest.config.ts` only includes `test/worker/**` and reports "No test files found" for this path.

- [ ] **Step 2: Append the Phase-4b ManageCards constants to `src/client/admin/ui.ts`**

Append this block at the **end** of `src/client/admin/ui.ts` (after the existing `ERROR_TEXT` export):

```ts

// === Phase 4b: ManageCards (+ shared with PendingTrades / 4c) ========

// Admin data table (.admin-table) — bespoke <table>, ported 1:1 from
// admin.css (4b decision: keep a plain table rather than fight shadcn
// Table's 1px-row-border / nowrap / last-row-stripped defaults). The
// hover tint is the legacy `.admin-table tr:hover td` selector verbatim.
export const TABLE =
  "w-full border-collapse text-[13px] [&_tr:hover_td]:bg-[rgba(255,255,255,0.012)]";
export const TH =
  "border-b-[0.5px] border-border px-2.5 py-2 text-left text-[10px] font-normal uppercase tracking-[0.18em] text-[var(--text-tertiary)]";
export const TD =
  "border-b-[0.5px] border-border p-2.5 text-left align-middle font-sans text-muted-foreground";

// Filter bar (.filters) above the ManageCards table. Each field composes
// cn(FIELD, "min-w-[150px]") for the legacy .filters .field min-width.
export const FILTERS = "mb-[18px] flex flex-wrap items-end gap-[14px]";

// Row action button cluster (.row-actions).
export const ROW_ACTIONS = "flex flex-wrap gap-1.5";

// Inline expand-in-place form (.action-form) + its field row (.inline-fields),
// shared by ManageCards's ActionForm and PendingTrades's ReservationForm.
export const ACTION_FORM =
  "mt-2 rounded-[4px] border-[0.5px] border-border bg-[var(--bg-subtle)] px-3.5 py-3";
export const INLINE_FIELDS = "flex flex-wrap items-end gap-2";

// Small gold primary button (.btn-primary.btn-sm) — the .btn-sm-sized sibling
// of BTN_PRIMARY, for the inline confirm actions (確認 / 新增預約 / 確認完成).
export const BTN_PRIMARY_SM =
  "h-auto rounded-[4px] bg-gradient-to-r from-[var(--primary-dim)] to-primary px-2.5 py-1 font-sans text-[11px] font-semibold tracking-[0.06em] text-[#1a1612] hover:brightness-[1.08]";

// Status / duplicate / reserved pills, layered on PILL_BASE via cn(). `owned`
// has no legacy rule → base only (""). for_sale/for_trade recolour text + border;
// sold/traded dim to quaternary; dup is gold-filled; reserved is amber-filled
// (its border stays PILL_BASE's border-strong — legacy .pill.reserved sets only
// background + color).
export const PILL_STATUS: Record<string, string> = {
  owned: "",
  for_sale: "border-[rgba(212,168,87,0.4)] text-rarity-sr",
  for_trade: "border-[rgba(214,138,163,0.4)] text-rarity-ssr",
  sold: "text-[var(--text-quaternary)]",
  traded: "text-[var(--text-quaternary)]",
};
export const PILL_DUP =
  "border-[rgba(201,161,74,0.4)] bg-[rgba(201,161,74,0.08)] text-primary";
export const PILL_RESERVED = "bg-[rgba(234,179,8,0.15)] text-[#a16207]";
```

> `cn(PILL_BASE, PILL_STATUS[s])`: `PILL_BASE` ends with `text-[var(--text-tertiary)]` + `border-[var(--border-strong)]`; the variant's `text-*` / `border-[rgba(...)]` override via tailwind-merge (rgba parses as a colour, so it replaces the border *colour* while `PILL_BASE`'s `border-[0.5px]` *width* survives).

- [ ] **Step 3: Rewrite `src/client/admin/ManageCards.tsx`**

Replace the entire file with (state, handlers, `STATUS_LABEL`, `ActionKind`, and the `ActionForm`/`ManageCards` split all identical to the original; only imports + returned JSX change):

```tsx
import { Fragment, useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { RARITIES, SERIES, charactersFor } from "../../../seed/catalog-def";
import type { CardRow, Rarity } from "../../shared/types";
import { listCards, patchCard, postTransaction } from "../api";
import {
  ACTION_FORM,
  BTN_GHOST_SM,
  BTN_PRIMARY_SM,
  CONTROL,
  ERROR_TEXT,
  FIELD,
  FIELD_LABEL,
  FILTERS,
  INLINE_FIELDS,
  PANEL,
  PANEL_TITLE,
  PILL_BASE,
  PILL_DUP,
  PILL_RARITY,
  PILL_RESERVED,
  PILL_STATUS,
  ROW_ACTIONS,
  TABLE,
  TD,
  TH,
} from "./ui";

type ActionKind = "list_sale" | "list_trade" | "sale" | "trade";

const STATUS_LABEL: Record<string, string> = {
  owned: "持有",
  for_sale: "待售",
  for_trade: "待換",
  sold: "已售出",
  traded: "已交換",
};

function ActionForm({
  card,
  kind,
  onDone,
  onCancel,
}: {
  card: CardRow;
  kind: ActionKind;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [price, setPrice] = useState("");
  const [want, setWant] = useState("");
  const [counterparty, setCounterparty] = useState("");
  const [happenedAt, setHappenedAt] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const [rSeries, setRSeries] = useState(SERIES[0]);
  const rChars = charactersFor(rSeries);
  const [rChar, setRChar] = useState(rChars[0]);
  const [rRarity, setRRarity] = useState<Rarity>("R");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setErr(null);
    try {
      if (kind === "list_sale") {
        await patchCard(card.id, {
          status: "for_sale",
          askingPrice: price ? Number(price) : null,
        });
      } else if (kind === "list_trade") {
        await patchCard(card.id, {
          status: "for_trade",
          wantInReturn: want || null,
        });
      } else if (kind === "sale") {
        await postTransaction({
          cardId: card.id,
          type: "sale",
          price: price ? Number(price) : undefined,
          counterparty: counterparty || undefined,
          happenedAt,
        });
      } else {
        await postTransaction({
          cardId: card.id,
          type: "trade",
          counterparty: counterparty || undefined,
          happenedAt,
          receivedSeries: rSeries,
          receivedCharacter: rChar,
          receivedRarity: rRarity,
        });
      }
      onDone();
    } catch (e) {
      setErr(String(e));
      setBusy(false);
    }
  };

  return (
    <div className={ACTION_FORM}>
      <div className={INLINE_FIELDS}>
        {kind === "list_sale" || kind === "sale" ? (
          <label className={FIELD}>
            <span className={FIELD_LABEL}>價格 (TWD)</span>
            <Input
              type="number"
              className={CONTROL}
              value={price}
              onChange={(e) => setPrice(e.target.value)}
            />
          </label>
        ) : null}
        {kind === "list_trade" ? (
          <label className={FIELD}>
            <span className={FIELD_LABEL}>想換的卡 / 條件</span>
            <Input
              className={CONTROL}
              value={want}
              onChange={(e) => setWant(e.target.value)}
              placeholder="例如 KILLER Kirari UR"
            />
          </label>
        ) : null}
        {kind === "sale" || kind === "trade" ? (
          <>
            <label className={FIELD}>
              <span className={FIELD_LABEL}>對象</span>
              <Input
                className={CONTROL}
                value={counterparty}
                onChange={(e) => setCounterparty(e.target.value)}
              />
            </label>
            <label className={FIELD}>
              <span className={FIELD_LABEL}>日期</span>
              <Input
                type="date"
                className={CONTROL}
                value={happenedAt}
                onChange={(e) => setHappenedAt(e.target.value)}
              />
            </label>
          </>
        ) : null}
        {kind === "trade" ? (
          <>
            <label className={FIELD}>
              <span className={FIELD_LABEL}>換得系列</span>
              <select
                className={CONTROL}
                value={rSeries}
                onChange={(e) => {
                  setRSeries(e.target.value);
                  setRChar(charactersFor(e.target.value)[0]);
                }}
              >
                {SERIES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
            <label className={FIELD}>
              <span className={FIELD_LABEL}>換得角色</span>
              <select
                className={CONTROL}
                value={rChar}
                onChange={(e) => setRChar(e.target.value)}
              >
                {rChars.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
            <label className={FIELD}>
              <span className={FIELD_LABEL}>稀有度</span>
              <select
                className={CONTROL}
                value={rRarity}
                onChange={(e) => setRRarity(e.target.value as Rarity)}
              >
                {RARITIES.map((rr) => (
                  <option key={rr} value={rr}>
                    {rr}
                  </option>
                ))}
              </select>
            </label>
          </>
        ) : null}
        <Button
          type="button"
          className={BTN_PRIMARY_SM}
          onClick={submit}
          disabled={busy}
        >
          {busy ? "處理中…" : "確認"}
        </Button>
        <Button
          type="button"
          variant="outline"
          className={BTN_GHOST_SM}
          onClick={onCancel}
        >
          取消
        </Button>
      </div>
      {err ? <div className={cn(ERROR_TEXT, "mt-2")}>{err}</div> : null}
    </div>
  );
}

export function ManageCards() {
  const [filterSeries, setFilterSeries] = useState("");
  const [filterStatus, setFilterStatus] = useState("active");
  const [rows, setRows] = useState<CardRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [action, setAction] = useState<{
    cardId: number;
    kind: ActionKind;
  } | null>(null);

  const reload = useCallback(() => {
    setRows(null);
    setError(null);
    listCards({
      series: filterSeries || undefined,
      status: filterStatus || undefined,
    })
      .then(setRows)
      .catch((e) => setError(String(e)));
  }, [filterSeries, filterStatus]);

  useEffect(() => {
    reload();
  }, [reload]);

  const onDone = () => {
    setAction(null);
    reload();
  };

  return (
    <section className={PANEL}>
      <h2 className={PANEL_TITLE}>卡片管理</h2>
      <div className={FILTERS}>
        <label className={cn(FIELD, "min-w-[150px]")}>
          <span className={FIELD_LABEL}>系列</span>
          <select
            className={CONTROL}
            value={filterSeries}
            onChange={(e) => setFilterSeries(e.target.value)}
          >
            <option value="">全部系列</option>
            {SERIES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <label className={cn(FIELD, "min-w-[150px]")}>
          <span className={FIELD_LABEL}>狀態</span>
          <select
            className={CONTROL}
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
          >
            <option value="active">持有中（可管理）</option>
            <option value="for_sale">待售</option>
            <option value="for_trade">待換</option>
            <option value="owned">純持有</option>
            <option value="sold">已售出</option>
            <option value="traded">已交換</option>
          </select>
        </label>
      </div>

      {error ? <div className={ERROR_TEXT}>{error}</div> : null}
      {rows === null ? (
        <div className="state-msg">載入中…</div>
      ) : rows.length === 0 ? (
        <div className="trade-empty">沒有符合的卡片。</div>
      ) : (
        <table className={TABLE}>
          <thead>
            <tr>
              <th className={TH}>系列</th>
              <th className={TH}>角色</th>
              <th className={TH}>稀有度</th>
              <th className={TH}>狀態</th>
              <th className={TH}>操作</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((card) => {
              const isActive =
                card.status === "owned" ||
                card.status === "for_sale" ||
                card.status === "for_trade";
              const open = action?.cardId === card.id;
              return (
                <Fragment key={card.id}>
                  <tr>
                    <td className={TD}>{card.series}</td>
                    <td className={TD}>{card.character}</td>
                    <td className={TD}>
                      <span className={cn(PILL_BASE, PILL_RARITY[card.rarity])}>
                        {card.rarity}
                      </span>
                    </td>
                    <td className={TD}>
                      <span className={cn(PILL_BASE, PILL_STATUS[card.status])}>
                        {STATUS_LABEL[card.status]}
                      </span>
                      {card.duplicate && isActive ? (
                        <span className={cn(PILL_BASE, PILL_DUP, "ml-1.5")}>
                          重複
                        </span>
                      ) : null}
                      {card.reservedGive > 0 && isActive ? (
                        <span className={cn(PILL_BASE, PILL_RESERVED, "ml-1.5")}>
                          預約中 ×{card.reservedGive}
                        </span>
                      ) : null}
                      {card.status === "for_sale" &&
                      card.askingPrice != null ? (
                        <span className="ml-2">{card.askingPrice} 元</span>
                      ) : null}
                      {card.status === "for_trade" && card.wantInReturn ? (
                        <span className="ml-2 text-[var(--text-tertiary)]">
                          想換：{card.wantInReturn}
                        </span>
                      ) : null}
                    </td>
                    <td className={TD}>
                      {isActive ? (
                        <div className={ROW_ACTIONS}>
                          <Button
                            type="button"
                            variant="outline"
                            className={BTN_GHOST_SM}
                            onClick={() =>
                              setAction({ cardId: card.id, kind: "list_sale" })
                            }
                          >
                            待售
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            className={BTN_GHOST_SM}
                            onClick={() =>
                              setAction({ cardId: card.id, kind: "list_trade" })
                            }
                          >
                            待換
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            className={BTN_GHOST_SM}
                            onClick={() =>
                              setAction({ cardId: card.id, kind: "sale" })
                            }
                          >
                            賣出
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            className={BTN_GHOST_SM}
                            onClick={() =>
                              setAction({ cardId: card.id, kind: "trade" })
                            }
                          >
                            交換
                          </Button>
                          {card.status !== "owned" ? (
                            <Button
                              type="button"
                              variant="outline"
                              className={BTN_GHOST_SM}
                              onClick={() => {
                                patchCard(card.id, { status: "owned" })
                                  .then(reload)
                                  .catch(() => {});
                              }}
                            >
                              取消上架
                            </Button>
                          ) : null}
                        </div>
                      ) : (
                        <span className="text-[var(--text-quaternary)]">—</span>
                      )}
                    </td>
                  </tr>
                  {open && action ? (
                    <tr>
                      <td className={TD} colSpan={5}>
                        <ActionForm
                          card={card}
                          kind={action.kind}
                          onDone={onDone}
                          onCancel={() => setAction(null)}
                        />
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      )}
    </section>
  );
}
```

> Notes: native `<select>` kept (filters + the trade form). Inputs use `<Input>` + `CONTROL`. The expand row's `<td className={TD} colSpan={5}>` keeps the legacy 10px cell padding so the `ACTION_FORM` `mt-2` sits exactly as before. The asking-price span is `ml-2` only — **no `font-mono`** (Decision §7).

- [ ] **Step 4: Confirm no legacy admin classes remain in ManageCards**

Run: `grep -nE 'className="(panel|pill|btn|field|filters|admin-table|row-actions|action-form|inline-fields|opt|tally)' src/client/admin/ManageCards.tsx`
Expected: **no matches** (every legacy class is now a constant or `cn(...)`). The only bare-string classNames left are `"state-msg"`, `"trade-empty"` (intentional legacy holdouts), and plain Tailwind utilities (`ml-2`, `ml-1.5`, `min-w-[150px]`, `text-[var(--text-quaternary)]`, `text-[var(--text-tertiary)]`). Eyeball that every `className=` references a constant, a `cn(...)`, an intentional holdout, or a Tailwind utility string — never a legacy admin class literal.

- [ ] **Step 5: Run the ManageCards suite — expect PASS (unmodified)**

Run: `npx vitest run --config vitest.client.config.ts test/client/admin.test.tsx -t "ManageCards"`
Expected: 3 PASS, unchanged. Spot-checks proving the contract held:
- `lists fetched cards, flags duplicates, and opens a sell form` → `getByText("Rei")`, `getByText("重複")` (the `PILL_DUP` span), click `賣出` (a `<Button>` → `<button>`), then `getByText("價格 (TWD)")` + `getByText("對象")` (the `ActionForm` field labels).
- `shows a 預約中 badge …` → `getByText(/預約中/)` (the `PILL_RESERVED` span on an active row).
- `hides the 預約中 badge on a sold/traded row …` → `queryByText(/預約中/)` is null (status `traded` → `isActive` false → pill not rendered).

- [ ] **Step 6: Build + full test + visual smoke**

Run: `npm run build && npm test`
Expected: build + all tests green.

Visual smoke (`npm run dev`, `/admin` → 卡片管理): two filter dropdowns styled as before (subtle fill, strong border, no native arrow); the 5-column table with 10px uppercase dim headers, 0.5px borders, 13px rows, faint row-hover tint, and a bottom border under the last row; rarity pill colours; status pills (持有 neutral, 待售 gold/sr, 待換 pink/ssr); 重複 gold pill + 預約中 amber pill; for-sale price shows `N 元` in the inherited sans font (**not** mono); ghost row-action buttons; clicking 賣出 expands an inline form (subtle bg, 確認 gold-sm + 取消 ghost-sm); clicking 交換 shows the 換得系列/角色/稀有度 selects. All must match the pre-migration look.

- [ ] **Step 7: Lint + commit**

```bash
lineguard src/client/admin/ui.ts src/client/admin/ManageCards.tsx
npx biome check --write src/client/admin/ui.ts src/client/admin/ManageCards.tsx
npm test
git add src/client/admin/ui.ts src/client/admin/ManageCards.tsx
git commit -m "feat: migrate admin ManageCards to bespoke table + shadcn Button/Input"
```

---

## Task 2: Migrate PendingTrades + add the line-editor constants

**Files:**
- Modify: `src/client/admin/ui.ts` (append the line-editor constants)
- Modify: `src/client/admin/PendingTrades.tsx` (full reskin; logic unchanged)
- Test: `test/client/admin.test.tsx` (no change — the 6 existing `PendingTrades` tests guard the reskin)

**Interfaces:**
- Consumes (from 4a + Task 1 `ui.ts`): `PANEL`, `PANEL_TITLE`, `FIELD`, `FIELD_LABEL`, `CONTROL`, `BTN_GHOST_SM`, `BTN_PRIMARY_SM`, `ERROR_TEXT`, `ACTION_FORM`, `INLINE_FIELDS`, `ROW_ACTIONS`, `TABLE`, `TH`, `TD`; `Button`, `Input`, `cn`.
- Produces (new `ui.ts` exports, reusable by 4c): `LINE_EDITOR`, `LINE_EDITOR_HEAD`, `LINE_ROW`.

- [ ] **Step 1: Confirm the baseline — existing PendingTrades tests pass**

Run: `npx vitest run --config vitest.client.config.ts test/client/admin.test.tsx -t "PendingTrades"`
Expected: 6 PASS (the green baseline the reskin must preserve, including the two native-`<select>`-dependent tests).

- [ ] **Step 2: Append the line-editor constants to `src/client/admin/ui.ts`**

Append at the **end** of `src/client/admin/ui.ts` (after the Task-1 block):

```ts

// === Phase 4b: PendingTrades line editor (.line-editor / -head / -row) =
export const LINE_EDITOR = "mt-3";
export const LINE_EDITOR_HEAD = "mb-1.5 flex items-center gap-3";
export const LINE_ROW = "mt-1.5 flex items-center gap-2";
```

- [ ] **Step 3: Rewrite `src/client/admin/PendingTrades.tsx`**

Replace the entire file with (every interface, helper, `useMemo`/`useCallback`, and the `toOpt`/`LineEditor`/`ReservationForm`/`PendingRowItem`/`PendingTrades` split identical to the original; only imports + returned JSX change):

```tsx
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type {
  AdminPendingTrade,
  Rarity,
  ReservationLineInput,
} from "../../shared/types";
import {
  cancelReservation,
  completeReservation,
  fetchAdminPendingTrades,
  fetchOverview,
  postReservation,
} from "../api";
import {
  type Matrix,
  RARITIES,
  type TradeItem,
  buildMatrix,
  computeTrade,
  pendingReceiveByCoord,
  receivableCards,
} from "../collection";
import {
  ACTION_FORM,
  BTN_GHOST_SM,
  BTN_PRIMARY_SM,
  CONTROL,
  ERROR_TEXT,
  FIELD,
  FIELD_LABEL,
  INLINE_FIELDS,
  LINE_EDITOR,
  LINE_EDITOR_HEAD,
  LINE_ROW,
  PANEL,
  PANEL_TITLE,
  ROW_ACTIONS,
  TABLE,
  TD,
  TH,
} from "./ui";

const today = () => new Date().toISOString().slice(0, 10);

// Already-owned cards have no natural receive cap; clamp the number input here.
const RECEIVE_QTY_CAP = 99;

interface Opt {
  value: string; // "si|ci|ri"
  label: string;
  series: string;
  character: string;
  rarity: Rarity;
  max: number;
  hint: string; // parenthetical shown in the dropdown, e.g. "餘 3" or "持有 2"
}

function toOpt(m: Matrix, t: TradeItem, max: number, hint?: string): Opt {
  const series = m.series[t.si];
  const character = m.characters[t.ci];
  const rarity = RARITIES[t.ri];
  return {
    value: `${t.si}|${t.ci}|${t.ri}`,
    label: `${series} ${character} ${rarity}`,
    series,
    character,
    rarity,
    max,
    hint: hint ?? `餘 ${max}`,
  };
}

interface LineDraft {
  value: string;
  qty: number;
}

function LineEditor({
  title,
  opts,
  drafts,
  setDrafts,
}: {
  title: string;
  opts: Opt[];
  drafts: LineDraft[];
  setDrafts: (d: LineDraft[]) => void;
}) {
  const add = () => {
    if (opts.length === 0) return;
    setDrafts([...drafts, { value: opts[0].value, qty: 1 }]);
  };
  const update = (i: number, patch: Partial<LineDraft>) =>
    setDrafts(drafts.map((d, j) => (j === i ? { ...d, ...patch } : d)));
  const remove = (i: number) => setDrafts(drafts.filter((_, j) => j !== i));

  return (
    <div className={LINE_EDITOR}>
      <div className={LINE_EDITOR_HEAD}>
        <span className={FIELD_LABEL}>{title}</span>
        <Button
          type="button"
          variant="outline"
          className={BTN_GHOST_SM}
          onClick={add}
          disabled={opts.length === 0}
        >
          ＋ 新增{title}
        </Button>
      </div>
      {drafts.map((d, i) => {
        const opt = opts.find((o) => o.value === d.value);
        const max = opt?.max ?? 1;
        return (
          <div className={LINE_ROW} key={`${title}-${d.value}-${i}`}>
            <select
              className={cn(CONTROL, "min-w-[220px]")}
              value={d.value}
              onChange={(e) => update(i, { value: e.target.value, qty: 1 })}
            >
              {opts.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}（{o.hint}）
                </option>
              ))}
            </select>
            <Input
              type="number"
              min={1}
              max={max}
              className={cn(CONTROL, "w-[72px]")}
              value={d.qty}
              onChange={(e) =>
                update(i, {
                  qty: Math.max(1, Math.min(max, Number(e.target.value) || 1)),
                })
              }
            />
            <Button
              type="button"
              variant="outline"
              className={BTN_GHOST_SM}
              onClick={() => remove(i)}
            >
              移除
            </Button>
          </div>
        );
      })}
    </div>
  );
}

function ReservationForm({
  giveOpts,
  recvOpts,
  onDone,
}: {
  giveOpts: Opt[];
  recvOpts: Opt[];
  onDone: () => void;
}) {
  const [counterparty, setCounterparty] = useState("");
  const [reservedAt, setReservedAt] = useState(today());
  const [note, setNote] = useState("");
  const [gives, setGives] = useState<LineDraft[]>([]);
  const [receives, setReceives] = useState<LineDraft[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const toInputs = (drafts: LineDraft[], opts: Opt[]): ReservationLineInput[] =>
    drafts
      .map((d) => {
        const o = opts.find((x) => x.value === d.value);
        return o
          ? {
              series: o.series,
              character: o.character,
              rarity: o.rarity,
              qty: d.qty,
            }
          : null;
      })
      .filter((x): x is ReservationLineInput => x !== null);

  const submit = async () => {
    setErr(null);
    const give = toInputs(gives, giveOpts);
    if (give.length === 0) {
      setErr("至少要有一張給出");
      return;
    }
    setBusy(true);
    try {
      await postReservation({
        counterparty: counterparty || undefined,
        reservedAt,
        note: note || undefined,
        give,
        receive: toInputs(receives, recvOpts),
      });
      setGives([]);
      setReceives([]);
      setCounterparty("");
      setNote("");
      onDone();
    } catch (e) {
      setErr(String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={ACTION_FORM}>
      <div className={INLINE_FIELDS}>
        <label className={FIELD}>
          <span className={FIELD_LABEL}>對象</span>
          <Input
            className={CONTROL}
            value={counterparty}
            onChange={(e) => setCounterparty(e.target.value)}
          />
        </label>
        <label className={FIELD}>
          <span className={FIELD_LABEL}>日期</span>
          <Input
            type="date"
            className={CONTROL}
            value={reservedAt}
            onChange={(e) => setReservedAt(e.target.value)}
          />
        </label>
        <label className={FIELD}>
          <span className={FIELD_LABEL}>備註</span>
          <Input
            className={CONTROL}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </label>
      </div>
      <LineEditor
        title="給出"
        opts={giveOpts}
        drafts={gives}
        setDrafts={setGives}
      />
      <LineEditor
        title="換入"
        opts={recvOpts}
        drafts={receives}
        setDrafts={setReceives}
      />
      <div className={INLINE_FIELDS}>
        <Button
          type="button"
          className={BTN_PRIMARY_SM}
          onClick={submit}
          disabled={busy}
        >
          {busy ? "處理中…" : "新增預約"}
        </Button>
      </div>
      {err ? <div className={cn(ERROR_TEXT, "mt-2")}>{err}</div> : null}
    </div>
  );
}

function PendingRowItem({
  p,
  onChange,
}: {
  p: AdminPendingTrade;
  onChange: () => void;
}) {
  const [completing, setCompleting] = useState(false);
  const [happenedAt, setHappenedAt] = useState(today());
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const summary = (lines: AdminPendingTrade["give"]) =>
    lines
      .map((l) => `${l.series} ${l.character} ${l.rarity}×${l.qty}`)
      .join("、") || "—";

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setErr(null);
    try {
      await fn();
      onChange();
    } catch (e) {
      setErr(String(e));
      setBusy(false);
    }
  };

  return (
    <tr>
      <td className={TD}>{p.reservedAt}</td>
      <td className={TD}>{p.counterparty ?? "—"}</td>
      <td className={TD}>{summary(p.give)}</td>
      <td className={TD}>{summary(p.receive)}</td>
      <td className={TD}>
        {completing ? (
          <div className={INLINE_FIELDS}>
            <Input
              type="date"
              className={CONTROL}
              value={happenedAt}
              onChange={(e) => setHappenedAt(e.target.value)}
            />
            <Button
              type="button"
              className={BTN_PRIMARY_SM}
              disabled={busy}
              onClick={() => run(() => completeReservation(p.id, happenedAt))}
            >
              確認完成
            </Button>
            <Button
              type="button"
              variant="outline"
              className={BTN_GHOST_SM}
              onClick={() => setCompleting(false)}
            >
              返回
            </Button>
          </div>
        ) : (
          <div className={ROW_ACTIONS}>
            <Button
              type="button"
              variant="outline"
              className={BTN_GHOST_SM}
              onClick={() => setCompleting(true)}
            >
              完成
            </Button>
            <Button
              type="button"
              variant="outline"
              className={BTN_GHOST_SM}
              disabled={busy}
              onClick={() => run(() => cancelReservation(p.id))}
            >
              取消
            </Button>
          </div>
        )}
        {err ? <div className={cn(ERROR_TEXT, "mt-1.5")}>{err}</div> : null}
      </td>
    </tr>
  );
}

export function PendingTrades() {
  const [m, setM] = useState<Matrix | null>(null);
  const [pending, setPending] = useState<AdminPendingTrade[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(() => {
    setError(null);
    Promise.all([fetchOverview(), fetchAdminPendingTrades()])
      .then(([ov, pt]) => {
        setM(buildMatrix(ov));
        setPending(pt);
      })
      .catch((e) => setError(String(e)));
  }, []);
  useEffect(() => reload(), [reload]);

  const { giveOpts, recvOpts } = useMemo(() => {
    if (!m || !pending) return { giveOpts: [] as Opt[], recvOpts: [] as Opt[] };
    const { surplus } = computeTrade(m);
    const incoming = pendingReceiveByCoord(m, pending);
    return {
      giveOpts: surplus.map((t) => toOpt(m, t, t.spare)),
      // One unified 換入 list over the whole catalog: 持有 N for cards you hold,
      // 缺 for missing ones, plus ・已預定換入 M when another pending trade is
      // already bringing it in (so a card never hides between two sub-lists).
      recvOpts: receivableCards(m).map((t) => {
        const p = incoming.get(`${t.si}|${t.ci}|${t.ri}`) ?? 0;
        const base = t.spare >= 1 ? `持有 ${t.spare}` : "缺";
        return toOpt(
          m,
          t,
          RECEIVE_QTY_CAP,
          p > 0 ? `${base}・已預定換入 ${p}` : base,
        );
      }),
    };
  }, [m, pending]);

  return (
    <section className={PANEL}>
      <h2 className={PANEL_TITLE}>交換預約</h2>
      {error ? <div className={ERROR_TEXT}>{error}</div> : null}
      {!m || !pending ? (
        <div className="state-msg">載入中…</div>
      ) : (
        <>
          <ReservationForm
            giveOpts={giveOpts}
            recvOpts={recvOpts}
            onDone={reload}
          />
          {pending.length === 0 ? (
            <div className="trade-empty">目前沒有暫定交換。</div>
          ) : (
            <table className={cn(TABLE, "mt-4")}>
              <thead>
                <tr>
                  <th className={TH}>日期</th>
                  <th className={TH}>對象</th>
                  <th className={TH}>給出</th>
                  <th className={TH}>換入</th>
                  <th className={TH}>操作</th>
                </tr>
              </thead>
              <tbody>
                {pending.map((p) => (
                  <PendingRowItem key={p.id} p={p} onChange={reload} />
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
    </section>
  );
}
```

> Notes: native `<select>` kept in `LineEditor` (the `{ selector: "option" }` and `owned.closest("select")` tests depend on it); qty `<Input type="number">` width via `cn(CONTROL, "w-[72px]")`; the pending table is `cn(TABLE, "mt-4")` for the legacy `marginTop:16`; error divs use `cn(ERROR_TEXT, "mt-2" | "mt-1.5")` for the legacy `marginTop:8 | 6`.

- [ ] **Step 4: Confirm no legacy admin classes remain in PendingTrades**

Run: `grep -nE 'className="(panel|pill|btn|field|admin-table|row-actions|action-form|inline-fields|line-editor|line-row)' src/client/admin/PendingTrades.tsx`
Expected: **no matches**. Only bare-string classNames left: `"state-msg"`, `"trade-empty"` (intentional holdouts). Everything else is a constant, a `cn(...)`, or a Tailwind utility.

- [ ] **Step 5: Run the PendingTrades suite — expect PASS (unmodified)**

Run: `npx vitest run --config vitest.client.config.ts test/client/admin.test.tsx -t "PendingTrades"`
Expected: 6 PASS, unchanged. The two that prove native `<select>`/`<option>` survived:
- `lists the whole catalog in one 換入 section …` → `getByText("MP 4TH Mizuki R（餘 1）")` / `getByText("KILLER Rei SR（缺・已預定換入 1）")` and `getAllByText(/（缺）$/, { selector: "option" })` (native `<option>` text).
- `can receive an already-owned card through the unified 換入 list` → `owned.closest("select")` then `fireEvent.change(select, …)` (native `<select>`).

If either fails, **stop** — it means a `<select>`/`<option>` was accidentally swapped for a shadcn portal component; revert to native.

- [ ] **Step 6: Build + full test + visual smoke**

Run: `npm run build && npm test`
Expected: build + all tests green (worker + client).

Visual smoke (`npm run dev`, `/admin` → 交換預約): the reservation form (subtle-bg `ACTION_FORM`) with 對象/日期/備註 inputs; 給出 + 換入 line editors each with a label + `＋ 新增…` ghost button, and per line a wide select (≥220px) + a 72px qty number + a 移除 ghost button; the gold-sm 新增預約 button; the pending table (5 cols, same table styling as 卡片管理) sitting 16px below the form; per row 完成/取消 ghost buttons; clicking 完成 swaps in a date input + 確認完成 (gold-sm) + 返回 (ghost-sm). All must match the pre-migration look.

- [ ] **Step 7: Lint + commit**

```bash
lineguard src/client/admin/ui.ts src/client/admin/PendingTrades.tsx
npx biome check --write src/client/admin/ui.ts src/client/admin/PendingTrades.tsx
npm test
git add src/client/admin/ui.ts src/client/admin/PendingTrades.tsx
git commit -m "feat: migrate admin PendingTrades to bespoke table + shadcn Button/Input"
```

---

## Finishing the branch

After Task 2, use **superpowers:finishing-a-development-branch**: verify `npm test` green + `npx biome check .` clean + `npm run typecheck` clean (3 tsconfigs) + `npm run build`, then push and open the PR (`feat/shadcn-phase4b`). PR body ends with:
`🤖 Generated with [Claude Code](https://claude.com/claude-code)`

Suggested PR summary: continues **Phase 4 (後台)** — migrates `ManageCards` and `PendingTrades` off `admin.css` onto the shared `ui.ts` constants + shadcn `Button`/`Input` + a **bespoke Tailwind-restyled `<table>`**. Call out **zero new npm deps / zero new primitives**, the user-confirmed **bespoke-table decision** (kept plain `<table>` rather than fight shadcn `<Table>`'s 1px-row-border / nowrap / last-row-stripped defaults — consistent with the 3c Grid table), the **native-`<select>` kept** (the two `{ selector: "option" }` / `closest("select")` tests stay green unmodified), and that `admin.css` is **not yet deleted** — only Openings/History + the `admin.css` removal remain for 4c. After merge, optionally drive Copilot review via `/pr-workflow:copilot-iterate`.

## Self-Review (completed by author)

- **Spec coverage (§5.4 Phase 4, second slice):** ManageCards (`.admin-table`→bespoke table, `.pill.<status>`→`PILL_STATUS`/`PILL_DUP`/`PILL_RESERVED`, `.filters`/`.row-actions`/`.action-form` reskin, `.btn`→`Button`) → Task 1; PendingTrades (`.line-editor*` reskin, native `<select>` line editor, pending table) → Task 2. Openings/History + `admin.css` deletion remain for 4c (noted in PR summary). ✔
- **Placeholder scan:** every code step carries exact file contents (both full panels + the `ui.ts` blocks), class strings ported 1:1 from `admin.css` (token table), and commands with expected output. No TBD / "handle edge cases". ✔
- **Type consistency:** `PILL_STATUS` is `Record<string,string>` keyed by `CardStatus` strings (`owned`/`for_sale`/`for_trade`/`sold`/`traded`), consumed as `PILL_STATUS[card.status]`; `PILL_RARITY[card.rarity]` reuses the 4a `Record<Rarity,string>`; `TABLE`/`TH`/`TD`/`BTN_PRIMARY_SM`/`LINE_*`/`ACTION_FORM`/`INLINE_FIELDS`/`ROW_ACTIONS`/`FILTERS` are plain `string`; `Button` props (`variant="outline"`/default, `disabled`, `onClick`) and `Input` (`React.ComponentProps<"input">`: `type`/`min`/`max`/`value`/`onChange`/`placeholder`) match the real component APIs; `cn` from `@/lib/utils`. The `Opt`/`LineDraft`/`ActionKind`/`TallyEntry`-free interfaces and all handlers are copied verbatim from the originals. ✔
- **Regression strategy:** the 3 ManageCards + 6 PendingTrades behavioural tests guard both reskins **unmodified** (text + button-name + native-`<option>`/`<select>` queries). No new test is added: native `<select>`/`<button>`/`<input>` are kept, so there is no new semantic to lock (contrast 4a's Toggle aria-pressed). Each task re-runs its suite before and after, then the full suite + build + a visual smoke (the only check that catches CSS-layer / pixel parity, which jsdom can't see). ✔
- **Bespoke-table fidelity:** `TABLE`/`TH`/`TD` port `.admin-table` 1:1 — `border-collapse` + `text-[13px]`; per-cell `border-b-[0.5px] border-border` (so the **last** row keeps its border, unlike shadcn's `[&_tr:last-child]:border-0`); default cell wrapping (no `whitespace-nowrap`); and the `[&_tr:hover_td]:bg-[rgba(255,255,255,0.012)]` table-level selector reproducing `.admin-table tr:hover td` exactly. The inline-expand row is `<td className={TD} colSpan={5}>` keeping the 10px cell pad under `ACTION_FORM`'s `mt-2`. ✔
- **Coexistence risk:** `admin.css` stays in `@layer legacy` + imported; the migrated `CONTROL`/`TABLE`/pill utilities (in `utilities`) win over the still-present `.admin input/select` + `.admin-table`/`.pill` legacy rules for these two panels, while Openings/History keep legacy styling until 4c. `.state-msg`/`.trade-empty` (in `index.css`) are deliberately left as legacy string classes. ✔
- **Known-subtle preserved:** the for-sale asking-price `<span className="mono">` was inert under the `.admin-table td.mono` compound selector (never matched the inner span), so it renders sans today — ported as `ml-2` with **no** `font-mono` to avoid a visual regression (Decision §7); flagged in both the code note and the visual smoke. ✔
