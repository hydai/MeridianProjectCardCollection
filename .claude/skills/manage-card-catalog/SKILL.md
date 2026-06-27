---
name: manage-card-catalog
description: Use when adding a new card series / set / expansion (e.g. an "MP 5TH"), or a new character to a series, in the Meridian card collection — i.e. introducing new card types into the catalog. Not for adding owned cards (use the /admin UI) or fixing the original import.
---

# Manage Card Catalog (add a series or character)

## Overview

The card universe (which card types exist) lives in **`seed/catalog-def.ts`** and is stored in D1's **`card_catalog`** table. Two consumers read it **differently**, so a change must reach both:

| Consumer | Reads from | Updated by |
|---|---|---|
| Public views (collection/grid/trade) | **live D1** `card_catalog` | applying the migration |
| Admin dropdowns (`AddCards`, `ManageCards`) | **`catalog-def.ts`**, bundled into client JS at build | `npm run deploy` |

The owner's 258 physical cards (`cards` table, seeded by `0003`) must never be re-imported. The sync migration is purely additive and never touches `cards`.

## When to use

- Adding a new **series** (e.g. `MP 5TH`) and its characters.
- Adding a **character** to an existing series.

Not for: adding cards the owner pulled/bought (that's the `/admin` → 開箱新增 UI), or editing the original import.

## Procedure

1. **Edit `seed/catalog-def.ts`** — the only source you hand-edit:
   - New series: add an entry to `SERIES_CHARACTERS` **at the end**, e.g.
     `"MP 5TH": [...COMMON_CHARACTERS, "KSP"]` (omit `KSP` if it's not in that series).
   - New character: **append** it to that series's character list.
   - New series: ALSO assign it to a 彈 in `VOLUMES` — append the series name to an
     existing volume's `series`, or add a new `{ label: "Vol.N", series: [...] }`.
     The grid's volume filter is built from this. A consistency test fails if a
     catalog series isn't assigned to exactly one volume.
2. **`npm run catalog:sync`** — writes the next migration `migrations/NNNN_sync_catalog.sql`. It is an idempotent UPSERT of the full catalog: inserts new types, corrects `sort_order`, touches nothing else. It does **not** overwrite `0002`/`0003`.
3. **Apply + verify locally:**
   ```bash
   npx wrangler d1 migrations apply meridian-cards --local
   npx wrangler d1 execute meridian-cards --local --command \
     "SELECT (SELECT COUNT(*) FROM card_catalog) catalog, (SELECT COUNT(*) FROM cards) cards"
   # catalog grew by 4×(new types); cards UNCHANGED (258)
   ```
4. **`npm test`** — passes automatically; the counts derive from `catalog-def.ts`.
5. **Commit** `seed/catalog-def.ts` + the new migration (e.g. `feat: add <series> to catalog`).
6. **Apply to production:** `npx wrangler d1 migrations apply meridian-cards --remote`.
   The public site reflects it immediately (it reads live D1).
7. **`npm run deploy`** — so the admin dropdowns (bundled from `catalog-def.ts`) include the new series/character.
8. **Verify** on `mpcards.oshi.tw`: the new types show as missing in the public grid; the `/admin` dropdowns offer them.

## Quick reference

| Step | Command |
|---|---|
| Generate migration | `npm run catalog:sync` |
| Apply local / remote | `npx wrangler d1 migrations apply meridian-cards --local` / `--remote` |
| Test | `npm test` |
| Deploy | `npm run deploy` |

## Common mistakes

- **Running `npm run seed:gen`.** It regenerates `0002`/`0003`; on any fresh apply (tests, a clean DB, CI) the new types get inserted twice → `UNIQUE` violation → failures. Use `catalog:sync` (additive) instead.
- **Editing `0001`–`0003` or any applied migration.** They're tracked by filename and won't re-run remotely, but they corrupt fresh/test applies. Only ever ADD a new migration.
- **Skipping `npm run deploy`.** The migration updates the public views but NOT the admin dropdowns (those are compiled from `catalog-def.ts`).
- **Deploying before applying the remote migration.** Adding a card of the new type before its `card_catalog` row exists throws `unknown card type`. Migrate remote, then deploy.
- **Editing `seed/cards.ts`.** A new series has zero owned cards by design — it should render as all-missing. Owned cards are added through `/admin`.
- **Forgetting to add a new series to `VOLUMES`.** It falls into the grid's "其他"
  filter row and `npm test` goes red (the consistency test). Assign it to a 彈.
