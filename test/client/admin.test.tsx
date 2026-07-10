import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildCatalog } from "../../seed/catalog-def";
import { AddCards } from "../../src/client/admin/AddCards";
import { History } from "../../src/client/admin/History";
import { ManageCards } from "../../src/client/admin/ManageCards";
import { Openings } from "../../src/client/admin/Openings";
import { PendingTrades } from "../../src/client/admin/PendingTrades";

afterEach(() => {
  vi.restoreAllMocks();
  // restoreAllMocks() does not revert vi.stubGlobal("fetch", …); unstub to
  // prevent a stubbed fetch leaking across tests/files (order-dependent flakes).
  vi.unstubAllGlobals();
});

const catalogJson = [
  {
    name: "NEW YEAR",
    volume: 1,
    sortOrder: 0,
    characters: ["Mizuki", "Rei"],
    rarities: ["R", "SR", "SSR", "UR"],
  },
  {
    name: "MP 4TH",
    volume: 2,
    sortOrder: 1,
    characters: ["Mizuki", "KSP"],
    rarities: ["SSR", "UR"],
  },
];

function stubAddCardsFetch(
  postResult: unknown = {
    ids: [101],
    opening: { id: 4, packNumber: 7 },
  },
) {
  return vi.fn(async (url: string, init?: RequestInit) => {
    if (init?.method === "POST" && url === "/api/admin/cards") {
      return { ok: true, json: async () => postResult };
    }
    if (url.includes("catalog")) {
      return { ok: true, json: async () => catalogJson };
    }
    return {
      ok: true,
      json: async () => ({ series: "NEW YEAR", packNumber: 7 }),
    };
  });
}

