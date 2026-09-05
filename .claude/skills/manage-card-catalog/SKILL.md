---
name: manage-card-catalog
description: Use when adding a new card series / set / expansion (e.g. an "MP 5TH"), or a new character to a series, in the Meridian card collection — i.e. introducing new card types into the catalog. Not for adding owned cards (use the /admin UI) or fixing the original import.
---

# Manage Card Catalog (add a series or character)

## Overview

The live card universe is authoritative in **D1**: **`series`** stores names,
volume numbers, display order, and active flags; **`card_catalog`** stores card
types and their ordering. `seed/catalog-def.ts` (including `VOLUMES`) is only the
historical import and test fixtures, not desired runtime state.

| Consumer | Reads from | Updated by |
|---|---|---|
| Public views (collection/grid/trade) | **live D1** `series` + `card_catalog` | series manager or migration, then reload |
| Admin controls (`AddCards`, `ManageCards`, `SeriesManager`) | **live D1** `/api/catalog` | series manager or migration, then reload |

The original 258 physical cards (`cards` table, seeded by `0003`) must never be
re-imported. Catalog migrations never touch `cards`; compare its current count
before and after rather than assuming the live collection still has 258 cards.

## When to use

- Adding a new **series** (e.g. `MP 5TH`) and its characters.
- Adding a **character** to an existing series.

Not for: adding cards the owner pulled/bought (that's the `/admin` → 開箱新增 UI), or editing the original import.

## Preferred procedure

Use `/admin` → **系列管理** to create a series or edit its volume, ordered
characters, and selected rarities. This writes D1 directly. Both public views
and admin controls use the resulting live catalog; reload to verify. No seed
edit, generated migration, or frontend deploy is needed for this path.

## Scripted additive migration

Use this alternative when the addition should be versioned as a migration.

1. **Create an explicit additions JSON file**, not a copy of the full catalog.
   It is a non-empty array of objects with only these fields:

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

   This example is illustrative. Use the approved series, characters, and
   rarities. Each entry adds only its character × rarity cross-product.
   For an existing series, use its exact current name and volume and list only
   the additions. Names/characters are trimmed and unique; rarities are unique
   and canonicalized to R / SR / SSR / UR / EX. EX is explicit and requires
   volume 3 or later. Do not edit `seed/catalog-def.ts` or `VOLUMES`.
2. **`npm run catalog:sync -- catalog-additions.json`** writes the next
   `migrations/NNNN_sync_catalog.sql`. Review it: it inserts missing series
   metadata (including volume) before card types, appends new display orders,
   and never updates existing rows or touches physical cards.
3. **Apply + verify locally**, recording both counts before and after:
   ```bash
   npx wrangler d1 execute meridian-cards --local --command \
     "SELECT (SELECT COUNT(*) FROM card_catalog) catalog, (SELECT COUNT(*) FROM cards) cards"
   npx wrangler d1 migrations apply meridian-cards --local
   npx wrangler d1 execute meridian-cards --local --command \
     "SELECT (SELECT COUNT(*) FROM card_catalog) catalog, (SELECT COUNT(*) FROM cards) cards"
   # catalog grows only by requested missing types; cards UNCHANGED
   ```
4. **Run the targeted worker tests** in [docs/DEPLOY.md](../../../docs/DEPLOY.md#scripted-catalog-additions).
   Verify `/api/catalog`, `/api/overview`, and reloaded admin controls show the
   intended volume/rarities and new unowned types.
5. **Commit** the reviewed additions JSON and new migration.
6. **Production application requires authorization and a verified backup**
   (see `docs/BACKUP.md`), followed by a live-catalog conflict check and
   `npx wrangler d1 migrations apply meridian-cards --remote`.
   Reload public/admin views to verify; no catalog-only frontend deploy is needed.

## Runtime conflict contract

- Existing volume, series order, active flags, catalog IDs, and catalog order
  are preserved. Inactive series are not reactivated.
- A volume mismatch, ASCII case-only spelling conflict, or existing EX types
  below volume 3 aborts the entire migration with `catalog_sync_runtime_conflict`.
  Inspect D1 and revise the unapplied input/migration; do not override runtime
  metadata from the seed.
- Omitted types stay untouched, including intentional runtime deletions.
  **Explicitly including a removed type requests its restoration.** Use deltas,
  never a stale snapshot, and never regenerate all prior additions.
- Reapplying unchanged additions to unchanged D1 is a no-op. Applied migrations
  remain immutable; future changes use a new input and migration.

## Quick reference

| Step | Command |
|---|---|
| Generate migration | `npm run catalog:sync -- catalog-additions.json` |
| Apply local / remote | `npx wrangler d1 migrations apply meridian-cards --local` / `--remote` |
| Test | targeted worker command in `docs/DEPLOY.md` |

## Common mistakes

- **Running `npm run seed:gen` or editing `seed/catalog-def.ts`.** These describe
  the original import, not the current catalog. Use the series manager or an
  explicit additions file instead.
- **Editing `0001`–`0003` or any applied migration.** They're tracked by filename and won't re-run remotely, but they corrupt fresh/test applies. Only ever ADD a new migration.
- **Syncing without explicit input.** The command fails rather than resurrecting
  removed types or overwriting live metadata by replaying a historical catalog.
- **Adding owned cards before applying the catalog addition.** The type must
  already exist in D1 or the API returns `unknown card type`.
- **Editing `seed/cards.ts`.** A new series has zero owned cards by design — it should render as all-missing. Owned cards are added through `/admin`.
- **Relying on a frontend rebuild for catalog visibility.** Both consumers read
  live D1; verify the migration included `series.volume_number`, then reload.
