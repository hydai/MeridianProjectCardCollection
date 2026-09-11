import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { groupListings } from "../../../src/client/lib/market-listings";
import { renderSaleImage } from "../../../src/client/lib/sale-image";
import type { MarketListing } from "../../../src/shared/types";

const listing = (
  cardId: number,
  changes: Partial<MarketListing> = {},
): MarketListing => ({
  cardId,
  series: "TESSERACT SYMPHONY",
  character: "Rei",
  rarity: "R",
  status: "for_sale",
  reserved: false,
  askingPrice: 0,
  wantInReturn: null,
  note: null,
  ...changes,
});
const fillText = vi.fn();
const ctx = {
  measureText: (text: string) => ({ width: text.length * 9 }),
  fillText,
  scale: vi.fn(),
  fillRect: vi.fn(),
  strokeRect: vi.fn(),
  beginPath: vi.fn(),
  roundRect: vi.fn(),
  fill: vi.fn(),
};
const options = {
  columns: 8 as const,
  date: "2026-09-11",
  source: "example.com",
  signal: new AbortController().signal,
};
beforeEach(() => {
  fillText.mockClear();
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
    ctx as unknown as CanvasRenderingContext2D,
  );
  vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(
    (callback) => callback(new Blob(["png"], { type: "image/png" })),
  );
});
afterEach(() => vi.restoreAllMocks());

describe("sale image rendering", () => {
  it("includes every rarity, correct available quantities, zero and negotiable prices, and full notes", async () => {
    const note = "卡片邊緣有傷，請先確認完整卡況再購買。".repeat(4);
    const result = await renderSaleImage({
      ...options,
      groups: groupListings([
        listing(1),
        listing(2, { reserved: true, reservationType: "sale" }),
        listing(3, { rarity: "EX", askingPrice: null, note }),
        listing(4, { rarity: "SR" }),
        listing(5, { rarity: "SSR" }),
        listing(6, { rarity: "UR" }),
      ]),
    });
    const text = fillText.mock.calls.map((call) => call[0] as string);
    expect(text).toEqual(
      expect.arrayContaining([
        "R",
        "SR",
        "SSR",
        "UR",
        "EX",
        "0 元／張",
        "價格面議",
        "預約出售 1 張",
        "可售 1 張",
      ]),
    );
    expect(text.join("")).toContain(note);
    expect(text).toEqual(expect.arrayContaining(["TESSERACT", "SYMPHONY"]));
    expect(
      text.some(
        (line) =>
          line.includes("5 款 · 6 張") &&
          line.includes("可售 5 張 · 預約 1 張"),
      ),
    ).toBe(true);
    expect(result.missingImages).toBe(5);
    expect(result.blob.type).toBe("image/png");
    expect(result.width * result.height).toBeLessThanOrEqual(16_000_000);
    expect(result.height).toBeLessThanOrEqual(8192);
  });

  it("rejects empty or excessively long exports instead of creating a blank or cropped image", async () => {
    await expect(renderSaleImage({ ...options, groups: [] })).rejects.toThrow(
      "沒有可匯出",
    );
    await expect(
      renderSaleImage({
        ...options,
        groups: groupListings([listing(1, { note: "傷".repeat(10_000) })]),
      }),
    ).rejects.toThrow("清單太長");
    expect(HTMLCanvasElement.prototype.toBlob).not.toHaveBeenCalled();
  });

  it("surfaces PNG encoding failures", async () => {
    vi.mocked(HTMLCanvasElement.prototype.toBlob).mockImplementation(
      (callback) => callback(null),
    );
    await expect(
      renderSaleImage({ ...options, groups: groupListings([listing(1)]) }),
    ).rejects.toThrow("圖片產生失敗");
  });
});
