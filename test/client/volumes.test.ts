import { describe, expect, it } from "vitest";
import { SERIES, VOLUMES } from "../../seed/catalog-def";
import { buildVolumeRows } from "../../src/client/collection";

describe("VOLUMES ↔ catalog consistency", () => {
  it("assigns every catalog series to exactly one volume", () => {
    const counts = new Map<string, number>();
    for (const vol of VOLUMES)
      for (const s of vol.series) counts.set(s, (counts.get(s) ?? 0) + 1);
    for (const s of SERIES) expect(counts.get(s)).toBe(1); // covered once
    for (const s of counts.keys()) expect(SERIES).toContain(s); // no stray names
  });
});

describe("buildVolumeRows", () => {
  it("groups catalog series into their volumes with no 其他 row", () => {
    expect(
      buildVolumeRows(["NEW YEAR", "BUNNY GIRL", "KILLER", "MP 4TH"]),
    ).toEqual([
      { label: "Vol.1", series: ["NEW YEAR", "BUNNY GIRL", "KILLER"] },
      { label: "Vol.2", series: ["MP 4TH"] },
    ]);
  });

  it("collects unassigned series into a trailing 其他 row", () => {
    expect(buildVolumeRows(["NEW YEAR", "FOO"])).toEqual([
      { label: "Vol.1", series: ["NEW YEAR"] },
      { label: "其他", series: ["FOO"] },
    ]);
  });

  it("drops a volume whose series are absent from the live data", () => {
    expect(buildVolumeRows(["NEW YEAR", "BUNNY GIRL", "KILLER"])).toEqual([
      { label: "Vol.1", series: ["NEW YEAR", "BUNNY GIRL", "KILLER"] },
    ]);
  });
});
