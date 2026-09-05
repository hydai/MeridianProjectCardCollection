import { SELF, env } from "cloudflare:test";
import { describe, expect, it } from "vitest";

describe("public api", () => {
  it("GET /api/overview returns one cell per catalog type", async () => {
    const res = await SELF.fetch("https://example.com/api/overview");
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      cells: unknown[];
      progress: unknown[];
    };
    const counts = await env.DB.prepare(
      "SELECT COUNT(*) AS types, COUNT(DISTINCT series) AS series FROM card_catalog",
    ).first<{ types: number; series: number }>();
    expect(body.cells.length).toBe(counts?.types);
    expect(body.progress.length).toBe(counts?.series);
  });

  it("GET /api/stats returns all five pull rates", async () => {
    const res = await SELF.fetch("https://example.com/api/stats");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { pullRates: unknown[] };
    expect(body.pullRates).toHaveLength(5);
  });

  it("GET /api/missing and /api/market respond 200 with arrays", async () => {
    const missing = await SELF.fetch("https://example.com/api/missing");
    const market = await SELF.fetch("https://example.com/api/market");
    expect(missing.status).toBe(200);
    expect(market.status).toBe(200);
    expect(Array.isArray(await missing.json())).toBe(true);
    expect(Array.isArray(await market.json())).toBe(true);
  });
});
