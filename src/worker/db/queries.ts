import { RARITY_ORDER, canonicalizeRarities } from "../../shared/rarity";
import type {
  AcquisitionEventInput,
  ActivityEvent,
  ActivityKind,
  ActivityLine,
  ActivityLineAction,
  AddCardInput,
  AdminPendingPurchase,
  AdminPendingTrade,
  AdminPurchaseReservationLine,
  AdminTradePost,
  CardRow,
  CardStatus,
  CatalogMediaEntry,
  CatalogMediaSide,
  CatalogSeries,
  CharacterStat,
  CreatePurchaseReservationInput,
  CreateReservationInput,
  CreateSeriesInput,
  CreateTradePostReservationInput,
  MarketListing,
  MissingEntry,
  OpeningCreated,
  OpeningInput,
  OpeningSummary,
  OverviewCell,
  OverviewResponse,
  PublicPendingPurchase,
  PublicPendingTrade,
  PurchaseReservationLine,
  Rarity,
  RarityCount,
  ReclassifyCardInput,
  RecordTxnInput,
  ReservationLine,
  SaveTradePostInput,
  SeriesProgress,
  StatsResponse,
  TradeDirection,
  TradePost,
  TradePostCandidate,
  TradePostCandidates,
  TradePostDirection,
  TradePostLine,
  TradePostStatus,
  TxnRecord,
  UpdateCardInput,
  UpdateCatalogWantInput,
  UpdateSeriesInput,
} from "../../shared/types";

// Cards still in the owner's possession (excludes sold/traded/gifted history).
const ACTIVE = "('owned','for_sale','for_trade')";
const ACTIVE_STATUSES = new Set<CardStatus>(["owned", "for_sale", "for_trade"]);

interface ActivityEventInput {
  sourceKey: string;
  kind: ActivityKind;
  occurredAt?: string;
  sourceType?: string;
  sourceId?: number;
  counterparty?: string | null;
  amount?: number | null;
  note?: string | null;
  revertsEventId?: number;
  tradePostId?: number | null;
}

interface ActivityLineInput {
  catalogId?: number | null;
  action: ActivityLineAction;
  qty?: number;
  delta?: number;
  beforeStatus?: CardStatus | null;
  afterStatus?: CardStatus | null;
  beforeWant?: number | null;
  afterWant?: number | null;
  unitAmount?: number | null;
  note?: string | null;
}

function activityKey(prefix: string): string {
  return `${prefix}:${crypto.randomUUID()}`;
}

function insertActivityEventStatement(
  db: D1Database,
  input: ActivityEventInput,
): D1PreparedStatement {
  return db
    .prepare(
      `INSERT INTO activity_events
         (source_key, kind, occurred_at, source_type, source_id,
          counterparty, amount, note, reverts_event_id, trade_post_id)
       VALUES (?, ?, COALESCE(?, datetime('now')), ?, ?, ?, ?, ?, ?, ?)
       RETURNING id`,
    )
    .bind(
      input.sourceKey,
      input.kind,
      input.occurredAt ?? null,
      input.sourceType ?? null,
      input.sourceId ?? null,
      input.counterparty ?? null,
      input.amount ?? null,
      input.note ?? null,
      input.revertsEventId ?? null,
      input.tradePostId ?? null,
    );
}

function insertActivityLineStatement(
  db: D1Database,
  sourceKey: string,
  input: ActivityLineInput,
): D1PreparedStatement {
  return db
    .prepare(
      `INSERT INTO activity_event_lines
         (event_id, catalog_id, action, qty, delta,
          before_status, after_status, before_want, after_want,
          unit_amount, note)
       SELECT id, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
       FROM activity_events WHERE source_key = ?`,
    )
    .bind(
      input.catalogId ?? null,
      input.action,
      input.qty ?? 1,
      input.delta ?? 0,
      input.beforeStatus ?? null,
      input.afterStatus ?? null,
      input.beforeWant ?? null,
      input.afterWant ?? null,
      input.unitAmount ?? null,
      input.note ?? null,
      sourceKey,
    );
}

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
  return [...byName.values()].map((series) => ({
    ...series,
    rarities: canonicalizeRarities(series.rarities),
  }));
}

export interface StoredCatalogMedia {
  catalogId: number;
  side: CatalogMediaSide;
  objectKey: string;
  contentType: string;
  byteSize: number;
  etag: string;
  originalFilename: string | null;
  revision: number;
  updatedAt: string;
}

interface CatalogMediaListRow {
  catalogId: number;
  series: string;
  volume: number;
  character: string;
  rarity: Rarity;
  side: CatalogMediaSide | null;
  objectKey: string | null;
  contentType: string | null;
  byteSize: number | null;
  originalFilename: string | null;
  revision: number | null;
  updatedAt: string | null;
}

function catalogMediaUrl(
  catalogId: number,
  side: CatalogMediaSide,
  revision: number,
): string {
  const params = new URLSearchParams({ side, v: String(revision) });
  return `/api/catalog/${catalogId}/image?${params}`;
}

export async function listCatalogMedia(
  db: D1Database,
): Promise<CatalogMediaEntry[]> {
  const rows = (
    await db
      .prepare(
        `SELECT c.id AS catalogId, c.series,
                s.volume_number AS volume, c.character, c.rarity,
                m.side, m.object_key AS objectKey,
                m.content_type AS contentType, m.byte_size AS byteSize,
                m.original_filename AS originalFilename,
                m.revision, m.updated_at AS updatedAt
         FROM card_catalog c
         JOIN series s ON s.name = c.series
         LEFT JOIN catalog_media m
           ON m.catalog_id = c.id AND m.side = 'front'
         WHERE s.is_active = 1
         ORDER BY s.sort_order, c.sort_order, c.id`,
      )
      .all<CatalogMediaListRow>()
  ).results;

  return rows.map((row) => ({
    catalogId: row.catalogId,
    series: row.series,
    volume: row.volume,
    character: row.character,
    rarity: row.rarity,
    front:
      row.side &&
      row.objectKey &&
      row.contentType &&
      row.byteSize !== null &&
      row.revision !== null &&
      row.updatedAt
        ? {
            side: row.side,
            url: catalogMediaUrl(row.catalogId, row.side, row.revision),
            contentType: row.contentType,
            byteSize: row.byteSize,
            originalFilename: row.originalFilename,
            revision: row.revision,
            updatedAt: row.updatedAt,
          }
        : null,
  }));
}

export async function catalogSlotExists(
  db: D1Database,
  catalogId: number,
): Promise<boolean> {
  const row = await db
    .prepare("SELECT 1 AS found FROM card_catalog WHERE id = ?")
    .bind(catalogId)
    .first<{ found: number }>();
  return Boolean(row?.found);
}

export async function getStoredCatalogMedia(
  db: D1Database,
  catalogId: number,
  side: CatalogMediaSide,
): Promise<StoredCatalogMedia | null> {
  return db
    .prepare(
      `SELECT catalog_id AS catalogId, side, object_key AS objectKey,
              content_type AS contentType, byte_size AS byteSize, etag,
              original_filename AS originalFilename, revision,
              updated_at AS updatedAt
       FROM catalog_media
       WHERE catalog_id = ? AND side = ?`,
    )
    .bind(catalogId, side)
    .first<StoredCatalogMedia>();
}

export async function saveCatalogMedia(
  db: D1Database,
  input: Omit<StoredCatalogMedia, "revision" | "updatedAt">,
): Promise<number> {
  const saved = await db
    .prepare(
      `INSERT INTO catalog_media
         (catalog_id, side, object_key, content_type, byte_size, etag,
          original_filename)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(catalog_id, side) DO UPDATE SET
         object_key = excluded.object_key,
         content_type = excluded.content_type,
         byte_size = excluded.byte_size,
         etag = excluded.etag,
         original_filename = excluded.original_filename,
         revision = catalog_media.revision + 1,
         updated_at = datetime('now')
       RETURNING revision`,
    )
    .bind(
      input.catalogId,
      input.side,
      input.objectKey,
      input.contentType,
      input.byteSize,
      input.etag,
      input.originalFilename,
    )
    .first<{ revision: number }>();
  if (!saved) throw new Error("catalog media was not saved");
  return saved.revision;
}

