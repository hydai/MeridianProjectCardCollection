# shadcn Phase 4c — Openings + History Migration & `admin.css` Deletion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish Phase 4 (後台) by migrating the two remaining read-only admin panels — `Openings` and `History` — off `admin.css` onto the shared `src/client/admin/ui.ts` constants, then **delete the entire 359-line `admin.css`** and its import, retiring the last of the hand-written admin CSS.

**Architecture:** Phase 4 retires `admin.css` across three shippable sub-phases (4a: primitives + AddCards ✅; 4b: ManageCards + PendingTrades ✅; **4c: Openings + History + delete `admin.css`** ← this plan). 4c adds **zero** new primitives and **zero** new npm deps — it extends `ui.ts` with just two new constants (`SUMMARY_LINE`, `TD_MONO`), reuses every other 4a/4b constant (`PANEL`, `PANEL_TITLE`, `ERROR_TEXT`, `TABLE`/`TH`/`TD`, `PILL_BASE`, `PILL_RARITY`), reskins the two panels, and removes `admin.css`. Per the carried **bespoke-table decision** (4b §2) the admin tables stay plain `<table>` styled by `TABLE`/`TH`/`TD`. Unlike 4a/4b, these two panels have **no existing behavioural tests**, so this plan adds a small render test per panel first (TDD-for-reskin: lock the current accessible content, then re-platform). All 4c work lands on one `feat/shadcn-phase4c` branch → one PR.

**Tech Stack:** React 18, React Router 7, Vite 6, Tailwind v4 (`@tailwindcss/vite`), shadcn (radix-nova base), `class-variance-authority`, Biome, Vitest + Testing Library. **Zero new npm dependencies; zero new shadcn primitives.**

## Global Constraints

These apply to **every** task; each task's requirements implicitly include them.

- **Visual parity is the acceptance bar.** The migrated UI must match the legacy rendering pixel-for-pixel. Class strings in `ui.ts` are ported 1:1 from `admin.css` (see the token table). Do not change the visual result.
- **Zero behaviour change.** UI re-platforming only — no new features, no data/route/worker changes. Data flow, `useEffect` fetches, and computed summaries (`totalCost`, `avg`, `income`) are copied verbatim; only imports + returned JSX change.
- **Preserve accessible content + native semantics.** The new render tests query user-visible text (summary numbers, pill labels, cell values, `—` placeholders) and survive the reskin unchanged.
- **`.state-msg` / `.trade-empty` survive untouched.** They live in `index.css` `@layer legacy` (NOT `admin.css`), are shared with the public views, and are cleared in Phase 5 — keep the bare `className="state-msg"` / `className="trade-empty"` literals as-is.
- **`admin.css` is deleted in Task 3, not before.** Tasks 1–2 migrate the panels while `admin.css` stays imported (it still styles nothing the migrated panels use, but the import is removed only once both panels are off it, so each task stays independently shippable). After Task 3 there is no `admin.css` and no `.admin` wrapper class.
- **Before each commit:** run `lineguard` on changed files, then `npm test` (green), then `npx biome check .` (clean). A PreToolUse hook also auto-runs format/lint/test on `git commit`.
- **Conventional Commits**, one concern per commit. Commit trailer (repo style):
  `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`
- **Additive git only** — no force-push, no rebase inside the loop.

## Decisions carried from / made for Phase 4c

