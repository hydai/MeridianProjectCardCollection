import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CatalogMedia } from "../../src/client/admin/CatalogMedia";
import type { CatalogMediaEntry } from "../../src/shared/types";

const missing: CatalogMediaEntry = {
  catalogId: 1,
  series: "SUMMER BEACH & YOU",
  volume: 4,
  character: "Mizuki",
  rarity: "UR",
  front: null,
};

const ready: CatalogMediaEntry = {
  catalogId: 2,
  series: "SUMMER BEACH & YOU",
  volume: 4,
  character: "Rei",
  rarity: "SSR",
  front: {
    side: "front",
    url: "/api/catalog/2/image?side=front&variant=card&v=1",
    thumbnailUrl: "/api/catalog/2/image?side=front&variant=thumb&v=1",
    contentType: "image/webp",
    byteSize: 2048,
    originalFilename: "rei.jpg",
    revision: 1,
    updatedAt: "2026-09-02 03:00:00",
  },
};

const jsonResponse = (body: unknown, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("CatalogMedia", () => {
  it("uses missing images as the default work queue and can show completed slots", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse([missing, ready])),
    );

    render(<CatalogMedia />);
    expect(await screen.findByText("Mizuki")).toBeInTheDocument();
    expect(screen.queryByText("Rei")).toBeNull();
    expect(
      screen.getByRole("progressbar", { name: "卡圖完成度 1 / 2" }),
    ).toHaveAttribute("aria-valuenow", "1");

    fireEvent.click(screen.getByRole("radio", { name: "已有圖" }));
    expect(screen.getByText("Rei")).toBeInTheDocument();
    expect(screen.queryByText("Mizuki")).toBeNull();
    expect(screen.getByText(/rei\.jpg/)).toBeInTheDocument();
  });

  it("uploads an accepted source image and refreshes the optimized queue", async () => {
    let getCount = 0;
    const uploaded: CatalogMediaEntry = {
      ...missing,
      front: {
        side: "front",
        url: "/api/catalog/1/image?side=front&variant=card&v=1",
        thumbnailUrl: "/api/catalog/1/image?side=front&variant=thumb&v=1",
        contentType: "image/webp",
        byteSize: 512,
        originalFilename: "mizuki card.jpg",
        revision: 1,
        updatedAt: "2026-09-02 04:00:00",
      },
    };
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === "PUT") {
        return jsonResponse({ ok: true, revision: 1 });
      }
      getCount += 1;
      return jsonResponse(getCount === 1 ? [missing] : [uploaded]);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<CatalogMedia />);
    await screen.findByText("Mizuki");
    const file = new File(
      [new Uint8Array([0xff, 0xd8, 0xff, 0xd9])],
      "mizuki card.jpg",
      {
        type: "image/jpeg",
      },
    );
    fireEvent.change(
      screen.getByLabelText("選擇 SUMMER BEACH & YOU Mizuki UR 卡面"),
      { target: { files: [file] } },
    );

    expect(
      await screen.findByText(
        "SUMMER BEACH & YOU Mizuki UR 的正面卡圖已儲存。",
      ),
    ).toBeInTheDocument();
    await waitFor(() => expect(getCount).toBe(2));
    const putCall = fetchMock.mock.calls.find(
      ([url, init]) =>
        url === "/api/admin/catalog/1/image" && init?.method === "PUT",
    );
    expect(putCall).toBeDefined();
    expect(putCall?.[1]?.body).toBeInstanceOf(ArrayBuffer);
    expect((putCall?.[1]?.body as ArrayBuffer).byteLength).toBe(4);
    expect(putCall?.[1]?.headers).toMatchObject({
      "content-type": "image/jpeg",
      "x-card-image-size": "4",
      "x-card-image-filename": "mizuki%20card.jpg",
    });
    expect(screen.getByText("沒有符合條件的卡位")).toBeInTheDocument();
  });

  it("rejects HEIC in the browser before making an upload request", async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) =>
      jsonResponse([missing]),
    );
    vi.stubGlobal("fetch", fetchMock);
    render(<CatalogMedia />);
    await screen.findByText("Mizuki");

    const file = new File([new Uint8Array([1])], "photo.heic", {
      type: "image/heic",
    });
    fireEvent.change(
      screen.getByLabelText("選擇 SUMMER BEACH & YOU Mizuki UR 卡面"),
      { target: { files: [file] } },
    );

    expect(
      await screen.findByText("請選擇 JPEG、PNG、WebP 或 AVIF 圖片。"),
    ).toBeInTheDocument();
    expect(
      fetchMock.mock.calls.some(([, init]) => init?.method === "PUT"),
    ).toBe(false);
  });

  it("keeps a large missing-image queue in manageable pages", async () => {
    const many = Array.from(
      { length: 25 },
      (_, index): CatalogMediaEntry => ({
        ...missing,
        catalogId: index + 1,
        character: `Member ${index + 1}`,
      }),
    );
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse(many)),
    );
    render(<CatalogMedia />);

    expect(await screen.findByText("Member 1")).toBeInTheDocument();
    expect(screen.queryByText("Member 25")).toBeNull();
    expect(screen.getByText(/第 1 \/ 2 頁/)).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "上傳卡圖" })).toHaveLength(
      24,
    );

    fireEvent.click(screen.getByRole("button", { name: "下一頁" }));
    expect(screen.getByText("Member 25")).toBeInTheDocument();
    expect(screen.queryByText("Member 1")).toBeNull();
    expect(screen.getByText(/第 2 \/ 2 頁/)).toBeInTheDocument();
  });
});
