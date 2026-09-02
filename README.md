# Meridian Project Card Collection

**Live demo: [mpcards.oshi.tw](https://mpcards.oshi.tw/)**

A self-hosted tracker for a Meridian Project VTuber gacha-card collection, running
entirely on Cloudflare Workers + D1. The collection is **publicly viewable**
(progress, stats, and a trade board), while **only the owner can edit** —
authentication is delegated to Cloudflare Access.

It replaces an "edit a Google Sheet, then copy-paste into a static page" workflow
with a live site you edit directly.

## Features

### Public (no login, read-only)

- **Collection progress guide** — start with overall, per-character, and
  per-volume completion, then expand into series and rarity details; a full
  series × character × rarity grid remains available for exhaustive inventory.
- **Trade board** — an explicit "want" list that tracks target quantities after
  pending purchases and incoming trades, plus a "for trade / for sale" list with
  asking prices or desired cards.
- **Shareable exchange announcements** — publish selected outgoing cards and
  explicit Wants as an immutable snapshot at a stable `/exchange/:publicId`
  URL. Live availability changes are marked as stale; closed announcements leave
  the public list but remain readable at their original URL.
- **Public stats** — rarity distribution, per-character counts, and pull rates.

### Admin (Cloudflare Access, owner only)

- **Quick pack opening** — use the original click-once-per-card flow to record
  one physical pack with its volume, automatic pack number, date, and optional
  cost; a pack may contain cards from different series in the same volume.
- **Batch collection workbench** — enter quantities in a character × series
  matrix across rarity tabs, review the whole batch, then record it atomically
  as one pack opening, received purchase, or other acquisition. Packs are
  numbered per volume; purchase totals are allocated to the physical cards.
- **Card management** — search/filter by series, character, rarity, and status;
  open a card-slot workspace to set explicit Want targets, inspect incoming and
  owned quantities, review scoped history, or operate physical copies. The same
  workspace records already-received purchases, sales, trades, gifts, and catalog
  corrections with their date, counterparty, amount, and note. **保留 (hold)**
  locks a duplicate so it stays owned but never shows up in the auto-computed
  trade list.
- **Catalog image queue** — every catalog slot has an owner-only missing-image
  workflow. Upload, replace, or remove a shared front image without attaching
  it to one physical copy; originals stay private in R2 and are served through
  stable, revisioned Worker URLs.
- **Pending trades** — track reserved / in-progress trades, with
  reservation-aware duplicate flags. A published exchange announcement can
  prefill an adjustable private reservation without closing the announcement;
  the pending row and its lifecycle activity keep a link to the source post.
- **Pending purchases** — record ordered cards without counting them as owned;
  confirm receipt to add them to inventory, or cancel if the seller never ships.
- **Exchange announcement drafts** — compose, edit, and delete private drafts,
  publish a fixed public snapshot, copy its share URL, and close it without
  erasing its history. Published posts show total and active reservation counts.
- **Unified activity stream** — every acquisition, card adjustment or catalog
  correction, hold, reservation, purchase, sale, trade, and gift appears in one
  append-only audit trail; untouched direct acquisitions and openings can be
  safely undone without erasing history.
- **Cost analysis & transaction history** — *private* (owner only) reports kept
  alongside the activity stream for per-opening and completed-trade analysis.

The public viewer is grouped by **收藏 / 盤點 / 交易**. The owner workspace is
grouped by **收藏 / 交易 / 痕跡**, so view modes and reports no longer compete
with day-to-day actions in one flat navigation bar.

## Tech stack

| Layer    | Choice                                                                       |
| -------- | ---------------------------------------------------------------------------- |
| Runtime  | Cloudflare Workers (a single Worker)                                          |
| API      | [Hono](https://hono.dev/)                                                     |
| Database | Cloudflare D1 (SQLite) — all stats computed live via SQL, no derived tables  |
| Media    | Cloudflare R2 — private catalog-image originals, streamed through the Worker |
| Frontend | React + React Router + Tailwind v4 + shadcn/ui, bundled by Vite, served via Workers Static Assets |
| Auth     | Cloudflare Access (JWT verified in-Worker with [jose](https://github.com/panva/jose)) |
| Tooling  | Wrangler, Biome (lint/format), Vitest (+ `@cloudflare/vitest-pool-workers`)  |

The UI is built with **Tailwind CSS v4 + shadcn/ui** (Radix primitives copied
into `src/client/components/ui/`), themed to a bespoke dark-gold "editorial"
palette via a CSS token bridge in `src/client/index.css` — dark mode only, no
theme switcher.

## Architecture

```
            ┌───────────────────────── Cloudflare ─────────────────────────┐
 Visitor ──►│  Worker (Hono)                                                │
 (public)   │   ├─ Static frontend (Workers Static Assets, React SPA)       │
            │   ├─ Public API   GET /api/*           ← anyone can read       │
 Owner ────►│   └─ Admin API    /api/admin/*         ← gated by Access       │
 (Access)   │                   /admin (admin SPA)   ← gated by Access       │
            │              │                                                 │
            │              ▼                                                 │
            │   D1 (SQLite): card_catalog / series / cards /                 │
            │                openings / transactions / reservations /        │
            │                trade_posts / activity_events + event lines      │
            │   R2: private catalog card-image originals                     │
            └───────────────────────────────────────────────────────────────┘
```

Defense in depth: even though Cloudflare Access gates the admin paths at the
edge, the Worker independently verifies the `Cf-Access-Jwt-Assertion` JWT
(issuer + audience + owner email) and **fails closed** if Access is not
configured — a deployed Worker with no Access config locks admin entirely.

## Project layout

```
src/
  client/        React SPA — public viewer + /admin
  worker/        Hono app, Cloudflare Access guard, D1 queries
  shared/        Types shared by client and worker
  migrations/      D1 schema, seed data, and additive feature migrations
seed/            Source-of-truth card catalog + owned-card list (TypeScript)
scripts/         Seed generation + catalog sync
docs/DEPLOY.md   Full deployment + Cloudflare Access setup guide
```

## Local development

Prerequisites: Node.js, plus `wrangler` (installed as a dev dependency).

```bash
npm install
npm run dev          # Vite dev server (frontend only)
npm run preview      # wrangler dev — Worker + local D1 + built assets
```

Local dev bypasses Cloudflare Access via `ALLOW_INSECURE_ADMIN=1` in a
gitignored `.dev.vars` file, so you can exercise the admin UI without Access:

```bash
echo 'ALLOW_INSECURE_ADMIN=1' > .dev.vars
```

> This flag is honored **only** locally and in tests. It is never placed in
> `wrangler.jsonc`, so a deployed Worker can never set it — production always
> requires Access.

### Quality checks

```bash
npm test             # worker + client test suites (Vitest)
npm run typecheck    # tsc across client / worker / node configs
npm run lint         # Biome
npm run format       # Biome --write
```

## Deployment

See **[docs/DEPLOY.md](docs/DEPLOY.md)** for the full walkthrough. In short:

1. `npx wrangler d1 create meridian-cards` → put the printed `database_id` into `wrangler.jsonc`.
2. `npx wrangler d1 migrations apply meridian-cards --remote` (applies schema + seed).
3. `npx wrangler r2 bucket create meridian-card-images` (one-time private image bucket).
4. Set your custom domain route in `wrangler.jsonc`.
5. `npm run deploy` (Vite build + `wrangler deploy`).
6. Create a Cloudflare Access application over `/admin*` and `/api/admin/*`
   allowing only the owner's email, then set `OWNER_EMAIL` /
   `ACCESS_TEAM_DOMAIN` / `ACCESS_AUD` in `wrangler.jsonc` and redeploy.

## Adding cards

- **New owned cards:** use the `/admin` UI. Never re-run the seed migration — it
  would duplicate the original import.
- **Card images:** use **收藏 → 卡圖資料**. JPEG, PNG, WebP, and AVIF files up
  to 15 MB are accepted; one front image is shared by the whole catalog slot.
- **New series or character** (e.g. an "MP 5TH"): edit `seed/catalog-def.ts`,
  then `npm run catalog:sync` to generate an additive migration. (Claude Code
  users: the bundled `manage-card-catalog` skill walks through this.)

## License

[Apache License 2.0](LICENSE) © 2026 hydai
