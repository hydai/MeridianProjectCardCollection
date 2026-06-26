import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import type { OverviewCell } from "../../src/shared/types";
import {
  addCards,
  createOpening,
  getOpenings,
  getOverview,
  getTransactions,
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
    const op = await createOpening(env.DB, {
      series: "KILLER",
      openedAt: "2026-06-01",
      cost: 600,
    });
    const ids = await addCards(
      env.DB,
      [
        { series: "KILLER", character: "Rei", rarity: "SR" },
        { series: "KILLER", character: "Mizuki", rarity: "R" },
      ],
      op,
    );
    expect(ids).toHaveLength(2);

    const sum = (await getOpenings(env.DB)).find((o) => o.id === op);
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
