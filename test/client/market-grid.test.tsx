import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { buildMatrix } from "../../src/client/collection";
import { MarketBoard } from "../../src/client/views/Market";
import type { MarketListing } from "../../src/shared/types";

const listing = (
  cardId: number,
  changes: Partial<MarketListing> = {},
): MarketListing => ({
  cardId,
  series: "TESSERACT SYMPHONY",
  character: "Rei",
  rarity: "SR",
  status: "for_sale",
  reserved: false,
  askingPrice: 50,
  wantInReturn: null,
  note: null,
  ...changes,
});
const image = {
  url: "/api/catalog/1/image?variant=card&v=1",
  thumbnailUrl: "/api/catalog/1/image?variant=thumb&v=1",
};
const m = buildMatrix({
  cells: [
    {
      catalogId: 1,
      series: "TESSERACT SYMPHONY",
      character: "Rei",
      rarity: "SR",
      volume: 3,
      owned: 8,
      reserved: 0,
      held: 0,
      available: 8,
      image,
    },
  ],
  progress: [],
});

describe("market artwork grid", () => {
  it("shows four identical copies as one pictured card with a per-card price and total quantity", () => {
    render(
      <MarketBoard listings={[1, 2, 3, 4].map((id) => listing(id))} m={m} />,
    );
    const cards = within(screen.getByRole("list", { name: "待售卡片" }));
    expect(cards.getAllByRole("listitem")).toHaveLength(1);
    expect(cards.getByRole("listitem")).toHaveTextContent("數量 4 張");
    expect(screen.getByText("1 款 · 4 張")).toBeInTheDocument();
    expect(cards.getByText("50 元")).toBeInTheDocument();
    expect(cards.getByText("／張")).toBeInTheDocument();
    const art = cards.getByRole("img", {
      name: "TESSERACT SYMPHONY Rei SR 卡面",
    });
    expect(art).toHaveAttribute("src", image.url);
    expect(art).toHaveAttribute(
      "srcset",
      `${image.thumbnailUrl} 320w, ${image.url} 960w`,
    );
    expect(art).toHaveAttribute("loading", "lazy");
  });

  it("separates price, condition notes, series, characters, rarities and sale/trade terms", () => {
    render(
      <MarketBoard
        listings={[
          listing(1),
          listing(2, { askingPrice: 100 }),
          listing(3, { note: "邊角有傷" }),
          listing(4, { series: "KILLER" }),
          listing(5, { character: "Yuzumi" }),
          listing(6, { rarity: "R" }),
          listing(7, { status: "for_trade", wantInReturn: "UR" }),
          listing(8, { status: "for_trade", wantInReturn: "SSR" }),
        ]}
      />,
    );
    expect(
      within(screen.getByRole("list", { name: "待售卡片" })).getAllByRole(
        "listitem",
      ),
    ).toHaveLength(6);
    expect(
      within(screen.getByRole("list", { name: "待換卡片" })).getAllByRole(
        "listitem",
      ),
    ).toHaveLength(2);
    expect(screen.getByText("4 款 · 6 張")).toBeInTheDocument();
    expect(screen.getByText("邊角有傷")).toBeInTheDocument();
    expect(screen.getByText("想換：UR")).toBeInTheDocument();
    expect(screen.getByText("想換：SSR")).toBeInTheDocument();
  });

  it("ignores stale metadata that is not displayed for the current listing status", () => {
    render(
      <MarketBoard
        listings={[
          listing(1),
          listing(2, { wantInReturn: "an old wish" }),
          listing(3, { status: "for_trade", askingPrice: 200 }),
          listing(4, { status: "for_trade", askingPrice: null }),
        ]}
      />,
    );
    expect(
      within(screen.getByRole("list", { name: "待售卡片" })).getAllByRole(
        "listitem",
      ),
    ).toHaveLength(1);
    expect(
      within(screen.getByRole("list", { name: "待換卡片" })).getAllByRole(
        "listitem",
      ),
    ).toHaveLength(1);
  });

  it("counts reserved copies separately from copies still available", () => {
    render(
      <MarketBoard
        listings={[listing(1), listing(2), listing(3, { reserved: true })]}
      />,
    );
    const card = screen.getByRole("listitem");
    expect(card).toHaveTextContent("數量 3 張");
    expect(card).toHaveTextContent("可售 2 張");
    expect(card).toHaveTextContent("預約 1 張");
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
  });

  it("opens an accessible enlarged artwork view with the full listing details", () => {
    const note = "卡片狀況與面交說明".repeat(25);
    render(
      <MarketBoard
        listings={[listing(1, { note }), listing(2, { note })]}
        m={m}
      />,
    );
    fireEvent.click(
      screen.getByRole("button", {
        name: "查看 TESSERACT SYMPHONY Rei SR 卡面與上架資訊",
      }),
    );
    const detail = within(screen.getByRole("dialog", { name: "Rei · SR" }));
    expect(
      detail.getByRole("img", { name: "TESSERACT SYMPHONY Rei SR 放大卡面" }),
    ).toHaveAttribute("src", image.url);
    expect(detail.getByText(note)).toBeInTheDocument();
    expect(detail.getByText("50 元／張")).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toHaveTextContent("數量 2 張");
    fireEvent.click(detail.getByRole("button", { name: "關閉" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("renders listings independently of overview and upgrades the placeholder when artwork arrives", () => {
    const view = render(<MarketBoard listings={[listing(1)]} m={null} />);
    expect(screen.getByText("尚無卡面")).toBeInTheDocument();
    expect(screen.getByText("50 元")).toBeInTheDocument();
    view.rerender(<MarketBoard listings={[listing(1)]} m={m} />);
    const art = screen.getByRole("img");
    expect(art).toHaveAttribute("src", image.url);
    fireEvent.error(art);
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(screen.getByText("尚無卡面")).toBeInTheDocument();
    expect(screen.getByRole("listitem")).toHaveTextContent("數量 1 張");
  });
});
