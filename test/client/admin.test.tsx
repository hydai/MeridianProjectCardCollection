import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildCatalog } from "../../seed/catalog-def";
import { AddCards } from "../../src/client/admin/AddCards";
import { ManageCards } from "../../src/client/admin/ManageCards";
import { PendingTrades } from "../../src/client/admin/PendingTrades";

afterEach(() => vi.restoreAllMocks());

describe("AddCards", () => {
  it("submits added cards via POST /api/admin/cards", async () => {
    const fetchMock = vi.fn(async (_url: string, _init: RequestInit) => ({
      ok: true,
      json: async () => ({ ids: [101] }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    render(<AddCards />);
    fireEvent.click(screen.getByRole("button", { name: /新增 1 張/ }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/admin/cards");
    expect(init.method).toBe("POST");
    const body = JSON.parse(init.body as string);
    expect(body.cards).toHaveLength(1);
    expect(body.cards[0]).toMatchObject({ series: "NEW YEAR", rarity: "R" });

    await waitFor(() =>
      expect(screen.getByText(/已新增 1 張/)).toBeInTheDocument(),
    );
  });
});

describe("ManageCards", () => {
  it("lists fetched cards, flags duplicates, and opens a sell form", async () => {
    const rows = [
      {
        id: 1,
        series: "KILLER",
        character: "Rei",
        rarity: "UR",
        status: "owned",
        source: "pull",
        askingPrice: null,
        wantInReturn: null,
        note: null,
        duplicate: true,
      },
    ];
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, json: async () => rows })),
    );

    render(<ManageCards />);
    await waitFor(() => expect(screen.getByText("Rei")).toBeInTheDocument());
    expect(screen.getByText("重複")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "賣出" }));
    expect(screen.getByText("價格 (TWD)")).toBeInTheDocument();
    expect(screen.getByText("對象")).toBeInTheDocument();
  });
});

// Overview where every type is missing except two duplicates we can give away.
const overviewJson = () => ({
  cells: buildCatalog().map((c, i) => ({
    catalogId: i + 1,
    series: c.series,
    character: c.character,
    rarity: c.rarity,
    owned:
      c.series === "MP 4TH" && c.character === "Mizuki" && c.rarity === "R"
        ? 2
        : 0,
  })),
  progress: [],
});

function stubFetchFor(pending: unknown[]) {
  return vi.fn(async (url: string, _init?: RequestInit) => {
    if (url === "/api/overview")
      return { ok: true, json: async () => overviewJson() };
    if (url === "/api/admin/pending-trades")
      return { ok: true, json: async () => pending };
    return { ok: true, json: async () => ({ ok: true }) };
  });
}

describe("PendingTrades", () => {
  it("renders the form and an existing reservation with 完成/取消", async () => {
    const pending = [
      {
        id: 9,
        reservedAt: "2026-06-27",
        counterparty: "阿明",
        note: "面交",
        give: [
          {
            direction: "give",
            catalogId: 5,
            series: "MP 4TH",
            character: "Mizuki",
            rarity: "R",
            qty: 1,
          },
        ],
        receive: [
          {
            direction: "receive",
            catalogId: 6,
            series: "KILLER",
            character: "Rei",
            rarity: "SR",
            qty: 1,
          },
        ],
      },
    ];
    vi.stubGlobal("fetch", stubFetchFor(pending));

    render(<PendingTrades />);
    await waitFor(() =>
      expect(screen.getByText("交換預約")).toBeInTheDocument(),
    );
    expect(screen.getByText("阿明")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "完成" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "取消" })).toBeInTheDocument();
  });
});
