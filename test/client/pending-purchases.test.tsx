import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import Admin from "../../src/client/admin/Admin";
import { PendingPurchases } from "../../src/client/admin/PendingPurchases";
import type {
  AdminPendingPurchase,
  CatalogSeries,
} from "../../src/shared/types";

const catalog: CatalogSeries[] = [
  {
    name: "NEW YEAR",
    volume: 1,
    sortOrder: 0,
    characters: ["Mizuki", "Rei"],
    rarities: ["R", "SR"],
  },
  {
    name: "MP 4TH",
    volume: 2,
    sortOrder: 1,
    characters: ["KSP"],
    rarities: ["SSR", "UR"],
  },
];

const pending: AdminPendingPurchase[] = [
  {
    id: 7,
    seller: "Card Shop",
    orderedAt: "2026-07-08",
    note: "超商取貨",
    lines: [
      {
        catalogId: 11,
        series: "NEW YEAR",
        character: "Mizuki",
        rarity: "SR",
        qty: 2,
        unitPrice: 120,
      },
      {
        catalogId: 29,
        series: "MP 4TH",
        character: "KSP",
        rarity: "UR",
        qty: 1,
        unitPrice: 260,
      },
    ],
  },
];

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function stubFetch(initialPending: AdminPendingPurchase[] = pending) {
  let current = initialPending;
  return vi.fn(async (url: string, init?: RequestInit) => {
    if (url === "/api/admin/trade-posts" || url === "/api/trade-posts") {
      return { ok: true, json: async () => [] };
    }
    if (url === "/api/admin/trade-posts/candidates") {
      return { ok: true, json: async () => ({ give: [], want: [] }) };
    }
    if (url === "/api/catalog") {
      return { ok: true, json: async () => catalog };
    }
    if (url === "/api/admin/pending-purchases" && !init?.method) {
      return { ok: true, json: async () => current };
    }
    if (url === "/api/admin/pending-purchases" && init?.method === "POST") {
      return { ok: true, json: async () => ({ id: 9 }) };
    }
    const idMatch = url.match(/^\/api\/admin\/pending-purchases\/(\d+)/);
    if (idMatch && (init?.method === "POST" || init?.method === "DELETE")) {
      current = current.filter(
        (purchase) => purchase.id !== Number(idMatch[1]),
      );
      return { ok: true, json: async () => ({ ok: true }) };
    }
    return { ok: true, json: async () => ({ packNumber: 1 }) };
  });
}

