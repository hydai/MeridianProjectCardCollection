import { execFile } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import {
  chmod,
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { basename, dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  BACKUP_DATABASE_DATA_PATH,
  BACKUP_DATABASE_SCHEMA_PATH,
  BACKUP_FORMAT,
  BACKUP_FORMAT_VERSION,
  BACKUP_MANIFEST_PATH,
  BACKUP_TABLES,
  type BackupFileRecord,
  type BackupManifestV1,
  type BackupMediaRecord,
  type BackupMediaVariant,
  type BackupMode,
  type BackupReportRecord,
  type BackupTable,
  type CsvRow,
  assertNewRestoreTargets,
  backupFilePath,
  describeBackupFile,
  rowsToCsv,
  verifyBackupDirectory,
} from "./backup-format";

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const WRANGLER_BIN = resolve(
  PROJECT_ROOT,
  "node_modules/wrangler/bin/wrangler.js",
);
const DEFAULT_DATABASE = "meridian-cards";
const DEFAULT_BUCKET = "meridian-card-images";
const MAX_COMMAND_OUTPUT_BYTES = 32 * 1024 * 1024;
const MEDIA_CONCURRENCY = 4;

// SQL exports and downloaded collection data must never inherit permissive
// default modes from the operator's shell.
process.umask(0o077);

function mediaConcurrency(mode: BackupMode) {
  // Wrangler's local R2 emulator stores objects in SQLite and cannot reliably
  // serve multiple CLI processes at once. Remote R2 does not have that limit.
  return mode === "local" ? 1 : MEDIA_CONCURRENCY;
}

function displayPath(path: string) {
  const projectRelative = relative(PROJECT_ROOT, path);
  if (
    projectRelative.length === 0 ||
    projectRelative === ".." ||
    projectRelative.startsWith("../") ||
    projectRelative.startsWith("..\\")
  ) {
    return path;
  }
  return projectRelative;
}

type SqlValue = string | number | boolean | null;
type SqlRow = Record<string, SqlValue>;

interface CatalogMediaRow {
  catalogId: number;
  side: "front" | "back";
  objectKey: string;
  contentType: string;
  revision: number;
}

interface ExpectedMediaObject extends CatalogMediaRow {
  objectKey: string;
  path: string;
  variant: BackupMediaVariant;
}

interface ReportDefinition {
  name: BackupReportRecord["name"];
  path: string;
  columns: readonly string[];
  query: string;
}

interface CliOptions {
  command: "create" | "verify" | "restore";
  paths: string[];
  mode?: BackupMode;
  database?: string;
  bucket?: string;
  output?: string;
  config?: string;
  confirmNewTargets: boolean;
}

const REPORTS: readonly ReportDefinition[] = [
  {
    name: "catalog",
    path: "reports/catalog.csv",
    columns: [
      "catalog_id",
      "volume_number",
      "series",
      "character",
      "rarity",
      "sort_order",
      "desired_count",
      "image_side",
      "image_revision",
      "original_filename",
    ],
    query: `SELECT c.id AS catalog_id,
                   s.volume_number,
                   c.series,
                   c.character,
                   c.rarity,
                   c.sort_order,
                   COALESCE(w.desired_count, 0) AS desired_count,
                   m.side AS image_side,
                   m.revision AS image_revision,
                   m.original_filename
            FROM card_catalog c
            JOIN series s ON s.name = c.series
            LEFT JOIN catalog_wants w ON w.catalog_id = c.id
            LEFT JOIN catalog_media m
              ON m.catalog_id = c.id AND m.side = 'front'
            ORDER BY s.volume_number, s.sort_order, c.sort_order, c.id`,
  },
  {
    name: "inventory",
    path: "reports/inventory.csv",
    columns: [
      "card_id",
      "series",
      "character",
      "rarity",
      "status",
      "source",
      "held",
      "opening_id",
      "purchase_reservation_id",
      "purchase_price",
      "asking_price",
      "want_in_return",
      "note",
      "created_at",
      "updated_at",
    ],
    query: `SELECT k.id AS card_id,
                   c.series,
                   c.character,
                   c.rarity,
                   k.status,
                   k.source,
                   k.held,
                   k.opening_id,
                   k.purchase_reservation_id,
                   k.purchase_price,
                   k.asking_price,
                   k.want_in_return,
                   k.note,
                   k.created_at,
                   k.updated_at
            FROM cards k
            JOIN card_catalog c ON c.id = k.catalog_id
            ORDER BY k.id`,
  },
  {
    name: "activity",
    path: "reports/activity.csv",
    columns: [
      "event_id",
      "kind",
      "occurred_at",
      "source_type",
      "source_id",
      "trade_post_id",
      "counterparty",
      "amount",
      "event_note",
      "reverts_event_id",
      "reversed_at",
      "line_id",
      "series",
      "character",
      "rarity",
      "action",
      "qty",
      "delta",
      "before_status",
      "after_status",
      "before_want",
      "after_want",
      "unit_amount",
      "line_note",
    ],
    query: `SELECT e.id AS event_id,
                   e.kind,
                   e.occurred_at,
                   e.source_type,
                   e.source_id,
                   e.trade_post_id,
                   e.counterparty,
                   e.amount,
                   e.note AS event_note,
                   e.reverts_event_id,
                   e.reversed_at,
                   l.id AS line_id,
                   c.series,
                   c.character,
                   c.rarity,
                   l.action,
                   l.qty,
                   l.delta,
                   l.before_status,
                   l.after_status,
                   l.before_want,
                   l.after_want,
                   l.unit_amount,
                   l.note AS line_note
            FROM activity_events e
            LEFT JOIN activity_event_lines l ON l.event_id = e.id
            LEFT JOIN card_catalog c ON c.id = l.catalog_id
            ORDER BY e.occurred_at, e.id, l.id`,
  },
];

const MEDIA_QUERY = `SELECT catalog_id AS catalogId,
                            side,
                            object_key AS objectKey,
                            content_type AS contentType,
                            revision
                     FROM catalog_media
                     ORDER BY catalog_id, side`;

const TABLE_COUNT_QUERY = `SELECT ${BACKUP_TABLES.map(
  (table) => `(SELECT COUNT(*) FROM "${table}") AS "${table}"`,
).join(", ")}`;

const USAGE = `Versioned Meridian Cards backup

Usage:
  npm run backup:create -- --remote [--output <directory>]
  npm run backup:create -- --local [--output <directory>]
  npm run backup:verify -- <directory>
  npm run backup:restore -- <directory> --remote --database <new-db> --bucket <new-bucket> --confirm-new-targets

Options:
  --database <name>       Source database for create; new target for restore
  --bucket <name>         Source bucket for create; new target for restore
  --config <path>         Optional Wrangler config (useful for isolated local restore)
  --output <directory>    Create destination (defaults to backups/<timestamp>)
  --local | --remote      Required explicit storage mode
  --confirm-new-targets   Required for restore; source resources are always rejected
`;

function parseCli(args: string[]): CliOptions {
  const [command, ...tokens] = args;
  if (command !== "create" && command !== "verify" && command !== "restore") {
    throw new Error(USAGE);
  }

  const options: CliOptions = {
    command,
    paths: [],
    confirmNewTargets: false,
  };
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token === "--help" || token === "-h") throw new Error(USAGE);
    if (token === "--local" || token === "--remote") {
      const mode = token.slice(2) as BackupMode;
      if (options.mode && options.mode !== mode) {
        throw new Error("choose exactly one of --local or --remote");
      }
      options.mode = mode;
      continue;
    }
    if (token === "--confirm-new-targets") {
      options.confirmNewTargets = true;
      continue;
    }
    if (
      token === "--database" ||
      token === "--bucket" ||
      token === "--config" ||
      token === "--output"
    ) {
      const value = tokens[index + 1];
      if (!value || value.startsWith("--")) {
        throw new Error(`${token} requires a value`);
      }
      index += 1;
      if (token === "--database") options.database = value;
      if (token === "--bucket") options.bucket = value;
      if (token === "--config") options.config = value;
      if (token === "--output") options.output = value;
      continue;
    }
    if (token.startsWith("--")) throw new Error(`unknown option: ${token}`);
    options.paths.push(token);
  }
  return options;
}

