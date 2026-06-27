import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import type { OverviewCell } from "../../src/shared/types";
import {
  addCards,
  createReservation,
  getOverview,
} from "../../src/worker/db/queries";

const ownedOf = (cells: OverviewCell[], s: string, ch: string, r: string) =>
  cells.find((c) => c.series === s && c.character === ch && c.rarity === r)
    ?.owned ?? 0;

describe("getOverview give-side pre-deduction", () => {
  it("subtracts a pending give from the displayed owned count", async () => {
    await addCards(env.DB, [
      { series: "KILLER", character: "Yuzumi", rarity: "R" },
      { series: "KILLER", character: "Yuzumi", rarity: "R" },
    ]);
    const before = ownedOf(
      (await getOverview(env.DB)).cells,
      "KILLER",
      "Yuzumi",
      "R",
    );
    await createReservation(env.DB, {
      reservedAt: "2026-06-27",
      give: [{ series: "KILLER", character: "Yuzumi", rarity: "R", qty: 1 }],
      receive: [],
    });
    const after = ownedOf(
      (await getOverview(env.DB)).cells,
      "KILLER",
      "Yuzumi",
      "R",
    );
    expect(after).toBe(before - 1);
  });

  it("keeps owned >= 1 and leaves collection progress unchanged (give comes from a duplicate)", async () => {
    await addCards(env.DB, [
      { series: "BUNNY GIRL", character: "Yuzumi", rarity: "SSR" },
      { series: "BUNNY GIRL", character: "Yuzumi", rarity: "SSR" },
    ]);
    const ov1 = await getOverview(env.DB);
    const prog1 = ov1.progress.find(
      (p) => p.series === "BUNNY GIRL",
    )?.collectedTypes;
    const owned1 = ownedOf(ov1.cells, "BUNNY GIRL", "Yuzumi", "SSR");

    await createReservation(env.DB, {
      reservedAt: "2026-06-27",
      give: [
        { series: "BUNNY GIRL", character: "Yuzumi", rarity: "SSR", qty: 1 },
      ],
      receive: [],
    });

    const ov2 = await getOverview(env.DB);
    expect(ownedOf(ov2.cells, "BUNNY GIRL", "Yuzumi", "SSR")).toBe(owned1 - 1);
    expect(
      ownedOf(ov2.cells, "BUNNY GIRL", "Yuzumi", "SSR"),
    ).toBeGreaterThanOrEqual(1);
    expect(
      ov2.progress.find((p) => p.series === "BUNNY GIRL")?.collectedTypes,
    ).toBe(prog1);
  });
});
