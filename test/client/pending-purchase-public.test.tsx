import { render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import PublicViewer from "../../src/client/PublicViewer";
import {
  buildMatrix,
  computeTrade,
  getIncomingPurchaseN,
  getN,
} from "../../src/client/collection";
import { Trade } from "../../src/client/views/Trade";
import { Wishlist } from "../../src/client/views/Wishlist";
import type {
  OverviewResponse,
  PublicPendingPurchase,
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
      held: 0,
      available: 0,
      wantCount: 2,
      incomingTrade: 0,
      incomingPurchase: 2,
    },
    {
      catalogId: 2,
      series: "NEW YEAR",
      volume: 1,
      character: "Rei",
      rarity: "SR",
      owned: 1,
      reserved: 0,
      held: 0,
      available: 1,
      incomingTrade: 0,
      incomingPurchase: 0,
    },
    {
      catalogId: 3,
      series: "NEW YEAR",
      volume: 1,
      character: "Rei",
      rarity: "SSR",
      owned: 0,
      reserved: 0,
      held: 0,
      available: 0,
      wantCount: 1,
      incomingTrade: 0,
      incomingPurchase: 0,
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
  it("uses snapshot inbound quantities without counting them as physically owned", () => {
    expect(getIncomingPurchaseN(matrix, 0, 0, 0)).toBe(2);
    expect(getN(matrix, 0, 0, 0)).toBe(0);
    expect(computeTrade(matrix).needs).toEqual([
      { si: 0, ci: 0, ri: 2, spare: 1 },
    ]);

    const withIncomingTrade = buildMatrix({
      ...overview,
      cells: overview.cells.map((cell) =>
        cell.catalogId === 3 ? { ...cell, incomingTrade: 1 } : cell,
      ),
    });
    expect(computeTrade(withIncomingTrade).needs).toEqual([]);
  });

  it("keeps an ordered card missing while clearly marking its pending quantity", () => {
    render(<Wishlist m={matrix} />);

    expect(screen.getByText(/33% 完成 · 尚缺 2 張/)).toBeInTheDocument();
    expect(screen.getByTitle("預定購入 2 張（待收件）")).toBeInTheDocument();
    expect(screen.getByText("預定購入 ×2")).toBeInTheDocument();
    expect(screen.getByText(/預定購入 2 張（待收件）/)).toBeInTheDocument();
  });

  it("shows a privacy-safe pending list alongside snapshot-derived Wants", () => {
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
      screen.getByRole("button", { name: "全部 找 1 餘 0" }),
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

  it.each(["/api/pending-trades", "/api/pending-purchases"])(
    "keeps snapshot Wants visible when %s fails",
    async (failedPath) => {
      history.replaceState(null, "", "/#trade");
      vi.stubGlobal(
        "fetch",
        vi.fn(async (url: string) => {
          if (url === "/api/overview") {
            return { ok: true, status: 200, json: async () => overview };
          }
          if (url === failedPath) {
            return { ok: false, status: 503, json: async () => ({}) };
          }
          return { ok: true, status: 200, json: async () => [] };
        }),
      );

      render(<PublicViewer />);

      expect(
        await screen.findByRole("button", { name: "全部 找 1 餘 0" }),
      ).toBeInTheDocument();
      expect(
        await screen.findByText(
          failedPath === "/api/pending-trades"
            ? "無法載入暫定交換列表"
            : "無法載入預定購入（待收件）",
        ),
      ).toBeInTheDocument();
    },
  );

  it("does not wait for descriptive pending lists to show complete snapshot Wants", async () => {
    history.replaceState(null, "", "/#trade");
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url === "/api/overview") {
          return { ok: true, status: 200, json: async () => overview };
        }
        return new Promise(() => {});
      }),
    );

    render(<PublicViewer />);

    expect(
      await screen.findByRole("button", { name: "全部 找 1 餘 0" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("載入暫定交換列表")).toBeInTheDocument();
    expect(screen.getByLabelText("載入預定購入（待收件）")).toBeInTheDocument();
  });

  it("does not subtract separately fetched lists that disagree with the snapshot", () => {
    const line = {
      catalogId: 3,
      series: "NEW YEAR",
      character: "Rei",
      rarity: "SSR" as const,
      qty: 5,
    };
    render(
      <Trade
        m={matrix}
        pending={[
          {
            id: 20,
            reservedAt: "2026-07-09",
            give: [],
            receive: [{ ...line, direction: "receive" }],
          },
        ]}
        pendingPurchases={[{ ...pendingPurchases[0], lines: [line] }]}
      />,
    );

    expect(
      screen.getByRole("button", { name: "全部 找 1 餘 0" }),
    ).toBeInTheDocument();
    expect(screen.getByText("暫定交換列表")).toBeInTheDocument();
    expect(screen.getByText("預定購入（待收件）")).toBeInTheDocument();
  });

  it.each(["incomingTrade", "incomingPurchase"] as const)(
    "withholds trade needs when the snapshot lacks %s even if pending lists load",
    async (field) => {
      history.replaceState(null, "", "/#trade");
      vi.stubGlobal(
        "fetch",
        vi.fn(async (url: string) => ({
          ok: true,
          json: async () =>
            url === "/api/overview"
              ? {
                  ...overview,
                  cells: overview.cells.map((cell) => ({
                    ...cell,
                    [field]: undefined,
                  })),
                }
              : [],
        })),
      );

      render(<PublicViewer />);

      expect(await screen.findByText("無法載入待收件資料")).toBeInTheDocument();
      expect(screen.queryByText("想換入")).toBeNull();
      expect(
        screen.queryByRole("button", { name: "複製想換入清單" }),
      ).toBeNull();
    },
  );

  it("withholds purchase badges when the snapshot lacks purchase aggregates", () => {
    const incomplete = buildMatrix({
      ...overview,
      cells: overview.cells.map((cell) => ({
        ...cell,
        incomingPurchase: undefined,
      })),
    });

    render(<Wishlist m={incomplete} />);

    expect(screen.getByText("無法載入待收件資料")).toBeInTheDocument();
    expect(screen.queryByText(/預定購入 ×/)).toBeNull();
  });
});
