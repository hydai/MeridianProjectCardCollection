# Grid Volume (彈) Series Filter — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a per-volume row of series toggle buttons above the public collection grid so the viewer can control which series columns are shown.

**Architecture:** Front-end only. A `VOLUMES` constant in `seed/catalog-def.ts` maps each 彈 to its series; a pure `buildVolumeRows()` in `collection.ts` aligns that static map to the live `m.series` (dropping absent series, collecting unassigned ones into an "其他" row). `Grid.tsx` holds a `hidden: Set<string>` of toggled-off series, persisted to `localStorage`, and renders progress + columns over the shown subset.

**Tech Stack:** React 18 + TypeScript, Vitest (jsdom) + @testing-library/react, Biome, CSS in `src/client/index.css`.

## Global Constraints

- **No DB / API / worker / migration changes.** `volume` is a front-end display concept only.
- **Scope is the grid view only** (`src/client/views/Grid.tsx`, used in `PublicViewer.tsx`). Do not touch other views.
- **Series names are the stored uppercase strings** (`NEW YEAR`, `BUNNY GIRL`, `KILLER`, `MP 4TH`) — buttons display them verbatim, matching the grid headers.
- **Default = all series shown.** Persist the **hidden** set (not shown) under localStorage key `mpc:grid:hiddenSeries`, so future new series default visible.
- **Progress (`have / slots · pct%`) counts only shown series.** All-hidden → `0 / 0 · 0%` and an empty hint.
- All `localStorage` access wrapped in try/catch (private mode / sandboxed iframe degrade to no-persist).
- Tests: `npm run test:client` (client only) and `npm test` (full) must pass. Lint via `npm run lint`, types via `npm run typecheck`. A PreToolUse hook auto-runs format/lint/test on `git commit`.

## File Structure

| File | Responsibility | Change |
| --- | --- | --- |
| `seed/catalog-def.ts` | Card universe + now the 彈→系列 map | Add `VOLUMES` constant |
| `src/client/collection.ts` | Pure client data derivation | Add `VolumeRow` + `buildVolumeRows()` |
| `src/client/views/Grid.tsx` | Grid view: filter UI, state, persistence, render | Full rewrite (shown below) |
| `src/client/index.css` | Styles | Add `.grid-filter*` + `.grid-empty` |
| `test/client/volumes.test.ts` | Unit + consistency tests | New file |
| `test/client/views.test.tsx` | Grid component tests | Add a describe block |
| `.claude/skills/manage-card-catalog/SKILL.md` | Add-a-series procedure | Note the VOLUMES step |

---

### Task 1: Volume data layer (`VOLUMES` + `buildVolumeRows`)

**Files:**
- Modify: `seed/catalog-def.ts:36` (after the `SERIES` export)
- Modify: `src/client/collection.ts:1-46` (add import + function after `buildMatrix`)
- Test: `test/client/volumes.test.ts` (create)

**Interfaces:**
- Produces: `VOLUMES: { label: string; series: string[] }[]` (from `seed/catalog-def.ts`)
- Produces: `interface VolumeRow { label: string; series: string[] }` and `buildVolumeRows(allSeries: string[]): VolumeRow[]` (from `src/client/collection.ts`)

- [ ] **Step 1: Write the failing tests**

