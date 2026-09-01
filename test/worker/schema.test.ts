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
});