describe("AddCards", () => {
  it("loads card choices from the catalog and disables an empty pack", async () => {
    vi.stubGlobal("fetch", stubAddCardsFetch());
    render(<AddCards />);

    expect(
      await screen.findByRole("button", { name: "NEW YEAR" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Mizuki" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Koyuki" })).toBeNull();
    expect(
      await screen.findByRole("button", { name: "記錄第 7 包（0 張）" }),
    ).toBeDisabled();
  });

  it("submits exactly one opening per pack and advances the server pack number", async () => {
    const fetchMock = stubAddCardsFetch({
      ids: [101, 102],
      opening: { id: 4, packNumber: 7 },
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<AddCards />);

    await screen.findByRole("button", { name: "記錄第 7 包（0 張）" });
    fireEvent.click(screen.getByRole("button", { name: "Mizuki" }));
    fireEvent.click(screen.getByRole("button", { name: "Mizuki" }));
    fireEvent.change(screen.getByLabelText("開卡日期"), {
      target: { value: "2026-07-10" },
    });
    fireEvent.change(screen.getByLabelText("本包花費 (TWD)"), {
      target: { value: "120" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "記錄第 7 包（2 張）" }),
    );

    await screen.findByText("第 7 包已記錄（2 張）");
    const posts = fetchMock.mock.calls.filter(
      ([url, init]) => url === "/api/admin/cards" && init?.method === "POST",
    );
    expect(posts).toHaveLength(1);
    const body = JSON.parse(posts[0][1]?.body as string);
    expect(body.opening).toEqual({
      series: "NEW YEAR",
      openedAt: "2026-07-10",
      cost: 120,
    });
    expect(body.cards).toEqual([
      {
        series: "NEW YEAR",
        character: "Mizuki",
        rarity: "R",
        source: "pull",
      },
      {
        series: "NEW YEAR",
        character: "Mizuki",
        rarity: "R",
        source: "pull",
      },
    ]);
    expect(
      screen.getByRole("button", { name: "記錄第 8 包（0 張）" }),
    ).toBeDisabled();
  });

  it("increments and removes cards from the current pack tally", async () => {
    vi.stubGlobal("fetch", stubAddCardsFetch());
    render(<AddCards />);

    await screen.findByRole("button", { name: "Rei" });
    fireEvent.click(screen.getByRole("button", { name: "SR" }));
    fireEvent.click(screen.getByRole("button", { name: "Rei" }));
    fireEvent.click(screen.getByRole("button", { name: "Rei" }));
    expect(screen.getByText("×2")).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: "移除 NEW YEAR Rei SR" }),
    );
    expect(screen.getByText("×1")).toBeInTheDocument();
  });

  it("locks the pack series until the current tally is empty", async () => {
    vi.stubGlobal("fetch", stubAddCardsFetch());
    render(<AddCards />);

    await screen.findByRole("button", { name: "Mizuki" });
    fireEvent.click(screen.getByRole("button", { name: "Mizuki" }));
    expect(screen.getByText("×1")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "MP 4TH" })).toBeDisabled();

    fireEvent.click(
      screen.getByRole("button", { name: "移除 NEW YEAR Mizuki R" }),
    );
    expect(screen.getByRole("button", { name: "MP 4TH" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "MP 4TH" }));

    expect(screen.getByText("點上方角色加入本包卡片")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "KSP" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "SSR" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.queryByRole("button", { name: "R" })).toBeNull();
  });

  it("requires a nonnegative purchase price and sends one purchased card without an opening", async () => {
    const fetchMock = stubAddCardsFetch({ ids: [201] });
    vi.stubGlobal("fetch", fetchMock);
    render(<AddCards />);

    await screen.findByRole("radio", { name: "單卡購入" });
    fireEvent.click(screen.getByRole("radio", { name: "單卡購入" }));
    fireEvent.click(screen.getByRole("button", { name: "SR" }));
    fireEvent.click(screen.getByRole("button", { name: "Rei" }));

    const submit = screen.getByRole("button", { name: "記錄購入" });
    expect(submit).toBeDisabled();
    fireEvent.change(screen.getByLabelText("購入價格 (TWD)"), {
      target: { value: "-1" },
    });
    expect(submit).toBeDisabled();
    expect(screen.getByText("購入價格必須為 0 或正數")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("購入價格 (TWD)"), {
      target: { value: "0" },
    });
    expect(submit).toBeEnabled();
    fireEvent.click(submit);

    await screen.findByText("已記錄購入 NEW YEAR Rei SR（0 元）");
    const post = fetchMock.mock.calls.find(
      ([url, init]) => url === "/api/admin/cards" && init?.method === "POST",
    );
    const body = JSON.parse(post?.[1]?.body as string);
    expect(body).not.toHaveProperty("opening");
    expect(body.cards).toEqual([
      {
        series: "NEW YEAR",
        character: "Rei",
        rarity: "SR",
        source: "purchase",
        purchasePrice: 0,
      },
    ]);
  });

  it("still submits when the next-pack preview request fails", async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === "POST") {
        return {
          ok: true,
          json: async () => ({
            ids: [301],
            opening: { id: 9, packNumber: 4 },
          }),
        };
      }
      if (url.includes("catalog")) {
        return { ok: true, json: async () => catalogJson };
      }
      return { ok: false, status: 503, json: async () => ({}) };
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<AddCards />);

    await screen.findByText(/503/);
    fireEvent.click(screen.getByRole("button", { name: "Mizuki" }));
    const submit = screen.getByRole("button", { name: "記錄本包（1 張）" });
    expect(submit).toBeEnabled();
    fireEvent.click(submit);

    await screen.findByText("第 4 包已記錄（1 張）");
    expect(
      fetchMock.mock.calls.some(
        ([url, init]) => url === "/api/admin/cards" && init?.method === "POST",
      ),
    ).toBe(true);
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
        purchasePrice: null,
        askingPrice: null,
        wantInReturn: null,
        note: null,
        duplicate: true,
        reserved: false,
        reservedGive: 0,
      },
    ];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => ({
        ok: true,
        json: async () => (url.includes("catalog") ? catalogJson : rows),
      })),
    );

    render(<ManageCards />);
    const table = await screen.findByRole("table", { name: "卡片群組" });
    fireEvent.click(
      within(table).getByRole("button", {
        name: "展開 KILLER Rei UR，1 張明細",
      }),
    );
    const details = screen.getByRole("table", {
      name: "KILLER Rei UR 實體卡明細",
    });
    const row = within(details).getByText("#1").closest("tr");
    expect(row).not.toBeNull();
    expect(within(row as HTMLElement).getByText("重複")).toBeInTheDocument();

    fireEvent.click(
      within(row as HTMLElement).getByRole("button", { name: "賣出" }),
    );
    expect(screen.getByText("價格 (TWD)")).toBeInTheDocument();
    expect(screen.getByText("對象")).toBeInTheDocument();
  });

  it("shows a 暫定換出 badge only on the allocated physical card", async () => {
    const rows = [
      {
        id: 1,
        series: "KILLER",
        character: "Iruni",
        rarity: "SSR",
        status: "owned",
        source: "pull",
        purchasePrice: null,
        askingPrice: null,
        wantInReturn: null,
        note: null,
        duplicate: false,
        reserved: true,
        reservedGive: 1,
      },
    ];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => ({
        ok: true,
        json: async () => (url.includes("catalog") ? catalogJson : rows),
      })),
    );
    render(<ManageCards />);
    const table = await screen.findByRole("table", { name: "卡片群組" });
    expect(within(table).getByText("暫定換出 1")).toBeInTheDocument();
    fireEvent.click(
      within(table).getByRole("button", {
        name: "展開 KILLER Iruni SSR，1 張明細",
      }),
    );
    const details = screen.getByRole("table", {
      name: "KILLER Iruni SSR 實體卡明細",
    });
    const row = within(details).getByText("#1").closest("tr");
    expect(row).not.toBeNull();
    expect(
      within(row as HTMLElement).getByText("暫定換出"),
    ).toBeInTheDocument();
    expect(within(row as HTMLElement).getByText("已鎖定")).toBeInTheDocument();
  });

  it("hides the 暫定換出 badge on completed rows", async () => {
    const rows = [
      {
        id: 1,
        series: "KILLER",
        character: "Iruni",
        rarity: "SSR",
        status: "traded",
        source: "pull",
        purchasePrice: null,
        askingPrice: null,
        wantInReturn: null,
        note: null,
        duplicate: false,
        reserved: true,
        reservedGive: 1,
      },
    ];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => ({
        ok: true,
        json: async () => (url.includes("catalog") ? catalogJson : rows),
      })),
    );
    render(<ManageCards />);
    await screen.findByText("顯示 0 種卡 · 0 / 1 張");
    const statusFilter = screen.getByRole("radiogroup", {
      name: "狀態篩選",
    });
    fireEvent.click(
      within(statusFilter).getByRole("radio", { name: "已交換" }),
    );
    const table = await screen.findByRole("table", { name: "卡片群組" });
    expect(within(table).getByText("Iruni")).toBeInTheDocument();
    expect(within(table).queryByText("暫定換出")).toBeNull();
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

  it("lists the whole catalog in one 換入 section with 持有/缺/已預定 hints", async () => {
    // sampleReservation receives KILLER Rei SR (owned 0, pending-incoming).
    vi.stubGlobal("fetch", stubFetchFor([sampleReservation]));

    render(<PendingTrades />);
    await waitFor(() =>
      expect(screen.getByText("交換預約")).toBeInTheDocument(),
    );

    // Give side unchanged: surplus only, 餘 hint.
    fireEvent.click(screen.getByRole("button", { name: "＋ 新增給出" }));
    expect(screen.getByText("MP 4TH Mizuki R（餘 1）")).toBeInTheDocument();

    // One unified 換入 list: owned, plain-missing, and already-incoming together.
    fireEvent.click(screen.getByRole("button", { name: "＋ 新增換入" }));
    expect(screen.getByText("MP 4TH Mizuki R（持有 2）")).toBeInTheDocument();
    expect(
      screen.getByText("KILLER Rei SR（缺・已預定換入 1）"),
    ).toBeInTheDocument();
    expect(
      screen.getAllByText(/（缺）$/, { selector: "option" }).length,
    ).toBeGreaterThan(0);
  });

  it("can receive an already-owned card through the unified 換入 list", async () => {
    const fetchMock = stubFetchFor([]);
    vi.stubGlobal("fetch", fetchMock);

    render(<PendingTrades />);
    await waitFor(() =>
      expect(screen.getByText("交換預約")).toBeInTheDocument(),
    );

    fireEvent.click(screen.getByRole("button", { name: "＋ 新增給出" }));
    fireEvent.click(screen.getByRole("button", { name: "＋ 新增換入" }));

    // Pick the owned card MP 4TH Mizuki R (持有 2) in the 換入 dropdown.
    const owned = screen.getByText("MP 4TH Mizuki R（持有 2）");
    const select = owned.closest("select");
    if (select) {
      fireEvent.change(select, {
        target: { value: owned.getAttribute("value") ?? "" },
      });
    }
    fireEvent.click(screen.getByRole("button", { name: "新增預約" }));

    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(
          ([u, init]) =>
            u === "/api/admin/pending-trades" && init?.method === "POST",
        ),
      ).toBe(true),
    );
    const call = fetchMock.mock.calls.find(
      ([u, init]) =>
        u === "/api/admin/pending-trades" && init?.method === "POST",
    );
    const body = JSON.parse(call?.[1]?.body as string);
    expect(body.receive).toContainEqual(
      expect.objectContaining({
        series: "MP 4TH",
        character: "Mizuki",
        rarity: "R",
        qty: 1,
      }),
    );
  });
});

