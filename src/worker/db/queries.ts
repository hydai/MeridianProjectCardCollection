import type {
  AddCardInput,
  AdminPendingTrade,
  CardRow,
  CatalogSeries,
  CharacterStat,
  CreateReservationInput,
  CreateSeriesInput,
  MarketListing,
  MissingEntry,
  OpeningCreated,
  OpeningInput,
  OpeningSummary,
  OverviewCell,
  OverviewResponse,
  PublicPendingTrade,
  Rarity,
  RarityCount,
  RecordTxnInput,
  ReservationLine,
  SeriesProgress,
  StatsResponse,
  TradeDirection,
  TxnRecord,
  UpdateCardInput,
} from "../../shared/types";

// Cards still in the owner's possession (excludes sold/traded history).
const ACTIVE = "('owned','for_sale','for_trade')";
const RARITY_ORDER: Rarity[] = ["R", "SR", "SSR", "UR"];

export async function getCatalog(db: D1Database): Promise<CatalogSeries[]> {
  const rows = (
    await db
      .prepare(
        `SELECT s.name, s.volume_number AS volume, s.sort_order AS sortOrder,
                c.character, c.rarity
         FROM series s
         JOIN card_catalog c ON c.series = s.name
         WHERE s.is_active = 1
         ORDER BY s.sort_order, c.sort_order`,
      )
      .all<{
        name: string;
        volume: number;
        sortOrder: number;
        character: string;
        rarity: Rarity;
      }>()
  ).results;

  const byName = new Map<string, CatalogSeries>();
  for (const row of rows) {
    let series = byName.get(row.name);
    if (!series) {
      series = {
        name: row.name,
        volume: row.volume,
        sortOrder: row.sortOrder,
        characters: [],
        rarities: [],
      };
      byName.set(row.name, series);
    }
    if (!series.characters.includes(row.character)) {
      series.characters.push(row.character);
    }
    if (!series.rarities.includes(row.rarity)) {
      series.rarities.push(row.rarity);
    }
  }
  return [...byName.values()];
}

export async function createSeries(
  db: D1Database,
  input: CreateSeriesInput,
): Promise<CatalogSeries> {
  const nextSeriesOrder =
    (
      await db
        .prepare("SELECT COALESCE(MAX(sort_order), -1) + 1 AS n FROM series")
        .first<{ n: number }>()
    )?.n ?? 0;
  const nextCatalogOrder =
    (
      await db
        .prepare(
          "SELECT COALESCE(MAX(sort_order), -1) + 1 AS n FROM card_catalog",
        )
        .first<{ n: number }>()
    )?.n ?? 0;

  const statements: D1PreparedStatement[] = [
    db
      .prepare(
        "INSERT INTO series (name, sort_order, is_active, volume_number) VALUES (?, ?, 1, ?)",
      )
      .bind(input.name, nextSeriesOrder, input.volume),
  ];
  let catalogOrder = nextCatalogOrder;
  for (const character of input.characters) {
    for (const rarity of input.rarities) {
      statements.push(
        db
          .prepare(
            "INSERT INTO card_catalog (series, character, rarity, sort_order) VALUES (?, ?, ?, ?)",
          )
          .bind(input.name, character, rarity, catalogOrder++),
      );
    }
  }
  await db.batch(statements);
  return { ...input, sortOrder: nextSeriesOrder };
}

export async function getOverview(db: D1Database): Promise<OverviewResponse> {
  const rawCells = (
    await db
      .prepare(
        `SELECT c.id AS catalogId, c.series, s.volume_number AS volume,
                c.character, c.rarity,
                COUNT(k.id) AS owned,
                COALESCE(g.reserved, 0) AS reserved
         FROM card_catalog c
         JOIN series s ON s.name = c.series
         LEFT JOIN cards k ON k.catalog_id = c.id AND k.status IN ${ACTIVE}
         LEFT JOIN (
           SELECT catalog_id, SUM(qty) AS reserved
           FROM trade_reservation_lines
           WHERE direction = 'give'
           GROUP BY catalog_id
         ) g ON g.catalog_id = c.id
         GROUP BY c.id
         ORDER BY c.sort_order`,
      )
      .all<Omit<OverviewCell, "available">>()
  ).results;
  const cells: OverviewCell[] = rawCells.map((cell) => ({
    ...cell,
    available: Math.max(0, cell.owned - cell.reserved),
  }));

  const progress = (
    await db
      .prepare(
        `SELECT series,
                COUNT(*) AS totalTypes,
                SUM(CASE WHEN owned > 0 THEN 1 ELSE 0 END) AS collectedTypes
         FROM (
           SELECT c.id, c.series, COUNT(k.id) AS owned
           FROM card_catalog c
           LEFT JOIN cards k ON k.catalog_id = c.id AND k.status IN ${ACTIVE}
           GROUP BY c.id
         )
         GROUP BY series`,
      )
      .all<SeriesProgress>()
  ).results;

  return { cells, progress };
}

