import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { MAX_CARD_BATCH_SIZE } from "../../src/shared/card-batch";
import type { AddCardInput } from "../../src/shared/types";
import {
  addCards,
  addPack,
  getActivities,
  getOverview,
  undoActivity,
} from "../../src/worker/db/queries";

function countedDatabase() {
  const queries: string[] = [];
  const database = new Proxy(env.DB, {
    get(target, property) {
      if (property === "prepare") {
        return (sql: string) => {
          queries.push(sql);
          return target.prepare(sql);
        };
      }
      const value = Reflect.get(target, property);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
  return { database, queries };
}

async function distinctCards(): Promise<AddCardInput[]> {
  return (
    await env.DB.prepare(
      `SELECT c.series, c.character, c.rarity
       FROM card_catalog c JOIN series s ON s.name = c.series
       WHERE s.volume_number = 1
       ORDER BY c.id LIMIT ?`,
    )
      .bind(MAX_CARD_BATCH_SIZE)
      .all<AddCardInput>()
  ).results;
}

describe("set-based inventory queries", () => {
  it("adds 100 distinct card types with one lookup and three writes", async () => {
    const cards = await distinctCards();
    expect(cards).toHaveLength(MAX_CARD_BATCH_SIZE);
    const { database, queries } = countedDatabase();
    const ids = await addCards(database, cards);
    expect(ids).toHaveLength(MAX_CARD_BATCH_SIZE);
    expect(new Set(ids).size).toBe(MAX_CARD_BATCH_SIZE);
    expect(queries).toHaveLength(4);
    const saved = (
      await env.DB.prepare(
        `SELECT c.series, c.character, c.rarity
         FROM cards k JOIN card_catalog c ON c.id = k.catalog_id
         WHERE k.id IN (SELECT value FROM json_each(?)) ORDER BY k.id`,
      )
        .bind(JSON.stringify(ids))
        .all<AddCardInput>()
    ).results;
    expect(saved).toEqual(cards);
  });

  it("keeps one pack atomic with a fixed SQL statement count", async () => {
    const { database, queries } = countedDatabase();
    const result = await addPack(database, await distinctCards(), {
      volume: 1,
      openedAt: "2026-09-05",
      cost: 1000,
    });
    expect(result.ids).toHaveLength(MAX_CARD_BATCH_SIZE);
    expect(queries).toHaveLength(6);
    const event = (await getActivities(env.DB)).find(
      (entry) =>
        entry.kind === "opening" && entry.sourceId === result.opening.id,
    );
    if (!event) throw new Error("pack event is missing");
    expect(event.canUndo).toBe(true);
    await undoActivity(env.DB, event.id);
    expect(
      await env.DB.prepare(
        "SELECT COUNT(*) AS count FROM cards WHERE opening_id = ?",
      )
        .bind(result.opening.id)
        .first(),
    ).toEqual({ count: 0 });
  });

  it("groups equivalent activity lines without losing per-card prices", async () => {
    const cards = Array.from(
      { length: MAX_CARD_BATCH_SIZE },
      (_, index): AddCardInput => ({
        series: "KILLER",
        character: "Rei",
        rarity: "UR",
        source: "purchase",
        purchasePrice: index < 50 ? 10 : 20,
        note: "batch",
      }),
    );
    const ids = await addCards(env.DB, cards);
    const event = await env.DB.prepare(
      "SELECT acquired_event_id AS id FROM cards WHERE id = ?",
    )
      .bind(ids[0])
      .first<{ id: number }>();
    if (!event) throw new Error("purchase event is missing");
    const lines = await env.DB.prepare(
      `SELECT qty, delta, unit_amount AS price, note FROM activity_event_lines
       WHERE event_id = ? ORDER BY unit_amount`,
    )
      .bind(event.id)
      .all();
    expect(lines.results).toEqual([
      { qty: 50, delta: 50, price: 10, note: "batch" },
      { qty: 50, delta: 50, price: 20, note: "batch" },
    ]);
    const costs = await env.DB.prepare(
      "SELECT SUM(purchase_price) AS total FROM cards WHERE acquired_event_id = ?",
    )
      .bind(event.id)
      .first();
    expect(costs).toEqual({ total: 1500 });
    await undoActivity(env.DB, event.id);
  });

  it("builds progress from the same single-query overview snapshot", async () => {
    const { database, queries } = countedDatabase();
    const overview = await getOverview(database);
    expect(queries).toHaveLength(1);
    for (const progress of overview.progress) {
      const cells = overview.cells.filter(
        (cell) => cell.series === progress.series,
      );
      expect(progress.totalTypes).toBe(cells.length);
      expect(progress.collectedTypes).toBe(
        cells.filter((cell) => cell.owned > 0).length,
      );
    }
  });
});
