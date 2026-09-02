import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TradePosts } from "../../src/client/admin/TradePosts";
import type { TradePost } from "../../src/shared/types";

const candidates = {
  give: [
    {
      catalogId: 11,
      series: "SUMMER BEACH & YOU",
      character: "Mizuki",
      rarity: "UR" as const,
      availableQty: 2,
    },
  ],
  want: [
    {
      catalogId: 12,
      series: "SUMMER BEACH & YOU",
      character: "Rei",
      rarity: "UR" as const,
      availableQty: 1,
    },
  ],
};

function draftPost(): TradePost {
  return {
    id: 7,
    publicId: "draft-7",
    status: "draft",
    note: "台北面交",
    createdAt: "2026-09-02 02:00:00",
    updatedAt: "2026-09-02 02:00:00",
    publishedAt: null,
    closedAt: null,
    stale: false,
    give: [
      {
        direction: "give",
        ...candidates.give[0],
        qty: 1,
        stale: false,
      },
    ],
    want: [
      {
        direction: "want",
        ...candidates.want[0],
        qty: 1,
        stale: false,
      },
    ],
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("admin exchange announcements", () => {
  it("creates and publishes one snapshot from current give and Want candidates", async () => {
    let posts: TradePost[] = [];
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url === "/api/admin/trade-posts/candidates") {
        return { ok: true, json: async () => candidates };
      }
      if (url === "/api/admin/trade-posts" && !init?.method) {
        return { ok: true, json: async () => posts };
      }
      if (url === "/api/admin/trade-posts" && init?.method === "POST") {
        const draft = draftPost();
        posts = [draft];
        return { ok: true, json: async () => draft };
      }
      if (url === "/api/admin/trade-posts/7/publish") {
        const published = {
          ...draftPost(),
          status: "published" as const,
          publishedAt: "2026-09-02 02:05:00",
        };
        posts = [published];
        return { ok: true, json: async () => published };
      }
      return { ok: false, status: 404, json: async () => ({}) };
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<TradePosts />);
    await screen.findByText("還沒有交換公告");
    fireEvent.click(screen.getByRole("button", { name: "新增公告" }));
    fireEvent.change(
      screen.getByLabelText("SUMMER BEACH & YOU Mizuki UR 換出數量"),
      { target: { value: "1" } },
    );
    fireEvent.change(
      screen.getByLabelText("SUMMER BEACH & YOU Rei UR 徵求數量"),
      { target: { value: "1" } },
    );
    fireEvent.change(screen.getByLabelText("公開交換說明"), {
      target: { value: "台北面交" },
    });
    fireEvent.click(screen.getByRole("button", { name: "發布公告" }));

    await screen.findByText("交換公告已發布。");
    expect(screen.getByText("公開中")).toBeInTheDocument();
    const createCall = fetchMock.mock.calls.find(
      ([url, init]) =>
        url === "/api/admin/trade-posts" && init?.method === "POST",
    );
    expect(JSON.parse(createCall?.[1]?.body as string)).toEqual({
      note: "台北面交",
      give: [{ catalogId: 11, qty: 1 }],
      want: [{ catalogId: 12, qty: 1 }],
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/admin/trade-posts/7/publish",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("allows a stale draft to be saved but not published", async () => {
    const staleDraft = {
      ...draftPost(),
      stale: true,
      give: [
        {
          ...draftPost().give[0],
          qty: 2,
          availableQty: 1,
          stale: true,
        },
      ],
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url === "/api/admin/trade-posts/candidates") {
          return {
            ok: true,
            json: async () => ({
              ...candidates,
              give: [{ ...candidates.give[0], availableQty: 1 }],
            }),
          };
        }
        return { ok: true, json: async () => [staleDraft] };
      }),
    );

    render(<TradePosts />);
    fireEvent.click(await screen.findByRole("button", { name: "編輯" }));

    expect(screen.getByText(/有數量已失效，只能先存草稿/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "儲存草稿" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "發布公告" })).toBeDisabled();
  });
});
