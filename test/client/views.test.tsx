import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
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
