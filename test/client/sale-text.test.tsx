import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildMatrix } from "../../src/client/collection";
import { formatSaleList } from "../../src/client/lib/sale-text";
import { MarketBoard } from "../../src/client/views/Market";
import type { MarketListing, Rarity } from "../../src/shared/types";

const kinds: {
  rarity: Rarity;
  volume: number;
  series: string;
  quantity: number;
}[] = [
  { rarity: "EX", volume: 3, series: "RUBIC's BLOCK", quantity: 1 },
  { rarity: "UR", volume: 2, series: "MP 4TH", quantity: 2 },
  { rarity: "SSR", volume: 1, series: "KILLER", quantity: 5 },
  { rarity: "SR", volume: 2, series: "MP 4TH", quantity: 3 },
  { rarity: "R", volume: 1, series: "BUNNY GIRL", quantity: 1 },
  { rarity: "R", volume: 2, series: "MP 4TH", quantity: 3 },
];
let id = 0;
const listings: MarketListing[] = kinds
  .flatMap((kind) =>
    Array.from({ length: kind.quantity }, () => ({
      cardId: ++id,
      series: kind.series,
      character: "Mizuki",
      rarity: kind.rarity,
      status: "for_sale" as const,
      reserved: false,
      askingPrice: 200,
      wantInReturn: null,
      note: null,
    })),
  )
  .reverse();
const m = buildMatrix({
  cells: kinds.map((kind, i) => ({
    catalogId: i + 1,
    series: kind.series,
    character: "Mizuki",
    rarity: kind.rarity,
    volume: kind.volume,
    owned: kind.quantity,
    reserved: 0,
    held: 0,
    available: kind.quantity,
  })),
  progress: [],
});
const expected =
  "EX\nVOL.3\nMizuki RUBIC's BLOCK 1\nUR\nVOL.2\nMizuki MP 4TH 2\nSSR\nVOL.1\nMizuki KILLER 5\nSR\nVOL.2\nMizuki MP 4TH 3\nR\nVOL.1\nMizuki BUNNY GIRL 1\nVOL.2\nMizuki MP 4TH 3";
const original = Object.getOwnPropertyDescriptor(navigator, "clipboard");
function clipboard(writeText?: (text: string) => Promise<void>) {
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: writeText ? { writeText } : undefined,
  });
}
afterEach(() => {
  if (original) Object.defineProperty(navigator, "clipboard", original);
  else Reflect.deleteProperty(navigator, "clipboard");
});

describe("sale text format", () => {
  it("matches the requested format regardless of listing order and merges price/condition variants", () => {
    const rows = listings.map((item, i) => ({
      ...item,
      askingPrice: i % 2 ? 200 : 150,
      note: i % 2 ? "邊角有傷" : null,
    }));
    expect(formatSaleList(rows, m)).toBe(expected);
    expect(formatSaleList([...rows].reverse(), m)).toBe(expected);
  });
  it("excludes sale/trade reservations and non-sale copies without empty headers", () => {
    const rows = [
      ...listings,
      {
        ...listings[0],
        cardId: 100,
        reserved: true,
        reservationType: "sale" as const,
      },
      {
        ...listings[0],
        cardId: 101,
        reserved: true,
        reservationType: "trade" as const,
      },
      { ...listings[0], cardId: 102, status: "for_trade" as const },
    ];
    expect(formatSaleList(rows, m)).toBe(expected);
    expect(
      formatSaleList(
        rows.map((item) => ({ ...item, reserved: true })),
        m,
      ),
    ).toBe("");
  });
  it("uses live volumes, numeric volume order, and catalog character/series order", () => {
    const catalog = {
      series: ["Future", "Second", "First"],
      volumes: [10, 2, 2],
      characters: ["Rei", "Mizuki"],
    };
    const rows = [
      { ...listings[0], series: "Future" },
      { ...listings[0], series: "First" },
      { ...listings[0], series: "Second" },
      { ...listings[0], series: "First", character: "Rei" },
    ];
    expect(formatSaleList(rows, catalog)).toBe(
      "R\nVOL.2\nRei First 1\nMizuki Second 1\nMizuki First 1\nVOL.10\nMizuki Future 1",
    );
    expect(formatSaleList(rows, m)).toBeNull();
    expect(formatSaleList(rows, { ...catalog, volumes: [0, 2, 2] })).toBeNull();
    expect(formatSaleList(rows, null)).toBeNull();
  });
});

describe("copy sale list", () => {
  it("copies the current rarity selection and resets feedback when the selection changes", async () => {
    const write = vi.fn(async () => {});
    clipboard(write);
    render(<MarketBoard listings={listings} m={m} />);
    fireEvent.click(screen.getByRole("button", { name: "複製文字清單" }));
    expect(write).toHaveBeenCalledWith(expected);
    await screen.findByRole("button", { name: "已複製文字清單" });
    const filters = within(
      screen.getByRole("toolbar", { name: "待售稀有度篩選" }),
    );
    fireEvent.click(filters.getByRole("button", { name: "SSR" }));
    fireEvent.click(filters.getByRole("button", { name: "EX" }));
    fireEvent.click(screen.getByRole("button", { name: "複製文字清單" }));
    expect(write).toHaveBeenLastCalledWith(
      "EX\nVOL.3\nMizuki RUBIC's BLOCK 1\nSSR\nVOL.1\nMizuki KILLER 5",
    );
    await screen.findByRole("button", { name: "已複製文字清單" });
  });
  it.each(["missing", "denied"])(
    "offers selectable text when the clipboard is %s",
    async (kind) => {
      clipboard(
        kind === "missing"
          ? undefined
          : async () => {
              throw new Error("denied");
            },
      );
      render(<MarketBoard listings={listings} m={m} />);
      fireEvent.click(screen.getByRole("button", { name: "複製文字清單" }));
      const text = await screen.findByRole("textbox", { name: "待售文字清單" });
      expect(text).toHaveValue(expected);
      expect(text).toHaveAttribute("readonly");
      fireEvent.focus(text);
      expect((text as HTMLTextAreaElement).selectionEnd).toBe(expected.length);
      expect(screen.getByRole("alert")).toHaveTextContent("手動複製");
    },
  );
  it("disables copy for missing metadata and empty availability", () => {
    const view = render(<MarketBoard listings={listings} />);
    expect(screen.getByRole("button", { name: "複製文字清單" })).toBeDisabled();
    view.rerender(
      <MarketBoard
        listings={listings.map((item) => ({ ...item, reserved: true }))}
        m={m}
      />,
    );
    expect(screen.getByRole("button", { name: "複製文字清單" })).toBeDisabled();
    expect(screen.getByText("目前篩選下沒有可售的卡片。")).toBeInTheDocument();
  });
  it("ignores a copy failure from an earlier filter", async () => {
    let reject: ((error: Error) => void) | undefined;
    clipboard(
      () =>
        new Promise((_, fail) => {
          reject = fail;
        }),
    );
    render(<MarketBoard listings={listings} m={m} />);
    fireEvent.click(screen.getByRole("button", { name: "複製文字清單" }));
    fireEvent.click(
      within(screen.getByRole("toolbar", { name: "待售稀有度篩選" })).getByRole(
        "button",
        { name: "SSR" },
      ),
    );
    await act(async () => reject?.(new Error("stale")));
    expect(
      screen.queryByRole("textbox", { name: "待售文字清單" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "複製文字清單" })).toBeEnabled();
  });
});
