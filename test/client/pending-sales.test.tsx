import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import Admin from "../../src/client/admin/Admin";
import { PendingSales } from "../../src/client/admin/PendingSales";
import { MarketBoard } from "../../src/client/views/Market";
import type {
  AdminPendingSale,
  CardRow,
  CreateSaleReservationInput,
  MarketListing,
  OverviewResponse,
} from "../../src/shared/types";

const card = (id: number, changes: Partial<CardRow> = {}): CardRow => ({
  id,
  series: "KILLER",
  character: "Rei",
  rarity: "SR",
  status: "for_sale",
  source: "pull",
  purchasePrice: null,
  askingPrice: 50,
  wantInReturn: null,
  note: null,
  duplicate: true,
  reserved: false,
  reservedGive: 0,
  held: false,
  ...changes,
});
const cards = [
  card(1),
  card(2),
  card(3, { character: "Kirali", rarity: "SSR", askingPrice: 200 }),
  card(4, { reserved: true }),
  card(5, { held: true }),
  card(6, { status: "owned" }),
];
const overview: OverviewResponse = {
  progress: [],
  cells: [
    {
      catalogId: 11,
      series: "KILLER",
      character: "Rei",
      rarity: "SR",
      volume: 1,
      owned: 5,
      reserved: 1,
      held: 1,
      available: 3,
    },
    {
      catalogId: 12,
      series: "KILLER",
      character: "Kirali",
      rarity: "SSR",
      volume: 1,
      owned: 1,
      reserved: 0,
      held: 0,
      available: 1,
    },
  ],
};
const pending: AdminPendingSale = {
  id: 7,
  counterparty: "買家甲",
  reservedAt: "2026-09-11",
  note: "週末面交",
  amount: 81,
  cards: [1, 2].map((cardId) => ({
    cardId,
    catalogId: 11,
    series: "KILLER",
    character: "Rei",
    rarity: "SR",
    unitPrice: 40.5,
  })),
};
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  history.replaceState(null, "", "/");
});

