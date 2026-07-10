import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";

const send = (method: string, path: string, body?: unknown) =>
  SELF.fetch(`https://example.com${path}`, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

const validPurchase = {
  seller: "Seller A",
  orderedAt: "2026-07-10",
  note: "do not publish",
  lines: [
    {
      series: "KILLER",
      character: "Rei",
      rarity: "UR",
      qty: 1,
      unitPrice: 99,
    },
  ],
};

describe("pending purchase API", () => {
  it("creates and reads admin/public DTOs with private fields omitted publicly", async () => {
    const response = await send(
      "POST",
      "/api/admin/pending-purchases",
      validPurchase,
    );
    expect(response.status).toBe(200);
    const { id } = (await response.json()) as { id: number };

    const admin = (await (
      await SELF.fetch("https://example.com/api/admin/pending-purchases")
    ).json()) as Array<Record<string, unknown>>;
    const adminPurchase = admin.find((purchase) => purchase.id === id);
    expect(adminPurchase).toMatchObject({
      seller: "Seller A",
      note: "do not publish",
    });
    expect(
      (adminPurchase?.lines as Array<Record<string, unknown>>)[0].unitPrice,
    ).toBe(99);

    const publicPurchases = (await (
      await SELF.fetch("https://example.com/api/pending-purchases")
    ).json()) as Array<Record<string, unknown>>;
    const publicPurchase = publicPurchases.find(
      (purchase) => purchase.id === id,
    );
    expect(publicPurchase).toBeTruthy();
    expect("seller" in (publicPurchase ?? {})).toBe(false);
    expect("note" in (publicPurchase ?? {})).toBe(false);
    expect(
      "unitPrice" in
        (publicPurchase?.lines as Array<Record<string, unknown>>)[0],
    ).toBe(false);
  });

  it("completes into physical purchased cards and rejects a repeated completion", async () => {
    const created = await send(
      "POST",
      "/api/admin/pending-purchases",
      validPurchase,
    );
    const { id } = (await created.json()) as { id: number };

    const completed = await send(
      "POST",
      `/api/admin/pending-purchases/${id}/complete`,
    );
    expect(completed.status).toBe(200);
    const repeated = await send(
      "POST",
      `/api/admin/pending-purchases/${id}/complete`,
    );
    expect(repeated.status).toBe(409);

    const cards = (await (
      await SELF.fetch("https://example.com/api/admin/cards")
    ).json()) as Array<Record<string, unknown>>;
    const matching = cards.filter(
      (card) =>
        card.series === "KILLER" &&
        card.character === "Rei" &&
        card.rarity === "UR" &&
        card.source === "purchase" &&
        card.purchasePrice === 99,
    );
    expect(matching).toHaveLength(1);
  });

  it("cancels a pending purchase without creating a card", async () => {
    const created = await send(
      "POST",
      "/api/admin/pending-purchases",
      validPurchase,
    );
    const { id } = (await created.json()) as { id: number };
    const response = await send("DELETE", `/api/admin/pending-purchases/${id}`);
    expect(response.status).toBe(200);

    const pending = (await (
      await SELF.fetch("https://example.com/api/pending-purchases")
    ).json()) as Array<{ id: number }>;
    expect(pending.some((purchase) => purchase.id === id)).toBe(false);
  });

  it.each([
    [{ ...validPurchase, orderedAt: "" }, "orderedAt"],
    [{ ...validPurchase, orderedAt: "2026-02-30" }, "orderedAt"],
    [{ ...validPurchase, seller: 123 }, "seller"],
    [{ ...validPurchase, note: false }, "note"],
    [{ ...validPurchase, lines: [] }, "purchase line"],
    [{ ...validPurchase, lines: [null] }, "purchase line"],
    [
      { ...validPurchase, lines: [{ ...validPurchase.lines[0], series: "" }] },
      "series",
    ],
    [
      {
        ...validPurchase,
        lines: [{ ...validPurchase.lines[0], character: "" }],
      },
      "character",
    ],
    [
      { ...validPurchase, lines: [{ ...validPurchase.lines[0], rarity: "N" }] },
      "rarity",
    ],
    [
      { ...validPurchase, lines: [{ ...validPurchase.lines[0], qty: 1.5 }] },
      "qty",
    ],
    [
      {
        ...validPurchase,
        lines: [{ ...validPurchase.lines[0], unitPrice: -1 }],
      },
      "unitPrice",
    ],
  ])("rejects invalid purchase input with 400 (%s)", async (body, message) => {
    const response = await send("POST", "/api/admin/pending-purchases", body);
    expect(response.status).toBe(400);
    expect(await response.text()).toContain(message);
  });

  it("rejects malformed JSON, unknown cards, and bad ids", async () => {
    const malformed = await SELF.fetch(
      "https://example.com/api/admin/pending-purchases",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{",
      },
    );
    expect(malformed.status).toBe(400);

    const unknown = await send("POST", "/api/admin/pending-purchases", {
      ...validPurchase,
      lines: [{ ...validPurchase.lines[0], character: "unknown" }],
    });
    expect(unknown.status).toBe(409);

    expect(
      (await send("POST", "/api/admin/pending-purchases/0/complete")).status,
    ).toBe(400);
    expect(
      (await send("DELETE", "/api/admin/pending-purchases/-1")).status,
    ).toBe(400);
  });
});