function requireMode(options: CliOptions): BackupMode {
  if (!options.mode)
    throw new Error("choose exactly one of --local or --remote");
  return options.mode;
}

function storageFlag(mode: BackupMode): "--local" | "--remote" {
  return mode === "local" ? "--local" : "--remote";
}

function commandError(
  error: Error & { stdout?: string; stderr?: string },
): Error {
  const details = [error.stderr, error.stdout]
    .filter((value): value is string => Boolean(value?.trim()))
    .join("\n")
    .trim();
  return new Error(details ? `${error.message}\n${details}` : error.message);
}

async function runExecutable(
  executable: string,
  args: string[],
  cwd = PROJECT_ROOT,
): Promise<string> {
  return new Promise((resolvePromise, rejectPromise) => {
    execFile(
      executable,
      args,
      { cwd, encoding: "utf8", maxBuffer: MAX_COMMAND_OUTPUT_BYTES },
      (error, stdout, stderr) => {
        if (error) {
          rejectPromise(commandError(Object.assign(error, { stdout, stderr })));
          return;
        }
        resolvePromise(stdout);
      },
    );
  });
}

async function runWrangler(args: string[], config?: string): Promise<string> {
  return runExecutable(process.execPath, [
    WRANGLER_BIN,
    ...args,
    ...(config ? ["--config", resolve(config)] : []),
  ]);
}

