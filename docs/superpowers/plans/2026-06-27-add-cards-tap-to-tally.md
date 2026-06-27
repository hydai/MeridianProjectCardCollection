# 開箱新增「點選累加」介面 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the 開箱新增 admin form's three `<select>` dropdowns (series / character / rarity) with flat, directly-clickable buttons using a sticky-rarity + tap-a-character-to-add tally model.

**Architecture:** Pure front-end refactor of one React component. The submission still expands to the same `AddCardInput[]` and calls the same `postCards()` API — worker, API routes, and D1 are untouched. Behavior is locked by client tests; styling is a second pass.

**Tech Stack:** React 18 + TypeScript, Vitest + @testing-library/react (jsdom), Biome (format/lint), CSS with existing design tokens in `index.css` / `admin.css`.

## Global Constraints

- UI copy is **Traditional Chinese** (繁體中文), matching the existing component.
- Formatting is **Biome**: 2-space indent, double quotes, trailing commas — `npm run format` must leave the files unchanged. (A PreToolUse git hook auto-runs format + lint + test before every commit.)
- TypeScript is strict; `npm run typecheck` must pass (Vitest does **not** typecheck, so run it explicitly).
- Data source for options is `seed/catalog-def.ts`: `SERIES` (4 entries), `charactersFor(series)` (~11–12), `RARITIES` (`["R","SR","SSR","UR"]`). Do **not** hardcode these lists.
- "One submission = one series" semantics are preserved: `series` is a single selection used for both every card and the optional opening record.
- Commits follow Conventional Commits.

---

## File Structure

| File | Responsibility | Change |
| --- | --- | --- |
| `src/client/admin/AddCards.tsx` | The 開箱新增 form component | **Rewrite** internals: dropdowns + rows → buttons + tally |
| `test/client/admin.test.tsx` | Client component tests | **Replace** the `describe("AddCards", …)` block (lines 10–33) with the new behavior tests |
| `src/client/admin/admin.css` | Admin styles | **Add** `.opt*` / `.tally*` styles; **remove** now-dead `.add-row` rules |

`src/client/admin/Admin.tsx` renders `<AddCards />` unchanged. No other file changes.

---

## Task 1: Tap-to-tally component logic + tests

Rewrite `AddCards` so options are buttons and added cards accumulate in a tally. This task owns all behavior and its tests; CSS comes in Task 2 (buttons render unstyled but functional after this task).

**Files:**
- Modify: `src/client/admin/AddCards.tsx` (full component rewrite)
- Test: `test/client/admin.test.tsx` (replace the `describe("AddCards", …)` block, lines 10–33)

**Interfaces:**
- Consumes (unchanged): `SERIES: string[]`, `charactersFor(series: string): string[]`, `RARITIES: Rarity[]` from `seed/catalog-def.ts`; `postCards(cards: AddCardInput[], opening?: OpeningInput)` from `../api`.
- Produces: a default-export-free named component `AddCards()`. Internal model — `TallyEntry = { character: string; rarity: Rarity; qty: number }`. DOM contract the tests rely on:
  - Each series / rarity / character is a `<button>` whose accessible name is its label (`"NEW YEAR"`, `"SR"`, `"Mizuki"`, …).
  - The submit button's accessible name is exactly `新增 {N} 張` where `N` = total cards in the tally (0 when empty, and the button is `disabled`).
  - Each tally row has a remove `<button>` with `aria-label={`移除 ${character} ${rarity}`}` and shows the text `×{qty}`.
  - Empty tally shows the text `點上方角色加入卡片`.

- [ ] **Step 1: Replace the AddCards test block with the new behavior tests**

In `test/client/admin.test.tsx`, replace the entire existing block (lines 10–33):

