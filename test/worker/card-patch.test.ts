import { SELF, env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import type { UpdateCardInput } from "../../src/shared/types";
import {
  addCards,
  recordTransaction,
  setCardHeld,
  updateCard,
} from "../../src/worker/db/queries";

const addCard = async () =>
  (
    await addCards(env.DB, [
      { series: "KILLER", character: "Rei", rarity: "UR" },
    ])
  )[0];

const patch = (id: number | string, body: string) =>
  SELF.fetch(`https://example.com/api/admin/cards/${id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body,
  });

const state = (id: number) =>
  env.DB.prepare(
    `SELECT status, asking_price AS askingPrice, want_in_return AS wantInReturn,
            note, mutation_version AS version
     FROM cards WHERE id = ?`,
  )
    .bind(id)
    .first();

describe("card PATCH runtime validation", () => {
  it.each(["{", "null", "[]", "true", "7", '"owned"'])(
    "rejects a malformed or non-object body: %s",
    async (body) => {
      const id = await addCard();
      expect((await patch(id, body)).status).toBe(400);
      expect(await state(id)).toMatchObject({ status: "owned", version: 0 });
    },
  );

  it.each(["sold", "traded", "gifted", "unknown", null, 17])(
    "rejects an invalid listing status: %s",
    async (status) => {
      const id = await addCard();
      expect((await patch(id, JSON.stringify({ status }))).status).toBe(400);
      expect(await state(id)).toMatchObject({ status: "owned", version: 0 });
      expect(
        await env.DB.prepare(
          "SELECT id FROM activity_events WHERE source_type = 'card' AND source_id = ?",
        )
          .bind(id)
          .all(),
      ).toMatchObject({ results: [] });
    },
  );

  it.each(["-1", '"100"', "true", "{}", "[]", "1e400"])(
    "rejects a non-finite, negative, or non-number price: %s",
    async (price) => {
      const id = await addCard();
      expect((await patch(id, `{"askingPrice":${price}}`)).status).toBe(400);
      expect(await state(id)).toMatchObject({
        askingPrice: null,
        version: 0,
      });
    },
  );

  it.each([
    { note: false },
    { note: {} },
    { wantInReturn: 10 },
    { wantInReturn: [] },
  ])("rejects invalid text fields: %j", async (body) => {
    const id = await addCard();
    expect((await patch(id, JSON.stringify(body))).status).toBe(400);
    expect(await state(id)).toMatchObject({ version: 0 });
  });

  it.each([0, -1, "not-an-id", "1.5"])(
    "requires a positive integer card ID: %s",
    async (id) => {
      expect((await patch(id, "{}")).status).toBe(400);
    },
  );

  it("allows listing transitions and distinguishes omitted, zero, and null values", async () => {
    const id = await addCard();
    expect(
      (
        await patch(
          id,
          JSON.stringify({
            status: "for_sale",
            askingPrice: 25.5,
            wantInReturn: "SSR",
            note: "keep",
          }),
        )
      ).status,
    ).toBe(200);
    expect(
      (await patch(id, JSON.stringify({ status: "for_trade", askingPrice: 0 })))
        .status,
    ).toBe(200);
    expect(await state(id)).toMatchObject({
      status: "for_trade",
      askingPrice: 0,
      wantInReturn: "SSR",
      note: "keep",
    });
    expect((await patch(id, JSON.stringify({ note: "changed" }))).status).toBe(
      200,
    );
    expect(await state(id)).toMatchObject({
      askingPrice: 0,
      wantInReturn: "SSR",
      note: "changed",
    });
    expect(
      (
        await patch(
          id,
          JSON.stringify({
            status: "owned",
            askingPrice: null,
            wantInReturn: null,
            note: null,
          }),
        )
      ).status,
    ).toBe(200);
    expect(await state(id)).toMatchObject({
      status: "owned",
      askingPrice: null,
      wantInReturn: null,
      note: null,
    });
  });

  it.each(["sale", "trade", "gift"] as const)(
    "does not resurrect a card after a completed %s",
    async (type) => {
      const id = await addCard();
      await recordTransaction(env.DB, id, {
        type,
        happenedAt: "2026-09-05",
      });
      const before = await state(id);
      expect(
        (await patch(id, JSON.stringify({ status: "owned" }))).status,
      ).toBe(409);
      expect(await state(id)).toEqual(before);
    },
  );

  it("retains the held-card restriction for valid metadata updates", async () => {
    const id = await addCard();
    await setCardHeld(env.DB, id, true);
    const before = await state(id);
    expect((await patch(id, JSON.stringify({ note: "edit" }))).status).toBe(
      409,
    );
    expect(await state(id)).toEqual(before);
  });

  it("also rejects terminal transitions and invalid prices from query callers", async () => {
    const id = await addCard();
    for (const input of [
      { status: "sold" },
      { askingPrice: Number.NaN },
      { askingPrice: Number.POSITIVE_INFINITY },
      { askingPrice: -1 },
    ]) {
      await expect(
        updateCard(env.DB, id, input as UpdateCardInput),
      ).rejects.toThrow();
    }
    expect(await state(id)).toMatchObject({ status: "owned", version: 0 });
  });
});
