import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import {
  getMarket,
  getMissing,
  getOverview,
  getStats,
} from "../../src/worker/db/queries";

describe("read queries", () => {
  it("overview has one cell per catalog type and correct per-series progress", async () => {
    const o = await getOverview(env.DB);
    const counts = await env.DB.prepare(
      "SELECT series, COUNT(*) AS totalTypes FROM card_catalog GROUP BY series",
    ).all<{ series: string; totalTypes: number }>();
    expect(o.cells).toHaveLength(
      counts.results.reduce((total, series) => total + series.totalTypes, 0),
    );
    for (const series of counts.results) {
      expect(
        o.progress.find((progress) => progress.series === series.series),
      ).toMatchObject(series);
    }

    const ny = o.progress.find((p) => p.series === "NEW YEAR");
    expect(ny?.collectedTypes).toBe(29); // from the Sheet 收藏總覽 tab
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
    // total types minus distinct collected; sanity bound.
    const catalog = await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM card_catalog",
    ).first<{ n: number }>();
    expect(m.length).toBeLessThan(catalog?.n ?? 0);
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

  it("stats pull rates cover all five rarities and sum to ~100%", async () => {
    const s = await getStats(env.DB);
    expect(s.pullRates).toHaveLength(5);
    expect(s.pullRates.map((row) => row.rarity)).toEqual([
      "R",
      "SR",
      "SSR",
      "UR",
      "EX",
    ]);
    const total = s.pullRates.reduce((a, r) => a + r.pct, 0);
    expect(Math.round(total)).toBe(100);
    expect(s.byRarity.reduce((a, r) => a + r.count, 0)).toBe(258);
  });
});