describe("Openings", () => {
  it("renders the cost summary and a monospaced data row", async () => {
    const rows = [
      {
        id: 1,
        packNumber: 12,
        series: "NEW YEAR",
        openedAt: "2026-06-01",
        cost: 600,
        cardCount: 10,
        avgCost: 60,
      },
    ];
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, json: async () => rows })),
    );

    render(<Openings />);

    // Summary line: 1 opening, 600 spent, 600/10 = 60.0 avg per card.
    await waitFor(() => expect(screen.getByText(/共/)).toBeInTheDocument());
    expect(screen.getByText("開卡成本")).toBeInTheDocument();
    // Row cells (the mono columns): date, count, cost, avg-cost.
    expect(screen.getByText("第 12 包")).toBeInTheDocument();
    expect(screen.getByText("2026-06-01")).toBeInTheDocument();
    expect(screen.getByText("NEW YEAR")).toBeInTheDocument();
    expect(screen.getByText("600 元")).toBeInTheDocument();
    expect(screen.getAllByText("60.0 元")).toHaveLength(2);
  });

  it("shows the empty state when there are no openings", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, json: async () => [] })),
    );
    render(<Openings />);
    await waitFor(() =>
      expect(screen.getByText(/尚無開卡紀錄/)).toBeInTheDocument(),
    );
  });

  it("excludes unpriced packs from the known-cost average", async () => {
    const rows = [
      {
        id: 1,
        packNumber: 1,
        series: "NEW YEAR",
        openedAt: "2026-06-01",
        cost: 600,
        cardCount: 10,
        avgCost: 60,
      },
      {
        id: 2,
        packNumber: 2,
        series: "NEW YEAR",
        openedAt: "2026-06-02",
        cost: null,
        cardCount: 10,
        avgCost: null,
      },
    ];
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, json: async () => rows })),
    );

    render(<Openings />);
    const summary = await screen.findByText(/已知成本平均每張/);
    expect(summary).toHaveTextContent("已記成本 1 包");
    expect(summary).toHaveTextContent("60.0 元");
    expect(summary).not.toHaveTextContent("30.0 元");
  });
});

