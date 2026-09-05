import type { OpeningCreated } from "../../shared/types";

export interface AcquisitionRequest {
  key: string;
  hash: string;
}

export interface AcquisitionResult {
  ids: number[];
  opening?: OpeningCreated;
}

export class AcquisitionConflictError extends Error {}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }
  if (value !== null && typeof value === "object") {
    return `{${Object.entries(value)
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
      .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`)
      .join(",")}}`;
  }
  const encoded = JSON.stringify(value);
  if (encoded === undefined) throw new Error("invalid acquisition payload");
  return encoded;
}

export async function acquisitionRequest(
  key: string,
  body: unknown,
): Promise<AcquisitionRequest> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(canonicalJson(body)),
  );
  return {
    key,
    hash: Array.from(new Uint8Array(digest), (byte) =>
      byte.toString(16).padStart(2, "0"),
    ).join(""),
  };
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function parseResult(value: string): AcquisitionResult {
  const result: unknown = JSON.parse(value);
  if (
    !result ||
    typeof result !== "object" ||
    !("ids" in result) ||
    !Array.isArray(result.ids) ||
    !result.ids.every(isPositiveInteger)
  ) {
    throw new Error("invalid stored acquisition result");
  }
  if (!("opening" in result)) return { ids: result.ids };
  const opening = result.opening;
  if (
    !opening ||
    typeof opening !== "object" ||
    !("id" in opening) ||
    !isPositiveInteger(opening.id) ||
    !("volume" in opening) ||
    !isPositiveInteger(opening.volume) ||
    !("packNumber" in opening) ||
    !isPositiveInteger(opening.packNumber)
  ) {
    throw new Error("invalid stored opening result");
  }
  return {
    ids: result.ids,
    opening: {
      id: opening.id,
      volume: opening.volume,
      packNumber: opening.packNumber,
    },
  };
}

export async function getAcquisitionResult(
  db: D1Database,
  request: AcquisitionRequest,
): Promise<AcquisitionResult | null> {
  const row = await db
    .prepare(
      `SELECT request_hash AS hash, request_result AS result
       FROM activity_events WHERE request_key = ?`,
    )
    .bind(request.key)
    .first<{ hash: string | null; result: string | null }>();
  if (!row) return null;
  if (row.hash !== request.hash) {
    throw new AcquisitionConflictError(
      "this operation was already submitted with different card details",
    );
  }
  if (row.result === null) throw new Error("acquisition result is missing");
  return parseResult(row.result);
}

export async function runAcquisitionBatch(
  db: D1Database,
  statements: D1PreparedStatement[],
  sourceKey: string,
  request?: AcquisitionRequest,
): Promise<{ results: D1Result<unknown>[] } | { replay: AcquisitionResult }> {
  if (!request) return { results: await db.batch(statements) };
  const replay = await getAcquisitionResult(db, request);
  if (replay) return { replay };

  try {
    const results = await db.batch([
      statements[0],
      db
        .prepare(
          `UPDATE activity_events SET request_key = ?, request_hash = ?
           WHERE source_key = ?`,
        )
        .bind(request.key, request.hash, sourceKey),
      ...statements.slice(1),
      db
        .prepare(
          `UPDATE activity_events AS e
           SET request_result = json_patch(
             json_object('ids', json((
               SELECT json_group_array(id) FROM (
                 SELECT id FROM cards
                 WHERE acquired_event_id = e.id ORDER BY id
               )
             ))),
             CASE WHEN e.source_type = 'opening' THEN (
               SELECT json_object('opening', json_object(
                 'id', id, 'volume', volume_number, 'packNumber', pack_number
               )) FROM openings WHERE id = e.source_id
             ) ELSE '{}' END
           )
           WHERE e.source_key = ?`,
        )
        .bind(sourceKey),
    ]);
    return { results: [results[0], ...results.slice(2, -1)] };
  } catch (error) {
    if (
      !(error instanceof Error) ||
      !error.message.includes(
        "UNIQUE constraint failed: activity_events.request_key",
      )
    ) {
      throw error;
    }
    const completed = await getAcquisitionResult(db, request);
    if (!completed) throw error;
    return { replay: completed };
  }
}
