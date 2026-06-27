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

- **Collection overview** — a series × character × rarity grid showing owned
  counts, per-series completion %, and missing cards highlighted.
- **Trade board** — a "want" list (auto-computed missing cards) and a
  "for trade / for sale" list with asking prices or desired cards.
- **Public stats** — rarity distribution, per-character counts, and pull rates.

### Admin (Cloudflare Access, owner only)

- **Add from openings** — quickly log multiple cards from a pack opening;
  optionally group them under an opening event (date + cost).
- **Card management** — search/filter by series, character, rarity, and status;
  change status; set an asking price or a desired trade; mark cards sold/traded
  (writes history and removes them from active inventory).
- **Pending trades** — track reserved / in-progress trades, with
  reservation-aware duplicate flags.
- **Cost analysis & transaction history** — *private* (owner only): per-opening
  average cost, per-UR cost, and the full transaction log.

## Tech stack

| Layer    | Choice                                                                       |
| -------- | ---------------------------------------------------------------------------- |
| Runtime  | Cloudflare Workers (a single Worker)                                          |
| API      | [Hono](https://hono.dev/)                                                     |
| Database | Cloudflare D1 (SQLite) — all stats computed live via SQL, no derived tables  |
| Frontend | React + React Router, bundled by Vite, served via Workers Static Assets      |
| Auth     | Cloudflare Access (JWT verified in-Worker with [jose](https://github.com/panva/jose)) |
| Tooling  | Wrangler, Biome (lint/format), Vitest (+ `@cloudflare/vitest-pool-workers`)  |

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
            │                openings / transactions / pending_trades        │
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
migrations/      D1 schema + seed (0001 schema, 0002/0003 seed, 0004 pending trades)
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
3. Set your custom domain route in `wrangler.jsonc`.
4. `npm run deploy` (Vite build + `wrangler deploy`).
5. Create a Cloudflare Access application over `/admin*` and `/api/admin/*`
   allowing only the owner's email, then set `OWNER_EMAIL` /
   `ACCESS_TEAM_DOMAIN` / `ACCESS_AUD` in `wrangler.jsonc` and redeploy.

## Adding cards

- **New owned cards:** use the `/admin` UI. Never re-run the seed migration — it
  would duplicate the original import.
- **New series or character** (e.g. an "MP 5TH"): edit `seed/catalog-def.ts`,
  then `npm run catalog:sync` to generate an additive migration. (Claude Code
  users: the bundled `manage-card-catalog` skill walks through this.)

## License

[Apache License 2.0](LICENSE) © 2026 hydai
