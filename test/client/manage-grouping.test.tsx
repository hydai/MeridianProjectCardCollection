import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ManageCards } from "../../src/client/admin/ManageCards";
import type { CardRow, CatalogSeries } from "../../src/shared/types";

const catalog: CatalogSeries[] = [
  {
    name: "KILLER",
    volume: 1,
    sortOrder: 0,
    characters: ["Rei"],
    rarities: ["SSR", "UR"],
  },
  {
    name: "OTHER",
    volume: 2,
    sortOrder: 1,
    characters: ["Rei"],
    rarities: ["UR"],
  },
];

function makeCard(id: number, overrides: Partial<CardRow> = {}): CardRow {
  return {
    id,
    series: "KILLER",
    character: "Rei",
    rarity: "UR",
    status: "owned",
    source: "pull",
    purchasePrice: null,
    askingPrice: null,
    wantInReturn: null,
    note: null,
    duplicate: false,
    reserved: false,
    reservedGive: 0,
    ...overrides,
  };
}

function stubCards(rows: CardRow[]) {
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (url === "/api/catalog") {
      return { ok: true, json: async () => catalog };
    }
    if (url === "/api/admin/cards" && !init?.method) {
      return { ok: true, json: async () => rows };
    }
    if (url === "/api/admin/transactions" && init?.method === "POST") {
      return { ok: true, json: async () => ({ id: 99 }) };
    }
    return { ok: true, json: async () => ({ ok: true }) };
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("ManageCards card groups", () => {
  it("groups matching cards and keeps inventory accurate across status filters", async () => {
    stubCards([
      makeCard(1, { duplicate: true }),
      makeCard(2, {
        status: "for_sale",
        source: "purchase",
        purchasePrice: 880,
        duplicate: true,
      }),
      makeCard(3, { status: "sold" }),
      makeCard(4, { rarity: "SSR" }),
      makeCard(5, { series: "OTHER" }),
    ]);

    render(<ManageCards />);
    const groups = await screen.findByRole("table", { name: "卡片群組" });
    expect(screen.getByRole("status")).toHaveTextContent(
      "顯示 3 種卡 · 4 / 5 張",
    );
    expect(
      within(groups).getAllByRole("button", { name: /^展開 / }),
    ).toHaveLength(3);

    const expand = within(groups).getByRole("button", {
      name: "展開 KILLER Rei UR，2 張明細",
    });
    const summaryRow = expand.closest("tr");
    expect(summaryRow).not.toBeNull();
    expect(
      within(summaryRow as HTMLElement).getByLabelText("目前庫存 2 張"),
    ).toBeInTheDocument();
    expect(
      within(summaryRow as HTMLElement).getByText("持有 1"),
    ).toBeInTheDocument();
    expect(
      within(summaryRow as HTMLElement).getByText("待售 1"),
    ).toBeInTheDocument();
    expect(expand).toHaveAttribute("aria-expanded", "false");
    expect(
      screen.queryByRole("table", {
        name: "KILLER Rei UR 實體卡明細",
      }),
    ).toBeNull();

    fireEvent.click(expand);
    expect(expand).toHaveAttribute("aria-expanded", "true");
    let details = screen.getByRole("table", {
      name: "KILLER Rei UR 實體卡明細",
    });
    expect(within(details).getByText("#1")).toBeInTheDocument();
    expect(within(details).getByText("#2")).toBeInTheDocument();
    expect(within(details).queryByText("#3")).toBeNull();

    fireEvent.click(
      within(screen.getByRole("radiogroup", { name: "狀態篩選" })).getByRole(
        "radio",
        { name: "已售出" },
      ),
    );
    expect(screen.getByRole("status")).toHaveTextContent(
      "顯示 1 種卡 · 1 / 5 張",
    );
    const soldExpand = within(groups).getByRole("button", {
      name: "展開 KILLER Rei UR，1 張明細",
    });
    expect(
      within(soldExpand.closest("tr") as HTMLElement).getByLabelText(
        "目前庫存 2 張",
      ),
    ).toBeInTheDocument();
    fireEvent.click(soldExpand);
    details = screen.getByRole("table", {
      name: "KILLER Rei UR 實體卡明細",
    });
    expect(within(details).getByText("#3")).toBeInTheDocument();
    expect(within(details).queryByText("#1")).toBeNull();
    expect(within(details).queryByText("#2")).toBeNull();
  });

  it("clears an open form on collapse and submits the selected physical card", async () => {
    const fetchMock = stubCards([
      makeCard(10),
      makeCard(11, { source: "purchase", purchasePrice: 880 }),
    ]);

    render(<ManageCards />);
    const groups = await screen.findByRole("table", { name: "卡片群組" });
    fireEvent.click(
      within(groups).getByRole("button", {
        name: "展開 KILLER Rei UR，2 張明細",
      }),
    );
    let details = screen.getByRole("table", {
      name: "KILLER Rei UR 實體卡明細",
    });
    const firstRow = within(details).getByText("#10").closest("tr");
    fireEvent.click(
      within(firstRow as HTMLElement).getByRole("button", { name: "賣出" }),
    );
    expect(screen.getByText("價格 (TWD)")).toBeInTheDocument();

    fireEvent.click(
      within(groups).getByRole("button", {
        name: "收合 KILLER Rei UR，2 張明細",
      }),
    );
    expect(screen.queryByText("價格 (TWD)")).toBeNull();
    expect(
      screen.queryByRole("table", {
        name: "KILLER Rei UR 實體卡明細",
      }),
    ).toBeNull();

    fireEvent.click(
      within(groups).getByRole("button", {
        name: "展開 KILLER Rei UR，2 張明細",
      }),
    );
    details = screen.getByRole("table", {
      name: "KILLER Rei UR 實體卡明細",
    });
    const purchasedRow = within(details).getByText("#11").closest("tr");
    fireEvent.click(
      within(purchasedRow as HTMLElement).getByRole("button", {
        name: "賣出",
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "確認" }));

    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some(
          ([url, init]) =>
            url === "/api/admin/transactions" && init?.method === "POST",
        ),
      ).toBe(true);
    });
    const transactionCall = fetchMock.mock.calls.find(
      ([url, init]) =>
        url === "/api/admin/transactions" && init?.method === "POST",
    );
    expect(JSON.parse(transactionCall?.[1]?.body as string)).toMatchObject({
      cardId: 11,
      type: "sale",
    });
  });

  it("counts and locks only the reserved physical copy", async () => {
    stubCards([
      makeCard(21, { reserved: true, reservedGive: 1, duplicate: true }),
      makeCard(22, { reservedGive: 1, duplicate: true }),
    ]);

    render(<ManageCards />);
    const groups = await screen.findByRole("table", { name: "卡片群組" });
    expect(within(groups).getByText("暫定換出 1")).toBeInTheDocument();
    expect(within(groups).queryByText("暫定換出 2")).toBeNull();

    fireEvent.click(
      within(groups).getByRole("button", {
        name: "展開 KILLER Rei UR，2 張明細",
      }),
    );
    const details = screen.getByRole("table", {
      name: "KILLER Rei UR 實體卡明細",
    });
    const reservedRow = within(details).getByText("#21").closest("tr");
    const availableRow = within(details).getByText("#22").closest("tr");
    expect(
      within(reservedRow as HTMLElement).getByText("已鎖定"),
    ).toBeInTheDocument();
    expect(
      within(reservedRow as HTMLElement).queryByRole("button", {
        name: "賣出",
      }),
    ).toBeNull();
    expect(
      within(availableRow as HTMLElement).getByRole("button", {
        name: "賣出",
      }),
    ).toBeInTheDocument();
  });
});