export async function getMissing(db: D1Database): Promise<MissingEntry[]> {
  return (
    await db
      .prepare(
        `SELECT c.id AS catalogId, c.series, c.character, c.rarity
         FROM card_catalog c
         WHERE NOT EXISTS (
           SELECT 1 FROM cards k WHERE k.catalog_id = c.id AND k.status IN ${ACTIVE}
         )
         ORDER BY c.sort_order`,
      )
      .all<MissingEntry>()
  ).results;
}

export async function getMarket(db: D1Database): Promise<MarketListing[]> {
  const rows = (
    await db
      .prepare(
        `SELECT k.id AS cardId, c.series, c.character, c.rarity, k.status,
                k.asking_price AS askingPrice, k.want_in_return AS wantInReturn, k.note,
                EXISTS(
                  SELECT 1 FROM trade_reservation_lines l
                  WHERE l.direction = 'give' AND l.card_id = k.id
                ) AS reserved
         FROM cards k
         JOIN card_catalog c ON c.id = k.catalog_id
         WHERE k.status IN ('for_sale','for_trade')
         ORDER BY c.sort_order`,
      )
      .all<Omit<MarketListing, "reserved"> & { reserved: number }>()
  ).results;
  const legacyReserved = await legacyReservedCardIds(db);
  return rows.map((listing) => ({
    ...listing,
    reserved: Boolean(listing.reserved) || legacyReserved.has(listing.cardId),
  }));
}

export async function getStats(db: D1Database): Promise<StatsResponse> {
  const rawRarity = (
    await db
      .prepare(
        `SELECT c.rarity, COUNT(k.id) AS count
         FROM cards k JOIN card_catalog c ON c.id = k.catalog_id
         WHERE k.status IN ${ACTIVE}
         GROUP BY c.rarity`,
      )
      .all<RarityCount>()
  ).results;

  const byCharacter = (
    await db
      .prepare(
        `SELECT c.character,
                SUM(c.rarity = 'R') AS R, SUM(c.rarity = 'SR') AS SR,
                SUM(c.rarity = 'SSR') AS SSR, SUM(c.rarity = 'UR') AS UR
         FROM cards k JOIN card_catalog c ON c.id = k.catalog_id
         WHERE k.status IN ${ACTIVE}
         GROUP BY c.character
         ORDER BY c.character`,
      )
      .all<CharacterStat>()
  ).results;

  // Normalise to all four rarities in display order, filling gaps with 0.
  const byRarity: RarityCount[] = RARITY_ORDER.map((rarity) => ({
    rarity,
    count: rawRarity.find((r) => r.rarity === rarity)?.count ?? 0,
  }));
  const total = byRarity.reduce((a, r) => a + r.count, 0) || 1;
  const pullRates = byRarity.map(({ rarity, count }) => ({
    rarity,
    count,
    pct: (count / total) * 100,
  }));

  return { byRarity, byCharacter, pullRates };
}

// ---- Mutations ----

async function catalogId(
  db: D1Database,
  series: string,
  character: string,
  rarity: string,
): Promise<number> {
  const row = await db
    .prepare(
      "SELECT id FROM card_catalog WHERE series = ? AND character = ? AND rarity = ?",
    )
    .bind(series, character, rarity)
    .first<{ id: number }>();
  if (!row)
    throw new Error(`unknown card type: ${series}/${character}/${rarity}`);
  return row.id;
}

