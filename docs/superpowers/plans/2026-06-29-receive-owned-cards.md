# Receive Owned Cards Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the trade-reservation form offer cards the owner already holds on the receive side, via a separate "換入（我已有的卡）" section.

**Architecture:** Client-only change. A new pure function `ownedReceivable(m)` derives the owned-card receive candidates (owned ≥ 1). `PendingTrades.tsx` gains a third `LineEditor` fed by those candidates and merges them into the `receive` lines on submit. The backend already accepts any receive catalog, so no worker/schema/types change.

**Tech Stack:** React 18 + TypeScript, Vitest + Testing Library (client), Biome (lint/format), Vite build.

## Global Constraints

- DB uses English enums; UI shows Traditional Chinese copy (`SPEC.md §6`).
- Derived logic lives as pure functions in `src/client/collection.ts` and is unit-tested; view components take props (repo convention).
- Do NOT change `computeTrade` / `computeTradeWithPending` signatures.
- Do NOT touch `src/worker/*`, `src/shared/types.ts`, or `src/client/api.ts`.
- Option hint copy uses full-width parentheses to match the existing `（餘 N）` style.
- Conventional Commits; every commit ends with the trailer `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
- Before each commit: run `lineguard <changed files>`; the full test suite must pass (`npm test`). A PreToolUse hook also runs format/lint/test on `git commit`.

---

## File Structure

| File | Responsibility | Action |
| --- | --- | --- |
| `src/client/collection.ts` | Derived trade math (pure). Add `ownedReceivable(m)`. | Modify |
| `src/client/admin/PendingTrades.tsx` | Reservation form. Add `hint` plumbing + owned-receive section + submit merge. | Modify |
| `test/client/collection.test.ts` | Unit tests for `ownedReceivable`. | Modify |
| `test/client/admin.test.tsx` | Form tests for the owned-receive section + submit merge. | Modify |

---

## Task 1: `ownedReceivable` pure function

**Files:**
- Modify: `src/client/collection.ts` (add export after `computeTradeWithPending`, ends at line 146)
- Test: `test/client/collection.test.ts` (add a `describe` block; import the new symbol)

**Interfaces:**
- Consumes: `Matrix`, `TradeItem`, `RARITIES`, `exists`, `getN` (already in `collection.ts`).
- Produces: `export function ownedReceivable(m: Matrix): TradeItem[]` — one item per existing cell with `owned ≥ 1`; `spare` carries the current holding count (for display). Excludes `owned === 0` (those are `needs`) and null cells.

- [ ] **Step 1: Write the failing test**

In `test/client/collection.test.ts`, add `ownedReceivable` to the import from `../../src/client/collection` (the existing import block at lines 2–10), then append this block at the end of the file:

```ts
describe("ownedReceivable", () => {
  const m = buildMatrix(overview);
  // overview owned≥1 cells: NEW YEAR/Mizuki R=3, NEW YEAR/Mizuki SR=1,
  // MP 4TH/Mizuki R=2, MP 4TH/KSP R=1  → 4 items. (NEW YEAR/KSP is a null cell.)

  it("returns every existing cell the owner holds at least one of", () => {
    expect(ownedReceivable(m)).toHaveLength(4);
  });

  it("carries the current holding count in spare", () => {
    const items = ownedReceivable(m);
    // NEW YEAR(si0)/Mizuki(ci0)/R(ri0) owned 3
    expect(
      items.find((x) => x.si === 0 && x.ci === 0 && x.ri === 0)?.spare,
    ).toBe(3);
    // MP 4TH(si1)/Mizuki(ci0)/R(ri0) owned 2
    expect(
      items.find((x) => x.si === 1 && x.ci === 0 && x.ri === 0)?.spare,
    ).toBe(2);
  });

  it("excludes owned-0 cells (disjoint from needs) and null cells", () => {
    const items = ownedReceivable(m);
    // every item is actually held
    expect(items.every((x) => getN(m, x.si, x.ci, x.ri) >= 1)).toBe(true);
    // NEW YEAR/KSP (si0,ci1) does not exist → never present
    expect(items.some((x) => x.si === 0 && x.ci === 1)).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test:client -- collection`
Expected: FAIL — `ownedReceivable is not a function` (or an import/type error referencing `ownedReceivable`).

- [ ] **Step 3: Write the minimal implementation**

In `src/client/collection.ts`, append after the closing brace of `computeTradeWithPending` (current last line, 146):

```ts

// Cards the owner currently holds at least one of (owned ≥ 1), as candidates
// for "receive a card I already have". spare carries the current holding count
// for display. Excludes null cells and owned-0 cells (the latter are needs).
// Independent of pending: give-side reservations are already deducted in the
// matrix by getOverview, and receiving an owned card does not interact with the
// needs-clearing in computeTradeWithPending.
export function ownedReceivable(m: Matrix): TradeItem[] {
  const items: TradeItem[] = [];
  m.series.forEach((_s, si) =>
    m.characters.forEach((_c, ci) => {
      if (!exists(m, si, ci)) return;
      RARITIES.forEach((_r, ri) => {
        const n = getN(m, si, ci, ri);
        if (n >= 1) items.push({ ri, si, ci, spare: n });
      });
    }),
  );
  return items;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test:client -- collection`
Expected: PASS — all `ownedReceivable` tests green; existing `buildMatrix` / `computeTrade` / `computeTradeWithPending` tests still green.

- [ ] **Step 5: Commit**

```bash
lineguard src/client/collection.ts test/client/collection.test.ts
git add src/client/collection.ts test/client/collection.test.ts
git commit -m "$(cat <<'EOF'
feat: add ownedReceivable() for cards held at least once

Derives the receive candidates for "trade for a card I already have":
every existing cell with owned >= 1, with spare carrying the current
holding count for display. Excludes null cells and owned-0 cells (those
are needs). Independent of pending reservations.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Owned-receive section in the reservation form

**Files:**
- Modify: `src/client/admin/PendingTrades.tsx`
- Test: `test/client/admin.test.tsx` (add tests to the existing `describe("PendingTrades", ...)` block)

**Interfaces:**
- Consumes: `ownedReceivable` (Task 1); existing `Opt`, `toOpt`, `LineEditor`, `ReservationForm`, `LineDraft`, `toInputs`.
- Produces: no exported API change. Adds a `RECEIVE_QTY_CAP` module constant, a `hint` field on `Opt`, an optional `hint` param on `toOpt`, a `recvOwnedOpts: Opt[]` prop on `ReservationForm`, and a `receivesOwned` draft list merged into the posted `receive` array.

- [ ] **Step 1: Write the failing tests**

In `test/client/admin.test.tsx`, append these two tests inside the existing `describe("PendingTrades", () => { ... })` block (after the last test, before the block's closing `});` at line 405):

```tsx
  it("offers an already-owned card on the receive side (持有 hint, give keeps 餘)", async () => {
    vi.stubGlobal("fetch", stubFetchFor([]));

    render(<PendingTrades />);
    await waitFor(() =>
      expect(screen.getByText("交換預約")).toBeInTheDocument(),
    );

    // Give side still shows 餘 (backward-compatible hint).
    fireEvent.click(screen.getByRole("button", { name: "＋ 新增給出" }));
    expect(screen.getByText("MP 4TH Mizuki R（餘 1）")).toBeInTheDocument();

    // The new owned-receive section shows the same card as 持有 2.
    fireEvent.click(
      screen.getByRole("button", { name: "＋ 新增換入（我已有的卡）" }),
    );
    expect(screen.getByText("MP 4TH Mizuki R（持有 2）")).toBeInTheDocument();
  });

  it("merges an owned-receive line into the posted receive array", async () => {
    const fetchMock = stubFetchFor([]);
    vi.stubGlobal("fetch", fetchMock);

    render(<PendingTrades />);
    await waitFor(() =>
      expect(screen.getByText("交換預約")).toBeInTheDocument(),
    );

    // ≥1 give line is required; add the only surplus (MP 4TH Mizuki R).
    fireEvent.click(screen.getByRole("button", { name: "＋ 新增給出" }));
    // Add an owned card on the receive side (defaults to MP 4TH Mizuki R).
    fireEvent.click(
      screen.getByRole("button", { name: "＋ 新增換入（我已有的卡）" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "新增預約" }));

    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(
          ([u, init]) =>
            u === "/api/admin/pending-trades" && init?.method === "POST",
        ),
      ).toBe(true),
    );
    const call = fetchMock.mock.calls.find(
      ([u, init]) =>
        u === "/api/admin/pending-trades" && init?.method === "POST",
    );
    const body = JSON.parse(call![1]!.body as string);
    expect(body.receive).toContainEqual(
      expect.objectContaining({
        series: "MP 4TH",
        character: "Mizuki",
        rarity: "R",
        qty: 1,
      }),
    );
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test:client -- admin`
Expected: FAIL — no button named `＋ 新增換入（我已有的卡）` (and the `持有 2` / merge assertions fail).

- [ ] **Step 3: Add `hint` to `Opt` / `toOpt` and render it in `LineEditor`**

In `src/client/admin/PendingTrades.tsx`:

3a. Add the qty cap constant just below the `today` helper (after line 22 `const today = ...`):

```tsx
// Already-owned cards have no natural receive cap; clamp the number input here.
const RECEIVE_QTY_CAP = 99;
```

3b. Add a `hint` field to the `Opt` interface (replace the whole interface at lines 24–31):

```tsx
interface Opt {
  value: string; // "si|ci|ri"
  label: string;
  series: string;
  character: string;
  rarity: Rarity;
  max: number;
  hint: string; // parenthetical shown in the dropdown, e.g. "餘 3" or "持有 2"
}
```

3c. Give `toOpt` an optional `hint` param defaulting to the current `餘 ${max}` text (replace the whole function at lines 33–45):

```tsx
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
```

3d. Render `o.hint` instead of the hard-coded `餘 {o.max}` in `LineEditor` (replace the `<option>` block at lines 93–97):

```tsx
              {opts.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}（{o.hint}）
                </option>
              ))}
```

- [ ] **Step 4: Import `ownedReceivable` and build `recvOwnedOpts`**

4a. Add `ownedReceivable` to the import from `../collection` (the block at lines 14–20). Result:

```tsx
import {
  type Matrix,
  RARITIES,
  type TradeItem,
  buildMatrix,
  computeTradeWithPending,
  ownedReceivable,
} from "../collection";
```

4b. Extend the `useMemo` in `PendingTrades` to also compute `recvOwnedOpts` (replace the block at lines 341–348):

```tsx
  const { giveOpts, recvOpts, recvOwnedOpts } = useMemo(() => {
    if (!m || !pending)
      return {
        giveOpts: [] as Opt[],
        recvOpts: [] as Opt[],
        recvOwnedOpts: [] as Opt[],
      };
    const { surplus, needs } = computeTradeWithPending(m, pending);
    return {
      giveOpts: surplus.map((t) => toOpt(m, t, t.spare)),
      recvOpts: needs.map((t) => toOpt(m, t, 1)),
      recvOwnedOpts: ownedReceivable(m).map((t) =>
        toOpt(m, t, RECEIVE_QTY_CAP, `持有 ${t.spare}`),
      ),
    };
  }, [m, pending]);
```

4c. Pass the new prop where `<ReservationForm>` is rendered (replace the element at lines 358–362):

```tsx
          <ReservationForm
            giveOpts={giveOpts}
            recvOpts={recvOpts}
            recvOwnedOpts={recvOwnedOpts}
            onDone={reload}
          />
```

- [ ] **Step 5: Add the owned-receive section to `ReservationForm`**

5a. Add `recvOwnedOpts` to the `ReservationForm` prop list (replace the destructure + type at lines 124–132):

```tsx
function ReservationForm({
  giveOpts,
  recvOpts,
  recvOwnedOpts,
  onDone,
}: {
  giveOpts: Opt[];
  recvOpts: Opt[];
  recvOwnedOpts: Opt[];
  onDone: () => void;
}) {
```

5b. Add a `receivesOwned` draft list beside the existing `receives` state (replace line 137 `const [receives, setReceives] = useState<LineDraft[]>([]);`):

```tsx
  const [receives, setReceives] = useState<LineDraft[]>([]);
  const [receivesOwned, setReceivesOwned] = useState<LineDraft[]>([]);
```

5c. Merge both receive lists into the posted `receive`, and clear the new list on success (replace the `postReservation` call + the reset lines at 165–176):

```tsx
      await postReservation({
        counterparty: counterparty || undefined,
        reservedAt,
        note: note || undefined,
        give,
        receive: [
          ...toInputs(receives, recvOpts),
          ...toInputs(receivesOwned, recvOwnedOpts),
        ],
      });
      setGives([]);
      setReceives([]);
      setReceivesOwned([]);
      setCounterparty("");
      setNote("");
      onDone();
```

5d. Rename the existing receive editor and add the owned one (replace the second `<LineEditor>` block at lines 213–218):

```tsx
      <LineEditor
        title="換入（缺卡）"
        opts={recvOpts}
        drafts={receives}
        setDrafts={setReceives}
      />
      <LineEditor
        title="換入（我已有的卡）"
        opts={recvOwnedOpts}
        drafts={receivesOwned}
        setDrafts={setReceivesOwned}
      />
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npm run test:client -- admin`
Expected: PASS — both new tests green; all existing `PendingTrades` / `AddCards` / `ManageCards` tests still green.

- [ ] **Step 7: Run the full suite, typecheck, lint, and build**

Run: `npm test && npm run typecheck && npm run lint && npm run build`
Expected: all green — worker suite (47) + client suite (56 after +2) pass; `tsc` clean; Biome clean; Vite build succeeds.

- [ ] **Step 8: Commit**

```bash
lineguard src/client/admin/PendingTrades.tsx test/client/admin.test.tsx
git add src/client/admin/PendingTrades.tsx test/client/admin.test.tsx
git commit -m "$(cat <<'EOF'
feat: let trade reservations receive already-owned cards

Add a separate 換入（我已有的卡） section to the reservation form, fed by
ownedReceivable() and merged into the posted receive lines. Options carry a
hint string so owned cards show 持有 N while give/needs keep 餘 N
(backward-compatible). Already-owned receives allow qty >= 1 (cap 99). The
backend already accepts any receive catalog, so this is client-only.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Self-Review

**1. Spec coverage**
- §4.1 `ownedReceivable` pure fn → Task 1. ✓
- §4.2.1 `hint` on `Opt`/`toOpt` + `LineEditor` render → Task 2 Step 3. ✓
- §4.2.2 `recvOwnedOpts` + `RECEIVE_QTY_CAP` → Task 2 Steps 3a, 4b. ✓
- §4.2.3 `receivesOwned` state + third `LineEditor` + title rename → Task 2 Steps 5b, 5d. ✓
- §4.2.4 submit merge → Task 2 Step 5c. ✓
- §4.3 no backend/public-page change → no task touches `src/worker/*`, `types.ts`, `api.ts`, `Trade.tsx`. ✓
- §6 tests: `ownedReceivable` unit tests (Task 1), form render + submit-merge tests (Task 2). ✓

**2. Placeholder scan:** No TBD/TODO; every code/test/command step shows the actual content. ✓

**3. Type consistency:** `ownedReceivable(m: Matrix): TradeItem[]` defined in Task 1 and imported/used in Task 2 Step 4. `Opt.hint: string` defined (3b) and rendered (3d) and produced (3c, 4b). `recvOwnedOpts: Opt[]` produced (4b), threaded through props (4c, 5a), consumed (5d) and in submit (5c). `RECEIVE_QTY_CAP` defined (3a) and used (4b). `receivesOwned` / `setReceivesOwned` defined (5b), used (5c, 5d). Names consistent throughout. ✓
