import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import type {
  ActivityEvent,
  MissingEntry,
  OverviewResponse,
  TradePost,
  TradePostCandidates,
} from "../../src/shared/types";

const request = (method: string, path: string, body?: unknown) =>
  SELF.fetch(`https://example.com${path}`, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

const getJson = async <T>(path: string): Promise<T> =>
  (await SELF.fetch(`https://example.com${path}`)).json() as Promise<T>;

describe("shareable exchange announcements", () => {
  it("keeps a published snapshot readable and marks changed availability stale", async () => {
    const overview = await getJson<OverviewResponse>("/api/overview");
    const giveCatalog = overview.cells.find(
      (cell) =>
        cell.series === "KILLER" &&
        cell.character === "Rei" &&
        cell.rarity === "UR",
    );
    expect(giveCatalog).toBeDefined();

    const missing = await getJson<MissingEntry[]>("/api/missing");
    const wanted = missing.find(
      (entry) => entry.catalogId !== giveCatalog?.catalogId,
    );
    expect(wanted).toBeDefined();
    if (!giveCatalog || !wanted) throw new Error("expected catalog fixtures");

    const added = await request("POST", "/api/admin/cards", {
      cards: [{ series: "KILLER", character: "Rei", rarity: "UR" }],
    });
    const addedBody = (await added.json()) as { ids: number[] };
    expect(added.status).toBe(200);
    expect(
      (
        await request("PATCH", `/api/admin/cards/${addedBody.ids[0]}`, {
          status: "for_trade",
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await request("PUT", `/api/admin/catalog/${wanted.catalogId}/want`, {
          wantCount: 2,
        })
      ).status,
    ).toBe(200);

    const candidates = await getJson<TradePostCandidates>(
      "/api/admin/trade-posts/candidates",
    );
    expect(candidates.give).toContainEqual(
      expect.objectContaining({
        catalogId: giveCatalog.catalogId,
        availableQty: 1,
      }),
    );
    expect(candidates.want).toContainEqual(
      expect.objectContaining({ catalogId: wanted.catalogId, availableQty: 2 }),
    );

    const createdResponse = await request("POST", "/api/admin/trade-posts", {
      note: "可約台北面交",
      give: [{ catalogId: giveCatalog.catalogId, qty: 1 }],
      want: [{ catalogId: wanted.catalogId, qty: 2 }],
    });
    expect(createdResponse.status).toBe(201);
    const draft = (await createdResponse.json()) as TradePost;
    expect(draft).toMatchObject({
      status: "draft",
      stale: false,
      note: "可約台北面交",
    });
    expect(await getJson<TradePost[]>("/api/trade-posts")).toEqual([]);
    expect(
      (
        await SELF.fetch(
          `https://example.com/api/trade-posts/${draft.publicId}`,
        )
      ).status,
    ).toBe(404);

    const publishedResponse = await request(
      "POST",
      `/api/admin/trade-posts/${draft.id}/publish`,
      {},
    );
    expect(publishedResponse.status).toBe(200);
    const published = (await publishedResponse.json()) as TradePost;
    expect(published).toMatchObject({
      publicId: draft.publicId,
      status: "published",
      stale: false,
    });
    expect(published.give[0]).toMatchObject({
      series: "KILLER",
      character: "Rei",
      rarity: "UR",
      qty: 1,
      availableQty: 1,
      stale: false,
    });
    expect(published.want[0]).toMatchObject({
      catalogId: wanted.catalogId,
      qty: 2,
      availableQty: 2,
      stale: false,
    });
    expect(
      (
        await request("PUT", `/api/admin/trade-posts/${draft.id}`, {
          note: "公開後不可修改",
          give: [{ catalogId: giveCatalog.catalogId, qty: 1 }],
          want: [],
        })
      ).status,
    ).toBe(409);
    expect(
      (await request("DELETE", `/api/admin/trade-posts/${draft.id}`)).status,
    ).toBe(409);

    const publicList = await getJson<TradePost[]>("/api/trade-posts");
    expect(publicList).toHaveLength(1);
    const publicPost = await getJson<TradePost>(
      `/api/trade-posts/${draft.publicId}`,
    );
    expect(publicPost.note).toBe("可約台北面交");

    const publishActivity = (
      await getJson<ActivityEvent[]>("/api/admin/activities?limit=20")
    ).find((event) => event.kind === "trade_post_published");
    expect(publishActivity).toMatchObject({
      sourceType: "trade_post",
      sourceId: draft.id,
      lines: expect.arrayContaining([
        expect.objectContaining({ action: "advertised_give", qty: 1 }),
        expect.objectContaining({ action: "advertised_want", qty: 2 }),
      ]),
    });

    expect(
      (
        await request("PATCH", `/api/admin/cards/${addedBody.ids[0]}`, {
          status: "owned",
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await request("PUT", `/api/admin/catalog/${wanted.catalogId}/want`, {
          wantCount: 0,
        })
      ).status,
    ).toBe(200);

    const stale = await getJson<TradePost>(
      `/api/trade-posts/${draft.publicId}`,
    );
    expect(stale.stale).toBe(true);
    expect(stale.give[0]).toMatchObject({ availableQty: 0, stale: true });
    expect(stale.want[0]).toMatchObject({ availableQty: 0, stale: true });
    expect(stale.give[0].series).toBe("KILLER");

    const closedResponse = await request(
      "POST",
      `/api/admin/trade-posts/${draft.id}/close`,
      {},
    );
    expect(closedResponse.status).toBe(200);
    await expect(closedResponse.json()).resolves.toMatchObject({
      status: "closed",
      publicId: draft.publicId,
    });
    expect(await getJson<TradePost[]>("/api/trade-posts")).toEqual([]);
    await expect(
      getJson<TradePost>(`/api/trade-posts/${draft.publicId}`),
    ).resolves.toMatchObject({ status: "closed" });
    const closeActivity = (
      await getJson<ActivityEvent[]>("/api/admin/activities?limit=20")
    ).find((event) => event.kind === "trade_post_closed");
    expect(closeActivity).toMatchObject({
      sourceType: "trade_post",
      sourceId: draft.id,
      lines: expect.arrayContaining([
        expect.objectContaining({ action: "advertised_give", qty: 1 }),
        expect.objectContaining({ action: "advertised_want", qty: 2 }),
      ]),
    });
  });

  it("validates drafts and only allows drafts to be edited or deleted", async () => {
    expect(
      (
        await request("POST", "/api/admin/trade-posts", {
          give: [],
          want: [],
        })
      ).status,
    ).toBe(400);

    const overview = await getJson<OverviewResponse>("/api/overview");
    const target = overview.cells[0];
    expect(
      (
        await request("POST", "/api/admin/trade-posts", {
          give: [
            { catalogId: target.catalogId, qty: 1 },
            { catalogId: target.catalogId, qty: 1 },
          ],
          want: [],
        })
      ).status,
    ).toBe(409);

    const createdResponse = await request("POST", "/api/admin/trade-posts", {
      note: "初稿",
      give: [{ catalogId: target.catalogId, qty: 1 }],
      want: [],
    });
    expect(createdResponse.status).toBe(201);
    const draft = (await createdResponse.json()) as TradePost;
    const updatedResponse = await request(
      "PUT",
      `/api/admin/trade-posts/${draft.id}`,
      {
        note: "已更新草稿",
        give: [{ catalogId: target.catalogId, qty: 2 }],
        want: [],
      },
    );
    expect(updatedResponse.status).toBe(200);
    await expect(updatedResponse.json()).resolves.toMatchObject({
      id: draft.id,
      status: "draft",
      note: "已更新草稿",
      give: [expect.objectContaining({ qty: 2 })],
    });
    expect(
      (await request("DELETE", `/api/admin/trade-posts/${draft.id}`)).status,
    ).toBe(200);
    expect(
      (await getJson<TradePost[]>("/api/admin/trade-posts")).some(
        (post) => post.id === draft.id,
      ),
    ).toBe(false);
  });
});
