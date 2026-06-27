# 給出側全面預扣 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 讓「pending 給出行」即時從所有顯示的持有張數扣除（總覽/格表/速覽/統計/交換頁可換出 + 卡片管理），換入側與收藏完成度/缺卡不變。

**Architecture:** 給出扣減**只在一處**——後端 `getOverview` 的 cells——因為公開頁所有收藏視圖與交換頁可換出都從那份 `matrix` 導出。前端 `computeTradeWithPending` 因此瘦身成「只處理換入側」，避免在交換頁雙重扣。卡片管理是逐張列卡，改用 `reservedGive` 欄位 + `預約中` 徽章對應。

**Tech Stack:** Cloudflare Workers + Hono + D1 (SQLite)、React 18 + Vite、Vitest、Biome。

## Global Constraints

- 設計來源：`docs/superpowers/specs/2026-06-27-give-side-pre-deduct-design.md`。
- **只扣給出側**；換入側不動。
- **給出扣減只發生一次**，在 `getOverview`；`computeTradeWithPending` 不得再扣給出（否則交換頁雙重扣）。
- `owned = max(0, 實際持有 − 給出預約 qty)`。
- **`getOverview.progress`（收藏完成度）、`getMissing`、缺卡、Wishlist 維持用實際持有**（不扣）。給出來自重複卡、扣完必 ≥1，本就不受影響。
- pending 是**卡種層級**：卡片管理徽章表達「此卡種有 N 張被暫定承諾給出」，非指定某實體卡。
- DB enum 英文（`give`/`receive`）；UI 中文。
- **提交前跑 `npm run lint`（Biome）+ `npm run typecheck`；必須 clean**（repo 用 Biome，`lineguard` 不等於 Biome）。`npm run format` 若改檔就重跑測試。
- 提交用 Conventional Commits；訊息結尾加 `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`。

**測試指令速查：**
- 單一 worker 測試：`npx vitest run --config vitest.config.ts test/worker/<file>.test.ts`
- 單一 client 測試：`npx vitest run --config vitest.client.config.ts test/client/<file>.test.ts`
- 全部：`npm test`　型別：`npm run typecheck`

---

### Task 1: 把給出扣減移到 `getOverview`，並把 `computeTradeWithPending` 瘦身為換入側

**Files:**
- Modify: `src/worker/db/queries.ts`（`getOverview`）
- Modify: `src/client/collection.ts`（`computeTradeWithPending`）
- Create: `test/worker/pending-overview.test.ts`
- Modify: `test/client/collection.test.ts`（改寫給出相關案例）

**Interfaces:**
- Consumes: 既有 `cards` / `card_catalog` / `trade_reservation_lines` 表；`createReservation`、`addCards`、`getOverview`（worker 測試用）；`computeTrade`、`Matrix`、`TradeItem`、`RARITIES`、`PublicPendingTrade`。
- Produces:
  - `getOverview(db)` 回傳的 `cells[].owned` = `max(0, COUNT(active) − SUM(give qty))`；`progress` 不變。
  - `computeTradeWithPending(m, pending)` 簽名不變，但**只移除換入側 needs**，surplus 原樣回傳。

這兩半是同一個變更的兩面（給出扣減從前端搬到後端），**必須同一個 commit**完成，否則中途交換頁會雙重扣。

- [ ] **Step 1: Write the failing worker test**

