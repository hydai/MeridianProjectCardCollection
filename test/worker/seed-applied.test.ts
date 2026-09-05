import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { buildCatalog } from "../../seed/catalog-def";

describe("seed applied to D1", () => {
  it("retains the historical catalog alongside later additions", async () => {
    const rows = await env.DB.prepare(
      "SELECT series, character, rarity FROM card_catalog",
    ).all();
    expect(rows.results).toEqual(
      expect.arrayContaining(
        buildCatalog().map(({ sortOrder, ...identity }) => identity),
      ),
    );
  });

  it("collection imported with 258 owned cards (18 purchased)", async () => {
    const owned = await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM cards WHERE status='owned'",
    ).first<{ n: number }>();
    expect(owned?.n).toBe(258);

    const purchased = await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM cards WHERE source='purchase'",
    ).first<{ n: number }>();
    expect(purchased?.n).toBe(18);
  });
});
