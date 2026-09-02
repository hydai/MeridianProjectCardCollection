import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { lstat, readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";

export const BACKUP_FORMAT = "tw.oshi.mpcards.backup";
export const BACKUP_FORMAT_VERSION = 1 as const;
export const BACKUP_DATABASE_SCHEMA_PATH = "database/schema.sql";
export const BACKUP_DATABASE_DATA_PATH = "database/data.sql";
export const BACKUP_MANIFEST_PATH = "manifest.json";
export const BACKUP_REPORT_NAMES = [
  "catalog",
  "inventory",
  "activity",
] as const;

export const BACKUP_TABLES = [
  "series",
  "card_catalog",
  "openings",
  "cards",
  "transactions",
  "trade_reservations",
  "trade_reservation_lines",
  "purchase_reservations",
  "purchase_reservation_lines",
  "activity_events",
  "activity_event_lines",
  "catalog_wants",
  "trade_posts",
  "trade_post_lines",
  "catalog_media",
] as const;

export type BackupTable = (typeof BACKUP_TABLES)[number];
export type BackupMode = "local" | "remote";
export type BackupMediaVariant = "thumb" | "card" | "legacy";

export interface BackupFileRecord {
  path: string;
  bytes: number;
  sha256: string;
}

export interface BackupReportRecord extends BackupFileRecord {
  name: (typeof BACKUP_REPORT_NAMES)[number];
  rows: number;
}

export interface BackupMediaRecord extends BackupFileRecord {
  objectKey: string;
  catalogId: number;
  side: "front" | "back";
  variant: BackupMediaVariant;
  revision: number;
  contentType: string;
}

export interface BackupManifestV1 {
  format: typeof BACKUP_FORMAT;
  formatVersion: typeof BACKUP_FORMAT_VERSION;
  backupId: string;
  createdAt: string;
  createdBy: {
    appVersion: string;
    gitCommit: string | null;
    latestMigration: string;
  };
  source: {
    mode: BackupMode;
    database: string;
    bucket: string;
  };
  database: {
    schema: BackupFileRecord;
    data: BackupFileRecord;
    tableCounts: Record<BackupTable, number>;
  };
  reports: BackupReportRecord[];
  media: BackupMediaRecord[];
}

export interface BackupVerification {
  manifest: BackupManifestV1;
  fileCount: number;
  totalBytes: number;
}

export type CsvValue = string | number | boolean | null | undefined;
export type CsvRow = Record<string, CsvValue>;

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function text(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${label} must be a non-empty string`);
  }
  return value;
}

function integer(value: unknown, label: string, minimum = 0): number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum) {
    throw new Error(`${label} must be an integer of at least ${minimum}`);
  }
  return value as number;
}

function checksum(value: unknown, label: string): string {
  const parsed = text(value, label);
  if (!/^[a-f0-9]{64}$/.test(parsed)) {
    throw new Error(`${label} must be a SHA-256 checksum`);
  }
  return parsed;
}

export function assertSafeBackupPath(value: string, label = "backup path") {
  if (
    value.startsWith("/") ||
    value.includes("\\") ||
    value.includes("\0") ||
    value
      .split("/")
      .some((segment) => !segment || segment === "." || segment === "..")
  ) {
    throw new Error(`${label} must be a safe relative POSIX path`);
  }
}

export function backupFilePath(root: string, relativePath: string): string {
  assertSafeBackupPath(relativePath);
  return resolve(root, ...relativePath.split("/"));
}

function fileRecord(value: unknown, label: string): BackupFileRecord {
  const input = record(value, label);
  const path = text(input.path, `${label}.path`);
  assertSafeBackupPath(path, `${label}.path`);
  return {
    path,
    bytes: integer(input.bytes, `${label}.bytes`),
    sha256: checksum(input.sha256, `${label}.sha256`),
  };
}

function tableCounts(value: unknown): Record<BackupTable, number> {
  const input = record(value, "manifest.database.tableCounts");
  return Object.fromEntries(
    BACKUP_TABLES.map((table) => [
      table,
      integer(input[table], `manifest.database.tableCounts.${table}`),
    ]),
  ) as Record<BackupTable, number>;
}

export function parseBackupManifest(value: unknown): BackupManifestV1 {
  const input = record(value, "manifest");
  if (input.format !== BACKUP_FORMAT) {
    throw new Error(`unsupported backup format: ${String(input.format)}`);
  }
  if (input.formatVersion !== BACKUP_FORMAT_VERSION) {
    throw new Error(
      `unsupported backup format version: ${String(input.formatVersion)}`,
    );
  }

  const createdAt = text(input.createdAt, "manifest.createdAt");
  if (Number.isNaN(Date.parse(createdAt))) {
    throw new Error("manifest.createdAt must be an ISO timestamp");
  }

  const createdByInput = record(input.createdBy, "manifest.createdBy");
  const sourceInput = record(input.source, "manifest.source");
  if (sourceInput.mode !== "local" && sourceInput.mode !== "remote") {
    throw new Error("manifest.source.mode must be local or remote");
  }

  const databaseInput = record(input.database, "manifest.database");
  const databaseSchema = fileRecord(
    databaseInput.schema,
    "manifest.database.schema",
  );
  const databaseData = fileRecord(databaseInput.data, "manifest.database.data");
  if (databaseSchema.path !== BACKUP_DATABASE_SCHEMA_PATH) {
    throw new Error(
      `manifest.database.schema.path must be ${BACKUP_DATABASE_SCHEMA_PATH}`,
    );
  }
  if (databaseData.path !== BACKUP_DATABASE_DATA_PATH) {
    throw new Error(
      `manifest.database.data.path must be ${BACKUP_DATABASE_DATA_PATH}`,
    );
  }

  if (!Array.isArray(input.reports)) {
    throw new Error("manifest.reports must be an array");
  }
  const reports = input.reports.map((value, index): BackupReportRecord => {
    const parsed = record(value, `manifest.reports[${index}]`);
    const name = parsed.name;
    if (name !== "catalog" && name !== "inventory" && name !== "activity") {
      throw new Error(`manifest.reports[${index}].name is unsupported`);
    }
    return {
      ...fileRecord(parsed, `manifest.reports[${index}]`),
      name,
      rows: integer(parsed.rows, `manifest.reports[${index}].rows`),
    };
  });
  const reportNames = reports.map((item) => item.name);
  if (
    reportNames.length !== BACKUP_REPORT_NAMES.length ||
    BACKUP_REPORT_NAMES.some((name) => !reportNames.includes(name)) ||
    new Set(reportNames).size !== reportNames.length
  ) {
    throw new Error(
      "manifest must contain catalog, inventory, and activity reports once each",
    );
  }

  if (!Array.isArray(input.media)) {
    throw new Error("manifest.media must be an array");
  }
  const media = input.media.map((value, index): BackupMediaRecord => {
    const parsed = record(value, `manifest.media[${index}]`);
    if (parsed.side !== "front" && parsed.side !== "back") {
      throw new Error(`manifest.media[${index}].side is unsupported`);
    }
    if (
      parsed.variant !== "thumb" &&
      parsed.variant !== "card" &&
      parsed.variant !== "legacy"
    ) {
      throw new Error(`manifest.media[${index}].variant is unsupported`);
    }
    return {
      ...fileRecord(parsed, `manifest.media[${index}]`),
      objectKey: text(parsed.objectKey, `manifest.media[${index}].objectKey`),
      catalogId: integer(
        parsed.catalogId,
        `manifest.media[${index}].catalogId`,
        1,
      ),
      side: parsed.side,
      variant: parsed.variant,
      revision: integer(
        parsed.revision,
        `manifest.media[${index}].revision`,
        1,
      ),
      contentType: text(
        parsed.contentType,
        `manifest.media[${index}].contentType`,
      ),
    };
  });

  const allPaths = [
    databaseSchema.path,
    databaseData.path,
    ...reports.map((item) => item.path),
    ...media.map((item) => item.path),
  ];
  if (new Set(allPaths).size !== allPaths.length) {
    throw new Error("manifest contains duplicate file paths");
  }
  const objectKeys = media.map((item) => item.objectKey);
  if (new Set(objectKeys).size !== objectKeys.length) {
    throw new Error("manifest contains duplicate R2 object keys");
  }

  const gitCommitValue = createdByInput.gitCommit;
  if (gitCommitValue !== null && typeof gitCommitValue !== "string") {
    throw new Error("manifest.createdBy.gitCommit must be a string or null");
  }

  return {
    format: BACKUP_FORMAT,
    formatVersion: BACKUP_FORMAT_VERSION,
    backupId: text(input.backupId, "manifest.backupId"),
    createdAt,
    createdBy: {
      appVersion: text(
        createdByInput.appVersion,
        "manifest.createdBy.appVersion",
      ),
      gitCommit: gitCommitValue,
      latestMigration: text(
        createdByInput.latestMigration,
        "manifest.createdBy.latestMigration",
      ),
    },
    source: {
      mode: sourceInput.mode,
      database: text(sourceInput.database, "manifest.source.database"),
      bucket: text(sourceInput.bucket, "manifest.source.bucket"),
    },
    database: {
      schema: databaseSchema,
      data: databaseData,
      tableCounts: tableCounts(databaseInput.tableCounts),
    },
    reports,
    media,
  };
}

export function assertNewRestoreTargets(
  manifest: BackupManifestV1,
  database: string,
  bucket: string,
) {
  if (database === manifest.source.database) {
    throw new Error("restore refuses to target the source D1 database");
  }
  if (bucket === manifest.source.bucket) {
    throw new Error("restore refuses to target the source R2 bucket");
  }
}

export async function sha256File(path: string): Promise<string> {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest("hex");
}

export async function describeBackupFile(
  root: string,
  relativePath: string,
): Promise<BackupFileRecord> {
  const path = backupFilePath(root, relativePath);
  const details = await lstat(path);
  if (!details.isFile() || details.isSymbolicLink()) {
    throw new Error(`${relativePath} must be a regular file`);
  }
  return {
    path: relativePath,
    bytes: details.size,
    sha256: await sha256File(path),
  };
}

async function backupFiles(root: string, prefix = ""): Promise<string[]> {
  const directory = prefix ? backupFilePath(root, prefix) : root;
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries.sort((left, right) =>
    left.name.localeCompare(right.name),
  )) {
    const path = prefix ? `${prefix}/${entry.name}` : entry.name;
    assertSafeBackupPath(path);
    if (entry.isSymbolicLink()) {
      throw new Error(`${path} must not be a symbolic link`);
    }
    if (entry.isDirectory()) {
      files.push(...(await backupFiles(root, path)));
      continue;
    }
    if (!entry.isFile()) {
      throw new Error(`${path} must be a regular file or directory`);
    }
    files.push(path);
  }
  return files;
}

export async function verifyBackupDirectory(
  root: string,
): Promise<BackupVerification> {
  const rootDetails = await lstat(root);
  if (!rootDetails.isDirectory() || rootDetails.isSymbolicLink()) {
    throw new Error("backup root must be a regular directory");
  }

  const manifestPath = backupFilePath(root, BACKUP_MANIFEST_PATH);
  const manifestDetails = await lstat(manifestPath);
  if (!manifestDetails.isFile() || manifestDetails.isSymbolicLink()) {
    throw new Error("manifest.json must be a regular file");
  }
  const manifest = parseBackupManifest(
    JSON.parse(await readFile(manifestPath, "utf8")) as unknown,
  );
  const expected = [
    manifest.database.schema,
    manifest.database.data,
    ...manifest.reports,
    ...manifest.media,
  ];
  const expectedPaths = new Set([
    BACKUP_MANIFEST_PATH,
    ...expected.map((item) => item.path),
  ]);
  const actualPaths = await backupFiles(root);
  const undeclared = actualPaths.find((path) => !expectedPaths.has(path));
  if (undeclared) {
    throw new Error(`backup contains undeclared file: ${undeclared}`);
  }
  const missing = [...expectedPaths].find(
    (path) => !actualPaths.includes(path),
  );
  if (missing) {
    throw new Error(`backup is missing declared file: ${missing}`);
  }
  let totalBytes = 0;
  for (const item of expected) {
    const actual = await describeBackupFile(root, item.path);
    if (actual.bytes !== item.bytes) {
      throw new Error(`${item.path} size does not match manifest`);
    }
    if (actual.sha256 !== item.sha256) {
      throw new Error(`${item.path} checksum does not match manifest`);
    }
    totalBytes += actual.bytes;
  }
  return { manifest, fileCount: expected.length, totalBytes };
}

function csvCell(value: CsvValue): string {
  if (value === null || value === undefined) return "";
  let output = String(value);
  // Spreadsheet applications may evaluate cells beginning with these
  // characters as formulas. Backups must remain inert when opened manually.
  if (/^[=+\-@\t\r]/.test(output)) output = `'${output}`;
  return /[",\r\n]/.test(output) ? `"${output.replace(/"/g, '""')}"` : output;
}

export function rowsToCsv(
  columns: readonly string[],
  rows: readonly CsvRow[],
): string {
  const lines = [
    columns.map(csvCell).join(","),
    ...rows.map((row) =>
      columns.map((column) => csvCell(row[column])).join(","),
    ),
  ];
  return `\uFEFF${lines.join("\r\n")}\r\n`;
}
