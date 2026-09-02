import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import type {
  ActivityEvent,
  AdminPendingTrade,
  AdminTradePost,
  CardRow,
  MissingEntry,
  OverviewResponse,
  TradePost,
} from "../../src/shared/types";

const request = (method: string, path: string, body?: unknown) =>
  SELF.fetch(`https://example.com${path}`, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

const getJson = async <T>(path: string): Promise<T> =>
  (await SELF.fetch(`https://example.com${path}`)).json() as Promise<T>;

describe("exchange announcement reservation bridge", () => {
  it("creates multiple adjustable reservations and keeps their source traceable", async () => {
    const overview = await getJson<OverviewResponse>("/api/overview");
    const giveCatalog = overview.cells.find(
      (cell) =>
        cell.series === "KILLER" &&
        cell.character === "Rei" &&
        cell.rarity === "UR",
    );
    const wanted = (await getJson<MissingEntry[]>("/api/missing")).find(
      (entry) => entry.catalogId !== giveCatalog?.catalogId,
    );
    const unadvertised = overview.cells.find(
      (cell) =>
        cell.catalogId !== giveCatalog?.catalogId &&
        cell.catalogId !== wanted?.catalogId,
    );
    expect(giveCatalog).toBeDefined();
    expect(wanted).toBeDefined();
    expect(unadvertised).toBeDefined();
    if (!giveCatalog || !wanted || !unadvertised) {
      throw new Error("expected catalog fixtures");
    }

    const added = await request("POST", "/api/admin/cards", {
      cards: [
        { series: "KILLER", character: "Rei", rarity: "UR" },
        { series: "KILLER", character: "Rei", rarity: "UR" },
        { series: "KILLER", character: "Rei", rarity: "UR" },
      ],
    });
    const { ids } = (await added.json()) as { ids: number[] };
    const advertisedCardIds = ids.slice(0, 2);
    const ownedCardId = ids[2];
    for (const id of advertisedCardIds) {
      expect(
        (
          await request("PATCH", `/api/admin/cards/${id}`, {
            status: "for_trade",
          })
        ).status,
      ).toBe(200);
    }
    expect(
      (
        await request("PUT", `/api/admin/catalog/${wanted.catalogId}/want`, {
          wantCount: 2,
        })
      ).status,
    ).toBe(200);

    const created = await request("POST", "/api/admin/trade-posts", {
      note: "分批交換",
      give: [{ catalogId: giveCatalog.catalogId, qty: 2 }],
      want: [{ catalogId: wanted.catalogId, qty: 2 }],
    });
    const draft = (await created.json()) as TradePost;
    expect(
      (await request("POST", `/api/admin/trade-posts/${draft.id}/publish`, {}))
        .status,
    ).toBe(200);

    const reservationBody = {
      counterparty: "Alice",
      reservedAt: "2026-09-03",
      note: "台北面交",
      give: [{ catalogId: giveCatalog.catalogId, qty: 1 }],
      receive: [{ catalogId: wanted.catalogId, qty: 1 }],
    };
    const firstResponse = await request(
      "POST",
      `/api/admin/trade-posts/${draft.id}/reservations`,
      reservationBody,
    );
    expect(firstResponse.status).toBe(201);
    const first = (await firstResponse.json()) as { id: number };

    const pendingAfterFirst = await getJson<AdminPendingTrade[]>(
      "/api/admin/pending-trades",
    );
    expect(pendingAfterFirst.find((row) => row.id === first.id)).toMatchObject({
      tradePostId: draft.id,
      tradePostPublicId: draft.publicId,
      counterparty: "Alice",
    });
    const publicPending = await getJson<Array<Record<string, unknown>>>(
      "/api/pending-trades",
    );
    const publicFirst = publicPending.find((row) => row.id === first.id);
    expect(publicFirst).toBeDefined();
    expect(publicFirst).not.toHaveProperty("tradePostId");
    expect(publicFirst).not.toHaveProperty("tradePostPublicId");

    const firstActivity = (
      await getJson<ActivityEvent[]>("/api/admin/activities?limit=30")
    ).find(
      (event) => event.kind === "trade_reserved" && event.sourceId === first.id,
    );
    expect(firstActivity).toMatchObject({
      tradePostId: draft.id,
      tradePostPublicId: draft.publicId,
    });
    const cardsAfterFirst = await getJson<CardRow[]>("/api/admin/cards");
    expect(
      cardsAfterFirst.find((card) => card.id === ownedCardId)?.reserved,
    ).toBe(false);
    expect(
      cardsAfterFirst.filter(
        (card) => advertisedCardIds.includes(card.id) && card.reserved,
      ),
    ).toHaveLength(1);

    const outsideSnapshot = await request(
      "POST",
      `/api/admin/trade-posts/${draft.id}/reservations`,
      {
        ...reservationBody,
        receive: [{ catalogId: unadvertised.catalogId, qty: 1 }],
      },
    );
    expect(outsideSnapshot.status).toBe(409);

    const secondResponse = await request(
      "POST",
      `/api/admin/trade-posts/${draft.id}/reservations`,
      { ...reservationBody, counterparty: "Bob" },
    );
    expect(secondResponse.status).toBe(201);
    const second = (await secondResponse.json()) as { id: number };

    const exhausted = await request(
      "POST",
      `/api/admin/trade-posts/${draft.id}/reservations`,
      reservationBody,
    );
    expect(exhausted.status).toBe(409);

    const adminPost = (
      await getJson<AdminTradePost[]>("/api/admin/trade-posts")
    ).find((post) => post.id === draft.id);
    expect(adminPost).toMatchObject({
      status: "published",
      reservationCount: 2,
      activeReservationCount: 2,
    });
    expect(
      (await getJson<TradePost[]>("/api/trade-posts")).find(
        (post) => post.id === draft.id,
      )?.status,
    ).toBe("published");

    expect(
      (await request("DELETE", `/api/admin/pending-trades/${first.id}`)).status,
    ).toBe(200);
    expect(
      (
        await request(
          "POST",
          `/api/admin/pending-trades/${second.id}/complete`,
          { happenedAt: "2026-09-04" },
        )
      ).status,
    ).toBe(200);

    const terminalActivities = await getJson<ActivityEvent[]>(
      "/api/admin/activities?limit=40",
    );
    for (const id of [first.id, second.id]) {
      expect(
        terminalActivities.find(
          (event) =>
            event.sourceId === id &&
            ["trade_reservation_cancelled", "trade_completed"].includes(
              event.kind,
            ),
        ),
      ).toMatchObject({
        tradePostId: draft.id,
        tradePostPublicId: draft.publicId,
      });
    }
    expect(
      (await getJson<AdminTradePost[]>("/api/admin/trade-posts")).find(
        (post) => post.id === draft.id,
      ),
    ).toMatchObject({ reservationCount: 2, activeReservationCount: 0 });

    const afterLifecycle = await request(
      "POST",
      `/api/admin/trade-posts/${draft.id}/reservations`,
      { ...reservationBody, counterparty: "Carol" },
    );
    expect(afterLifecycle.status).toBe(201);
    const third = (await afterLifecycle.json()) as { id: number };
    expect(third.id).toBeGreaterThan(second.id);
    expect(
      (await getJson<AdminTradePost[]>("/api/admin/trade-posts")).find(
        (post) => post.id === draft.id,
      ),
    ).toMatchObject({ reservationCount: 3, activeReservationCount: 1 });
    expect(
      (await request("DELETE", `/api/admin/pending-trades/${third.id}`)).status,
    ).toBe(200);

    expect(
      (await request("POST", `/api/admin/trade-posts/${draft.id}/close`, {}))
        .status,
    ).toBe(200);
    expect(
      (
        await request(
          "POST",
          `/api/admin/trade-posts/${draft.id}/reservations`,
          reservationBody,
        )
      ).status,
    ).toBe(409);
  });
});