function sqlRow(value: unknown, label: string): SqlRow {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} is not a SQL row`);
  }
  const result: SqlRow = {};
  for (const [key, cell] of Object.entries(value)) {
    if (
      cell !== null &&
      typeof cell !== "string" &&
      typeof cell !== "number" &&
      typeof cell !== "boolean"
    ) {
      throw new Error(`${label}.${key} has an unsupported SQL value`);
    }
    result[key] = cell;
  }
  return result;
}

function parseD1Rows(output: string): SqlRow[] {
  const parsed = JSON.parse(output) as unknown;
  if (!Array.isArray(parsed) || parsed.length !== 1) {
    throw new Error("Wrangler returned an unexpected D1 result envelope");
  }
  const result = parsed[0];
  if (!result || typeof result !== "object" || Array.isArray(result)) {
    throw new Error("Wrangler returned an invalid D1 result");
  }
  const values = (result as Record<string, unknown>).results;
  if (!Array.isArray(values)) {
    throw new Error("Wrangler D1 result has no rows");
  }
  return values.map((value, index) => sqlRow(value, `D1 row ${index}`));
}

async function queryRows(
  database: string,
  mode: BackupMode,
  query: string,
  config?: string,
): Promise<SqlRow[]> {
  const output = await runWrangler(
    [
      "d1",
      "execute",
      database,
      storageFlag(mode),
      "--command",
      query,
      "--json",
    ],
    config,
  );
  return parseD1Rows(output);
}

function requiredInteger(
  value: SqlValue | undefined,
  label: string,
  minimum = 0,
) {
  if (!Number.isSafeInteger(value) || (value as number) < minimum) {
    throw new Error(`${label} must be an integer of at least ${minimum}`);
  }
  return value as number;
}

function requiredString(value: SqlValue | undefined, label: string) {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${label} must be a non-empty string`);
  }
  return value;
}

async function catalogMediaRows(
  database: string,
  mode: BackupMode,
  config?: string,
): Promise<CatalogMediaRow[]> {
  return (await queryRows(database, mode, MEDIA_QUERY, config)).map(
    (row, index) => {
      const side = row.side;
      if (side !== "front" && side !== "back") {
        throw new Error(`catalog media row ${index} has an unsupported side`);
      }
      return {
        catalogId: requiredInteger(
          row.catalogId,
          `catalog media row ${index}.catalogId`,
          1,
        ),
        side,
        objectKey: requiredString(
          row.objectKey,
          `catalog media row ${index}.objectKey`,
        ),
        contentType: requiredString(
          row.contentType,
          `catalog media row ${index}.contentType`,
        ),
        revision: requiredInteger(
          row.revision,
          `catalog media row ${index}.revision`,
          1,
        ),
      };
    },
  );
}

function objectKeyForVariant(cardObjectKey: string, variant: "thumb" | "card") {
  if (variant === "card") return cardObjectKey;
  const suffix = "/card.webp";
  return cardObjectKey.endsWith(suffix)
    ? `${cardObjectKey.slice(0, -suffix.length)}/thumb.webp`
    : cardObjectKey;
}

