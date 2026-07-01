import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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

// Snapshot navigator.clipboard's original property descriptor and restore it
// after each test in the calling describe. Tests stub `navigator.clipboard`;
// restoring the original (rather than unconditionally deleting) returns it to
// its true prior state so a stub never leaks into later tests — and stays
// correct even if the test env ever ships a real clipboard by default.
function restoreClipboardAfterEach() {
  const original = Object.getOwnPropertyDescriptor(navigator, "clipboard");
  afterEach(() => {
    if (original) {
      Object.defineProperty(navigator, "clipboard", original);
    } else {
      Reflect.deleteProperty(navigator, "clipboard");
    }
  });
}

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

describe("Glance mode toggle", () => {
  it("switches wishlist↔collection via the radio toggle", () => {
    render(<Glance m={m} />);
    // the single-select mode switch is a radiogroup with an accessible name
    expect(
      screen.getByRole("radiogroup", { name: "顯示模式" }),
    ).toBeInTheDocument();
    const wish = screen.getByRole("radio", { name: "願望清單" });
    const coll = screen.getByRole("radio", { name: "收集清單" });
    expect(wish).toHaveAttribute("aria-checked", "true");
    // collection mode shows the "已收集 … 種 · 共 … 張" progress line
    expect(screen.queryByText(/已收集/)).toBeNull();
    fireEvent.click(coll);
    expect(coll).toHaveAttribute("aria-checked", "true");
    expect(screen.getByText(/已收集/)).toBeInTheDocument();
  });
});

describe("Grid mode toggle", () => {
  beforeEach(() => localStorage.clear());
  it("switches check↔count via the radio toggle", () => {
    render(<Grid m={m} />);
    // the single-select mode switch is a radiogroup with an accessible name
    expect(
      screen.getByRole("radiogroup", { name: "顯示模式" }),
    ).toBeInTheDocument();
    const check = screen.getByRole("radio", { name: "打勾" });
    const count = screen.getByRole("radio", { name: "數量" });
    expect(check).toHaveAttribute("aria-checked", "true");
    fireEvent.click(count);
    expect(count).toHaveAttribute("aria-checked", "true");
    // count mode swaps the legend copy to the "持有張數" wording
    expect(screen.getByText(/持有張數/)).toBeInTheDocument();
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

  // Tests below stub `navigator.clipboard`; restore the original after each so
  // the stub never leaks into later tests (which would mask a real
  // missing-clipboard bug).
  restoreClipboardAfterEach();

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

  it("does not throw when the Clipboard API is unavailable", () => {
    // Insecure context (e.g. http:// on a LAN IP): navigator.clipboard is absent.
    Object.defineProperty(navigator, "clipboard", {
      value: undefined,
      configurable: true,
    });
    render(<Trade m={buildMatrix(oneSurplus)} />);
    expect(() =>
      fireEvent.click(screen.getByRole("button", { name: "複製可換出清單" })),
    ).not.toThrow();
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

  restoreClipboardAfterEach();

  it("scopes the 可換出 copy list to the selected rarity", () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });
    render(<Trade m={buildMatrix(twoSurplus)} />);
    // Radix single-select ToggleGroup items render as role="radio"; the
    // accessible name includes the 缺/餘 counts, so match the rarity prefix.
    fireEvent.click(screen.getByRole("radio", { name: /^SR / }));
    fireEvent.click(screen.getByRole("button", { name: "複製可換出清單" }));
    expect(writeText).toHaveBeenCalledWith("SR\nKirari, MP 4TH, 1");
  });
});

describe("Trade view mode toggle", () => {
  const card = (
    character: string,
    rarity: "R" | "SR" | "SSR" | "UR",
    owned: number,
    id: number,
  ) => ({ catalogId: id, series: "MP 4TH", character, rarity, owned });

  // Kirari: SR owned 3 (spare 2) + UR owned 2 (spare 1) → 可換出;
  // SSR owned 0 → 想換入; R owned 1 → 兩者皆非。
  const mixed: OverviewResponse = {
    cells: [
      card("Kirari", "R", 1, 1),
      card("Kirari", "SR", 3, 2),
      card("Kirari", "SSR", 0, 3),
      card("Kirari", "UR", 2, 4),
    ],
    progress: [],
  };

  const toGrid = () =>
    fireEvent.click(
      within(
        screen.getByRole("radiogroup", { name: "交換檢視模式" }),
      ).getByRole("radio", { name: "格表" }),
    );

  it("defaults to list mode with the mode switch present", () => {
    const { container } = render(<Trade m={buildMatrix(mixed)} />);
    const group = screen.getByRole("radiogroup", { name: "交換檢視模式" });
    expect(within(group).getByRole("radio", { name: "清單" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(container.querySelectorAll(".trade-grid-table")).toHaveLength(0);
  });

  it("switches to grid mode showing a surplus and a needs table", () => {
    const { container } = render(<Trade m={buildMatrix(mixed)} />);
    toGrid();
    expect(container.querySelectorAll(".trade-grid-table")).toHaveLength(2);
    const surplus = container.querySelector(
      '[data-kind="surplus"]',
    ) as HTMLElement;
    const needs = container.querySelector('[data-kind="needs"]') as HTMLElement;
    expect(within(surplus).getByText("2")).toBeInTheDocument(); // SR spare 2
    expect(within(needs).getByText("1")).toBeInTheDocument(); // SSR 缺 → 1
  });

  it("switches back to list mode, removing the grid tables", () => {
    const { container } = render(<Trade m={buildMatrix(mixed)} />);
    toGrid();
    expect(container.querySelectorAll(".trade-grid-table")).toHaveLength(2);
    fireEvent.click(
      within(
        screen.getByRole("radiogroup", { name: "交換檢視模式" }),
      ).getByRole("radio", { name: "清單" }),
    );
    expect(container.querySelectorAll(".trade-grid-table")).toHaveLength(0);
  });

  it("scopes grid columns to the selected rarity", () => {
    const { container } = render(<Trade m={buildMatrix(mixed)} />);
    toGrid();
    const surplus = () =>
      container.querySelector('[data-kind="surplus"]') as HTMLElement;
    expect(surplus().querySelectorAll(".trade-grid-rarity-head")).toHaveLength(
      4,
    );
    // 頂部稀有度總覽卡是 role="radio"，可存取名稱以稀有度開頭（含 缺/餘 計數）。
    fireEvent.click(screen.getByRole("radio", { name: /^SR / }));
    expect(surplus().querySelectorAll(".trade-grid-rarity-head")).toHaveLength(
      1,
    );
  });

  it("shows the needs empty state when nothing is missing", () => {
    // 全持有 + UR 一張重複 → 有可換出、無想換入。
    const noNeeds: OverviewResponse = {
      cells: [
        card("Kirari", "R", 1, 1),
        card("Kirari", "SR", 1, 2),
        card("Kirari", "SSR", 1, 3),
        card("Kirari", "UR", 2, 4),
      ],
      progress: [],
    };
    const { container } = render(<Trade m={buildMatrix(noNeeds)} />);
    toGrid();
    expect(container.querySelectorAll(".trade-grid-table")).toHaveLength(1); // 只有可換出
    expect(screen.getByText("已全部收集 ✓")).toBeInTheDocument();
  });
});
