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

  it("shows a 預約中 badge for cards whose type has a pending give", async () => {
    const rows = [
      {
        id: 1,
        series: "KILLER",
        character: "Iruni",
        rarity: "SSR",
        status: "owned",
        source: "pull",
        askingPrice: null,
        wantInReturn: null,
        note: null,
        duplicate: false,
        reservedGive: 1,
      },
    ];
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, json: async () => rows })),
    );
    render(<ManageCards />);
    await waitFor(() => expect(screen.getByText("Iruni")).toBeInTheDocument());
    expect(screen.getByText(/預約中/)).toBeInTheDocument();
  });

  it("hides the 預約中 badge on a sold/traded row even when its type is reserved", async () => {
    const rows = [
      {
        id: 1,
        series: "KILLER",
        character: "Iruni",
        rarity: "SSR",
        status: "traded",
        source: "pull",
        askingPrice: null,
        wantInReturn: null,
        note: null,
        duplicate: false,
        reservedGive: 1,
      },
    ];
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, json: async () => rows })),
    );
    render(<ManageCards />);
    await waitFor(() => expect(screen.getByText("Iruni")).toBeInTheDocument());
    expect(screen.queryByText(/預約中/)).toBeNull();
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

const sampleReservation = {
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
};

describe("PendingTrades", () => {
  it("renders the form and an existing reservation with 完成/取消", async () => {
    vi.stubGlobal("fetch", stubFetchFor([sampleReservation]));

    render(<PendingTrades />);
    await waitFor(() =>
      expect(screen.getByText("交換預約")).toBeInTheDocument(),
    );
    expect(screen.getByText("阿明")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "完成" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "取消" })).toBeInTheDocument();
  });

  it("completing a reservation POSTs to /complete", async () => {
    const fetchMock = stubFetchFor([sampleReservation]);
    vi.stubGlobal("fetch", fetchMock);

    render(<PendingTrades />);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "完成" })).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByRole("button", { name: "完成" }));
    fireEvent.click(screen.getByRole("button", { name: "確認完成" }));

    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(([u]) =>
          u.endsWith("/api/admin/pending-trades/9/complete"),
        ),
      ).toBe(true),
    );
    const call = fetchMock.mock.calls.find(([u]) =>
      u.endsWith("/api/admin/pending-trades/9/complete"),
    );
    expect(call?.[1]?.method).toBe("POST");
  });

  it("cancelling a reservation sends DELETE", async () => {
    const fetchMock = stubFetchFor([sampleReservation]);
    vi.stubGlobal("fetch", fetchMock);

    render(<PendingTrades />);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "取消" })).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByRole("button", { name: "取消" }));

    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(([u]) =>
          u.endsWith("/api/admin/pending-trades/9"),
        ),
      ).toBe(true),
    );
    const call = fetchMock.mock.calls.find(([u]) =>
      u.endsWith("/api/admin/pending-trades/9"),
    );
    expect(call?.[1]?.method).toBe("DELETE");
  });

  it("surfaces a failed completion (Fix 1)", async () => {
    const fetchMock = vi.fn(async (url: string, _init?: RequestInit) => {
      if (url === "/api/overview")
        return { ok: true, json: async () => overviewJson() };
      if (url === "/api/admin/pending-trades")
        return { ok: true, json: async () => [sampleReservation] };
      if (url.endsWith("/api/admin/pending-trades/9/complete"))
        return { ok: false, status: 500, json: async () => ({}) };
      return { ok: true, json: async () => ({ ok: true }) };
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<PendingTrades />);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "完成" })).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByRole("button", { name: "完成" }));
    fireEvent.click(screen.getByRole("button", { name: "確認完成" }));

    expect(await screen.findByText(/500/)).toBeInTheDocument();
  });
});