function mediaPath(objectKey: string, contentType: string): string {
  const digest = createHash("sha256").update(objectKey).digest("hex");
  const extension = contentType === "image/webp" ? "webp" : "bin";
  return `media/${digest}.${extension}`;
}

function expectedMediaObjects(rows: CatalogMediaRow[]): ExpectedMediaObject[] {
  const objects: ExpectedMediaObject[] = [];
  for (const row of rows) {
    const thumbKey = objectKeyForVariant(row.objectKey, "thumb");
    const variants: Array<{ objectKey: string; variant: BackupMediaVariant }> =
      thumbKey === row.objectKey
        ? [{ objectKey: row.objectKey, variant: "legacy" }]
        : [
            { objectKey: thumbKey, variant: "thumb" },
            { objectKey: row.objectKey, variant: "card" },
          ];
    for (const variant of variants) {
      objects.push({
        ...row,
        ...variant,
        contentType:
          variant.variant === "legacy" ? row.contentType : "image/webp",
        path: mediaPath(
          variant.objectKey,
          variant.variant === "legacy" ? row.contentType : "image/webp",
        ),
      });
    }
  }
  const keys = objects.map((item) => item.objectKey);
  const paths = objects.map((item) => item.path);
  if (
    new Set(keys).size !== keys.length ||
    new Set(paths).size !== paths.length
  ) {
    throw new Error(
      "catalog media metadata resolves to duplicate backup objects",
    );
  }
  return objects;
}

async function tableCounts(
  database: string,
  mode: BackupMode,
  config?: string,
): Promise<Record<BackupTable, number>> {
  const rows = await queryRows(database, mode, TABLE_COUNT_QUERY, config);
  if (rows.length !== 1)
    throw new Error("table count query returned no summary");
  return Object.fromEntries(
    BACKUP_TABLES.map((table) => [
      table,
      requiredInteger(rows[0][table], `table count ${table}`),
    ]),
  ) as Record<BackupTable, number>;
}

