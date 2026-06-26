# 子午卡包收藏管理系統 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Cloudflare-hosted, publicly-viewable card-collection manager where only the owner (via Cloudflare Access) can edit packs, sales, and trades — replacing a slow Google-Sheet-to-artifact copy-paste workflow.

**Architecture:** A single Cloudflare Worker (Hono) serves a React SPA via Workers Static Assets and a JSON API backed by D1 (SQLite). Public `GET /api/*` is open; mutating `/api/admin/*` and the `/admin` UI are gated by Cloudflare Access (owner's Google email) with in-Worker JWT verification as defense-in-depth. All collection statistics are computed with SQL `GROUP BY` queries — no derived tables.

**Tech Stack:** TypeScript, React 18 + Vite, Tailwind CSS, react-router-dom, Hono, Cloudflare Workers + D1, `jose` (Access JWT), Vitest + `@cloudflare/vitest-pool-workers` + `@testing-library/react`, Biome (format/lint), Wrangler.

## Global Constraints

- **Spec is authoritative:** `SPEC.md` in repo root. Tables: `card_catalog`, `cards`, `openings`, `transactions` (see SPEC §6). Status enums: `owned/for_sale/for_trade/sold/traded`. Source enums: `pull/purchase/trade_in`. Txn types: `sale/trade`.
- **Currency:** TWD only. No `currency` columns or fields anywhere. All money is a plain `REAL`/`number`.
- **Catalog universe = 180 card types:** series order `NEW YEAR, BUNNY GIRL, KILLER, MP 4TH`; common 11 characters `Mizuki, Rei, Yuzumi, Kirari, Iruni, Itsuki, 998, Sachi, Koyuki, Hiyori, Hitomi`; `MP 4TH` additionally has `KSP` (12 chars); rarities `R, SR, SSR, UR`. → 44+44+44+48 = 180.
- **Active inventory** = `status IN ('owned','for_sale','for_trade')`. Only these count toward collection stats; `sold`/`traded` are history only.
- **Cloudflare subrequest budget:** each request must issue a small bounded number of D1 queries (target ≤ ~10). Never query D1 inside an unbounded loop; batch with `db.batch()` or a single `GROUP BY`.
- **Every commit message** uses Conventional Commits and ends with the trailer:
  `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`
- **Before each commit:** run `npx biome check --write .` and `npm test` (a PreToolUse hook also enforces format/lint/test). Also run `lineguard <changed files>`.
- **TDD:** write the failing test first, watch it fail, implement minimally, watch it pass, commit. DRY, YAGNI.

## File Structure

```
package.json, tsconfig.json, vite.config.ts, vitest.workspace.ts, biome.json,
wrangler.jsonc, tailwind.config.js, postcss.config.js, .gitignore
migrations/
  0001_init.sql                # schema (SPEC §6)
seed/
  catalog-def.ts               # series→characters, rarities (source of catalog truth)
  cards.json                   # ~258 owned cards exported from the Google Sheet
scripts/
  generate-seed.ts             # catalog-def + cards.json -> migrations/0002_*, 0003_*
src/
  shared/types.ts              # DTOs shared by worker + client
  worker/
    index.ts                   # entry: route /api/* to Hono, else env.ASSETS
    app.ts                     # Hono app, mounts public + admin routers
    auth.ts                    # Cloudflare Access JWT verify + owner-email gate
    db/
      queries.ts               # all read + write D1 functions
  client/
    main.tsx, App.tsx, api.ts
    pages/Overview.tsx, TradeBoard.tsx, Stats.tsx
    pages/admin/AdminLayout.tsx, AddCards.tsx, ManageCards.tsx, Openings.tsx, History.tsx
    components/                # RarityTag, CollectionGrid, ListingCard, ...
    index.css                  # tailwind entry
test/
  worker/*.test.ts             # pool-workers tests (real local D1)
  client/*.test.tsx            # jsdom + RTL tests
```

---

## Phase 0 — Scaffold & tooling

### Task 1: Project scaffold with passing test harness

**Files:**
- Create: `package.json`, `tsconfig.json`, `vite.config.ts`, `vitest.workspace.ts`, `biome.json`, `wrangler.jsonc`, `tailwind.config.js`, `postcss.config.js`, `.gitignore`, `src/client/main.tsx`, `src/client/App.tsx`, `src/client/index.css`, `index.html`, `src/worker/index.ts`, `test/worker/smoke.test.ts`, `test/client/smoke.test.tsx`

**Interfaces:**
- Produces: npm scripts `dev`, `build`, `test`, `lint`, `format`, `deploy`; a Worker fetch entry that routes `/api/*` to a stub and everything else to `env.ASSETS`.

- [ ] **Step 1: Initialize package and install dependencies**

```bash
npm init -y
npm i hono jose react react-dom react-router-dom
npm i -D typescript vite @vitejs/plugin-react @cloudflare/vite-plugin wrangler \
  vitest @cloudflare/vitest-pool-workers @testing-library/react @testing-library/jest-dom \
  jsdom @biomejs/biome tailwindcss postcss autoprefixer @types/react @types/react-dom
```

- [ ] **Step 2: Write configs**

`wrangler.jsonc`:
```jsonc
{
  "name": "meridian-cards",
  "main": "src/worker/index.ts",
  "compatibility_date": "2026-06-01",
  "assets": {
    "directory": "./dist",
    "binding": "ASSETS",
    "not_found_handling": "single-page-application",
    "run_worker_first": ["/api/*"]
  },
  "d1_databases": [
    { "binding": "DB", "database_name": "meridian-cards", "database_id": "PLACEHOLDER_LOCAL_OK", "migrations_dir": "migrations" }
  ],
  "vars": { "OWNER_EMAIL": "z54981220@gmail.com", "ACCESS_TEAM_DOMAIN": "", "ACCESS_AUD": "" }
}
```
> `database_id` is filled in Task 16 (`wrangler d1 create`). Local dev/tests work without it. `ACCESS_TEAM_DOMAIN`/`ACCESS_AUD` are set in Task 16.

`tsconfig.json`: target `ES2022`, `module` `ESNext`, `moduleResolution` `Bundler`, `jsx` `react-jsx`, `strict` true, `types` `["@cloudflare/workers-types", "vitest/globals"]`, include `src`, `test`, `scripts`, `seed`.

`vite.config.ts`: React plugin + Cloudflare plugin, build `outDir: dist`.
```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { cloudflare } from '@cloudflare/vite-plugin';
export default defineConfig({ plugins: [react(), cloudflare()], build: { outDir: 'dist' } });
```

`vitest.workspace.ts` (two projects — workers runtime for the API, jsdom for React):
```ts
import { defineWorkspace } from 'vitest/config';
export default defineWorkspace([
  {
    test: {
      name: 'worker',
      include: ['test/worker/**/*.test.ts'],
      poolOptions: { workers: { wrangler: { configPath: './wrangler.jsonc' } } },
    },
    // @cloudflare/vitest-pool-workers is configured via pool below
    // (see step note)
  },
  {
    test: { name: 'client', include: ['test/client/**/*.test.tsx'], environment: 'jsdom', globals: true, setupFiles: ['./test/client/setup.ts'] },
  },
]);
```
> Worker project must set `pool: '@cloudflare/vitest-pool-workers'`. Put that in a dedicated `vitest.config.ts` referenced by the worker project if the workspace inline form rejects it. Create `test/client/setup.ts` with `import '@testing-library/jest-dom'`.

`tailwind.config.js`: `content: ['./index.html','./src/client/**/*.{ts,tsx}']`. `postcss.config.js`: tailwind + autoprefixer. `src/client/index.css`: the three `@tailwind` directives.

`biome.json`: enable formatter + linter, 2-space indent, recommended rules.

`.gitignore`:
```
node_modules/
dist/
.wrangler/
.dev.vars
*.local
```

`package.json` scripts:
```json
{ "scripts": {
  "dev": "vite",
  "build": "vite build",
  "test": "vitest run",
  "lint": "biome check .",
  "format": "biome check --write .",
  "deploy": "npm run build && wrangler deploy"
} }
```

- [ ] **Step 3: Minimal app + worker entry**

`index.html` mounts `<div id="root">` + `src/client/main.tsx`. `src/client/main.tsx` renders `<App/>` into `#root`. `src/client/App.tsx`:
```tsx
export default function App() { return <h1 className="text-2xl font-bold p-6">子午卡包收藏</h1>; }
```

`src/worker/index.ts`:
```ts
export interface Env { ASSETS: Fetcher; DB: D1Database; OWNER_EMAIL: string; ACCESS_TEAM_DOMAIN: string; ACCESS_AUD: string; }
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api')) {
      return new Response(JSON.stringify({ ok: true }), { headers: { 'content-type': 'application/json' } });
    }
    return env.ASSETS.fetch(request);
  },
};
```

- [ ] **Step 4: Write smoke tests**

`test/worker/smoke.test.ts`:
```ts
import { env, SELF } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';
describe('worker', () => {
  it('answers /api with ok', async () => {
    const res = await SELF.fetch('https://example.com/api/ping');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });
});
```
`test/client/smoke.test.tsx`:
```tsx
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import App from '../../src/client/App';
describe('App', () => {
  it('renders title', () => { render(<App />); expect(screen.getByText('子午卡包收藏')).toBeInTheDocument(); });
});
```

- [ ] **Step 5: Run tests — expect PASS**

Run: `npm test`
Expected: both projects pass (worker smoke + client smoke).

- [ ] **Step 6: Verify build**

Run: `npm run build`
Expected: `dist/` produced with `index.html` + assets, no errors.

- [ ] **Step 7: Commit**

```bash
npm run format && git add -A && git commit -m "chore: scaffold worker + react + d1 toolchain"
```

---

## Phase 1 — Schema, seed & import

### Task 2: Database schema migration

**Files:**
- Create: `migrations/0001_init.sql`, `test/worker/schema.test.ts`

**Interfaces:**
- Produces: tables `card_catalog`, `series`, `openings`, `cards`, `transactions` + indexes exactly as SPEC §6.

- [ ] **Step 1: Write the failing test**

`test/worker/schema.test.ts`:
```ts
import { env } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';
describe('schema', () => {
  it('creates all tables', async () => {
    const { results } = await env.DB.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
    ).all<{ name: string }>();
    const names = results.map(r => r.name);
    for (const t of ['card_catalog','cards','openings','series','transactions']) {
      expect(names).toContain(t);
    }
  });
});
```

- [ ] **Step 2: Run — expect FAIL** (`run: npx vitest run test/worker/schema.test.ts`). Expected: tables missing.
> Migrations are auto-applied to the test D1 by `@cloudflare/vitest-pool-workers` via `migrations_dir`. If not auto-applied in your setup, add an `applyMigrations` helper in the test setup; the pool exposes `applyD1Migrations(env.DB, env.TEST_MIGRATIONS)`.

- [ ] **Step 3: Write `migrations/0001_init.sql`** — copy the full DDL from SPEC §6.1–6.5 verbatim (5 `CREATE TABLE` + 5 `CREATE INDEX`). No `currency` columns.

- [ ] **Step 4: Run — expect PASS.**

- [ ] **Step 5: Commit**
```bash
git add migrations/0001_init.sql test/worker/schema.test.ts && git commit -m "feat: add d1 schema migration"
```

### Task 3: Seed generator (catalog + import from Sheet)

**Files:**
- Create: `seed/catalog-def.ts`, `seed/cards.json`, `scripts/generate-seed.ts`, `test/worker/seed.test.ts`
- Generate: `migrations/0002_seed_catalog.sql`, `migrations/0003_seed_cards.sql`

**Interfaces:**
- `seed/catalog-def.ts` exports `SERIES: string[]`, `COMMON_CHARACTERS: string[]`, `MP4TH_EXTRA: string[]`, `RARITIES: Rarity[]`, and `buildCatalog(): {series:string;character:string;rarity:Rarity;sortOrder:number}[]` (180 rows).
- `seed/cards.json`: `{ series: string; character: string; rarity: 'R'|'SR'|'SSR'|'UR'; note?: string }[]` exported from the Google Sheet "開箱記錄" tab.
- Produces: catalog seeded (180), owned cards seeded (~258).

- [ ] **Step 1: Orchestrator exports the Sheet** to `seed/cards.json`. Each "開箱記錄" row → one object; rows whose 備註 = `購入` keep `"note":"購入"`. (Source data already accessible via the project's Google Drive integration — do this once and commit the JSON so the build is reproducible offline.)

- [ ] **Step 2: Write `seed/catalog-def.ts`**
```ts
import type { Rarity } from '../src/shared/types';
export const SERIES = ['NEW YEAR', 'BUNNY GIRL', 'KILLER', 'MP 4TH'];
export const COMMON_CHARACTERS = ['Mizuki','Rei','Yuzumi','Kirari','Iruni','Itsuki','998','Sachi','Koyuki','Hiyori','Hitomi'];
export const MP4TH_EXTRA = ['KSP'];
export const RARITIES: Rarity[] = ['R','SR','SSR','UR'];
export function charactersFor(series: string): string[] {
  return series === 'MP 4TH' ? [...COMMON_CHARACTERS, ...MP4TH_EXTRA] : COMMON_CHARACTERS;
}
export function buildCatalog() {
  const rows: { series: string; character: string; rarity: Rarity; sortOrder: number }[] = [];
  let order = 0;
  for (const series of SERIES)
    for (const character of charactersFor(series))
      for (const rarity of RARITIES) rows.push({ series, character, rarity, sortOrder: order++ });
  return rows;
}
```

- [ ] **Step 3: Write the failing test** `test/worker/seed.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { buildCatalog } from '../../seed/catalog-def';
import cards from '../../seed/cards.json';
describe('seed data', () => {
  it('catalog has 180 unique types', () => {
    const c = buildCatalog();
    expect(c).toHaveLength(180);
    expect(new Set(c.map(x => `${x.series}|${x.character}|${x.rarity}`)).size).toBe(180);
  });
  it('every owned card maps to a catalog type', () => {
    const valid = new Set(buildCatalog().map(x => `${x.series}|${x.character}|${x.rarity}`));
    for (const card of cards) expect(valid.has(`${card.series}|${card.character}|${card.rarity}`)).toBe(true);
  });
  it('matches the Sheet per-series totals', () => {
    const by = (s: string) => cards.filter(c => c.series === s).length;
    expect(by('NEW YEAR')).toBe(50);
    expect(by('BUNNY GIRL')).toBe(47);
    expect(by('KILLER')).toBe(41);
    expect(by('MP 4TH')).toBe(120);
    expect(cards.length).toBe(258);
    expect(cards.filter(c => c.note === '購入').length).toBe(18);
  });
});
```
> These expected counts come from the Sheet's own 稀有度統計 tab. A mismatch means `cards.json` was exported wrong — fix the export, not the test.

- [ ] **Step 4: Run — expect FAIL** until `cards.json` + `catalog-def.ts` are correct. Iterate the export until green.

- [ ] **Step 5: Write `scripts/generate-seed.ts`** — emits two SQL files:
```ts
import { writeFileSync } from 'node:fs';
import { buildCatalog } from '../seed/catalog-def';
import cards from '../seed/cards.json';
const esc = (s: string) => s.replace(/'/g, "''");
const catalog = buildCatalog();
const catSql = ['BEGIN;', ...catalog.map(c =>
  `INSERT INTO card_catalog (series,character,rarity,sort_order) VALUES ('${esc(c.series)}','${esc(c.character)}','${c.rarity}',${c.sortOrder});`), 'COMMIT;'].join('\n');
writeFileSync('migrations/0002_seed_catalog.sql', catSql + '\n');
const cardSql = ['BEGIN;', ...cards.map(c => {
  const source = c.note === '購入' ? 'purchase' : 'pull';
  return `INSERT INTO cards (catalog_id,status,source) SELECT id,'owned','${source}' FROM card_catalog WHERE series='${esc(c.series)}' AND character='${esc(c.character)}' AND rarity='${c.rarity}';`;
}), 'COMMIT;'].join('\n');
writeFileSync('migrations/0003_seed_cards.sql', cardSql + '\n');
console.log(`catalog=${catalog.length} cards=${cards.length}`);
```
Run: `npx tsx scripts/generate-seed.ts` (add `tsx` as devDep) → prints `catalog=180 cards=258`.

- [ ] **Step 6: Add an integration test** `test/worker/seed-applied.test.ts` asserting that after migrations the DB has 180 catalog rows and 258 active cards:
```ts
import { env } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';
it('seeded counts', async () => {
  const cat = await env.DB.prepare('SELECT COUNT(*) n FROM card_catalog').first<{n:number}>();
  const crd = await env.DB.prepare("SELECT COUNT(*) n FROM cards WHERE status='owned'").first<{n:number}>();
  expect(cat?.n).toBe(180); expect(crd?.n).toBe(258);
});
```

- [ ] **Step 7: Run all tests — expect PASS.** (`npm test`)

- [ ] **Step 8: Commit**
```bash
git add seed scripts migrations test && git commit -m "feat: seed catalog and import collection from sheet"
```

---

## Phase 2 — Query layer (TDD against real D1)

### Task 4: Read queries (overview, missing, market, stats)

**Files:**
- Create: `src/shared/types.ts`, `src/worker/db/queries.ts`, `test/worker/queries-read.test.ts`

**Interfaces:**
- `src/shared/types.ts` (DTOs consumed by routes AND client):
```ts
export type Rarity = 'R' | 'SR' | 'SSR' | 'UR';
export type CardStatus = 'owned' | 'for_sale' | 'for_trade' | 'sold' | 'traded';
export type CardSource = 'pull' | 'purchase' | 'trade_in';
export type TxnType = 'sale' | 'trade';
export interface OverviewCell { catalogId: number; series: string; character: string; rarity: Rarity; owned: number; }
export interface SeriesProgress { series: string; collectedTypes: number; totalTypes: number; }
export interface OverviewResponse { cells: OverviewCell[]; progress: SeriesProgress[]; }
export interface MissingEntry { catalogId: number; series: string; character: string; rarity: Rarity; }
export interface MarketListing { cardId: number; series: string; character: string; rarity: Rarity; status: 'for_sale'|'for_trade'; askingPrice: number|null; wantInReturn: string|null; note: string|null; }
export interface RarityCount { rarity: Rarity; count: number; }
export interface CharacterStat { character: string; R: number; SR: number; SSR: number; UR: number; }
export interface PullRate { rarity: Rarity; count: number; pct: number; }
export interface StatsResponse { byRarity: RarityCount[]; byCharacter: CharacterStat[]; pullRates: PullRate[]; }
```
- Produces (functions in `queries.ts`, all take `db: D1Database` first):
  `getOverview(db): Promise<OverviewResponse>`, `getMissing(db): Promise<MissingEntry[]>`, `getMarket(db): Promise<MarketListing[]>`, `getStats(db): Promise<StatsResponse>`.

- [ ] **Step 1: Write the failing test** `test/worker/queries-read.test.ts` (runs against seeded D1):
```ts
import { env } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';
import { getOverview, getMissing, getMarket, getStats } from '../../src/worker/db/queries';
describe('read queries', () => {
  it('overview totals 180 cells and correct per-series totals', async () => {
    const o = await getOverview(env.DB);
    expect(o.cells).toHaveLength(180);
    const ny = o.progress.find(p => p.series === 'NEW YEAR')!;
    expect(ny.totalTypes).toBe(44);
    expect(ny.collectedTypes).toBe(29); // from Sheet 收藏總覽
    const mp = o.progress.find(p => p.series === 'MP 4TH')!;
    expect(mp.totalTypes).toBe(48);
  });
  it('missing = catalog types with zero active owned', async () => {
    const m = await getMissing(env.DB);
    // 180 types - distinct collected; spot-check a known gap exists
    expect(m.length).toBeGreaterThan(0);
    expect(m.every(x => x.catalogId > 0)).toBe(true);
  });
  it('market lists only for_sale/for_trade cards', async () => {
    await env.DB.prepare("UPDATE cards SET status='for_sale', asking_price=300 WHERE id=(SELECT id FROM cards LIMIT 1)").run();
    const mk = await getMarket(env.DB);
    expect(mk.length).toBe(1);
    expect(mk[0].askingPrice).toBe(300);
  });
  it('stats pull rates sum to ~100%', async () => {
    const s = await getStats(env.DB);
    const total = s.pullRates.reduce((a, r) => a + r.pct, 0);
    expect(Math.round(total)).toBe(100);
  });
});
```

- [ ] **Step 2: Run — expect FAIL** (`getOverview` not defined).

- [ ] **Step 3: Implement `src/worker/db/queries.ts` read functions.** Key SQL (active inventory = owned/for_sale/for_trade):
```ts
import type { OverviewResponse, MissingEntry, MarketListing, StatsResponse, Rarity } from '../../shared/types';
const ACTIVE = "('owned','for_sale','for_trade')";

export async function getOverview(db: D1Database): Promise<OverviewResponse> {
  const cells = (await db.prepare(`
    SELECT c.id catalogId, c.series, c.character, c.rarity,
           COUNT(k.id) owned
    FROM card_catalog c
    LEFT JOIN cards k ON k.catalog_id=c.id AND k.status IN ${ACTIVE}
    GROUP BY c.id ORDER BY c.sort_order
  `).all()).results as any[];
  const progress = (await db.prepare(`
    SELECT c.series,
           COUNT(*) totalTypes,
           SUM(CASE WHEN owned>0 THEN 1 ELSE 0 END) collectedTypes
    FROM (SELECT c.id, c.series, COUNT(k.id) owned
          FROM card_catalog c LEFT JOIN cards k ON k.catalog_id=c.id AND k.status IN ${ACTIVE}
          GROUP BY c.id) c
    GROUP BY c.series
  `).all()).results as any[];
  return { cells, progress };
}

export async function getMissing(db: D1Database): Promise<MissingEntry[]> {
  return (await db.prepare(`
    SELECT c.id catalogId, c.series, c.character, c.rarity
    FROM card_catalog c
    WHERE NOT EXISTS (SELECT 1 FROM cards k WHERE k.catalog_id=c.id AND k.status IN ${ACTIVE})
    ORDER BY c.sort_order
  `).all()).results as any[];
}

export async function getMarket(db: D1Database): Promise<MarketListing[]> {
  return (await db.prepare(`
    SELECT k.id cardId, c.series, c.character, c.rarity, k.status,
           k.asking_price askingPrice, k.want_in_return wantInReturn, k.note
    FROM cards k JOIN card_catalog c ON c.id=k.catalog_id
    WHERE k.status IN ('for_sale','for_trade')
    ORDER BY c.sort_order
  `).all()).results as any[];
}

export async function getStats(db: D1Database): Promise<StatsResponse> {
  const byRarity = (await db.prepare(`
    SELECT c.rarity, COUNT(k.id) count FROM cards k JOIN card_catalog c ON c.id=k.catalog_id
    WHERE k.status IN ${ACTIVE} GROUP BY c.rarity`).all()).results as any[];
  const byCharacter = (await db.prepare(`
    SELECT c.character,
      SUM(c.rarity='R') R, SUM(c.rarity='SR') SR, SUM(c.rarity='SSR') SSR, SUM(c.rarity='UR') UR
    FROM cards k JOIN card_catalog c ON c.id=k.catalog_id
    WHERE k.status IN ${ACTIVE} GROUP BY c.character ORDER BY c.character`).all()).results as any[];
  const total = byRarity.reduce((a, r) => a + r.count, 0) || 1;
  const order: Rarity[] = ['R','SR','SSR','UR'];
  const pullRates = order.map(rarity => {
    const count = byRarity.find(r => r.rarity === rarity)?.count ?? 0;
    return { rarity, count, pct: (count / total) * 100 };
  });
  return { byRarity, byCharacter, pullRates };
}
```
> Cast-to-`any` rows are acceptable at the D1 boundary; the function return TYPE enforces the DTO shape for callers. Each function is ≤2 D1 queries (subrequest budget safe).

- [ ] **Step 4: Run — expect PASS.** Adjust the `collectedTypes=29` assertion only if the seeded data legitimately differs; investigate before changing.

- [ ] **Step 5: Commit**
```bash
git add src/shared/types.ts src/worker/db/queries.ts test/worker/queries-read.test.ts && git commit -m "feat: collection read queries (overview, missing, market, stats)"
```

### Task 5: Mutation queries (add cards, update, openings, transactions)

**Files:**
- Modify: `src/worker/db/queries.ts`, `src/shared/types.ts`
- Create: `test/worker/queries-write.test.ts`

**Interfaces (add to `types.ts`):**
```ts
export interface AddCardInput { series: string; character: string; rarity: Rarity; source?: CardSource; note?: string; }
export interface OpeningInput { series?: string; openedAt: string; cost?: number; note?: string; }
export interface UpdateCardInput { status?: CardStatus; askingPrice?: number|null; wantInReturn?: string|null; note?: string|null; }
export interface RecordTxnInput { type: TxnType; counterparty?: string; price?: number; happenedAt: string; note?: string;
  receivedSeries?: string; receivedCharacter?: string; receivedRarity?: Rarity; }
export interface OpeningSummary { id: number; series: string|null; openedAt: string; cost: number|null; cardCount: number; avgCost: number|null; }
export interface TxnRecord { id: number; cardId: number; type: TxnType; counterparty: string|null; price: number|null; happenedAt: string; series: string; character: string; rarity: Rarity; note: string|null; }
```
- Produces: `createOpening(db, OpeningInput): Promise<number>`; `addCards(db, AddCardInput[], openingId?: number): Promise<number[]>`; `updateCard(db, id, UpdateCardInput): Promise<void>`; `recordTransaction(db, cardId, RecordTxnInput): Promise<number>`; `getOpenings(db): Promise<OpeningSummary[]>`; `getTransactions(db): Promise<TxnRecord[]>`.

- [ ] **Step 1: Write the failing test** `test/worker/queries-write.test.ts`:
```ts
import { env } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';
import { addCards, updateCard, recordTransaction, createOpening, getOpenings, getTransactions, getOverview } from '../../src/worker/db/queries';

describe('mutations', () => {
  it('addCards inserts and links to opening; cost analysis averages', async () => {
    const op = await createOpening(env.DB, { series: 'KILLER', openedAt: '2026-06-01', cost: 600 });
    const ids = await addCards(env.DB, [
      { series: 'KILLER', character: 'Rei', rarity: 'SR' },
      { series: 'KILLER', character: 'Mizuki', rarity: 'R' },
    ], op);
    expect(ids).toHaveLength(2);
    const sum = (await getOpenings(env.DB)).find(o => o.id === op)!;
    expect(sum.cardCount).toBe(2);
    expect(sum.avgCost).toBe(300);
  });

  it('sale marks sold + writes history + leaves collection', async () => {
    const [id] = await addCards(env.DB, [{ series: 'NEW YEAR', character: 'Sachi', rarity: 'R' }]);
    const before = (await getOverview(env.DB)).cells.find(c => c.character==='Sachi' && c.series==='NEW YEAR' && c.rarity==='R')!.owned;
    await recordTransaction(env.DB, id, { type: 'sale', price: 250, counterparty: 'Alice', happenedAt: '2026-06-10' });
    const after = (await getOverview(env.DB)).cells.find(c => c.character==='Sachi' && c.series==='NEW YEAR' && c.rarity==='R')!.owned;
    expect(after).toBe(before - 1);
    const txns = await getTransactions(env.DB);
    expect(txns.some(t => t.price === 250 && t.counterparty === 'Alice')).toBe(true);
  });

  it('trade marks traded + creates received card as owned', async () => {
    const [id] = await addCards(env.DB, [{ series: 'BUNNY GIRL', character: 'Rei', rarity: 'R' }]);
    await recordTransaction(env.DB, id, { type: 'trade', counterparty: 'Bob', happenedAt: '2026-06-11',
      receivedSeries: 'BUNNY GIRL', receivedCharacter: 'Sachi', receivedRarity: 'SR' });
    const owned = (await getOverview(env.DB)).cells.find(c => c.series==='BUNNY GIRL' && c.character==='Sachi' && c.rarity==='SR')!.owned;
    expect(owned).toBeGreaterThanOrEqual(1);
  });

  it('updateCard lists for sale', async () => {
    const [id] = await addCards(env.DB, [{ series: 'KILLER', character: '998', rarity: 'SR' }]);
    await updateCard(env.DB, id, { status: 'for_sale', askingPrice: 400 });
    const row = await env.DB.prepare('SELECT status, asking_price p FROM cards WHERE id=?').bind(id).first<any>();
    expect(row.status).toBe('for_sale'); expect(row.p).toBe(400);
  });
});
```

- [ ] **Step 2: Run — expect FAIL.**

- [ ] **Step 3: Implement mutations in `queries.ts`.**
```ts
async function catalogId(db: D1Database, series: string, character: string, rarity: string): Promise<number> {
  const row = await db.prepare('SELECT id FROM card_catalog WHERE series=? AND character=? AND rarity=?')
    .bind(series, character, rarity).first<{ id: number }>();
  if (!row) throw new Error(`unknown card type: ${series}/${character}/${rarity}`);
  return row.id;
}
export async function createOpening(db: D1Database, i: OpeningInput): Promise<number> {
  const r = await db.prepare('INSERT INTO openings (series,opened_at,cost,note) VALUES (?,?,?,?) RETURNING id')
    .bind(i.series ?? null, i.openedAt, i.cost ?? null, i.note ?? null).first<{ id: number }>();
  return r!.id;
}
export async function addCards(db: D1Database, cards: AddCardInput[], openingId?: number): Promise<number[]> {
  const ids: number[] = [];
  for (const c of cards) {
    const cid = await catalogId(db, c.series, c.character, c.rarity);
    const r = await db.prepare('INSERT INTO cards (catalog_id,status,source,opening_id,note) VALUES (?,?,?,?,?) RETURNING id')
      .bind(cid, 'owned', c.source ?? 'pull', openingId ?? null, c.note ?? null).first<{ id: number }>();
    ids.push(r!.id);
  }
  return ids;
}
export async function updateCard(db: D1Database, id: number, u: UpdateCardInput): Promise<void> {
  const sets: string[] = []; const vals: unknown[] = [];
  if (u.status !== undefined) { sets.push('status=?'); vals.push(u.status); }
  if (u.askingPrice !== undefined) { sets.push('asking_price=?'); vals.push(u.askingPrice); }
  if (u.wantInReturn !== undefined) { sets.push('want_in_return=?'); vals.push(u.wantInReturn); }
  if (u.note !== undefined) { sets.push('note=?'); vals.push(u.note); }
  if (!sets.length) return;
  sets.push("updated_at=datetime('now')");
  await db.prepare(`UPDATE cards SET ${sets.join(',')} WHERE id=?`).bind(...vals, id).run();
}
export async function recordTransaction(db: D1Database, cardId: number, t: RecordTxnInput): Promise<number> {
  let receivedCatalogId: number | null = null, receivedCardId: number | null = null;
  if (t.type === 'trade' && t.receivedSeries && t.receivedCharacter && t.receivedRarity) {
    receivedCatalogId = await catalogId(db, t.receivedSeries, t.receivedCharacter, t.receivedRarity);
    const rc = await db.prepare('INSERT INTO cards (catalog_id,status,source) VALUES (?,?,?) RETURNING id')
      .bind(receivedCatalogId, 'owned', 'trade_in').first<{ id: number }>();
    receivedCardId = rc!.id;
  }
  await db.prepare("UPDATE cards SET status=?, updated_at=datetime('now') WHERE id=?")
    .bind(t.type === 'sale' ? 'sold' : 'traded', cardId).run();
  const r = await db.prepare(`INSERT INTO transactions
    (card_id,type,counterparty,price,received_catalog_id,received_card_id,happened_at,note)
    VALUES (?,?,?,?,?,?,?,?) RETURNING id`)
    .bind(cardId, t.type, t.counterparty ?? null, t.price ?? null, receivedCatalogId, receivedCardId, t.happenedAt, t.note ?? null)
    .first<{ id: number }>();
  return r!.id;
}
export async function getOpenings(db: D1Database): Promise<OpeningSummary[]> {
  return (await db.prepare(`
    SELECT o.id, o.series, o.opened_at openedAt, o.cost,
           COUNT(k.id) cardCount,
           CASE WHEN o.cost IS NULL OR COUNT(k.id)=0 THEN NULL ELSE o.cost*1.0/COUNT(k.id) END avgCost
    FROM openings o LEFT JOIN cards k ON k.opening_id=o.id
    GROUP BY o.id ORDER BY o.opened_at DESC`).all()).results as any[];
}
export async function getTransactions(db: D1Database): Promise<TxnRecord[]> {
  return (await db.prepare(`
    SELECT t.id, t.card_id cardId, t.type, t.counterparty, t.price, t.happened_at happenedAt, t.note,
           c.series, c.character, c.rarity
    FROM transactions t JOIN cards k ON k.id=t.card_id JOIN card_catalog c ON c.id=k.catalog_id
    ORDER BY t.happened_at DESC`).all()).results as any[];
}
```
> `addCards` loops D1 inserts — bounded by a single pack's card count (small). If a batch could be large, switch to `db.batch()`. Note in code review per the subrequest constraint.

- [ ] **Step 4: Run — expect PASS.**
- [ ] **Step 5: Commit**
```bash
git add src/worker/db/queries.ts src/shared/types.ts test/worker/queries-write.test.ts && git commit -m "feat: mutation queries (add/update cards, openings, transactions)"
```

---

## Phase 3 — API routes & auth

### Task 6: Public API routes + worker wiring

**Files:**
- Create: `src/worker/app.ts`, `test/worker/api-public.test.ts`
- Modify: `src/worker/index.ts` (route `/api/*` → Hono app)

**Interfaces:**
- Produces endpoints: `GET /api/overview`, `GET /api/missing`, `GET /api/market`, `GET /api/stats` returning the matching DTOs as JSON.

- [ ] **Step 1: Write the failing test** `test/worker/api-public.test.ts`:
```ts
import { SELF } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';
describe('public api', () => {
  it('GET /api/overview returns 180 cells', async () => {
    const res = await SELF.fetch('https://x/api/overview');
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.cells).toHaveLength(180);
  });
  it('GET /api/stats returns pull rates', async () => {
    const body = await (await SELF.fetch('https://x/api/stats')).json() as any;
    expect(body.pullRates).toHaveLength(4);
  });
});
```

- [ ] **Step 2: Run — expect FAIL** (returns the stub `{ok:true}`).

- [ ] **Step 3: Implement `src/worker/app.ts`:**
```ts
import { Hono } from 'hono';
import type { Env } from './index';
import { getOverview, getMissing, getMarket, getStats } from './db/queries';
export const app = new Hono<{ Bindings: Env }>();
app.get('/api/overview', async c => c.json(await getOverview(c.env.DB)));
app.get('/api/missing', async c => c.json(await getMissing(c.env.DB)));
app.get('/api/market', async c => c.json(await getMarket(c.env.DB)));
app.get('/api/stats', async c => c.json(await getStats(c.env.DB)));
export default app;
```
Update `src/worker/index.ts` `fetch`: `if (url.pathname.startsWith('/api')) return app.fetch(request, env);` (import `app`).

- [ ] **Step 4: Run — expect PASS.**
- [ ] **Step 5: Commit** `feat: public api routes`.

### Task 7: Admin API routes

**Files:**
- Create: `test/worker/api-admin.test.ts`
- Modify: `src/worker/app.ts`

**Interfaces:**
- Produces: `POST /api/admin/cards` (`{cards: AddCardInput[]; opening?: OpeningInput}` → `{ids:number[]}`), `PATCH /api/admin/cards/:id` (`UpdateCardInput`), `POST /api/admin/openings` (`OpeningInput`→`{id}`), `GET /api/admin/openings`, `POST /api/admin/transactions` (`{cardId:number}&RecordTxnInput`→`{id}`), `GET /api/admin/transactions`.

- [ ] **Step 1: Write the failing test** `test/worker/api-admin.test.ts` — POST cards then assert overview reflects them; POST a sale transaction then assert it appears in `GET /api/admin/transactions`. (Auth is added in Task 8; these tests call routes directly.)
```ts
import { SELF } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';
const J = (b: unknown) => ({ method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) });
it('POST /api/admin/cards adds cards', async () => {
  const res = await SELF.fetch('https://x/api/admin/cards', J({ cards: [{ series:'KILLER', character:'Rei', rarity:'UR' }] }));
  expect(res.status).toBe(200);
  expect(((await res.json()) as any).ids).toHaveLength(1);
});
```
> NOTE: Task 8 inserts auth middleware. To keep this test green afterward, it sets a valid dev bypass header (see Task 8 — `cloudflare:test` runs with `ACCESS_*` empty → middleware allows in test/dev). Document this explicitly.

- [ ] **Step 2: Run — expect FAIL.**
- [ ] **Step 3: Implement admin routes** in `app.ts` under a sub-router mounted at `/api/admin`, calling the Task 5 mutation functions. Validate body shape minimally; return `400` on missing required fields.
- [ ] **Step 4: Run — expect PASS.**
- [ ] **Step 5: Commit** `feat: admin api routes`.

### Task 8: Cloudflare Access auth middleware

**Files:**
- Create: `src/worker/auth.ts`, `test/worker/auth.test.ts`
- Modify: `src/worker/app.ts` (apply middleware to `/api/admin/*`)

**Interfaces:**
- Produces: `accessGuard(env): MiddlewareHandler` that (1) **dev/test bypass:** if `env.ACCESS_TEAM_DOMAIN` is empty → allow; (2) else verify `Cf-Access-Jwt-Assertion` JWT via JWKS at `https://${ACCESS_TEAM_DOMAIN}/cdn-cgi/access/certs`, check `aud` includes `ACCESS_AUD` and `email === OWNER_EMAIL`; else `403`.
- Exposes a pure decision helper `isAuthorized(payload, ownerEmail, aud): boolean` for unit testing.

- [ ] **Step 1: Write the failing test** `test/worker/auth.test.ts` — unit-test `isAuthorized`:
```ts
import { describe, it, expect } from 'vitest';
import { isAuthorized } from '../../src/worker/auth';
it('allows owner email with matching aud', () => {
  expect(isAuthorized({ email: 'z54981220@gmail.com', aud: ['AUD1'] } as any, 'z54981220@gmail.com', 'AUD1')).toBe(true);
});
it('rejects other email', () => {
  expect(isAuthorized({ email: 'evil@x.com', aud: ['AUD1'] } as any, 'z54981220@gmail.com', 'AUD1')).toBe(false);
});
it('rejects wrong aud', () => {
  expect(isAuthorized({ email: 'z54981220@gmail.com', aud: ['OTHER'] } as any, 'z54981220@gmail.com', 'AUD1')).toBe(false);
});
```

- [ ] **Step 2: Run — expect FAIL.**
- [ ] **Step 3: Implement `src/worker/auth.ts`** using `jose.createRemoteJWKSet` + `jwtVerify`; export `isAuthorized` and `accessGuard`. Cache the JWKS set per `ACCESS_TEAM_DOMAIN` in a module-level `Map`.
```ts
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';
import type { MiddlewareHandler } from 'hono';
import type { Env } from './index';
export function isAuthorized(p: JWTPayload & { email?: string }, owner: string, aud: string): boolean {
  const auds = Array.isArray(p.aud) ? p.aud : p.aud ? [p.aud] : [];
  return p.email === owner && auds.includes(aud);
}
const jwks = new Map<string, ReturnType<typeof createRemoteJWKSet>>();
export function accessGuard(env: Env): MiddlewareHandler {
  return async (c, next) => {
    if (!env.ACCESS_TEAM_DOMAIN) return next(); // dev/test bypass
    const token = c.req.header('Cf-Access-Jwt-Assertion');
    if (!token) return c.json({ error: 'unauthenticated' }, 403);
    const url = `https://${env.ACCESS_TEAM_DOMAIN}/cdn-cgi/access/certs`;
    if (!jwks.has(url)) jwks.set(url, createRemoteJWKSet(new URL(url)));
    try {
      const { payload } = await jwtVerify(token, jwks.get(url)!, { issuer: `https://${env.ACCESS_TEAM_DOMAIN}` });
      if (!isAuthorized(payload as any, env.OWNER_EMAIL, env.ACCESS_AUD)) return c.json({ error: 'forbidden' }, 403);
      return next();
    } catch { return c.json({ error: 'invalid token' }, 403); }
  };
}
```
Apply in `app.ts`: `admin.use('*', (c, next) => accessGuard(c.env)(c, next));` before admin routes.

- [ ] **Step 4: Run — expect PASS** (unit) and `npm test` (admin routes still pass via empty-`ACCESS_TEAM_DOMAIN` bypass).
- [ ] **Step 5: Commit** `feat: cloudflare access auth guard for admin api`.

---

## Phase 4 — Public frontend

> Visual target: rebuild the existing artifact `meridian-cards.html`. **Before Task 9, the orchestrator captures a screenshot of the artifact** and references it for layout/colors. Tailwind classes approximate the artifact; exact palette/spacing tuned to the screenshot.

### Task 9: Client foundation (router, API client, layout)

**Files:**
- Create: `src/client/api.ts`, `src/client/components/Layout.tsx`, `src/client/components/RarityTag.tsx`, `test/client/api.test.ts`
- Modify: `src/client/App.tsx`, `src/client/main.tsx`

**Interfaces:**
- `api.ts` exports typed fetchers returning the DTOs: `fetchOverview()`, `fetchMissing()`, `fetchMarket()`, `fetchStats()`, plus admin `postCards`, `patchCard`, `postOpening`, `getOpenings`, `postTransaction`, `getTransactions`. All throw on non-2xx.
- `App.tsx` defines routes: `/` Overview, `/trade` TradeBoard, `/stats` Stats, `/admin/*` admin pages.

- [ ] **Step 1: Write the failing test** `test/client/api.test.ts` — mock `globalThis.fetch`, assert `fetchOverview()` calls `/api/overview` and returns parsed JSON; assert it throws on 500.
- [ ] **Step 2: Run — expect FAIL.**
- [ ] **Step 3: Implement `api.ts`** (a tiny `request<T>(path, init)` helper that does `fetch`, checks `res.ok`, returns `res.json() as Promise<T>`), `Layout` (nav bar with links to 收藏總覽 / 交易看板 / 統計), `RarityTag` (colored badge per rarity), and wire `react-router-dom` in `App.tsx`.
- [ ] **Step 4: Run — expect PASS.**
- [ ] **Step 5: Commit** `feat: client foundation (router, api client, layout)`.

### Task 10: Overview page (collection grid)

**Files:**
- Create: `src/client/pages/Overview.tsx`, `src/client/components/CollectionGrid.tsx`, `test/client/overview.test.tsx`

**Interfaces:**
- `CollectionGrid` props: `{ cells: OverviewCell[]; progress: SeriesProgress[] }`. Renders, per series, a character×rarity matrix; cell shows owned count; **owned===0 cells get a red highlight class** (`bg-red-100 text-red-600`); each series shows `collectedTypes/totalTypes` + a progress bar.

- [ ] **Step 1: Write the failing test** `test/client/overview.test.tsx`:
```tsx
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import CollectionGrid from '../../src/client/components/CollectionGrid';
const cells = [
  { catalogId:1, series:'KILLER', character:'Kirari', rarity:'R', owned:0 },
  { catalogId:2, series:'KILLER', character:'Kirari', rarity:'SR', owned:1 },
];
it('marks missing cells red and shows counts', () => {
  render(<CollectionGrid cells={cells as any} progress={[{series:'KILLER',collectedTypes:1,totalTypes:2}]} />);
  const zero = screen.getByTestId('cell-1');
  expect(zero.className).toMatch(/red/);
  expect(screen.getByText('1/2')).toBeInTheDocument();
});
```
- [ ] **Step 2: Run — expect FAIL.**
- [ ] **Step 3: Implement `CollectionGrid`** (group cells by series then character; render a table/grid; cell `data-testid={`cell-${catalogId}`}`; red class when `owned===0`) and `Overview` (calls `fetchOverview()` in `useEffect`, loading state, renders grid).
- [ ] **Step 4: Run — expect PASS.**
- [ ] **Step 5: Commit** `feat: collection overview grid`.

### Task 11: Trade board page

**Files:**
- Create: `src/client/pages/TradeBoard.tsx`, `src/client/components/ListingCard.tsx`, `test/client/tradeboard.test.tsx`

**Interfaces:**
- TradeBoard renders two sections: **想要 (Wishlist)** from `fetchMissing()`, and **可換/可售** from `fetchMarket()` (each `ListingCard` shows series/character/RarityTag, and either `askingPrice` 元 for `for_sale` or `wantInReturn` for `for_trade`).

- [ ] **Step 1: Write the failing test** — render TradeBoard with mocked `fetchMissing`/`fetchMarket`; assert a wishlist item and a `for_sale` price both appear.
- [ ] **Step 2: Run — expect FAIL.**
- [ ] **Step 3: Implement** `ListingCard` + `TradeBoard`.
- [ ] **Step 4: Run — expect PASS.**
- [ ] **Step 5: Commit** `feat: public trade board (wishlist + market)`.

### Task 12: Stats page

**Files:**
- Create: `src/client/pages/Stats.tsx`, `test/client/stats.test.tsx`

**Interfaces:**
- Stats renders pull-rate bars (CSS width = pct), per-rarity totals, and a per-character table from `fetchStats()`. No chart library (YAGNI).

- [ ] **Step 1: Write the failing test** — mocked `fetchStats`, assert a rarity row and a `%` value render.
- [ ] **Step 2: Run — expect FAIL.** **Step 3: Implement.** **Step 4: PASS.** **Step 5: Commit** `feat: public stats page`.

---

## Phase 5 — Admin frontend

> All admin pages live under `/admin`; Cloudflare Access gates this path at the edge (Task 16). The UI assumes the user is already authenticated.

### Task 13: Admin layout + Add cards (with opening)

**Files:**
- Create: `src/client/pages/admin/AdminLayout.tsx`, `src/client/pages/admin/AddCards.tsx`, `test/client/addcards.test.tsx`

**Interfaces:**
- AddCards: pick series → add rows of (character, rarity); optional "this is one opening" toggle with date + cost; submit calls `postCards({cards, opening?})`; on success clears the form and shows a confirmation.

- [ ] **Step 1: Write the failing test** — fill one card row, submit, assert `postCards` called with the right payload (mock the api module); assert success message.
- [ ] **Step 2: Run — expect FAIL.** **Step 3: Implement** AdminLayout (nav: 開箱新增 / 卡片管理 / 開箱成本 / 交易歷史) + AddCards form (character/rarity `<select>` from `catalog-def` constants re-exported to client, or a `/api/catalog` endpoint — prefer importing the shared constants to avoid an extra request). **Step 4: PASS.** **Step 5: Commit** `feat: admin add-cards with opening`.

### Task 14: Manage cards (filter, list, sell, trade)

**Files:**
- Create: `src/client/pages/admin/ManageCards.tsx`, `test/client/managecards.test.tsx`
- Maybe add: `GET /api/admin/cards?status=&series=` query endpoint (Modify `app.ts` + `queries.ts` `listCards`).

**Interfaces:**
- `listCards(db, filter): Promise<CardRow[]>` where `CardRow = { id, series, character, rarity, status, askingPrice, wantInReturn, note }`. ManageCards: filter controls; per row actions → 設為待售 (price prompt) / 設為待換 (want prompt) / 標記賣出 / 標記交換 (opens a small form → `postTransaction`).

- [ ] **Step 1: Write the failing test** (query) in `test/worker/queries-write.test.ts` extension: `listCards` returns duplicates flagged. **Step 2: FAIL. Step 3: implement `listCards` + endpoint.** **Step 4: PASS. Commit.**
- [ ] **Step 6: Write the failing test** (client) — render ManageCards with mocked list; click 標記賣出, fill price, assert `postTransaction({type:'sale',...})`. **Step 7: FAIL. Step 8: implement. Step 9: PASS. Step 10: Commit** `feat: admin manage cards (list/sell/trade)`.

### Task 15: Openings cost analysis + transaction history

**Files:**
- Create: `src/client/pages/admin/Openings.tsx`, `src/client/pages/admin/History.tsx`, `test/client/openings.test.tsx`

**Interfaces:**
- Openings: table from `getOpenings()` showing date, cost, cardCount, avgCost; a summary line (total spent, overall avg cost/card). History: table from `getTransactions()` (date, type, card, counterparty, price).

- [ ] **Step 1: Write the failing test** — mocked `getOpenings` returns one opening with avgCost; assert it renders and total-spent summary computes. **Step 2: FAIL. Step 3: implement both pages. Step 4: PASS. Step 5: Commit** `feat: admin openings cost analysis + history`.

---

## Phase 6 — Deploy & Cloudflare Access

### Task 16: Provision, deploy, and gate with Access

**Files:** Modify `wrangler.jsonc` (real `database_id`, `ACCESS_*` vars), create `docs/DEPLOY.md`.

- [ ] **Step 1: Create remote D1** — `npx wrangler d1 create meridian-cards`; paste `database_id` into `wrangler.jsonc`.
- [ ] **Step 2: Apply migrations remotely** — `npx wrangler d1 migrations apply meridian-cards --remote` (applies 0001 schema, 0002 catalog, 0003 cards). Verify: `npx wrangler d1 execute meridian-cards --remote --command "SELECT COUNT(*) FROM cards"` → 258.
- [ ] **Step 3: Build + deploy** — `npm run deploy`. Smoke-test `https://<worker-subdomain>/api/overview`.
- [ ] **Step 4: Attach custom domain** — add a route/custom domain in `wrangler.jsonc` or via dashboard to the owner's Cloudflare-hosted zone; redeploy.
- [ ] **Step 5: Configure Cloudflare Access** (dashboard, documented in `docs/DEPLOY.md`):
  - Zero Trust → Access → Applications → Add self-hosted app for `your-domain/admin` and a second for `your-domain/api/admin`.
  - Policy: Allow, Include → Emails → `z54981220@gmail.com`; identity provider Google (or One-time PIN).
  - Copy the Application **AUD** tag → set `ACCESS_AUD`; set `ACCESS_TEAM_DOMAIN` = `<team>.cloudflareaccess.com`. Redeploy so the in-Worker guard activates.
- [ ] **Step 6: Verify gating** — in an incognito window, `GET /api/overview` works (public); visiting `/admin` redirects to Access login; `POST /api/admin/cards` without an Access token returns 403.
- [ ] **Step 7: Commit** `chore: production deploy config + access setup docs`.

---

## Self-Review (completed by plan author)

**Spec coverage:**
- §4 access model → Task 8 (auth) + Task 16 (Access). §5 architecture → Tasks 1,6. §6 data model → Task 2 (schema) + Tasks 4–5 (queries). §6.6 status machine → Task 5 (`recordTransaction`). §6.7 derived stats → Task 4. §7.1 public features → Tasks 10–12. §7.2 admin features → Tasks 13–15. §7.3 API → Tasks 6–7. §8 Access → Tasks 8,16. §9 import → Task 3. §10 deploy → Task 16. §11 v1 scope → all; non-goals excluded. §12 TWD-only/visual → Global Constraints + Phase 4 note.
- No spec requirement is left without a task.

**Placeholder scan:** No "TBD/handle edge cases/etc." Frontend Tasks 11–15 give concrete props, behaviors, and test assertions rather than full JSX — acceptable because the interface contracts and test cases are explicit; styling is intentionally tuned to the artifact screenshot at execution.

**Type consistency:** DTOs defined once in `src/shared/types.ts` (Task 4) and reused by queries, routes, and client. Mutation DTOs added in Task 5. Function names are stable across tasks (`getOverview`, `addCards`, `recordTransaction`, `accessGuard`, `isAuthorized`).
