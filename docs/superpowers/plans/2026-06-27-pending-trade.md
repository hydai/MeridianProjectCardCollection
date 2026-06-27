# 等待交換中（暫定交換 Pending Trade）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 讓收藏者在後台登記「等待交換中」的預約；公開交換頁先扣減可換出/想換入並顯示「暫定交換列表」，按「完成」時把交易寫進真實持有庫與交易歷史。

**Architecture:** pending 預約存在兩張新表，是交換頁的純投影疊加層（pending 期間完全不動 `cards`）。公開交換頁 = `computeTrade(owned) − pending`。「完成」一次性整合進真實庫存（沿用 `recordTransaction` 的 trade 語義）並刪除預約；「取消」只刪預約。

**Tech Stack:** Cloudflare Workers + Hono、D1 (SQLite)、React 18 + Vite、Vitest（`@cloudflare/vitest-pool-workers` 跑 worker、jsdom 跑 client）、Biome。

## Global Constraints

- 設計來源：`docs/superpowers/specs/2026-06-27-pending-trade-design.md`（本計畫逐節對應）。
- DB 狀態/方向用**英文 enum**（`give`/`receive`），UI 顯示中文。
- Migration **不得使用 `BEGIN`/`COMMIT`**（遠端 D1 套用限制；見既有 `0002`/`0003`）。
- **公開端點 `GET /api/pending-trades` 永不回傳 `counterparty` 與 `note`。**
- **pending 期間不得變動 `cards` 表**；只有「完成」會寫 `cards` / `transactions`。
- 幣別僅 TWD（pending 不涉及金額，`transactions.price` 在 trade 一律 `NULL`）。
- 分層慣例：SQL 在 `src/worker/db/queries.ts`；純邏輯抽到 `src/client/collection.ts` 並單元測試；view 元件吃 props。
- 提交用 Conventional Commits；commit message 結尾加：`Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`。
- 每次 commit 前的 PreToolUse hook 會自動跑 format/lint/test；各任務最後一步仍先手動跑該任務測試確認綠燈。

**測試指令速查：**
- 單一 worker 測試：`npx vitest run --config vitest.config.ts test/worker/<file>.test.ts`
- 單一 client 測試：`npx vitest run --config vitest.client.config.ts test/client/<file>.test.ts`
- 全部：`npm test`　型別：`npm run typecheck`

---

### Task 1: D1 migration（兩張新表）

**Files:**
- Create: `migrations/0004_pending_trades.sql`
- Test: `test/worker/pending-schema.test.ts`

**Interfaces:**
- Consumes: 既有 `card_catalog(id)`。
- Produces: 資料表 `trade_reservations(id, counterparty, reserved_at, note, created_at)`、`trade_reservation_lines(id, reservation_id, direction, catalog_id, qty)`。

- [ ] **Step 1: Write the failing test**

`test/worker/pending-schema.test.ts`：
```ts
import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";

describe("0004 pending trade schema", () => {
  it("creates the two reservation tables", async () => {
    const names = (
      await env.DB.prepare(
        `SELECT name FROM sqlite_master WHERE type='table'
         AND name IN ('trade_reservations','trade_reservation_lines')`,
      ).all<{ name: string }>()
    ).results.map((r) => r.name);
    expect(names).toContain("trade_reservations");
    expect(names).toContain("trade_reservation_lines");
  });

  it("accepts an insert with a catalog FK and defaults qty to 1", async () => {
    const cat = await env.DB.prepare("SELECT id FROM card_catalog LIMIT 1").first<{ id: number }>();
    const r = await env.DB.prepare(
      "INSERT INTO trade_reservations (reserved_at) VALUES ('2026-06-27') RETURNING id",
    ).first<{ id: number }>();
    await env.DB.prepare(
      "INSERT INTO trade_reservation_lines (reservation_id, direction, catalog_id) VALUES (?, 'give', ?)",
    ).bind(r?.id, cat?.id).run();
    const line = await env.DB.prepare(
      "SELECT qty FROM trade_reservation_lines WHERE reservation_id = ?",
    ).bind(r?.id).first<{ qty: number }>();
    expect(line?.qty).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run --config vitest.config.ts test/worker/pending-schema.test.ts`
Expected: FAIL（`no such table: trade_reservations`）

- [ ] **Step 3: Create the migration**

`migrations/0004_pending_trades.sql`：
```sql
-- 0004_pending_trades.sql — 暫定交換預約（SPEC：等待交換中）
-- 與 0002/0003 一致：不使用 BEGIN/COMMIT（遠端 D1 套用 migration 限制）。

CREATE TABLE trade_reservations (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  counterparty TEXT,                              -- 對象（選填；僅後台可見，完成/取消時刪除）
  reserved_at  TEXT    NOT NULL,                  -- 預約日期 YYYY-MM-DD
  note         TEXT,                              -- 備註（選填；僅後台可見，完成/取消時刪除）
  created_at   TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE trade_reservation_lines (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  reservation_id INTEGER NOT NULL REFERENCES trade_reservations(id),
  direction      TEXT    NOT NULL,                -- 'give'（我給出）/ 'receive'（我換入）
  catalog_id     INTEGER NOT NULL REFERENCES card_catalog(id),
  qty            INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX idx_resv_lines_resv ON trade_reservation_lines(reservation_id);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run --config vitest.config.ts test/worker/pending-schema.test.ts`
Expected: PASS（兩個案例皆綠）

- [ ] **Step 5: Commit**

```bash
git add migrations/0004_pending_trades.sql test/worker/pending-schema.test.ts
git commit -m "$(cat <<'EOF'
feat: add pending-trade reservation tables (migration 0004)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: 型別 + 讀取/建立/取消 查詢

**Files:**
- Modify: `src/shared/types.ts`（檔尾新增 pending 型別）
- Modify: `src/worker/db/queries.ts`（新增 import 與查詢函式）
- Test: `test/worker/pending-queries.test.ts`

**Interfaces:**
- Consumes: 既有 `catalogId(db, series, character, rarity)`（`queries.ts:131`）。
- Produces（供 Task 3/4 及前端）：
  - 型別 `TradeDirection`、`ReservationLine`、`PublicPendingTrade`、`AdminPendingTrade`、`ReservationLineInput`、`CreateReservationInput`、`CompleteReservationInput`。
  - `getPublicPendingTrades(db): Promise<PublicPendingTrade[]>`
  - `getAdminPendingTrades(db): Promise<AdminPendingTrade[]>`
  - `createReservation(db, input: CreateReservationInput): Promise<number>`
  - `cancelReservation(db, id: number): Promise<void>`

- [ ] **Step 1: Add the shared types**

在 `src/shared/types.ts` 檔尾新增：
```ts
// ---- Pending trade reservations ----
export type TradeDirection = "give" | "receive";

export interface ReservationLine {
  direction: TradeDirection;
  catalogId: number;
  series: string;
  character: string;
  rarity: Rarity;
  qty: number;
}

