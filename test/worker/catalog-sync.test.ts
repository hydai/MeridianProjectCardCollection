import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { buildCatalogSyncMigration } from "../../scripts/catalog-sync-migration";
import {
  createSeries,
  getCatalog,
  getOverview,
} from "../../src/worker/db/queries";

const addition = {
  name: "SYNC TEST",
  volume: 3,
  characters: ["Alice"],
  rarities: ["R", "EX"],
};

const apply = (statements: string[]) =>
  env.DB.batch(statements.map((statement) => env.DB.prepare(statement)));

async function snapshot() {
  const results = await env.DB.batch<Record<string, unknown>>([
    env.DB.prepare("SELECT * FROM series ORDER BY name"),
    env.DB.prepare("SELECT * FROM card_catalog ORDER BY id"),
    env.DB.prepare("SELECT * FROM cards ORDER BY id"),
    env.DB.prepare("SELECT * FROM sqlite_sequence ORDER BY name"),
  ]);
  return results.map((result) => result.results);
}

describe("catalog sync input", () => {
  it.each([
    [null, "non-empty array"],
    [[], "non-empty array"],
    [{ additions: [addition] }, "non-empty array"],
    [[null], "must be an object"],
    [[{ ...addition, name: " " }], "name must be non-empty"],
    [[{ ...addition, name: "A\0B" }], "without NUL"],
    [[{ ...addition, volume: 0 }], "positive integer"],
    [[{ ...addition, volume: 1.5 }], "positive integer"],
    [[{ ...addition, volume: "3" }], "positive integer"],
    [[{ ...addition, volume: 2 }], "EX is only available from volume 3"],
    [[{ ...addition, characters: [] }], "characters required"],
    [
      [{ ...addition, characters: ["Alice", " alice "] }],
      "characters must be unique",
    ],
    [[{ ...addition, characters: [" "] }], "character must be non-empty"],
    [[{ ...addition, characters: [42] }], "character must be non-empty"],
    [[{ ...addition, rarities: [] }], "rarities required"],
    [[{ ...addition, rarities: ["R", "R"] }], "rarities must be unique"],
    [[{ ...addition, rarities: ["SSR", "UNKNOWN"] }], "unsupported value"],
    [[{ ...addition, sortOrder: 0 }], "only accept"],
    [
      [addition, { ...addition, name: " sync test " }],
      "series names must be unique",
    ],
  ])("rejects invalid additions: %j", (input, error) => {
    expect(() => buildCatalogSyncMigration(input)).toThrow(String(error));
  });
});

