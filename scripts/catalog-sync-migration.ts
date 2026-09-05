import {
  RARITY_ORDER,
  canonicalizeRarities,
  supportsEx,
} from "../src/shared/rarity";
import type { CreateSeriesInput, Rarity } from "../src/shared/types";

function text(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim() || value.includes("\0")) {
    throw new Error(`${label} must be non-empty text without NUL characters`);
  }
  return value.trim();
}

function additionsFrom(input: unknown): CreateSeriesInput[] {
  if (!Array.isArray(input) || input.length === 0) {
    throw new Error("catalog additions must be a non-empty array");
  }
  const names = new Set<string>();
  return input.map((candidate) => {
    if (
      !candidate ||
      typeof candidate !== "object" ||
      Array.isArray(candidate)
    ) {
      throw new Error("each catalog addition must be an object");
    }
    const entry = candidate as Record<string, unknown>;
    if (
      Object.keys(entry).some(
        (key) => !["name", "volume", "characters", "rarities"].includes(key),
      )
    ) {
      throw new Error(
        "catalog additions only accept name, volume, characters, and rarities",
      );
    }
    const name = text(entry.name, "name");
    if (names.has(name.toLowerCase())) {
      throw new Error("series names must be unique");
    }
    names.add(name.toLowerCase());
    if (
      typeof entry.volume !== "number" ||
      !Number.isSafeInteger(entry.volume) ||
      entry.volume < 1
    ) {
      throw new Error("volume must be a positive integer");
    }
    if (!Array.isArray(entry.characters) || entry.characters.length === 0) {
      throw new Error("characters required");
    }
    const characters = entry.characters.map((value) =>
      text(value, "character"),
    );
    if (
      new Set(characters.map((character) => character.toLowerCase())).size !==
      characters.length
    ) {
      throw new Error("characters must be unique");
    }
    if (!Array.isArray(entry.rarities) || entry.rarities.length === 0) {
      throw new Error("rarities required");
    }
    if (
      !entry.rarities.every((value): value is Rarity =>
        RARITY_ORDER.some((rarity) => rarity === value),
      )
    ) {
      throw new Error("rarities contain an unsupported value");
    }
    if (new Set(entry.rarities).size !== entry.rarities.length) {
      throw new Error("rarities must be unique");
    }
    const rarities = canonicalizeRarities(entry.rarities);
    if (!supportsEx(entry.volume) && rarities.includes("EX")) {
      throw new Error("EX is only available from volume 3");
    }
    return { name, volume: entry.volume, characters, rarities };
  });
}

const literal = (value: string) => `'${value.replace(/'/g, "''")}'`;

export function buildCatalogSyncMigration(input: unknown): string[] {
  const additions = additionsFrom(input);
  const guards: string[] = [];
  const inserts: string[] = [];

  for (const addition of additions) {
    const name = literal(addition.name);
    guards.push(
      `INSERT INTO _catalog_sync_guard (valid)
       SELECT NOT EXISTS (
         SELECT 1 FROM series
         WHERE name = ${name} COLLATE NOCASE
           AND (name != ${name} OR volume_number != ${addition.volume})
       ) AND NOT EXISTS (
         SELECT 1 FROM card_catalog
         WHERE series = ${name} COLLATE NOCASE AND series != ${name}
       );`,
    );
    if (!supportsEx(addition.volume)) {
      guards.push(
        `INSERT INTO _catalog_sync_guard (valid)
         SELECT NOT EXISTS (
           SELECT 1 FROM card_catalog WHERE series = ${name} AND rarity = 'EX'
         );`,
      );
    }
    inserts.push(
      `INSERT INTO series (name, sort_order, is_active, volume_number)
       SELECT ${name}, (SELECT COALESCE(MAX(sort_order), -1) + 1 FROM series),
              1, ${addition.volume}
       WHERE NOT EXISTS (SELECT 1 FROM series WHERE name = ${name});`,
    );
    for (const character of addition.characters) {
      const characterName = literal(character);
      guards.push(
        `INSERT INTO _catalog_sync_guard (valid)
         SELECT NOT EXISTS (
           SELECT 1 FROM card_catalog
           WHERE series = ${name} AND character = ${characterName} COLLATE NOCASE
             AND character != ${characterName}
         );`,
      );
      for (const rarity of addition.rarities) {
        inserts.push(
          `INSERT INTO card_catalog (series, character, rarity, sort_order)
           SELECT ${name}, ${characterName}, ${literal(rarity)},
                  (SELECT COALESCE(MAX(sort_order), -1) + 1 FROM card_catalog)
           WHERE NOT EXISTS (
             SELECT 1 FROM card_catalog
             WHERE series = ${name} AND character = ${characterName}
               AND rarity = ${literal(rarity)}
           );`,
        );
      }
    }
  }

  return [
    `CREATE TABLE _catalog_sync_guard (
       valid INTEGER NOT NULL CONSTRAINT catalog_sync_runtime_conflict CHECK (valid = 1)
     );`,
    ...guards,
    ...inserts,
    "DROP TABLE _catalog_sync_guard;",
  ];
}
