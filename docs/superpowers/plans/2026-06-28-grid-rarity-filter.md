# Grid Rarity Filter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a button-style rarity filter (R/SR/SSR/UR) above the existing series filter on the collection grid, letting the viewer show/hide whole rarity columns across every series.

**Architecture:** Pure frontend change in one component (`Grid.tsx`). A new `hiddenR: Set<string>` of hidden rarity labels (persisted to localStorage) parallels the existing `hidden` series set. A derived `shownRarities` (preserving each rarity's original index) drives the series-header `colSpan`, the rarity header/body cells, the group left-border, and the progress denominator. The existing `loadHidden`/`saveHidden` localStorage helpers are generalized to a key-parameterized `loadHiddenSet`/`saveHiddenSet` shared by both filters.

**Tech Stack:** React 18 + TypeScript, Vite, Vitest + @testing-library/react (jsdom), Biome (lint/format).

## Global Constraints

- **Frontend only** — no DB / API / worker / migration changes. Rarity is already a column dimension; we only choose which inner columns to render.
- **Zero new CSS** — reuse `.grid-filter`, `.grid-filter-row`, `.grid-filter-label`, `.grid-filter-btns`, `.mode-btn`, `.grid-empty`, `.grid-rarity-head.gr-{r,sr,ssr,ur}`, `.grid-series-start` (all confirmed present in `src/client/index.css`).
- **Multi-select, default all-on** — store the *hidden* set (empty = everything shown).
- **localStorage keys** — rarities under `mpc:grid:hiddenRarities`; series stays `mpc:grid:hiddenSeries`.
- **Rarity set is fixed** — `RARITIES = ["R","SR","SSR","UR"]` and `RARITY_KEYS = ["r","sr","ssr","ur"]` from `src/client/collection.ts:8-9`. Do not redefine; iterate them and keep each rarity's original index `ri` for `getN(m, si, ci, ri)` and `RARITY_KEYS[ri]`.
- **Series filter behavior unchanged** — every existing test in `test/client/views.test.tsx` ("Grid volume filter" block, "renders all seven views") must stay green.
- **Commits** — Conventional Commits. Trailer (match repo): `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`. No other trailers.
- **Before each commit** — run `lineguard <changed files>` then `npm test` (full suite). A PreToolUse hook also auto-runs format/lint/test on `git commit`.

---

### Task 1: Rarity filter state, persistence, and button row

Adds the `hiddenR` state + the `稀有度` button row, and refactors the localStorage helpers to be key-parameterized. The table render is **not** touched yet — toggling a rarity flips its `aria-pressed` and persists, but columns do not change until Task 2. (This keeps `shownRarities` out of Task 1, so there is no unused variable.)

**Files:**
- Modify: `src/client/views/Grid.tsx` (helpers `loadHidden`/`saveHidden` → `loadHiddenSet`/`saveHiddenSet`; rename `STORAGE_KEY`; add `hiddenR` state, `useEffect`, `toggleRarity`, and the rarity filter row)
- Test: `test/client/views.test.tsx` (new `describe("Grid rarity filter")` block — state/UI/persistence only)

**Interfaces:**
- Consumes: `RARITIES`, `RARITY_KEYS` from `../collection` (already imported).
- Produces (used by Task 2): the component-local `hiddenR: Set<string>` state (hidden rarity *labels*, e.g. `"UR"`), persisted under `mpc:grid:hiddenRarities`; module helpers `loadHiddenSet(key: string, valid: readonly string[]): Set<string>` and `saveHiddenSet(key: string, hidden: Set<string>): void`.

- [ ] **Step 1: Write the failing tests**

Append this block to `test/client/views.test.tsx` (after the existing `describe("Grid volume filter", …)` block; `render`, `screen`, `within`, `fireEvent`, `beforeEach`, `Grid`, `SERIES` are already imported at the top of the file):

```tsx
describe("Grid rarity filter", () => {
  beforeEach(() => localStorage.clear());

  const RARITY_NAMES = ["R", "SR", "SSR", "UR"];

  it("renders a 稀有度 row with a button per rarity, all pressed by default", () => {
    const { container } = render(<Grid m={m} />);
    const filter = container.querySelector(".grid-filter") as HTMLElement;
    expect(within(filter).getByText("稀有度")).toBeInTheDocument();
    for (const name of RARITY_NAMES) {
      expect(within(filter).getByRole("button", { name })).toHaveAttribute(
        "aria-pressed",
        "true",
      );
    }
  });

  it("toggles a rarity button's aria-pressed on click", () => {
    const { container } = render(<Grid m={m} />);
    const filter = container.querySelector(".grid-filter") as HTMLElement;
    const ur = within(filter).getByRole("button", { name: "UR" });
    expect(ur).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(ur);
    expect(ur).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(ur);
    expect(ur).toHaveAttribute("aria-pressed", "true");
  });

  it("remembers hidden rarities across remounts via localStorage", () => {
    const first = render(<Grid m={m} />);
    const f1 = first.container.querySelector(".grid-filter") as HTMLElement;
    fireEvent.click(within(f1).getByRole("button", { name: "UR" }));
    first.unmount();
    const second = render(<Grid m={m} />);
    const f2 = second.container.querySelector(".grid-filter") as HTMLElement;
    expect(within(f2).getByRole("button", { name: "UR" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("ignores unknown stored rarity values and self-heals the stored set", () => {
    localStorage.setItem(
      "mpc:grid:hiddenRarities",
      JSON.stringify(["UR", "BOGUS"]),
    );
    const { container } = render(<Grid m={m} />);
    const filter = container.querySelector(".grid-filter") as HTMLElement;
    expect(within(filter).getByRole("button", { name: "UR" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    const persisted = JSON.parse(
      localStorage.getItem("mpc:grid:hiddenRarities") as string,
    ) as string[];
    expect(persisted).toEqual(["UR"]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run --config vitest.client.config.ts test/client/views.test.tsx -t "Grid rarity filter"`
Expected: FAIL — no `稀有度` label / no R/SR/SSR/UR buttons exist yet (e.g. `Unable to find an accessible element with the role "button" and name "UR"`).

- [ ] **Step 3: Generalize the localStorage helpers and rename the key constant**

In `src/client/views/Grid.tsx`, replace the current constant + `loadHidden`/`saveHidden` (lines 11-31) with:

```tsx
const SERIES_STORAGE_KEY = "mpc:grid:hiddenSeries";
const RARITY_STORAGE_KEY = "mpc:grid:hiddenRarities";

// Load a persisted "hidden" set, keeping only values still present in `valid`
// (drops stale entries — a removed series, or an unknown rarity). Returns an
// empty set if storage is unavailable or malformed.
function loadHiddenSet(key: string, valid: readonly string[]): Set<string> {
  try {
    const raw = localStorage.getItem(key);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr)
      ? new Set(
          arr.filter(
            (x): x is string => typeof x === "string" && valid.includes(x),
          ),
        )
      : new Set();
  } catch {
    return new Set();
  }
}

function saveHiddenSet(key: string, hidden: Set<string>): void {
  try {
    localStorage.setItem(key, JSON.stringify([...hidden]));
  } catch {
    // localStorage unavailable (private mode / sandboxed iframe) — skip persisting.
  }
}
```

- [ ] **Step 4: Switch the series state to the shared helper and add rarity state**

In `Grid.tsx`, the series `useState` initializer currently is (lines 35-38):

```tsx
  const [hidden, setHidden] = useState<Set<string>>(() => {
    const stored = loadHidden();
    return new Set([...stored].filter((s) => m.series.includes(s)));
  });
```

Replace it, and add the rarity state directly below, with:

```tsx
  const [hidden, setHidden] = useState<Set<string>>(() =>
    loadHiddenSet(SERIES_STORAGE_KEY, m.series),
  );
  const [hiddenR, setHiddenR] = useState<Set<string>>(() =>
    loadHiddenSet(RARITY_STORAGE_KEY, RARITIES),
  );
```

(Intersecting with `valid` now happens inside `loadHiddenSet`, so the inline `.filter` is gone. `RARITIES` is a `Rarity[]`, assignable to `readonly string[]`.)

- [ ] **Step 5: Update the series `useEffect`, add the rarity `useEffect`, and add `toggleRarity`**

The series effect currently is (lines 41-43):

```tsx
  useEffect(() => {
    saveHidden(hidden);
  }, [hidden]);
```

Replace it, and add the rarity effect, with:

```tsx
  useEffect(() => {
    saveHiddenSet(SERIES_STORAGE_KEY, hidden);
  }, [hidden]);

  useEffect(() => {
    saveHiddenSet(RARITY_STORAGE_KEY, hiddenR);
  }, [hiddenR]);
```

Then, directly after the existing `toggle` function (lines 45-51), add:

```tsx
  const toggleRarity = (r: string) =>
    setHiddenR((prev) => {
      const next = new Set(prev);
      if (next.has(r)) next.delete(r);
      else next.add(r);
      return next;
    });
```

- [ ] **Step 6: Add the rarity filter row at the top of `.grid-filter`**

In the `.grid-filter` container, insert the rarity row immediately *before* the existing `{volumeRows.map(...)}` (before line 99):

```tsx
      <div className="grid-filter">
        <div className="grid-filter-row">
          <span className="grid-filter-label">稀有度</span>
          <div className="grid-filter-btns">
            {RARITIES.map((rarity) => (
              <button
                type="button"
                key={rarity}
                className={`mode-btn ${!hiddenR.has(rarity) ? "active" : ""}`}
                aria-pressed={!hiddenR.has(rarity)}
                onClick={() => toggleRarity(rarity)}
              >
                {rarity}
              </button>
            ))}
          </div>
        </div>
        {volumeRows.map((row) => (
```

(The existing `volumeRows.map(...)` body is unchanged.)

- [ ] **Step 7: Run the new tests to verify they pass**

Run: `npx vitest run --config vitest.client.config.ts test/client/views.test.tsx -t "Grid rarity filter"`
Expected: PASS — 4 passed.

- [ ] **Step 8: Run the full suite to confirm no regression (series filter must stay green)**

Run: `npm test`
Expected: PASS — all worker + client tests pass, including the existing "Grid volume filter" block.

- [ ] **Step 9: Lint and commit**

```bash
lineguard src/client/views/Grid.tsx test/client/views.test.tsx
git add src/client/views/Grid.tsx test/client/views.test.tsx
git commit -m "$(cat <<'EOF'
feat: add rarity filter buttons and persisted state to grid

Generalize the grid's localStorage helpers to loadHiddenSet/saveHiddenSet
keyed by storage key, and add a 稀有度 button row (R/SR/SSR/UR) backed by a
hiddenR set persisted under mpc:grid:hiddenRarities. Column rendering is
unchanged in this step; the buttons toggle and persist only.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Filter the rarity columns by the toggles

Wires `hiddenR` into the render: derive `shownRarities`, then drive the progress denominator, the series-header `colSpan`, the rarity header/body cells, the group left-border, and the empty state from it.

**Files:**
- Modify: `src/client/views/Grid.tsx` (derive `shownRarities`; progress loop; `thead`/`tbody`; empty-state guard)
- Test: `test/client/views.test.tsx` (extend the `describe("Grid rarity filter")` block with render-effect tests)

**Interfaces:**
- Consumes: `hiddenR` state and the `RARITIES`/`RARITY_KEYS`/`getN`/`exists` imports from Task 1 / `../collection`.
- Produces: component-local `const shownRarities: { rarity: Rarity; ri: number }[]` — the visible rarities in catalog order, each keeping its **original** index `ri`.

- [ ] **Step 1: Write the failing tests**

Add these `it(...)` cases inside the existing `describe("Grid rarity filter", …)` block in `test/client/views.test.tsx`:

```tsx
  it("hides a rarity's column in every series when toggled off", () => {
    const { container } = render(<Grid m={m} />);
    const filter = container.querySelector(".grid-filter") as HTMLElement;
    expect(container.querySelectorAll(".grid-rarity-head")).toHaveLength(
      SERIES.length * 4,
    );
    expect(container.querySelectorAll(".grid-rarity-head.gr-ur")).toHaveLength(
      SERIES.length,
    );
    fireEvent.click(within(filter).getByRole("button", { name: "UR" }));
    expect(container.querySelectorAll(".grid-rarity-head")).toHaveLength(
      SERIES.length * 3,
    );
    expect(container.querySelectorAll(".grid-rarity-head.gr-ur")).toHaveLength(
      0,
    );
  });

  it("shrinks each series header's colSpan to the visible rarity count", () => {
    const { container } = render(<Grid m={m} />);
    const filter = container.querySelector(".grid-filter") as HTMLElement;
    const firstHead = () =>
      container.querySelector(".grid-series-head") as HTMLTableCellElement;
    expect(firstHead().colSpan).toBe(4);
    fireEvent.click(within(filter).getByRole("button", { name: "UR" }));
    expect(firstHead().colSpan).toBe(3);
  });

  it("moves the group left border to the first visible rarity when R is hidden", () => {
    const { container } = render(<Grid m={m} />);
    const filter = container.querySelector(".grid-filter") as HTMLElement;
    fireEvent.click(within(filter).getByRole("button", { name: "R" }));
    const starts = container.querySelectorAll(
      ".grid-rarity-head.grid-series-start",
    );
    expect(starts).toHaveLength(SERIES.length);
    starts.forEach((th) =>
      expect(th.classList.contains("gr-sr")).toBe(true),
    );
  });

  it("shrinks the progress denominator when a rarity is hidden", () => {
    const { container } = render(<Grid m={m} />);
    const filter = container.querySelector(".grid-filter") as HTMLElement;
    const denom = () => {
      const txt =
        (container.querySelector(".grid-progress") as HTMLElement).textContent ??
        "";
      const match = txt.match(/\/\s*(\d+)/);
      return match ? Number(match[1]) : Number.NaN;
    };
    const before = denom();
    fireEvent.click(within(filter).getByRole("button", { name: "UR" }));
    expect(denom()).toBeLessThan(before);
  });

  it("shows a rarity-specific empty hint when all rarities are hidden", () => {
    const { container } = render(<Grid m={m} />);
    const filter = container.querySelector(".grid-filter") as HTMLElement;
    for (const name of ["R", "SR", "SSR", "UR"])
      fireEvent.click(within(filter).getByRole("button", { name }));
    expect(screen.getByText("（未選擇任何稀有度）")).toBeInTheDocument();
    expect(container.querySelector(".grid-table")).toBeNull();
  });

  it("applies series and rarity filters independently", () => {
    const { container } = render(<Grid m={m} />);
    const filter = container.querySelector(".grid-filter") as HTMLElement;
    fireEvent.click(within(filter).getByRole("button", { name: "NEW YEAR" }));
    fireEvent.click(within(filter).getByRole("button", { name: "UR" }));
    expect(container.querySelectorAll(".grid-series-head")).toHaveLength(
      SERIES.length - 1,
    );
    expect(container.querySelectorAll(".grid-rarity-head")).toHaveLength(
      (SERIES.length - 1) * 3,
    );
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run --config vitest.client.config.ts test/client/views.test.tsx -t "Grid rarity filter"`
Expected: FAIL — the 4 Task-1 cases still pass, but the new cases fail because toggling a rarity does not yet change the table (e.g. `expected 24 to be 18` for `.grid-rarity-head` count after hiding UR; `（未選擇任何稀有度）` not found).

- [ ] **Step 3: Derive `shownRarities`**

In `Grid.tsx`, just after the existing `shown` derivation (currently lines 54-56), add:

```tsx
  const shownRarities = RARITIES.map((rarity, ri) => ({ rarity, ri })).filter(
    ({ rarity }) => !hiddenR.has(rarity),
  );
```

- [ ] **Step 4: Count only visible rarity slots in the progress loop**

Replace the inner `RARITIES.forEach(...)` of the progress loop (currently lines 60-68) so the body iterates `shownRarities`:

```tsx
  for (const { si } of shown) {
    m.characters.forEach((_c, ci) => {
      if (!exists(m, si, ci)) return;
      for (const { ri } of shownRarities) {
        totalSlots++;
        if (getN(m, si, ci, ri) > 0) totalHave++;
      }
    });
  }
```

- [ ] **Step 5: Make the empty-state guard cover the all-rarities-off case**

Replace the empty-state guard (currently `shown.length === 0 ? (...) : (...)`, lines 119-121) with:

```tsx
      {shown.length === 0 || shownRarities.length === 0 ? (
        <div className="grid-empty">
          {shown.length === 0 ? "（未選擇任何系列）" : "（未選擇任何稀有度）"}
        </div>
      ) : (
```

- [ ] **Step 6: Drive the series-header `colSpan` and rarity header row from `shownRarities`**

In `<thead>`: change the series header `colSpan` (line 132) from `colSpan={4}` to `colSpan={shownRarities.length}`, and replace the second header row's `RARITIES.map(...)` (lines 140-151) so it iterates `shownRarities` and keys the left border on the *first visible* rarity:

```tsx
              <tr>
                {shown.map(({ s }) =>
                  shownRarities.map(({ rarity, ri }, localRi) => (
                    <th
                      key={`${s}-${rarity}`}
                      className={`grid-rarity-head gr-${RARITY_KEYS[ri]} ${
                        localRi === 0 ? "grid-series-start" : ""
                      }`}
                    >
                      {rarity}
                    </th>
                  )),
                )}
              </tr>
```

- [ ] **Step 7: Drive the body cells from `shownRarities`**

In `<tbody>`, replace the inner `RARITIES.map((rarity, ri) => {...})` (lines 159-191) so it iterates `shownRarities`, keys the border on `localRi === 0`, and still uses the original `ri` for `getN`:

```tsx
                  {shown.map(({ s, si }) =>
                    shownRarities.map(({ rarity, ri }, localRi) => {
                      const startCls = localRi === 0 ? "grid-series-start" : "";
                      const cellKey = `${s}-${rarity}`;
                      if (!exists(m, si, ci)) {
                        return (
                          <td
                            key={cellKey}
                            className={`grid-cell gc-na ${startCls}`}
                          />
                        );
                      }
                      const n = getN(m, si, ci, ri);
                      if (n > 0) {
                        return (
                          <td
                            key={cellKey}
                            className={`grid-cell gc-have ${startCls}`}
                          >
                            {isCount ? (
                              <span className="gc-count">{n}</span>
                            ) : (
                              "✓"
                            )}
                          </td>
                        );
                      }
                      return (
                        <td
                          key={cellKey}
                          className={`grid-cell gc-miss ${startCls}`}
                        />
                      );
                    }),
                  )}
```

- [ ] **Step 8: Run the rarity tests to verify they pass**

Run: `npx vitest run --config vitest.client.config.ts test/client/views.test.tsx -t "Grid rarity filter"`
Expected: PASS — 10 passed (4 from Task 1 + 6 new).

- [ ] **Step 9: Run the full suite**

Run: `npm test`
Expected: PASS — all worker + client tests pass; the existing "Grid volume filter" block and "renders all seven views" remain green (default state keeps `colSpan={4}` and all rarities shown).

- [ ] **Step 10: Lint and commit**

```bash
lineguard src/client/views/Grid.tsx test/client/views.test.tsx
git add src/client/views/Grid.tsx test/client/views.test.tsx
git commit -m "$(cat <<'EOF'
feat: filter grid rarity columns by the rarity toggles

Derive shownRarities (preserving each rarity's original index) and drive the
progress denominator, series-header colSpan, rarity header/body cells, group
left border, and empty state from it. Hiding all rarities shows
（未選擇任何稀有度）; series and rarity filters apply independently.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Self-Review

**1. Spec coverage** — every spec section maps to a task:

| Spec section | Task / step |
| --- | --- |
| 4.1 `hiddenR` state, key `mpc:grid:hiddenRarities`, intersect-with-`RARITIES` load, `useEffect` persist, `toggleRarity`, try/catch | Task 1 steps 3-5; tests "remembers…", "ignores unknown…" |
| 4.2 `shownRarities` keeping original `ri` | Task 2 step 3 |
| 4.3 #1 progress counts only visible rarities | Task 2 step 4; test "shrinks the progress denominator" |
| 4.3 #2 series-header `colSpan = shownRarities.length` | Task 2 step 6; test "shrinks each series header's colSpan" |
| 4.3 #3 `grid-series-start` on first visible rarity (`localRi === 0`) | Task 2 steps 6-7; test "moves the group left border…" |
| 4.4 rarity filter row at top of `.grid-filter`, `.mode-btn`, `aria-pressed`, zero new CSS | Task 1 step 6; tests "renders a 稀有度 row…", "toggles…" |
| 4.5 empty state `（未選擇任何稀有度）`, series message wins, `0/0` | Task 2 step 5; test "shows a rarity-specific empty hint…" |
| Goal: independent AND with series filter | Task 2; test "applies series and rarity filters independently" |
| §5 default all-on regression (`colSpan` stays 4) | Task 2 step 9 (`npm test` green) |

No gaps.

**2. Placeholder scan** — every code/test step contains complete code; every run step has an exact command and expected result. No TBD/TODO/"handle edge cases". ✓

**3. Type consistency** — `loadHiddenSet(key, valid)` / `saveHiddenSet(key, hidden)` signatures are identical in Task 1's definition (step 3), its call sites (step 4-5), and Task 2's consumption. `hiddenR`/`setHiddenR`/`toggleRarity` names are consistent across both tasks. `shownRarities` element shape `{ rarity, ri }` is destructured the same way in the progress loop, thead, and tbody. `RARITY_KEYS[ri]` uses the original `ri`, not `localRi`. ✓