// Public DTO: never includes counterparty or note.
export interface PublicPendingTrade {
  id: number;
  reservedAt: string;
  give: ReservationLine[];
  receive: ReservationLine[];
}

export interface AdminPendingTrade extends PublicPendingTrade {
  counterparty: string | null;
  note: string | null;
}

export interface ReservationLineInput {
  series: string;
  character: string;
  rarity: Rarity;
  qty: number;
}

export interface CreateReservationInput {
  counterparty?: string;
  reservedAt: string;
  note?: string;
  give: ReservationLineInput[];
  receive: ReservationLineInput[];
}

export interface CompleteReservationInput {
  happenedAt: string;
}
```

- [ ] **Step 2: Write the failing test**

`test/worker/pending-queries.test.ts`：
```ts
import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import {
  cancelReservation,
  createReservation,
  getAdminPendingTrades,
  getPublicPendingTrades,
} from "../../src/worker/db/queries";

const sample = {
  counterparty: "阿明",
  reservedAt: "2026-06-27",
  note: "面交",
  give: [
    { series: "MP 4TH", character: "Mizuki", rarity: "R", qty: 1 } as const,
    { series: "MP 4TH", character: "Rei", rarity: "SR", qty: 1 } as const,
  ],
  receive: [
    { series: "KILLER", character: "Mizuki", rarity: "R", qty: 1 } as const,
    { series: "KILLER", character: "Rei", rarity: "SR", qty: 1 } as const,
  ],
};