Create `test/client/volumes.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { SERIES, VOLUMES } from "../../seed/catalog-def";
import { buildVolumeRows } from "../../src/client/collection";

describe("VOLUMES ↔ catalog consistency", () => {
  it("assigns every catalog series to exactly one volume", () => {
    const counts = new Map<string, number>();
    for (const vol of VOLUMES)
      for (const s of vol.series) counts.set(s, (counts.get(s) ?? 0) + 1);
    for (const s of SERIES) expect(counts.get(s)).toBe(1); // covered once
    for (const s of counts.keys()) expect(SERIES).toContain(s); // no stray names
  });
});

describe("buildVolumeRows", () => {
  it("groups catalog series into their volumes with no 其他 row", () => {
    expect(buildVolumeRows(["NEW YEAR", "BUNNY GIRL", "KILLER", "MP 4TH"])).toEqual([
      { label: "Vol.1", series: ["NEW YEAR", "BUNNY GIRL", "KILLER"] },
      { label: "Vol.2", series: ["MP 4TH"] },
    ]);
  });

  it("collects unassigned series into a trailing 其他 row", () => {
    expect(buildVolumeRows(["NEW YEAR", "FOO"])).toEqual([
      { label: "Vol.1", series: ["NEW YEAR"] },
      { label: "其他", series: ["FOO"] },
    ]);
  });

  it("drops a volume whose series are absent from the live data", () => {
    expect(buildVolumeRows(["NEW YEAR", "BUNNY GIRL", "KILLER"])).toEqual([
      { label: "Vol.1", series: ["NEW YEAR", "BUNNY GIRL", "KILLER"] },
    ]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run --config vitest.client.config.ts test/client/volumes.test.ts`
Expected: FAIL — `VOLUMES` is `undefined` / `buildVolumeRows` is not exported.

- [ ] **Step 3: Add the `VOLUMES` constant**

In `seed/catalog-def.ts`, immediately after `export const SERIES = Object.keys(SERIES_CHARACTERS);` (line 36), insert:

```ts

// 彈（Vol）→ 系列。純前端顯示用，驅動格表上方的篩選列；不進 D1。
// 有序：陣列順序＝filter 列由上到下的顯示順序。
// 新增系列時務必把它加進某一彈（見 manage-card-catalog 技能與一致性測試）。
export const VOLUMES: { label: string; series: string[] }[] = [
  { label: "Vol.1", series: ["NEW YEAR", "BUNNY GIRL", "KILLER"] },
  { label: "Vol.2", series: ["MP 4TH"] },
  // 第三彈 → 在此 append 一個 { label: "Vol.3", series: [...] }
];
```

- [ ] **Step 4: Add `VolumeRow` + `buildVolumeRows` to `collection.ts`**

In `src/client/collection.ts`, add the import at the top (below the existing `import type {...}` block, around line 5):

```ts
import { VOLUMES } from "../../seed/catalog-def";
```

Then add, immediately after `buildMatrix` (after line 46):

```ts

export interface VolumeRow {
  label: string;
  series: string[];
}

// Align the static VOLUMES map with the live series list: keep only series that
// actually exist, drop emptied volumes, and sweep any series not assigned to a
// volume into a trailing "其他" row so nothing silently vanishes from the grid.
export function buildVolumeRows(allSeries: string[]): VolumeRow[] {
  const assigned = new Set<string>();
  const rows: VolumeRow[] = [];
  for (const vol of VOLUMES) {
    const series = vol.series.filter((s) => allSeries.includes(s));
    for (const s of series) assigned.add(s);
    if (series.length > 0) rows.push({ label: vol.label, series });
  }
  const orphans = allSeries.filter((s) => !assigned.has(s));
  if (orphans.length > 0) rows.push({ label: "其他", series: orphans });
  return rows;
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run --config vitest.client.config.ts test/client/volumes.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck`
Expected: no errors (confirms the `seed/` → `src/client/` import resolves).

- [ ] **Step 7: Commit**

```bash
git add seed/catalog-def.ts src/client/collection.ts test/client/volumes.test.ts
git commit -m "feat: VOLUMES map and buildVolumeRows for grid series filter"
```

---

### Task 2: Grid filter UI, state, persistence, and column filtering

**Files:**
- Modify: `src/client/views/Grid.tsx` (full rewrite — content below)
- Modify: `src/client/index.css:829` (insert filter styles before `.grid-wrap`)
- Test: `test/client/views.test.tsx:1-2,163` (imports + new describe block)

**Interfaces:**
- Consumes: `buildVolumeRows` from `src/client/collection.ts` (Task 1); `Matrix`, `RARITIES`, `RARITY_KEYS`, `exists`, `getN` (existing).
- Produces: DOM contract the tests rely on — container `.grid-filter`, one `.grid-filter-row` per volume, a `<button class="mode-btn [active]">` per series (accessible name = series string), series header cells `th.grid-series-head` (one per shown series), and `.grid-empty` with text `（未選擇任何系列）` when all hidden.