function mockApi(initial: AdminPendingSale[] = []) {
  let reservations = structuredClone(initial);
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (url === "/api/overview") return Response.json(overview);
    if (url.startsWith("/api/admin/cards")) return Response.json(cards);
    if (url === "/api/admin/pending-sales" && !init?.method)
      return Response.json(reservations);
    if (url === "/api/admin/pending-sales" && init?.method === "POST") {
      const input = JSON.parse(String(init.body)) as CreateSaleReservationInput;
      reservations = [
        {
          ...pending,
          counterparty: input.counterparty ?? null,
          note: input.note ?? null,
          reservedAt: input.reservedAt,
          amount: input.cards.reduce((total, c) => total + c.unitPrice, 0),
          cards: input.cards.map((c) => ({
            ...c,
            series: "KILLER",
            character: c.catalogId === 11 ? "Rei" : "Kirali",
            rarity: c.catalogId === 11 ? "SR" : "SSR",
          })),
        },
      ];
      return Response.json({ id: 7 });
    }
    if (url.startsWith("/api/admin/pending-sales/7")) {
      reservations = [];
      return Response.json({ ok: true });
    }
    throw new Error(`unexpected URL ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("pending sales workflow", () => {
  it("combines quantities across searched card types, uses agreed prices and excludes locked copies", async () => {
    const fetchMock = mockApi();
    render(<PendingSales />);
    const qty = await screen.findByRole("spinbutton", {
      name: "KILLER · Rei · SR 預約張數",
    });
    expect(qty).toHaveAttribute("max", "2");
    fireEvent.change(qty, { target: { value: "2" } });
    fireEvent.change(
      screen.getByRole("spinbutton", { name: "KILLER · Rei · SR 約定單價" }),
      { target: { value: "40.5" } },
    );
    fireEvent.change(screen.getByLabelText("買家（選填）"), {
      target: { value: "買家乙" },
    });
    fireEvent.change(screen.getByLabelText("預約日期"), {
      target: { value: "2026-09-11" },
    });
    fireEvent.change(screen.getByLabelText("尋找待售卡片"), {
      target: { value: "Kirali" },
    });
    expect(
      screen.queryByRole("spinbutton", { name: "KILLER · Rei · SR 預約張數" }),
    ).toBeNull();
    fireEvent.change(
      screen.getByRole("spinbutton", {
        name: "KILLER · Kirali · SSR 預約張數",
      }),
      { target: { value: "1" } },
    );
    expect(screen.getByText("已選 3 張 · 約定總額 281 元")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "建立出售預約" }));
    await screen.findByText("交易中 · 1 筆");
    const post = fetchMock.mock.calls.find(
      ([url, init]) =>
        url === "/api/admin/pending-sales" && init?.method === "POST",
    );
    expect(JSON.parse(String(post?.[1]?.body))).toMatchObject({
      counterparty: "買家乙",
      reservedAt: "2026-09-11",
      cards: [
        { cardId: 1, catalogId: 11, unitPrice: 40.5 },
        { cardId: 2, catalogId: 11, unitPrice: 40.5 },
        { cardId: 3, catalogId: 12, unitPrice: 200 },
      ],
    });
  });

  it.each(["complete", "cancel"] as const)(
    "confirms the %s action before changing inventory and refreshes the pending list",
    async (action) => {
      const fetchMock = mockApi([pending]);
      render(<PendingSales />);
      await screen.findByText("買家甲");
      const list = within(
        screen.getByRole("region", { name: "進行中的出售預約" }),
      );
      expect(list.getByText("2 張 × 40.5 元")).toBeInTheDocument();
      fireEvent.click(
        list.getByRole("button", {
          name: action === "complete" ? "完成出售" : "取消預約",
        }),
      );
      expect(
        fetchMock.mock.calls.filter(([, init]) => init?.method),
      ).toHaveLength(0);
      if (action === "complete")
        fireEvent.change(screen.getByLabelText("成交日期"), {
          target: { value: "2026-09-12" },
        });
      fireEvent.click(
        list.getByRole("button", {
          name: action === "complete" ? "確認完成出售" : "確認取消預約",
        }),
      );
      await screen.findByText("目前沒有進行中的出售預約。");
      const mutation = fetchMock.mock.calls.find(([, init]) => init?.method);
      expect(mutation?.[0]).toBe(
        action === "complete"
          ? "/api/admin/pending-sales/7/complete"
          : "/api/admin/pending-sales/7",
      );
      expect(mutation?.[1]?.method).toBe(
        action === "complete" ? "POST" : "DELETE",
      );
      if (action === "complete")
        expect(JSON.parse(String(mutation?.[1]?.body))).toEqual({
          happenedAt: "2026-09-12",
        });
    },
  );

  it("prevents duplicate submissions and preserves the draft when a reservation conflicts", async () => {
    const fetchMock = mockApi();
    render(<PendingSales />);
    fireEvent.change(
      await screen.findByRole("spinbutton", {
        name: "KILLER · Rei · SR 預約張數",
      }),
      { target: { value: "1" } },
    );
    let resolve!: (response: Response) => void;
    fetchMock.mockImplementationOnce(
      () =>
        new Promise<Response>((done) => {
          resolve = done;
        }),
    );
    const submit = screen.getByRole("button", { name: "建立出售預約" });
    fireEvent.click(submit);
    fireEvent.click(submit);
    expect(
      fetchMock.mock.calls.filter(([, init]) => init?.method === "POST"),
    ).toHaveLength(1);
    await act(async () =>
      resolve(
        Response.json({ error: "卡片已被其他預約鎖定" }, { status: 409 }),
      ),
    );
    await screen.findByText("卡片已被其他預約鎖定");
    expect(
      screen.getByRole("spinbutton", { name: "KILLER · Rei · SR 預約張數" }),
    ).toHaveValue(1);
    expect(screen.getByRole("button", { name: "建立出售預約" })).toBeEnabled();
  });

  it("opens sale reservations directly from the admin navigation", async () => {
    mockApi();
    history.replaceState(null, "", "/admin#sales");
    render(<Admin />);
    expect(screen.getByRole("tab", { name: "出售預約" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await screen.findByLabelText("買家（選填）");
  });

  it("labels reserved sale copies separately from trades and removes completed copies from the market", () => {
    const listings: MarketListing[] = [1, 2, 3, 4].map((cardId) => ({
      cardId,
      series: "KILLER",
      character: "Rei",
      rarity: "SR",
      status: "for_sale",
      askingPrice: 50,
      wantInReturn: null,
      note: null,
      reserved: cardId < 3,
      reservationType: cardId < 3 ? "sale" : null,
    }));
    const view = render(<MarketBoard listings={listings} />);
    expect(screen.getByText("可售 2 張")).toBeInTheDocument();
    expect(screen.getByText("預約出售 2 張")).toBeInTheDocument();
    expect(screen.queryByText("暫定交換中")).toBeNull();
    view.rerender(<MarketBoard listings={listings.slice(0, 2)} />);
    expect(screen.getByText("全數預約中")).toBeInTheDocument();
    view.rerender(<MarketBoard listings={listings.slice(2)} />);
    expect(screen.queryByText("預約出售 2 張")).toBeNull();
    expect(screen.getByRole("listitem")).toHaveTextContent("數量 2 張");
  });
});