```tsx
describe("AddCards", () => {
  it("submits added cards via POST /api/admin/cards", async () => {
    const fetchMock = vi.fn(async (_url: string, _init: RequestInit) => ({
      ok: true,
      json: async () => ({ ids: [101] }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    render(<AddCards />);
    fireEvent.click(screen.getByRole("button", { name: /新增 1 張/ }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/admin/cards");
    expect(init.method).toBe("POST");
    const body = JSON.parse(init.body as string);
    expect(body.cards).toHaveLength(1);
    expect(body.cards[0]).toMatchObject({ series: "NEW YEAR", rarity: "R" });

    await waitFor(() =>
      expect(screen.getByText(/已新增 1 張/)).toBeInTheDocument(),
    );
  });
});
```

with this new block:

```tsx
describe("AddCards", () => {
  it("disables the submit button while the tally is empty", () => {
    render(<AddCards />);
    expect(screen.getByRole("button", { name: "新增 0 張" })).toBeDisabled();
    expect(screen.getByText("點上方角色加入卡片")).toBeInTheDocument();
  });

  it("adds a tapped character at the selected rarity and submits via POST", async () => {
    const fetchMock = vi.fn(async (_url: string, _init: RequestInit) => ({
      ok: true,
      json: async () => ({ ids: [101] }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    render(<AddCards />);
    // Defaults: series "NEW YEAR", rarity "R".
    fireEvent.click(screen.getByRole("button", { name: "Mizuki" }));
    fireEvent.click(screen.getByRole("button", { name: "新增 1 張" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/admin/cards");
    expect(init.method).toBe("POST");
    const body = JSON.parse(init.body as string);
    expect(body.cards).toHaveLength(1);
    expect(body.cards[0]).toMatchObject({
      series: "NEW YEAR",
      character: "Mizuki",
      rarity: "R",
    });

    await waitFor(() =>
      expect(screen.getByText(/已新增 1 張/)).toBeInTheDocument(),
    );
  });

  it("increments quantity when the same character+rarity is tapped again", async () => {
    const fetchMock = vi.fn(async (_url: string, _init: RequestInit) => ({
      ok: true,
      json: async () => ({ ids: [1, 2] }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    render(<AddCards />);
    fireEvent.click(screen.getByRole("button", { name: "Mizuki" }));
    fireEvent.click(screen.getByRole("button", { name: "Mizuki" }));
    expect(screen.getByText("×2")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "新增 2 張" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.cards).toHaveLength(2);
    expect(
      body.cards.every(
        (c: { character: string; rarity: string }) =>
          c.character === "Mizuki" && c.rarity === "R",
      ),
    ).toBe(true);
  });

  it("adds at the chosen rarity and decrements a row with its remove button", () => {
    render(<AddCards />);
    fireEvent.click(screen.getByRole("button", { name: "SR" }));
    fireEvent.click(screen.getByRole("button", { name: "Rei" }));
    fireEvent.click(screen.getByRole("button", { name: "Rei" }));
    expect(screen.getByText("×2")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "移除 Rei SR" }));
    expect(screen.getByText("×1")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "移除 Rei SR" }));
    expect(screen.queryByText("×1")).toBeNull();
    expect(screen.getByText("點上方角色加入卡片")).toBeInTheDocument();
  });

  it("drops tally entries whose character is absent from the newly selected series", () => {
    render(<AddCards />);
    fireEvent.click(screen.getByRole("button", { name: "MP 4TH" }));
    fireEvent.click(screen.getByRole("button", { name: "KSP" }));
    expect(screen.getByRole("button", { name: "新增 1 張" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "NEW YEAR" }));
    expect(screen.queryByText("KSP")).toBeNull();
    expect(screen.getByRole("button", { name: "新增 0 張" })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the AddCards tests to verify they fail**

Run: `npx vitest run --config vitest.client.config.ts test/client/admin.test.tsx -t AddCards`
Expected: FAIL — the old component has no `"Mizuki"` button and renders `新增 1 張` even when empty (e.g. `Unable to find an accessible element with the role "button" and name "新增 0 張"`).

- [ ] **Step 3: Rewrite `AddCards.tsx` with the tap-to-tally implementation**

Replace the entire contents of `src/client/admin/AddCards.tsx` with:

```tsx
import { useState } from "react";
import { RARITIES, SERIES, charactersFor } from "../../../seed/catalog-def";
import type { AddCardInput, OpeningInput, Rarity } from "../../shared/types";
import { postCards } from "../api";