describe("History", () => {
  it("renders the income summary, type pills, rarity pills, and a trade row", async () => {
    const rows = [
      {
        id: 1,
        cardId: 11,
        type: "sale",
        counterparty: "阿明",
        price: 300,
        happenedAt: "2026-06-02",
        series: "KILLER",
        character: "Rei",
        rarity: "SR",
        note: null,
      },
      {
        id: 2,
        cardId: 12,
        type: "trade",
        counterparty: null,
        price: null,
        happenedAt: "2026-06-03",
        series: "NEW YEAR",
        character: "Mizuki",
        rarity: "R",
        note: null,
      },
    ];
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, json: async () => rows })),
    );

    render(<History />);

    await waitFor(() =>
      expect(screen.getByText("交易歷史")).toBeInTheDocument(),
    );
    // Summary: 2 records, sale income = 300.
    expect(screen.getByText(/共/)).toBeInTheDocument();
    // Type pills.
    expect(screen.getByText("賣出")).toBeInTheDocument();
    expect(screen.getByText("交換")).toBeInTheDocument();
    // Rarity pills.
    expect(screen.getByText("SR")).toBeInTheDocument();
    expect(screen.getByText("R")).toBeInTheDocument();
    // Counterparty + the sale price (mono cell); the trade row's null price → —.
    expect(screen.getByText("阿明")).toBeInTheDocument();
    expect(screen.getByText("300 元")).toBeInTheDocument();
  });

  it("shows the empty state when there are no transactions", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, json: async () => [] })),
    );
    render(<History />);
    await waitFor(() =>
      expect(screen.getByText(/尚無成交紀錄/)).toBeInTheDocument(),
    );
  });
});