describe("catalog sync migration", () => {
  it("makes new series visible with volume metadata and canonical rarities", async () => {
    const before = await snapshot();
    await apply(
      buildCatalogSyncMigration([
        {
          name: "  Collector's Series  ",
          volume: 3,
          characters: [" Bob ", "O'Hara"],
          rarities: ["EX", "UR", "SSR", "R", "SR"],
        },
        {
          name: "EARLIER VOLUME",
          volume: 2,
          characters: ["Alice"],
          rarities: ["UR", "R"],
        },
      ]),
    );

    const catalog = await getCatalog(env.DB);
    expect(
      catalog.find((series) => series.name === "Collector's Series"),
    ).toMatchObject({
      name: "Collector's Series",
      volume: 3,
      characters: ["Bob", "O'Hara"],
      rarities: ["R", "SR", "SSR", "UR", "EX"],
    });
    expect(
      catalog.find((series) => series.name === "EARLIER VOLUME"),
    ).toMatchObject({
      volume: 2,
      characters: ["Alice"],
      rarities: ["R", "UR"],
    });
    const metadata = await env.DB.prepare(
      "SELECT name, volume_number, is_active, sort_order FROM series ORDER BY sort_order",
    ).all();
    expect(metadata.results.slice(-2)).toEqual([
      {
        name: "Collector's Series",
        volume_number: 3,
        is_active: 1,
        sort_order:
          Math.max(...before[0].map((row) => Number(row.sort_order))) + 1,
      },
      {
        name: "EARLIER VOLUME",
        volume_number: 2,
        is_active: 1,
        sort_order:
          Math.max(...before[0].map((row) => Number(row.sort_order))) + 2,
      },
    ]);

    const overview = await getOverview(env.DB);
    const cells = overview.cells.filter(
      (cell) => cell.series === "Collector's Series",
    );
    expect(cells).toHaveLength(10);
    expect(cells.every((cell) => cell.volume === 3 && cell.owned === 0)).toBe(
      true,
    );
    expect(cells.map((cell) => cell.rarity)).toEqual([
      "R",
      "SR",
      "SSR",
      "UR",
      "EX",
      "R",
      "SR",
      "SSR",
      "UR",
      "EX",
    ]);
    expect(
      overview.progress.find(
        (series) => series.series === "Collector's Series",
      ),
    ).toMatchObject({
      totalTypes: 10,
      collectedTypes: 0,
    });
    expect((await snapshot())[2]).toEqual(before[2]);
  });

  it("preserves runtime edits, inactive metadata, and omitted deletions", async () => {
    await createSeries(env.DB, {
      name: "RUNTIME ONLY",
      volume: 3,
      characters: ["Runtime"],
      rarities: ["EX"],
    });
    await env.DB.prepare(
      "UPDATE series SET volume_number = 4, sort_order = 999, is_active = 0 WHERE name = 'RUNTIME ONLY'",
    ).run();
    await env.DB.prepare(
      "UPDATE card_catalog SET sort_order = 9000 WHERE series = 'RUNTIME ONLY'",
    ).run();
    const removed = await env.DB.prepare(
      `DELETE FROM card_catalog WHERE id = (
         SELECT c.id FROM card_catalog c
         WHERE c.series = 'NEW YEAR'
           AND NOT EXISTS (SELECT 1 FROM cards WHERE catalog_id = c.id)
         LIMIT 1
       ) RETURNING id`,
    ).first<{ id: number }>();
    expect(removed).not.toBeNull();
    const before = await snapshot();

    await apply(
      buildCatalogSyncMigration([
        {
          name: "RUNTIME ONLY",
          volume: 4,
          characters: ["Explicit Addition"],
          rarities: ["EX", "R"],
        },
      ]),
    );
    const after = await snapshot();
    expect(after[0]).toEqual(before[0]);
    expect(
      after[1].filter((row) => row.character !== "Explicit Addition"),
    ).toEqual(before[1]);
    expect(after[1].slice(-2).map((row) => row.rarity)).toEqual(["R", "EX"]);
    const lastOrder = Math.max(
      ...before[1].map((row) => Number(row.sort_order)),
    );
    expect(after[1].slice(-2).map((row) => row.sort_order)).toEqual([
      lastOrder + 1,
      lastOrder + 2,
    ]);
    expect(after[2]).toEqual(before[2]);
    expect(after[1].some((row) => row.id === removed?.id)).toBe(false);
    expect(
      (await getCatalog(env.DB)).some(
        (series) => series.name === "RUNTIME ONLY",
      ),
    ).toBe(false);
  });

  it("is stable when reapplied, including existing catalog IDs and sequences", async () => {
    await createSeries(env.DB, {
      name: "SYNC EXISTING",
      volume: 1,
      characters: ["Mizuki"],
      rarities: ["R", "SR", "SSR", "UR"],
    });
    const before = await snapshot();
    const statements = buildCatalogSyncMigration([
      {
        name: "SYNC EXISTING",
        volume: 1,
        characters: ["Mizuki", "Explicit Addition"],
        rarities: ["UR", "SSR", "SR", "R"],
      },
      addition,
    ]);
    await apply(statements);
    const once = await snapshot();
    expect(once[1].slice(0, before[1].length)).toEqual(before[1]);
    expect(once[1]).toHaveLength(before[1].length + 6);
    expect(once[2]).toEqual(before[2]);
    await apply(statements);
    expect(await snapshot()).toEqual(once);
  });

  it("repairs missing series metadata without replacing orphaned catalog rows", async () => {
    const orphan = await env.DB.prepare(
      `INSERT INTO card_catalog (series, character, rarity, sort_order)
       SELECT 'ORPHANED SYNC', 'Alice', 'EX', COALESCE(MAX(sort_order), -1) + 1
       FROM card_catalog RETURNING id`,
    ).first<{ id: number }>();
    const before = await snapshot();
    const input = {
      name: "ORPHANED SYNC",
      volume: 2,
      characters: ["Bob"],
      rarities: ["R"],
    };
    await expect(apply(buildCatalogSyncMigration([input]))).rejects.toThrow(
      "catalog_sync_runtime_conflict",
    );
    expect(await snapshot()).toEqual(before);

    await apply(buildCatalogSyncMigration([{ ...input, volume: 3 }]));
    expect(
      (await getCatalog(env.DB)).find(
        (series) => series.name === "ORPHANED SYNC",
      ),
    ).toMatchObject({
      volume: 3,
      characters: ["Alice", "Bob"],
      rarities: ["R", "EX"],
    });
    expect(
      (await getOverview(env.DB)).cells.find(
        (cell) => cell.catalogId === orphan?.id,
      ),
    ).toMatchObject({
      series: "ORPHANED SYNC",
      volume: 3,
      character: "Alice",
      rarity: "EX",
    });
    expect((await snapshot())[2]).toEqual(before[2]);
  });

  it("restores a deleted type only when explicitly requested", async () => {
    await createSeries(env.DB, {
      name: "EXPLICIT RESTORE",
      volume: 3,
      characters: ["Alice", "Bob"],
      rarities: ["R", "EX"],
    });
    await env.DB.prepare(
      "DELETE FROM card_catalog WHERE series = 'EXPLICIT RESTORE' AND rarity = 'EX'",
    ).run();
    const before = await snapshot();
    await apply(
      buildCatalogSyncMigration([
        {
          name: "EXPLICIT RESTORE",
          volume: 3,
          characters: ["Alice"],
          rarities: ["EX"],
        },
      ]),
    );
    const after = await snapshot();
    expect(after[0]).toEqual(before[0]);
    expect(after[1].slice(0, -1)).toEqual(before[1]);
    expect(after[1].at(-1)).toMatchObject({
      series: "EXPLICIT RESTORE",
      character: "Alice",
      rarity: "EX",
    });
    expect(after[2]).toEqual(before[2]);
  });

  it.each([
    { name: "NEW YEAR", volume: 3, characters: ["Alice"], rarities: ["EX"] },
    { name: "new year", volume: 1, characters: ["Alice"], rarities: ["R"] },
    { name: "NEW YEAR", volume: 1, characters: ["mizuki"], rarities: ["R"] },
  ])(
    "rolls back runtime conflicts without changing metadata: %j",
    async (conflict) => {
      const before = await snapshot();
      await expect(
        apply(
          buildCatalogSyncMigration([
            { ...addition, name: "ROLLBACK TEST" },
            conflict,
          ]),
        ),
      ).rejects.toThrow("catalog_sync_runtime_conflict");
      expect(await snapshot()).toEqual(before);
      expect(
        await env.DB.prepare(
          "SELECT COUNT(*) AS n FROM sqlite_schema WHERE name = '_catalog_sync_guard'",
        ).first(),
      ).toEqual({ n: 0 });
    },
  );
});