interface TallyEntry {
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

  const changeSeries = (s: string) => {
    setSeries(s);
    const valid = charactersFor(s);
    setTally((t) => t.filter((e) => valid.includes(e.character)));
  };

  const addCard = (character: string) =>
    setTally((t) => {
      const i = t.findIndex(
        (e) => e.character === character && e.rarity === rarity,
      );
      if (i === -1) return [...t, { character, rarity, qty: 1 }];
      return t.map((e, j) => (j === i ? { ...e, qty: e.qty + 1 } : e));
    });

  const removeOne = (character: string, r: Rarity) =>
    setTally((t) =>
      t
        .map((e) =>
          e.character === character && e.rarity === r
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
          series,
          character: e.character,
          rarity: e.rarity,
        })),
      );
      let opening: OpeningInput | undefined;
      if (isOpening && openedAt) {
        opening = { series, openedAt, cost: cost ? Number(cost) : undefined };
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
    <section className="panel">
      <h2 className="panel-title">開箱新增</h2>

      <div className="field">
        <span className="field-label">系列</span>
        <div className="opt-group">
          {SERIES.map((s) => (
            <button
              key={s}
              type="button"
              className={`opt${s === series ? " active" : ""}`}
              onClick={() => changeSeries(s)}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      <div className="field" style={{ marginTop: 16 }}>
        <span className="field-label">稀有度</span>
        <div className="opt-group">
          {RARITIES.map((rr) => (
            <button
              key={rr}
              type="button"
              className={`opt rarity ${rr.toLowerCase()}${
                rr === rarity ? " active" : ""
              }`}
              onClick={() => setRarity(rr)}
            >
              {rr}
            </button>
          ))}
        </div>
      </div>

      <div className="field" style={{ marginTop: 16 }}>
        <span className="field-label">角色（點一下 = 加一張）</span>
        <div className="opt-group">
          {chars.map((c) => (
            <button
              key={c}
              type="button"
              className="opt"
              onClick={() => addCard(c)}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      {tally.length > 0 ? (
        <div className="tally">
          {tally.map((e) => (
            <div className="tally-row" key={`${e.character}-${e.rarity}`}>
              <span className="tally-name">{e.character}</span>
              <span className={`pill ${e.rarity.toLowerCase()}`}>
                {e.rarity}
              </span>
              <span className="tally-qty">×{e.qty}</span>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                aria-label={`移除 ${e.character} ${e.rarity}`}
                onClick={() => removeOne(e.character, e.rarity)}
              >
                –
              </button>
            </div>
          ))}
        </div>
      ) : (
        <p className="tally-empty">點上方角色加入卡片</p>
      )}

      <label
        style={{
          display: "flex",
          gap: 8,
          alignItems: "center",
          margin: "20px 0 0",
          fontSize: 14,
          color: "var(--text-secondary)",
          cursor: "pointer",
        }}
      >
        <input
          type="checkbox"
          checked={isOpening}
          onChange={(e) => setIsOpening(e.target.checked)}
        />
        這是一次開箱（記錄花費，用於成本分析）
      </label>

      {isOpening ? (
        <div className="opening-fields">
          <label className="field">
            <span className="field-label">開箱日期</span>
            <input
              type="date"
              value={openedAt}
              onChange={(e) => setOpenedAt(e.target.value)}
            />
          </label>
          <label className="field">
            <span className="field-label">總花費 (TWD)</span>
            <input
              type="number"
              inputMode="numeric"
              value={cost}
              onChange={(e) => setCost(e.target.value)}
              placeholder="例如 600"
            />
          </label>
        </div>
      ) : null}

      <div className="add-actions">
        <button
          type="button"
          className="btn btn-primary"
          onClick={submit}
          disabled={busy || total === 0}
        >
          {busy ? "新增中…" : `新增 ${total} 張`}
        </button>
        {toast ? <span className="toast">{toast}</span> : null}
        {error ? <span className="error-text">{error}</span> : null}
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Run the AddCards tests to verify they pass**

Run: `npx vitest run --config vitest.client.config.ts test/client/admin.test.tsx -t AddCards`
Expected: PASS — all 5 AddCards tests green.

- [ ] **Step 5: Run the full client suite + typecheck (no regressions)**

Run: `npm run test:client && npm run typecheck`
Expected: PASS — every client test passes (ManageCards / PendingTrades unaffected) and `tsc` reports no errors.

- [ ] **Step 6: Commit**

```bash
git add src/client/admin/AddCards.tsx test/client/admin.test.tsx
git commit -m "feat: tap-to-tally add-cards UI (buttons over dropdowns)"
```

---

## Task 2: Flat-button + tally styling

Style the new buttons and tally to match the admin aesthetic (dark surface, gold accent, thin borders, per-rarity colors), and delete the now-unused `.add-row` CSS. Behavior is already locked by Task 1; this task is visual.

**Files:**
- Modify: `src/client/admin/admin.css` (add `.opt*` / `.tally*`; remove `.add-row` rules)

**Interfaces:**
- Consumes design tokens from `src/client/index.css`: `--bg-subtle`, `--border`, `--border-strong`, `--accent`, `--text`, `--text-secondary`, `--text-tertiary`, `--r-color`, `--sr-color`, `--ssr-color`, `--ur-color`. Reuses existing `.pill.r/.sr/.ssr/.ur`, `.btn.btn-ghost.btn-sm`.
- Produces: classes `.opt-group`, `.opt`, `.opt.active`, `.opt.rarity.{r,sr,ssr,ur}.active`, `.tally`, `.tally-row`, `.tally-name`, `.tally-qty`, `.tally-empty` consumed by `AddCards.tsx` from Task 1.

- [ ] **Step 1: Append the option-button + tally styles to `admin.css`**

Add to the end of `src/client/admin/admin.css`:

```css
/* Flat option buttons (series / rarity / character) — replace the
   add-card dropdowns with directly-clickable chips. */
.opt-group {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.opt {
  appearance: none;
  background: var(--bg-subtle);
  border: 0.5px solid var(--border-strong);
  border-radius: 4px;
  color: var(--text-secondary);
  font-family: "IBM Plex Sans TC", sans-serif;
  font-size: 13px;
  letter-spacing: 0.04em;
  padding: 8px 14px;
  cursor: pointer;
  transition: border-color 0.18s ease, color 0.18s ease, background 0.18s ease;
}
.opt:hover {
  border-color: var(--accent);
  color: var(--text);
}
.opt.active {
  border-color: var(--accent);
  color: var(--accent);
  background: rgba(201, 161, 74, 0.08);
}
/* A selected rarity takes its own colour. */
.opt.rarity.r.active {
  border-color: rgba(154, 149, 139, 0.5);
  color: var(--r-color);
  background: rgba(154, 149, 139, 0.08);
}
.opt.rarity.sr.active {
  border-color: rgba(212, 168, 87, 0.5);
  color: var(--sr-color);
  background: rgba(212, 168, 87, 0.08);
}
.opt.rarity.ssr.active {
  border-color: rgba(214, 138, 163, 0.5);
  color: var(--ssr-color);
  background: rgba(214, 138, 163, 0.08);
}
.opt.rarity.ur.active {
  border-color: rgba(224, 113, 113, 0.5);
  color: var(--ur-color);
  background: rgba(224, 113, 113, 0.08);
}

/* Running tally of cards added this opening. */
.tally {
  margin-top: 16px;
  border: 0.5px solid var(--border);
  border-radius: 4px;
  background: var(--bg-subtle);
}
.tally-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  border-bottom: 0.5px solid var(--border);
}
.tally-row:last-child {
  border-bottom: none;
}
.tally-name {
  color: var(--text);
  font-size: 14px;
  min-width: 84px;
}
.tally-qty {
  margin-left: auto;
  color: var(--text-secondary);
  font-family: "JetBrains Mono", monospace;
  font-size: 13px;
}
.tally-empty {
  margin-top: 16px;
  color: var(--text-tertiary);
  font-size: 13px;
  letter-spacing: 0.06em;
}
```

- [ ] **Step 2: Remove the now-dead `.add-row` rules**

In `src/client/admin/admin.css`, delete the base rule:

```css
.add-row {
  display: grid;
  grid-template-columns: 1fr 1fr auto;
  gap: 10px;
  align-items: end;
  margin-bottom: 10px;
}
```

and delete **only** the `.add-row` override inside the `@media (max-width: 600px)` block (keep `.opening-fields` and `.admin` in that block):

```css
  .add-row {
    grid-template-columns: 1fr 1fr;
  }
```

- [ ] **Step 3: Verify `.add-row` is fully gone and nothing else references it**

Run: `grep -rn "add-row" src/client`
Expected: no output (exit code 1) — the class is removed from CSS and was already absent from the rewritten component.

- [ ] **Step 4: Run lint + the full client suite (no regressions)**

Run: `npm run lint && npm run test:client`
Expected: PASS — Biome reports no issues and all client tests stay green (CSS changes don't affect the DOM-based assertions).

- [ ] **Step 5: Visual check in the dev server**

Run: `npm run dev`
Then open the printed local URL at `/admin`, 開箱新增 分頁, and confirm:
- 系列 / 稀有度 / 角色 each render as a row of flat buttons that wrap on narrow widths.
- Clicking a series or character button highlights it in gold; clicking a rarity highlights it in that rarity's colour and stays selected.
- Tapping a character appends a tally row (`角色 · 稀有度 ×N`); tapping again increments; `–` decrements/removes; the submit button text tracks `新增 N 張` and is disabled at 0.
Stop the dev server (Ctrl-C) when done.

- [ ] **Step 6: Commit**

```bash
git add src/client/admin/admin.css
git commit -m "style: flat option buttons and tally for add-cards UI"
```

---

## Self-Review

**1. Spec coverage** (against `docs/superpowers/specs/2026-06-27-add-cards-tap-to-tally-design.md`):
- §4.1 state (`series` / `rarity` / `tally`, drop `rows`) → Task 1 Step 3. ✅
- §4.2 interactions (series filter, sticky rarity, tap-to-add, `[–]` decrement, expand-and-submit, disabled at 0) → Task 1 Steps 1 & 3, tested in Step 1. ✅
- §4.3 data flow unchanged (`postCards`/`AddCardInput`/`OpeningInput`) → Task 1 Step 3 `submit()`; asserted by the POST-body tests. ✅
- §4.4 styling (`.opt*`, rarity colours, `.tally*`, flex-wrap) → Task 2 Steps 1–2. ✅
- §5 edge cases (empty state, series-switch KSP drop, same-character-multi-rarity) → Task 1 tests 1, 4, 5. ✅
- §6 tests (all five named cases) → Task 1 Step 1. ✅

**2. Placeholder scan:** No TBD/TODO; every code step shows complete content. ✅

**3. Type consistency:** `TallyEntry`, `addCard(character)`, `removeOne(character, r)`, `changeSeries(s)`, `total` used consistently between the component (Task 1 Step 3) and the test DOM contract (Task 1 Step 1). CSS class names produced in Task 1's JSX (`opt rarity sr active`, `pill sr`, `tally-qty`) match the selectors added in Task 2. ✅