export async function createOpening(
  db: D1Database,
  input: OpeningInput,
): Promise<OpeningCreated> {
  const row = await db
    .prepare(
      `INSERT INTO openings (series, opened_at, cost, note, pack_number)
       SELECT ?, ?, ?, ?, COALESCE(MAX(pack_number), 0) + 1
       FROM openings
       WHERE series = ?
       RETURNING id, pack_number AS packNumber`,
    )
    .bind(
      input.series,
      input.openedAt,
      input.cost ?? null,
      input.note ?? null,
      input.series,
    )
    .first<OpeningCreated>();
  if (!row) throw new Error("failed to create opening");
  return row;
}

export async function getNextPackNumber(
  db: D1Database,
  series: string,
): Promise<number> {
  const row = await db
    .prepare(
      "SELECT COALESCE(MAX(pack_number), 0) + 1 AS packNumber FROM openings WHERE series = ?",
    )
    .bind(series)
    .first<{ packNumber: number }>();
  return row?.packNumber ?? 1;
}

interface ResolvedCard {
  input: AddCardInput;
  catalogId: number;
}

function validateCardAcquisition(cards: AddCardInput[], hasOpening: boolean) {
  for (const card of cards) {
    const source = card.source ?? "pull";
    if (source === "purchase") {
      if (
        typeof card.purchasePrice !== "number" ||
        !Number.isFinite(card.purchasePrice) ||
        card.purchasePrice < 0
      ) {
        throw new Error(
          "a purchase requires a finite nonnegative purchasePrice",
        );
      }
      if (hasOpening)
        throw new Error("a purchased card cannot belong to a pack");
    } else if (card.purchasePrice !== undefined) {
      throw new Error("purchasePrice is only valid for purchased cards");
    }
    if (hasOpening && source !== "pull") {
      throw new Error("pack cards must use the pull source");
    }
  }
}

async function resolveCards(
  db: D1Database,
  cards: AddCardInput[],
): Promise<ResolvedCard[]> {
  const cache = new Map<string, number>();
  const resolved: ResolvedCard[] = [];
  for (const card of cards) {
    const key = `${card.series}\u0000${card.character}\u0000${card.rarity}`;
    let id = cache.get(key);
    if (id === undefined) {
      id = await catalogId(db, card.series, card.character, card.rarity);
      cache.set(key, id);
    }
    resolved.push({ input: card, catalogId: id });
  }
  return resolved;
}

function insertedId(result: D1Result<unknown>, message: string): number {
  const row = result.results[0] as { id?: number } | undefined;
  if (typeof row?.id !== "number") throw new Error(message);
  return row.id;
}

export async function addCards(
  db: D1Database,
  cards: AddCardInput[],
  openingId?: number,
): Promise<number[]> {
  validateCardAcquisition(cards, openingId !== undefined);
  if (openingId !== undefined) {
    const opening = await db
      .prepare("SELECT series FROM openings WHERE id = ?")
      .bind(openingId)
      .first<{ series: string }>();
    if (!opening) throw new Error(`opening ${openingId} not found`);
    if (cards.some((card) => card.series !== opening.series)) {
      throw new Error("every pack card must match the opening series");
    }
  }
  const resolved = await resolveCards(db, cards);
  if (resolved.length === 0) return [];
  const results = await db.batch(
    resolved.map(({ input, catalogId: id }) =>
      db
        .prepare(
          `INSERT INTO cards
             (catalog_id, status, source, opening_id, purchase_price, note)
           VALUES (?, 'owned', ?, ?, ?, ?)
           RETURNING id`,
        )
        .bind(
          id,
          input.source ?? "pull",
          openingId ?? null,
          input.purchasePrice ?? null,
          input.note ?? null,
        ),
    ),
  );
  return results.map((result) => insertedId(result, "failed to add card"));
}