describe("PendingPurchases", () => {
  it("is grouped under the admin trade section", () => {
    vi.stubGlobal("fetch", stubFetch([]));
    render(<Admin />);

    fireEvent.click(screen.getByRole("button", { name: /交易 進行中的約定/ }));
    expect(screen.getByRole("tab", { name: "購入預約" })).toBeInTheDocument();
  });

  it("shows pending cards, their total, and that they are not received yet", async () => {
    vi.stubGlobal("fetch", stubFetch());
    render(<PendingPurchases />);

    const table = await screen.findByRole("table");
    const row = within(table).getByText("Card Shop").closest("tr");
    expect(row).not.toBeNull();
    expect(within(row as HTMLElement).getByText("待收件")).toBeInTheDocument();
    expect(within(row as HTMLElement).getByText("500 元")).toBeInTheDocument();
    expect(
      within(row as HTMLElement).getByText(/NEW YEAR Mizuki SR×2/),
    ).toBeInTheDocument();
    expect(screen.getByText(/預約中的卡片不會計入收藏/)).toBeInTheDocument();
  });

  it("creates a multi-card purchase reservation without adding inventory", async () => {
    const fetchMock = stubFetch([]);
    vi.stubGlobal("fetch", fetchMock);
    render(<PendingPurchases />);

    await screen.findByText("目前沒有待收件的購入預約。");
    fireEvent.change(screen.getByLabelText("賣家"), {
      target: { value: "  Seller A  " },
    });
    fireEvent.change(screen.getByLabelText("訂購日期"), {
      target: { value: "2026-07-09" },
    });
    fireEvent.change(screen.getByLabelText("備註"), {
      target: { value: "  等通知  " },
    });

    fireEvent.click(screen.getByRole("button", { name: /新增卡片/ }));
    const firstLine = screen.getByRole("group", { name: "卡片 1" });
    fireEvent.change(within(firstLine).getByLabelText("系列"), {
      target: { value: "MP 4TH" },
    });
    fireEvent.change(within(firstLine).getByLabelText("稀有度"), {
      target: { value: "UR" },
    });
    fireEvent.change(within(firstLine).getByLabelText("數量"), {
      target: { value: "2" },
    });
    fireEvent.change(within(firstLine).getByLabelText("單價 (TWD)"), {
      target: { value: "125.5" },
    });

    fireEvent.click(screen.getByRole("button", { name: /新增卡片/ }));
    const secondLine = screen.getByRole("group", { name: "卡片 2" });
    fireEvent.change(within(secondLine).getByLabelText("角色"), {
      target: { value: "Rei" },
    });
    fireEvent.change(within(secondLine).getByLabelText("單價 (TWD)"), {
      target: { value: "80" },
    });

    const submit = screen.getByRole("button", { name: "新增購入預約" });
    expect(submit).toBeEnabled();
    fireEvent.click(submit);

    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(
          ([url, init]) =>
            url === "/api/admin/pending-purchases" && init?.method === "POST",
        ),
      ).toBe(true),
    );
    const createCall = fetchMock.mock.calls.find(
      ([url, init]) =>
        url === "/api/admin/pending-purchases" && init?.method === "POST",
    );
    expect(JSON.parse(createCall?.[1]?.body as string)).toEqual({
      seller: "Seller A",
      orderedAt: "2026-07-09",
      note: "等通知",
      lines: [
        {
          series: "MP 4TH",
          character: "KSP",
          rarity: "UR",
          qty: 2,
          unitPrice: 125.5,
        },
        {
          series: "NEW YEAR",
          character: "Rei",
          rarity: "R",
          qty: 1,
          unitPrice: 80,
        },
      ],
    });
    expect(
      fetchMock.mock.calls.some(([url]) => url === "/api/admin/cards"),
    ).toBe(false);
  });

  it("confirms receipt with an empty body and removes the completed row", async () => {
    const fetchMock = stubFetch();
    vi.stubGlobal("fetch", fetchMock);
    render(<PendingPurchases />);

    const table = await screen.findByRole("table");
    const receiptTrigger = within(table).getByRole("button", {
      name: "確認收貨",
    });
    receiptTrigger.focus();
    fireEvent.click(receiptTrigger);
    expect(screen.getByText(/確認已收到 3 張卡片/)).toBeInTheDocument();
    expect(screen.getByText("Card Shop")).toBeInTheDocument();
    const confirmReceipt = within(table).getByRole("button", {
      name: "確定收貨",
    });
    expect(confirmReceipt).toHaveFocus();
    fireEvent.click(confirmReceipt);

    await screen.findByText("目前沒有待收件的購入預約。");
    const completeCall = fetchMock.mock.calls.find(
      ([url, init]) =>
        url === "/api/admin/pending-purchases/7/complete" &&
        init?.method === "POST",
    );
    expect(completeCall).toBeDefined();
    expect(JSON.parse(completeCall?.[1]?.body as string)).toEqual({});
  });

  it("can cancel a reservation without creating cards", async () => {
    const fetchMock = stubFetch();
    vi.stubGlobal("fetch", fetchMock);
    render(<PendingPurchases />);

    const table = await screen.findByRole("table");
    const cancelTrigger = within(table).getByRole("button", {
      name: "取消預約",
    });
    cancelTrigger.focus();
    fireEvent.click(cancelTrigger);
    expect(screen.getByText("確認取消這筆購入預約？")).toBeInTheDocument();
    expect(
      within(table).getByRole("button", { name: "確定取消" }),
    ).toHaveFocus();
    fireEvent.click(within(table).getByRole("button", { name: "返回" }));
    const restoredCancelTrigger = within(table).getByRole("button", {
      name: "取消預約",
    });
    expect(restoredCancelTrigger).toHaveFocus();
    fireEvent.click(restoredCancelTrigger);
    fireEvent.click(within(table).getByRole("button", { name: "確定取消" }));

    await screen.findByText("目前沒有待收件的購入預約。");
    expect(
      fetchMock.mock.calls.some(
        ([url, init]) =>
          url === "/api/admin/pending-purchases/7" && init?.method === "DELETE",
      ),
    ).toBe(true);
    expect(
      fetchMock.mock.calls.some(([url]) => url === "/api/admin/cards"),
    ).toBe(false);
  });
});
