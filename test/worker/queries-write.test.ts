import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import type { OverviewCell } from "../../src/shared/types";
import {
  addCards,
  createOpening,
  getActivities,
  getOpenings,
  getOverview,
  getTransactions,
  listCards,
  reclassifyCard,
  recordTransaction,
  updateCard,
} from "../../src/worker/db/queries";

const ownedOf = (
  cells: OverviewCell[],
  series: string,
  character: string,
  rarity: string,
) =>
  cells.find(
    (c) =>
      c.series === series && c.character === character && c.rarity === rarity,
  )?.owned ?? 0;

describe("mutations", () => {
  it("addCards inserts and links to an opening; cost analysis averages", async () => {
    const opening = await createOpening(env.DB, {
      volume: 1,
      openedAt: "2026-06-01",
      cost: 600,
    });
    const ids = await addCards(
      env.DB,
      [
        { series: "KILLER", character: "Rei", rarity: "SR" },
        { series: "BUNNY GIRL", character: "Mizuki", rarity: "R" },
      ],
      opening.id,
    );
    expect(ids).toHaveLength(2);

    const sum = (await getOpenings(env.DB)).find((o) => o.id === opening.id);
    expect(sum?.packNumber).toBe(opening.packNumber);
    expect(sum?.volume).toBe(1);
    expect(sum?.series).toContain("KILLER");
    expect(sum?.series).toContain("BUNNY GIRL");
    expect(sum?.cardCount).toBe(2);
    expect(sum?.avgCost).toBe(300);
  });

  it("sale marks the card sold, records history, and removes it from the collection", async () => {
    const [id] = await addCards(env.DB, [
      { series: "NEW YEAR", character: "Sachi", rarity: "R" },
    ]);
    const before = ownedOf(
      (await getOverview(env.DB)).cells,
      "NEW YEAR",
      "Sachi",
      "R",
    );

    await recordTransaction(env.DB, id, {
      type: "sale",
      price: 250,
      counterparty: "Alice",
      happenedAt: "2026-06-10",
    });

    const after = ownedOf(
      (await getOverview(env.DB)).cells,
      "NEW YEAR",
      "Sachi",
      "R",
    );
    expect(after).toBe(before - 1);

    const txns = await getTransactions(env.DB);
    expect(
      txns.some((t) => t.price === 250 && t.counterparty === "Alice"),
    ).toBe(true);
  });

  it("trade marks the card traded and adds the received card as owned", async () => {
    const [id] = await addCards(env.DB, [
      { series: "BUNNY GIRL", character: "Rei", rarity: "R" },
    ]);
    const before = ownedOf(
      (await getOverview(env.DB)).cells,
      "BUNNY GIRL",
      "Sachi",
      "SR",
    );

    await recordTransaction(env.DB, id, {
      type: "trade",
      counterparty: "Bob",
      happenedAt: "2026-06-11",
      receivedSeries: "BUNNY GIRL",
      receivedCharacter: "Sachi",
      receivedRarity: "SR",
    });

    const after = ownedOf(
      (await getOverview(env.DB)).cells,
      "BUNNY GIRL",
      "Sachi",
      "SR",
    );
    expect(after).toBe(before + 1);
  });

  it("direct purchase keeps seller, date, amount, and note with the acquired cards", async () => {
    const ids = await addCards(
      env.DB,
      [
        {
          series: "KILLER",
          character: "Rei",
          rarity: "UR",
          source: "purchase",
          purchasePrice: 60,
        },
        {
          series: "KILLER",
          character: "Rei",
          rarity: "UR",
          source: "purchase",
          purchasePrice: 60,
        },
      ],
      undefined,
      {
        occurredAt: "2026-09-02",
        counterparty: "Card Shop",
        note: "店取",
      },
    );

    const cards = (await listCards(env.DB)).filter((card) =>
      ids.includes(card.id),
    );
    expect(cards).toHaveLength(2);
    expect(cards).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          purchaseSeller: "Card Shop",
          purchaseOrderedAt: "2026-09-02",
          purchaseNote: "店取",
        }),
      ]),
    );

    const event = (await getActivities(env.DB)).find(
      (activity) =>
        activity.kind === "purchase" && activity.counterparty === "Card Shop",
    );
    expect(event).toMatchObject({
      occurredAt: "2026-09-02",
      amount: 120,
      note: "店取",
    });
    expect(event?.lines).toEqual([
      expect.objectContaining({ action: "acquired", qty: 2, delta: 2 }),
    ]);
  });

  it("gift removes a card from the collection and records a zero-cost transaction", async () => {
    const [id] = await addCards(env.DB, [
      { series: "NEW YEAR", character: "Sachi", rarity: "SR" },
    ]);

    await recordTransaction(env.DB, id, {
      type: "gift",
      counterparty: "Dana",
      happenedAt: "2026-09-01",
      note: "生日禮物",
    });

    const card = await env.DB.prepare("SELECT status FROM cards WHERE id = ?")
      .bind(id)
      .first<{ status: string }>();
    expect(card?.status).toBe("gifted");
    expect(
      (await listCards(env.DB, { status: "active" })).some(
        (row) => row.id === id,
      ),
    ).toBe(false);
    expect(await getTransactions(env.DB)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          cardId: id,
          type: "gift",
          counterparty: "Dana",
          price: null,
          note: "生日禮物",
        }),
      ]),
    );
    expect(await getActivities(env.DB)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "gift",
          sourceId: id,
          amount: null,
          lines: [
            expect.objectContaining({
              action: "given",
              delta: -1,
              afterStatus: "gifted",
            }),
          ],
        }),
      ]),
    );
  });

  it("reclassifies one owned physical card and records both catalog positions", async () => {
    const [id] = await addCards(env.DB, [
      { series: "KILLER", character: "Rei", rarity: "UR" },
    ]);
    const before = await getOverview(env.DB);
    const target = before.cells.find(
      (cell) =>
        cell.series === "KILLER" &&
        cell.character === "Rei" &&
        cell.rarity === "SR",
    );
    expect(target).toBeDefined();

    await reclassifyCard(env.DB, id, {
      targetCatalogId: target?.catalogId ?? 0,
      happenedAt: "2026-09-02",
      note: "原先稀有度看錯",
    });

    expect(
      (await listCards(env.DB)).find((card) => card.id === id),
    ).toMatchObject({
      series: "KILLER",
      character: "Rei",
      rarity: "SR",
      status: "owned",
    });
    const event = (await getActivities(env.DB)).find(
      (activity) =>
        activity.kind === "card_reclassified" && activity.sourceId === id,
    );
    expect(event).toMatchObject({
      occurredAt: "2026-09-02",
      note: "原先稀有度看錯",
    });
    expect(event?.lines).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          rarity: "UR",
          action: "reclassified_from",
          delta: -1,
        }),
        expect.objectContaining({
          rarity: "SR",
          action: "reclassified_to",
          delta: 1,
        }),
      ]),
    );
  });

  it("requires cancelling a listing before reclassifying its card", async () => {
    const [id] = await addCards(env.DB, [
      { series: "KILLER", character: "Rei", rarity: "UR" },
    ]);
    const target = (await getOverview(env.DB)).cells.find(
      (cell) =>
        cell.series === "KILLER" &&
        cell.character === "Rei" &&
        cell.rarity === "SR",
    );
    await updateCard(env.DB, id, { status: "for_sale" });

    await expect(
      reclassifyCard(env.DB, id, {
        targetCatalogId: target?.catalogId ?? 0,
        happenedAt: "2026-09-02",
      }),
    ).rejects.toThrow("only an owned card can be reclassified");
  });

  it("updateCard lists a card for sale", async () => {
    const [id] = await addCards(env.DB, [
      { series: "KILLER", character: "998", rarity: "SR" },
    ]);
    await updateCard(env.DB, id, { status: "for_sale", askingPrice: 400 });

    const row = await env.DB.prepare(
      "SELECT status, asking_price AS p FROM cards WHERE id = ?",
    )
      .bind(id)
      .first<{ status: string; p: number }>();
    expect(row?.status).toBe("for_sale");
    expect(row?.p).toBe(400);
  });
});
