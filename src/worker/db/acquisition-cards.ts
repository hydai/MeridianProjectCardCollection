import type { AddCardInput } from "../../shared/types";

export function acquiredCardStatements(
  db: D1Database,
  sourceKey: string,
  cards: { catalogId: number; input: AddCardInput }[],
  openingId?: number,
): [D1PreparedStatement, D1PreparedStatement] {
  const payload = JSON.stringify(
    cards.map(({ catalogId, input }) => ({
      catalogId,
      source: input.source ?? "pull",
      purchasePrice: input.purchasePrice ?? null,
      note: input.note ?? null,
    })),
  );
  return [
    db
      .prepare(
        `INSERT INTO cards
           (catalog_id, status, source, opening_id, purchase_price, note,
            acquired_event_id)
         SELECT json_extract(item.value, '$.catalogId'), 'owned',
                json_extract(item.value, '$.source'),
                COALESCE(?, CASE WHEN e.source_type = 'opening' THEN e.source_id END),
                json_extract(item.value, '$.purchasePrice'),
                json_extract(item.value, '$.note'), e.id
         FROM json_each(?) item
         JOIN activity_events e ON e.source_key = ?
         ORDER BY CAST(item.key AS INTEGER)
         RETURNING id`,
      )
      .bind(openingId ?? null, payload, sourceKey),
    db
      .prepare(
        `INSERT INTO activity_event_lines
           (event_id, catalog_id, action, qty, delta, after_status,
            unit_amount, note)
         SELECT e.id, json_extract(item.value, '$.catalogId'), 'acquired',
                COUNT(*), COUNT(*), 'owned',
                json_extract(item.value, '$.purchasePrice'),
                json_extract(item.value, '$.note')
         FROM json_each(?) item
         JOIN activity_events e ON e.source_key = ?
         GROUP BY e.id, json_extract(item.value, '$.catalogId'),
                  json_extract(item.value, '$.purchasePrice'),
                  json_extract(item.value, '$.note')`,
      )
      .bind(payload, sourceKey),
  ];
}

export function acquiredCardIds(result: D1Result<unknown>): number[] {
  return result.results
    .map((row) => {
      if (
        !row ||
        typeof row !== "object" ||
        !("id" in row) ||
        typeof row.id !== "number"
      ) {
        throw new Error("failed to add card");
      }
      return row.id;
    })
    .sort((left, right) => left - right);
}
