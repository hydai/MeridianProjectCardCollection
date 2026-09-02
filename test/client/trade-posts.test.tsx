import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import App from "../../src/client/App";
import { TradePostsView } from "../../src/client/views/TradePosts";
import type { TradePost } from "../../src/shared/types";

const publishedPost: TradePost = {
  id: 3,
  publicId: "public-3",
  status: "published",
  note: "台北面交優先",
  createdAt: "2026-09-02 02:00:00",
  updatedAt: "2026-09-02 02:00:00",
  publishedAt: "2026-09-02 02:00:00",
  closedAt: null,
  stale: true,
  give: [
    {
      direction: "give",
      catalogId: 11,
      series: "SUMMER BEACH & YOU",
      character: "Mizuki",
      rarity: "UR",
      qty: 2,
      availableQty: 1,
      stale: true,
    },
  ],
  want: [
    {
      direction: "want",
      catalogId: 12,
      series: "SUMMER BEACH & YOU",
      character: "Rei",
      rarity: "UR",
      qty: 1,
      availableQty: 1,
      stale: false,
    },
  ],
};

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  window.history.replaceState(null, "", "/");
});

describe("public exchange announcements", () => {
  it("links a published snapshot and marks changed availability", () => {
    render(
      <MemoryRouter>
        <TradePostsView posts={[publishedPost]} />
      </MemoryRouter>,
    );

    expect(screen.getByText("內容有變動")).toBeInTheDocument();
    expect(screen.getByText("1 種 · 2 張")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /查看公告/ })).toHaveAttribute(
      "href",
      "/exchange/public-3",
    );
  });

  it("keeps a closed announcement readable at its fixed URL", async () => {
    window.history.replaceState(null, "", "/exchange/public-3");
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => ({
        ok: true,
        json: async () => ({
          ...publishedPost,
          status: "closed",
          closedAt: "2026-09-03 02:00:00",
        }),
      })),
    );

    render(<App />);

    expect(
      await screen.findByRole("heading", { name: "交換公告" }),
    ).toBeInTheDocument();
    expect(screen.getByText("這則公告已關閉")).toBeInTheDocument();
    expect(screen.getByText("台北面交優先")).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith("/api/trade-posts/public-3");
  });

  it("keeps announcements and the live trade list as separate tabs", async () => {
    window.history.replaceState(null, "", "/");
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url === "/api/trade-posts") {
          return { ok: true, json: async () => [publishedPost] };
        }
        if (url === "/api/overview") {
          return { ok: true, json: async () => ({ cells: [], progress: [] }) };
        }
        return { ok: true, json: async () => [] };
      }),
    );

    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /交易 Trade/ }));

    expect(screen.getByRole("tab", { name: /公告 Posts/ })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByRole("tab", { name: /交換 Trade/ })).toBeInTheDocument();
    await waitFor(() =>
      expect(
        screen.getByRole("link", { name: /查看公告/ }),
      ).toBeInTheDocument(),
    );
  });
});
