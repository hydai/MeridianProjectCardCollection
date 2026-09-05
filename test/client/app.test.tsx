import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import App from "../../src/client/App";
import type { OverviewResponse } from "../../src/shared/types";

const routeLoads = vi.hoisted(() => ({
  admin: vi.fn(),
  tradePost: vi.fn(),
}));

vi.mock("../../src/client/admin/Admin", () => {
  routeLoads.admin();
  return { default: () => <h1>管理介面</h1> };
});

vi.mock("../../src/client/TradePostPage", () => {
  routeLoads.tradePost();
  return { default: () => <h1>公告頁面</h1> };
});

const overview: OverviewResponse = {
  cells: [
    {
      catalogId: 1,
      series: "NEW YEAR",
      character: "Mizuki",
      rarity: "R",
      owned: 3,
      reserved: 0,
      held: 0,
      available: 3,
      incomingTrade: 0,
      incomingPurchase: 0,
      volume: 1,
    },
    {
      catalogId: 2,
      series: "NEW YEAR",
      character: "Mizuki",
      rarity: "SR",
      owned: 1,
      reserved: 0,
      held: 0,
      available: 1,
      incomingTrade: 0,
      incomingPurchase: 0,
      volume: 1,
    },
    {
      catalogId: 3,
      series: "NEW YEAR",
      character: "Mizuki",
      rarity: "SSR",
      owned: 0,
      reserved: 0,
      held: 0,
      available: 0,
      incomingTrade: 0,
      incomingPurchase: 0,
      volume: 1,
    },
    {
      catalogId: 4,
      series: "NEW YEAR",
      character: "Mizuki",
      rarity: "UR",
      owned: 0,
      reserved: 0,
      held: 0,
      available: 0,
      incomingTrade: 0,
      incomingPurchase: 0,
      volume: 1,
    },
  ],
  progress: [{ series: "NEW YEAR", collectedTypes: 2, totalTypes: 4 }],
};

const listings = [
  {
    cardId: 1,
    series: "NEW YEAR",
    character: "Mizuki",
    rarity: "SR",
    status: "for_sale",
    reserved: false,
    askingPrice: 500,
    wantInReturn: null,
    note: null,
  },
];

function response(data: unknown, status = 200) {
  return { ok: status < 400, status, json: async () => data };
}

function mockPublicFetch() {
  const mock = vi.fn(async (url: string) =>
    response(
      url === "/api/overview"
        ? overview
        : url === "/api/market"
          ? listings
          : [],
    ),
  );
  vi.stubGlobal("fetch", mock);
  return mock;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  history.replaceState(null, "", "/");
  localStorage.clear();
});