describe("pending reservation read/create/cancel", () => {
  it("creates a reservation and reads it back grouped by direction", async () => {
    const id = await createReservation(env.DB, sample);
    const admin = await getAdminPendingTrades(env.DB);
    const row = admin.find((r) => r.id === id);
    expect(row?.counterparty).toBe("阿明");
    expect(row?.note).toBe("面交");
    expect(row?.give.map((l) => l.character)).toEqual(["Mizuki", "Rei"]);
    expect(row?.receive.map((l) => l.character)).toEqual(["Mizuki", "Rei"]);
    expect(row?.give.every((l) => typeof l.catalogId === "number")).toBe(true);
  });

  it("public read omits counterparty and note", async () => {
    const id = await createReservation(env.DB, sample);
    const pub = await getPublicPendingTrades(env.DB);
    const row = pub.find((r) => r.id === id) as Record<string, unknown> | undefined;
    expect(row).toBeTruthy();
    expect("counterparty" in (row ?? {})).toBe(false);
    expect("note" in (row ?? {})).toBe(false);
    expect((row?.give as unknown[]).length).toBe(2);
  });

  it("cancel deletes the reservation and its lines", async () => {
    const id = await createReservation(env.DB, sample);
    await cancelReservation(env.DB, id);
    expect((await getAdminPendingTrades(env.DB)).some((r) => r.id === id)).toBe(false);
    const lines = await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM trade_reservation_lines WHERE reservation_id = ?",
    ).bind(id).first<{ n: number }>();
    expect(lines?.n).toBe(0);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run --config vitest.config.ts test/worker/pending-queries.test.ts`
Expected: FAIL（`createReservation` 等未匯出）

- [ ] **Step 4: Implement the queries**

在 `src/worker/db/queries.ts` 的型別 import 區塊補上新型別：
```ts
import type {
  AddCardInput,
  AdminPendingTrade,
  CardRow,
  CharacterStat,
  CreateReservationInput,
  MarketListing,
  MissingEntry,
  OpeningInput,
  OpeningSummary,
  OverviewCell,
  OverviewResponse,
  PublicPendingTrade,
  Rarity,
  RarityCount,
  RecordTxnInput,
  ReservationLine,
  ReservationLineInput,
  SeriesProgress,
  StatsResponse,
  TradeDirection,
  TxnRecord,
  UpdateCardInput,
} from "../../shared/types";
```

在檔尾新增（沿用既有 `catalogId()` helper）：
```ts
// ---- Pending trade reservations ----

interface RawResvLine {
  reservationId: number;
  direction: TradeDirection;
  catalogId: number;
  series: string;
  character: string;
  rarity: Rarity;
  qty: number;
}

// All lines for all reservations, joined to catalog for display, catalog-sorted.
async function reservationLines(db: D1Database): Promise<RawResvLine[]> {
  return (
    await db
      .prepare(
        `SELECT l.reservation_id AS reservationId, l.direction,
                l.catalog_id AS catalogId, c.series, c.character, c.rarity, l.qty
         FROM trade_reservation_lines l
         JOIN card_catalog c ON c.id = l.catalog_id
         ORDER BY c.sort_order`,
      )
      .all<RawResvLine>()
  ).results;
}

function attachLines<
  T extends { id: number; give: ReservationLine[]; receive: ReservationLine[] },
>(headers: T[], lines: RawResvLine[]): T[] {
  const byId = new Map<number, T>(headers.map((h) => [h.id, h]));
  for (const l of lines) {
    const h = byId.get(l.reservationId);
    if (!h) continue;
    const line: ReservationLine = {
      direction: l.direction,
      catalogId: l.catalogId,
      series: l.series,
      character: l.character,
      rarity: l.rarity,
      qty: l.qty,
    };
    (l.direction === "give" ? h.give : h.receive).push(line);
  }
  return headers;
}

export async function getPublicPendingTrades(
  db: D1Database,
): Promise<PublicPendingTrade[]> {
  const headers = (
    await db
      .prepare(
        `SELECT id, reserved_at AS reservedAt FROM trade_reservations
         ORDER BY reserved_at DESC, id DESC`,
      )
      .all<{ id: number; reservedAt: string }>()
  ).results.map((h) => ({ ...h, give: [], receive: [] }) as PublicPendingTrade);
  return attachLines(headers, await reservationLines(db));
}

export async function getAdminPendingTrades(
  db: D1Database,
): Promise<AdminPendingTrade[]> {
  const headers = (
    await db
      .prepare(
        `SELECT id, reserved_at AS reservedAt, counterparty, note
         FROM trade_reservations ORDER BY reserved_at DESC, id DESC`,
      )
      .all<{
        id: number;
        reservedAt: string;
        counterparty: string | null;
        note: string | null;
      }>()
  ).results.map((h) => ({ ...h, give: [], receive: [] }) as AdminPendingTrade);
  return attachLines(headers, await reservationLines(db));
}

export async function createReservation(
  db: D1Database,
  input: CreateReservationInput,
): Promise<number> {
  const header = await db
    .prepare(
      "INSERT INTO trade_reservations (counterparty, reserved_at, note) VALUES (?, ?, ?) RETURNING id",
    )
    .bind(input.counterparty ?? null, input.reservedAt, input.note ?? null)
    .first<{ id: number }>();
  if (!header) throw new Error("failed to create reservation");

  const insertLine = async (line: ReservationLineInput, direction: TradeDirection) => {
    const cid = await catalogId(db, line.series, line.character, line.rarity);
    await db
      .prepare(
        "INSERT INTO trade_reservation_lines (reservation_id, direction, catalog_id, qty) VALUES (?, ?, ?, ?)",
      )
      .bind(header.id, direction, cid, line.qty)
      .run();
  };
  for (const g of input.give) await insertLine(g, "give");
  for (const r of input.receive) await insertLine(r, "receive");
  return header.id;
}

export async function cancelReservation(db: D1Database, id: number): Promise<void> {
  await db
    .prepare("DELETE FROM trade_reservation_lines WHERE reservation_id = ?")
    .bind(id)
    .run();
  await db.prepare("DELETE FROM trade_reservations WHERE id = ?").bind(id).run();
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run --config vitest.config.ts test/worker/pending-queries.test.ts`
Expected: PASS（三案例皆綠）

- [ ] **Step 6: Commit**

```bash
git add src/shared/types.ts src/worker/db/queries.ts test/worker/pending-queries.test.ts
git commit -m "$(cat <<'EOF'
feat: pending-trade types + read/create/cancel queries

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: `completeReservation` —— 完成時整合進真實庫存

**Files:**
- Modify: `src/worker/db/queries.ts`（新增 `completeReservation`）
- Test: `test/worker/pending-complete.test.ts`

**Interfaces:**
- Consumes: 既有 `cards` / `transactions` 表、`createReservation`（Task 2）、`getOverview`、`getTransactions`。
- Produces: `completeReservation(db, id: number, happenedAt: string): Promise<void>`。

**規則（對應 SPEC §8）：** 所有給出單位 → 各消耗一張該卡種持有卡標 `traded`（優先 `owned`，且不消耗本次剛換入的卡）；所有換入單位 → 各新增 `cards(owned, trade_in)`；給出↔換入依稀有度排序逐張配對寫 `transactions(type='trade')`；多換一→多出給出 `received_*` 留空；一換多→多出換入仍入庫並記在最後一筆交易 `note`；完成後刪預約；給出為空則丟錯；持有不足則在寫入前丟錯（不留半套）。

- [ ] **Step 1: Write the failing test**

`test/worker/pending-complete.test.ts`：
```ts
import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import type { OverviewCell } from "../../src/shared/types";
import {
  addCards,
  completeReservation,
  createReservation,
  getAdminPendingTrades,
  getOverview,
  getTransactions,
} from "../../src/worker/db/queries";

const ownedOf = (cells: OverviewCell[], s: string, ch: string, r: string) =>
  cells.find((c) => c.series === s && c.character === ch && c.rarity === r)?.owned ?? 0;

describe("completeReservation", () => {
  it("symmetric: gives leave holdings, receives join, history records the trade, reservation purged", async () => {
    // Seed two duplicates to give away.
    await addCards(env.DB, [
      { series: "MP 4TH", character: "Mizuki", rarity: "R" },
      { series: "MP 4TH", character: "Mizuki", rarity: "R" },
      { series: "MP 4TH", character: "Rei", rarity: "SR" },
      { series: "MP 4TH", character: "Rei", rarity: "SR" },
    ]);
    const giveBefore = ownedOf((await getOverview(env.DB)).cells, "MP 4TH", "Mizuki", "R");
    const recvBefore = ownedOf((await getOverview(env.DB)).cells, "KILLER", "Mizuki", "R");

    const id = await createReservation(env.DB, {
      counterparty: "阿明",
      reservedAt: "2026-06-27",
      note: "面交",
      give: [
        { series: "MP 4TH", character: "Mizuki", rarity: "R", qty: 1 },
        { series: "MP 4TH", character: "Rei", rarity: "SR", qty: 1 },
      ],
      receive: [
        { series: "KILLER", character: "Mizuki", rarity: "R", qty: 1 },
        { series: "KILLER", character: "Rei", rarity: "SR", qty: 1 },
      ],
    });

    await completeReservation(env.DB, id, "2026-06-28");

    const cells = (await getOverview(env.DB)).cells;
    expect(ownedOf(cells, "MP 4TH", "Mizuki", "R")).toBe(giveBefore - 1);
    expect(ownedOf(cells, "KILLER", "Mizuki", "R")).toBe(recvBefore + 1);

    const txns = await getTransactions(env.DB);
    const trades = txns.filter((t) => t.type === "trade" && t.counterparty === "阿明");
    expect(trades.length).toBe(2);

    expect((await getAdminPendingTrades(env.DB)).some((r) => r.id === id)).toBe(false);
  });

  it("many-for-one: extra give becomes a one-way trade-out (no received card)", async () => {
    await addCards(env.DB, [
      { series: "NEW YEAR", character: "Koyuki", rarity: "R" },
      { series: "NEW YEAR", character: "Koyuki", rarity: "R" },
    ]);
    const id = await createReservation(env.DB, {
      reservedAt: "2026-06-27",
      give: [{ series: "NEW YEAR", character: "Koyuki", rarity: "R", qty: 2 }],
      receive: [{ series: "BUNNY GIRL", character: "Hitomi", rarity: "UR", qty: 1 }],
    });
    await completeReservation(env.DB, id, "2026-06-28");
    const recv = ownedOf((await getOverview(env.DB)).cells, "BUNNY GIRL", "Hitomi", "UR");
    expect(recv).toBeGreaterThanOrEqual(1);
    // 2 give units → 2 traded cards → 2 trade transactions (one with no received card).
    const koyuki = await env.DB.prepare(
      `SELECT COUNT(*) AS n FROM cards k JOIN card_catalog c ON c.id = k.catalog_id
       WHERE c.series='NEW YEAR' AND c.character='Koyuki' AND c.rarity='R' AND k.status='traded'`,
    ).first<{ n: number }>();
    expect(koyuki?.n).toBe(2);
  });

  it("rejects completion with no give lines", async () => {
    const id = await createReservation(env.DB, {
      reservedAt: "2026-06-27",
      give: [],
      receive: [{ series: "KILLER", character: "998", rarity: "R", qty: 1 }],
    });
    await expect(completeReservation(env.DB, id, "2026-06-28")).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run --config vitest.config.ts test/worker/pending-complete.test.ts`
Expected: FAIL（`completeReservation` 未匯出）

- [ ] **Step 3: Implement `completeReservation`**

在 `src/worker/db/queries.ts` 檔尾新增：
```ts
const RARITY_RANK: Record<string, number> = { R: 0, SR: 1, SSR: 2, UR: 3 };

export async function completeReservation(
  db: D1Database,
  id: number,
  happenedAt: string,
): Promise<void> {
  const header = await db
    .prepare("SELECT counterparty, note FROM trade_reservations WHERE id = ?")
    .bind(id)
    .first<{ counterparty: string | null; note: string | null }>();
  if (!header) throw new Error(`reservation ${id} not found`);

  const raw = (
    await db
      .prepare(
        `SELECT l.direction, l.catalog_id AS catalogId, l.qty,
                c.series, c.character, c.rarity
         FROM trade_reservation_lines l
         JOIN card_catalog c ON c.id = l.catalog_id
         WHERE l.reservation_id = ?`,
      )
      .bind(id)
      .all<{
        direction: TradeDirection;
        catalogId: number;
        qty: number;
        series: string;
        character: string;
        rarity: Rarity;
      }>()
  ).results;

  // Expand qty into units; sort each side by rarity so same-rarity swaps line up.
  const expand = (dir: TradeDirection) =>
    raw
      .filter((l) => l.direction === dir)
      .flatMap((l) => Array.from({ length: l.qty }, () => l))
      .sort((a, b) => RARITY_RANK[a.rarity] - RARITY_RANK[b.rarity]);
  const gives = expand("give");
  const receives = expand("receive");

  if (gives.length === 0) {
    throw new Error("a completed trade needs at least one give line");
  }

  // Pre-check holdings BEFORE any write so a shortfall leaves no half-done state.
  const needByCatalog = new Map<number, number>();
  for (const g of gives) needByCatalog.set(g.catalogId, (needByCatalog.get(g.catalogId) ?? 0) + 1);
  for (const [cid, need] of needByCatalog) {
    const avail = await db
      .prepare(
        `SELECT COUNT(*) AS n FROM cards
         WHERE catalog_id = ? AND status IN ('owned','for_sale','for_trade')`,
      )
      .bind(cid)
      .first<{ n: number }>();
    if (!avail || avail.n < need) {
      throw new Error(
        `not enough holdings for catalog ${cid}: need ${need}, have ${avail?.n ?? 0}`,
      );
    }
  }

  // Add every received card to holdings; keep ids aligned to `receives` order.
  const receivedCardIds: number[] = [];
  for (const r of receives) {
    const rc = await db
      .prepare(
        "INSERT INTO cards (catalog_id, status, source) VALUES (?, 'owned', 'trade_in') RETURNING id",
      )
      .bind(r.catalogId)
      .first<{ id: number }>();
    if (!rc) throw new Error("failed to add received card");
    receivedCardIds.push(rc.id);
  }

  // Receives beyond the give count (一換多): note them on the last transaction.
  const extra = receives.slice(gives.length);
  const extraNote =
    extra.length > 0
      ? `額外換得：${extra.map((r) => `${r.series} ${r.character} ${r.rarity}`).join("、")}`
      : "";

  for (let i = 0; i < gives.length; i++) {
    const g = gives[i];
    // Consume one pre-existing holding of this catalog; never a card we just received.
    const exclude = receivedCardIds.length
      ? `AND id NOT IN (${receivedCardIds.map(() => "?").join(",")})`
      : "";
    const card = await db
      .prepare(
        `SELECT id FROM cards
         WHERE catalog_id = ? AND status IN ('owned','for_sale','for_trade') ${exclude}
         ORDER BY (status = 'owned') DESC, id
         LIMIT 1`,
      )
      .bind(g.catalogId, ...receivedCardIds)
      .first<{ id: number }>();
    if (!card) throw new Error(`no holding to consume for catalog ${g.catalogId}`);
    await db
      .prepare("UPDATE cards SET status = 'traded', updated_at = datetime('now') WHERE id = ?")
      .bind(card.id)
      .run();

    const receivedCatalogId = i < receives.length ? receives[i].catalogId : null;
    const receivedCardId = i < receivedCardIds.length ? receivedCardIds[i] : null;
    const isLast = i === gives.length - 1;
    const note = [header.note, isLast ? extraNote : ""].filter(Boolean).join(" / ") || null;

    await db
      .prepare(
        `INSERT INTO transactions
           (card_id, type, counterparty, price, received_catalog_id, received_card_id, happened_at, note)
         VALUES (?, 'trade', ?, NULL, ?, ?, ?, ?)`,
      )
      .bind(card.id, header.counterparty, receivedCatalogId, receivedCardId, happenedAt, note)
      .run();
  }

  // Purge the reservation (header + lines) → clears counterparty/note from the pending layer.
  await db.prepare("DELETE FROM trade_reservation_lines WHERE reservation_id = ?").bind(id).run();
  await db.prepare("DELETE FROM trade_reservations WHERE id = ?").bind(id).run();
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run --config vitest.config.ts test/worker/pending-complete.test.ts`
Expected: PASS（三案例皆綠）

- [ ] **Step 5: Run the full worker suite (no regressions)**

Run: `npm run test:worker`
Expected: PASS（既有測試不受影響）

- [ ] **Step 6: Commit**

```bash
git add src/worker/db/queries.ts test/worker/pending-complete.test.ts
git commit -m "$(cat <<'EOF'
feat: completeReservation integrates a pending trade into real holdings

Gives leave the collection (traded), receives join (owned/trade_in), the
swap is recorded in transactions (rarity-paired; asymmetric handled), and
the reservation is purged. Pre-checks holdings to avoid half-done writes.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: API routes + client API

**Files:**
- Modify: `src/worker/app.ts`（1 公開 + 4 管理路由）
- Modify: `src/client/api.ts`（5 個 client API）
- Test: `test/worker/pending-api.test.ts`

**Interfaces:**
- Consumes: Task 2/3 的查詢函式。
- Produces:
  - Routes: `GET /api/pending-trades`、`GET|POST /api/admin/pending-trades`、`POST /api/admin/pending-trades/:id/complete`、`DELETE /api/admin/pending-trades/:id`。
  - Client: `fetchPendingTrades`、`fetchAdminPendingTrades`、`postReservation`、`completeReservation`、`cancelReservation`。

- [ ] **Step 1: Write the failing test**

`test/worker/pending-api.test.ts`：
```ts
import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";

const send = (method: string, path: string, body?: unknown) =>
  SELF.fetch(`https://example.com${path}`, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
const getJson = async <T>(path: string): Promise<T> =>
  (await SELF.fetch(`https://example.com${path}`)).json() as Promise<T>;

describe("pending-trade api", () => {
  it("creates via admin, exposes it publicly WITHOUT counterparty/note", async () => {
    const res = await send("POST", "/api/admin/pending-trades", {
      counterparty: "Zoe",
      reservedAt: "2026-06-27",
      note: "private",
      give: [{ series: "KILLER", character: "Rei", rarity: "UR", qty: 1 }],
      receive: [{ series: "NEW YEAR", character: "Sachi", rarity: "R", qty: 1 }],
    });
    expect(res.status).toBe(200);
    const { id } = (await res.json()) as { id: number };

    const admin = await getJson<Array<{ id: number; counterparty: string | null }>>(
      "/api/admin/pending-trades",
    );
    expect(admin.find((r) => r.id === id)?.counterparty).toBe("Zoe");

    const pub = await getJson<Array<Record<string, unknown>>>("/api/pending-trades");
    const row = pub.find((r) => r.id === id);
    expect(row).toBeTruthy();
    expect("counterparty" in (row ?? {})).toBe(false);
    expect("note" in (row ?? {})).toBe(false);
  });

  it("rejects a reservation with no give lines (400)", async () => {
    const res = await send("POST", "/api/admin/pending-trades", {
      reservedAt: "2026-06-27",
      give: [],
      receive: [],
    });
    expect(res.status).toBe(400);
  });

  it("cancel deletes the reservation", async () => {
    const { id } = (await (
      await send("POST", "/api/admin/pending-trades", {
        reservedAt: "2026-06-27",
        give: [{ series: "KILLER", character: "998", rarity: "R", qty: 1 }],
        receive: [],
      })
    ).json()) as { id: number };
    const del = await send("DELETE", `/api/admin/pending-trades/${id}`);
    expect(del.status).toBe(200);
    const pub = await getJson<Array<{ id: number }>>("/api/pending-trades");
    expect(pub.some((r) => r.id === id)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run --config vitest.config.ts test/worker/pending-api.test.ts`
Expected: FAIL（route 404 / 非 200）

- [ ] **Step 3: Add the routes**

在 `src/worker/app.ts` 的 query import 中加入 `getPublicPendingTrades, getAdminPendingTrades, createReservation, completeReservation, cancelReservation`，型別 import 加入 `CreateReservationInput, CompleteReservationInput`。

新增公開路由（接在 `/api/market` 之後）：
```ts
app.get("/api/pending-trades", async (c) =>
  c.json(await getPublicPendingTrades(c.env.DB)),
);
```

在 `admin` 子應用新增（接在 `transactions` 路由之後、`app.route(...)` 之前）：
```ts
admin.get("/pending-trades", async (c) =>
  c.json(await getAdminPendingTrades(c.env.DB)),
);

admin.post("/pending-trades", async (c) => {
  const body = await c.req.json<CreateReservationInput>();
  if (!body.reservedAt) return c.json({ error: "reservedAt required" }, 400);
  if (!Array.isArray(body.give) || body.give.length === 0) {
    return c.json({ error: "at least one give line required" }, 400);
  }
  const id = await createReservation(c.env.DB, body);
  return c.json({ id });
});

admin.post("/pending-trades/:id/complete", async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id)) return c.json({ error: "bad id" }, 400);
  const body = await c.req.json<CompleteReservationInput>();
  if (!body.happenedAt) return c.json({ error: "happenedAt required" }, 400);
  await completeReservation(c.env.DB, id, body.happenedAt);
  return c.json({ ok: true });
});

admin.delete("/pending-trades/:id", async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id)) return c.json({ error: "bad id" }, 400);
  await cancelReservation(c.env.DB, id);
  return c.json({ ok: true });
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run --config vitest.config.ts test/worker/pending-api.test.ts`
Expected: PASS（三案例皆綠）

- [ ] **Step 5: Add the client API**

在 `src/client/api.ts` 型別 import 加入 `AdminPendingTrade, CreateReservationInput, PublicPendingTrade`，並在 `// ---- Admin ----` 區塊後新增：
```ts
// ---- Pending trades ----
export const fetchPendingTrades = () =>
  get<PublicPendingTrade[]>("/api/pending-trades");
export const fetchAdminPendingTrades = () =>
  get<AdminPendingTrade[]>("/api/admin/pending-trades");
export const postReservation = (input: CreateReservationInput) =>
  send<{ id: number }>("POST", "/api/admin/pending-trades", input);
export const completeReservation = (id: number, happenedAt: string) =>
  send<{ ok: true }>("POST", `/api/admin/pending-trades/${id}/complete`, {
    happenedAt,
  });
export const cancelReservation = (id: number) =>
  send<{ ok: true }>("DELETE", `/api/admin/pending-trades/${id}`, {});
```

- [ ] **Step 6: Typecheck + commit**

Run: `npm run typecheck`
Expected: PASS（無型別錯誤）

```bash
git add src/worker/app.ts src/client/api.ts test/worker/pending-api.test.ts
git commit -m "$(cat <<'EOF'
feat: pending-trade API routes + client helpers

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: `computeTradeWithPending` 純函式（投影扣減）

**Files:**
- Modify: `src/client/collection.ts`
- Test: `test/client/collection.test.ts`（在既有檔尾追加 describe）

**Interfaces:**
- Consumes: 既有 `computeTrade(m)`、`Matrix`、`TradeItem`、`RARITIES`。
- Produces: `computeTradeWithPending(m: Matrix, pending: PublicPendingTrade[]): { surplus: TradeItem[]; needs: TradeItem[] }`。

- [ ] **Step 1: Write the failing test**

在 `test/client/collection.test.ts` 檔尾追加（沿用該檔既有的 `overview` 樣本與 import）：
```ts
import { computeTradeWithPending } from "../../src/client/collection";
import type { PublicPendingTrade } from "../../src/shared/types";

describe("computeTradeWithPending", () => {
  const m = buildMatrix(overview); // NEW YEAR/Mizuki R=3(spare2), MP 4TH/Mizuki R=2(spare1)

  it("equals computeTrade when there are no pending trades", () => {
    const base = computeTrade(m);
    const adj = computeTradeWithPending(m, []);
    expect(adj.surplus).toHaveLength(base.surplus.length);
    expect(adj.needs).toHaveLength(base.needs.length);
  });

  it("a give line decrements spare and drops it when it hits zero", () => {
    const pending: PublicPendingTrade[] = [
      {
        id: 1,
        reservedAt: "2026-06-27",
        give: [{ direction: "give", catalogId: 5, series: "MP 4TH", character: "Mizuki", rarity: "R", qty: 1 }],
        receive: [],
      },
    ];
    const adj = computeTradeWithPending(m, pending);
    // MP 4TH/Mizuki R had spare 1 → now 0 → removed; NEW YEAR/Mizuki R (spare 2) stays.
    expect(adj.surplus.some((s) => s.si === 1 && s.ci === 0 && s.ri === 0)).toBe(false);
    expect(adj.surplus.find((s) => s.si === 0 && s.ci === 0 && s.ri === 0)?.spare).toBe(2);
  });

  it("a receive line removes the matching need", () => {
    const base = computeTrade(m);
    const target = base.needs[0]; // some missing (si,ci,ri)
    const pending: PublicPendingTrade[] = [
      {
        id: 2,
        reservedAt: "2026-06-27",
        give: [],
        receive: [
          {
            direction: "receive",
            catalogId: 0,
            series: m.series[target.si],
            character: m.characters[target.ci],
            rarity: RARITIES[target.ri],
            qty: 1,
          },
        ],
      },
    ];
    const adj = computeTradeWithPending(m, pending);
    expect(
      adj.needs.some((n) => n.si === target.si && n.ci === target.ci && n.ri === target.ri),
    ).toBe(false);
    expect(adj.needs).toHaveLength(base.needs.length - 1);
  });
});
```

> 註：`test/client/collection.test.ts` 既有 import 已含 `buildMatrix, computeTrade` 與 `RARITIES` 來自 `../../src/client/collection`；若 `RARITIES` 尚未被 import，於該檔頂端的 import 清單補上。

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run --config vitest.client.config.ts test/client/collection.test.ts`
Expected: FAIL（`computeTradeWithPending` 未匯出）

- [ ] **Step 3: Implement the pure function**

在 `src/client/collection.ts`：
1. import 補上型別：
```ts
import type { OverviewResponse, PublicPendingTrade, Rarity } from "../shared/types";
```
2. 檔尾新增：
```ts
// Overlay pending reservations on the derived trade view:
// give lines reduce surplus spare (drop at 0); receive lines clear the matching need.
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

  const giveQty = new Map<string, number>();
  const receiveKeys = new Set<string>();
  for (const p of pending) {
    for (const g of p.give) {
      const k = coord(g.series, g.character, g.rarity);
      if (k) giveQty.set(key(k.si, k.ci, k.ri), (giveQty.get(key(k.si, k.ci, k.ri)) ?? 0) + g.qty);
    }
    for (const r of p.receive) {
      const k = coord(r.series, r.character, r.rarity);
      if (k) receiveKeys.add(key(k.si, k.ci, k.ri));
    }
  }

  const adjustedSurplus = surplus
    .map((s) => ({ ...s, spare: s.spare - (giveQty.get(key(s.si, s.ci, s.ri)) ?? 0) }))
    .filter((s) => s.spare > 0);
  const adjustedNeeds = needs.filter((n) => !receiveKeys.has(key(n.si, n.ci, n.ri)));
  return { surplus: adjustedSurplus, needs: adjustedNeeds };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run --config vitest.client.config.ts test/client/collection.test.ts`
Expected: PASS（含既有案例與 3 個新案例）

- [ ] **Step 5: Commit**

```bash
git add src/client/collection.ts test/client/collection.test.ts
git commit -m "$(cat <<'EOF'
feat: computeTradeWithPending overlay (subtract reservations from trade view)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: 公開交換頁 —— 扣減 + 暫定交換列表

**Files:**
- Modify: `src/client/views/Trade.tsx`
- Modify: `src/client/PublicViewer.tsx`
- Modify: `src/client/index.css`（少量 `.pending-*` 樣式）
- Test: `test/client/views.test.tsx`（追加 Trade pending 案例）

**Interfaces:**
- Consumes: `computeTradeWithPending`（Task 5）、`fetchPendingTrades`（Task 4）、`MissChip`、`PublicPendingTrade`、`ReservationLine`。
- Produces: `Trade` 新增可選 prop `pending?: PublicPendingTrade[]`。

- [ ] **Step 1: Write the failing test**

在 `test/client/views.test.tsx` 檔尾追加：
```ts
import type { PublicPendingTrade } from "../../src/shared/types";

describe("Trade pending overlay", () => {
  it("renders the 暫定交換列表 with card names but never the counterparty", () => {
    const pending: PublicPendingTrade[] = [
      {
        id: 1,
        reservedAt: "2026-06-27",
        give: [{ direction: "give", catalogId: 1, series: "MP 4TH", character: "Mizuki", rarity: "R", qty: 1 }],
        receive: [{ direction: "receive", catalogId: 2, series: "KILLER", character: "Rei", rarity: "SR", qty: 1 }],
      },
    ];
    render(<Trade m={m} pending={pending} />);
    expect(screen.getByText("暫定交換列表")).toBeInTheDocument();
    expect(screen.getByText("2026-06-27")).toBeInTheDocument();
    expect(screen.getByText(/MP 4TH Mizuki/)).toBeInTheDocument();
    expect(screen.getByText(/KILLER Rei/)).toBeInTheDocument();
  });

  it("omits the 暫定交換列表 when there are no pending trades", () => {
    render(<Trade m={m} pending={[]} />);
    expect(screen.queryByText("暫定交換列表")).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run --config vitest.client.config.ts test/client/views.test.tsx`
Expected: FAIL（找不到「暫定交換列表」；`Trade` 尚未接受 `pending`）

- [ ] **Step 3: Update `Trade.tsx`**

3a. 調整 import：
```ts
import { useState } from "react";
import type { PublicPendingTrade, ReservationLine } from "../../shared/types";
import {
  type Matrix,
  RARITIES,
  RARITY_KEYS,
  type TradeItem,
  computeTradeWithPending,
} from "../collection";
import { MissChip } from "./shared";
```
（移除原本對 `computeTrade` 的 import。）

3b. 改簽名與資料來源：
```ts
export function Trade({ m, pending }: { m: Matrix; pending?: PublicPendingTrade[] }) {
  const [filter, setFilter] = useState<Filter>("all");
  const { surplus, needs } = computeTradeWithPending(m, pending ?? []);
```
（其餘 `totalSpare`、`summaryCards`、`panelBody`、警告邏輯不變。）

3c. 在 `Trade` 函式之前新增顯示用 helper 與卡片元件：
```ts
interface PendingRow { rarity: (typeof RARITIES)[number]; give: string | null; receive: string | null; }

// Expand by qty and pair give/receive by rarity for a compact display table.
function pendingRows(give: ReservationLine[], receive: ReservationLine[]): PendingRow[] {
  const label = (l: ReservationLine) => `${l.series} ${l.character}`;
  const expand = (lines: ReservationLine[]) =>
    lines
      .flatMap((l) => Array.from({ length: l.qty }, () => l))
      .sort((a, b) => RARITIES.indexOf(a.rarity) - RARITIES.indexOf(b.rarity));
  const g = expand(give);
  const r = expand(receive);
  const rows: PendingRow[] = [];
  for (let i = 0; i < Math.max(g.length, r.length); i++) {
    const gi = g[i];
    const ri = r[i];
    rows.push({ rarity: (gi ?? ri).rarity, give: gi ? label(gi) : null, receive: ri ? label(ri) : null });
  }
  return rows;
}

function PendingCard({ p }: { p: PublicPendingTrade }) {
  const rows = pendingRows(p.give, p.receive);
  return (
    <div className="pending-card">
      <div className="pending-date">{p.reservedAt}</div>
      <table className="pending-table">
        <thead>
          <tr>
            <th>稀有度</th>
            <th>給出</th>
            <th>換入</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={`${row.rarity}-${i}`}>
              <td>
                <MissChip ri={RARITIES.indexOf(row.rarity)} label={row.rarity} />
              </td>
              <td>{row.give ?? "—"}</td>
              <td>{row.receive ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

3d. 在 `Trade` 回傳的 `</section>` 之前、`.trade-grid` 之後插入：
```tsx
      {pending && pending.length > 0 ? (
        <section className="pending-list">
          <h3 className="trade-panel-title">暫定交換列表</h3>
          {pending.map((p) => (
            <PendingCard key={p.id} p={p} />
          ))}
        </section>
      ) : null}
```

- [ ] **Step 4: Wire `PublicViewer.tsx`**

4a. import：
```ts
import { fetchMarket, fetchOverview, fetchPendingTrades } from "./api";
import type { MarketListing, PublicPendingTrade } from "../shared/types";
```
4b. 在元件內新增 state + effect：
```ts
const [pending, setPending] = useState<PublicPendingTrade[]>([]);

useEffect(() => {
  fetchPendingTrades()
    .then(setPending)
    .catch(() => {
      // pending overlay is non-critical; the rest of the Trade tab still works.
    });
}, []);
```
4c. `ActiveView` 加 `pending` prop 並傳給 Trade：
- 簽名加入 `pending: PublicPendingTrade[]`。
- `case "trade": return <Trade m={m} pending={pending} />;`
- 呼叫處：`<ActiveView id={tab} m={matrix} listings={listings} marketError={marketError} pending={pending} />`

- [ ] **Step 5: Add minimal CSS**

在 `src/client/index.css` 檔尾新增：
```css
.pending-list {
  margin-top: 24px;
}
.pending-card {
  border: 1px solid var(--border, rgba(255, 255, 255, 0.1));
  border-radius: 10px;
  padding: 12px 14px;
  margin-top: 12px;
}
.pending-date {
  font-size: 12px;
  color: var(--text-tertiary);
  margin-bottom: 6px;
}
.pending-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 14px;
}
.pending-table th,
.pending-table td {
  text-align: left;
  padding: 4px 8px;
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npx vitest run --config vitest.client.config.ts test/client/views.test.tsx`
Expected: PASS（含既有 view 與 2 個新 Trade 案例）

- [ ] **Step 7: Typecheck, build, commit**

Run: `npm run typecheck && npm run build`
Expected: PASS（型別與前端打包皆成功）

```bash
git add src/client/views/Trade.tsx src/client/PublicViewer.tsx src/client/index.css test/client/views.test.tsx
git commit -m "$(cat <<'EOF'
feat: public Trade tab subtracts pending trades and lists 暫定交換列表

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: 後台「交換預約」分頁

**Files:**
- Create: `src/client/admin/PendingTrades.tsx`
- Modify: `src/client/admin/Admin.tsx`（註冊分頁）
- Modify: `src/client/admin/admin.css`（少量 line-row 樣式）
- Test: `test/client/admin.test.tsx`（追加 PendingTrades 案例）

**Interfaces:**
- Consumes: `fetchOverview`、`fetchAdminPendingTrades`、`postReservation`、`completeReservation`、`cancelReservation`（Task 4）、`buildMatrix`、`computeTradeWithPending`、`RARITIES`、`TradeItem`（Task 5）。
- Produces: `PendingTrades` 元件（default tab id `reserve`）。

- [ ] **Step 1: Write the failing test**

在 `test/client/admin.test.tsx` 檔尾追加：
```ts
import { PendingTrades } from "../../src/client/admin/PendingTrades";
import { buildCatalog } from "../../seed/catalog-def";

// Overview where every type is missing except two duplicates we can give away.
const overviewJson = () => ({
  cells: buildCatalog().map((c, i) => ({
    catalogId: i + 1,
    series: c.series,
    character: c.character,
    rarity: c.rarity,
    owned:
      (c.series === "MP 4TH" && c.character === "Mizuki" && c.rarity === "R") ? 2 : 0,
  })),
  progress: [],
});

function stubFetchFor(pending: unknown[]) {
  return vi.fn(async (url: string, _init?: RequestInit) => {
    if (url === "/api/overview") return { ok: true, json: async () => overviewJson() };
    if (url === "/api/admin/pending-trades") return { ok: true, json: async () => pending };
    return { ok: true, json: async () => ({ ok: true }) };
  });
}

describe("PendingTrades", () => {
  it("renders the form and an existing reservation with 完成/取消", async () => {
    const pending = [
      {
        id: 9,
        reservedAt: "2026-06-27",
        counterparty: "阿明",
        note: "面交",
        give: [{ direction: "give", catalogId: 5, series: "MP 4TH", character: "Mizuki", rarity: "R", qty: 1 }],
        receive: [{ direction: "receive", catalogId: 6, series: "KILLER", character: "Rei", rarity: "SR", qty: 1 }],
      },
    ];
    vi.stubGlobal("fetch", stubFetchFor(pending));

    render(<PendingTrades />);
    await waitFor(() => expect(screen.getByText("交換預約")).toBeInTheDocument());
    expect(screen.getByText("阿明")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "完成" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "取消" })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run --config vitest.client.config.ts test/client/admin.test.tsx`
Expected: FAIL（找不到模組 `PendingTrades`）

- [ ] **Step 3: Create `PendingTrades.tsx`**

`src/client/admin/PendingTrades.tsx`：
```tsx
import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  AdminPendingTrade,
  Rarity,
  ReservationLineInput,
} from "../../shared/types";
import {
  type Matrix,
  RARITIES,
  type TradeItem,
  buildMatrix,
  computeTradeWithPending,
} from "../collection";
import {
  cancelReservation,
  completeReservation,
  fetchAdminPendingTrades,
  fetchOverview,
  postReservation,
} from "../api";

const today = () => new Date().toISOString().slice(0, 10);

interface Opt {
  value: string; // "si|ci|ri"
  label: string;
  series: string;
  character: string;
  rarity: Rarity;
  max: number;
}

function toOpt(m: Matrix, t: TradeItem, max: number): Opt {
  const series = m.series[t.si];
  const character = m.characters[t.ci];
  const rarity = RARITIES[t.ri];
  return { value: `${t.si}|${t.ci}|${t.ri}`, label: `${series} ${character} ${rarity}`, series, character, rarity, max };
}

interface LineDraft { value: string; qty: number; }

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
    <div className="line-editor">
      <div className="line-editor-head">
        <span className="field-label">{title}</span>
        <button type="button" className="btn btn-ghost btn-sm" onClick={add} disabled={opts.length === 0}>
          ＋ 新增{title}
        </button>
      </div>
      {drafts.map((d, i) => {
        const opt = opts.find((o) => o.value === d.value);
        const max = opt?.max ?? 1;
        return (
          <div className="line-row" key={`${title}-${i}`}>
            <select value={d.value} onChange={(e) => update(i, { value: e.target.value, qty: 1 })}>
              {opts.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}（餘 {o.max}）
                </option>
              ))}
            </select>
            <input
              type="number"
              min={1}
              max={max}
              value={d.qty}
              onChange={(e) => update(i, { qty: Math.max(1, Math.min(max, Number(e.target.value) || 1)) })}
            />
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => remove(i)}>
              移除
            </button>
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
        return o ? { series: o.series, character: o.character, rarity: o.rarity, qty: d.qty } : null;
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
    <div className="action-form">
      <div className="inline-fields">
        <label className="field">
          <span className="field-label">對象</span>
          <input value={counterparty} onChange={(e) => setCounterparty(e.target.value)} />
        </label>
        <label className="field">
          <span className="field-label">日期</span>
          <input type="date" value={reservedAt} onChange={(e) => setReservedAt(e.target.value)} />
        </label>
        <label className="field">
          <span className="field-label">備註</span>
          <input value={note} onChange={(e) => setNote(e.target.value)} />
        </label>
      </div>
      <LineEditor title="給出" opts={giveOpts} drafts={gives} setDrafts={setGives} />
      <LineEditor title="換入" opts={recvOpts} drafts={receives} setDrafts={setReceives} />
      <div className="inline-fields">
        <button type="button" className="btn btn-primary btn-sm" onClick={submit} disabled={busy}>
          {busy ? "處理中…" : "新增預約"}
        </button>
      </div>
      {err ? <div className="error-text" style={{ marginTop: 8 }}>{err}</div> : null}
    </div>
  );
}

function PendingRowItem({ p, onChange }: { p: AdminPendingTrade; onChange: () => void }) {
  const [completing, setCompleting] = useState(false);
  const [happenedAt, setHappenedAt] = useState(today());
  const [busy, setBusy] = useState(false);
  const summary = (lines: AdminPendingTrade["give"]) =>
    lines.map((l) => `${l.series} ${l.character} ${l.rarity}×${l.qty}`).join("、") || "—";

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await fn();
      onChange();
    } catch {
      setBusy(false);
    }
  };

  return (
    <tr>
      <td>{p.reservedAt}</td>
      <td>{p.counterparty ?? "—"}</td>
      <td>{summary(p.give)}</td>
      <td>{summary(p.receive)}</td>
      <td>
        {completing ? (
          <div className="inline-fields">
            <input type="date" value={happenedAt} onChange={(e) => setHappenedAt(e.target.value)} />
            <button type="button" className="btn btn-primary btn-sm" disabled={busy}
              onClick={() => run(() => completeReservation(p.id, happenedAt))}>
              確認完成
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setCompleting(false)}>
              返回
            </button>
          </div>
        ) : (
          <div className="row-actions">
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setCompleting(true)}>
              完成
            </button>
            <button type="button" className="btn btn-ghost btn-sm" disabled={busy}
              onClick={() => run(() => cancelReservation(p.id))}>
              取消
            </button>
          </div>
        )}
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
    const { surplus, needs } = computeTradeWithPending(m, pending);
    return {
      giveOpts: surplus.map((t) => toOpt(m, t, t.spare)),
      recvOpts: needs.map((t) => toOpt(m, t, 1)),
    };
  }, [m, pending]);

  return (
    <section className="panel">
      <h2 className="panel-title">交換預約</h2>
      {error ? <div className="error-text">{error}</div> : null}
      {!m || !pending ? (
        <div className="state-msg">載入中…</div>
      ) : (
        <>
          <ReservationForm giveOpts={giveOpts} recvOpts={recvOpts} onDone={reload} />
          {pending.length === 0 ? (
            <div className="trade-empty">目前沒有暫定交換。</div>
          ) : (
            <table className="admin-table" style={{ marginTop: 16 }}>
              <thead>
                <tr>
                  <th>日期</th>
                  <th>對象</th>
                  <th>給出</th>
                  <th>換入</th>
                  <th>操作</th>
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

- [ ] **Step 4: Register the tab in `Admin.tsx`**

```ts
import { PendingTrades } from "./PendingTrades";

const TABS = [
  { id: "add", label: "開箱新增" },
  { id: "manage", label: "卡片管理" },
  { id: "reserve", label: "交換預約" },
  { id: "openings", label: "開箱成本" },
  { id: "history", label: "交易歷史" },
] as const;
```
並在渲染區塊加入：
```tsx
{tab === "reserve" ? <PendingTrades /> : null}
```

- [ ] **Step 5: Add minimal CSS**

在 `src/client/admin/admin.css` 檔尾新增：
```css
.line-editor {
  margin-top: 12px;
}
.line-editor-head {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 6px;
}
.line-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 6px;
}
.line-row select {
  min-width: 220px;
}
.line-row input[type="number"] {
  width: 72px;
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npx vitest run --config vitest.client.config.ts test/client/admin.test.tsx`
Expected: PASS（含既有 AddCards/ManageCards 與新 PendingTrades 案例）

- [ ] **Step 7: Full suite, typecheck, build, commit**

Run: `npm test && npm run typecheck && npm run build`
Expected: PASS（全部 worker + client 測試、型別、打包皆綠）

```bash
git add src/client/admin/PendingTrades.tsx src/client/admin/Admin.tsx src/client/admin/admin.css test/client/admin.test.tsx
git commit -m "$(cat <<'EOF'
feat: admin 交換預約 tab to create/complete/cancel pending trades

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Self-Review

**1. Spec coverage（逐節對照 SPEC）：**
- §4 資料模型 → Task 1。
- §5 型別 → Task 2 Step 1。
- §6 API → Task 4。
- §7 後端查詢（讀/建/取消） → Task 2；（完成） → Task 3。
- §8 完成演算法（持有保證、配對、qty、收尾、原子性前置檢查） → Task 3。
- §9 投影扣減純函式 → Task 5。
- §10 公開交換頁（扣減 + 暫定列表） → Task 6。
- §11 後台分頁 → Task 7。
- §12 資料流 → Task 4 + 6 + 7 串接。
- §13 邊界（公開不露對象/備註、給出量上限、多換一/一換多、持有不足、載入失敗） → Task 2/3/4/5/6/7 各測試涵蓋。
- §14 測試 → 各任務的測試步驟。
- 隱私（公開不回對象/備註） → Task 2（query 層）+ Task 4（API 層）皆有斷言。

**2. Placeholder scan:** 無 TBD/TODO；每段程式碼皆完整、每個指令皆可執行。

**3. Type consistency:** 全程一致——`computeTradeWithPending(m, pending)`、`getPublicPendingTrades`/`getAdminPendingTrades`、`createReservation`/`completeReservation`/`cancelReservation`、`postReservation`/`completeReservation`/`cancelReservation`（client）、`ReservationLineInput`/`CreateReservationInput`/`CompleteReservationInput`。`Trade` 的 `pending?: PublicPendingTrade[]` 在 Task 6 定義並由 `PublicViewer` 傳入。

**4. 已知取捨：** 完成為循序寫入、非單一交易（與既有 `recordTransaction` 一致）；以「寫入前持有不足即丟錯」降低半完成風險（Task 3 pre-check）。單人後台、無併發，可接受。
