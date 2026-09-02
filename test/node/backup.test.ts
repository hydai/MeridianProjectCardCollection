import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  BACKUP_FORMAT,
  BACKUP_FORMAT_VERSION,
  BACKUP_TABLES,
  type BackupManifestV1,
  assertNewRestoreTargets,
  parseBackupManifest,
  rowsToCsv,
  verifyBackupDirectory,
} from "../../scripts/backup-format";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((path) => rm(path, { recursive: true, force: true })),
  );
});

function sha256(value: string | Uint8Array) {
  return createHash("sha256").update(value).digest("hex");
}

function baseManifest(): BackupManifestV1 {
  return {
    format: BACKUP_FORMAT,
    formatVersion: BACKUP_FORMAT_VERSION,
    backupId: "59180a3c-4671-4ca5-a170-fb65f36bf82d",
    createdAt: "2026-09-02T12:34:56.000Z",
    createdBy: {
      appVersion: "0.1.0",
      gitCommit: "60d77c6",
      latestMigration: "0016_catalog_media.sql",
    },
    source: {
      mode: "remote",
      database: "meridian-cards",
      bucket: "meridian-card-images",
    },
    database: {
      schema: {
        path: "database/schema.sql",
        bytes: 0,
        sha256: sha256(""),
      },
      data: {
        path: "database/data.sql",
        bytes: 0,
        sha256: sha256(""),
      },
      tableCounts: Object.fromEntries(
        BACKUP_TABLES.map((table) => [table, 0]),
      ) as Record<(typeof BACKUP_TABLES)[number], number>,
    },
    reports: [
      {
        name: "catalog",
        path: "reports/catalog.csv",
        bytes: 0,
        sha256: sha256(""),
        rows: 0,
      },
      {
        name: "inventory",
        path: "reports/inventory.csv",
        bytes: 0,
        sha256: sha256(""),
        rows: 0,
      },
      {
        name: "activity",
        path: "reports/activity.csv",
        bytes: 0,
        sha256: sha256(""),
        rows: 0,
      },
    ],
    media: [],
  };
}

async function writeFixture() {
  const root = await mkdtemp(join(tmpdir(), "meridian-backup-test-"));
  temporaryDirectories.push(root);
  await mkdir(join(root, "database"));
  await mkdir(join(root, "reports"));
  const files = new Map([
    ["database/schema.sql", "CREATE TABLE example (id INTEGER);\n"],
    ["database/data.sql", "INSERT INTO example VALUES (1);\n"],
    ["reports/catalog.csv", "catalog_id,series\r\n1,TEST\r\n"],
    ["reports/inventory.csv", "card_id,status\r\n1,owned\r\n"],
    ["reports/activity.csv", "event_id,kind\r\n1,opening\r\n"],
  ]);
  for (const [path, contents] of files) {
    await writeFile(join(root, ...path.split("/")), contents);
  }

  const manifest = baseManifest();
  for (const databaseFile of [
    manifest.database.schema,
    manifest.database.data,
  ]) {
    const contents = files.get(databaseFile.path) ?? "";
    databaseFile.bytes = Buffer.byteLength(contents);
    databaseFile.sha256 = sha256(contents);
  }
  for (const report of manifest.reports) {
    const contents = files.get(report.path) ?? "";
    report.bytes = Buffer.byteLength(contents);
    report.sha256 = sha256(contents);
    report.rows = 1;
  }
  await writeFile(
    join(root, "manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
  return { root, manifest };
}

describe("versioned backup format", () => {
  it("verifies every declared payload checksum", async () => {
    const { root, manifest } = await writeFixture();

    await expect(verifyBackupDirectory(root)).resolves.toMatchObject({
      manifest: { backupId: manifest.backupId, formatVersion: 1 },
      fileCount: 5,
    });
  });

  it("detects payload corruption", async () => {
    const { root } = await writeFixture();
    await writeFile(join(root, "database", "data.sql"), "changed");

    await expect(verifyBackupDirectory(root)).rejects.toThrow(
      /database\/data\.sql (size|checksum) does not match manifest/,
    );
  });

  it("rejects undeclared files and symbolic links", async () => {
    const { root } = await writeFixture();
    const extraPath = join(root, "undeclared.txt");
    await writeFile(extraPath, "not in the manifest");

    await expect(verifyBackupDirectory(root)).rejects.toThrow(
      "backup contains undeclared file: undeclared.txt",
    );

    await rm(extraPath);
    const catalogPath = join(root, "reports", "catalog.csv");
    await rm(catalogPath);
    await symlink("inventory.csv", catalogPath);
    await expect(verifyBackupDirectory(root)).rejects.toThrow(
      "reports/catalog.csv must not be a symbolic link",
    );
  });

  it("rejects unsupported versions and unsafe paths", () => {
    expect(() =>
      parseBackupManifest({ ...baseManifest(), formatVersion: 2 }),
    ).toThrow("unsupported backup format version: 2");

    const unsafe = baseManifest();
    unsafe.reports[0].path = "../catalog.csv";
    expect(() => parseBackupManifest(unsafe)).toThrow(
      "manifest.reports[0].path must be a safe relative POSIX path",
    );
  });

  it("refuses to restore over either source resource", () => {
    const manifest = baseManifest();
    expect(() =>
      assertNewRestoreTargets(manifest, "meridian-cards", "fresh-images"),
    ).toThrow("restore refuses to target the source D1 database");
    expect(() =>
      assertNewRestoreTargets(
        manifest,
        "fresh-database",
        "meridian-card-images",
      ),
    ).toThrow("restore refuses to target the source R2 bucket");
    expect(() =>
      assertNewRestoreTargets(manifest, "fresh-database", "fresh-images"),
    ).not.toThrow();
  });
});

describe("human-readable backup reports", () => {
  it("writes deterministic UTF-8 CSV and neutralizes spreadsheet formulas", () => {
    expect(
      rowsToCsv(
        ["name", "note", "amount"],
        [
          { name: "Mizuki", note: '=HYPERLINK("bad")', amount: 100 },
          { name: "Rei", note: "line one\nline two", amount: null },
        ],
      ),
    ).toBe(
      '\uFEFFname,note,amount\r\nMizuki,"\'=HYPERLINK(""bad"")",100\r\nRei,"line one\nline two",\r\n',
    );
  });
});