1. **Slicing = 4a/4b/4c.** 4c = Openings + History (the two read-only summary+table panels) + the `admin.css` deletion. This is the final Phase-4 slice.
2. **Bespoke `<table>`** (4b §2, user-confirmed). Reuse `TABLE`/`TH`/`TD`. Do **not** `import` from `@/components/ui/table`.
3. **`td.mono` is LIVE here — must be ported.** 4b's Decision §7 dropped the `mono` class because `.admin-table td.mono` never matched the inner `<span class="mono">` it sat next to. In Openings/History the *same* selector **does** match real `<td className="mono">` cells (date / count / cost / avg), so the JetBrains-Mono font + brighter `var(--text)` colour **is** rendering today. Port it to a new `TD_MONO = cn(TD, "font-mono text-foreground")` constant so deleting `admin.css` causes **zero** visual change. (Confirm in the visual smoke: the date/number columns stay monospaced and slightly brighter than the sans columns.)
4. **History pills reuse `PILL_RARITY`.** The transaction-type pill (`賣出`→`.pill.sr` gold, `交換`→`.pill.ssr` pink) and the rarity pill (`.pill.<rarity>`) are all text-colour-only recolours of `PILL_BASE`. Reuse `PILL_RARITY.SR` / `PILL_RARITY.SSR` for the type pill and `PILL_RARITY[t.rarity]` for the rarity pill — no new pill constant needed (`PILL_RARITY` values are text-colour-only; the border stays `PILL_BASE`'s `border-strong`, exactly like the legacy `.pill.sr` which sets only `color`).
5. **Render tests added (departure from 4b's "zero new test").** 4b added no test because the existing suite already guarded the reskin. Openings/History have **no** component test, so 4c writes one small render test each — *against the current legacy component first* (it passes), then reskins and re-runs (still green). The tests assert user-visible text only (never classes), so they are reskin-agnostic. **Open for review:** if you prefer to match 4b's visual-smoke-only minimalism, drop Step 1/Step 5 test work from Tasks 1–2 and rely on the smoke + typecheck + build; the rest of the plan is unchanged.
6. **toast→Sonner and pill→Badge are NOT in scope** — already consciously superseded. The spec (§5.4) listed both, but 4a replaced the legacy `.toast` class with the bespoke `TOAST` constant (italic gold span in `AddCards`) and 4a/4b kept admin pills as styled `<span>` on `PILL_BASE` rather than `Badge`. Re-introducing Sonner / `Badge` now would add a dependency/primitive and contradict the shipped decisions. 4c keeps the bespoke styling. (Phase 5 may revisit; out of scope here.)
7. **Drop the dead `.admin` wrapper class in Task 3.** `admin.css`'s `.admin input/select/textarea` element rule is the only thing that consumed the `admin` class on `Admin.tsx`'s wrapper. Once every admin control carries `CONTROL`/`CHECKBOX` (verified: AddCards/ManageCards/PendingTrades/Openings/History all do after Tasks 1–2), `.admin` matches no rule — remove the `admin` token from the wrapper `className` along with the import. The `appearance-auto` in `CHECKBOX` (added in 4a to defeat `.admin input { appearance: none }`) becomes a harmless explicit native value — **leave it** (removing it is needless churn).

## Design-token reference (legacy `admin.css` value → Tailwind utility)

Only **two** new constants; everything else reuses 4a/4b exports.

| Legacy rule / value | Tailwind utility (new `ui.ts` export) |
|---|---|
| `.summary-line` `font-size:13px` / `var(--text-secondary)` / `0.06em` / `mb:16px` | `SUMMARY_LINE` base: `mb-4 text-[13px] tracking-[0.06em] text-muted-foreground` |
| `.summary-line strong` `var(--text)` / `font-weight:500` | …appended descendant variant: `[&_strong]:font-medium [&_strong]:text-foreground` |
| `.admin-table td.mono` `JetBrains Mono` + `var(--text)` (layered on `.admin-table td`) | `TD_MONO = cn(TD, "font-mono text-foreground")` (twMerge drops `font-sans` + `text-muted-foreground`) |
| `.admin-table` / `th` / `td` (the table itself) | reuse `TABLE` / `TH` / `TD` (4b) |
| `.panel` / `.panel-title` | reuse `PANEL` / `PANEL_TITLE` (4a) |
| `.error-text` | reuse `ERROR_TEXT` (4a) |
| `.pill` + rarity colour | reuse `PILL_BASE` + `PILL_RARITY[r]` (4a) |
| `.pill.sr` (sale type) / `.pill.ssr` (trade type) | reuse `PILL_RARITY.SR` / `PILL_RARITY.SSR` |
| inline `style={{ marginLeft: 4 }}` | `ml-1` (4px) |

---

## Task 1: Migrate Openings + add `SUMMARY_LINE` and `TD_MONO`

**Files:**
- Modify: `src/client/admin/ui.ts` (append the two Phase-4c constants; add `cn` import)
- Modify: `src/client/admin/Openings.tsx` (full reskin; logic unchanged)
- Test: `test/client/admin.test.tsx` (add an `Openings` describe block — new coverage)

**Interfaces:**
- Consumes (from 4a/4b `ui.ts`): `PANEL`, `PANEL_TITLE`, `ERROR_TEXT`, `TABLE`, `TH`, `TD`; `cn` from `@/lib/utils`.
- Produces (new `ui.ts` exports, reused by Task 2): `SUMMARY_LINE: string`, `TD_MONO: string`.

- [ ] **Step 1: Write the render test for the CURRENT (legacy) Openings — it must PASS before the reskin**

Add this block to `test/client/admin.test.tsx`. First add the import near the top (after the `PendingTrades` import on line 6):

```tsx
import { Openings } from "../../src/client/admin/Openings";
```

Then append this describe block at the end of the file:

```tsx
describe("Openings", () => {
  it("renders the cost summary and a monospaced data row", async () => {
    const rows = [
      {
        id: 1,
        series: "NEW YEAR",
        openedAt: "2026-06-01",
        cost: 600,
        cardCount: 10,
        avgCost: 60,
      },
    ];
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, json: async () => rows })),
    );

    render(<Openings />);

    // Summary line: 1 opening, 600 spent, 600/10 = 60.0 avg per card.
    await waitFor(() =>
      expect(screen.getByText(/共/)).toBeInTheDocument(),
    );
    expect(screen.getByText("開箱成本")).toBeInTheDocument();
    // Row cells (the mono columns): date, count, cost, avg-cost.
    expect(screen.getByText("2026-06-01")).toBeInTheDocument();
    expect(screen.getByText("NEW YEAR")).toBeInTheDocument();
    expect(screen.getByText("600 元")).toBeInTheDocument();
    expect(screen.getByText("60.0 元")).toBeInTheDocument();
  });

  it("shows the empty state when there are no openings", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, json: async () => [] })),
    );
    render(<Openings />);
    await waitFor(() =>
      expect(screen.getByText(/尚無開箱紀錄/)).toBeInTheDocument(),
    );
  });
});
```

- [ ] **Step 2: Run the new Openings test against the legacy component — expect PASS**

Run: `npx vitest run --config vitest.client.config.ts test/client/admin.test.tsx -t "Openings"`
Expected: 2 PASS. This is the green baseline the reskin must preserve. (The client tests need `--config vitest.client.config.ts` — the default `vitest.config.ts` only includes `test/worker/**`.)

- [ ] **Step 3: Append the Phase-4c constants to `src/client/admin/ui.ts`**

At the **top** of `ui.ts`, add the `cn` import (so `TD_MONO` can twMerge-derive from `TD`). The current first import is `import { RARITY_TEXT } from "@/shared/rarity";` — add above it:

```ts
import { cn } from "@/lib/utils";
```

Then append this block at the **end** of `ui.ts` (after the Phase-4b line-editor constants):

```ts

// === Phase 4c: Openings + History ====================================

// Summary line (.summary-line) above the openings / history tables. The
// descendant variant ports `.summary-line strong` (brighter, medium weight)
// so the <strong> children need no per-element class.
export const SUMMARY_LINE =
  "mb-4 text-[13px] tracking-[0.06em] text-muted-foreground [&_strong]:font-medium [&_strong]:text-foreground";

// Monospaced table cell (.admin-table td.mono) — JetBrains Mono + brighter
// foreground, layered on TD. Unlike 4b's inert inner-<span> case, the
// `.admin-table td.mono` selector genuinely matches these <td> cells, so this
// must be ported. cn() lets tailwind-merge drop TD's font-sans + muted text,
// leaving exactly one font-family and one text-colour class.
export const TD_MONO = cn(TD, "font-mono text-foreground");
```

- [ ] **Step 4: Rewrite `src/client/admin/Openings.tsx`**

Replace the entire file with (every hook, fetch, and the `totalCost`/`totalCards`/`avg` computation identical to the original; only imports + JSX change):

```tsx
import { useEffect, useState } from "react";
import type { OpeningSummary } from "../../shared/types";
import { fetchOpenings } from "../api";
import {
  ERROR_TEXT,
  PANEL,
  PANEL_TITLE,
  SUMMARY_LINE,
  TABLE,
  TD,
  TD_MONO,
  TH,
} from "./ui";

export function Openings() {
  const [rows, setRows] = useState<OpeningSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchOpenings()
      .then(setRows)
      .catch((e) => setError(String(e)));
  }, []);

  if (error) {
    return (
      <section className={PANEL}>
        <div className={ERROR_TEXT}>{error}</div>
      </section>
    );
  }
  if (rows === null) {
    return (
      <section className={PANEL}>
        <div className="state-msg">載入中…</div>
      </section>
    );
  }

  const totalCost = rows.reduce((s, o) => s + (o.cost ?? 0), 0);
  const totalCards = rows.reduce((s, o) => s + o.cardCount, 0);
  const avg = totalCards ? totalCost / totalCards : 0;

  return (
    <section className={PANEL}>
      <h2 className={PANEL_TITLE}>開箱成本</h2>
      {rows.length === 0 ? (
        <div className="trade-empty">
          尚無開箱紀錄。到「開箱新增」勾選「這是一次開箱」即可記錄花費。
        </div>
      ) : (
        <>
          <div className={SUMMARY_LINE}>
            共 <strong>{rows.length}</strong> 次開箱 · 總花費{" "}
            <strong>{totalCost}</strong> 元 · 平均每張{" "}
            <strong>{avg.toFixed(1)}</strong> 元
          </div>
          <table className={TABLE}>
            <thead>
              <tr>
                <th className={TH}>日期</th>
                <th className={TH}>系列</th>
                <th className={TH}>張數</th>
                <th className={TH}>花費</th>
                <th className={TH}>每張成本</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((o) => (
                <tr key={o.id}>
                  <td className={TD_MONO}>{o.openedAt}</td>
                  <td className={TD}>{o.series ?? "—"}</td>
                  <td className={TD_MONO}>{o.cardCount}</td>
                  <td className={TD_MONO}>
                    {o.cost != null ? `${o.cost} 元` : "—"}
                  </td>
                  <td className={TD_MONO}>
                    {o.avgCost != null ? `${o.avgCost.toFixed(1)} 元` : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </section>
  );
}
```

> Note: `Openings.tsx` uses the bare `TD` / `TD_MONO` constants directly (no call-site composition), so it does **not** import `cn` — only `History.tsx` (Task 2) needs `cn` for its pill `cn(...)` calls.

- [ ] **Step 5: Confirm no legacy admin classes remain in Openings**

Run: `grep -nE 'className="(panel|panel-title|summary-line|admin-table|error-text|mono)"' src/client/admin/Openings.tsx`
Expected: **no matches**. The only bare-string classNames left are `"state-msg"` and `"trade-empty"` (intentional `index.css` holdouts).

- [ ] **Step 6: Run the Openings test — expect PASS (unmodified)**

Run: `npx vitest run --config vitest.client.config.ts test/client/admin.test.tsx -t "Openings"`
Expected: 2 PASS, unchanged — the reskin preserved the summary text, the mono cell values, and the empty state.

- [ ] **Step 7: Build + full test + visual smoke**

Run: `npm run build && npm test`
Expected: build + all tests green.

Visual smoke (`npm run dev`, `/admin` → 開箱成本): the panel shell + serif title; the summary line (13px, dim, with brighter medium-weight `<strong>` numbers); the 5-column table with 10px uppercase dim headers, 0.5px borders, faint row-hover tint, and a bottom border under the last row; the **date / 張數 / 花費 / 每張成本 columns render in JetBrains Mono and slightly brighter** than the sans 系列 column (the `TD_MONO` port); `—` placeholders where cost/avg are null. Must match the pre-migration look.

- [ ] **Step 8: Lint + commit**

```bash
lineguard src/client/admin/ui.ts src/client/admin/Openings.tsx test/client/admin.test.tsx
npx biome check --write src/client/admin/ui.ts src/client/admin/Openings.tsx test/client/admin.test.tsx
npm test
git add src/client/admin/ui.ts src/client/admin/Openings.tsx test/client/admin.test.tsx
git commit -m "feat: migrate admin Openings to bespoke table + shared ui.ts constants"
```

---

## Task 2: Migrate History (reuse the Task-1 constants)

**Files:**
- Modify: `src/client/admin/History.tsx` (full reskin; logic unchanged)
- Test: `test/client/admin.test.tsx` (add a `History` describe block — new coverage)
- (`ui.ts` is **not** modified — Task 2 reuses `SUMMARY_LINE`/`TD_MONO`/`TABLE`/`TH`/`TD`/`PILL_BASE`/`PILL_RARITY`.)

**Interfaces:**
- Consumes (from 4a/4b + Task 1 `ui.ts`): `PANEL`, `PANEL_TITLE`, `ERROR_TEXT`, `SUMMARY_LINE`, `TABLE`, `TH`, `TD`, `TD_MONO`, `PILL_BASE`, `PILL_RARITY`; `cn` from `@/lib/utils`.
- Produces: nothing new.

- [ ] **Step 1: Write the render test for the CURRENT (legacy) History — it must PASS before the reskin**

Add the import near the top of `test/client/admin.test.tsx` (after the `Openings` import added in Task 1):

```tsx
import { History } from "../../src/client/admin/History";
```

Then append this describe block at the end of the file:

```tsx
describe("History", () => {
  it("renders the income summary, type pills, rarity pills, and a trade row", async () => {
    const rows = [
      {
        id: 1,
        cardId: 11,
        type: "sale",
        counterparty: "阿明",
        price: 300,
        happenedAt: "2026-06-02",
        series: "KILLER",
        character: "Rei",
        rarity: "SR",
        note: null,
      },
      {
        id: 2,
        cardId: 12,
        type: "trade",
        counterparty: null,
        price: null,
        happenedAt: "2026-06-03",
        series: "NEW YEAR",
        character: "Mizuki",
        rarity: "R",
        note: null,
      },
    ];
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, json: async () => rows })),
    );

    render(<History />);

    await waitFor(() =>
      expect(screen.getByText("交易歷史")).toBeInTheDocument(),
    );
    // Summary: 2 records, sale income = 300.
    expect(screen.getByText(/共/)).toBeInTheDocument();
    // Type pills.
    expect(screen.getByText("賣出")).toBeInTheDocument();
    expect(screen.getByText("交換")).toBeInTheDocument();
    // Rarity pills.
    expect(screen.getByText("SR")).toBeInTheDocument();
    expect(screen.getByText("R")).toBeInTheDocument();
    // Counterparty + the sale price (mono cell); the trade row's null price → —.
    expect(screen.getByText("阿明")).toBeInTheDocument();
    expect(screen.getByText("300 元")).toBeInTheDocument();
  });

  it("shows the empty state when there are no transactions", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, json: async () => [] })),
    );
    render(<History />);
    await waitFor(() =>
      expect(screen.getByText(/尚無成交紀錄/)).toBeInTheDocument(),
    );
  });
});
```

- [ ] **Step 2: Run the new History test against the legacy component — expect PASS**

Run: `npx vitest run --config vitest.client.config.ts test/client/admin.test.tsx -t "History"`
Expected: 2 PASS (green baseline for the reskin).

- [ ] **Step 3: Rewrite `src/client/admin/History.tsx`**

Replace the entire file with (the `income` reduce identical to the original; only imports + JSX change). The legacy `pill ${t.type === "sale" ? "sr" : "ssr"}` becomes `cn(PILL_BASE, t.type === "sale" ? PILL_RARITY.SR : PILL_RARITY.SSR)`; the legacy `pill ${t.rarity.toLowerCase()}` + `style={{marginLeft:4}}` becomes `cn(PILL_BASE, PILL_RARITY[t.rarity], "ml-1")`:

```tsx
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import type { TxnRecord } from "../../shared/types";
import { fetchTransactions } from "../api";
import {
  ERROR_TEXT,
  PANEL,
  PANEL_TITLE,
  PILL_BASE,
  PILL_RARITY,
  SUMMARY_LINE,
  TABLE,
  TD,
  TD_MONO,
  TH,
} from "./ui";

export function History() {
  const [rows, setRows] = useState<TxnRecord[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchTransactions()
      .then(setRows)
      .catch((e) => setError(String(e)));
  }, []);

  if (error) {
    return (
      <section className={PANEL}>
        <div className={ERROR_TEXT}>{error}</div>
      </section>
    );
  }
  if (rows === null) {
    return (
      <section className={PANEL}>
        <div className="state-msg">載入中…</div>
      </section>
    );
  }

  const income = rows
    .filter((t) => t.type === "sale")
    .reduce((s, t) => s + (t.price ?? 0), 0);

  return (
    <section className={PANEL}>
      <h2 className={PANEL_TITLE}>交易歷史</h2>
      {rows.length === 0 ? (
        <div className="trade-empty">尚無成交紀錄。</div>
      ) : (
        <>
          <div className={SUMMARY_LINE}>
            共 <strong>{rows.length}</strong> 筆 · 賣出收入合計{" "}
            <strong>{income}</strong> 元
          </div>
          <table className={TABLE}>
            <thead>
              <tr>
                <th className={TH}>日期</th>
                <th className={TH}>類型</th>
                <th className={TH}>卡片</th>
                <th className={TH}>對象</th>
                <th className={TH}>金額</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((t) => (
                <tr key={t.id}>
                  <td className={TD_MONO}>{t.happenedAt}</td>
                  <td className={TD}>
                    <span
                      className={cn(
                        PILL_BASE,
                        t.type === "sale" ? PILL_RARITY.SR : PILL_RARITY.SSR,
                      )}
                    >
                      {t.type === "sale" ? "賣出" : "交換"}
                    </span>
                  </td>
                  <td className={TD}>
                    {t.series} · {t.character}{" "}
                    <span className={cn(PILL_BASE, PILL_RARITY[t.rarity], "ml-1")}>
                      {t.rarity}
                    </span>
                  </td>
                  <td className={TD}>{t.counterparty ?? "—"}</td>
                  <td className={TD_MONO}>
                    {t.price != null ? `${t.price} 元` : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </section>
  );
}
```

> Notes: native table kept (bespoke `TABLE`/`TH`/`TD`). The 日期 + 金額 columns are `TD_MONO` (legacy `td.mono`); 類型 / 卡片 / 對象 are plain `TD`. Type pill = `PILL_RARITY.SR` (sale, gold) / `PILL_RARITY.SSR` (trade, pink) — reusing the rarity colour tokens because legacy `.pill.sr`/`.pill.ssr` set only `color`. Rarity pill is `cn(PILL_BASE, PILL_RARITY[t.rarity], "ml-1")` — `ml-1` = the legacy inline `marginLeft:4`.

- [ ] **Step 4: Confirm no legacy admin classes remain in History**

Run: `grep -nE 'className=(\{`|"(panel|panel-title|summary-line|admin-table|error-text|mono|pill))' src/client/admin/History.tsx`
Expected: **no matches** — no `className="pill ..."` template literals, no legacy class strings. Only `"state-msg"` / `"trade-empty"` holdouts remain as bare strings; everything else is a constant or `cn(...)`.

- [ ] **Step 5: Run the History test — expect PASS (unmodified)**

Run: `npx vitest run --config vitest.client.config.ts test/client/admin.test.tsx -t "History"`
Expected: 2 PASS, unchanged — type/rarity pill labels, the mono price cell, and the empty state all preserved.

- [ ] **Step 6: Build + full test + visual smoke**

Run: `npm run build && npm test`
Expected: build + all tests green.

Visual smoke (`npm run dev`, `/admin` → 交易歷史): summary line with brighter `<strong>` numbers; 5-column table; 日期 + 金額 columns monospaced + brighter (`TD_MONO`); the 類型 pill gold for 賣出 / pink for 交換; the rarity pill in its rarity colour sitting 4px after the card name; `—` for null counterparty/price. Must match the pre-migration look.

- [ ] **Step 7: Lint + commit**

```bash
lineguard src/client/admin/History.tsx test/client/admin.test.tsx
npx biome check --write src/client/admin/History.tsx test/client/admin.test.tsx
npm test
git add src/client/admin/History.tsx test/client/admin.test.tsx
git commit -m "feat: migrate admin History to bespoke table + shared ui.ts constants"
```

---

## Task 3: Delete `admin.css`, its import, and the dead `.admin` wrapper class

**Files:**
- Delete: `src/client/admin/admin.css`
- Modify: `src/client/admin/Admin.tsx` (remove `import "./admin.css"` + drop the `admin` token from the wrapper `className`)

**Interfaces:** none — this task only removes dead CSS.

- [ ] **Step 1: Gate — prove no admin-CSS class is referenced anywhere**

Run:
```bash
grep -rnE 'className=(\{`[^`]*\b|"[^"]*\b)(panel|panel-title|field-label|btn-primary|btn-ghost|btn-sm|add-actions|opening-fields|inline-fields|\btoast\b|error-text|admin-table|\bpill\b|row-actions|filters|summary-line|action-form|line-editor|line-row|opt-group|\bopt\b|tally|\bmono\b)\b' src/client/
```
Expected: **no matches** (every admin-CSS class is now a `ui.ts` constant). If anything matches, **stop** — that panel still depends on `admin.css` and must be migrated first.

Also confirm only `Admin.tsx` imports the file:
```bash
grep -rn '"\./admin.css"\|admin\.css' src/client/ | grep -v 'ui.ts'
```
Expected: exactly one match — `src/client/admin/Admin.tsx:4:import "./admin.css";`.

- [ ] **Step 2: Delete `admin.css`**

Run: `git rm src/client/admin/admin.css`
Expected: `rm 'src/client/admin/admin.css'`.

- [ ] **Step 3: Remove the import and the dead `.admin` class from `Admin.tsx`**

In `src/client/admin/Admin.tsx`:

1. Delete line 4: `import "./admin.css";`
2. In the wrapper `<div>` (line 25), remove the leading `admin ` token from the className. Change:

```tsx
    <div className="admin mx-auto max-w-[940px] px-7 pt-14 pb-24 max-sm:px-4 max-sm:pt-10 max-sm:pb-[72px]">
```
to:
```tsx
    <div className="mx-auto max-w-[940px] px-7 pt-14 pb-24 max-sm:px-4 max-sm:pt-10 max-sm:pb-[72px]">
```

The resulting import block (lines 1–8) becomes:
```tsx
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useState } from "react";
import { AddCards } from "./AddCards";
import { History } from "./History";
import { ManageCards } from "./ManageCards";
import { Openings } from "./Openings";
import { PendingTrades } from "./PendingTrades";
```

- [ ] **Step 4: Verify the deletion is clean**

Run:
```bash
test ! -e src/client/admin/admin.css && echo "admin.css gone"
grep -rn "admin.css" src/client/ | grep -v 'ui.ts comment'
grep -n '"admin' src/client/admin/Admin.tsx
```
Expected: prints `admin.css gone`; the second grep shows no live `import`/reference (only the historical comments in `ui.ts` may mention the filename — those are fine); the third grep shows **no** `className="admin ..."`.

- [ ] **Step 5: Full typecheck + test + build**

Run: `npm run typecheck && npm test && npm run build`
Expected: all green across the 3 tsconfigs, worker + client suites, and the production build. (No `@import`/PostCSS error from the removed file; no unused-class lint.)

- [ ] **Step 6: Full-admin visual smoke**

Run `npm run dev`, walk **all five** admin tabs (開箱新增 / 卡片管理 / 交換預約 / 開箱成本 / 交易歷史). Confirm **zero** visual change vs. before the deletion: panels, inputs/selects (subtle fill, strong border, gold focus, no native arrow), buttons (gold primary, ghost), tap-chips, tallies, tables (mono columns brighter), pills (rarity/status/dup/reserved/type), toast (italic gold), error text, and the empty/loading states. The `.admin` element-selector rules are gone, so this is the proof every control already carried `CONTROL`/`CHECKBOX`.

- [ ] **Step 7: Lint + commit**

```bash
lineguard src/client/admin/Admin.tsx
npx biome check --write src/client/admin/Admin.tsx
npm test
git add -A src/client/admin/
git commit -m "refactor: delete admin.css — Phase 4 admin migration complete"
```

---

## Finishing the branch

After Task 3, use **superpowers:finishing-a-development-branch**: verify `npm test` green + `npx biome check .` clean + `npm run typecheck` clean (3 tsconfigs) + `npm run build`, then push and open the PR (`feat/shadcn-phase4c`). PR body ends with:
`🤖 Generated with [Claude Code](https://claude.com/claude-code)`

Suggested PR summary: completes **Phase 4 (後台)** — migrates the last two admin panels (`Openings`, `History`) off `admin.css` onto the shared `ui.ts` constants + bespoke `<table>`, then **deletes the entire 359-line `admin.css`** and its import. Call out: **zero new npm deps / zero new primitives** (only `SUMMARY_LINE` + `TD_MONO` constants added); the **`td.mono` port** (live here, unlike 4b's inert inner-span — Decision §3); **new render tests** for the two previously-untested panels (Decision §5); **toast→Sonner / pill→Badge intentionally out of scope** (already superseded by the bespoke `TOAST`/`PILL_BASE` decisions — Decision §6); and that **Phase 5** (remove PostCSS/autoprefixer, clear the `index.css` `.state-msg`/`.trade-empty` holdouts, ARIA roving-tabindex tabs, README/DEPLOY notes) is all that remains. After merge, optionally drive Copilot review via `/pr-workflow:copilot-iterate`.

## Self-Review (completed by author)

- **Spec coverage (§5.4 Phase 4, final slice):** Openings (`.panel`/`.panel-title`/`.summary-line`/`.admin-table`+`td.mono`→constants) → Task 1; History (same + `.pill` type/rarity → `PILL_BASE`+`PILL_RARITY`) → Task 2; **delete `admin.css`** (the Phase-4 "完成後刪除的 CSS = 整個 admin.css" column) → Task 3. The spec's "toast→Sonner / pill→Badge" are explicitly addressed as superseded (Decision §6), not silently skipped. ✔
- **Placeholder scan:** every code step carries exact file contents (both full panels, the `ui.ts` block, the `Admin.tsx` edits, full test blocks) and commands with expected output. No TBD / "handle edge cases". ✔
- **Type consistency:** new exports are `SUMMARY_LINE: string` and `TD_MONO: string` (the latter `cn(TD, …)` → `string`), referenced by exactly those names in Tasks 1 + 2. `PILL_RARITY` is the existing `Record<Rarity,string>` (text-colour only) — consumed as `PILL_RARITY.SR`/`PILL_RARITY.SSR`/`PILL_RARITY[t.rarity]`. Test fixtures match `OpeningSummary` (`id/series/openedAt/cost/cardCount/avgCost`) and `TxnRecord` (`id/cardId/type/counterparty/price/happenedAt/series/character/rarity/note`) verbatim from `src/shared/types.ts`. The `get` helper checks `res.ok` then `res.json()`, so the `{ ok: true, json: async () => rows }` fetch stub is correct. ✔
- **Regression strategy:** Openings/History had **no** prior tests, so each task writes its render test *against the legacy component first* (Step 1/2 PASS), reskins (Step 4), then re-runs unchanged (Step 6/5) — the tests assert visible text/pills only, never classes, so they are reskin-agnostic. Task 3's Step 1 grep gate proves no class still depends on `admin.css` before deletion; Step 5/6 prove the build + every control's self-containment. ✔
- **`td.mono` fidelity (the subtle one):** ported to `TD_MONO = cn(TD, "font-mono text-foreground")` because `.admin-table td.mono` genuinely matches the Openings/History `<td className="mono">` cells (date/count/cost/avg) — the exact inverse of 4b's Decision §7 where the selector missed the inner span. twMerge guarantees a single font-family + text-colour. Flagged in both panels' visual smoke. ✔
- **Deletion safety:** `admin.css`'s only consumers are class literals (migrated in Tasks 1–2) and the `.admin input/select/textarea` element rule (every control already carries `CONTROL`/`CHECKBOX`, verified across all five panels). `.state-msg`/`.trade-empty` live in `index.css` (not deleted). The `admin` wrapper token is dropped as dead (Decision §7). Task 3 is independently shippable and reversible. ✔
