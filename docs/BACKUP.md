# Versioned backups

The backup CLI creates a portable, checksummed snapshot of the collection. It
uses Cloudflare's [D1 SQL export][d1-export] and downloads every optimized
card-image object referenced by `catalog_media`. It never asks the Worker to
buffer the database or image files in memory.

## Snapshot contents

Each snapshot is a directory with this layout:

```text
meridian-cards-v1-<UTC timestamp>/
  manifest.json
  database/
    schema.sql
    data.sql
  reports/
    catalog.csv
    inventory.csv
    activity.csv
  media/
    <object-key SHA-256>.webp
```

- `database/schema.sql` and `database/data.sql` are the authoritative restore
  source. They are separate so foreign-key dependencies restore correctly.
- The CSV files are UTF-8 inspection copies for humans, not restore inputs.
- `media/` contains the retained 320px and 960px WebP variants. Upload originals
  are not included because the application never stores them.
- `manifest.json` records the backup format version, UUID, UTC time, app and Git
  version, latest migration, source resources, row counts, R2 object-key
  mappings, byte sizes, and SHA-256 checksums.

Format version `1` describes the snapshot contract, not the application release.
Do not edit files inside a completed snapshot.

## Create a production snapshot

Authenticate Wrangler first, then run:

```bash
npm run backup:create -- --remote
```

The default source resources are `meridian-cards` and
`meridian-card-images`. The completed directory is written under `backups/` and
printed at the end. To choose another destination or source:

```bash
npm run backup:create -- --remote \
  --database meridian-cards \
  --bucket meridian-card-images \
  --output /private/backup-volume/meridian-cards-2026-09-02
```

Avoid owner/admin edits while a snapshot is running. If referenced media
changes, an object is missing, an export fails, or final verification fails, the
command removes its hidden partial directory and does not publish a completed
snapshot.

For a local-development snapshot, select local storage explicitly:

```bash
npm run backup:create -- --local
```

The CLI deliberately requires either `--remote` or `--local`; it never guesses
which data to read.

## Verify a snapshot

Verification rejects unsupported formats, unsafe paths, symbolic links,
undeclared files, size mismatches, and checksum mismatches:

```bash
npm run backup:verify -- <printed-backup-path>
```

Run verification after copying a snapshot and periodically for long-term
archives. SHA-256 detects corruption or a payload changed without a matching
manifest update; it is not a cryptographic signature, so the storage location
must still be access-controlled.

## Store and retain snapshots

Snapshots contain private notes, counterparties, amounts, and collection data.
New directories and files are created with owner-only permissions, and
`backups/` is gitignored, but neither of those is an off-device backup.

After verification, copy the whole directory to at least one private,
access-controlled or encrypted location on another device/provider. Keep the
directory intact. Retention and remote upload are intentionally manual in
format v1, so this tool never deletes an older recovery point or silently adds
storage cost.

Cloudflare [D1 Time Travel][d1-time-travel] remains useful for short-term
database recovery, but it does not include R2 images or provide an off-platform
archive. Use it as a complement to these snapshots.

## Restore without overwriting production

Restore is intentionally a new-resource workflow. Create a new D1 database and
a new, empty R2 bucket:

```bash
npx wrangler d1 create meridian-cards-restore-20260902
npx wrangler r2 bucket create meridian-card-images-restore-20260902
```

Then restore the snapshot:

```bash
npm run backup:restore -- backups/<snapshot-directory> \
  --remote \
  --database meridian-cards-restore-20260902 \
  --bucket meridian-card-images-restore-20260902 \
  --confirm-new-targets
```

The command verifies the snapshot first, refuses either original source name,
requires an empty target D1 database, restores schema before data, uploads the
media objects, and compares all application table counts with the manifest.
The target R2 bucket must be newly created and empty.

Use `--config <temporary-wrangler-config>` when rehearsing against isolated
bindings. If any restore step fails, use another fresh database and bucket for
the retry. Do not repoint production bindings until the restored application
has passed a smoke test. Switching bindings is a separate, explicit deployment
step; the restore command never modifies `wrangler.jsonc` or production.

[d1-export]: https://developers.cloudflare.com/d1/reference/import-export-data/
[d1-time-travel]: https://developers.cloudflare.com/d1/reference/time-travel/
