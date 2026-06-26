import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SERIES, buildCatalog, charactersFor } from "../../seed/catalog-def";
import { type Matrix, buildMatrix } from "../../src/client/collection";
import { Glance } from "../../src/client/views/Glance";
import { Grid } from "../../src/client/views/Grid";
import { Trade } from "../../src/client/views/Trade";
import { Wishlist } from "../../src/client/views/Wishlist";
import { ByCharacter, ByRarity, BySeries } from "../../src/client/views/tables";
import type { OverviewResponse } from "../../src/shared/types";

// Full 180-type universe with a mix of missing (0), single, and duplicate (>=2)
// counts so every view branch is exercised.
const full: OverviewResponse = {
  cells: buildCatalog().map((c, i) => ({
    catalogId: i + 1,
    series: c.series,
    character: c.character,
    rarity: c.rarity,
    owned: i % 4,
  })),
  progress: [],
};

const m: Matrix = buildMatrix(full);

describe("views render against full collection data", () => {
  it("renders all seven views without crashing", () => {
    for (const View of [
      ByCharacter,
      BySeries,
      ByRarity,
      Wishlist,
      Glance,
      Grid,
      Trade,
    ]) {
      const { container, unmount } = render(<View m={m} />);
      expect(container.querySelector("section.view")).toBeTruthy();
      unmount();
    }
  });

  it("derives series and characters from the catalog definition", () => {
    expect(m.series).toEqual(SERIES);
    expect(m.characters).toEqual([...new Set(SERIES.flatMap(charactersFor))]);
  });
});
