import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SERIES, buildCatalog, charactersFor } from "../../seed/catalog-def";
import { type Matrix, buildMatrix } from "../../src/client/collection";
import { Glance } from "../../src/client/views/Glance";
import { Grid } from "../../src/client/views/Grid";
import { MarketBoard } from "../../src/client/views/Market";
import { Trade } from "../../src/client/views/Trade";
import { Wishlist } from "../../src/client/views/Wishlist";
import { ByCharacter, ByRarity, BySeries } from "../../src/client/views/tables";
import type { MarketListing } from "../../src/shared/types";
import type { OverviewResponse } from "../../src/shared/types";
import type { PublicPendingTrade } from "../../src/shared/types";

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

const sampleListings: MarketListing[] = [
  {
    cardId: 1,
    series: "MP 4TH",
    character: "Kirari",
    rarity: "UR",
    status: "for_sale",
    askingPrice: 1200,
    wantInReturn: null,
    note: null,
  },
  {
    cardId: 2,
    series: "MP 4TH",
    character: "Aria",
    rarity: "SSR",
    status: "for_sale",
    askingPrice: null,
    wantInReturn: null,
    note: "輕微邊緣磨損",
  },
  {
    cardId: 3,
    series: "KSP",
    character: "Mira",
    rarity: "SSR",
    status: "for_trade",
    askingPrice: null,
    wantInReturn: "KSP Kirari UR",
    note: null,
  },
  {
    cardId: 4,
    series: "KSP",
    character: "Kirari",
    rarity: "R",
    status: "for_trade",
    askingPrice: null,
    wantInReturn: null,
    note: null,
  },
];

describe("MarketBoard", () => {
  it("shows a loading state when listings is null", () => {
    render(<MarketBoard listings={null} />);
    expect(screen.getByText("載入中…")).toBeInTheDocument();
  });

  it("shows an empty state when there are no listings", () => {
    render(<MarketBoard listings={[]} />);
    expect(screen.getByText("目前沒有上架中的卡片。")).toBeInTheDocument();
  });

  it("renders for_sale and for_trade listings with details", () => {
    render(<MarketBoard listings={sampleListings} />);
    expect(screen.getByText("待售")).toBeInTheDocument();
    expect(screen.getByText("待換")).toBeInTheDocument();
    expect(screen.getByText("1200 元")).toBeInTheDocument();
    expect(screen.getByText("價格面議")).toBeInTheDocument();
    expect(screen.getByText("想換：KSP Kirari UR")).toBeInTheDocument();
    expect(screen.getByText("開放出價")).toBeInTheDocument();
    expect(screen.getByText("輕微邊緣磨損")).toBeInTheDocument();
  });

  it("shows an error message scoped to this view", () => {
    render(<MarketBoard listings={null} error="Error: /api/market → 500" />);
    expect(screen.getByText(/無法載入交易資料/)).toBeInTheDocument();
  });
});

describe("Trade pending overlay", () => {
  it("renders the 暫定交換列表 with card names but never the counterparty", () => {
    const pending: PublicPendingTrade[] = [
      {
        id: 1,
        reservedAt: "2026-06-27",
        give: [
          {
            direction: "give",
            catalogId: 1,
            series: "MP 4TH",
            character: "Mizuki",
            rarity: "R",
            qty: 1,
          },
        ],
        receive: [
          {
            direction: "receive",
            catalogId: 2,
            series: "KILLER",
            character: "Rei",
            rarity: "SR",
            qty: 1,
          },
        ],
      },
    ];
    render(<Trade m={m} pending={pending} />);
    expect(screen.getByText("暫定交換列表")).toBeInTheDocument();
    expect(screen.getByText("2026-06-27")).toBeInTheDocument();
    expect(screen.getByText(/MP 4TH Mizuki/)).toBeInTheDocument();
    expect(screen.getByText(/KILLER Rei/)).toBeInTheDocument();
  });

  it("omits the 暫定交換列表 when there are no pending trades", () => {
    render(<Trade m={m} pending={[]} />);
    expect(screen.queryByText("暫定交換列表")).toBeNull();
  });
});