- [ ] **Step 1: Write the failing component tests**

In `test/client/views.test.tsx`, change line 1 from
`import { render, screen } from "@testing-library/react";` to:

```ts
import { fireEvent, render, screen, within } from "@testing-library/react";
```

…and line 2 from `import { describe, expect, it } from "vitest";` to:

```ts
import { beforeEach, describe, expect, it } from "vitest";
```

Then append at the end of the file (after line 163):

```tsx
describe("Grid volume filter", () => {
  beforeEach(() => localStorage.clear());

  it("renders a filter row per volume with a button per series", () => {
    const { container } = render(<Grid m={m} />);
    const filter = container.querySelector(".grid-filter") as HTMLElement;
    expect(filter).toBeTruthy();
    expect(within(filter).getByText("Vol.1")).toBeInTheDocument();
    expect(within(filter).getByText("Vol.2")).toBeInTheDocument();
    expect(
      within(filter).getByRole("button", { name: "NEW YEAR" }),
    ).toBeInTheDocument();
    expect(
      within(filter).getByRole("button", { name: "MP 4TH" }),
    ).toBeInTheDocument();
    expect(container.querySelectorAll(".grid-series-head")).toHaveLength(
      SERIES.length,
    );
  });

  it("hides a series' columns when its button is toggled off", () => {
    const { container } = render(<Grid m={m} />);
    const filter = container.querySelector(".grid-filter") as HTMLElement;
    fireEvent.click(within(filter).getByRole("button", { name: "NEW YEAR" }));
    expect(container.querySelectorAll(".grid-series-head")).toHaveLength(
      SERIES.length - 1,
    );
  });

  it("remembers hidden series across remounts via localStorage", () => {
    const first = render(<Grid m={m} />);
    const filter = first.container.querySelector(".grid-filter") as HTMLElement;
    fireEvent.click(within(filter).getByRole("button", { name: "NEW YEAR" }));
    first.unmount();
    const second = render(<Grid m={m} />);
    expect(second.container.querySelectorAll(".grid-series-head")).toHaveLength(
      SERIES.length - 1,
    );
  });

  it("shows an empty hint when all series are hidden", () => {
    const { container } = render(<Grid m={m} />);
    const filter = container.querySelector(".grid-filter") as HTMLElement;
    for (const name of SERIES)
      fireEvent.click(within(filter).getByRole("button", { name }));
    expect(screen.getByText("（未選擇任何系列）")).toBeInTheDocument();
    expect(container.querySelector(".grid-table")).toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run --config vitest.client.config.ts test/client/views.test.tsx`
Expected: FAIL — no `.grid-filter` element; `getByRole("button", { name: "NEW YEAR" })` not found.

- [ ] **Step 3: Rewrite `Grid.tsx`**

Replace the entire contents of `src/client/views/Grid.tsx` with:

