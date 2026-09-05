import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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
  it("keeps a committed publication out of the editor when refresh fails and retries only reads", async () => {
    let published: TradePost | null = null;
    let failRefresh = false;
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (!init?.method && failRefresh) throw new Error("refresh unavailable");
      if (url.endsWith("/candidates")) {
        return { ok: true, json: async () => structuredClone(candidates) };
      }
      if (url === "/api/admin/trade-posts" && !init?.method) {
        return {
          ok: true,
          json: async () => (published ? [structuredClone(published)] : []),
        };
      }
      if (url === "/api/admin/trade-posts" && init?.method === "POST") {
        return { ok: true, json: async () => draftPost() };
      }
      if (url === "/api/admin/trade-posts/7/publish") {
        published = {
          ...draftPost(),
          status: "published",
          publishedAt: "2026-09-02 02:05:00",
        };
        failRefresh = true;
        return { ok: true, json: async () => structuredClone(published) };
      }
      throw new Error(`unexpected request: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<TradePosts />);
    await screen.findByText("還沒有交換公告");
    fireEvent.click(screen.getByRole("button", { name: "新增公告" }));
    fireEvent.change(
      screen.getByLabelText("SUMMER BEACH & YOU Mizuki UR 換出數量"),
      { target: { value: "1" } },
    );
    fireEvent.click(screen.getByRole("button", { name: "發布公告" }));
    await screen.findByText("交換公告已發布。");
    await screen.findByText("公告列表更新失敗");
    expect(screen.queryByRole("button", { name: "發布公告" })).toBeNull();
    expect(screen.queryByLabelText("公開交換說明")).toBeNull();
    expect(screen.getByText("公開中")).toBeInTheDocument();
    const writes = fetchMock.mock.calls.filter(([, init]) => init?.method);
    failRefresh = false;
    fireEvent.click(screen.getByRole("button", { name: "重新載入公告" }));
    await waitFor(() =>
      expect(screen.queryByText("公告列表更新失敗")).toBeNull(),
    );
    expect(
      fetchMock.mock.calls.filter(([, init]) => init?.method),
    ).toHaveLength(writes.length);
  });

  it("reuses a saved draft when publishing fails instead of creating it again", async () => {
    let draft: TradePost | null = null;
    let failed = false;
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith("/candidates"))
        return { ok: true, json: async () => structuredClone(candidates) };
      if (url === "/api/admin/trade-posts" && !init?.method) {
        return {
          ok: true,
          json: async () => (draft ? [structuredClone(draft)] : []),
        };
      }
      if (init?.method === "POST" && url === "/api/admin/trade-posts") {
        draft = draftPost();
        return { ok: true, json: async () => structuredClone(draft) };
      }
      if (init?.method === "PUT")
        return { ok: true, json: async () => structuredClone(draft) };
      if (url.endsWith("/publish")) {
        if (!failed) {
          failed = true;
          return {
            ok: false,
            status: 409,
            json: async () => ({ error: "publish rejected" }),
          };
        }
        draft = {
          ...draftPost(),
          status: "published",
          publishedAt: "2026-09-02 02:05:00",
        };
        return { ok: true, json: async () => structuredClone(draft) };
      }
      throw new Error(`unexpected request: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<TradePosts />);
    await screen.findByText("還沒有交換公告");
    fireEvent.click(screen.getByRole("button", { name: "新增公告" }));
    fireEvent.change(
      screen.getByLabelText("SUMMER BEACH & YOU Mizuki UR 換出數量"),
      { target: { value: "1" } },
    );
    fireEvent.click(screen.getByRole("button", { name: "發布公告" }));
    await screen.findByText(/publish rejected/);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "發布公告" })).toBeEnabled(),
    );
    fireEvent.click(screen.getByRole("button", { name: "發布公告" }));
    await screen.findByText("交換公告已發布。");
    expect(
      fetchMock.mock.calls.filter(
        ([url, init]) =>
          url === "/api/admin/trade-posts" && init?.method === "POST",
      ),
    ).toHaveLength(1);
    expect(
      fetchMock.mock.calls.some(
        ([url, init]) =>
          url === "/api/admin/trade-posts/7" && init?.method === "PUT",
      ),
    ).toBe(true);
  });

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

  it("creates an adjustable reservation from a published snapshot without closing it", async () => {
    const onOpenReservations = vi.fn();
    let published = {
      ...draftPost(),
      status: "published" as const,
      publishedAt: "2026-09-02 02:05:00",
      reservationCount: 0,
      activeReservationCount: 0,
      give: [{ ...draftPost().give[0], qty: 2, availableQty: 2 }],
      want: [{ ...draftPost().want[0], qty: 2, availableQty: 2 }],
    };
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url === "/api/admin/trade-posts/candidates") {
        return { ok: true, json: async () => candidates };
      }
      if (url === "/api/admin/trade-posts" && !init?.method) {
        return { ok: true, json: async () => [published] };
      }
      if (
        url === "/api/admin/trade-posts/7/reservations" &&
        init?.method === "POST"
      ) {
        published = {
          ...published,
          reservationCount: 1,
          activeReservationCount: 1,
        };
        return { ok: true, json: async () => ({ id: 31 }) };
      }
      return { ok: false, status: 404, json: async () => ({}) };
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<TradePosts onOpenReservations={onOpenReservations} />);
    fireEvent.click(
      await screen.findByRole("button", { name: "由公告建立預約" }),
    );

    expect(
      screen.getByLabelText("SUMMER BEACH & YOU Mizuki UR 實際換出數量"),
    ).toHaveValue(2);
    expect(
      screen.getByLabelText("SUMMER BEACH & YOU Rei UR 實際換入數量"),
    ).toHaveValue(2);
    fireEvent.change(
      screen.getByLabelText("SUMMER BEACH & YOU Mizuki UR 實際換出數量"),
      { target: { value: "1" } },
    );
    fireEvent.change(
      screen.getByLabelText("SUMMER BEACH & YOU Rei UR 實際換入數量"),
      { target: { value: "1" } },
    );
    fireEvent.change(screen.getByLabelText("交換對象"), {
      target: { value: "Alice" },
    });
    fireEvent.change(screen.getByLabelText("預約日期"), {
      target: { value: "2026-09-03" },
    });
    fireEvent.change(screen.getByLabelText("私人備註"), {
      target: { value: "捷運站面交" },
    });
    fireEvent.click(screen.getByRole("button", { name: "確認建立交換預約" }));

    await screen.findByText("已從公告建立交換預約 #31。");
    const createCall = fetchMock.mock.calls.find(
      ([url, init]) =>
        url === "/api/admin/trade-posts/7/reservations" &&
        init?.method === "POST",
    );
    expect(JSON.parse(createCall?.[1]?.body as string)).toEqual({
      counterparty: "Alice",
      reservedAt: "2026-09-03",
      note: "捷運站面交",
      give: [{ catalogId: 11, qty: 1 }],
      receive: [{ catalogId: 12, qty: 1 }],
    });
    expect(
      fetchMock.mock.calls.some(
        ([url]) => url === "/api/admin/trade-posts/7/close",
      ),
    ).toBe(false);
    expect(
      await screen.findByText("已建立 1 筆預約 · 1 筆進行中"),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "查看交換預約" }));
    expect(onOpenReservations).toHaveBeenCalledOnce();
    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: "確認建立交換預約" }),
      ).toBeNull(),
    );
  });

  it("disables the reservation bridge when no advertised outgoing card remains", async () => {
    const unavailable = {
      ...draftPost(),
      status: "published" as const,
      publishedAt: "2026-09-02 02:05:00",
      reservationCount: 1,
      activeReservationCount: 1,
      stale: true,
      give: [{ ...draftPost().give[0], availableQty: 0, stale: true }],
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => ({
        ok: true,
        json: async () =>
          url === "/api/admin/trade-posts/candidates"
            ? candidates
            : [unavailable],
      })),
    );

    render(<TradePosts />);

    expect(
      await screen.findByRole("button", { name: "由公告建立預約" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "由公告建立預約" }),
    ).toHaveAttribute("title", "目前沒有可預約的換出卡");
  });
});