export async function addPack(
  db: D1Database,
  cards: AddCardInput[],
  opening: OpeningInput,
): Promise<{ ids: number[]; opening: OpeningCreated }> {
  validateCardAcquisition(cards, true);
  if (cards.some((card) => card.series !== opening.series)) {
    throw new Error("every pack card must match the opening series");
  }
  const resolved = await resolveCards(db, cards);
  const statements: D1PreparedStatement[] = [
    db
      .prepare(
        `INSERT INTO openings (series, opened_at, cost, note, pack_number)
         SELECT ?, ?, ?, ?, COALESCE(MAX(pack_number), 0) + 1
         FROM openings
         WHERE series = ?
         RETURNING id, pack_number AS packNumber`,
      )
      .bind(
        opening.series,
        opening.openedAt,
        opening.cost ?? null,
        opening.note ?? null,
        opening.series,
      ),
  ];
  for (const { input, catalogId: id } of resolved) {
    statements.push(
      db
        .prepare(
          `INSERT INTO cards
             (catalog_id, status, source, opening_id, purchase_price, note)
           VALUES (
             ?, 'owned', 'pull',
             (SELECT id FROM openings WHERE series = ? ORDER BY pack_number DESC LIMIT 1),
             NULL, ?
           )
           RETURNING id`,
        )
        .bind(id, opening.series, input.note ?? null),
    );
  }
  const results = await db.batch(statements);
  const created = results[0].results[0] as OpeningCreated | undefined;
  if (!created) throw new Error("failed to create opening");
  const ids = results
    .slice(1)
    .map((result) => insertedId(result, "failed to add pack card"));
  return { ids, opening: created };
}

async function assertCardNotReserved(
  db: D1Database,
  cardId: number,
): Promise<void> {
  const reserved = await db
    .prepare(
      `SELECT 1 AS reserved
       FROM trade_reservation_lines
       WHERE direction = 'give' AND card_id = ?
       LIMIT 1`,
    )
    .bind(cardId)
    .first<{ reserved: number }>();
  const legacyReserved = reserved
    ? false
    : (await legacyReservedCardIds(db)).has(cardId);
  if (reserved || legacyReserved)
    throw new Error(`card ${cardId} is reserved for a pending trade`);
}

export async function updateCard(
  db: D1Database,
  id: number,
  update: UpdateCardInput,
): Promise<void> {
  const sets: string[] = [];
  const values: unknown[] = [];
  if (update.status !== undefined) {
    sets.push("status = ?");
    values.push(update.status);
  }
  if (update.askingPrice !== undefined) {
    sets.push("asking_price = ?");
    values.push(update.askingPrice);
  }
  if (update.wantInReturn !== undefined) {
    sets.push("want_in_return = ?");
    values.push(update.wantInReturn);
  }
  if (update.note !== undefined) {
    sets.push("note = ?");
    values.push(update.note);
  }
  if (sets.length === 0) return;
  await assertCardNotReserved(db, id);
  sets.push("updated_at = datetime('now')");
  const args = [...values, id];
  await db
    .prepare(`UPDATE cards SET ${sets.join(", ")} WHERE id = ?`)
    .bind(...args)
    .run();
}

