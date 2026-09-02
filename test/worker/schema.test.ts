import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";

describe("schema", () => {
  it("creates all tables", async () => {
    const { results } = await env.DB.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name",
    ).all<{ name: string }>();
    const names = results.map((r) => r.name);
    for (const t of [
      "card_catalog",
      "cards",
      "openings",
      "series",
      "transactions",
    ]) {
      expect(names).toContain(t);
    }
  });

  it("indexes exist on cards and transactions", async () => {
    const { results } = await env.DB.prepare(
      "SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_%'",
    ).all<{ name: string }>();
    const names = results.map((r) => r.name);
    for (const i of [
      "idx_cards_catalog",
      "idx_cards_status",
      "idx_cards_opening",
      "idx_txn_card",
    ]) {
      expect(names).toContain(i);
    }
  });

  it("adds volume, pack, purchase, and physical reservation fields", async () => {
    const columns = async (table: string) =>
      (
        await env.DB.prepare(`PRAGMA table_info(${table})`).all<{
          name: string;
        }>()
      ).results.map((column) => column.name);

    expect(await columns("series")).toContain("volume_number");
    expect(await columns("openings")).toContain("volume_number");
    expect(await columns("openings")).toContain("pack_number");
    expect(await columns("cards")).toContain("purchase_price");
    expect(await columns("trade_reservation_lines")).toContain("card_id");

    const indexes = (
      await env.DB.prepare(
        `SELECT name FROM sqlite_master
         WHERE type = 'index'
           AND name IN ('idx_openings_volume_pack','idx_resv_lines_give_card')`,
      ).all<{ name: string }>()
    ).results.map((row) => row.name);
    expect(indexes).toEqual(
      expect.arrayContaining([
        "idx_openings_volume_pack",
        "idx_resv_lines_give_card",
      ]),
    );
  });

  it("adds the held flag and its partial index", async () => {
    const columns = (
      await env.DB.prepare("PRAGMA table_info(cards)").all<{
        name: string;
        dflt_value: string | null;
        notnull: number;
      }>()
    ).results;
    const held = columns.find((column) => column.name === "held");
    expect(held).toBeDefined();
    expect(held?.notnull).toBe(1);
    expect(held?.dflt_value).toBe("0");

    const indexes = (
      await env.DB.prepare(
        "SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'idx_cards_held'",
      ).all<{ name: string }>()
    ).results.map((row) => row.name);
    expect(indexes).toContain("idx_cards_held");
  });

  it("adds the append-only activity tables and acquisition link", async () => {
    const tables = (
      await env.DB.prepare(
        `SELECT name FROM sqlite_master
         WHERE type = 'table'
           AND name IN ('activity_events', 'activity_event_lines')`,
      ).all<{ name: string }>()
    ).results.map((row) => row.name);
    expect(tables).toEqual(
      expect.arrayContaining(["activity_events", "activity_event_lines"]),
    );

    const cardColumns = (
      await env.DB.prepare("PRAGMA table_info(cards)").all<{ name: string }>()
    ).results.map((column) => column.name);
    expect(cardColumns).toContain("acquired_event_id");

    const indexes = (
      await env.DB.prepare(
        `SELECT name FROM sqlite_master
         WHERE type = 'index'
           AND name IN (
             'idx_activity_events_occurred',
             'idx_cards_acquired_event',
             'idx_txn_received_card'
           )`,
      ).all<{ name: string }>()
    ).results.map((row) => row.name);
    expect(indexes).toEqual(
      expect.arrayContaining([
        "idx_activity_events_occurred",
        "idx_cards_acquired_event",
        "idx_txn_received_card",
      ]),
    );
  });

  it("adds explicit catalog Wants and their activity snapshots", async () => {
    const tables = (
      await env.DB.prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'catalog_wants'",
      ).all<{ name: string }>()
    ).results.map((row) => row.name);
    expect(tables).toContain("catalog_wants");

    const wantColumns = (
      await env.DB.prepare("PRAGMA table_info(catalog_wants)").all<{
        name: string;
      }>()
    ).results.map((column) => column.name);
    expect(wantColumns).toEqual(
      expect.arrayContaining(["catalog_id", "desired_count", "updated_at"]),
    );

    const activityColumns = (
      await env.DB.prepare("PRAGMA table_info(activity_event_lines)").all<{
        name: string;
      }>()
    ).results.map((column) => column.name);
    expect(activityColumns).toEqual(
      expect.arrayContaining(["before_want", "after_want"]),
    );
  });

  it("adds durable exchange-announcement snapshots", async () => {
    const tables = (
      await env.DB.prepare(
        `SELECT name FROM sqlite_master
         WHERE type = 'table'
           AND name IN ('trade_posts', 'trade_post_lines')`,
      ).all<{ name: string }>()
    ).results.map((row) => row.name);
    expect(tables).toEqual(
      expect.arrayContaining(["trade_posts", "trade_post_lines"]),
    );

    const postColumns = (
      await env.DB.prepare("PRAGMA table_info(trade_posts)").all<{
        name: string;
      }>()
    ).results.map((column) => column.name);
    expect(postColumns).toEqual(
      expect.arrayContaining([
        "public_id",
        "status",
        "published_at",
        "closed_at",
      ]),
    );

    const lineColumns = (
      await env.DB.prepare("PRAGMA table_info(trade_post_lines)").all<{
        name: string;
      }>()
    ).results.map((column) => column.name);
    expect(lineColumns).toEqual(
      expect.arrayContaining([
        "direction",
        "catalog_id",
        "snapshot_series",
        "snapshot_character",
        "snapshot_rarity",
        "qty",
      ]),
    );
  });
});
