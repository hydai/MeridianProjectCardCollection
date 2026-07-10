import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import {
  cancelPurchaseReservation,
  completePurchaseReservation,
  createPurchaseReservation,
  getAdminPendingPurchases,
  getPublicPendingPurchases,
  listCards,
} from "../../src/worker/db/queries";

const sample = {
  seller: "Card Shop",
  orderedAt: "2026-07-10",
  note: "private order note",
  lines: [
    {
      series: "KILLER",
      character: "Mizuki",
      rarity: "R",
      qty: 2,
      unitPrice: 35,
    } as const,
    {
      series: "BUNNY GIRL",
      character: "Hitomi",
      rarity: "UR",
      qty: 1,
      unitPrice: 120,
    } as const,
  ],
};

const cardCount = async () =>
  (
    await env.DB.prepare("SELECT COUNT(*) AS count FROM cards").first<{
      count: number;
    }>()
  )?.count ?? 0;

describe("pending purchase queries", () => {
  it("creates a pending purchase without adding physical cards", async () => {
    const before = await cardCount();
    const id = await createPurchaseReservation(env.DB, sample);

    expect(await cardCount()).toBe(before);
    const purchase = (await getAdminPendingPurchases(env.DB)).find(
      (entry) => entry.id === id,
    );
    expect(purchase).toMatchObject({
      seller: "Card Shop",
      orderedAt: "2026-07-10",
      note: "private order note",
    });
    expect(purchase?.lines).toHaveLength(2);
    expect(purchase?.lines.find((line) => line.unitPrice === 35)).toMatchObject(
      {
        catalogId: expect.any(Number),
        qty: 2,
        unitPrice: 35,
      },
    );
  });

  it("does not expose seller, note, or unit price in public results", async () => {
    const id = await createPurchaseReservation(env.DB, sample);
    const purchase = (await getPublicPendingPurchases(env.DB)).find(
      (entry) => entry.id === id,
    ) as Record<string, unknown> | undefined;

    expect(purchase).toBeTruthy();
    expect("seller" in (purchase ?? {})).toBe(false);
    expect("note" in (purchase ?? {})).toBe(false);
    const line = (purchase?.lines as Array<Record<string, unknown>>)[0];
    expect("unitPrice" in line).toBe(false);
  });

  it("adds purchased cards with their unit prices only when completed", async () => {
    const before = await cardCount();
    const id = await createPurchaseReservation(env.DB, sample);
    await completePurchaseReservation(env.DB, id);

    expect(await cardCount()).toBe(before + 3);
    const cards = (
      await env.DB.prepare(
        `SELECT c.series, c.character, c.rarity, k.status, k.source,
                k.purchase_price AS purchasePrice,
                k.purchase_reservation_id AS purchaseReservationId
         FROM cards k
         JOIN card_catalog c ON c.id = k.catalog_id
         WHERE k.source = 'purchase'
         ORDER BY k.id DESC
         LIMIT 3`,
      ).all<{
        series: string;
        character: string;
        rarity: string;
        status: string;
        source: string;
        purchasePrice: number;
        purchaseReservationId: number;
      }>()
    ).results;
    expect(cards.filter((card) => card.purchasePrice === 35)).toHaveLength(2);
    expect(cards.filter((card) => card.purchasePrice === 120)).toHaveLength(1);
    expect(cards.every((card) => card.status === "owned")).toBe(true);
    expect(cards.every((card) => card.purchaseReservationId === id)).toBe(true);
    expect(
      (await getAdminPendingPurchases(env.DB)).some((p) => p.id === id),
    ).toBe(false);
    const order = await env.DB.prepare(
      `SELECT status, seller, ordered_at AS orderedAt, note, received_at AS receivedAt
       FROM purchase_reservations WHERE id = ?`,
    )
      .bind(id)
      .first<{
        status: string;
        seller: string;
        orderedAt: string;
        note: string;
        receivedAt: string;
      }>();
    expect(order).toMatchObject({
      status: "received",
      seller: "Card Shop",
      orderedAt: "2026-07-10",
      note: "private order note",
    });
    expect(order?.receivedAt).toBeTruthy();
    const lines = await env.DB.prepare(
      "SELECT COUNT(*) AS count FROM purchase_reservation_lines WHERE reservation_id = ?",
    )
      .bind(id)
      .first<{ count: number }>();
    expect(lines?.count).toBe(2);

    const managedCard = (await listCards(env.DB)).find(
      (card) =>
        card.source === "purchase" &&
        card.purchaseSeller === "Card Shop" &&
        card.purchaseOrderedAt === "2026-07-10",
    );
    expect(managedCard?.purchaseNote).toBe("private order note");
  });

  it("prevents duplicate cards when completion is submitted concurrently", async () => {
    const before = await cardCount();
    const id = await createPurchaseReservation(env.DB, {
      orderedAt: "2026-07-10",
      lines: [
        {
          series: "NEW YEAR",
          character: "Sachi",
          rarity: "SR",
          qty: 2,
          unitPrice: 50,
        },
      ],
    });

    const attempts = await Promise.allSettled([
      completePurchaseReservation(env.DB, id),
      completePurchaseReservation(env.DB, id),
    ]);

    expect(
      attempts.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    expect(await cardCount()).toBe(before + 2);
  });

  it("cancels without adding cards and retains the order audit trail", async () => {
    const before = await cardCount();
    const id = await createPurchaseReservation(env.DB, sample);
    await cancelPurchaseReservation(env.DB, id);

    expect(await cardCount()).toBe(before);
    expect(
      (await getAdminPendingPurchases(env.DB)).some((p) => p.id === id),
    ).toBe(false);
    const lines = await env.DB.prepare(
      "SELECT COUNT(*) AS count FROM purchase_reservation_lines WHERE reservation_id = ?",
    )
      .bind(id)
      .first<{ count: number }>();
    expect(lines?.count).toBe(2);
    const order = await env.DB.prepare(
      "SELECT status, cancelled_at AS cancelledAt FROM purchase_reservations WHERE id = ?",
    )
      .bind(id)
      .first<{ status: string; cancelledAt: string }>();
    expect(order?.status).toBe("cancelled");
    expect(order?.cancelledAt).toBeTruthy();
  });

  it("rejects invalid quantities, prices, empty lines, and unknown cards", async () => {
    await expect(
      createPurchaseReservation(env.DB, { ...sample, lines: [] }),
    ).rejects.toThrow("at least one purchase line required");
    await expect(
      createPurchaseReservation(env.DB, {
        ...sample,
        lines: [{ ...sample.lines[0], qty: 0 }],
      }),
    ).rejects.toThrow("qty must be an integer between 1 and 99");
    await expect(
      createPurchaseReservation(env.DB, {
        ...sample,
        lines: [{ ...sample.lines[0], qty: 100 }],
      }),
    ).rejects.toThrow("qty must be an integer between 1 and 99");
    await expect(
      createPurchaseReservation(env.DB, {
        ...sample,
        lines: [{ ...sample.lines[0], unitPrice: -1 }],
      }),
    ).rejects.toThrow("unitPrice must be finite and nonnegative");
    await expect(
      createPurchaseReservation(env.DB, {
        ...sample,
        lines: [{ ...sample.lines[0], character: "not in catalog" }],
      }),
    ).rejects.toThrow("unknown card type");
  });
});
