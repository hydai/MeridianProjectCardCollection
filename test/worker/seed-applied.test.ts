import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { buildCatalog } from "../../seed/catalog-def";

describe("seed applied to D1", () => {
  it("card_catalog in D1 matches the catalog definition", async () => {
    const row = await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM card_catalog",
    ).first<{ n: number }>();
    expect(row?.n).toBe(buildCatalog().length);
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