`test/worker/pending-overview.test.ts`：
```ts
import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import type { OverviewCell } from "../../src/shared/types";
import { addCards, createReservation, getOverview } from "../../src/worker/db/queries";

const ownedOf = (cells: OverviewCell[], s: string, ch: string, r: string) =>
  cells.find((c) => c.series === s && c.character === ch && c.rarity === r)?.owned ?? 0;

describe("getOverview give-side pre-deduction", () => {
  it("subtracts a pending give from the displayed owned count", async () => {
    await addCards(env.DB, [
      { series: "KILLER", character: "Yuzumi", rarity: "R" },
      { series: "KILLER", character: "Yuzumi", rarity: "R" },
    ]);
    const before = ownedOf((await getOverview(env.DB)).cells, "KILLER", "Yuzumi", "R");
    await createReservation(env.DB, {
      reservedAt: "2026-06-27",
      give: [{ series: "KILLER", character: "Yuzumi", rarity: "R", qty: 1 }],
      receive: [],
    });
    const after = ownedOf((await getOverview(env.DB)).cells, "KILLER", "Yuzumi", "R");
    expect(after).toBe(before - 1);
  });

  it("keeps owned >= 1 and leaves collection progress unchanged (give comes from a duplicate)", async () => {
    await addCards(env.DB, [
      { series: "BUNNY GIRL", character: "Yuzumi", rarity: "SSR" },
      { series: "BUNNY GIRL", character: "Yuzumi", rarity: "SSR" },
    ]);
    const ov1 = await getOverview(env.DB);
    const prog1 = ov1.progress.find((p) => p.series === "BUNNY GIRL")?.collectedTypes;
    const owned1 = ownedOf(ov1.cells, "BUNNY GIRL", "Yuzumi", "SSR");

    await createReservation(env.DB, {
      reservedAt: "2026-06-27",
      give: [{ series: "BUNNY GIRL", character: "Yuzumi", rarity: "SSR", qty: 1 }],
      receive: [],
    });

    const ov2 = await getOverview(env.DB);
    expect(ownedOf(ov2.cells, "BUNNY GIRL", "Yuzumi", "SSR")).toBe(owned1 - 1);
    expect(ownedOf(ov2.cells, "BUNNY GIRL", "Yuzumi", "SSR")).toBeGreaterThanOrEqual(1);
    expect(ov2.progress.find((p) => p.series === "BUNNY GIRL")?.collectedTypes).toBe(prog1);
  });
});
```

- [ ] **Step 2: Run worker test to verify it fails**

Run: `npx vitest run --config vitest.config.ts test/worker/pending-overview.test.ts`
Expected: FAIL（首例 `after` 等於 `before`，未扣減）

- [ ] **Step 3: Modify `getOverview`**

在 `src/worker/db/queries.ts`，將 `getOverview` 的 cells 查詢與映射改為（progress 子查詢**保持不變**）：
```ts
export async function getOverview(db: D1Database): Promise<OverviewResponse> {
  const rawCells = (
    await db
      .prepare(
        `SELECT c.id AS catalogId, c.series, c.character, c.rarity,
                COUNT(k.id) AS owned,
                COALESCE(g.reserved, 0) AS reserved
         FROM card_catalog c
         LEFT JOIN cards k ON k.catalog_id = c.id AND k.status IN ${ACTIVE}
         LEFT JOIN (
           SELECT catalog_id, SUM(qty) AS reserved
           FROM trade_reservation_lines
           WHERE direction = 'give'
           GROUP BY catalog_id
         ) g ON g.catalog_id = c.id
         GROUP BY c.id
         ORDER BY c.sort_order`,
      )
      .all<OverviewCell & { reserved: number }>()
  ).results;
  const cells: OverviewCell[] = rawCells.map(({ reserved, ...c }) => ({
    ...c,
    owned: Math.max(0, c.owned - reserved),
  }));

  const progress = (
    await db
      .prepare(
        `SELECT series,
                COUNT(*) AS totalTypes,
                SUM(CASE WHEN owned > 0 THEN 1 ELSE 0 END) AS collectedTypes
         FROM (
           SELECT c.id, c.series, COUNT(k.id) AS owned
           FROM card_catalog c
           LEFT JOIN cards k ON k.catalog_id = c.id AND k.status IN ${ACTIVE}
           GROUP BY c.id
         )
         GROUP BY series`,
      )
      .all<SeriesProgress>()
  ).results;

  return { cells, progress };
}
```

- [ ] **Step 4: Run worker test to verify it passes**

Run: `npx vitest run --config vitest.config.ts test/worker/pending-overview.test.ts`
Expected: PASS（兩例皆綠）

- [ ] **Step 5: Rewrite the give-related client test**

