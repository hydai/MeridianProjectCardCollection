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
});