```tsx
import { useEffect, useState } from "react";
import {
  type Matrix,
  RARITIES,
  RARITY_KEYS,
  buildVolumeRows,
  exists,
  getN,
} from "../collection";

const STORAGE_KEY = "mpc:grid:hiddenSeries";

function loadHidden(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr)
      ? new Set(arr.filter((x): x is string => typeof x === "string"))
      : new Set();
  } catch {
    return new Set();
  }
}

function saveHidden(hidden: Set<string>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...hidden]));
  } catch {
    // localStorage unavailable (private mode / sandboxed iframe) — skip persisting.
  }
}

export function Grid({ m }: { m: Matrix }) {
  const [mode, setMode] = useState<"check" | "count">("check");
  const [hidden, setHidden] = useState<Set<string>>(loadHidden);
  const isCount = mode === "count";

  useEffect(() => {
    saveHidden(hidden);
  }, [hidden]);

  const toggle = (s: string) =>
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s);
      else next.add(s);
      return next;
    });

  const volumeRows = buildVolumeRows(m.series);
  const shown = m.series
    .map((s, si) => ({ s, si }))
    .filter(({ s }) => !hidden.has(s));

  let totalHave = 0;
  let totalSlots = 0;
  shown.forEach(({ si }) =>
    m.characters.forEach((_c, ci) => {
      if (!exists(m, si, ci)) return;
      RARITIES.forEach((_r, ri) => {
        totalSlots++;
        if (getN(m, si, ci, ri) > 0) totalHave++;
      });
    }),
  );
  const pct = totalSlots ? Math.round((totalHave / totalSlots) * 100) : 0;

  return (
    <section className="view view-grid">
      <div className="grid-header">
        <div className="grid-head-left">
          <span className="grid-title">收集格表</span>
          <div className="mode-toggle">
            <button
              type="button"
              className={`mode-btn ${!isCount ? "active" : ""}`}
              onClick={() => setMode("check")}
            >
              打勾
            </button>
            <button
              type="button"
              className={`mode-btn ${isCount ? "active" : ""}`}
              onClick={() => setMode("count")}
            >
              數量
            </button>
          </div>
        </div>
        <span className="grid-progress">
          <strong>{totalHave}</strong> / {totalSlots} · {pct}%
        </span>
      </div>

      <div className="grid-filter">
        {volumeRows.map((row) => (
          <div key={row.label} className="grid-filter-row">
            <span className="grid-filter-label">{row.label}</span>
            <div className="grid-filter-btns">
              {row.series.map((s) => (
                <button
                  type="button"
                  key={s}
                  className={`mode-btn ${!hidden.has(s) ? "active" : ""}`}
                  onClick={() => toggle(s)}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      {shown.length === 0 ? (
        <div className="grid-empty">（未選擇任何系列）</div>
      ) : (
        <div className="grid-wrap">
          <table className="grid-table">
            <thead>
              <tr>
                <th className="grid-corner" rowSpan={2}>
                  角色
                </th>
                {shown.map(({ s }) => (
                  <th
                    key={s}
                    colSpan={4}
                    className="grid-series-head grid-series-start"
                  >
                    {s}
                  </th>
                ))}
              </tr>
              <tr>
                {shown.map(({ s }) =>
                  RARITIES.map((rarity, ri) => (
                    <th
                      key={`${s}-${rarity}`}
                      className={`grid-rarity-head gr-${RARITY_KEYS[ri]} ${
                        ri === 0 ? "grid-series-start" : ""
                      }`}
                    >
                      {rarity}
                    </th>
                  )),
                )}
              </tr>
            </thead>
            <tbody>
              {m.characters.map((charName, ci) => (
                <tr key={charName}>
                  <td className="grid-name">{charName}</td>
                  {shown.map(({ s, si }) =>
                    RARITIES.map((rarity, ri) => {
                      const startCls = ri === 0 ? "grid-series-start" : "";
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
                            {isCount ? <span className="gc-count">{n}</span> : "✓"}
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
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="grid-legend">
        <span>
          <span className="swatch sw-have">{isCount ? "2" : "✓"}</span>{" "}
          {isCount ? "數字＝持有張數（≥2 為重複）" : "已收集"}
        </span>
        <span>
          <span className="swatch sw-miss" /> 未收集
        </span>
        <span>
          <span className="swatch sw-na" /> 未收錄（此系列無此角色）
        </span>
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Add the filter styles**

In `src/client/index.css`, insert the following immediately before the `.grid-wrap {` rule (currently line 831):

```css
.grid-filter {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 16px;
  padding: 0 4px;
}

.grid-filter-row {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.grid-filter-label {
  font-family: "JetBrains Mono", "IBM Plex Sans TC", monospace;
  font-size: 11px;
  letter-spacing: 0.08em;
  color: var(--text-tertiary);
  min-width: 42px;
}

.grid-filter-btns {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

/* standalone toggles (not inside a .mode-toggle pill) get a faint outline so
   the off state still reads as tappable. */
.grid-filter .mode-btn {
  border: 0.5px solid var(--border);
}

.grid-empty {
  background: var(--surface);
  border: 0.5px solid var(--border);
  border-radius: 4px;
  padding: 36px 16px;
  margin-bottom: 16px;
  text-align: center;
  color: var(--text-tertiary);
  font-size: 13px;
  letter-spacing: 0.08em;
}

```

- [ ] **Step 5: Run the component tests to verify they pass**

Run: `npx vitest run --config vitest.client.config.ts test/client/views.test.tsx`
Expected: PASS — the four new "Grid volume filter" tests plus the existing view tests.

- [ ] **Step 6: Full test suite + lint + typecheck**

Run: `npm test && npm run lint && npm run typecheck`
Expected: all pass (worker + client suites green, Biome clean, no type errors).

- [ ] **Step 7: Commit**

```bash
git add src/client/views/Grid.tsx src/client/index.css test/client/views.test.tsx
git commit -m "feat: per-volume series filter on the collection grid"
```

---

### Task 3: Document the VOLUMES step in the catalog skill

**Files:**
- Modify: `.claude/skills/manage-card-catalog/SKILL.md` (Procedure step 1 + Common mistakes)

No automated test — the consistency test from Task 1 already enforces the behavior; this task makes the human procedure match it.

- [ ] **Step 1: Add the VOLUMES bullet to the procedure**

In `.claude/skills/manage-card-catalog/SKILL.md`, under "## Procedure" step 1, after the existing
`- New character: **append** it to that series's character list.` line, add:

```markdown
   - New series: ALSO assign it to a 彈 in `VOLUMES` — append the series name to an
     existing volume's `series`, or add a new `{ label: "Vol.N", series: [...] }`.
     The grid's volume filter is built from this. A consistency test fails if a
     catalog series isn't assigned to exactly one volume.
```

- [ ] **Step 2: Add a Common-mistakes entry**

Under "## Common mistakes", add a new bullet:

```markdown
- **Forgetting to add a new series to `VOLUMES`.** It falls into the grid's "其他"
  filter row and `npm test` goes red (the consistency test). Assign it to a 彈.
```

- [ ] **Step 3: Lint the doc**

Run: `lineguard .claude/skills/manage-card-catalog/SKILL.md` (skip if `lineguard` is not installed).
Expected: passes.

- [ ] **Step 4: Commit**

```bash
git add .claude/skills/manage-card-catalog/SKILL.md
git commit -m "docs: note VOLUMES assignment when adding a series"
```

---

## Self-Review

**Spec coverage:**
- Filter row per volume, per-series multi-select toggle, default all on → Task 2 (Grid filter UI, `hidden` set).
- Progress counts only shown series → Task 2 (`shown.forEach` progress loop).
- localStorage persistence of the **hidden** set under `mpc:grid:hiddenSeries` → Task 2 (`loadHidden`/`saveHidden`/effect).
- `VOLUMES` constant in `catalog-def.ts`, no DB/migration → Task 1.
- `buildVolumeRows` double-direction alignment + "其他" fallback → Task 1 (function + 3 unit tests).
- Consistency test (every catalog series in exactly one volume) → Task 1.
- All-hidden empty hint `（未選擇任何系列）`, progress `0/0` → Task 2 (empty branch; `totalSlots` 0 → pct 0).
- localStorage unavailable degrades gracefully → Task 2 (try/catch in both helpers).
- Process doc update → Task 3.

**Placeholder scan:** none — every step has concrete code/commands.

**Type consistency:** `VolumeRow { label, series }` is defined in Task 1 and consumed by `buildVolumeRows` and `Grid.tsx`; `buildVolumeRows(allSeries: string[]): VolumeRow[]` signature matches all call sites; localStorage key string `mpc:grid:hiddenSeries` identical in `loadHidden`/`saveHidden`; DOM class names in the tests (`.grid-filter`, `.grid-series-head`, `.grid-empty`) match `Grid.tsx`.
```