export async function deleteCatalogMediaMetadata(
  db: D1Database,
  catalogId: number,
  side: CatalogMediaSide,
): Promise<boolean> {
  const result = await db
    .prepare("DELETE FROM catalog_media WHERE catalog_id = ? AND side = ?")
    .bind(catalogId, side)
    .run();
  return (result.meta.changes ?? 0) > 0;
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
  const rarities = canonicalizeRarities(input.rarities);
  let catalogOrder = nextCatalogOrder;
  for (const character of input.characters) {
    for (const rarity of rarities) {
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
  return { ...input, rarities, sortOrder: nextSeriesOrder };
}

interface CatalogIdentity {
  id: number;
  character: string;
  rarity: Rarity;
  referenced: number;
}

export async function updateSeries(
  db: D1Database,
  name: string,
  input: UpdateSeriesInput,
): Promise<CatalogSeries> {
  const metadata = await db
    .prepare("SELECT sort_order AS sortOrder FROM series WHERE name = ?")
    .bind(name)
    .first<{ sortOrder: number }>();
  if (!metadata) throw new Error(`series not found: ${name}`);

  const existing = (
    await db
      .prepare(
        `SELECT c.id, c.character, c.rarity,
                (
                  EXISTS(SELECT 1 FROM cards WHERE catalog_id = c.id)
                  OR EXISTS(
                    SELECT 1 FROM transactions WHERE received_catalog_id = c.id
                  )
                  OR EXISTS(
                    SELECT 1 FROM trade_reservation_lines WHERE catalog_id = c.id
                  )
                  OR EXISTS(
                    SELECT 1 FROM purchase_reservation_lines WHERE catalog_id = c.id
                  )
                  OR EXISTS(
                    SELECT 1 FROM activity_event_lines WHERE catalog_id = c.id
                  )
                  OR EXISTS(
                    SELECT 1 FROM catalog_media WHERE catalog_id = c.id
                  )
                ) AS referenced
         FROM card_catalog c
         WHERE c.series = ?
         ORDER BY c.sort_order, c.id`,
      )
      .bind(name)
      .all<CatalogIdentity>()
  ).results;
  const rarities = canonicalizeRarities(input.rarities);
  const desired = input.characters.flatMap((character) =>
    rarities.map((rarity) => ({
      key: `${character}\u0000${rarity}`,
      character,
      rarity,
    })),
  );
  const desiredKeys = new Set(desired.map((row) => row.key));
  const removed = existing.filter(
    (row) => !desiredKeys.has(`${row.character}\u0000${row.rarity}`),
  );
  if (removed.some((row) => Boolean(row.referenced))) {
    throw new Error("無法移除已有卡片、卡圖、交易紀錄或預約資料的角色／級別");
  }

  const existingByKey = new Map(
    existing.map((row) => [`${row.character}\u0000${row.rarity}`, row]),
  );
  const statements: D1PreparedStatement[] = [
    db
      .prepare("UPDATE series SET volume_number = ? WHERE name = ?")
      .bind(input.volume, name),
  ];
  if (removed.length > 0) {
    const placeholders = removed.map(() => "?").join(", ");
    statements.push(
      db
        .prepare(`DELETE FROM card_catalog WHERE id IN (${placeholders})`)
        .bind(...removed.map((row) => row.id)),
    );
  }

  // Temporary negative orders encode the submitted character/rarity order.
  // The final materialized CTE then compacts the whole catalog back to stable,
  // unique, series-major sort_order values inside this same D1 batch.
  desired.forEach((row, index) => {
    const sortOrder = index - desired.length;
    const current = existingByKey.get(row.key);
    statements.push(
      current
        ? db
            .prepare("UPDATE card_catalog SET sort_order = ? WHERE id = ?")
            .bind(sortOrder, current.id)
        : db
            .prepare(
              "INSERT INTO card_catalog (series, character, rarity, sort_order) VALUES (?, ?, ?, ?)",
            )
            .bind(name, row.character, row.rarity, sortOrder),
    );
  });
  statements.push(
    db.prepare(
      `WITH normalized AS MATERIALIZED (
         SELECT c.id,
                ROW_NUMBER() OVER (
                  ORDER BY s.sort_order, c.sort_order, c.id
                ) - 1 AS normalized_sort_order
         FROM card_catalog c
         JOIN series s ON s.name = c.series
       )
       UPDATE card_catalog
       SET sort_order = (
         SELECT normalized_sort_order
         FROM normalized
         WHERE normalized.id = card_catalog.id
       )`,
    ),
  );
  await db.batch(statements);

  const updated = (await getCatalog(db)).find((series) => series.name === name);
  if (!updated) throw new Error(`series not found after update: ${name}`);
  return updated;
}

export async function getOverview(db: D1Database): Promise<OverviewResponse> {
  const rawCells = (
    await db
      .prepare(
        `SELECT c.id AS catalogId, c.series, s.volume_number AS volume,
                c.character, c.rarity,
                COUNT(k.id) AS owned,
                COALESCE(SUM(k.held), 0) AS held,
                COALESCE(g.reserved, 0) AS reserved,
                COALESCE(w.desired_count, 0) AS wantCount,
                COALESCE(r.incoming, 0) AS incomingTrade,
                COALESCE(p.incoming, 0) AS incomingPurchase,
                m.revision AS imageRevision
         FROM card_catalog c
         JOIN series s ON s.name = c.series
         LEFT JOIN cards k ON k.catalog_id = c.id AND k.status IN ${ACTIVE}
         LEFT JOIN catalog_wants w ON w.catalog_id = c.id
         LEFT JOIN catalog_media m
           ON m.catalog_id = c.id AND m.side = 'front'
         LEFT JOIN (
           SELECT catalog_id, SUM(qty) AS reserved
           FROM trade_reservation_lines
           WHERE direction = 'give'
           GROUP BY catalog_id
         ) g ON g.catalog_id = c.id
         LEFT JOIN (
           SELECT catalog_id, SUM(qty) AS incoming
           FROM trade_reservation_lines
           WHERE direction = 'receive'
           GROUP BY catalog_id
         ) r ON r.catalog_id = c.id
         LEFT JOIN (
           SELECT l.catalog_id, SUM(l.qty) AS incoming
           FROM purchase_reservation_lines l
           JOIN purchase_reservations reservation
             ON reservation.id = l.reservation_id
           WHERE reservation.status = 'pending'
           GROUP BY l.catalog_id
         ) p ON p.catalog_id = c.id
         GROUP BY c.id
         ORDER BY c.sort_order`,
      )
      .all<
        Omit<OverviewCell, "available" | "image"> & {
          imageRevision: number | null;
        }
      >()
  ).results;
  // held and reserved never cover the same physical card (holding requires an
  // unreserved card; reservation allocation skips held cards), so subtracting
  // both never double-counts.
  const cells: OverviewCell[] = rawCells.map(({ imageRevision, ...cell }) => ({
    ...cell,
    available: Math.max(0, cell.owned - cell.reserved - cell.held),
    image:
      imageRevision === null
        ? null
        : { url: catalogMediaUrl(cell.catalogId, "front", imageRevision) },
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

export async function setCatalogWant(
  db: D1Database,
  catalogId: number,
  input: UpdateCatalogWantInput,
): Promise<number> {
  const row = await db
    .prepare(
      `SELECT c.id, COALESCE(w.desired_count, 0) AS wantCount
       FROM card_catalog c
       LEFT JOIN catalog_wants w ON w.catalog_id = c.id
       WHERE c.id = ?`,
    )
    .bind(catalogId)
    .first<{ id: number; wantCount: number }>();
  if (!row) throw new Error(`catalog ${catalogId} not found`);
  if (row.wantCount === input.wantCount) return row.wantCount;

  const sourceKey = activityKey("want-update");
  const wantStatement =
    input.wantCount === 0
      ? db
          .prepare("DELETE FROM catalog_wants WHERE catalog_id = ?")
          .bind(catalogId)
      : db
          .prepare(
            `INSERT INTO catalog_wants (catalog_id, desired_count, updated_at)
             VALUES (?, ?, datetime('now'))
             ON CONFLICT(catalog_id) DO UPDATE SET
               desired_count = excluded.desired_count,
               updated_at = excluded.updated_at`,
          )
          .bind(catalogId, input.wantCount);

  await db.batch([
    insertActivityEventStatement(db, {
      sourceKey,
      kind: "want_updated",
      sourceType: "catalog",
      sourceId: catalogId,
    }),
    wantStatement,
    insertActivityLineStatement(db, sourceKey, {
      catalogId,
      action: "wanted",
      beforeWant: row.wantCount,
      afterWant: input.wantCount,
    }),
  ]);
  return input.wantCount;
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

// ---- Shareable exchange announcements ----

interface TradePostHeaderRow {
  id: number;
  publicId: string;
  status: TradePostStatus;
  note: string | null;
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
  closedAt: string | null;
}

interface TradePostLineRow {
  postId: number;
  direction: TradePostDirection;
  catalogId: number | null;
  series: string;
  character: string;
  rarity: Rarity;
  qty: number;
}

interface TradePostSnapshotLine {
  direction: TradePostDirection;
  catalogId: number;
  series: string;
  character: string;
  rarity: Rarity;
  qty: number;
}

const tradePostAvailabilityKey = (
  direction: TradePostDirection,
  catalogId: number,
) => `${direction}:${catalogId}`;

async function tradePostAvailability(
  db: D1Database,
): Promise<Map<string, number>> {
  const availability = new Map<string, number>();
  const giveRows = (
    await db
      .prepare(
        `SELECT k.catalog_id AS catalogId, COUNT(*) AS qty
         FROM cards k
         WHERE k.status = 'for_trade'
           AND k.held = 0
           AND NOT EXISTS (
             SELECT 1 FROM trade_reservation_lines l
             WHERE l.direction = 'give' AND l.card_id = k.id
           )
         GROUP BY k.catalog_id`,
      )
      .all<{ catalogId: number; qty: number }>()
  ).results;
  const legacyReserved = await legacyReservedCardIds(db);
  if (legacyReserved.size > 0) {
    const legacyRows = (
      await db
        .prepare(
          `SELECT id, catalog_id AS catalogId
           FROM cards
           WHERE status = 'for_trade' AND held = 0`,
        )
        .all<{ id: number; catalogId: number }>()
    ).results;
    const legacyByCatalog = new Map<number, number>();
    for (const card of legacyRows) {
      if (!legacyReserved.has(card.id)) continue;
      legacyByCatalog.set(
        card.catalogId,
        (legacyByCatalog.get(card.catalogId) ?? 0) + 1,
      );
    }
    for (const row of giveRows) {
      row.qty = Math.max(
        0,
        row.qty - (legacyByCatalog.get(row.catalogId) ?? 0),
      );
    }
  }
  for (const row of giveRows) {
    availability.set(tradePostAvailabilityKey("give", row.catalogId), row.qty);
  }

  const overview = await getOverview(db);
  for (const cell of overview.cells) {
    const remaining = Math.max(
      0,
      (cell.wantCount ?? 0) -
        cell.owned -
        (cell.incomingTrade ?? 0) -
        (cell.incomingPurchase ?? 0),
    );
    availability.set(
      tradePostAvailabilityKey("want", cell.catalogId),
      remaining,
    );
  }
  return availability;
}

async function hydrateTradePosts(
  db: D1Database,
  headers: TradePostHeaderRow[],
): Promise<TradePost[]> {
  if (headers.length === 0) return [];
  const placeholders = headers.map(() => "?").join(", ");
  const lines = (
    await db
      .prepare(
        `SELECT post_id AS postId, direction, catalog_id AS catalogId,
                snapshot_series AS series,
                snapshot_character AS character,
                snapshot_rarity AS rarity, qty
         FROM trade_post_lines
         WHERE post_id IN (${placeholders})
         ORDER BY post_id DESC, id`,
      )
      .bind(...headers.map((post) => post.id))
      .all<TradePostLineRow>()
  ).results;
  const availability = await tradePostAvailability(db);
  const posts: TradePost[] = headers.map((header) => ({
    ...header,
    stale: false,
    give: [],
    want: [],
  }));
  const byId = new Map(posts.map((post) => [post.id, post]));
  for (const line of lines) {
    const availableQty =
      line.catalogId === null
        ? 0
        : (availability.get(
            tradePostAvailabilityKey(line.direction, line.catalogId),
          ) ?? 0);
    const hydrated: TradePostLine = {
      direction: line.direction,
      catalogId: line.catalogId,
      series: line.series,
      character: line.character,
      rarity: line.rarity,
      qty: line.qty,
      availableQty,
      stale: availableQty < line.qty,
    };
    const post = byId.get(line.postId);
    if (!post) continue;
    (line.direction === "give" ? post.give : post.want).push(hydrated);
    if (hydrated.stale) post.stale = true;
  }
  return posts;
}

const TRADE_POST_HEADER_SELECT = `
  SELECT id, public_id AS publicId, status, note,
         created_at AS createdAt, updated_at AS updatedAt,
         published_at AS publishedAt, closed_at AS closedAt
  FROM trade_posts`;

export async function getPublicTradePosts(
  db: D1Database,
): Promise<TradePost[]> {
  const headers = (
    await db
      .prepare(
        `${TRADE_POST_HEADER_SELECT}
         WHERE status = 'published'
         ORDER BY published_at DESC, id DESC
         LIMIT 50`,
      )
      .all<TradePostHeaderRow>()
  ).results;
  return hydrateTradePosts(db, headers);
}

export async function getPublicTradePost(
  db: D1Database,
  publicId: string,
): Promise<TradePost | null> {
  const header = await db
    .prepare(
      `${TRADE_POST_HEADER_SELECT}
       WHERE public_id = ? AND status IN ('published', 'closed')`,
    )
    .bind(publicId)
    .first<TradePostHeaderRow>();
  if (!header) return null;
  return (await hydrateTradePosts(db, [header]))[0] ?? null;
}

export async function getAdminTradePosts(
  db: D1Database,
): Promise<AdminTradePost[]> {
  const headers = (
    await db
      .prepare(
        `${TRADE_POST_HEADER_SELECT}
         ORDER BY created_at DESC, id DESC
         LIMIT 100`,
      )
      .all<TradePostHeaderRow>()
  ).results;
  const posts = await hydrateTradePosts(db, headers);
  if (posts.length === 0) return [];
  const counts = (
    await db
      .prepare(
        `WITH totals AS (
           SELECT trade_post_id AS postId, COUNT(*) AS reservationCount
           FROM activity_events
           WHERE kind = 'trade_reserved' AND trade_post_id IS NOT NULL
           GROUP BY trade_post_id
         ), active AS (
           SELECT trade_post_id AS postId, COUNT(*) AS activeReservationCount
           FROM trade_reservations
           WHERE trade_post_id IS NOT NULL
           GROUP BY trade_post_id
         )
         SELECT p.id AS postId,
                COALESCE(t.reservationCount, 0) AS reservationCount,
                COALESCE(a.activeReservationCount, 0) AS activeReservationCount
         FROM trade_posts p
         LEFT JOIN totals t ON t.postId = p.id
         LEFT JOIN active a ON a.postId = p.id
         WHERE p.id IN (${posts.map(() => "?").join(", ")})`,
      )
      .bind(...posts.map((post) => post.id))
      .all<{
        postId: number;
        reservationCount: number;
        activeReservationCount: number;
      }>()
  ).results;
  const byId = new Map(counts.map((count) => [count.postId, count]));
  return posts.map((post) => ({
    ...post,
    reservationCount: byId.get(post.id)?.reservationCount ?? 0,
    activeReservationCount: byId.get(post.id)?.activeReservationCount ?? 0,
  }));
}

async function getAdminTradePost(
  db: D1Database,
  id: number,
): Promise<TradePost | null> {
  const header = await db
    .prepare(`${TRADE_POST_HEADER_SELECT} WHERE id = ?`)
    .bind(id)
    .first<TradePostHeaderRow>();
  if (!header) return null;
  return (await hydrateTradePosts(db, [header]))[0] ?? null;
}

export async function getTradePostCandidates(
  db: D1Database,
): Promise<TradePostCandidates> {
  const availability = await tradePostAvailability(db);
  const catalog = (
    await db
      .prepare(
        `SELECT id AS catalogId, series, character, rarity
         FROM card_catalog ORDER BY sort_order, id`,
      )
      .all<Omit<TradePostCandidate, "availableQty">>()
  ).results;
  const candidates: TradePostCandidates = { give: [], want: [] };
  for (const card of catalog) {
    for (const direction of ["give", "want"] as const) {
      const availableQty =
        availability.get(tradePostAvailabilityKey(direction, card.catalogId)) ??
        0;
      if (availableQty > 0) {
        candidates[direction].push({ ...card, availableQty });
      }
    }
  }
  return candidates;
}

function normalizedTradePostNote(note: string | undefined): string | null {
  if (note === undefined) return null;
  const value = note.trim();
  if (value.length > 1000) {
    throw new Error("announcement note must be at most 1000 characters");
  }
  return value || null;
}

async function snapshotTradePostLines(
  db: D1Database,
  input: SaveTradePostInput,
): Promise<TradePostSnapshotLine[]> {
  if (input.give.length === 0) {
    throw new Error("at least one give line required");
  }
  const requested = [
    ...input.give.map((line) => ({ ...line, direction: "give" as const })),
    ...input.want.map((line) => ({ ...line, direction: "want" as const })),
  ];
  if (requested.length > 100) {
    throw new Error("at most 100 announcement lines are allowed");
  }
  const catalogIds = new Set<number>();
  for (const line of requested) {
    if (
      !Number.isInteger(line.catalogId) ||
      line.catalogId < 1 ||
      !Number.isInteger(line.qty) ||
      line.qty < 1 ||
      line.qty > 99
    ) {
      throw new Error(
        "announcement lines need valid catalog ids and quantities",
      );
    }
    if (catalogIds.has(line.catalogId)) {
      throw new Error("a card type can only appear once in an announcement");
    }
    catalogIds.add(line.catalogId);
  }

  const ids = [...catalogIds];
  const placeholders = ids.map(() => "?").join(", ");
  const rows = (
    await db
      .prepare(
        `SELECT id, series, character, rarity
         FROM card_catalog WHERE id IN (${placeholders})`,
      )
      .bind(...ids)
      .all<{
        id: number;
        series: string;
        character: string;
        rarity: Rarity;
      }>()
  ).results;
  const byId = new Map(rows.map((row) => [row.id, row]));
  if (byId.size !== ids.length) {
    throw new Error("announcement contains an unknown card type");
  }
  return requested.map((line) => {
    const card = byId.get(line.catalogId);
    if (!card) throw new Error(`catalog ${line.catalogId} not found`);
    return {
      direction: line.direction,
      catalogId: line.catalogId,
      series: card.series,
      character: card.character,
      rarity: card.rarity,
      qty: line.qty,
    };
  });
}

function insertTradePostLineStatement(
  db: D1Database,
  postSelector: { publicId?: string; id?: number },
  line: TradePostSnapshotLine,
): D1PreparedStatement {
  const byPublicId = postSelector.publicId !== undefined;
  return db
    .prepare(
      `INSERT INTO trade_post_lines
         (post_id, direction, catalog_id, snapshot_series,
          snapshot_character, snapshot_rarity, qty)
       SELECT id, ?, ?, ?, ?, ?, ?
       FROM trade_posts
       WHERE ${byPublicId ? "public_id = ?" : "id = ? AND status = 'draft'"}`,
    )
    .bind(
      line.direction,
      line.catalogId,
      line.series,
      line.character,
      line.rarity,
      line.qty,
      byPublicId ? postSelector.publicId : postSelector.id,
    );
}

export async function createTradePost(
  db: D1Database,
  input: SaveTradePostInput,
): Promise<TradePost> {
  const note = normalizedTradePostNote(input.note);
  const lines = await snapshotTradePostLines(db, input);
  const publicId = crypto.randomUUID();
  const statements: D1PreparedStatement[] = [
    db
      .prepare("INSERT INTO trade_posts (public_id, note) VALUES (?, ?)")
      .bind(publicId, note),
    ...lines.map((line) =>
      insertTradePostLineStatement(db, { publicId }, line),
    ),
  ];
  await db.batch(statements);
  const created = await db
    .prepare("SELECT id FROM trade_posts WHERE public_id = ?")
    .bind(publicId)
    .first<{ id: number }>();
  if (!created) throw new Error("failed to create announcement draft");
  const post = await getAdminTradePost(db, created.id);
  if (!post) throw new Error("failed to load announcement draft");
  return post;
}

export async function updateTradePost(
  db: D1Database,
  id: number,
  input: SaveTradePostInput,
): Promise<TradePost> {
  const note = normalizedTradePostNote(input.note);
  const lines = await snapshotTradePostLines(db, input);
  const statements: D1PreparedStatement[] = [
    db
      .prepare(
        `UPDATE trade_posts
         SET note = ?, updated_at = datetime('now')
         WHERE id = ? AND status = 'draft'
         RETURNING id`,
      )
      .bind(note, id),
    db
      .prepare(
        `DELETE FROM trade_post_lines
         WHERE post_id = ?
           AND EXISTS (
             SELECT 1 FROM trade_posts
             WHERE id = ? AND status = 'draft'
           )`,
      )
      .bind(id, id),
    ...lines.map((line) => insertTradePostLineStatement(db, { id }, line)),
  ];
  const results = await db.batch(statements);
  if (results[0].results.length === 0) {
    throw new Error(`editable announcement draft ${id} not found`);
  }
  const post = await getAdminTradePost(db, id);
  if (!post) throw new Error("failed to load announcement draft");
  return post;
}

export async function deleteTradePost(
  db: D1Database,
  id: number,
): Promise<void> {
  const result = await db
    .prepare(
      "DELETE FROM trade_posts WHERE id = ? AND status = 'draft' RETURNING id",
    )
    .bind(id)
    .first<{ id: number }>();
  if (!result) throw new Error(`deletable announcement draft ${id} not found`);
}

async function insertTradePostActivity(
  db: D1Database,
  post: TradePost,
  kind: "trade_post_published" | "trade_post_closed",
): Promise<D1PreparedStatement[]> {
  const sourceKey = `${kind}:${post.id}`;
  const statements: D1PreparedStatement[] = [
    insertActivityEventStatement(db, {
      sourceKey,
      kind,
      sourceType: "trade_post",
      sourceId: post.id,
      tradePostId: post.id,
      note: post.note,
    }),
  ];
  for (const line of [...post.give, ...post.want]) {
    statements.push(
      insertActivityLineStatement(db, sourceKey, {
        catalogId: line.catalogId,
        action:
          line.direction === "give" ? "advertised_give" : "advertised_want",
        qty: line.qty,
      }),
    );
  }
  return statements;
}

export async function publishTradePost(
  db: D1Database,
  id: number,
): Promise<TradePost> {
  const draft = await getAdminTradePost(db, id);
  if (!draft || draft.status !== "draft") {
    throw new Error(`publishable announcement draft ${id} not found`);
  }
  if (draft.give.length === 0 || draft.stale) {
    throw new Error(
      "announcement availability changed; update the draft before publishing",
    );
  }
  const activity = await insertTradePostActivity(
    db,
    draft,
    "trade_post_published",
  );
  const results = await db.batch([
    db
      .prepare(
        `UPDATE trade_posts
         SET status = 'published', published_at = datetime('now'),
             updated_at = datetime('now')
         WHERE id = ? AND status = 'draft'
         RETURNING id`,
      )
      .bind(id),
    ...activity,
  ]);
  if (results[0].results.length === 0) {
    throw new Error(`publishable announcement draft ${id} not found`);
  }
  const published = await getAdminTradePost(db, id);
  if (!published) throw new Error("failed to load published announcement");
  return published;
}

export async function closeTradePost(
  db: D1Database,
  id: number,
): Promise<TradePost> {
  const published = await getAdminTradePost(db, id);
  if (!published || published.status !== "published") {
    throw new Error(`open announcement ${id} not found`);
  }
  const activity = await insertTradePostActivity(
    db,
    published,
    "trade_post_closed",
  );
  const results = await db.batch([
    db
      .prepare(
        `UPDATE trade_posts
         SET status = 'closed', closed_at = datetime('now'),
             updated_at = datetime('now')
         WHERE id = ? AND status = 'published'
         RETURNING id`,
      )
      .bind(id),
    ...activity,
  ]);
  if (results[0].results.length === 0) {
    throw new Error(`open announcement ${id} not found`);
  }
  const closed = await getAdminTradePost(db, id);
  if (!closed) throw new Error("failed to load closed announcement");
  return closed;
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
                SUM(c.rarity = 'SSR') AS SSR, SUM(c.rarity = 'UR') AS UR,
                SUM(c.rarity = 'EX') AS EX
         FROM cards k JOIN card_catalog c ON c.id = k.catalog_id
         WHERE k.status IN ${ACTIVE}
         GROUP BY c.character
         ORDER BY c.character`,
      )
      .all<CharacterStat>()
  ).results;

  // Normalise to every supported rarity in display order, filling gaps with 0.
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

interface CatalogEntry {
  id: number;
  volume: number;
}

async function catalogEntry(
  db: D1Database,
  series: string,
  character: string,
  rarity: string,
): Promise<CatalogEntry> {
  const row = await db
    .prepare(
      `SELECT c.id, s.volume_number AS volume
       FROM card_catalog c
       JOIN series s ON s.name = c.series
       WHERE c.series = ? AND c.character = ? AND c.rarity = ?`,
    )
    .bind(series, character, rarity)
    .first<CatalogEntry>();
  if (!row)
    throw new Error(`unknown card type: ${series}/${character}/${rarity}`);
  return row;
}

async function catalogId(
  db: D1Database,
  series: string,
  character: string,
  rarity: string,
): Promise<number> {
  return (await catalogEntry(db, series, character, rarity)).id;
}

export async function createOpening(
  db: D1Database,
  input: OpeningInput,
): Promise<OpeningCreated> {
  const sourceKey = activityKey("opening");
  const results = await db.batch([
    insertActivityEventStatement(db, {
      sourceKey,
      kind: "opening",
      occurredAt: input.openedAt,
      sourceType: "opening",
      amount: input.cost ?? null,
      note: input.note ?? null,
    }),
    db
      .prepare(
        `INSERT INTO openings
           (series, volume_number, opened_at, cost, note, pack_number)
         SELECT NULL, ?, ?, ?, ?, COALESCE(MAX(pack_number), 0) + 1
         FROM openings
         WHERE volume_number = ?
         RETURNING id, volume_number AS volume, pack_number AS packNumber`,
      )
      .bind(
        input.volume,
        input.openedAt,
        input.cost ?? null,
        input.note ?? null,
        input.volume,
      ),
    db
      .prepare(
        `UPDATE activity_events
         SET source_id = (
           SELECT id FROM openings
           WHERE volume_number = ? ORDER BY pack_number DESC LIMIT 1
         )
         WHERE source_key = ?`,
      )
      .bind(input.volume, sourceKey),
  ]);
  const row = results[1].results[0] as OpeningCreated | undefined;
  if (!row) throw new Error("failed to create opening");
  return row;
}

export async function getNextPackNumber(
  db: D1Database,
  volume: number,
): Promise<number> {
  const row = await db
    .prepare(
      "SELECT COALESCE(MAX(pack_number), 0) + 1 AS packNumber FROM openings WHERE volume_number = ?",
    )
    .bind(volume)
    .first<{ packNumber: number }>();
  return row?.packNumber ?? 1;
}

interface ResolvedCard {
  input: AddCardInput;
  catalogId: number;
  volume: number;
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
  const cache = new Map<string, CatalogEntry>();
  const resolved: ResolvedCard[] = [];
  for (const card of cards) {
    const key = `${card.series}\u0000${card.character}\u0000${card.rarity}`;
    let entry = cache.get(key);
    if (entry === undefined) {
      entry = await catalogEntry(db, card.series, card.character, card.rarity);
      cache.set(key, entry);
    }
    resolved.push({
      input: card,
      catalogId: entry.id,
      volume: entry.volume,
    });
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
  acquisition?: AcquisitionEventInput,
): Promise<number[]> {
  if (openingId !== undefined && acquisition !== undefined) {
    throw new Error("pack cards cannot include separate acquisition details");
  }
  validateCardAcquisition(cards, openingId !== undefined);
  const resolved = await resolveCards(db, cards);
  let sourceKey: string;
  let insertEvent: D1PreparedStatement | null = null;
  if (openingId !== undefined) {
    const opening = await db
      .prepare(
        `SELECT COALESCE(o.volume_number, s.volume_number) AS volume,
                o.opened_at AS openedAt, o.cost, o.note
         FROM openings o
         LEFT JOIN series s ON s.name = o.series
         WHERE o.id = ?`,
      )
      .bind(openingId)
      .first<{
        volume: number | null;
        openedAt: string;
        cost: number | null;
        note: string | null;
      }>();
    if (!opening) throw new Error(`opening ${openingId} not found`);
    if (
      opening.volume == null ||
      resolved.some((card) => card.volume !== opening.volume)
    ) {
      throw new Error("every pack card must belong to the opening volume");
    }
    const event = await db
      .prepare(
        `SELECT source_key AS sourceKey FROM activity_events
         WHERE source_type = 'opening' AND source_id = ? AND kind = 'opening'
         ORDER BY id LIMIT 1`,
      )
      .bind(openingId)
      .first<{ sourceKey: string }>();
    sourceKey = event?.sourceKey ?? activityKey("opening");
    if (!event) {
      insertEvent = insertActivityEventStatement(db, {
        sourceKey,
        kind: "opening",
        occurredAt: opening.openedAt,
        sourceType: "opening",
        sourceId: openingId,
        amount: opening.cost,
        note: opening.note,
      });
    }
  } else {
    sourceKey = activityKey("acquisition");
    const isPurchase = resolved.every(
      ({ input }) => (input.source ?? "pull") === "purchase",
    );
    insertEvent = insertActivityEventStatement(db, {
      sourceKey,
      kind: isPurchase ? "purchase" : "acquisition",
      occurredAt: acquisition?.occurredAt,
      sourceType: "card_batch",
      counterparty: acquisition?.counterparty ?? null,
      amount: isPurchase
        ? Math.round(
            resolved.reduce(
              (sum, { input }) => sum + (input.purchasePrice ?? 0),
              0,
            ) * 100,
          ) / 100
        : null,
      note: acquisition?.note ?? null,
    });
  }
  if (resolved.length === 0) return [];
  const statements: D1PreparedStatement[] = [];
  if (insertEvent) statements.push(insertEvent);
  const cardResultStart = statements.length;
  for (const { input, catalogId: id } of resolved) {
    statements.push(
      db
        .prepare(
          `INSERT INTO cards
             (catalog_id, status, source, opening_id, purchase_price, note,
              acquired_event_id)
           VALUES (
             ?, 'owned', ?, ?, ?, ?,
             (SELECT id FROM activity_events WHERE source_key = ?)
           )
           RETURNING id`,
        )
        .bind(
          id,
          input.source ?? "pull",
          openingId ?? null,
          input.purchasePrice ?? null,
          input.note ?? null,
          sourceKey,
        ),
    );
  }
  for (const { input, catalogId: id } of resolved) {
    statements.push(
      insertActivityLineStatement(db, sourceKey, {
        catalogId: id,
        action: "acquired",
        delta: 1,
        afterStatus: "owned",
        unitAmount: input.purchasePrice ?? null,
        note: input.note ?? null,
      }),
    );
  }
  const results = await db.batch(statements);
  return results
    .slice(cardResultStart, cardResultStart + resolved.length)
    .map((result) => insertedId(result, "failed to add card"));
}

export async function addPack(
  db: D1Database,
  cards: AddCardInput[],
  opening: OpeningInput,
): Promise<{ ids: number[]; opening: OpeningCreated }> {
  validateCardAcquisition(cards, true);
  const resolved = await resolveCards(db, cards);
  if (resolved.some((card) => card.volume !== opening.volume)) {
    throw new Error("every pack card must belong to the opening volume");
  }
  const sourceKey = activityKey("opening");
  const statements: D1PreparedStatement[] = [
    insertActivityEventStatement(db, {
      sourceKey,
      kind: "opening",
      occurredAt: opening.openedAt,
      sourceType: "opening",
      amount: opening.cost ?? null,
      note: opening.note ?? null,
    }),
    db
      .prepare(
        `INSERT INTO openings
           (series, volume_number, opened_at, cost, note, pack_number)
         SELECT NULL, ?, ?, ?, ?, COALESCE(MAX(pack_number), 0) + 1
         FROM openings
         WHERE volume_number = ?
         RETURNING id, volume_number AS volume, pack_number AS packNumber`,
      )
      .bind(
        opening.volume,
        opening.openedAt,
        opening.cost ?? null,
        opening.note ?? null,
        opening.volume,
      ),
    db
      .prepare(
        `UPDATE activity_events
         SET source_id = (
           SELECT id FROM openings
           WHERE volume_number = ? ORDER BY pack_number DESC LIMIT 1
         )
         WHERE source_key = ?`,
      )
      .bind(opening.volume, sourceKey),
  ];
  for (const { input, catalogId: id } of resolved) {
    statements.push(
      db
        .prepare(
          `INSERT INTO cards
             (catalog_id, status, source, opening_id, purchase_price, note,
              acquired_event_id)
           VALUES (
             ?, 'owned', 'pull',
             (SELECT id FROM openings
              WHERE volume_number = ?
              ORDER BY pack_number DESC LIMIT 1),
             NULL, ?,
             (SELECT id FROM activity_events WHERE source_key = ?)
           )
           RETURNING id`,
        )
        .bind(id, opening.volume, input.note ?? null, sourceKey),
    );
  }
  for (const { input, catalogId: id } of resolved) {
    statements.push(
      insertActivityLineStatement(db, sourceKey, {
        catalogId: id,
        action: "acquired",
        delta: 1,
        afterStatus: "owned",
        note: input.note ?? null,
      }),
    );
  }
  const results = await db.batch(statements);
  const created = results[1].results[0] as OpeningCreated | undefined;
  if (!created) throw new Error("failed to create opening");
  const ids = results
    .slice(3, 3 + resolved.length)
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

async function assertCardNotHeld(
  db: D1Database,
  cardId: number,
): Promise<void> {
  const row = await db
    .prepare("SELECT held FROM cards WHERE id = ?")
    .bind(cardId)
    .first<{ held: number }>();
  if (row?.held)
    throw new Error(`card ${cardId} is held (保留); unhold it first`);
}

// Toggle the owner-held (保留) flag on a physical card. Holding locks a card out
// of the tradeable list and every give-side allocation; only an unreserved
// 'owned' card can be held. Unholding is an idempotent clear.
export async function setCardHeld(
  db: D1Database,
  id: number,
  held: boolean,
): Promise<void> {
  const card = await db
    .prepare(
      "SELECT catalog_id AS catalogId, status, held FROM cards WHERE id = ?",
    )
    .bind(id)
    .first<{ catalogId: number; status: CardStatus; held: number }>();
  if (!card) throw new Error(`card ${id} not found`);
  if (card.held === (held ? 1 : 0)) return;
  if (held) {
    if (card.status !== "owned") {
      throw new Error(
        `only an owned card can be held; card ${id} is ${card.status}`,
      );
    }
    await assertCardNotReserved(db, id);
  }
  const sourceKey = activityKey(held ? "hold" : "unhold");
  await db.batch([
    insertActivityEventStatement(db, {
      sourceKey,
      kind: held ? "hold" : "unhold",
      sourceType: "card",
      sourceId: id,
    }),
    db
      .prepare(
        "UPDATE cards SET held = ?, updated_at = datetime('now') WHERE id = ?",
      )
      .bind(held ? 1 : 0, id),
    insertActivityLineStatement(db, sourceKey, {
      catalogId: card.catalogId,
      action: held ? "held" : "released",
      beforeStatus: card.status,
      afterStatus: card.status,
    }),
  ]);
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
  await assertCardNotHeld(db, id);
  const card = await db
    .prepare(
      `SELECT catalog_id AS catalogId, status
       FROM cards WHERE id = ?`,
    )
    .bind(id)
    .first<{ catalogId: number; status: CardStatus }>();
  if (!card) throw new Error(`card ${id} not found`);
  sets.push("updated_at = datetime('now')");
  const args = [...values, id];
  const nextStatus = update.status ?? card.status;
  const classified = nextStatus !== card.status;
  const details = [
    update.askingPrice !== undefined
      ? update.askingPrice == null
        ? "清除售價"
        : `售價 ${update.askingPrice} 元`
      : null,
    update.wantInReturn !== undefined
      ? update.wantInReturn
        ? `想換 ${update.wantInReturn}`
        : "清除交換條件"
      : null,
    update.note !== undefined ? "更新備註" : null,
  ].filter((detail): detail is string => detail !== null);
  const sourceKey = activityKey(classified ? "classification" : "card-update");
  await db.batch([
    insertActivityEventStatement(db, {
      sourceKey,
      kind: classified ? "card_classified" : "card_updated",
      sourceType: "card",
      sourceId: id,
    }),
    db
      .prepare(`UPDATE cards SET ${sets.join(", ")} WHERE id = ?`)
      .bind(...args),
    insertActivityLineStatement(db, sourceKey, {
      catalogId: card.catalogId,
      action: classified ? "classified" : "updated",
      beforeStatus: card.status,
      afterStatus: nextStatus,
      unitAmount: update.askingPrice === undefined ? null : update.askingPrice,
      note: details.join("、") || null,
    }),
  ]);
}

export async function reclassifyCard(
  db: D1Database,
  id: number,
  input: ReclassifyCardInput,
): Promise<void> {
  await assertCardNotReserved(db, id);
  await assertCardNotHeld(db, id);
  const card = await db
    .prepare("SELECT catalog_id AS catalogId, status FROM cards WHERE id = ?")
    .bind(id)
    .first<{ catalogId: number; status: CardStatus }>();
  if (!card) throw new Error(`card ${id} not found`);
  if (card.status !== "owned") {
    throw new Error(
      `only an owned card can be reclassified; card ${id} is ${card.status}`,
    );
  }
  if (card.catalogId === input.targetCatalogId) {
    throw new Error(`card ${id} is already assigned to this catalog slot`);
  }
  const target = await db
    .prepare("SELECT id FROM card_catalog WHERE id = ?")
    .bind(input.targetCatalogId)
    .first<{ id: number }>();
  if (!target) throw new Error(`catalog ${input.targetCatalogId} not found`);

  const sourceKey = activityKey("reclassification");
  await db.batch([
    insertActivityEventStatement(db, {
      sourceKey,
      kind: "card_reclassified",
      occurredAt: input.happenedAt,
      sourceType: "card",
      sourceId: id,
      note: input.note ?? null,
    }),
    db
      .prepare(
        `UPDATE cards
         SET catalog_id = ?, updated_at = datetime('now')
         WHERE id = ?`,
      )
      .bind(input.targetCatalogId, id),
    insertActivityLineStatement(db, sourceKey, {
      catalogId: card.catalogId,
      action: "reclassified_from",
      delta: -1,
      beforeStatus: card.status,
      afterStatus: card.status,
    }),
    insertActivityLineStatement(db, sourceKey, {
      catalogId: input.targetCatalogId,
      action: "reclassified_to",
      delta: 1,
      beforeStatus: card.status,
      afterStatus: card.status,
    }),
  ]);
}

export async function recordTransaction(
  db: D1Database,
  cardId: number,
  t: RecordTxnInput,
): Promise<number> {
  if (t.type !== "sale" && t.type !== "trade" && t.type !== "gift") {
    throw new Error(`unsupported transaction type: ${String(t.type)}`);
  }
  if (t.type === "gift" && t.price !== undefined) {
    throw new Error("a gift cannot have a price");
  }
  if (
    t.type !== "trade" &&
    (t.receivedSeries !== undefined ||
      t.receivedCharacter !== undefined ||
      t.receivedRarity !== undefined)
  ) {
    throw new Error("only a trade can include a received card");
  }
  const receivedFieldCount = [
    t.receivedSeries,
    t.receivedCharacter,
    t.receivedRarity,
  ].filter((value) => value !== undefined).length;
  if (
    t.type === "trade" &&
    receivedFieldCount !== 0 &&
    receivedFieldCount !== 3
  ) {
    throw new Error("a received card needs series, character, and rarity");
  }
  await assertCardNotReserved(db, cardId);
  await assertCardNotHeld(db, cardId);
  const outgoing = await db
    .prepare("SELECT catalog_id AS catalogId, status FROM cards WHERE id = ?")
    .bind(cardId)
    .first<{ catalogId: number; status: CardStatus }>();
  if (!outgoing) throw new Error(`card ${cardId} not found`);
  if (!ACTIVE_STATUSES.has(outgoing.status)) {
    throw new Error(`card ${cardId} is no longer in the collection`);
  }
  let receivedCatalogId: number | null = null;
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
  }
  const sourceKey = activityKey(t.type);
  const nextStatus: CardStatus =
    t.type === "sale" ? "sold" : t.type === "trade" ? "traded" : "gifted";
  const statements: D1PreparedStatement[] = [
    insertActivityEventStatement(db, {
      sourceKey,
      kind: t.type,
      occurredAt: t.happenedAt,
      sourceType: "card",
      sourceId: cardId,
      counterparty: t.counterparty ?? null,
      amount: t.type === "gift" ? null : (t.price ?? null),
      note: t.note ?? null,
    }),
  ];
  if (receivedCatalogId != null) {
    statements.push(
      db
        .prepare(
          `INSERT INTO cards
             (catalog_id, status, source, acquired_event_id)
           VALUES (
             ?, 'owned', 'trade_in',
             (SELECT id FROM activity_events WHERE source_key = ?)
           )`,
        )
        .bind(receivedCatalogId, sourceKey),
    );
  }
  statements.push(
    db
      .prepare(
        "UPDATE cards SET status = ?, updated_at = datetime('now') WHERE id = ?",
      )
      .bind(nextStatus, cardId),
  );
  const transactionResultIndex = statements.length;
  statements.push(
    db
      .prepare(
        `INSERT INTO transactions
           (card_id, type, counterparty, price, received_catalog_id,
            received_card_id, happened_at, note)
         VALUES (
           ?, ?, ?, ?, ?,
           (SELECT k.id FROM cards k
            JOIN activity_events e ON e.id = k.acquired_event_id
            WHERE e.source_key = ? AND k.catalog_id = ?
            ORDER BY k.id DESC LIMIT 1),
           ?, ?
         )
         RETURNING id`,
      )
      .bind(
        cardId,
        t.type,
        t.counterparty ?? null,
        t.type === "gift" ? null : (t.price ?? null),
        receivedCatalogId,
        sourceKey,
        receivedCatalogId,
        t.happenedAt,
        t.note ?? null,
      ),
    insertActivityLineStatement(db, sourceKey, {
      catalogId: outgoing.catalogId,
      action: "given",
      delta: -1,
      beforeStatus: outgoing.status,
      afterStatus: nextStatus,
    }),
  );
  if (receivedCatalogId != null) {
    statements.push(
      insertActivityLineStatement(db, sourceKey, {
        catalogId: receivedCatalogId,
        action: "received",
        delta: 1,
        afterStatus: "owned",
      }),
    );
  }
  const results = await db.batch(statements);
  return insertedId(
    results[transactionResultIndex],
    "failed to record transaction",
  );
}

export async function getOpenings(db: D1Database): Promise<OpeningSummary[]> {
  return (
    await db
      .prepare(
        `SELECT o.id, o.volume_number AS volume,
                COALESCE(GROUP_CONCAT(DISTINCT c.series), o.series) AS series,
                o.pack_number AS packNumber,
                o.opened_at AS openedAt, o.cost,
                COUNT(k.id) AS cardCount,
                CASE WHEN o.cost IS NULL OR COUNT(k.id) = 0 THEN NULL
                     ELSE o.cost * 1.0 / COUNT(k.id) END AS avgCost
         FROM openings o
         LEFT JOIN cards k ON k.opening_id = o.id
         LEFT JOIN card_catalog c ON c.id = k.catalog_id
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

interface ActivityEventRow {
  id: number;
  kind: ActivityKind;
  occurredAt: string;
  sourceType: string | null;
  sourceId: number | null;
  counterparty: string | null;
  amount: number | null;
  note: string | null;
  revertsEventId: number | null;
  reversedAt: string | null;
  createdAt: string;
  tradePostId: number | null;
  tradePostPublicId: string | null;
  canUndo: number;
}

interface ActivityLineRow extends Omit<ActivityLine, "action"> {
  eventId: number;
  action: ActivityLineAction;
}

export async function getActivities(
  db: D1Database,
  limit = 100,
  catalogId?: number,
): Promise<ActivityEvent[]> {
  const safeLimit = Math.max(1, Math.min(250, Math.trunc(limit) || 100));
  const eventFilter =
    catalogId === undefined
      ? ""
      : `WHERE EXISTS (
           SELECT 1 FROM activity_event_lines selected
           WHERE selected.event_id = e.id AND selected.catalog_id = ?
         )`;
  const rows = (
    await db
      .prepare(
        `SELECT e.id, e.kind, e.occurred_at AS occurredAt,
                e.source_type AS sourceType, e.source_id AS sourceId,
                e.counterparty, e.amount, e.note,
                e.reverts_event_id AS revertsEventId,
                e.reversed_at AS reversedAt, e.created_at AS createdAt,
                e.trade_post_id AS tradePostId,
                p.public_id AS tradePostPublicId,
                CASE
                  WHEN e.kind IN ('opening', 'purchase', 'acquisition')
                   AND e.reversed_at IS NULL
                   AND EXISTS (
                     SELECT 1 FROM activity_event_lines l
                     WHERE l.event_id = e.id AND l.delta > 0
                   )
                   AND (
                     SELECT COALESCE(SUM(l.qty), 0)
                     FROM activity_event_lines l
                     WHERE l.event_id = e.id AND l.delta > 0
                   ) = (
                     SELECT COUNT(*) FROM cards k
                     WHERE k.acquired_event_id = e.id
                   )
                   AND NOT EXISTS (
                     SELECT 1 FROM cards k
                     WHERE k.acquired_event_id = e.id
                       AND (
                         k.status <> 'owned'
                         OR k.held <> 0
                         OR k.updated_at <> k.created_at
                         OR EXISTS (
                           SELECT 1 FROM trade_reservation_lines l
                           WHERE l.card_id = k.id
                         )
                         OR EXISTS (
                           SELECT 1 FROM trade_reservation_lines legacy
                           WHERE legacy.direction = 'give'
                             AND legacy.card_id IS NULL
                             AND legacy.catalog_id = k.catalog_id
                         )
                         OR EXISTS (
                           SELECT 1 FROM transactions t
                           WHERE t.card_id = k.id OR t.received_card_id = k.id
                         )
                         OR EXISTS (
                           SELECT 1 FROM activity_events later
                           WHERE later.source_type = 'card'
                             AND later.source_id = k.id
                         )
                       )
                   )
                   AND (
                     e.kind <> 'opening'
                     OR EXISTS (
                       SELECT 1 FROM openings o WHERE o.id = e.source_id
                     )
                   )
                  THEN 1 ELSE 0
                END AS canUndo
         FROM activity_events e
         LEFT JOIN trade_posts p ON p.id = e.trade_post_id
         ${eventFilter}
         ORDER BY e.occurred_at DESC, e.id DESC
         LIMIT ?`,
      )
      .bind(...(catalogId === undefined ? [safeLimit] : [catalogId, safeLimit]))
      .all<ActivityEventRow>()
  ).results;
  if (rows.length === 0) return [];

  const lines = (
    await db
      .prepare(
        `WITH recent AS (
           SELECT e.id FROM activity_events e
           ${eventFilter}
           ORDER BY occurred_at DESC, id DESC
           LIMIT ?
         )
         SELECT l.event_id AS eventId, l.catalog_id AS catalogId,
                c.series, c.character, c.rarity, l.action,
                SUM(l.qty) AS qty, SUM(l.delta) AS delta,
                l.before_status AS beforeStatus,
                l.after_status AS afterStatus,
                l.before_want AS beforeWant,
                l.after_want AS afterWant,
                l.unit_amount AS unitAmount, l.note
         FROM activity_event_lines l
         JOIN recent r ON r.id = l.event_id
         LEFT JOIN card_catalog c ON c.id = l.catalog_id
         ${catalogId === undefined ? "" : "WHERE l.catalog_id = ?"}
         GROUP BY l.event_id, l.catalog_id, l.action,
                  l.before_status, l.after_status, l.before_want,
                  l.after_want, l.unit_amount, l.note
         ORDER BY l.event_id DESC, c.sort_order, MIN(l.id)`,
      )
      .bind(
        ...(catalogId === undefined
          ? [safeLimit]
          : [catalogId, safeLimit, catalogId]),
      )
      .all<ActivityLineRow>()
  ).results;

  const events = rows.map(
    (row): ActivityEvent => ({
      ...row,
      canUndo: row.canUndo === 1,
      lines: [],
    }),
  );
  const byId = new Map(events.map((event) => [event.id, event]));
  for (const { eventId, ...line } of lines) {
    byId.get(eventId)?.lines.push(line);
  }
  return events;
}

export async function undoActivity(db: D1Database, id: number): Promise<void> {
  const state = await db
    .prepare(
      `SELECT e.kind, e.source_type AS sourceType, e.source_id AS sourceId,
              e.reversed_at AS reversedAt,
              (SELECT COALESCE(SUM(l.qty), 0)
               FROM activity_event_lines l
               WHERE l.event_id = e.id AND l.delta > 0) AS expectedCards,
              (SELECT COUNT(*) FROM cards k
               WHERE k.acquired_event_id = e.id) AS currentCards,
              (SELECT COUNT(*) FROM cards k
               WHERE k.acquired_event_id = e.id
                 AND k.status = 'owned'
                 AND k.held = 0
                 AND k.updated_at = k.created_at
                 AND NOT EXISTS (
                   SELECT 1 FROM trade_reservation_lines l
                   WHERE l.card_id = k.id
                 )
                 AND NOT EXISTS (
                   SELECT 1 FROM trade_reservation_lines legacy
                   WHERE legacy.direction = 'give'
                     AND legacy.card_id IS NULL
                     AND legacy.catalog_id = k.catalog_id
                 )
                 AND NOT EXISTS (
                   SELECT 1 FROM transactions t
                   WHERE t.card_id = k.id OR t.received_card_id = k.id
                 )
                 AND NOT EXISTS (
                   SELECT 1 FROM activity_events later
                   WHERE later.source_type = 'card'
                     AND later.source_id = k.id
                 )) AS eligibleCards
       FROM activity_events e WHERE e.id = ?`,
    )
    .bind(id)
    .first<{
      kind: ActivityKind;
      sourceType: string | null;
      sourceId: number | null;
      reversedAt: string | null;
      expectedCards: number;
      currentCards: number;
      eligibleCards: number;
    }>();
  if (!state) throw new Error(`activity ${id} not found`);
  if (
    !(["opening", "purchase", "acquisition"] as ActivityKind[]).includes(
      state.kind,
    )
  ) {
    throw new Error("this activity cannot be undone");
  }
  if (state.reversedAt) throw new Error("this activity was already undone");
  if (state.expectedCards < 1) {
    throw new Error("this activity has no acquired cards to undo");
  }
  if (
    state.expectedCards !== state.currentCards ||
    state.currentCards !== state.eligibleCards
  ) {
    throw new Error(
      "cards from this activity have later changes and cannot be undone",
    );
  }
  if (state.kind === "opening") {
    if (state.sourceType !== "opening" || state.sourceId == null) {
      throw new Error("opening source is missing");
    }
    const opening = await db
      .prepare("SELECT id FROM openings WHERE id = ?")
      .bind(state.sourceId)
      .first<{ id: number }>();
    if (!opening) throw new Error("opening source is missing");
  }

  const undoKey = `undo:${id}`;
  const statements: D1PreparedStatement[] = [
    db
      .prepare(
        `UPDATE activity_events
         SET reversed_at = datetime('now')
         WHERE id = ? AND reversed_at IS NULL
         RETURNING id`,
      )
      .bind(id),
    insertActivityEventStatement(db, {
      sourceKey: undoKey,
      kind: "undo",
      sourceType: "activity",
      sourceId: id,
      revertsEventId: id,
      note: `撤銷 #${id}`,
    }),
    db
      .prepare(
        `INSERT INTO activity_event_lines
           (event_id, catalog_id, action, qty, delta,
            before_status, after_status, unit_amount, note)
         SELECT undo.id, original.catalog_id, 'undone', original.qty,
                -original.delta, original.after_status, original.before_status,
                original.unit_amount, original.note
         FROM activity_event_lines original
         JOIN activity_events undo ON undo.source_key = ?
         WHERE original.event_id = ?`,
      )
      .bind(undoKey, id),
    db.prepare("DELETE FROM cards WHERE acquired_event_id = ?").bind(id),
  ];
  if (state.kind === "opening" && state.sourceId != null) {
    statements.push(
      db.prepare("DELETE FROM openings WHERE id = ?").bind(state.sourceId),
    );
  }
  const results = await db.batch(statements);
  if (results[0].results.length === 0) {
    throw new Error("this activity was already undone");
  }
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
             AND k.held = 0
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
            k.purchase_price AS purchasePrice,
            COALESCE(
              p.seller,
              CASE WHEN k.source = 'purchase' THEN acquired.counterparty END
            ) AS purchaseSeller,
            COALESCE(
              p.ordered_at,
              CASE WHEN k.source = 'purchase' THEN acquired.occurred_at END
            ) AS purchaseOrderedAt,
            COALESCE(
              p.note,
              CASE WHEN k.source = 'purchase' THEN acquired.note END
            ) AS purchaseNote,
            k.asking_price AS askingPrice,
            k.want_in_return AS wantInReturn, k.note,
            (SELECT COUNT(*) FROM cards k2
             WHERE k2.catalog_id = k.catalog_id AND k2.status IN ${ACTIVE}) AS activeCount,
            (SELECT COALESCE(SUM(qty), 0) FROM trade_reservation_lines l
             WHERE l.catalog_id = k.catalog_id AND l.direction = 'give') AS reservedGive,
            k.held AS held,
            EXISTS(
              SELECT 1 FROM trade_reservation_lines l
              WHERE l.card_id = k.id AND l.direction = 'give'
            ) AS reserved
     FROM cards k
     JOIN card_catalog c ON c.id = k.catalog_id
     LEFT JOIN purchase_reservations p ON p.id = k.purchase_reservation_id
     LEFT JOIN activity_events acquired ON acquired.id = k.acquired_event_id
     ${where}
     ORDER BY c.sort_order, k.id`,
  );
  const bound = vals.length ? stmt.bind(...vals) : stmt;
  const rows = (
    await bound.all<
      Omit<CardRow, "duplicate" | "reserved" | "held"> & {
        activeCount: number;
        reserved: number;
        held: number;
      }
    >()
  ).results;
  const legacyReserved = await legacyReservedCardIds(db);
  return rows.map(({ activeCount, reserved, held, ...r }) => ({
    ...r,
    reserved: Boolean(reserved) || legacyReserved.has(r.id),
    held: Boolean(held),
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
        `SELECT r.id, r.reserved_at AS reservedAt, r.counterparty, r.note,
                r.trade_post_id AS tradePostId,
                p.public_id AS tradePostPublicId
         FROM trade_reservations r
         LEFT JOIN trade_posts p ON p.id = r.trade_post_id
         ORDER BY r.reserved_at DESC, r.id DESC`,
      )
      .all<{
        id: number;
        reservedAt: string;
        counterparty: string | null;
        note: string | null;
        tradePostId: number | null;
        tradePostPublicId: string | null;
      }>()
  ).results.map((h) => ({ ...h, give: [], receive: [] }) as AdminPendingTrade);
  return attachLines(headers, await reservationLines(db));
}

interface ResolvedReservationLineInput {
  catalogId: number;
  qty: number;
}

interface ResolvedReservationInput {
  counterparty?: string;
  reservedAt: string;
  note?: string;
  give: ResolvedReservationLineInput[];
  receive: ResolvedReservationLineInput[];
}

interface PendingLine {
  direction: TradeDirection;
  catalogId: number;
  qty: number;
  cardId: number | null;
}

async function createResolvedReservation(
  db: D1Database,
  input: ResolvedReservationInput,
  tradePostId: number | null = null,
): Promise<number> {
  // Resolve and allocate everything before writing. The partial unique index on
  // card_id is the final concurrency guard if two requests race this read phase.
  const giveRequests = input.give;
  for (const line of [...giveRequests, ...input.receive]) {
    if (
      !Number.isInteger(line.catalogId) ||
      line.catalogId < 1 ||
      !Number.isInteger(line.qty) ||
      line.qty < 1
    ) {
      throw new Error(
        "reservation lines need valid catalog ids and quantities",
      );
    }
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
  const legacyReserved = await legacyReservedCardIds(db);
  for (const [catalog, demand] of demandByCatalog) {
    const statusFilter =
      tradePostId === null
        ? "k.status IN ('owned','for_sale','for_trade')"
        : "k.status = 'for_trade'";
    const candidates = (
      await db
        .prepare(
          `SELECT k.id
           FROM cards k
           WHERE k.catalog_id = ?
             AND ${statusFilter}
             AND k.held = 0
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
    const available = candidates.filter((card) => !legacyReserved.has(card.id));
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
  for (const r of input.receive) {
    lines.push({
      direction: "receive",
      catalogId: r.catalogId,
      qty: r.qty,
      cardId: null,
    });
  }

  const id =
    (
      await db
        .prepare(
          `SELECT COALESCE(
             (SELECT seq FROM sqlite_sequence WHERE name = 'trade_reservations'),
             0
           ) + 1 AS id`,
        )
        .first<{ id: number }>()
    )?.id ?? 1;
  const sourceKey = activityKey("trade-reserved");
  const statements: D1PreparedStatement[] = [
    insertActivityEventStatement(db, {
      sourceKey,
      kind: "trade_reserved",
      occurredAt: input.reservedAt,
      sourceType: "trade_reservation",
      sourceId: id,
      counterparty: input.counterparty ?? null,
      note: input.note ?? null,
      tradePostId,
    }),
    db
      .prepare(
        `INSERT INTO trade_reservations
           (id, counterparty, reserved_at, note, trade_post_id)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .bind(
        id,
        input.counterparty ?? null,
        input.reservedAt,
        input.note ?? null,
        tradePostId,
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
  for (const line of lines) {
    statements.push(
      insertActivityLineStatement(db, sourceKey, {
        catalogId: line.catalogId,
        action:
          line.direction === "give" ? "reserved_give" : "reserved_receive",
        qty: line.qty,
      }),
    );
  }
  await db.batch(statements);
  return id;
}

export async function createReservation(
  db: D1Database,
  input: CreateReservationInput,
): Promise<number> {
  const give: ResolvedReservationLineInput[] = [];
  for (const line of input.give) {
    give.push({
      catalogId: await catalogId(db, line.series, line.character, line.rarity),
      qty: line.qty,
    });
  }
  const receive: ResolvedReservationLineInput[] = [];
  for (const line of input.receive ?? []) {
    receive.push({
      catalogId: await catalogId(db, line.series, line.character, line.rarity),
      qty: line.qty,
    });
  }
  return createResolvedReservation(db, { ...input, give, receive });
}

export async function createTradePostReservation(
  db: D1Database,
  tradePostId: number,
  input: CreateTradePostReservationInput,
): Promise<number> {
  if (input.give.length === 0) {
    throw new Error("at least one give line required");
  }
  const post = await db
    .prepare("SELECT status FROM trade_posts WHERE id = ?")
    .bind(tradePostId)
    .first<{ status: TradePostStatus }>();
  if (!post || post.status !== "published") {
    throw new Error(`published announcement ${tradePostId} not found`);
  }

  const snapshot = (
    await db
      .prepare(
        `SELECT direction, catalog_id AS catalogId, qty
         FROM trade_post_lines WHERE post_id = ?`,
      )
      .bind(tradePostId)
      .all<{
        direction: TradePostDirection;
        catalogId: number | null;
        qty: number;
      }>()
  ).results;
  const snapshotByKey = new Map(
    snapshot.flatMap((line) =>
      line.catalogId === null
        ? []
        : [
            [
              tradePostAvailabilityKey(line.direction, line.catalogId),
              line.qty,
            ] as const,
          ],
    ),
  );
  const availability = await tradePostAvailability(db);
  const requested = [
    ...input.give.map((line) => ({ ...line, direction: "give" as const })),
    ...input.receive.map((line) => ({ ...line, direction: "want" as const })),
  ];
  const seen = new Set<string>();
  for (const line of requested) {
    const key = tradePostAvailabilityKey(line.direction, line.catalogId);
    if (seen.has(key)) {
      throw new Error("a card type can only appear once per reservation side");
    }
    seen.add(key);
    const snapshotQty = snapshotByKey.get(key) ?? 0;
    const availableQty = availability.get(key) ?? 0;
    if (snapshotQty === 0) {
      throw new Error(
        "reservation contains a card not advertised by this post",
      );
    }
    if (line.qty > Math.min(snapshotQty, availableQty)) {
      throw new Error("announcement quantity is no longer available");
    }
  }

  return createResolvedReservation(
    db,
    {
      counterparty: input.counterparty,
      reservedAt: input.reservedAt,
      note: input.note,
      give: input.give,
      receive: input.receive,
    },
    tradePostId,
  );
}

async function tradeReservationActivityId(
  db: D1Database,
  reservationId: number,
): Promise<number> {
  const event = await db
    .prepare(
      `SELECT id FROM activity_events
       WHERE source_type = 'trade_reservation'
         AND source_id = ?
         AND kind = 'trade_reserved'
       ORDER BY id DESC
       LIMIT 1`,
    )
    .bind(reservationId)
    .first<{ id: number }>();
  if (!event) {
    throw new Error(`reservation ${reservationId} has no activity lifecycle`);
  }
  return event.id;
}

export async function cancelReservation(
  db: D1Database,
  id: number,
): Promise<void> {
  const header = await db
    .prepare(
      `SELECT counterparty, note, trade_post_id AS tradePostId
       FROM trade_reservations WHERE id = ?`,
    )
    .bind(id)
    .first<{
      counterparty: string | null;
      note: string | null;
      tradePostId: number | null;
    }>();
  if (!header) throw new Error(`reservation ${id} not found`);
  const lifecycleId = await tradeReservationActivityId(db, id);
  const lines = (
    await db
      .prepare(
        `SELECT direction, catalog_id AS catalogId, SUM(qty) AS qty
         FROM trade_reservation_lines WHERE reservation_id = ?
         GROUP BY direction, catalog_id`,
      )
      .bind(id)
      .all<{
        direction: TradeDirection;
        catalogId: number;
        qty: number;
      }>()
  ).results;
  const sourceKey = `trade-terminal:${lifecycleId}`;
  const statements: D1PreparedStatement[] = [
    insertActivityEventStatement(db, {
      sourceKey,
      kind: "trade_reservation_cancelled",
      sourceType: "trade_reservation",
      sourceId: id,
      counterparty: header.counterparty,
      note: header.note,
      tradePostId: header.tradePostId,
    }),
  ];
  for (const line of lines) {
    statements.push(
      insertActivityLineStatement(db, sourceKey, {
        catalogId: line.catalogId,
        action: "cancelled",
        qty: line.qty,
        note: line.direction === "give" ? "取消給出預約" : "取消換入預約",
      }),
    );
  }
  statements.push(
    db
      .prepare("DELETE FROM trade_reservation_lines WHERE reservation_id = ?")
      .bind(id),
    db.prepare("DELETE FROM trade_reservations WHERE id = ?").bind(id),
  );
  await db.batch(statements);
}

const RARITY_RANK: Record<Rarity, number> = {
  R: 0,
  SR: 1,
  SSR: 2,
  UR: 3,
  EX: 4,
};

export async function completeReservation(
  db: D1Database,
  id: number,
  happenedAt: string,
): Promise<void> {
  // ---- READ PHASE (no writes) ----
  const header = await db
    .prepare(
      `SELECT counterparty, note, trade_post_id AS tradePostId
       FROM trade_reservations WHERE id = ?`,
    )
    .bind(id)
    .first<{
      counterparty: string | null;
      note: string | null;
      tradePostId: number | null;
    }>();
  if (!header) throw new Error(`reservation ${id} not found`);
  const lifecycleId = await tradeReservationActivityId(db, id);

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
         WHERE catalog_id = ? AND status IN ('owned','for_sale','for_trade')
           AND held = 0 ${exclude}
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
  const sourceKey = `trade-terminal:${lifecycleId}`;
  const stmts: D1PreparedStatement[] = [
    insertActivityEventStatement(db, {
      sourceKey,
      kind: "trade_completed",
      occurredAt: happenedAt,
      sourceType: "trade_reservation",
      sourceId: id,
      counterparty: header.counterparty,
      note: header.note,
      tradePostId: header.tradePostId,
    }),
  ];
  for (const line of raw) {
    stmts.push(
      insertActivityLineStatement(db, sourceKey, {
        catalogId: line.catalogId,
        action: line.direction === "give" ? "given" : "received",
        qty: line.qty,
        delta: line.direction === "give" ? -line.qty : line.qty,
        afterStatus: line.direction === "give" ? "traded" : "owned",
      }),
    );
  }
  stmts.push(
    db
      .prepare("DELETE FROM trade_reservation_lines WHERE reservation_id = ?")
      .bind(id),
    db.prepare("DELETE FROM trade_reservations WHERE id = ?").bind(id),
  );
  for (const r of receives) {
    stmts.push(
      db
        .prepare(
          `INSERT INTO cards
             (catalog_id, status, source, acquired_event_id)
           VALUES (
             ?, 'owned', 'trade_in',
             (SELECT id FROM activity_events WHERE source_key = ?)
           )`,
        )
        .bind(r.catalogId, sourceKey),
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

// ---- Pending purchase reservations ----

interface RawPurchaseReservationLine {
  reservationId: number;
  catalogId: number;
  series: string;
  character: string;
  rarity: Rarity;
  qty: number;
  unitPrice: number;
}

async function purchaseReservationLines(
  db: D1Database,
): Promise<RawPurchaseReservationLine[]> {
  return (
    await db
      .prepare(
        `SELECT l.reservation_id AS reservationId,
                l.catalog_id AS catalogId, c.series, c.character, c.rarity,
                l.qty, l.unit_price AS unitPrice
         FROM purchase_reservation_lines l
         JOIN purchase_reservations r ON r.id = l.reservation_id
         JOIN card_catalog c ON c.id = l.catalog_id
         WHERE r.status = 'pending'
         ORDER BY c.sort_order, l.id`,
      )
      .all<RawPurchaseReservationLine>()
  ).results;
}

export async function getPublicPendingPurchases(
  db: D1Database,
): Promise<PublicPendingPurchase[]> {
  const purchases = (
    await db
      .prepare(
        `SELECT id, ordered_at AS orderedAt
         FROM purchase_reservations
         WHERE status = 'pending'
         ORDER BY ordered_at DESC, id DESC`,
      )
      .all<{ id: number; orderedAt: string }>()
  ).results.map(
    (purchase) => ({ ...purchase, lines: [] }) as PublicPendingPurchase,
  );
  const byId = new Map(purchases.map((purchase) => [purchase.id, purchase]));
  for (const {
    reservationId,
    unitPrice: _,
    ...line
  } of await purchaseReservationLines(db)) {
    byId.get(reservationId)?.lines.push(line as PurchaseReservationLine);
  }
  return purchases;
}

export async function getAdminPendingPurchases(
  db: D1Database,
): Promise<AdminPendingPurchase[]> {
  const purchases = (
    await db
      .prepare(
        `SELECT id, ordered_at AS orderedAt, seller, note
         FROM purchase_reservations
         WHERE status = 'pending'
         ORDER BY ordered_at DESC, id DESC`,
      )
      .all<{
        id: number;
        orderedAt: string;
        seller: string | null;
        note: string | null;
      }>()
  ).results.map(
    (purchase) => ({ ...purchase, lines: [] }) as AdminPendingPurchase,
  );
  const byId = new Map(purchases.map((purchase) => [purchase.id, purchase]));
  for (const { reservationId, ...line } of await purchaseReservationLines(db)) {
    byId.get(reservationId)?.lines.push(line as AdminPurchaseReservationLine);
  }
  return purchases;
}

export async function createPurchaseReservation(
  db: D1Database,
  input: CreatePurchaseReservationInput,
): Promise<number> {
  if (!input.orderedAt) throw new Error("orderedAt required");
  if (!Array.isArray(input.lines) || input.lines.length === 0) {
    throw new Error("at least one purchase line required");
  }
  if (input.lines.length > 50) {
    throw new Error("at most 50 purchase lines are allowed");
  }

  const resolved: Array<{
    catalogId: number;
    qty: number;
    unitPrice: number;
  }> = [];
  let totalQty = 0;
  for (const line of input.lines) {
    if (!Number.isInteger(line.qty) || line.qty < 1 || line.qty > 99) {
      throw new Error("qty must be an integer between 1 and 99");
    }
    totalQty += line.qty;
    if (totalQty > 500) {
      throw new Error("at most 500 cards are allowed per purchase");
    }
    if (!Number.isFinite(line.unitPrice) || line.unitPrice < 0) {
      throw new Error("unitPrice must be finite and nonnegative");
    }
    resolved.push({
      catalogId: await catalogId(db, line.series, line.character, line.rarity),
      qty: line.qty,
      unitPrice: line.unitPrice,
    });
  }

  // D1 executes a batch sequentially as one transaction, so the newest header
  // remains this batch's header while its lines and activity snapshot are added.
  const sourceKey = activityKey("purchase-ordered");
  const statements: D1PreparedStatement[] = [
    db
      .prepare(
        `INSERT INTO purchase_reservations (seller, ordered_at, note)
         VALUES (?, ?, ?)
         RETURNING id`,
      )
      .bind(input.seller ?? null, input.orderedAt, input.note ?? null),
    insertActivityEventStatement(db, {
      sourceKey,
      kind: "purchase_ordered",
      occurredAt: input.orderedAt,
      sourceType: "purchase_reservation",
      counterparty: input.seller ?? null,
      amount: resolved.reduce(
        (total, line) => total + line.qty * line.unitPrice,
        0,
      ),
      note: input.note ?? null,
    }),
    db
      .prepare(
        `UPDATE activity_events
         SET source_id = (
           SELECT id FROM purchase_reservations ORDER BY id DESC LIMIT 1
         )
         WHERE source_key = ?`,
      )
      .bind(sourceKey),
  ];
  for (const line of resolved) {
    statements.push(
      db
        .prepare(
          `INSERT INTO purchase_reservation_lines
             (reservation_id, catalog_id, qty, unit_price)
           VALUES (
             (SELECT id FROM purchase_reservations ORDER BY id DESC LIMIT 1),
             ?, ?, ?
           )`,
        )
        .bind(line.catalogId, line.qty, line.unitPrice),
    );
  }
  for (const line of resolved) {
    statements.push(
      insertActivityLineStatement(db, sourceKey, {
        catalogId: line.catalogId,
        action: "ordered",
        qty: line.qty,
        unitAmount: line.unitPrice,
      }),
    );
  }
  const results = await db.batch(statements);
  return insertedId(results[0], "failed to create purchase reservation");
}

export async function completePurchaseReservation(
  db: D1Database,
  id: number,
): Promise<void> {
  // Claim the pending header first, then write its event, cards, and lines in
  // the same atomic batch. The deterministic event key makes a repeated or
  // concurrent completion fail the batch instead of duplicating activity lines.
  const sourceKey = `purchase-received:${id}`;
  const results = await db.batch([
    db
      .prepare(
        `UPDATE purchase_reservations
         SET status = 'received', received_at = datetime('now')
         WHERE id = ? AND status = 'pending'
         RETURNING id`,
      )
      .bind(id),
    db
      .prepare(
        `INSERT INTO activity_events
           (source_key, kind, occurred_at, source_type, source_id,
            counterparty, amount, note)
         SELECT ?, 'purchase_received', r.received_at,
                'purchase_reservation', r.id, r.seller,
                SUM(l.qty * l.unit_price), r.note
         FROM purchase_reservations r
         JOIN purchase_reservation_lines l ON l.reservation_id = r.id
         WHERE r.id = ? AND r.status = 'received'
         GROUP BY r.id
         RETURNING id`,
      )
      .bind(sourceKey, id),
    db
      .prepare(
        `INSERT INTO activity_event_lines
           (event_id, catalog_id, action, qty, delta, unit_amount, after_status)
         SELECT e.id, l.catalog_id, 'acquired', l.qty, l.qty,
                l.unit_price, 'owned'
         FROM purchase_reservation_lines l
         JOIN activity_events e ON e.source_key = ?
         WHERE l.reservation_id = ?`,
      )
      .bind(sourceKey, id),
    db
      .prepare(
        `WITH RECURSIVE expanded(reservation_id, catalog_id, unit_price, copy, qty) AS (
           SELECT r.id, l.catalog_id, l.unit_price, 1, l.qty
           FROM purchase_reservation_lines l
           JOIN purchase_reservations r ON r.id = l.reservation_id
           WHERE l.reservation_id = ? AND r.status = 'received'
           UNION ALL
           SELECT reservation_id, catalog_id, unit_price, copy + 1, qty
           FROM expanded
           WHERE copy < qty
         )
         INSERT INTO cards
           (catalog_id, status, source, purchase_price,
            purchase_reservation_id, acquired_event_id)
         SELECT catalog_id, 'owned', 'purchase', unit_price, reservation_id,
                (SELECT id FROM activity_events WHERE source_key = ?)
         FROM expanded`,
      )
      .bind(id, sourceKey),
  ]);
  if (results[0].results.length === 0) {
    throw new Error(`pending purchase reservation ${id} not found`);
  }
}

export async function cancelPurchaseReservation(
  db: D1Database,
  id: number,
): Promise<void> {
  const sourceKey = `purchase-cancelled:${id}`;
  const results = await db.batch([
    db
      .prepare(
        `UPDATE purchase_reservations
         SET status = 'cancelled', cancelled_at = datetime('now')
         WHERE id = ? AND status = 'pending'
         RETURNING id`,
      )
      .bind(id),
    db
      .prepare(
        `INSERT INTO activity_events
           (source_key, kind, occurred_at, source_type, source_id,
            counterparty, amount, note)
         SELECT ?, 'purchase_cancelled', r.cancelled_at,
                'purchase_reservation', r.id, r.seller,
                SUM(l.qty * l.unit_price), r.note
         FROM purchase_reservations r
         JOIN purchase_reservation_lines l ON l.reservation_id = r.id
         WHERE r.id = ? AND r.status = 'cancelled'
         GROUP BY r.id
         RETURNING id`,
      )
      .bind(sourceKey, id),
    db
      .prepare(
        `INSERT INTO activity_event_lines
           (event_id, catalog_id, action, qty, delta, unit_amount)
         SELECT e.id, l.catalog_id, 'cancelled', l.qty, 0, l.unit_price
         FROM purchase_reservation_lines l
         JOIN activity_events e ON e.source_key = ?
         WHERE l.reservation_id = ?`,
      )
      .bind(sourceKey, id),
  ]);
  if (results[0].results.length === 0) {
    throw new Error(`pending purchase reservation ${id} not found`);
  }
}