export async function recordTransaction(
  db: D1Database,
  cardId: number,
  t: RecordTxnInput,
): Promise<number> {
  await assertCardNotReserved(db, cardId);
  let receivedCatalogId: number | null = null;
  let receivedCardId: number | null = null;
  if (
    t.type === "trade" &&
    t.receivedSeries &&
    t.receivedCharacter &&
    t.receivedRarity
  ) {
    receivedCatalogId = await catalogId(
      db,
      t.receivedSeries,
      t.receivedCharacter,
      t.receivedRarity,
    );
    const rc = await db
      .prepare(
        "INSERT INTO cards (catalog_id, status, source) VALUES (?, 'owned', 'trade_in') RETURNING id",
      )
      .bind(receivedCatalogId)
      .first<{ id: number }>();
    if (!rc) throw new Error("failed to add received card");
    receivedCardId = rc.id;
  }

  await db
    .prepare(
      "UPDATE cards SET status = ?, updated_at = datetime('now') WHERE id = ?",
    )
    .bind(t.type === "sale" ? "sold" : "traded", cardId)
    .run();

  const row = await db
    .prepare(
      `INSERT INTO transactions
         (card_id, type, counterparty, price, received_catalog_id, received_card_id, happened_at, note)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
    )
    .bind(
      cardId,
      t.type,
      t.counterparty ?? null,
      t.price ?? null,
      receivedCatalogId,
      receivedCardId,
      t.happenedAt,
      t.note ?? null,
    )
    .first<{ id: number }>();
  if (!row) throw new Error("failed to record transaction");
  return row.id;
}

export async function getOpenings(db: D1Database): Promise<OpeningSummary[]> {
  return (
    await db
      .prepare(
        `SELECT o.id, o.series, o.pack_number AS packNumber,
                o.opened_at AS openedAt, o.cost,
                COUNT(k.id) AS cardCount,
                CASE WHEN o.cost IS NULL OR COUNT(k.id) = 0 THEN NULL
                     ELSE o.cost * 1.0 / COUNT(k.id) END AS avgCost
         FROM openings o
         LEFT JOIN cards k ON k.opening_id = o.id
         GROUP BY o.id
         ORDER BY o.opened_at DESC, o.id DESC`,
      )
      .all<OpeningSummary>()
  ).results;
}

export async function getTransactions(db: D1Database): Promise<TxnRecord[]> {
  return (
    await db
      .prepare(
        `SELECT t.id, t.card_id AS cardId, t.type, t.counterparty, t.price,
                t.happened_at AS happenedAt, t.note,
                c.series, c.character, c.rarity
         FROM transactions t
         JOIN cards k ON k.id = t.card_id
         JOIN card_catalog c ON c.id = k.catalog_id
         ORDER BY t.happened_at DESC, t.id DESC`,
      )
      .all<TxnRecord>()
  ).results;
}

async function legacyReservedCardIds(db: D1Database): Promise<Set<number>> {
  const rows = (
    await db
      .prepare(
        `WITH legacy AS (
           SELECT catalog_id, SUM(qty) AS qty
           FROM trade_reservation_lines
           WHERE direction = 'give' AND card_id IS NULL
           GROUP BY catalog_id
         ), ranked AS (
           SELECT k.id, k.catalog_id,
                  ROW_NUMBER() OVER (
                    PARTITION BY k.catalog_id
                    ORDER BY (k.status = 'owned') DESC,
                             CASE k.source
                               WHEN 'pull' THEN 0
                               WHEN 'trade_in' THEN 1
                               ELSE 2
                             END,
                             k.id
                  ) AS position
           FROM cards k
           JOIN legacy ON legacy.catalog_id = k.catalog_id
           WHERE k.status IN ${ACTIVE}
             AND NOT EXISTS (
               SELECT 1 FROM trade_reservation_lines explicit
               WHERE explicit.direction = 'give' AND explicit.card_id = k.id
             )
         )
         SELECT ranked.id
         FROM ranked
         JOIN legacy ON legacy.catalog_id = ranked.catalog_id
         WHERE ranked.position <= legacy.qty`,
      )
      .all<{ id: number }>()
  ).results;
  return new Set(rows.map((row) => row.id));
}

export async function listCards(
  db: D1Database,
  filter: { series?: string; status?: string } = {},
): Promise<CardRow[]> {
  const conds: string[] = [];
  const vals: unknown[] = [];
  if (filter.series) {
    conds.push("c.series = ?");
    vals.push(filter.series);
  }
  if (filter.status === "active") {
    conds.push(`k.status IN ${ACTIVE}`);
  } else if (filter.status) {
    conds.push("k.status = ?");
    vals.push(filter.status);
  }
  const where = conds.length ? `WHERE ${conds.join(" AND ")}` : "";
  const stmt = db.prepare(
    `SELECT k.id, c.series, c.character, c.rarity, k.status, k.source,
            k.purchase_price AS purchasePrice, k.asking_price AS askingPrice,
            k.want_in_return AS wantInReturn, k.note,
            (SELECT COUNT(*) FROM cards k2
             WHERE k2.catalog_id = k.catalog_id AND k2.status IN ${ACTIVE}) AS activeCount,
            (SELECT COALESCE(SUM(qty), 0) FROM trade_reservation_lines l
             WHERE l.catalog_id = k.catalog_id AND l.direction = 'give') AS reservedGive,
            EXISTS(
              SELECT 1 FROM trade_reservation_lines l
              WHERE l.card_id = k.id AND l.direction = 'give'
            ) AS reserved
     FROM cards k
     JOIN card_catalog c ON c.id = k.catalog_id
     ${where}
     ORDER BY c.sort_order, k.id`,
  );
  const bound = vals.length ? stmt.bind(...vals) : stmt;
  const rows = (
    await bound.all<
      Omit<CardRow, "duplicate" | "reserved"> & {
        activeCount: number;
        reserved: number;
      }
    >()
  ).results;
  const legacyReserved = await legacyReservedCardIds(db);
  return rows.map(({ activeCount, reserved, ...r }) => ({
    ...r,
    reserved: Boolean(reserved) || legacyReserved.has(r.id),
    duplicate: activeCount - r.reservedGive > 1,
  }));
}

// ---- Pending trade reservations ----

interface RawResvLine {
  reservationId: number;
  direction: TradeDirection;
  catalogId: number;
  series: string;
  character: string;
  rarity: Rarity;
  qty: number;
}

// All lines for all reservations, joined to catalog for display, catalog-sorted.
async function reservationLines(db: D1Database): Promise<RawResvLine[]> {
  return (
    await db
      .prepare(
        `SELECT l.reservation_id AS reservationId, l.direction,
                l.catalog_id AS catalogId, c.series, c.character, c.rarity,
                SUM(l.qty) AS qty
         FROM trade_reservation_lines l
         JOIN card_catalog c ON c.id = l.catalog_id
         GROUP BY l.reservation_id, l.direction, l.catalog_id
         ORDER BY c.sort_order`,
      )
      .all<RawResvLine>()
  ).results;
}

function attachLines<
  T extends { id: number; give: ReservationLine[]; receive: ReservationLine[] },
>(headers: T[], lines: RawResvLine[]): T[] {
  const byId = new Map<number, T>(headers.map((h) => [h.id, h]));
  for (const l of lines) {
    const h = byId.get(l.reservationId);
    if (!h) continue;
    const line: ReservationLine = {
      direction: l.direction,
      catalogId: l.catalogId,
      series: l.series,
      character: l.character,
      rarity: l.rarity,
      qty: l.qty,
    };
    (l.direction === "give" ? h.give : h.receive).push(line);
  }
  return headers;
}

export async function getPublicPendingTrades(
  db: D1Database,
): Promise<PublicPendingTrade[]> {
  const headers = (
    await db
      .prepare(
        `SELECT id, reserved_at AS reservedAt FROM trade_reservations
         ORDER BY reserved_at DESC, id DESC`,
      )
      .all<{ id: number; reservedAt: string }>()
  ).results.map((h) => ({ ...h, give: [], receive: [] }) as PublicPendingTrade);
  return attachLines(headers, await reservationLines(db));
}

export async function getAdminPendingTrades(
  db: D1Database,
): Promise<AdminPendingTrade[]> {
  const headers = (
    await db
      .prepare(
        `SELECT id, reserved_at AS reservedAt, counterparty, note
         FROM trade_reservations ORDER BY reserved_at DESC, id DESC`,
      )
      .all<{
        id: number;
        reservedAt: string;
        counterparty: string | null;
        note: string | null;
      }>()
  ).results.map((h) => ({ ...h, give: [], receive: [] }) as AdminPendingTrade);
  return attachLines(headers, await reservationLines(db));
}

export async function createReservation(
  db: D1Database,
  input: CreateReservationInput,
): Promise<number> {
  interface PendingLine {
    direction: TradeDirection;
    catalogId: number;
    qty: number;
    cardId: number | null;
  }

  // Resolve and allocate everything before writing. The partial unique index on
  // card_id is the final concurrency guard if two requests race this read phase.
  const giveRequests: { catalogId: number; qty: number }[] = [];
  for (const g of input.give) {
    if (!Number.isInteger(g.qty) || g.qty < 1) {
      throw new Error("qty must be a positive integer");
    }
    giveRequests.push({
      catalogId: await catalogId(db, g.series, g.character, g.rarity),
      qty: g.qty,
    });
  }
  const lines: PendingLine[] = [];
  const demandByCatalog = new Map<number, number>();
  for (const give of giveRequests) {
    demandByCatalog.set(
      give.catalogId,
      (demandByCatalog.get(give.catalogId) ?? 0) + give.qty,
    );
  }
  const allocatedByCatalog = new Map<number, number[]>();
  for (const [catalog, demand] of demandByCatalog) {
    const candidates = (
      await db
        .prepare(
          `SELECT k.id
           FROM cards k
           WHERE k.catalog_id = ?
             AND k.status IN ('owned','for_sale','for_trade')
             AND NOT EXISTS (
               SELECT 1 FROM trade_reservation_lines l
               WHERE l.direction = 'give' AND l.card_id = k.id
             )
           ORDER BY (k.status = 'owned') DESC,
                    CASE k.source
                      WHEN 'pull' THEN 0
                      WHEN 'trade_in' THEN 1
                      ELSE 2
                    END,
                    k.id`,
        )
        .bind(catalog)
        .all<{ id: number }>()
    ).results;
    const legacyReserved =
      (
        await db
          .prepare(
            `SELECT COALESCE(SUM(qty), 0) AS qty
             FROM trade_reservation_lines
             WHERE direction = 'give' AND catalog_id = ? AND card_id IS NULL`,
          )
          .bind(catalog)
          .first<{ qty: number }>()
      )?.qty ?? 0;
    const available = candidates.slice(legacyReserved);
    if (available.length < demand) {
      throw new Error(`not enough unreserved holdings for catalog ${catalog}`);
    }
    allocatedByCatalog.set(
      catalog,
      available.slice(0, demand).map((card) => card.id),
    );
  }
  for (const give of giveRequests) {
    const allocated = allocatedByCatalog.get(give.catalogId) ?? [];
    for (let i = 0; i < give.qty; i++) {
      const cardId = allocated.shift();
      if (cardId === undefined) {
        throw new Error(`failed to allocate catalog ${give.catalogId}`);
      }
      lines.push({
        direction: "give",
        catalogId: give.catalogId,
        qty: 1,
        cardId,
      });
    }
  }
  for (const r of input.receive ?? []) {
    if (!Number.isInteger(r.qty) || r.qty < 1) {
      throw new Error("qty must be a positive integer");
    }
    lines.push({
      direction: "receive",
      catalogId: await catalogId(db, r.series, r.character, r.rarity),
      qty: r.qty,
      cardId: null,
    });
  }

  const id =
    (
      await db
        .prepare(
          "SELECT COALESCE(MAX(id), 0) + 1 AS id FROM trade_reservations",
        )
        .first<{ id: number }>()
    )?.id ?? 1;
  const statements: D1PreparedStatement[] = [
    db
      .prepare(
        `INSERT INTO trade_reservations
           (id, counterparty, reserved_at, note)
         VALUES (?, ?, ?, ?)`,
      )
      .bind(
        id,
        input.counterparty ?? null,
        input.reservedAt,
        input.note ?? null,
      ),
  ];
  for (const line of lines) {
    statements.push(
      db
        .prepare(
          `INSERT INTO trade_reservation_lines
             (reservation_id, direction, catalog_id, qty, card_id)
           VALUES (?, ?, ?, ?, ?)`,
        )
        .bind(id, line.direction, line.catalogId, line.qty, line.cardId),
    );
  }
  await db.batch(statements);
  return id;
}

export async function cancelReservation(
  db: D1Database,
  id: number,
): Promise<void> {
  await db.batch([
    db
      .prepare("DELETE FROM trade_reservation_lines WHERE reservation_id = ?")
      .bind(id),
    db.prepare("DELETE FROM trade_reservations WHERE id = ?").bind(id),
  ]);
}

const RARITY_RANK: Record<Rarity, number> = { R: 0, SR: 1, SSR: 2, UR: 3 };

export async function completeReservation(
  db: D1Database,
  id: number,
  happenedAt: string,
): Promise<void> {
  // ---- READ PHASE (no writes) ----
  const header = await db
    .prepare("SELECT counterparty, note FROM trade_reservations WHERE id = ?")
    .bind(id)
    .first<{ counterparty: string | null; note: string | null }>();
  if (!header) throw new Error(`reservation ${id} not found`);

  const raw = (
    await db
      .prepare(
        `SELECT l.direction, l.catalog_id AS catalogId, l.qty, l.card_id AS cardId,
                c.series, c.character, c.rarity
         FROM trade_reservation_lines l
         JOIN card_catalog c ON c.id = l.catalog_id
         WHERE l.reservation_id = ?`,
      )
      .bind(id)
      .all<{
        direction: TradeDirection;
        catalogId: number;
        qty: number;
        cardId: number | null;
        series: string;
        character: string;
        rarity: Rarity;
      }>()
  ).results;

  const expand = (dir: TradeDirection) =>
    raw
      .filter((l) => l.direction === dir)
      .flatMap((l) => Array.from({ length: l.qty }, () => l))
      .sort(
        (a, b) =>
          RARITY_RANK[a.rarity] - RARITY_RANK[b.rarity] ||
          Number(b.cardId !== null) - Number(a.cardId !== null),
      );
  const gives = expand("give");
  const receives = expand("receive");

  if (gives.length === 0) {
    throw new Error("a completed trade needs at least one give line");
  }

  // New reservations already identify physical cards. Legacy NULL-card lines
  // are allocated at completion while avoiding every explicitly reserved card.
  const giveCardIds: number[] = [];
  for (const g of gives) {
    if (g.cardId !== null) {
      const card = await db
        .prepare(
          `SELECT id FROM cards
           WHERE id = ? AND catalog_id = ?
             AND status IN ('owned','for_sale','for_trade')`,
        )
        .bind(g.cardId, g.catalogId)
        .first<{ id: number }>();
      if (!card || giveCardIds.includes(card.id)) {
        throw new Error(`reserved card ${g.cardId} is no longer available`);
      }
      giveCardIds.push(card.id);
      continue;
    }
    const exclude = giveCardIds.length
      ? `AND id NOT IN (${giveCardIds.map(() => "?").join(",")})`
      : "";
    const card = await db
      .prepare(
        `SELECT id FROM cards
         WHERE catalog_id = ? AND status IN ('owned','for_sale','for_trade') ${exclude}
           AND NOT EXISTS (
             SELECT 1 FROM trade_reservation_lines l
             WHERE l.direction = 'give' AND l.card_id = cards.id
           )
         ORDER BY (status = 'owned') DESC,
                  CASE source
                    WHEN 'pull' THEN 0
                    WHEN 'trade_in' THEN 1
                    ELSE 2
                  END,
                  id
         LIMIT 1`,
      )
      .bind(g.catalogId, ...giveCardIds)
      .first<{ id: number }>();
    if (!card) {
      throw new Error(`not enough holdings to fulfil catalog ${g.catalogId}`);
    }
    giveCardIds.push(card.id);
  }

  // Receives beyond the give count (一換多): note them on the last transaction.
  const extra = receives.slice(gives.length);
  const extraNote =
    extra.length > 0
      ? `額外換得：${extra.map((r) => `${r.series} ${r.character} ${r.rarity}`).join("、")}`
      : "";

  // ---- WRITE PHASE (single atomic batch; reservation claimed within it) ----
  const stmts: D1PreparedStatement[] = [
    db
      .prepare("DELETE FROM trade_reservation_lines WHERE reservation_id = ?")
      .bind(id),
    db.prepare("DELETE FROM trade_reservations WHERE id = ?").bind(id),
  ];
  for (const r of receives) {
    stmts.push(
      db
        .prepare(
          "INSERT INTO cards (catalog_id, status, source) VALUES (?, 'owned', 'trade_in')",
        )
        .bind(r.catalogId),
    );
  }
  for (let i = 0; i < gives.length; i++) {
    stmts.push(
      db
        .prepare(
          "UPDATE cards SET status = 'traded', updated_at = datetime('now') WHERE id = ?",
        )
        .bind(giveCardIds[i]),
    );
    const receivedCatalogId =
      i < receives.length ? receives[i].catalogId : null;
    const isLast = i === gives.length - 1;
    const note =
      [header.note, isLast ? extraNote : ""].filter(Boolean).join(" / ") ||
      null;
    stmts.push(
      db
        .prepare(
          `INSERT INTO transactions
             (card_id, type, counterparty, price, received_catalog_id, received_card_id, happened_at, note)
           VALUES (?, 'trade', ?, NULL, ?, NULL, ?, ?)`,
        )
        .bind(
          giveCardIds[i],
          header.counterparty,
          receivedCatalogId,
          happenedAt,
          note,
        ),
    );
  }
  await db.batch(stmts);
}
