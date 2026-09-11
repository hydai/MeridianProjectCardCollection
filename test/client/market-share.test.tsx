import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderSaleImage } from "../../src/client/lib/sale-image";
import { MarketBoard } from "../../src/client/views/Market";
import type { MarketListing } from "../../src/shared/types";

vi.mock("../../src/client/lib/sale-image", () => ({
  renderSaleImage: vi.fn(),
}));

const listing = (
  id: number,
  rarity: MarketListing["rarity"],
  changes: Partial<MarketListing> = {},
): MarketListing => ({
  cardId: id,
  series: "NEW YEAR",
  character: "Rei",
  rarity,
  status: "for_sale",
  reserved: false,
  askingPrice: 10,
  wantInReturn: null,
  note: null,
  ...changes,
});
const listings = [
  listing(1, "R"),
  listing(2, "R", { reserved: true, reservationType: "sale" }),
  listing(3, "SR"),
  listing(4, "SSR", { askingPrice: null, note: "邊角有傷" }),
  listing(5, "UR"),
  listing(6, "EX"),
  listing(7, "SR", { status: "for_trade" }),
];
const png = {
  blob: new Blob(["png"], { type: "image/png" }),
  width: 2800,
  height: 1600,
  missingImages: 0,
};
const filter = () =>
  within(screen.getByRole("toolbar", { name: "待售稀有度篩選" }));
const share = () =>
  fireEvent.click(screen.getByRole("radio", { name: "分享版" }));

beforeEach(() => {
  vi.mocked(renderSaleImage).mockReset().mockResolvedValue(png);
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:sale-image");
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe("sale sharing", () => {
  it("unions rarity selections and exports only matching sale groups with reservations and terms intact", async () => {
    render(<MarketBoard listings={listings} />);
    fireEvent.click(filter().getByRole("button", { name: "R" }));
    fireEvent.click(filter().getByRole("button", { name: "SSR" }));
    expect(screen.getByText("2 款 · 3 張")).toBeInTheDocument();
    share();
    const download = await screen.findByRole("link", { name: "匯出 PNG" });
    expect(download).toHaveAttribute(
      "download",
      expect.stringMatching(/^待售清單-R-SSR-\d{4}-\d{2}-\d{2}\.png$/),
    );
    const input = vi.mocked(renderSaleImage).mock.lastCall?.[0];
    expect(input?.groups.map((group) => group.item.rarity)).toEqual([
      "R",
      "SSR",
    ]);
    expect(input?.groups[0]).toMatchObject({
      quantity: 2,
      reserved: 1,
      reservedSale: 1,
    });
    expect(input?.groups[1].item).toMatchObject({
      askingPrice: null,
      note: "邊角有傷",
    });
    expect(
      screen.getByRole("list", { name: "待售分享卡片明細" }),
    ).toHaveTextContent("可售 1 張 · 預約 1 張");
    expect(screen.getByRole("list", { name: "待換卡片" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("radio", { name: "卡片版" }));
    expect(screen.getByText("2 款 · 3 張")).toBeInTheDocument();
    fireEvent.click(filter().getByRole("button", { name: "全部" }));
    expect(screen.getByText("5 款 · 6 張")).toBeInTheDocument();
  });

  it("removes the previous download immediately on filter changes and ignores an obsolete render", async () => {
    render(<MarketBoard listings={listings} />);
    share();
    await screen.findByRole("link", { name: "匯出 PNG" });
    let finishOld: ((value: typeof png) => void) | undefined;
    vi.mocked(renderSaleImage).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishOld = resolve;
        }),
    );
    fireEvent.click(filter().getByRole("button", { name: "SR" }));
    expect(
      screen.queryByRole("link", { name: "匯出 PNG" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "匯出 PNG" })).toBeDisabled();
    fireEvent.click(filter().getByRole("button", { name: "EX" }));
    expect(
      await screen.findByRole("link", { name: "匯出 PNG" }),
    ).toHaveAttribute("download", expect.stringContaining("-SR-EX-"));
    await act(async () => finishOld?.(png));
    expect(screen.getByRole("link", { name: "匯出 PNG" })).toHaveAttribute(
      "download",
      expect.stringContaining("-SR-EX-"),
    );
    expect(URL.revokeObjectURL).toHaveBeenCalled();
  });

  it("regenerates the complete image for a new column count and reports missing artwork", async () => {
    vi.mocked(renderSaleImage).mockResolvedValue({ ...png, missingImages: 2 });
    render(<MarketBoard listings={listings} />);
    share();
    await screen.findByRole("link", { name: "匯出 PNG" });
    fireEvent.click(screen.getByRole("radio", { name: "10" }));
    await waitFor(() =>
      expect(vi.mocked(renderSaleImage).mock.lastCall?.[0].columns).toBe(10),
    );
    await screen.findByRole("link", { name: "匯出 PNG" });
    expect(vi.mocked(renderSaleImage).mock.lastCall?.[0].groups).toHaveLength(
      5,
    );
    expect(screen.getByText(/2 筆卡圖未提供或載入失敗/)).toBeInTheDocument();
  });

  it("offers a retry after generation fails and no download for an empty filter", async () => {
    vi.mocked(renderSaleImage).mockRejectedValueOnce(new Error("圖片產生失敗"));
    render(<MarketBoard listings={[listing(1, "R")]} />);
    share();
    expect(await screen.findByRole("alert")).toHaveTextContent("圖片產生失敗");
    fireEvent.click(screen.getByRole("button", { name: "重試" }));
    await screen.findByRole("link", { name: "匯出 PNG" });
    fireEvent.click(filter().getByRole("button", { name: "UR" }));
    expect(
      screen.getByText("目前沒有 UR 等級的待售卡片。"),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "匯出 PNG" }),
    ).not.toBeInTheDocument();
  });
});
