import { SELF, env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import type {
  ActivityEvent,
  MissingEntry,
  OverviewResponse,
} from "../../src/shared/types";

const send = (method: string, path: string, body?: unknown) =>
  SELF.fetch(`https://example.com${path}`, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

const getJson = async <T>(path: string): Promise<T> =>
  (await SELF.fetch(`https://example.com${path}`)).json() as Promise<T>;

describe("catalog Want API", () => {
  it("keeps explicit Want independent from missing and records scoped activity", async () => {
    const missing = await getJson<MissingEntry[]>("/api/missing");
    const target = missing[0];
    expect(target).toBeDefined();

    const created = await send(
      "PUT",
      `/api/admin/catalog/${target.catalogId}/want`,
      { wantCount: 2 },
    );
    expect(created.status).toBe(200);
    await expect(created.json()).resolves.toEqual({ wantCount: 2 });

    const overview = await getJson<OverviewResponse>("/api/overview");
    expect(
      overview.cells.find((cell) => cell.catalogId === target.catalogId),
    ).toMatchObject({
      owned: 0,
      wantCount: 2,
      incomingTrade: 0,
      incomingPurchase: 0,
    });

    const stillMissing = await getJson<MissingEntry[]>("/api/missing");
    expect(stillMissing).toContainEqual(target);

    const activities = await getJson<ActivityEvent[]>(
      `/api/admin/catalog/${target.catalogId}/activities?limit=50`,
    );
    expect(activities[0]).toMatchObject({
      kind: "want_updated",
      sourceType: "catalog",
      sourceId: target.catalogId,
      canUndo: false,
      lines: [
        expect.objectContaining({
          catalogId: target.catalogId,
          action: "wanted",
          beforeWant: 0,
          afterWant: 2,
        }),
      ],
    });
    expect(
      activities.every((event) =>
        event.lines.every((line) => line.catalogId === target.catalogId),
      ),
    ).toBe(true);

    const unchanged = await send(
      "PUT",
      `/api/admin/catalog/${target.catalogId}/want`,
      { wantCount: 2 },
    );
    expect(unchanged.status).toBe(200);
    const afterNoop = await getJson<ActivityEvent[]>(
      `/api/admin/catalog/${target.catalogId}/activities?limit=50`,
    );
    expect(
      afterNoop.filter((event) => event.kind === "want_updated"),
    ).toHaveLength(1);

    const cleared = await send(
      "PUT",
      `/api/admin/catalog/${target.catalogId}/want`,
      { wantCount: 0 },
    );
    expect(cleared.status).toBe(200);
    const stored = await env.DB.prepare(
      "SELECT desired_count FROM catalog_wants WHERE catalog_id = ?",
    )
      .bind(target.catalogId)
      .first();
    expect(stored).toBeNull();

    const afterClear = await getJson<ActivityEvent[]>(
      `/api/admin/catalog/${target.catalogId}/activities?limit=50`,
    );
    expect(afterClear[0]).toMatchObject({
      kind: "want_updated",
      lines: [expect.objectContaining({ beforeWant: 2, afterWant: 0 })],
    });
  });

  it.each([-1, 1.5, 100, "2", null])(
    "rejects an invalid Want target (%s)",
    async (wantCount) => {
      const response = await send("PUT", "/api/admin/catalog/1/want", {
        wantCount,
      });
      expect(response.status).toBe(400);
    },
  );

  it("rejects bad and unknown catalog ids", async () => {
    expect(
      (await send("PUT", "/api/admin/catalog/0/want", { wantCount: 1 })).status,
    ).toBe(400);
    expect(
      (await send("PUT", "/api/admin/catalog/999999/want", { wantCount: 1 }))
        .status,
    ).toBe(404);
    expect(
      (
        await SELF.fetch(
          "https://example.com/api/admin/catalog/nope/activities",
        )
      ).status,
    ).toBe(400);
  });

  it("summarizes pending trade and purchase arrivals per catalog slot", async () => {
    const missing = await getJson<MissingEntry[]>("/api/missing");
    const target = missing.find(
      (entry) =>
        entry.series !== "KILLER" ||
        entry.character !== "Rei" ||
        entry.rarity !== "UR",
    );
    expect(target).toBeDefined();
    if (!target) throw new Error("expected at least one missing target");

    const added = await send("POST", "/api/admin/cards", {
      cards: [{ series: "KILLER", character: "Rei", rarity: "UR" }],
    });
    expect(added.status).toBe(200);

    const trade = await send("POST", "/api/admin/pending-trades", {
      reservedAt: "2026-09-02",
      give: [{ series: "KILLER", character: "Rei", rarity: "UR", qty: 1 }],
      receive: [
        {
          series: target.series,
          character: target.character,
          rarity: target.rarity,
          qty: 2,
        },
      ],
    });
    expect(trade.status).toBe(200);

    const purchase = await send("POST", "/api/admin/pending-purchases", {
      orderedAt: "2026-09-02",
      lines: [
        {
          series: target.series,
          character: target.character,
          rarity: target.rarity,
          qty: 3,
          unitPrice: 0,
        },
      ],
    });
    expect(purchase.status).toBe(200);

    const overview = await getJson<OverviewResponse>("/api/overview");
    expect(
      overview.cells.find((cell) => cell.catalogId === target.catalogId),
    ).toMatchObject({ incomingTrade: 2, incomingPurchase: 3 });
  });
});