async function mapLimit<T, R>(
  values: readonly T[],
  limit: number,
  operation: (value: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(values.length);
  let nextIndex = 0;
  const workers = Array.from(
    { length: Math.min(limit, values.length) },
    async () => {
      while (nextIndex < values.length) {
        const index = nextIndex;
        nextIndex += 1;
        results[index] = await operation(values[index], index);
      }
    },
  );
  await Promise.all(workers);
  return results;
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

function timestampName(date: Date): string {
  return date.toISOString().replace(/[-:.]/g, "");
}

async function appIdentity(): Promise<BackupManifestV1["createdBy"]> {
  const packageJson = JSON.parse(
    await readFile(resolve(PROJECT_ROOT, "package.json"), "utf8"),
  ) as { version?: unknown };
  const migrations = (await readdir(resolve(PROJECT_ROOT, "migrations")))
    .filter((name) => /^\d{4}_.+\.sql$/.test(name))
    .sort();
  const latestMigration = migrations.at(-1);
  if (typeof packageJson.version !== "string" || !latestMigration) {
    throw new Error("could not determine application backup identity");
  }
  let gitCommit: string | null = null;
  try {
    gitCommit =
      (await runExecutable("git", ["rev-parse", "HEAD"])).trim() || null;
  } catch {
    // A source archive without .git can still produce a valid backup.
  }
  return { appVersion: packageJson.version, gitCommit, latestMigration };
}

async function secureWrite(path: string, contents: string) {
  await writeFile(path, contents, {
    encoding: "utf8",
    flag: "wx",
    mode: 0o600,
  });
}

async function createBackup(options: CliOptions) {
  if (options.paths.length > 0)
    throw new Error("create does not accept an input path");
  const mode = requireMode(options);
  const database = options.database ?? DEFAULT_DATABASE;
  const bucket = options.bucket ?? DEFAULT_BUCKET;
  const createdAt = new Date();
  const output = resolve(
    options.output ??
      resolve(
        PROJECT_ROOT,
        "backups",
        `meridian-cards-v${BACKUP_FORMAT_VERSION}-${timestampName(createdAt)}`,
      ),
  );
  if (await pathExists(output))
    throw new Error(`backup destination already exists: ${output}`);

  const partial = resolve(
    dirname(output),
    `.${basename(output)}.partial-${randomUUID()}`,
  );
  await mkdir(dirname(output), { recursive: true, mode: 0o700 });

  try {
    await mkdir(resolve(partial, "database"), { recursive: true, mode: 0o700 });
    await mkdir(resolve(partial, "reports"), { recursive: true, mode: 0o700 });
    await mkdir(resolve(partial, "media"), { recursive: true, mode: 0o700 });
    process.stdout.write(`Exporting ${mode} D1 database ${database}...\n`);
    const beforeMedia = await catalogMediaRows(database, mode, options.config);
    for (const databaseFile of [
      { path: BACKUP_DATABASE_SCHEMA_PATH, flag: "--no-data" },
      { path: BACKUP_DATABASE_DATA_PATH, flag: "--no-schema" },
    ] as const) {
      await runWrangler(
        [
          "d1",
          "export",
          database,
          storageFlag(mode),
          "--skip-confirmation",
          databaseFile.flag,
          "--output",
          backupFilePath(partial, databaseFile.path),
        ],
        options.config,
      );
      await chmod(backupFilePath(partial, databaseFile.path), 0o600);
    }
    const afterExportMedia = await catalogMediaRows(
      database,
      mode,
      options.config,
    );
    if (JSON.stringify(beforeMedia) !== JSON.stringify(afterExportMedia)) {
      throw new Error(
        "catalog media changed during D1 export; retry the backup",
      );
    }

    const reportRecords: BackupReportRecord[] = [];
    for (const report of REPORTS) {
      const rows = await queryRows(
        database,
        mode,
        report.query,
        options.config,
      );
      await secureWrite(
        backupFilePath(partial, report.path),
        rowsToCsv(report.columns, rows as CsvRow[]),
      );
      reportRecords.push({
        ...(await describeBackupFile(partial, report.path)),
        name: report.name,
        rows: rows.length,
      });
    }

    const mediaObjects = expectedMediaObjects(afterExportMedia);
    if (mediaObjects.length > 0) {
      process.stdout.write(
        `Downloading ${mediaObjects.length} optimized R2 image objects...\n`,
      );
    }
    const mediaRecords = await mapLimit(
      mediaObjects,
      mediaConcurrency(mode),
      async (item): Promise<BackupMediaRecord> => {
        const destination = backupFilePath(partial, item.path);
        await runWrangler(
          [
            "r2",
            "object",
            "get",
            `${bucket}/${item.objectKey}`,
            storageFlag(mode),
            "--file",
            destination,
          ],
          options.config,
        );
        await chmod(destination, 0o600);
        return {
          ...(await describeBackupFile(partial, item.path)),
          objectKey: item.objectKey,
          catalogId: item.catalogId,
          side: item.side,
          variant: item.variant,
          revision: item.revision,
          contentType: item.contentType,
        };
      },
    );

    const finalMedia = await catalogMediaRows(database, mode, options.config);
    if (JSON.stringify(afterExportMedia) !== JSON.stringify(finalMedia)) {
      throw new Error(
        "catalog media changed while R2 objects were downloading; retry the backup",
      );
    }

    const manifest: BackupManifestV1 = {
      format: BACKUP_FORMAT,
      formatVersion: BACKUP_FORMAT_VERSION,
      backupId: randomUUID(),
      createdAt: createdAt.toISOString(),
      createdBy: await appIdentity(),
      source: { mode, database, bucket },
      database: {
        schema: await describeBackupFile(partial, BACKUP_DATABASE_SCHEMA_PATH),
        data: await describeBackupFile(partial, BACKUP_DATABASE_DATA_PATH),
        tableCounts: await tableCounts(database, mode, options.config),
      },
      reports: reportRecords,
      media: mediaRecords,
    };
    await secureWrite(
      backupFilePath(partial, BACKUP_MANIFEST_PATH),
      `${JSON.stringify(manifest, null, 2)}\n`,
    );

    await verifyBackupDirectory(partial);
    await rename(partial, output);
    process.stdout.write(
      `Backup created: ${displayPath(output)}\n` +
        `Format v${BACKUP_FORMAT_VERSION}; ${mediaRecords.length} media objects; checksums verified.\n`,
    );
  } catch (error) {
    await rm(partial, { recursive: true, force: true });
    throw error;
  }
}

async function verifyBackup(options: CliOptions) {
  if (options.paths.length !== 1)
    throw new Error("verify requires one backup directory");
  if (
    options.mode ||
    options.database ||
    options.bucket ||
    options.config ||
    options.output
  ) {
    throw new Error("verify only accepts a backup directory");
  }
  const verification = await verifyBackupDirectory(resolve(options.paths[0]));
  process.stdout.write(
    `Backup ${verification.manifest.backupId} is valid (format v${verification.manifest.formatVersion}).\n` +
      `${verification.fileCount} payload files, ${verification.totalBytes} bytes, ${verification.manifest.media.length} media objects.\n`,
  );
}

async function ensureEmptyTargetDatabase(
  database: string,
  mode: BackupMode,
  config?: string,
) {
  const rows = await queryRows(
    database,
    mode,
    `SELECT name
     FROM sqlite_schema
     WHERE type = 'table'
       AND name NOT LIKE 'sqlite_%'
       AND name NOT LIKE '_cf_%'
     ORDER BY name`,
    config,
  );
  if (rows.length > 0) {
    throw new Error(
      `target database ${database} is not empty (${rows
        .map((row) => String(row.name))
        .join(", ")})`,
    );
  }
}

async function restoreBackup(options: CliOptions) {
  if (options.paths.length !== 1)
    throw new Error("restore requires one backup directory");
  const mode = requireMode(options);
  if (!options.database || !options.bucket) {
    throw new Error(
      "restore requires --database and --bucket for new target resources",
    );
  }
  if (!options.confirmNewTargets) {
    throw new Error(
      "restore requires --confirm-new-targets after creating empty target resources",
    );
  }
  if (options.output) throw new Error("restore does not accept --output");

  const root = resolve(options.paths[0]);
  const verification = await verifyBackupDirectory(root);
  const { manifest } = verification;
  assertNewRestoreTargets(manifest, options.database, options.bucket);

  process.stdout.write(
    "Backup checksums are valid. Checking new target resources...\n",
  );
  await ensureEmptyTargetDatabase(options.database, mode, options.config);
  if (mode === "remote") {
    await runWrangler(["r2", "bucket", "info", options.bucket], options.config);
  }

  for (const databaseFile of [
    manifest.database.schema,
    manifest.database.data,
  ]) {
    await runWrangler(
      [
        "d1",
        "execute",
        options.database,
        storageFlag(mode),
        "--file",
        backupFilePath(root, databaseFile.path),
        "--yes",
      ],
      options.config,
    );
  }

  if (manifest.media.length > 0) {
    process.stdout.write(
      `Restoring ${manifest.media.length} optimized image objects...\n`,
    );
  }
  await mapLimit(manifest.media, mediaConcurrency(mode), async (item) => {
    await runWrangler(
      [
        "r2",
        "object",
        "put",
        `${options.bucket}/${item.objectKey}`,
        storageFlag(mode),
        "--file",
        backupFilePath(root, item.path),
        "--content-type",
        item.contentType,
        "--content-disposition",
        "inline",
        "--cache-control",
        "public, max-age=31536000, immutable",
        "--force",
      ],
      options.config,
    );
  });

  const restoredCounts = await tableCounts(
    options.database,
    mode,
    options.config,
  );
  for (const table of BACKUP_TABLES) {
    if (restoredCounts[table] !== manifest.database.tableCounts[table]) {
      throw new Error(
        `restored table ${table} has ${restoredCounts[table]} rows; expected ${manifest.database.tableCounts[table]}`,
      );
    }
  }
  process.stdout.write(
    `Restore verified in new ${mode} resources: D1 ${options.database}, R2 ${options.bucket}.\nThe source resources were not modified. Update bindings only after application checks pass.\n`,
  );
}

async function main() {
  const options = parseCli(process.argv.slice(2));
  if (options.command === "create") return createBackup(options);
  if (options.command === "verify") return verifyBackup(options);
  return restoreBackup(options);
}

main().catch((error) => {
  process.stderr.write(
    `${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exitCode = 1;
});
