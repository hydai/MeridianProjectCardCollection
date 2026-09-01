import { SELF, env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import {
  addCards,
  cancelReservation,
  createReservation,
  createSeries,
  getCatalog,
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

  it("normalizes reselected rarity order before persisting a series", async () => {
    const response = await send("POST", "/api/admin/series", {
      name: "RARITY ORDER",
      volume: 3,
      characters: ["Alice"],
      rarities: ["SR", "SSR", "UR", "R"],
    });
    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({
      name: "RARITY ORDER",
      rarities: ["R", "SR", "SSR", "UR"],
    });

    const rows = (
      await env.DB.prepare(
        "SELECT rarity FROM card_catalog WHERE series = ? ORDER BY sort_order",
      )
        .bind("RARITY ORDER")
        .all<{ rarity: string }>()
    ).results;
    expect(rows.map((row) => row.rarity)).toEqual(["R", "SR", "SSR", "UR"]);
  });

  it("repairs stored rarity order and canonicalizes legacy catalog reads", async () => {
    await createSeries(env.DB, {
      name: "LEGACY RARITY ORDER",
      volume: 3,
      characters: ["Alice"],
      rarities: ["R", "SR", "SSR", "UR"],
    });
    const firstOrder = await env.DB.prepare(
      "SELECT MIN(sort_order) AS n FROM card_catalog WHERE series = ?",
    )
      .bind("LEGACY RARITY ORDER")
      .first<{ n: number }>();
    await env.DB.prepare(
      `UPDATE card_catalog
       SET sort_order = ? + CASE rarity
         WHEN 'SR' THEN 0
         WHEN 'SSR' THEN 1
         WHEN 'UR' THEN 2
         WHEN 'R' THEN 3
       END
       WHERE series = ?`,
    )
      .bind(firstOrder?.n ?? 0, "LEGACY RARITY ORDER")
      .run();

    const storedRarities = async () =>
      (
        await env.DB.prepare(
          "SELECT rarity FROM card_catalog WHERE series = ? ORDER BY sort_order",
        )
          .bind("LEGACY RARITY ORDER")
          .all<{ rarity: string }>()
      ).results.map((row) => row.rarity);

    expect(await storedRarities()).toEqual(["SR", "SSR", "UR", "R"]);
    expect(
      (await getCatalog(env.DB)).find(
        (series) => series.name === "LEGACY RARITY ORDER",
      )?.rarities,
    ).toEqual(["R", "SR", "SSR", "UR"]);

    const migration = env.TEST_MIGRATIONS.find((item) =>
      item.name.includes("0009_normalize_catalog_rarity_order"),
    );
    expect(migration).toBeDefined();
    await env.DB.batch(
      (migration?.queries ?? []).map((query) => env.DB.prepare(query)),
    );
    expect(await storedRarities()).toEqual(["R", "SR", "SSR", "UR"]);
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

  it("allows EX only from Vol.3 onward", async () => {
    const tooEarly = await send("POST", "/api/admin/series", {
      name: "EARLY EX",
      volume: 2,
      characters: ["Alice"],
      rarities: ["R", "EX"],
    });
    expect(tooEarly.status).toBe(400);
    expect(await tooEarly.json()).toMatchObject({
      error: "EX is only available from volume 3",
    });

    const introduced = await send("POST", "/api/admin/series", {
      name: "EX INTRODUCTION",
      volume: 3,
      characters: ["Alice"],
      rarities: ["R", "EX"],
    });
    expect(introduced.status).toBe(201);
    expect(await introduced.json()).toMatchObject({
      rarities: ["R", "EX"],
    });
  });

  it("edits a series cross-product but blocks removal of referenced card types", async () => {
    const created = await send("POST", "/api/admin/series", {
      name: "EDITABLE SERIES",
      volume: 3,
      characters: ["Alice", "Bob"],
      rarities: ["R", "EX"],
    });
    expect(created.status).toBe(201);

    const expanded = await send(
      "PATCH",
      "/api/admin/series/EDITABLE%20SERIES",
      {
        volume: 4,
        characters: ["Bob", "Alice", "Cara"],
        rarities: ["EX", "R", "SR"],
      },
    );
    expect(expanded.status).toBe(200);
    expect(await expanded.json()).toMatchObject({
      name: "EDITABLE SERIES",
      volume: 4,
      characters: ["Bob", "Alice", "Cara"],
      rarities: ["R", "SR", "EX"],
    });

    await addCards(env.DB, [
      { series: "EDITABLE SERIES", character: "Alice", rarity: "R" },
    ]);
    const blocked = await send("PATCH", "/api/admin/series/EDITABLE%20SERIES", {
      volume: 4,
      characters: ["Bob", "Cara"],
      rarities: ["R", "SR", "EX"],
    });
    expect(blocked.status).toBe(409);
    expect(await blocked.json()).toMatchObject({
      error: expect.stringContaining("無法移除"),
    });
    expect(
      (await getCatalog(env.DB)).find(
        (series) => series.name === "EDITABLE SERIES",
      ),
    ).toMatchObject({
      volume: 4,
      characters: ["Bob", "Alice", "Cara"],
      rarities: ["R", "SR", "EX"],
    });
  });

  it("backfills EX for existing Vol.3 characters in canonical order", async () => {
    await createSeries(env.DB, {
      name: "PRE-EX VOL3",
      volume: 3,
      characters: ["Alice", "Bob"],
      rarities: ["R", "SR", "SSR", "UR"],
    });
    const migration = env.TEST_MIGRATIONS.find((item) =>
      item.name.includes("0010_add_ex_rarity"),
    );
    expect(migration).toBeDefined();
    await env.DB.batch(
      (migration?.queries ?? []).map((query) => env.DB.prepare(query)),
    );

    const rows = (
      await env.DB.prepare(
        `SELECT character, rarity
         FROM card_catalog
         WHERE series = 'PRE-EX VOL3'
         ORDER BY sort_order`,
      ).all<{ character: string; rarity: string }>()
    ).results;
    expect(rows).toEqual([
      { character: "Alice", rarity: "R" },
      { character: "Alice", rarity: "SR" },
      { character: "Alice", rarity: "SSR" },
      { character: "Alice", rarity: "UR" },
      { character: "Alice", rarity: "EX" },
      { character: "Bob", rarity: "R" },
      { character: "Bob", rarity: "SR" },
      { character: "Bob", rarity: "SSR" },
      { character: "Bob", rarity: "UR" },
      { character: "Bob", rarity: "EX" },
    ]);
  });
});

describe("numbered packs and purchases", () => {
  it("numbers packs per volume and accepts multiple series from that volume", async () => {
    const open = (
      volume: number,
      cards: Array<{ series: string; character: string; rarity: "R" }>,
    ) =>
      send("POST", "/api/admin/cards", {
        cards,
        opening: { volume, openedAt: "2026-07-10", cost: 120 },
      });

    const first = (await (
      await open(1, [
        { series: "KILLER", character: "Mizuki", rarity: "R" },
        { series: "BUNNY GIRL", character: "Rei", rarity: "R" },
      ])
    ).json()) as {
      opening: { packNumber: number };
    };
    const second = (await (
      await open(1, [{ series: "NEW YEAR", character: "Sachi", rarity: "R" }])
    ).json()) as {
      opening: { packNumber: number };
    };
    const other = (await (
      await open(2, [{ series: "MP 4TH", character: "KSP", rarity: "R" }])
    ).json()) as {
      opening: { packNumber: number };
    };
    expect(first.opening.packNumber).toBe(1);
    expect(second.opening.packNumber).toBe(2);
    expect(other.opening.packNumber).toBe(1);

    const next = (await (
      await SELF.fetch("https://example.com/api/admin/openings/next?volume=1")
    ).json()) as { packNumber: number };
    expect(next.packNumber).toBe(3);

    const legacyNext = (await (
      await SELF.fetch(
        "https://example.com/api/admin/openings/next?series=KILLER",
      )
    ).json()) as { packNumber: number; volume: number };
    expect(legacyNext).toMatchObject({ packNumber: 3, volume: 1 });

    const wrongVolume = await open(2, [
      { series: "KILLER", character: "Rei", rarity: "R" },
    ]);
    expect(wrongVolume.status).toBe(400);
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
      opening: { volume: 1, openedAt: "2026-07-10" },
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
