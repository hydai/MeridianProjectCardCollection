import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import {
  getMarket,
  getMissing,
  getOverview,
  getStats,
} from "../../src/worker/db/queries";

describe("read queries", () => {
  it("overview has 180 cells and correct per-series progress", async () => {
    const o = await getOverview(env.DB);
    expect(o.cells).toHaveLength(180);

    const ny = o.progress.find((p) => p.series === "NEW YEAR");
    expect(ny?.totalTypes).toBe(44);
    expect(ny?.collectedTypes).toBe(29); // from the Sheet 收藏總覽 tab

    const mp = o.progress.find((p) => p.series === "MP 4TH");
    expect(mp?.totalTypes).toBe(48);
  });

  it("overview owned counts sum to 258 active cards", async () => {
    const o = await getOverview(env.DB);
    const total = o.cells.reduce((a, c) => a + c.owned, 0);
    expect(total).toBe(258);
  });

  it("missing lists catalog types with zero owned", async () => {
    const m = await getMissing(env.DB);
    expect(m.length).toBeGreaterThan(0);
    expect(m.every((x) => x.catalogId > 0)).toBe(true);
    // 180 types minus distinct collected; sanity bound.
    expect(m.length).toBeLessThan(180);
  });

  it("market lists only for_sale/for_trade cards", async () => {
    await env.DB.prepare(
      "UPDATE cards SET status='for_sale', asking_price=300 WHERE id=(SELECT id FROM cards LIMIT 1)",
    ).run();
    const mk = await getMarket(env.DB);
    expect(mk).toHaveLength(1);
    expect(mk[0].askingPrice).toBe(300);
    expect(mk[0].status).toBe("for_sale");
  });

  it("stats pull rates cover four rarities and sum to ~100%", async () => {
    const s = await getStats(env.DB);
    expect(s.pullRates).toHaveLength(4);
    const total = s.pullRates.reduce((a, r) => a + r.pct, 0);
    expect(Math.round(total)).toBe(100);
    expect(s.byRarity.reduce((a, r) => a + r.count, 0)).toBe(258);
  });
});
