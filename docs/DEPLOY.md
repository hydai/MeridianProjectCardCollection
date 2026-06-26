# Deployment & Cloudflare Access setup

This deploys the worker (API + static SPA) to Cloudflare and locks the admin
behind Cloudflare Access so only the owner can edit. Public reads stay open.

## Prerequisites

- A Cloudflare account with your domain already onboarded (it is).
- `wrangler` authenticated: `npx wrangler login` (opens a browser to authorize).
- Zero Trust enabled on the account (free plan is fine).

## 1. Create the production D1 database

```bash
npx wrangler d1 create meridian-cards
```

Copy the printed `database_id` into `wrangler.jsonc` (replace the
`00000000-...` placeholder under `d1_databases`).

## 2. Apply schema + seed to the remote database (one time)

```bash
npx wrangler d1 migrations apply meridian-cards --remote
```

This runs `0001_init` (schema), `0002_seed_catalog` (180 types), and
`0003_seed_cards` (the 258-card import). Verify:

```bash
npx wrangler d1 execute meridian-cards --remote --command "SELECT COUNT(*) FROM cards"
# expect 258
```

> The collection is now in production. From here on, edit via the `/admin`
> UI — never re-run `0003`, or it would duplicate the import.

## 3. Attach your custom domain

Add a custom domain route to `wrangler.jsonc` (replace `cards.example.com`):

```jsonc
"routes": [{ "pattern": "cards.example.com", "custom_domain": true }]
```

## 4. First deploy

```bash
npm run deploy   # vite build + wrangler deploy
```

Smoke-test: `https://cards.example.com/api/overview` should return 180 cells,
and the root should load the collection viewer.

## 5. Configure Cloudflare Access (gate the admin)

In the Cloudflare dashboard → **Zero Trust → Access → Applications**, add a
**Self-hosted** application. Create **two** apps (or one app with two paths):

| Application domain | Purpose |
| --- | --- |
| `cards.example.com/admin` | the admin SPA |
| `cards.example.com/api/admin` | the write API |

For each, add a policy:

- **Action:** Allow
- **Include → Emails →** `z54981220@gmail.com`
- **Identity provider:** Google (or One-time PIN to that email)

Copy each application's **Application Audience (AUD) tag** (Overview tab). If you
made two apps, give them the same AUD by using one app with both paths, or set
`ACCESS_AUD` to the admin app's AUD and protect both paths under it.

## 6. Wire the in-Worker guard (defense in depth)

Set these in `wrangler.jsonc` `vars` (or as secrets) and redeploy:

```jsonc
"vars": {
  "OWNER_EMAIL": "z54981220@gmail.com",
  "ACCESS_TEAM_DOMAIN": "<your-team>.cloudflareaccess.com",
  "ACCESS_AUD": "<the AUD tag from step 5>"
}
```

```bash
npm run deploy
```

When `ACCESS_TEAM_DOMAIN` is set, the worker verifies the Access JWT on every
`/api/admin/*` request and rejects anything not signed for your email + AUD.

## 7. Verify the gate

- Public: `https://cards.example.com/` and `/api/overview` load without login.
- Admin: visiting `/admin` redirects to the Access login; only your Google
  email gets in.
- Direct API: `curl -X POST https://cards.example.com/api/admin/cards` without
  an Access token returns **403**.

## Updating later

- Code changes: `npm run deploy`.
- New series (e.g. MP 5TH): add it to `seed/catalog-def.ts`, run
  `npm run seed:gen`, create a new migration for the added catalog rows, and
  `wrangler d1 migrations apply meridian-cards --remote`.
- The local dev DB and the remote DB are separate; `--local` vs `--remote`.
