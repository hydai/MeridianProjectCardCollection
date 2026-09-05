import { SELF, env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import type { AcquisitionResult } from "../../src/worker/db/acquisition-requests";
import { undoActivity } from "../../src/worker/db/queries";

const card = {
  series: "KILLER",
  character: "Rei",
  rarity: "UR",
  source: "other",
};

function post(body: unknown, key?: string) {
  return SELF.fetch("https://example.com/api/admin/cards", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(key === undefined ? {} : { "idempotency-key": key }),
    },
    body: JSON.stringify(body),
  });
}

async function countCards() {
  const row = await env.DB.prepare(
    "SELECT COUNT(*) AS count FROM cards",
  ).first<{
    count: number;
  }>();
  if (!row) throw new Error("card count is unavailable");
  return row.count;
}

describe("retryable acquisitions", () => {
  it("replays the original result without adding another card or event", async () => {
    const before = await countCards();
    const key = crypto.randomUUID();
    const first = await post({ cards: [card] }, key);
    expect(first.status).toBe(200);
    const result = await first.json<AcquisitionResult>();
    const retry = await post({ cards: [card] }, key);
    expect(retry.status).toBe(200);
    expect(await retry.json()).toEqual(result);
    expect(await countCards()).toBe(before + 1);
    const events = await env.DB.prepare(
      "SELECT COUNT(*) AS count FROM activity_events WHERE request_key = ?",
    )
      .bind(key)
      .first<{ count: number }>();
    expect(events?.count).toBe(1);
  });

  it("replays a pack with the same physical IDs and pack number", async () => {
    const key = crypto.randomUUID();
    const body = {
      cards: [{ ...card, source: "pull" }],
      opening: { volume: 1, openedAt: "2026-09-05", cost: 100 },
    };
    const first = await post(body, key);
    expect(first.status).toBe(200);
    const original = await first.json<AcquisitionResult>();
    const retry = await post(body, key);
    expect(retry.status).toBe(200);
    expect(await retry.json()).toEqual(original);
    expect(original.opening).toMatchObject({ volume: 1, packNumber: 1 });
    expect(
      await env.DB.prepare("SELECT COUNT(*) AS count FROM openings").first(),
    ).toEqual({ count: 1 });
  });

  it("accepts only one acquisition when the same request overlaps", async () => {
    const before = await countCards();
    const key = crypto.randomUUID();
    const responses = await Promise.all([
      post({ cards: [card] }, key),
      post({ cards: [card] }, key),
    ]);
    expect(responses.map((response) => response.status)).toEqual([200, 200]);
    const results = await Promise.all(
      responses.map((response) => response.json<AcquisitionResult>()),
    );
    expect(results[0]).toEqual(results[1]);
    expect(await countCards()).toBe(before + 1);
  });

  it("rejects reuse of an operation key with different card details", async () => {
    const before = await countCards();
    const key = crypto.randomUUID();
    expect((await post({ cards: [card] }, key)).status).toBe(200);
    const changed = await post({ cards: [{ ...card, rarity: "SSR" }] }, key);
    expect(changed.status).toBe(409);
    expect(await changed.json()).toMatchObject({
      error: expect.stringContaining("different card details"),
    });
    expect(await countCards()).toBe(before + 1);
  });

  it("ignores JSON object property order when comparing a retry", async () => {
    const key = crypto.randomUUID();
    const first = await post({ cards: [card] }, key);
    const retry = await post(
      {
        cards: [
          {
            source: card.source,
            rarity: card.rarity,
            character: card.character,
            series: card.series,
          },
        ],
      },
      key,
    );
    expect(retry.status).toBe(200);
    expect(await retry.json()).toEqual(await first.json());
  });

  it("rolls back the operation key with a failed acquisition", async () => {
    const before = await countCards();
    const key = crypto.randomUUID();
    await env.DB.prepare(
      `CREATE TRIGGER reject_acquisition BEFORE INSERT ON cards
       BEGIN SELECT RAISE(ABORT, 'temporary write failure'); END`,
    ).run();
    const failed = await post({ cards: [card] }, key);
    expect(failed.status).toBe(500);
    expect(failed.headers.get("x-acquisition-outcome")).toBeNull();
    expect(
      await env.DB.prepare(
        "SELECT id FROM activity_events WHERE request_key = ?",
      )
        .bind(key)
        .first(),
    ).toBeNull();
    expect(await countCards()).toBe(before);
    await env.DB.exec("DROP TRIGGER reject_acquisition");
    expect((await post({ cards: [card] }, key)).status).toBe(200);
    expect(await countCards()).toBe(before + 1);
  });

  it("does not resurrect an undone acquisition on a delayed retry", async () => {
    const key = crypto.randomUUID();
    const before = await countCards();
    const first = await post({ cards: [card] }, key);
    const original = await first.json<AcquisitionResult>();
    const event = await env.DB.prepare(
      "SELECT id FROM activity_events WHERE request_key = ?",
    )
      .bind(key)
      .first<{ id: number }>();
    if (!event) throw new Error("acquisition event is missing");
    await undoActivity(env.DB, event.id);
    const retry = await post({ cards: [card] }, key);
    expect(retry.status).toBe(200);
    expect(await retry.json()).toEqual(original);
    expect(await countCards()).toBe(before);
  });

  it("allows identical acquisitions with different keys and legacy requests", async () => {
    const before = await countCards();
    for (const key of [crypto.randomUUID(), crypto.randomUUID(), undefined]) {
      expect((await post({ cards: [card] }, key)).status).toBe(200);
    }
    expect(await countCards()).toBe(before + 3);
  });

  it.each([
    { cards: [] },
    { cards: [{ ...card, rarity: "invalid" }] },
    { cards: [{ ...card, character: "unknown" }] },
    { cards: [{ ...card, note: { unexpected: true } }] },
  ])("identifies a rejected acquisition before any writes", async (body) => {
    const before = await countCards();
    const key = crypto.randomUUID();
    const response = await post(body, key);
    expect(response.status).toBe(400);
    expect(response.headers.get("x-acquisition-outcome")).toBe("rejected");
    expect(await countCards()).toBe(before);
    expect(
      await env.DB.prepare(
        "SELECT id FROM activity_events WHERE request_key = ?",
      )
        .bind(key)
        .first(),
    ).toBeNull();
  });

  it.each(["bad key", "x".repeat(129)])(
    "rejects invalid operation key %s",
    async (key) => {
      expect((await post({ cards: [card] }, key)).status).toBe(400);
    },
  );
});
