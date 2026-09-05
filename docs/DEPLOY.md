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

## 3. Create the private card-image bucket

Create the R2 bucket named by the `CARD_IMAGES` binding in `wrangler.jsonc`:

```bash
npx wrangler r2 bucket create meridian-card-images
```

The bucket remains private. The Images binding in `wrangler.jsonc` converts each
upload into fixed 320px and 960px WebP variants; only those optimized files are
stored. The Worker streams them through `/api/catalog/:id/image`, while upload,
replacement, and deletion stay behind the owner-only `/api/admin/*` gate.

## 4. Attach your custom domain

Add a custom domain route to `wrangler.jsonc` (replace `cards.example.com`):

```jsonc
"routes": [{ "pattern": "cards.example.com", "custom_domain": true }]
```

## 5. First deploy

```bash
npm run deploy   # vite build + wrangler deploy
```

Smoke-test: `https://cards.example.com/api/overview` should return 180 cells,
and the root should load the collection viewer.

## 6. Configure Cloudflare Access (gate the admin)

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

## 7. Wire the in-Worker guard (defense in depth)

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

## 8. Verify the gate

- Public: `https://cards.example.com/` and `/api/overview` load without login.
- Admin: visiting `/admin` redirects to the Access login; only your Google
  email gets in.
- Direct API: `curl -X POST https://cards.example.com/api/admin/cards` without
  an Access token returns **403**.

## Updating later

- Code changes: `npm run deploy`.
- Before a production schema or data migration, create and verify a versioned
  snapshot with `npm run backup:create -- --remote`. Keep its printed directory
  intact and follow [BACKUP.md](BACKUP.md) for verification and restore.
- Schema changes: after the backup passes, run
  `npx wrangler d1 migrations apply meridian-cards --remote` before deploying
  the code that depends on them.
- **New series or character:** use `/admin` → **系列管理**, or the scripted
  additions workflow below. Both public views and admin controls read live D1;
  catalog-only changes need a reload, not a frontend rebuild or deploy.
- The local dev DB and the remote DB are separate; `--local` vs `--remote`.

## Scripted catalog additions

D1's `series` and `card_catalog` tables are the runtime authority.
`seed/catalog-def.ts` and `VOLUMES` describe the historical import and test
fixtures, not desired production state. Never regenerate `0002`/`0003`, edit
applied migrations, or change `seed/cards.ts` to extend the catalog.

1. Create a JSON file containing **only the additions you intend to make**.
   Each entry specifies a name, positive integer volume, ordered characters,
   and selected rarities. For example (illustrative, not a catalog definition):

   ```json
   [
     {
       "name": "EXAMPLE SERIES",
       "volume": 3,
       "characters": ["Example Character"],
       "rarities": ["R", "SR", "SSR", "UR", "EX"]
     }
   ]
   ```

   An entry adds its character × rarity cross-product. To add characters or
   rarities to an existing series, use its exact current name and volume and
   list only the intended types. Requested rarities are canonicalized to
   R / SR / SSR / UR / EX before inserting new rows; existing rows keep their
   ordering. EX requires volume 3 or later and is not implicitly added.
   Names and characters are trimmed and must be unique.

2. Generate and review the migration:

   ```bash
   npm run catalog:sync -- catalog-additions.json
   ```

   The command requires explicit input; running it without a file fails rather
   than replaying the seed. It writes the next `migrations/NNNN_sync_catalog.sql`
   and never overwrites an existing file. New series get `volume_number`,
   `is_active = 1`, and an appended `sort_order`, followed by their catalog rows.

   **Conflict contract:** existing series metadata (volume, order, active flag),
   catalog IDs, and catalog ordering are never overwritten. New rows append to
   the live order. A different existing volume or an ASCII case-only spelling
   conflict (or existing EX types below volume 3) aborts the entire migration
   with `catalog_sync_runtime_conflict`;
   inspect D1 and revise the unapplied addition instead of forcing stale data.
   Existing inactive series stay inactive. Omitted types are not recreated,
   changed, or deleted. Explicitly listing a previously removed type **does**
   request its restoration; never supply a full seed or old catalog snapshot.
   Reapplying unchanged additions to unchanged D1 is a no-op. Once applied,
   keep that migration immutable and use a fresh delta for later changes.

3. Record local catalog/card counts, apply locally, and compare them:

   ```bash
   npx wrangler d1 execute meridian-cards --local --command \
     "SELECT (SELECT COUNT(*) FROM card_catalog) catalog, (SELECT COUNT(*) FROM cards) cards"
   npx wrangler d1 migrations apply meridian-cards --local
   npx wrangler d1 execute meridian-cards --local --command \
     "SELECT (SELECT COUNT(*) FROM card_catalog) catalog, (SELECT COUNT(*) FROM cards) cards"
   npm run test:worker -- test/worker/catalog-sync.test.ts test/worker/seed.test.ts test/worker/seed-applied.test.ts test/worker/queries-read.test.ts test/worker/api-public.test.ts test/worker/flexible-management.test.ts
   ```

   Only the requested missing catalog types should be added; physical `cards`
   must be unchanged. Verify `/api/catalog` and `/api/overview` include the
   series with the intended volume and rarities, and reload the admin controls.

4. Commit the reviewed additions JSON and generated migration. Before any
   authorized production application, create and verify the backup described
   above, check the live catalog for conflicts, then apply migrations remotely.
   Do not run `seed:gen` or re-import owned cards. No redeploy is needed for
   catalog-only additions.
