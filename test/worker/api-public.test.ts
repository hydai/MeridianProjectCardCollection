import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { SERIES, buildCatalog } from "../../seed/catalog-def";

describe("public api", () => {
  it("GET /api/overview returns one cell per catalog type", async () => {
    const res = await SELF.fetch("https://example.com/api/overview");
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      cells: unknown[];
      progress: unknown[];
    };
    expect(body.cells).toHaveLength(buildCatalog().length);
    expect(body.progress).toHaveLength(SERIES.length);
  });

  it("GET /api/stats returns four pull rates", async () => {
    const res = await SELF.fetch("https://example.com/api/stats");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { pullRates: unknown[] };
    expect(body.pullRates).toHaveLength(4);
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
