import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";

describe("seed applied to D1", () => {
  it("catalog seeded with 180 rows", async () => {
    const row = await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM card_catalog",
    ).first<{ n: number }>();
    expect(row?.n).toBe(180);
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
