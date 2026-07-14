import { SELF, env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import type { OverviewCell } from "../../src/shared/types";
import {
  addCards,
  createReservation,
  getOverview,
  listCards,
  recordTransaction,
  setCardHeld,
  updateCard,
} from "../../src/worker/db/queries";

// Tests in a file share one database (storage isolates per file, not per test),
// so assertions are written as deltas / invariants rather than absolute counts.
const KOYUKI = {
  series: "BUNNY GIRL",
  character: "Koyuki",
  rarity: "UR" as const,
};
const addKoyuki = async () => (await addCards(env.DB, [KOYUKI]))[0];

const cellOf = (cells: OverviewCell[], s: string, ch: string, r: string) =>
  cells.find((c) => c.series === s && c.character === ch && c.rarity === r);
const koyukiCell = async () =>
  cellOf(
    (await getOverview(env.DB)).cells,
    KOYUKI.series,
    KOYUKI.character,
    KOYUKI.rarity,
  );
const koyukiRow = async (id: number) =>
  (await listCards(env.DB, { series: KOYUKI.series })).find((r) => r.id === id);

const hold = (id: number) =>
  SELF.fetch(`https://example.com/api/admin/cards/${id}/hold`, {
    method: "POST",
  });
const unhold = (id: number) =>
  SELF.fetch(`https://example.com/api/admin/cards/${id}/hold`, {
    method: "DELETE",
  });

describe("held cards (保留) — availability", () => {
  it("adds to owned but not to the tradeable pool", async () => {
    const before = await koyukiCell();
    const id = await addKoyuki();
    await setCardHeld(env.DB, id, true);
    const after = await koyukiCell();
    expect(after?.owned).toBe((before?.owned ?? 0) + 1); // still physically owned
    expect(after?.held).toBe((before?.held ?? 0) + 1);
    expect(after?.available).toBe(before?.available ?? 0); // but not tradeable
  });

  it("frees the card back into the pool when unheld", async () => {
    const id = await addKoyuki();
    await setCardHeld(env.DB, id, true);
    const held = await koyukiCell();
    await setCardHeld(env.DB, id, false);
    const freed = await koyukiCell();
    expect(freed?.held).toBe((held?.held ?? 0) - 1);
    expect(freed?.available).toBe((held?.available ?? 0) + 1);
    expect(freed?.owned).toBe(held?.owned); // owned never moved
  });

  it("holding is idempotent", async () => {
    const id = await addKoyuki();
    await setCardHeld(env.DB, id, true);
    const once = await koyukiCell();
    await setCardHeld(env.DB, id, true);
    const twice = await koyukiCell();
    expect(twice?.held).toBe(once?.held);
    expect(twice?.available).toBe(once?.available);
  });

  it("leaves collection progress unchanged (a held duplicate is still collected)", async () => {
    await addKoyuki();
    await addKoyuki();
    const before = (await getOverview(env.DB)).progress.find(
      (p) => p.series === KOYUKI.series,
    );
    const id = await addKoyuki();
    await setCardHeld(env.DB, id, true);
    const after = (await getOverview(env.DB)).progress.find(
      (p) => p.series === KOYUKI.series,
    );
    expect(after).toEqual(before);
  });
});

describe("held cards (保留) — validation and locking", () => {
  it("refuses to hold a card that is not owned", async () => {
    const [id] = await addCards(env.DB, [
      { series: "KILLER", character: "Rei", rarity: "UR" },
    ]);
    await updateCard(env.DB, id, { status: "for_sale", askingPrice: 100 });
    await expect(setCardHeld(env.DB, id, true)).rejects.toThrow(/owned/);
  });

  it("refuses to hold a card reserved for a pending trade", async () => {
    const a = await addKoyuki();
    await addKoyuki();
    await createReservation(env.DB, {
      reservedAt: "2026-07-14",
      give: [{ ...KOYUKI, qty: 1 }],
      receive: [],
    });
    const reserved = (await listCards(env.DB, { series: KOYUKI.series })).find(
      (r) => r.character === "Koyuki" && r.rarity === "UR" && r.reserved,
    );
    expect(reserved).toBeDefined();
    await expect(setCardHeld(env.DB, reserved?.id ?? 0, true)).rejects.toThrow(
      /reserved/,
    );
    // the specific card we added is untouched and can still be held
    expect((await koyukiRow(a))?.reserved).toBe(false);
  });

  it("blocks listing, selling, and trading a held card until it is unheld", async () => {
    const [id] = await addCards(env.DB, [
      { series: "KILLER", character: "Rei", rarity: "UR" },
    ]);
    await setCardHeld(env.DB, id, true);
    await expect(
      updateCard(env.DB, id, { status: "for_sale", askingPrice: 100 }),
    ).rejects.toThrow(/held/);
    await expect(
      recordTransaction(env.DB, id, { type: "sale", happenedAt: "2026-07-14" }),
    ).rejects.toThrow(/held/);

    await setCardHeld(env.DB, id, false);
    await updateCard(env.DB, id, { status: "for_sale", askingPrice: 100 });
    const row = (await listCards(env.DB, { series: "KILLER" })).find(
      (r) => r.id === id,
    );
    expect(row?.status).toBe("for_sale");
  });
});

describe("held cards (保留) — reservation allocation", () => {
  it("never gives away a held card", async () => {
    const a = await addKoyuki();
    await addKoyuki(); // an unheld copy the reservation can consume instead
    await setCardHeld(env.DB, a, true);
    await createReservation(env.DB, {
      reservedAt: "2026-07-14",
      give: [{ ...KOYUKI, qty: 1 }],
      receive: [],
    });
    const rows = await listCards(env.DB, { series: KOYUKI.series });
    expect(rows.find((r) => r.id === a)?.held).toBe(true);
    expect(rows.find((r) => r.id === a)?.reserved).toBe(false); // held card spared
    expect(
      rows.some(
        (r) =>
          r.character === "Koyuki" &&
          r.rarity === "UR" &&
          r.reserved &&
          !r.held,
      ),
    ).toBe(true); // an unheld copy was chosen instead
  });

  it("excludes held cards from availability, so they cannot be reserved", async () => {
    const before = await koyukiCell();
    const id = await addKoyuki();
    await setCardHeld(env.DB, id, true);
    const after = await koyukiCell();
    expect(after?.available).toBe(before?.available ?? 0); // held adds no availability
    await expect(
      createReservation(env.DB, {
        reservedAt: "2026-07-14",
        give: [{ ...KOYUKI, qty: (after?.available ?? 0) + 1 }],
        receive: [],
      }),
    ).rejects.toThrow();
  });
});

describe("held cards (保留) — admin API", () => {
  it("POST holds a card and DELETE releases it", async () => {
    const [id] = await addCards(env.DB, [
      { series: "KILLER", character: "Rei", rarity: "UR" },
    ]);
    expect((await hold(id)).status).toBe(200);
    expect(
      (await listCards(env.DB, { series: "KILLER" })).find((r) => r.id === id)
        ?.held,
    ).toBe(true);

    expect((await unhold(id)).status).toBe(200);
    expect(
      (await listCards(env.DB, { series: "KILLER" })).find((r) => r.id === id)
        ?.held,
    ).toBe(false);
  });

  it("POST hold on a listed card returns 409", async () => {
    const [id] = await addCards(env.DB, [
      { series: "KILLER", character: "Rei", rarity: "UR" },
    ]);
    await updateCard(env.DB, id, { status: "for_trade" });
    expect((await hold(id)).status).toBe(409);
  });
});