describe("App", () => {
  it("renders the hero and stats from the API", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, json: async () => overview })),
    );
    render(<App />);
    expect(screen.getByText("子午計畫")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("張總計")).toBeInTheDocument());
    // total owned = 3 + 1 = 4
    expect(screen.getAllByText("4").length).toBeGreaterThan(0);
  });

  it("shows an error state when the API fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, status: 500, json: async () => ({}) })),
    );
    render(<App />);
    await waitFor(() =>
      expect(screen.getByText(/無法載入資料/)).toBeInTheDocument(),
    );
  });

  it("shows market listings on the 交易看板 tab", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => ({
        ok: true,
        json: async () => {
          const path = String(url);
          if (path.includes("/api/trade-posts")) return [];
          if (path.includes("/api/market")) return listings;
          if (path.includes("/api/pending-")) return [];
          return overview;
        },
      })),
    );
    render(<App />);
    await waitFor(() =>
      expect(screen.getByText("子午計畫")).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByRole("button", { name: /交易 Trade/ }));
    fireEvent.click(screen.getByRole("tab", { name: /交易看板/ }));
    await waitFor(() => expect(screen.getByText("500 元")).toBeInTheDocument());
  });

  it("requests only overview for collection views, including StrictMode remounts", async () => {
    const fetchMock = mockPublicFetch();
    const { container } = render(
      <StrictMode>
        <App />
      </StrictMode>,
    );
    await screen.findByText("張總計");

    fireEvent.click(screen.getByRole("tab", { name: "系列 By Series" }));
    fireEvent.click(screen.getByRole("tab", { name: "稀有度 By Rarity" }));
    fireEvent.click(screen.getByRole("button", { name: "盤點 Inventory" }));
    fireEvent.click(screen.getByRole("tab", { name: "格表 Grid" }));
    fireEvent.click(screen.getByRole("button", { name: "NEW YEAR" }));
    expect(localStorage.getItem("mpc:grid:hiddenSeries")).toBe('["NEW YEAR"]');

    fireEvent.click(screen.getByRole("tab", { name: "缺卡 Wishlist" }));
    expect(screen.getByText(/Unique cards collected/)).toBeInTheDocument();
    expect(container.querySelector(".view-grid")).toBeNull();
    expect(container.querySelector(".view-glance")).toBeNull();
    expect(container.querySelectorAll("section.view")).toHaveLength(1);

    fireEvent.click(screen.getByRole("tab", { name: "格表 Grid" }));
    expect(screen.getByRole("button", { name: "NEW YEAR" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(container.querySelector(".view-wishlist")).toBeNull();
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual(["/api/overview"]);
  });

  it("loads each secondary resource once when selected and retains it across tab switches", async () => {
    const fetchMock = mockPublicFetch();
    render(
      <StrictMode>
        <App />
      </StrictMode>,
    );
    await screen.findByText("張總計");

    fireEvent.click(screen.getByRole("button", { name: "交易 Trade" }));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith("/api/trade-posts"),
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);

    fireEvent.click(screen.getByRole("tab", { name: "交易看板 Market" }));
    await screen.findByText("500 元");
    expect(fetchMock).toHaveBeenCalledTimes(3);

    fireEvent.click(screen.getByRole("tab", { name: "交換 Trade" }));
    await waitFor(() =>
      expect(screen.queryByLabelText("載入暫定交換列表")).toBeNull(),
    );
    expect(screen.queryByLabelText("載入預定購入（待收件）")).toBeNull();
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      "/api/overview",
      "/api/trade-posts",
      "/api/market",
      "/api/pending-trades",
      "/api/pending-purchases",
    ]);

    fireEvent.click(screen.getByRole("tab", { name: "交易看板 Market" }));
    expect(screen.getByText("500 元")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: "公告 Posts" }));
    fireEvent.click(screen.getByRole("tab", { name: "交換 Trade" }));
    expect(screen.getByText("想換入")).toBeInTheDocument();
    expect(screen.queryByLabelText("載入暫定交換列表")).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(5);
  });

  it.each(["loading", "failed"])(
    "renders market independently while overview is %s",
    async (state) => {
      history.replaceState(null, "", "/#market");
      const fetchMock = vi.fn(async (url: string) => {
        if (url === "/api/overview") {
          return state === "failed" ? response({}, 503) : new Promise(() => {});
        }
        return response(listings);
      });
      vi.stubGlobal("fetch", fetchMock);

      render(<App />);

      expect(await screen.findByText("500 元")).toBeInTheDocument();
      expect(screen.queryByText(/無法載入資料/)).toBeNull();
      expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
        "/api/overview",
        "/api/market",
      ]);
    },
  );

  it("reuses an in-flight market request after leaving and remounting its view", async () => {
    history.replaceState(null, "", "/#market");
    const market = deferred<ReturnType<typeof response>>();
    const fetchMock = vi.fn((url: string) =>
      url === "/api/market"
        ? market.promise
        : Promise.resolve(response(url === "/api/overview" ? overview : [])),
    );
    vi.stubGlobal("fetch", fetchMock);
    render(<App />);
    await screen.findByText("張總計");
    expect(screen.getByText("載入中…")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: "交換 Trade" }));
    fireEvent.click(screen.getByRole("tab", { name: "交易看板 Market" }));
    expect(
      fetchMock.mock.calls.filter(([url]) => url === "/api/market"),
    ).toHaveLength(1);

    fireEvent.click(screen.getByRole("button", { name: "收藏 Collection" }));
    await act(async () => market.resolve(response(listings)));
    expect(screen.queryByText("500 元")).toBeNull();
    expect(
      screen.getByRole("tab", { name: "角色 By Character" }),
    ).toHaveAttribute("aria-selected", "true");

    fireEvent.click(screen.getByRole("button", { name: "交易 Trade" }));
    fireEvent.click(screen.getByRole("tab", { name: "交易看板 Market" }));
    expect(await screen.findByText("500 元")).toBeInTheDocument();
    expect(
      fetchMock.mock.calls.filter(([url]) => url === "/api/market"),
    ).toHaveLength(1);
  });

  it("keeps a late failure scoped and retries it when the resource is revisited", async () => {
    history.replaceState(null, "", "/#market");
    const market = deferred<ReturnType<typeof response>>();
    let attempts = 0;
    const fetchMock = vi.fn((url: string) => {
      if (url === "/api/market") {
        attempts += 1;
        return attempts === 1
          ? market.promise
          : Promise.resolve(response(listings));
      }
      return Promise.resolve(response(url === "/api/overview" ? overview : []));
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<App />);
    await screen.findByText("張總計");
    fireEvent.click(screen.getByRole("button", { name: "收藏 Collection" }));

    await act(async () => market.reject(new Error("market unavailable")));
    expect(screen.getByText("Mizuki")).toBeInTheDocument();
    expect(screen.queryByText(/market unavailable/)).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "交易 Trade" }));
    fireEvent.click(screen.getByRole("tab", { name: "交易看板 Market" }));
    expect(await screen.findByText("500 元")).toBeInTheDocument();
    expect(screen.queryByText(/market unavailable/)).toBeNull();
    fireEvent.click(screen.getByRole("tab", { name: "交換 Trade" }));
    fireEvent.click(screen.getByRole("tab", { name: "交易看板 Market" }));
    expect(screen.getByText("500 元")).toBeInTheDocument();
    expect(
      fetchMock.mock.calls.filter(([url]) => url === "/api/market"),
    ).toHaveLength(2);
  });

  it.each([
    ["market", "交易看板 Market", "/api/market"],
    ["posts", "公告 Posts", "/api/trade-posts"],
    ["trade", "交換 Trade", "/api/pending-trades"],
    ["trade", "交換 Trade", "/api/pending-purchases"],
  ])(
    "recovers %s data from %s after a transient %s failure",
    async (tab, label, endpoint) => {
      history.replaceState(null, "", `/#${tab}`);
      let attempts = 0;
      const fetchMock = vi.fn(async (url: string) => {
        if (url === endpoint) {
          attempts += 1;
          if (attempts === 1) return response({}, 503);
        }
        return response(
          url === "/api/overview"
            ? overview
            : url === "/api/market"
              ? listings
              : [],
        );
      });
      vi.stubGlobal("fetch", fetchMock);
      render(
        <StrictMode>
          <App />
        </StrictMode>,
      );
      await screen.findByText(/503/);
      fireEvent.click(screen.getByRole("button", { name: "收藏 Collection" }));
      fireEvent.click(screen.getByRole("button", { name: "交易 Trade" }));
      fireEvent.click(screen.getByRole("tab", { name: label }));
      await waitFor(() => expect(attempts).toBe(2));
      await waitFor(() => expect(screen.queryByText(/503/)).toBeNull());
    },
  );

  it("does not reuse or apply a previous viewer's late overview response", async () => {
    const oldOverview = deferred<ReturnType<typeof response>>();
    const fetchMock = vi
      .fn()
      .mockReturnValueOnce(oldOverview.promise)
      .mockResolvedValue(response(overview));
    vi.stubGlobal("fetch", fetchMock);
    const first = render(<App />);
    first.unmount();
    render(<App />);
    await screen.findByText("Mizuki");

    await act(async () =>
      oldOverview.resolve(
        response({
          ...overview,
          cells: overview.cells.map((cell) => ({
            ...cell,
            character: "Stale",
          })),
        }),
      ),
    );

    expect(screen.queryByText("Stale")).toBeNull();
    expect(screen.getByText("Mizuki")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("imports secondary route modules only at their routes and shows a skeleton while loading", async () => {
    mockPublicFetch();
    const publicPage = render(<App />);
    await screen.findByText("張總計");
    expect(routeLoads.admin).not.toHaveBeenCalled();
    expect(routeLoads.tradePost).not.toHaveBeenCalled();
    publicPage.unmount();

    history.replaceState(null, "", "/admin");
    const adminPage = render(<App />);
    expect(screen.getByLabelText("載入頁面")).toBeInTheDocument();
    expect(
      await screen.findByRole("heading", { name: "管理介面" }),
    ).toBeInTheDocument();
    expect(routeLoads.admin).toHaveBeenCalledTimes(1);
    expect(routeLoads.tradePost).not.toHaveBeenCalled();
    adminPage.unmount();

    history.replaceState(null, "", "/exchange/public-3");
    render(<App />);
    expect(screen.getByLabelText("載入頁面")).toBeInTheDocument();
    expect(
      await screen.findByRole("heading", { name: "公告頁面" }),
    ).toBeInTheDocument();
    expect(routeLoads.tradePost).toHaveBeenCalledTimes(1);
  });
});
