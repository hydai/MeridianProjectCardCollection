import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";

describe("0004 pending trade schema", () => {
  it("creates the two reservation tables", async () => {
    const names = (
      await env.DB.prepare(
        `SELECT name FROM sqlite_master WHERE type='table'
         AND name IN ('trade_reservations','trade_reservation_lines')`,
      ).all<{ name: string }>()
    ).results.map((r) => r.name);
    expect(names).toContain("trade_reservations");
    expect(names).toContain("trade_reservation_lines");
  });

  it("accepts an insert with a catalog FK and defaults qty to 1", async () => {
    const cat = await env.DB.prepare(
      "SELECT id FROM card_catalog LIMIT 1",
    ).first<{ id: number }>();
    const r = await env.DB.prepare(
      "INSERT INTO trade_reservations (reserved_at) VALUES ('2026-06-27') RETURNING id",
    ).first<{ id: number }>();
    await env.DB.prepare(
      "INSERT INTO trade_reservation_lines (reservation_id, direction, catalog_id) VALUES (?, 'give', ?)",
    )
      .bind(r?.id, cat?.id)
      .run();
    const line = await env.DB.prepare(
      "SELECT qty FROM trade_reservation_lines WHERE reservation_id = ?",
    )
      .bind(r?.id)
      .first<{ qty: number }>();
    expect(line?.qty).toBe(1);
  });
});
