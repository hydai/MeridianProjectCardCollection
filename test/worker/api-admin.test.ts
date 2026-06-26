import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";

const post = (path: string, body: unknown) =>
  SELF.fetch(`https://example.com${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

const getJson = async <T>(path: string): Promise<T> =>
  (await SELF.fetch(`https://example.com${path}`)).json() as Promise<T>;

describe("admin api", () => {
  it("POST /api/admin/cards adds cards", async () => {
    const res = await post("/api/admin/cards", {
      cards: [{ series: "KILLER", character: "Rei", rarity: "UR" }],
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ids: number[] };
    expect(body.ids).toHaveLength(1);
  });

  it("POST /api/admin/cards with an opening computes average cost", async () => {
    await post("/api/admin/cards", {
      cards: [
        { series: "MP 4TH", character: "KSP", rarity: "SR" },
        { series: "MP 4TH", character: "KSP", rarity: "R" },
      ],
      opening: { series: "MP 4TH", openedAt: "2026-06-20", cost: 500 },
    });
    const openings = await getJson<
      Array<{ cardCount: number; avgCost: number | null }>
    >("/api/admin/openings");
    expect(openings[0].cardCount).toBe(2);
    expect(openings[0].avgCost).toBe(250);
  });

  it("POST /api/admin/transactions records a sale into history", async () => {
    const add = (await (
      await post("/api/admin/cards", {
        cards: [{ series: "NEW YEAR", character: "Sachi", rarity: "R" }],
      })
    ).json()) as { ids: number[] };
    const res = await post("/api/admin/transactions", {
      cardId: add.ids[0],
      type: "sale",
      price: 200,
      counterparty: "Carol",
      happenedAt: "2026-06-21",
    });
    expect(res.status).toBe(200);
    const txns = await getJson<Array<{ counterparty: string | null }>>(
      "/api/admin/transactions",
    );
    expect(txns.some((t) => t.counterparty === "Carol")).toBe(true);
  });

  it("PATCH /api/admin/cards/:id lists a card for sale on the public market", async () => {
    const add = (await (
      await post("/api/admin/cards", {
        cards: [{ series: "KILLER", character: "998", rarity: "SSR" }],
      })
    ).json()) as { ids: number[] };
    const id = add.ids[0];
    const res = await SELF.fetch(`https://example.com/api/admin/cards/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: "for_sale", askingPrice: 350 }),
    });
    expect(res.status).toBe(200);
    const market =
      await getJson<Array<{ cardId: number; askingPrice: number | null }>>(
        "/api/market",
      );
    expect(market.some((m) => m.cardId === id && m.askingPrice === 350)).toBe(
      true,
    );
  });
});