在 `test/client/collection.test.ts` 的 `describe("computeTradeWithPending", ...)` 中，**找到原本名為 `"a give line decrements spare and drops it when it hits zero"` 的 `it(...)` 並整段替換**為下面這個（其餘案例不動）：
```ts
  it("does NOT change surplus for give lines (handled upstream in getOverview now)", () => {
    const base = computeTrade(m);
    const pending: PublicPendingTrade[] = [
      {
        id: 1,
        reservedAt: "2026-06-27",
        give: [{ direction: "give", catalogId: 5, series: "MP 4TH", character: "Mizuki", rarity: "R", qty: 1 }],
        receive: [],
      },
    ];
    const adj = computeTradeWithPending(m, pending);
    expect(adj.surplus).toEqual(base.surplus); // unchanged — give subtraction moved to getOverview
  });
```

- [ ] **Step 6: Run client test to verify it fails**

Run: `npx vitest run --config vitest.client.config.ts test/client/collection.test.ts`
Expected: FAIL（目前 `computeTradeWithPending` 仍會扣給出 → `adj.surplus` 不等於 `base.surplus`）

- [ ] **Step 7: Slim `computeTradeWithPending` to receive-only**

在 `src/client/collection.ts`，將整個 `computeTradeWithPending` 函式替換為（移除 give 累加與 surplus 扣減；surplus 原樣回傳）：
```ts
// Overlay pending reservations on the derived trade view. Give-side deduction is
// done upstream in getOverview (so it shows everywhere), so here we only clear
// the needs that a pending receive line will fill.
export function computeTradeWithPending(
  m: Matrix,
  pending: PublicPendingTrade[],
): { surplus: TradeItem[]; needs: TradeItem[] } {
  const { surplus, needs } = computeTrade(m);
  const key = (si: number, ci: number, ri: number) => `${si}|${ci}|${ri}`;
  const coord = (series: string, character: string, rarity: Rarity) => {
    const si = m.series.indexOf(series);
    const ci = m.characters.indexOf(character);
    const ri = RARITIES.indexOf(rarity);
    return si < 0 || ci < 0 || ri < 0 ? null : { si, ci, ri };
  };

  const receiveKeys = new Set<string>();
  for (const p of pending) {
    for (const r of p.receive) {
      const k = coord(r.series, r.character, r.rarity);
      if (k) receiveKeys.add(key(k.si, k.ci, k.ri));
    }
  }

  const adjustedNeeds = needs.filter((n) => !receiveKeys.has(key(n.si, n.ci, n.ri)));
  return { surplus, needs: adjustedNeeds };
}
```

- [ ] **Step 8: Run client test to verify it passes**

Run: `npx vitest run --config vitest.client.config.ts test/client/collection.test.ts`
Expected: PASS（含改寫的給出案例 + 既有換入案例 + 空 pending 案例）

- [ ] **Step 9: Full suite + gates**

Run: `npm test && npm run lint && npm run typecheck`
Expected: 全綠（既有 `views.test.tsx` 的交換頁測試不應因瘦身而失敗——它斷言的是「暫定交換列表」渲染，不依賴給出扣減數字；若有任何失敗，停止並回報）

- [ ] **Step 10: Commit**

