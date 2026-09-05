import type { CardStatus } from "../../shared/types";

export interface SqlCondition {
  sql: string;
  values: unknown[];
}

export interface CardSnapshot {
  id: number;
  catalogId: number;
  status: CardStatus;
  held: number;
  version: number;
}

export const LEGACY_RESERVED_CARD_IDS = `
  WITH legacy AS (
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
    WHERE k.status IN ('owned','for_sale','for_trade')
      AND k.held = 0
      AND NOT EXISTS (
        SELECT 1 FROM trade_reservation_lines explicit
        WHERE explicit.direction = 'give' AND explicit.card_id = k.id
      )
  )
  SELECT ranked.id
  FROM ranked
  JOIN legacy ON legacy.catalog_id = ranked.catalog_id
  WHERE ranked.position <= legacy.qty`;

export const CARD_IS_UNRESERVED = `
  NOT EXISTS (
    SELECT 1 FROM trade_reservation_lines reserved
    WHERE reserved.direction = 'give' AND reserved.card_id = k.id
  )
  AND k.id NOT IN (${LEGACY_RESERVED_CARD_IDS})`;

export const CARD_IS_UNTOUCHED = `
  k.status = 'owned'
  AND k.held = 0
  AND k.mutation_version = 0
  AND k.updated_at = k.created_at
  AND NOT EXISTS (
    SELECT 1 FROM trade_reservation_lines l WHERE l.card_id = k.id
  )
  AND NOT EXISTS (
    SELECT 1 FROM trade_reservation_lines legacy
    WHERE legacy.direction = 'give' AND legacy.card_id IS NULL
      AND legacy.catalog_id = k.catalog_id
  )
  AND NOT EXISTS (
    SELECT 1 FROM transactions t
    WHERE t.card_id = k.id OR t.received_card_id = k.id
  )
  AND NOT EXISTS (
    SELECT 1 FROM activity_events later
    WHERE later.source_type = 'card' AND later.source_id = k.id
  )`;

export const ACQUISITION_IS_UNDOABLE = `
  e.kind IN ('opening', 'purchase', 'acquisition')
  AND e.reversed_at IS NULL
  AND EXISTS (
    SELECT 1 FROM activity_event_lines l
    WHERE l.event_id = e.id AND l.delta > 0
  )
  AND (
    SELECT COALESCE(SUM(l.qty), 0) FROM activity_event_lines l
    WHERE l.event_id = e.id AND l.delta > 0
  ) = (
    SELECT COUNT(*) FROM cards k WHERE k.acquired_event_id = e.id
  )
  AND NOT EXISTS (
    SELECT 1 FROM cards k
    WHERE k.acquired_event_id = e.id AND NOT (${CARD_IS_UNTOUCHED})
  )
  AND (
    e.kind <> 'opening'
    OR (
      e.source_type = 'opening'
      AND EXISTS (SELECT 1 FROM openings o WHERE o.id = e.source_id)
    )
  )`;

export async function readCardSnapshot(
  db: D1Database,
  id: number,
): Promise<CardSnapshot> {
  const card = await db
    .prepare(
      `SELECT id, catalog_id AS catalogId, status, held,
              mutation_version AS version
       FROM cards WHERE id = ?`,
    )
    .bind(id)
    .first<CardSnapshot>();
  if (!card) throw new Error(`card ${id} not found`);
  return card;
}

export function unchangedCardsCondition(
  cards: Pick<CardSnapshot, "id" | "version">[],
  eligibility: SqlCondition,
): SqlCondition {
  if (new Set(cards.map((card) => card.id)).size !== cards.length) {
    throw new Error("a physical card can only be claimed once");
  }
  return {
    sql: `(
      SELECT COUNT(*)
      FROM json_each(?) requested
      JOIN cards k ON k.id = json_extract(requested.value, '$.id')
        AND k.mutation_version = json_extract(requested.value, '$.version')
      WHERE ${eligibility.sql}
    ) = ?`,
    values: [
      JSON.stringify(cards.map(({ id, version }) => ({ id, version }))),
      ...eligibility.values,
      cards.length,
    ],
  };
}