describe("Grid volume filter", () => {
  beforeEach(() => localStorage.clear());

  it("renders a filter row per volume with a button per series", () => {
    const { container } = render(<Grid m={m} />);
    const filter = container.querySelector(".grid-filter") as HTMLElement;
    expect(filter).toBeTruthy();
    expect(within(filter).getByText("Vol.1")).toBeInTheDocument();
    expect(within(filter).getByText("Vol.2")).toBeInTheDocument();
    expect(
      within(filter).getByRole("button", { name: "NEW YEAR" }),
    ).toBeInTheDocument();
    expect(
      within(filter).getByRole("button", { name: "MP 4TH" }),
    ).toBeInTheDocument();
    expect(container.querySelectorAll(".grid-series-head")).toHaveLength(
      SERIES.length,
    );
  });

  it("hides a series' columns when its button is toggled off", () => {
    const { container } = render(<Grid m={m} />);
    const filter = container.querySelector(".grid-filter") as HTMLElement;
    fireEvent.click(within(filter).getByRole("button", { name: "NEW YEAR" }));
    expect(container.querySelectorAll(".grid-series-head")).toHaveLength(
      SERIES.length - 1,
    );
  });

  it("remembers hidden series across remounts via localStorage", () => {
    const first = render(<Grid m={m} />);
    const filter = first.container.querySelector(".grid-filter") as HTMLElement;
    fireEvent.click(within(filter).getByRole("button", { name: "NEW YEAR" }));
    first.unmount();
    const second = render(<Grid m={m} />);
    expect(second.container.querySelectorAll(".grid-series-head")).toHaveLength(
      SERIES.length - 1,
    );
  });

  it("shows an empty hint when all series are hidden", () => {
    const { container } = render(<Grid m={m} />);
    const filter = container.querySelector(".grid-filter") as HTMLElement;
    for (const name of SERIES)
      fireEvent.click(within(filter).getByRole("button", { name }));
    expect(screen.getByText("（未選擇任何系列）")).toBeInTheDocument();
    expect(container.querySelector(".grid-table")).toBeNull();
  });

  it("exposes aria-pressed on each series button reflecting its shown state", () => {
    const { container } = render(<Grid m={m} />);
    const filter = container.querySelector(".grid-filter") as HTMLElement;
    const btn = within(filter).getByRole("button", { name: "NEW YEAR" });
    expect(btn).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(btn);
    expect(btn).toHaveAttribute("aria-pressed", "false");
    expect(container.querySelectorAll(".grid-series-head")).toHaveLength(
      SERIES.length - 1,
    );
  });

  it("ignores stale localStorage series names and self-heals the stored set", () => {
    localStorage.setItem(
      "mpc:grid:hiddenSeries",
      JSON.stringify(["NEW YEAR", "OLD SERIES"]),
    );
    const { container } = render(<Grid m={m} />);
    expect(container.querySelectorAll(".grid-series-head")).toHaveLength(
      SERIES.length - 1,
    );
    const persisted = JSON.parse(
      localStorage.getItem("mpc:grid:hiddenSeries") as string,
    ) as string[];
    expect(persisted).not.toContain("OLD SERIES");
    for (const s of persisted) expect(SERIES).toContain(s);
  });
});