```bash
git add src/worker/db/queries.ts src/client/collection.ts test/worker/pending-overview.test.ts test/client/collection.test.ts
git commit -m "$(cat <<'EOF'
feat: pre-deduct pending gives from owned counts in getOverview

Give-reserved cards now subtract from the displayed owned count everywhere
(overview/grid/glance/stats + trade surplus) via a single getOverview change;
computeTradeWithPending slims to receive-only so the trade tab never double-
subtracts. progress/missing stay on physical counts (gives come from
duplicates, never reach zero).

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: 卡片管理「預約中」徽章（`listCards` + `ManageCards`）

**Files:**
- Modify: `src/shared/types.ts`（`CardRow` 加 `reservedGive`）
- Modify: `src/worker/db/queries.ts`（`listCards`）
- Modify: `src/client/admin/ManageCards.tsx`（徽章）
- Modify: `src/client/admin/admin.css`（`.pill.reserved` 樣式）
- Modify: `test/worker/list-cards.test.ts`（reservedGive + 調整後 duplicate）
- Modify: `test/client/admin.test.tsx`（ManageCards 徽章 render）

**Interfaces:**
- Consumes: 既有 `cards` / `card_catalog` / `trade_reservation_lines`；`addCards`、`createReservation`、`listCards`。
- Produces: `CardRow` 多一個 `reservedGive: number`；`listCards` 填入該值並以 `(activeCount − reservedGive) > 1` 計算 `duplicate`。

- [ ] **Step 1: Add the `reservedGive` field to `CardRow`**

在 `src/shared/types.ts` 的 `CardRow` 介面加入一欄（接在 `duplicate` 之後）：
```ts
export interface CardRow {
  id: number;
  series: string;
  character: string;
  rarity: Rarity;
  status: CardStatus;
  source: CardSource;
  askingPrice: number | null;
  wantInReturn: string | null;
  note: string | null;
  duplicate: boolean;
  reservedGive: number;
}
```

- [ ] **Step 2: Write the failing worker test**

在 `test/worker/list-cards.test.ts` 既有 `describe` 內新增（沿用該檔既有的 import 與 helper；若無 `createReservation` import 請補上）：
```ts
  it("reports reservedGive and adjusts the duplicate flag for pending gives", async () => {
    // Own 2 of a fresh type, reserve 1 to give → reservedGive 1, no longer a tradeable duplicate.
    await addCards(env.DB, [
      { series: "BUNNY GIRL", character: "Koyuki", rarity: "SSR" },
      { series: "BUNNY GIRL", character: "Koyuki", rarity: "SSR" },
    ]);
    await createReservation(env.DB, {
      reservedAt: "2026-06-27",
      give: [{ series: "BUNNY GIRL", character: "Koyuki", rarity: "SSR", qty: 1 }],
      receive: [],
    });
    const rows = await listCards(env.DB, { series: "BUNNY GIRL" });
    const koyuki = rows.filter((r) => r.character === "Koyuki" && r.rarity === "SSR");
    expect(koyuki.length).toBeGreaterThanOrEqual(2);
    expect(koyuki[0].reservedGive).toBe(1);
    expect(koyuki.every((r) => r.duplicate === false)).toBe(true); // (2 - 1) > 1 is false
  });
```
> 註：若 `test/worker/list-cards.test.ts` 尚未 import `createReservation`，在頂端 import 清單補上 `createReservation`（與 `listCards`、`addCards` 同一個 `../../src/worker/db/queries` import）。

- [ ] **Step 3: Run worker test to verify it fails**

Run: `npx vitest run --config vitest.config.ts test/worker/list-cards.test.ts`
Expected: FAIL（`reservedGive` 為 undefined / `duplicate` 仍為 true）

- [ ] **Step 4: Modify `listCards`**

在 `src/worker/db/queries.ts` 的 `listCards`，把 SELECT 加一個 `reservedGive` 子查詢，並用調整後數量算 `duplicate`：
```ts
  const stmt = db.prepare(
    `SELECT k.id, c.series, c.character, c.rarity, k.status, k.source,
            k.asking_price AS askingPrice, k.want_in_return AS wantInReturn, k.note,
            (SELECT COUNT(*) FROM cards k2
             WHERE k2.catalog_id = k.catalog_id AND k2.status IN ${ACTIVE}) AS activeCount,
            (SELECT COALESCE(SUM(qty), 0) FROM trade_reservation_lines l
             WHERE l.catalog_id = k.catalog_id AND l.direction = 'give') AS reservedGive
     FROM cards k
     JOIN card_catalog c ON c.id = k.catalog_id
     ${where}
     ORDER BY c.sort_order, k.id`,
  );
  const bound = vals.length ? stmt.bind(...vals) : stmt;
  const rows = (
    await bound.all<
      Omit<CardRow, "duplicate"> & { activeCount: number }
    >()
  ).results;
  return rows.map(({ activeCount, ...r }) => ({
    ...r,
    duplicate: activeCount - r.reservedGive > 1,
  }));
