import { describe, expect, it } from "vitest";
import { buildVolumeRows } from "../../src/client/collection";

describe("buildVolumeRows", () => {
  it("groups live catalog series by their database volume metadata", () => {
    expect(
      buildVolumeRows(
        ["NEW YEAR", "BUNNY GIRL", "KILLER", "MP 4TH", "FUTURE"],
        [1, 1, 1, 2, 3],
      ),
    ).toEqual([
      { label: "Vol.1", series: ["NEW YEAR", "BUNNY GIRL", "KILLER"] },
      { label: "Vol.2", series: ["MP 4TH"] },
      { label: "Vol.3", series: ["FUTURE"] },
    ]);
  });

  it("collects invalid legacy volume metadata into a trailing 其他 row", () => {
    expect(buildVolumeRows(["NEW YEAR", "FOO"], [1, 0])).toEqual([
      { label: "Vol.1", series: ["NEW YEAR"] },
      { label: "其他", series: ["FOO"] },
    ]);
  });

  it("sorts volume groups numerically while retaining catalog series order", () => {
    expect(buildVolumeRows(["THIRD", "FIRST B", "FIRST A"], [3, 1, 1])).toEqual(
      [
        { label: "Vol.1", series: ["FIRST B", "FIRST A"] },
        { label: "Vol.3", series: ["THIRD"] },
      ],
    );
  });
});
