import { SELF, env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import {
  addCards,
  cancelReservation,
  createReservation,
  createSeries,
  getMarket,
  getOverview,
  listCards,
  recordTransaction,
  updateCard,
} from "../../src/worker/db/queries";

const send = (method: string, path: string, body?: unknown) =>
  SELF.fetch(`https://example.com${path}`, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

describe("dynamic catalog", () => {
  it("backfills volumes and creates a trimmed series cross-product", async () => {
    const initial = (await (
      await SELF.fetch("https://example.com/api/catalog")
    ).json()) as Array<{ name: string; volume: number }>;
    expect(initial.find((series) => series.name === "NEW YEAR")?.volume).toBe(
      1,
    );
    expect(initial.find((series) => series.name === "MP 4TH")?.volume).toBe(2);

    const response = await send("POST", "/api/admin/series", {
      name: "  SUMMER  ",
      volume: 3,
      characters: [" Alice ", "Bob"],
      rarities: ["R", "UR"],
    });
    expect(response.status).toBe(201);
    const created = (await response.json()) as {
      name: string;
      volume: number;
      sortOrder: number;
      characters: string[];
      rarities: string[];
    };
    expect(created).toMatchObject({
      name: "SUMMER",
      volume: 3,
      characters: ["Alice", "Bob"],
      rarities: ["R", "UR"],
    });
    expect(Number.isInteger(created.sortOrder)).toBe(true);

    const catalogRows = await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM card_catalog WHERE series = 'SUMMER'",
    ).first<{ n: number }>();
    expect(catalogRows?.n).toBe(4);
  });

  it("rejects duplicate normalized characters and existing series names", async () => {
    const duplicateCharacters = await send("POST", "/api/admin/series", {
      name: "DUPLICATE CHARACTERS",
      volume: 3,
      characters: ["Alice", " alice "],
      rarities: ["R"],
    });
    expect(duplicateCharacters.status).toBe(400);
    expect(
      await env.DB.prepare(
        "SELECT COUNT(*) AS n FROM series WHERE name = 'DUPLICATE CHARACTERS'",
      ).first<{ n: number }>(),
    ).toMatchObject({ n: 0 });

    const duplicateSeries = await send("POST", "/api/admin/series", {
      name: "KILLER",
      volume: 9,
      characters: ["Alice"],
      rarities: ["R"],
    });
    expect(duplicateSeries.status).toBe(409);

    const caseDuplicateSeries = await send("POST", "/api/admin/series", {
      name: " killer ",
      volume: 9,
      characters: ["Alice"],
      rarities: ["R"],
    });
    expect(caseDuplicateSeries.status).toBe(409);
  });
});

describe("numbered packs and purchases", () => {
  it("assigns the next pack number independently per series", async () => {
    const open = (series: string, character: string) =>
      send("POST", "/api/admin/cards", {
        cards: [{ series, character, rarity: "R" }],
        opening: { series, openedAt: "2026-07-10", cost: 120 },
      });

    const first = (await (await open("KILLER", "Mizuki")).json()) as {
      opening: { packNumber: number };
    };
    const second = (await (await open("KILLER", "Rei")).json()) as {
      opening: { packNumber: number };
    };
    const other = (await (await open("MP 4TH", "KSP")).json()) as {
      opening: { packNumber: number };
    };
    expect(first.opening.packNumber).toBe(1);
    expect(second.opening.packNumber).toBe(2);
    expect(other.opening.packNumber).toBe(1);

    const next = (await (
      await SELF.fetch(
        "https://example.com/api/admin/openings/next?series=KILLER",
      )
    ).json()) as { packNumber: number };
    expect(next.packNumber).toBe(3);
  });

  it("stores purchase price and rejects incomplete or packed purchases", async () => {
    const bought = await send("POST", "/api/admin/cards", {
      cards: [
        {
          series: "NEW YEAR",
          character: "Mizuki",
          rarity: "UR",
          source: "purchase",
          purchasePrice: 350.5,
        },
      ],
    });
    expect(bought.status).toBe(200);
    const { ids } = (await bought.json()) as { ids: number[] };
    const rows = (await (
      await SELF.fetch("https://example.com/api/admin/cards?series=NEW%20YEAR")
    ).json()) as Array<{
      id: number;
      source: string;
      purchasePrice: number | null;
    }>;
    expect(rows.find((card) => card.id === ids[0])).toMatchObject({
      source: "purchase",
      purchasePrice: 350.5,
    });

    const missingPrice = await send("POST", "/api/admin/cards", {
      cards: [
        {
          series: "NEW YEAR",
          character: "Rei",
          rarity: "R",
          source: "purchase",
        },
      ],
    });
    expect(missingPrice.status).toBe(400);

    const packedPurchase = await send("POST", "/api/admin/cards", {
      cards: [
        {
          series: "NEW YEAR",
          character: "Rei",
          rarity: "R",
          source: "purchase",
          purchasePrice: 100,
        },
      ],
      opening: { series: "NEW YEAR", openedAt: "2026-07-10" },
    });
    expect(packedPurchase.status).toBe(400);
  });
});

describe("physical pending reservations", () => {
  it("consumes distinct cards for repeated same-catalog give lines", async () => {
    await createSeries(env.DB, {
      name: "RESERVATION TEST",
      volume: 9,
      characters: ["Collector"],
      rarities: ["R"],
    });
    const ids = await addCards(env.DB, [
      { series: "RESERVATION TEST", character: "Collector", rarity: "R" },
      { series: "RESERVATION TEST", character: "Collector", rarity: "R" },
      { series: "RESERVATION TEST", character: "Collector", rarity: "R" },
    ]);
    const reservationId = await createReservation(env.DB, {
      reservedAt: "2026-07-10",
      give: [
        {
          series: "RESERVATION TEST",
          character: "Collector",
          rarity: "R",
          qty: 1,
        },
        {
          series: "RESERVATION TEST",
          character: "Collector",
          rarity: "R",
          qty: 1,
        },
      ],
      receive: [],
    });

    const storedLines = (
      await env.DB.prepare(
        `SELECT qty, card_id AS cardId
         FROM trade_reservation_lines
         WHERE reservation_id = ? AND direction = 'give'
         ORDER BY id`,
      )
        .bind(reservationId)
        .all<{ qty: number; cardId: number | null }>()
    ).results;
    expect(storedLines).toEqual([
      { qty: 1, cardId: ids[0] },
      { qty: 1, cardId: ids[1] },
    ]);

    const overview = (await getOverview(env.DB)).cells.find(
      (cell) =>
        cell.series === "RESERVATION TEST" &&
        cell.character === "Collector" &&
        cell.rarity === "R",
    );
    expect(overview).toMatchObject({ owned: 3, reserved: 2, available: 1 });

    const rows = await listCards(env.DB, { series: "RESERVATION TEST" });
    expect(rows.filter((card) => card.reserved).map((card) => card.id)).toEqual(
      [ids[0], ids[1]],
    );
    await expect(
      updateCard(env.DB, ids[0], { status: "for_sale" }),
    ).rejects.toThrow();
    await expect(
      recordTransaction(env.DB, ids[0], {
        type: "sale",
        happenedAt: "2026-07-10",
        price: 100,
      }),
    ).rejects.toThrow();
    await expect(
      updateCard(env.DB, ids[2], { status: "for_sale" }),
    ).resolves.toBe(undefined);

    await cancelReservation(env.DB, reservationId);
    await expect(
      updateCard(env.DB, ids[0], { status: "for_sale" }),
    ).resolves.toBe(undefined);
  });

  it("prefers a pulled duplicate over a purchased card and marks its listing reserved", async () => {
    await createSeries(env.DB, {
      name: "SOURCE PRIORITY TEST",
      volume: 9,
      characters: ["Collector"],
      rarities: ["R"],
    });
    const ids = await addCards(env.DB, [
      {
        series: "SOURCE PRIORITY TEST",
        character: "Collector",
        rarity: "R",
        source: "purchase",
        purchasePrice: 500,
      },
      {
        series: "SOURCE PRIORITY TEST",
        character: "Collector",
        rarity: "R",
        source: "pull",
      },
    ]);
    await updateCard(env.DB, ids[0], { status: "for_trade" });
    await updateCard(env.DB, ids[1], { status: "for_trade" });

    await createReservation(env.DB, {
      reservedAt: "2026-07-10",
      give: [
        {
          series: "SOURCE PRIORITY TEST",
          character: "Collector",
          rarity: "R",
          qty: 1,
        },
      ],
      receive: [],
    });

    const rows = await listCards(env.DB, { series: "SOURCE PRIORITY TEST" });
    expect(rows.find((card) => card.id === ids[0])?.reserved).toBe(false);
    expect(rows.find((card) => card.id === ids[1])?.reserved).toBe(true);
    expect(
      (await getMarket(env.DB)).find((card) => card.cardId === ids[1]),
    ).toMatchObject({ reserved: true });
  });

  it("deterministically guards physical cards represented by legacy null bindings", async () => {
    await createSeries(env.DB, {
      name: "LEGACY RESERVATION TEST",
      volume: 9,
      characters: ["Collector"],
      rarities: ["R"],
    });
    const ids = await addCards(env.DB, [
      {
        series: "LEGACY RESERVATION TEST",
        character: "Collector",
        rarity: "R",
      },
      {
        series: "LEGACY RESERVATION TEST",
        character: "Collector",
        rarity: "R",
      },
    ]);
    const catalog = await env.DB.prepare(
      "SELECT id FROM card_catalog WHERE series = 'LEGACY RESERVATION TEST'",
    ).first<{ id: number }>();
    const reservation = await env.DB.prepare(
      "INSERT INTO trade_reservations (reserved_at) VALUES ('2026-07-10') RETURNING id",
    ).first<{ id: number }>();
    await env.DB.prepare(
      `INSERT INTO trade_reservation_lines
         (reservation_id, direction, catalog_id, qty, card_id)
       VALUES (?, 'give', ?, 1, NULL)`,
    )
      .bind(reservation?.id, catalog?.id)
      .run();

    const rows = await listCards(env.DB, {
      series: "LEGACY RESERVATION TEST",
    });
    expect(rows.find((card) => card.id === ids[0])?.reserved).toBe(true);
    expect(rows.find((card) => card.id === ids[1])?.reserved).toBe(false);
    await expect(
      updateCard(env.DB, ids[0], { status: "for_sale" }),
    ).rejects.toThrow();
    await expect(
      updateCard(env.DB, ids[1], { status: "for_sale" }),
    ).resolves.toBe(undefined);
  });
});
