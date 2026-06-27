import type {
  AddCardInput,
  AdminPendingTrade,
  CardRow,
  CharacterStat,
  CreateReservationInput,
  MarketListing,
  MissingEntry,
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

export async function getOverview(db: D1Database): Promise<OverviewResponse> {
  const rawCells = (
    await db
      .prepare(
        `SELECT c.id AS catalogId, c.series, c.character, c.rarity,
                COUNT(k.id) AS owned,
                COALESCE(g.reserved, 0) AS reserved
         FROM card_catalog c
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
      .all<OverviewCell & { reserved: number }>()
  ).results;
  const cells: OverviewCell[] = rawCells.map(({ reserved, ...c }) => ({
    ...c,
    owned: Math.max(0, c.owned - reserved),
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
  return (
    await db
      .prepare(
        `SELECT k.id AS cardId, c.series, c.character, c.rarity, k.status,
                k.asking_price AS askingPrice, k.want_in_return AS wantInReturn, k.note
         FROM cards k
         JOIN card_catalog c ON c.id = k.catalog_id
         WHERE k.status IN ('for_sale','for_trade')
         ORDER BY c.sort_order`,
      )
      .all<MarketListing>()
  ).results;
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
): Promise<number> {
  const row = await db
    .prepare(
      "INSERT INTO openings (series, opened_at, cost, note) VALUES (?, ?, ?, ?) RETURNING id",
    )
    .bind(
      input.series ?? null,
      input.openedAt,
      input.cost ?? null,
      input.note ?? null,
    )
    .first<{ id: number }>();
  if (!row) throw new Error("failed to create opening");
  return row.id;
}

export async function addCards(
  db: D1Database,
  cards: AddCardInput[],
  openingId?: number,
): Promise<number[]> {
  const ids: number[] = [];
  for (const c of cards) {
    const cid = await catalogId(db, c.series, c.character, c.rarity);
    const row = await db
      .prepare(
        "INSERT INTO cards (catalog_id, status, source, opening_id, note) VALUES (?, 'owned', ?, ?, ?) RETURNING id",
      )
      .bind(cid, c.source ?? "pull", openingId ?? null, c.note ?? null)
      .first<{ id: number }>();
    if (!row) throw new Error("failed to add card");
    ids.push(row.id);
  }
  return ids;
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
        `SELECT o.id, o.series, o.opened_at AS openedAt, o.cost,
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
            k.asking_price AS askingPrice, k.want_in_return AS wantInReturn, k.note,
            (SELECT COUNT(*) FROM cards k2
             WHERE k2.catalog_id = k.catalog_id AND k2.status IN ${ACTIVE}) AS activeCount,
            (SELECT COALESCE(SUM(qty), 0) FROM trade_reservation_lines l
             WHERE l.catalog_id = k.catalog_id AND l.direction = 'give') AS reservedGive
     FROM cards k
     JOIN card_catalog c ON c.id = k.catalog_id
     ${where}
     ORDER BY c.sort_order, k.id`,
  );
  const bound = vals.length ? stmt.bind(...vals) : stmt;
  const rows = (
    await bound.all<Omit<CardRow, "duplicate"> & { activeCount: number }>()
  ).results;
  return rows.map(({ activeCount, ...r }) => ({
    ...r,
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
                l.catalog_id AS catalogId, c.series, c.character, c.rarity, l.qty
         FROM trade_reservation_lines l
         JOIN card_catalog c ON c.id = l.catalog_id
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
  // Resolve every catalog id first: an unknown card throws before any write.
  const lines: { direction: TradeDirection; catalogId: number; qty: number }[] =
    [];
  for (const g of input.give) {
    lines.push({
      direction: "give",
      catalogId: await catalogId(db, g.series, g.character, g.rarity),
      qty: g.qty,
    });
  }
  for (const r of input.receive) {
    lines.push({
      direction: "receive",
      catalogId: await catalogId(db, r.series, r.character, r.rarity),
      qty: r.qty,
    });
  }

  const header = await db
    .prepare(
      "INSERT INTO trade_reservations (counterparty, reserved_at, note) VALUES (?, ?, ?) RETURNING id",
    )
    .bind(input.counterparty ?? null, input.reservedAt, input.note ?? null)
    .first<{ id: number }>();
  if (!header) throw new Error("failed to create reservation");

  if (lines.length > 0) {
    await db.batch(
      lines.map((l) =>
        db
          .prepare(
            "INSERT INTO trade_reservation_lines (reservation_id, direction, catalog_id, qty) VALUES (?, ?, ?, ?)",
          )
          .bind(header.id, l.direction, l.catalogId, l.qty),
      ),
    );
  }
  return header.id;
}

export async function cancelReservation(
  db: D1Database,
  id: number,
): Promise<void> {
  await db
    .prepare("DELETE FROM trade_reservation_lines WHERE reservation_id = ?")
    .bind(id)
    .run();
  await db
    .prepare("DELETE FROM trade_reservations WHERE id = ?")
    .bind(id)
    .run();
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
        `SELECT l.direction, l.catalog_id AS catalogId, l.qty,
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
        series: string;
        character: string;
        rarity: Rarity;
      }>()
  ).results;

  const expand = (dir: TradeDirection) =>
    raw
      .filter((l) => l.direction === dir)
      .flatMap((l) => Array.from({ length: l.qty }, () => l))
      .sort((a, b) => RARITY_RANK[a.rarity] - RARITY_RANK[b.rarity]);
  const gives = expand("give");
  const receives = expand("receive");

  if (gives.length === 0) {
    throw new Error("a completed trade needs at least one give line");
  }

  // Pick one distinct physical card per give unit. This SELECT-only loop IS the
  // pre-check: if any give unit can't be satisfied, throw before any write.
  const giveCardIds: number[] = [];
  for (const g of gives) {
    const exclude = giveCardIds.length
      ? `AND id NOT IN (${giveCardIds.map(() => "?").join(",")})`
      : "";
    const card = await db
      .prepare(
        `SELECT id FROM cards
         WHERE catalog_id = ? AND status IN ('owned','for_sale','for_trade') ${exclude}
         ORDER BY (status = 'owned') DESC, id
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
