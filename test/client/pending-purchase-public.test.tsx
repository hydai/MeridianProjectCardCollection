import { render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import PublicViewer from "../../src/client/PublicViewer";
import {
  buildMatrix,
  computeTradeWithPending,
  pendingPurchaseByCoord,
} from "../../src/client/collection";
import { Trade } from "../../src/client/views/Trade";
import { Wishlist } from "../../src/client/views/Wishlist";
import type {
  OverviewResponse,
  PublicPendingPurchase,
  PublicPendingTrade,
} from "../../src/shared/types";

const overview: OverviewResponse = {
  cells: [
    {
      catalogId: 1,
      series: "NEW YEAR",
      volume: 1,
      character: "Rei",
      rarity: "R",
      owned: 0,
      reserved: 0,
      available: 0,
    },
    {
      catalogId: 2,
      series: "NEW YEAR",
      volume: 1,
      character: "Rei",
      rarity: "SR",
      owned: 1,
      reserved: 0,
      available: 1,
    },
    {
      catalogId: 3,
      series: "NEW YEAR",
      volume: 1,
      character: "Rei",
      rarity: "SSR",
      owned: 0,
      reserved: 0,
      available: 0,
    },
  ],
  progress: [],
};

const matrix = buildMatrix(overview);

const pendingPurchases: PublicPendingPurchase[] = [
  {
    id: 10,
    orderedAt: "2026-07-08",
    lines: [
      {
        catalogId: 1,
        series: "NEW YEAR",
        character: "Rei",
        rarity: "R",
        qty: 2,
      },
    ],
  },
];

afterEach(() => {
  vi.unstubAllGlobals();
  history.replaceState(null, "", "/");
});

describe("public pending purchases", () => {
  it("maps quantities and excludes ordered cards from trade needs", () => {
    expect(pendingPurchaseByCoord(matrix, pendingPurchases)).toEqual(
      new Map([["0|0|0", 2]]),
    );

    const pendingTrades: PublicPendingTrade[] = [
      {
        id: 20,
        reservedAt: "2026-07-09",
        give: [],
        receive: [
          {
            direction: "receive",
            catalogId: 3,
            series: "NEW YEAR",
            character: "Rei",
            rarity: "SSR",
            qty: 1,
          },
        ],
      },
    ];

    const withTradesOnly = computeTradeWithPending(matrix, pendingTrades);
    expect(withTradesOnly.needs).toEqual([{ si: 0, ci: 0, ri: 0, spare: 0 }]);
    expect(
      computeTradeWithPending(matrix, pendingTrades, pendingPurchases).needs,
    ).toEqual([]);
  });

  it("keeps an ordered card missing while clearly marking its pending quantity", () => {
    render(<Wishlist m={matrix} pendingPurchases={pendingPurchases} />);

    expect(screen.getByText(/33% 完成 · 尚缺 2 張/)).toBeInTheDocument();
    expect(screen.getByTitle("預定購入 2 張（待收件）")).toBeInTheDocument();
    expect(screen.getByText("預定購入 ×2")).toBeInTheDocument();
    expect(screen.getByText(/預定購入 2 張（待收件）/)).toBeInTheDocument();
  });

  it("shows a privacy-safe pending list and removes its cards from 想換入", () => {
    const payload = [
      {
        ...pendingPurchases[0],
        seller: "不應公開的賣家",
        note: "不應公開的備註",
        lines: [
          {
            ...pendingPurchases[0].lines[0],
            unitPrice: 999,
          },
        ],
      },
    ];

    render(<Trade m={matrix} pending={[]} pendingPurchases={payload} />);

    expect(
      screen.getByRole("button", { name: "全部 缺 1 餘 0" }),
    ).toBeInTheDocument();
    const needsPanel = screen.getByText("想換入").closest('[data-slot="card"]');
    expect(needsPanel).not.toBeNull();
    expect(within(needsPanel as HTMLElement).queryByText("R")).toBeNull();
    expect(
      within(needsPanel as HTMLElement).getByText("SSR"),
    ).toBeInTheDocument();

    expect(screen.getByText("預定購入（待收件）")).toBeInTheDocument();
    expect(screen.getByText("2026-07-08")).toBeInTheDocument();
    expect(screen.getByText("×2")).toHaveAccessibleName("2 張");
    expect(screen.getByText("NEW YEAR Rei")).toBeInTheDocument();
    expect(screen.queryByText("不應公開的賣家")).toBeNull();
    expect(screen.queryByText("不應公開的備註")).toBeNull();
    expect(screen.queryByText("999")).toBeNull();
  });

  it("withholds trade needs when pending purchase data cannot be verified", async () => {
    history.replaceState(null, "", "/#trade");
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url === "/api/overview") {
          return { ok: true, status: 200, json: async () => overview };
        }
        if (url === "/api/pending-purchases") {
          return { ok: false, status: 503, json: async () => ({}) };
        }
        return { ok: true, status: 200, json: async () => [] };
      }),
    );

    render(<PublicViewer />);

    expect(await screen.findByText("無法載入待收件資料")).toBeInTheDocument();
    expect(screen.queryByText("想換入")).toBeNull();
  });
});