describe("Grid rarity filter", () => {
  beforeEach(() => localStorage.clear());

  const RARITY_NAMES = ["R", "SR", "SSR", "UR"];

  it("renders a 稀有度 row with a button per rarity, all pressed by default", () => {
    const { container } = render(<Grid m={m} />);
    const filter = container.querySelector(".grid-filter") as HTMLElement;
    expect(within(filter).getByText("稀有度")).toBeInTheDocument();
    for (const name of RARITY_NAMES) {
      expect(within(filter).getByRole("button", { name })).toHaveAttribute(
        "aria-pressed",
        "true",
      );
    }
  });

  it("toggles a rarity button's aria-pressed on click", () => {
    const { container } = render(<Grid m={m} />);
    const filter = container.querySelector(".grid-filter") as HTMLElement;
    const ur = within(filter).getByRole("button", { name: "UR" });
    expect(ur).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(ur);
    expect(ur).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(ur);
    expect(ur).toHaveAttribute("aria-pressed", "true");
  });

  it("remembers hidden rarities across remounts via localStorage", () => {
    const first = render(<Grid m={m} />);
    const f1 = first.container.querySelector(".grid-filter") as HTMLElement;
    fireEvent.click(within(f1).getByRole("button", { name: "UR" }));
    first.unmount();
    const second = render(<Grid m={m} />);
    const f2 = second.container.querySelector(".grid-filter") as HTMLElement;
    expect(within(f2).getByRole("button", { name: "UR" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("ignores unknown stored rarity values and self-heals the stored set", () => {
    localStorage.setItem(
      "mpc:grid:hiddenRarities",
      JSON.stringify(["UR", "BOGUS"]),
    );
    const { container } = render(<Grid m={m} />);
    const filter = container.querySelector(".grid-filter") as HTMLElement;
    expect(within(filter).getByRole("button", { name: "UR" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    const persisted = JSON.parse(
      localStorage.getItem("mpc:grid:hiddenRarities") as string,
    ) as string[];
    expect(persisted).toEqual(["UR"]);
  });

  it("hides a rarity's column in every series when toggled off", () => {
    const { container } = render(<Grid m={m} />);
    const filter = container.querySelector(".grid-filter") as HTMLElement;
    expect(container.querySelectorAll(".grid-rarity-head")).toHaveLength(
      SERIES.length * 4,
    );
    expect(container.querySelectorAll(".grid-rarity-head.gr-ur")).toHaveLength(
      SERIES.length,
    );
    fireEvent.click(within(filter).getByRole("button", { name: "UR" }));
    expect(container.querySelectorAll(".grid-rarity-head")).toHaveLength(
      SERIES.length * 3,
    );
    expect(container.querySelectorAll(".grid-rarity-head.gr-ur")).toHaveLength(
      0,
    );
  });

  it("shrinks each series header's colSpan to the visible rarity count", () => {
    const { container } = render(<Grid m={m} />);
    const filter = container.querySelector(".grid-filter") as HTMLElement;
    const firstHead = () =>
      container.querySelector(".grid-series-head") as HTMLTableCellElement;
    expect(firstHead().colSpan).toBe(4);
    fireEvent.click(within(filter).getByRole("button", { name: "UR" }));
    expect(firstHead().colSpan).toBe(3);
  });

  it("moves the group left border to the first visible rarity when R is hidden", () => {
    const { container } = render(<Grid m={m} />);
    const filter = container.querySelector(".grid-filter") as HTMLElement;
    fireEvent.click(within(filter).getByRole("button", { name: "R" }));
    const starts = container.querySelectorAll(
      ".grid-rarity-head.grid-series-start",
    );
    expect(starts).toHaveLength(SERIES.length);
    for (const th of starts) expect(th.classList.contains("gr-sr")).toBe(true);
  });

  it("shrinks the progress denominator when a rarity is hidden", () => {
    const { container } = render(<Grid m={m} />);
    const filter = container.querySelector(".grid-filter") as HTMLElement;
    const denom = () => {
      const txt =
        (container.querySelector(".grid-progress") as HTMLElement)
          .textContent ?? "";
      const match = txt.match(/\/\s*(\d+)/);
      return match ? Number(match[1]) : Number.NaN;
    };
    const before = denom();
    fireEvent.click(within(filter).getByRole("button", { name: "UR" }));
    expect(denom()).toBeLessThan(before);
  });

  it("shows a rarity-specific empty hint when all rarities are hidden", () => {
    const { container } = render(<Grid m={m} />);
    const filter = container.querySelector(".grid-filter") as HTMLElement;
    for (const name of ["R", "SR", "SSR", "UR"])
      fireEvent.click(within(filter).getByRole("button", { name }));
    expect(screen.getByText("（未選擇任何稀有度）")).toBeInTheDocument();
    expect(container.querySelector(".grid-table")).toBeNull();
  });

  it("applies series and rarity filters independently", () => {
    const { container } = render(<Grid m={m} />);
    const filter = container.querySelector(".grid-filter") as HTMLElement;
    fireEvent.click(within(filter).getByRole("button", { name: "NEW YEAR" }));
    fireEvent.click(within(filter).getByRole("button", { name: "UR" }));
    expect(container.querySelectorAll(".grid-series-head")).toHaveLength(
      SERIES.length - 1,
    );
    expect(container.querySelectorAll(".grid-rarity-head")).toHaveLength(
      (SERIES.length - 1) * 3,
    );
  });
});

describe("Trade copy buttons", () => {
  const card = (
    character: string,
    rarity: "R" | "SR" | "SSR" | "UR",
    owned: number,
    id: number,
  ) => ({ catalogId: id, series: "MP 4TH", character, rarity, owned });

  // all owned = 1 → no duplicates, nothing missing → both panels empty
  const singles: OverviewResponse = {
    cells: [
      card("Kirari", "R", 1, 1),
      card("Kirari", "SR", 1, 2),
      card("Kirari", "SSR", 1, 3),
      card("Kirari", "UR", 1, 4),
    ],
    progress: [],
  };
  // Kirari UR owned 2 → exactly one surplus line; nothing missing
  const oneSurplus: OverviewResponse = {
    cells: [
      card("Kirari", "R", 1, 1),
      card("Kirari", "SR", 1, 2),
      card("Kirari", "SSR", 1, 3),
      card("Kirari", "UR", 2, 4),
    ],
    progress: [],
  };

  it("renders a copy button on each panel", () => {
    render(<Trade m={buildMatrix(oneSurplus)} />);
    expect(
      screen.getByRole("button", { name: "複製可換出清單" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "複製想換入清單" }),
    ).toBeInTheDocument();
  });

  it("disables a panel's copy button when it has nothing to copy", () => {
    render(<Trade m={buildMatrix(singles)} />);
    expect(
      screen.getByRole("button", { name: "複製可換出清單" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "複製想換入清單" }),
    ).toBeDisabled();
  });

  it("copies the visible surplus list in `角色, 系列, 數量` format", () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });
    render(<Trade m={buildMatrix(oneSurplus)} />);
    fireEvent.click(screen.getByRole("button", { name: "複製可換出清單" }));
    expect(writeText).toHaveBeenCalledWith("UR\nKirari, MP 4TH, 1");
  });
});

describe("Trade rarity filter", () => {
  const card = (
    character: string,
    rarity: "R" | "SR" | "SSR" | "UR",
    owned: number,
    id: number,
  ) => ({ catalogId: id, series: "MP 4TH", character, rarity, owned });

  // Kirari SR owned 2 AND Kirari UR owned 2 → surplus in two rarities.
  const twoSurplus: OverviewResponse = {
    cells: [
      card("Kirari", "R", 1, 1),
      card("Kirari", "SR", 2, 2),
      card("Kirari", "SSR", 1, 3),
      card("Kirari", "UR", 2, 4),
    ],
    progress: [],
  };

  it("scopes the 可換出 copy list to the selected rarity", () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });
    render(<Trade m={buildMatrix(twoSurplus)} />);
    // Radix single-select ToggleGroup items render as role="radio".
    fireEvent.click(screen.getByRole("radio", { name: "SR" }));
    fireEvent.click(screen.getByRole("button", { name: "複製可換出清單" }));
    expect(writeText).toHaveBeenCalledWith("SR\nKirari, MP 4TH, 1");
  });
});