```
> `reservedGive` 已是 `CardRow` 欄位，會經由 `...r` 帶出；`duplicate` 用 `activeCount − reservedGive` 計算。

- [ ] **Step 5: Run worker test to verify it passes**

Run: `npx vitest run --config vitest.config.ts test/worker/list-cards.test.ts`
Expected: PASS（含既有案例與新案例）

- [ ] **Step 6: Write the failing client test**

在 `test/client/admin.test.tsx` 的 `describe("ManageCards", ...)` 內新增（沿用既有 `vi.stubGlobal`/`render`/`waitFor`/`screen`）：
```ts
  it("shows a 預約中 badge for cards whose type has a pending give", async () => {
    const rows = [
      {
        id: 1,
        series: "KILLER",
        character: "Iruni",
        rarity: "SSR",
        status: "owned",
        source: "pull",
        askingPrice: null,
        wantInReturn: null,
        note: null,
        duplicate: false,
        reservedGive: 1,
      },
    ];
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, json: async () => rows })),
    );
    render(<ManageCards />);
    await waitFor(() => expect(screen.getByText("Iruni")).toBeInTheDocument());
    expect(screen.getByText(/預約中/)).toBeInTheDocument();
  });
```

- [ ] **Step 7: Run client test to verify it fails**

Run: `npx vitest run --config vitest.client.config.ts test/client/admin.test.tsx`
Expected: FAIL（無「預約中」文字）

- [ ] **Step 8: Add the badge in `ManageCards`**

在 `src/client/admin/ManageCards.tsx` 的狀態欄（`<td>`，那個顯示狀態 pill / `重複` pill 的儲存格）裡，於「重複」徽章之後加入：
```tsx
                      {card.reservedGive > 0 ? (
                        <span className="pill reserved" style={{ marginLeft: 6 }}>
                          預約中 ×{card.reservedGive}
                        </span>
                      ) : null}
```
（放在現有 `card.duplicate && isActive ? (...重複...) : null` 區塊的緊接其後。）

- [ ] **Step 9: Add CSS**

在 `src/client/admin/admin.css` 檔尾新增：
```css
.pill.reserved {
  background: rgba(234, 179, 8, 0.15);
  color: #a16207;
}
```

- [ ] **Step 10: Run client test to verify it passes**

Run: `npx vitest run --config vitest.client.config.ts test/client/admin.test.tsx`
Expected: PASS（含既有 ManageCards 案例與新徽章案例）

- [ ] **Step 11: Full suite + gates + build, then commit**

Run: `npm test && npm run lint && npm run typecheck && npm run build`
Expected: 全綠

```bash
git add src/shared/types.ts src/worker/db/queries.ts src/client/admin/ManageCards.tsx src/client/admin/admin.css test/worker/list-cards.test.ts test/client/admin.test.tsx
git commit -m "$(cat <<'EOF'
feat: 預約中 badge + reservation-aware duplicate flag in card management

listCards now returns reservedGive (pending give qty for the card's type) and
computes the duplicate flag from the adjusted count; ManageCards shows a
預約中 ×N badge so a reserved-to-give card isn't mistaken for freely available.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Self-Review

**1. Spec coverage（對照 spec §4–§7）：**
- §4.1 getOverview cells 扣給出 / progress 不變 → Task 1 Step 3 + 測試 Step 1。
- §4.2 computeTradeWithPending 換入側、不雙重扣 → Task 1 Step 7 + 測試 Step 5、Step 9 全suite。
- §4.3 listCards reservedGive + duplicate + 徽章 → Task 2。
- §4.4 不受影響（缺卡/完成度/getStats）→ Task 1 Step 1 第二例斷言 progress 不變；缺卡未被觸碰。
- §5 邊界（never→0、clamp、不雙重扣）→ Task 1 測試（≥1、progress 不變）+ `Math.max(0, …)`。
- §7 測試清單 → 各 Task 測試步驟。

**2. Placeholder scan:** 無 TBD/TODO；每段含完整程式碼與可執行指令。

**3. Type consistency:** `CardRow.reservedGive: number`（Task 2 Step 1 定義，Step 4 填入、Step 8 使用）；`getOverview` 回傳型別不變（`OverviewCell.owned`）；`computeTradeWithPending(m, pending)` 簽名不變。一致。
