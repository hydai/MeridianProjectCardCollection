import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildCatalog } from "../../seed/catalog-def";
import { AddCards } from "../../src/client/admin/AddCards";
import { History } from "../../src/client/admin/History";
import { ManageCards } from "../../src/client/admin/ManageCards";
import { Openings } from "../../src/client/admin/Openings";
import { PendingTrades } from "../../src/client/admin/PendingTrades";

beforeEach(() => sessionStorage.clear());

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
    name: "BUNNY GIRL",
    volume: 1,
    sortOrder: 1,
    characters: ["Rei", "Koyuki"],
    rarities: ["R", "SR", "SSR", "UR"],
  },
  {
    name: "MP 4TH",
    volume: 2,
    sortOrder: 2,
    characters: ["Mizuki", "KSP"],
    rarities: ["SSR", "UR"],
  },
];

function stubAddCardsFetch(
  postResult: unknown = {
    ids: [101],
    opening: { id: 4, volume: 1, packNumber: 7 },
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
      json: async () => ({ volume: 1, packNumber: 7 }),
    };
  });
}

describe("AddCards", () => {
  it("renders a cross-series quantity matrix and disables an empty batch", async () => {
    vi.stubGlobal("fetch", stubAddCardsFetch());
    render(<AddCards />);

    const matrix = await screen.findByRole("table", {
      name: "第 1 彈 R 批次入藏矩陣",
    });
    expect(
      within(matrix).getByRole("columnheader", { name: "NEW YEAR" }),
    ).toBeInTheDocument();
    expect(
      within(matrix).getByRole("columnheader", { name: "BUNNY GIRL" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("NEW YEAR Mizuki R 數量")).toBeInTheDocument();
    expect(
      screen.getByLabelText("BUNNY GIRL Koyuki R 數量"),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText("BUNNY GIRL Mizuki R 數量")).toBeNull();
    expect(
      screen.getByRole("button", { name: "檢查本次入藏（0 張）" }),
    ).toBeDisabled();
  });

  it("reviews and submits one mixed-series opening, then advances the pack number", async () => {
    const fetchMock = stubAddCardsFetch({
      ids: [101, 102, 103],
      opening: { id: 4, volume: 1, packNumber: 7 },
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<AddCards />);

    fireEvent.change(await screen.findByLabelText("NEW YEAR Mizuki R 數量"), {
      target: { value: "2" },
    });
    fireEvent.click(screen.getByRole("radio", { name: /^SR/ }));
    fireEvent.change(screen.getByLabelText("BUNNY GIRL Rei SR 數量"), {
      target: { value: "1" },
    });
    fireEvent.change(screen.getByLabelText("開卡日期"), {
      target: { value: "2026-07-10" },
    });
    fireEvent.change(screen.getByLabelText("本包花費 (TWD)"), {
      target: { value: "120" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "檢查本次入藏（3 張）" }),
    );

    const reviewHeading = await screen.findByRole("heading", {
      name: "確認本次入藏",
    });
    expect(reviewHeading).toHaveFocus();
    expect(
      screen.getByRole("table", { name: "本次批次入藏明細" }),
    ).toBeInTheDocument();
    expect(
      fetchMock.mock.calls.filter(
        ([url, init]) => url === "/api/admin/cards" && init?.method === "POST",
      ),
    ).toHaveLength(0);

    fireEvent.click(screen.getByRole("button", { name: "返回修改" }));
    expect(screen.getByLabelText("BUNNY GIRL Rei SR 數量")).toHaveValue(1);
    expect(
      screen.getByRole("button", { name: "檢查本次入藏（3 張）" }),
    ).toHaveFocus();
    fireEvent.click(
      screen.getByRole("button", { name: "檢查本次入藏（3 張）" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "確認寫入 3 張" }));

    await screen.findByText("第 1 彈第 7 包已記錄（3 張）");
    const posts = fetchMock.mock.calls.filter(
      ([url, init]) => url === "/api/admin/cards" && init?.method === "POST",
    );
    expect(posts).toHaveLength(1);
    const body = JSON.parse(posts[0][1]?.body as string);
    expect(body.opening).toEqual({
      volume: 1,
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
      {
        series: "BUNNY GIRL",
        character: "Rei",
        rarity: "SR",
        source: "pull",
      },
    ]);
    expect(
      screen.getByRole("button", { name: "檢查本次入藏（0 張）" }),
    ).toBeDisabled();
    expect(screen.getByText("第 1 彈 · 第 8 包")).toBeInTheDocument();
  });

  it("preserves quantities across rarity tabs and locks source and volume", async () => {
    vi.stubGlobal("fetch", stubAddCardsFetch());
    render(<AddCards />);

    await screen.findByLabelText("NEW YEAR Mizuki R 數量");
    fireEvent.click(screen.getByRole("radio", { name: /^SR/ }));
    fireEvent.change(screen.getByLabelText("NEW YEAR Rei SR 數量"), {
      target: { value: "2" },
    });
    expect(screen.getByRole("radio", { name: "SR，已選 2 張" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "已收購入" })).toBeDisabled();
    expect(screen.getByRole("radio", { name: "第 2 彈" })).toBeDisabled();

    fireEvent.click(screen.getByRole("radio", { name: /^R，/ }));
    fireEvent.click(screen.getByRole("radio", { name: /^SR/ }));
    expect(screen.getByLabelText("NEW YEAR Rei SR 數量")).toHaveValue(2);

    fireEvent.click(screen.getByRole("button", { name: "清空草稿" }));
    expect(screen.getByRole("radio", { name: "已收購入" })).toBeEnabled();
    expect(screen.getByRole("radio", { name: "第 2 彈" })).toBeEnabled();
    fireEvent.click(screen.getByRole("radio", { name: "第 2 彈" }));

    expect(
      await screen.findByRole("table", {
        name: "第 2 彈 SSR 批次入藏矩陣",
      }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("MP 4TH KSP SSR 數量")).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /^SSR/ })).toBeChecked();
    expect(
      screen.queryByRole("radio", { name: /^R，/ }),
    ).not.toBeInTheDocument();
  });

  it("caps each cell at 99 cards and the whole batch at 100", async () => {
    vi.stubGlobal("fetch", stubAddCardsFetch());
    render(<AddCards />);

    const first = await screen.findByLabelText("NEW YEAR Mizuki R 數量");
    fireEvent.change(first, { target: { value: "100" } });
    expect(first).toHaveValue(99);

    const second = screen.getByLabelText("BUNNY GIRL Rei R 數量");
    fireEvent.change(second, { target: { value: "8" } });
    expect(second).toHaveValue(1);
    expect(screen.getByText("100 / 100 張")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "檢查本次入藏（100 張）" }),
    ).toBeEnabled();
  });

  it("requires a purchase total and distributes it across a received batch", async () => {
    const fetchMock = stubAddCardsFetch({ ids: [201, 202, 203] });
    vi.stubGlobal("fetch", fetchMock);
    render(<AddCards />);

    await screen.findByLabelText("NEW YEAR Mizuki R 數量");
    fireEvent.click(screen.getByRole("radio", { name: "已收購入" }));
    fireEvent.change(screen.getByLabelText("NEW YEAR Mizuki R 數量"), {
      target: { value: "2" },
    });
    fireEvent.change(screen.getByLabelText("BUNNY GIRL Rei R 數量"), {
      target: { value: "1" },
    });

    const review = screen.getByRole("button", {
      name: "檢查本次入藏（3 張）",
    });
    expect(review).toBeDisabled();
    fireEvent.change(screen.getByLabelText("購入總額 (TWD)"), {
      target: { value: "-1" },
    });
    expect(review).toBeDisabled();
    expect(screen.getByText("購入總額必須為 0 或正數")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("購入總額 (TWD)"), {
      target: { value: "1.001" },
    });
    expect(review).toBeDisabled();
    expect(screen.getByText("購入總額最多只能有兩位小數")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("購入總額 (TWD)"), {
      target: { value: "100" },
    });
    fireEvent.click(review);
    expect(
      await screen.findByText("購入總額會分攤到每張實體卡"),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "確認寫入 3 張" }));

    await screen.findByText("已記錄 3 張已收購入（總額 100 TWD）");
    const post = fetchMock.mock.calls.find(
      ([url, init]) => url === "/api/admin/cards" && init?.method === "POST",
    );
    const body = JSON.parse(post?.[1]?.body as string);
    expect(body).not.toHaveProperty("opening");
    expect(body.cards).toEqual([
      {
        series: "NEW YEAR",
        character: "Mizuki",
        rarity: "R",
        source: "purchase",
        purchasePrice: 33.34,
      },
      {
        series: "NEW YEAR",
        character: "Mizuki",
        rarity: "R",
        source: "purchase",
        purchasePrice: 33.33,
      },
      {
        series: "BUNNY GIRL",
        character: "Rei",
        rarity: "R",
        source: "purchase",
        purchasePrice: 33.33,
      },
    ]);
  });

  it("records other acquisitions as one batch without opening metadata", async () => {
    const fetchMock = stubAddCardsFetch({ ids: [301, 302] });
    vi.stubGlobal("fetch", fetchMock);
    render(<AddCards />);

    await screen.findByLabelText("NEW YEAR Mizuki R 數量");
    fireEvent.click(screen.getByRole("radio", { name: "其他入藏" }));
    fireEvent.change(screen.getByLabelText("NEW YEAR Mizuki R 數量"), {
      target: { value: "2" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "檢查本次入藏（2 張）" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "確認寫入 2 張" }));

    await screen.findByText("已記錄 2 張其他入藏");
    const post = fetchMock.mock.calls.find(
      ([url, init]) => url === "/api/admin/cards" && init?.method === "POST",
    );
    const body = JSON.parse(post?.[1]?.body as string);
    expect(body).not.toHaveProperty("opening");
    expect(body.cards).toEqual([
      {
        series: "NEW YEAR",
        character: "Mizuki",
        rarity: "R",
        source: "other",
      },
      {
        series: "NEW YEAR",
        character: "Mizuki",
        rarity: "R",
        source: "other",
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
            opening: { id: 9, volume: 1, packNumber: 4 },
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

    await screen.findByText(/目前無法預覽下一個包號/);
    fireEvent.change(screen.getByLabelText("NEW YEAR Mizuki R 數量"), {
      target: { value: "1" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "檢查本次入藏（1 張）" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "確認寫入 1 張" }));

    await screen.findByText("第 1 彈第 4 包已記錄（1 張）");
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
        source: "other",
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
    expect(
      within(row as HTMLElement).getByText("其他入藏"),
    ).toBeInTheDocument();

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
    const table = await screen.findByRole("table", {
      name: "交換預約清單",
    });
    expect(
      within(table).getByRole("columnheader", { name: "對象" }),
    ).toBeInTheDocument();
    expect(
      within(table).getByRole("columnheader", { name: "備註" }),
    ).toBeInTheDocument();
    expect(within(table).getByText("阿明")).toBeInTheDocument();
    expect(within(table).getByText("面交")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "完成" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "取消" })).toBeInTheDocument();
  });

  it("hides and restores counterparty and note for privacy", async () => {
    vi.stubGlobal("fetch", stubFetchFor([sampleReservation]));

    const view = render(<PendingTrades />);
    const table = await screen.findByRole("table", {
      name: "交換預約清單",
    });
    const privacySwitch = screen.getByRole("switch", {
      name: "顯示對象與備註",
    });
    expect(privacySwitch).toBeChecked();
    fireEvent.change(screen.getByLabelText("對象"), {
      target: { value: "展示私密對象" },
    });
    fireEvent.change(screen.getByLabelText("備註"), {
      target: { value: "展示私密備註" },
    });

    fireEvent.click(privacySwitch);
    expect(privacySwitch).not.toBeChecked();
    expect(
      within(table).queryByRole("columnheader", { name: "對象" }),
    ).toBeNull();
    expect(
      within(table).queryByRole("columnheader", { name: "備註" }),
    ).toBeNull();
    expect(within(table).queryByText("阿明")).toBeNull();
    expect(within(table).queryByText("面交")).toBeNull();
    expect(within(table).getByText("MP 4TH Mizuki R×1")).toBeInTheDocument();
    expect(within(table).getByText("KILLER Rei SR×1")).toBeInTheDocument();
    expect(
      within(table).getByRole("button", { name: "完成" }),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText("對象")).toBeNull();
    expect(screen.queryByLabelText("備註")).toBeNull();
    expect(screen.queryByDisplayValue("展示私密對象")).toBeNull();
    expect(screen.queryByDisplayValue("展示私密備註")).toBeNull();

    fireEvent.click(privacySwitch);
    expect(privacySwitch).toBeChecked();
    expect(within(table).getByText("阿明")).toBeInTheDocument();
    expect(within(table).getByText("面交")).toBeInTheDocument();
    expect(screen.getByDisplayValue("展示私密對象")).toBeInTheDocument();
    expect(screen.getByDisplayValue("展示私密備註")).toBeInTheDocument();

    fireEvent.click(privacySwitch);
    view.unmount();
    render(<PendingTrades />);
    const remountedTable = await screen.findByRole("table", {
      name: "交換預約清單",
    });
    expect(
      screen.getByRole("switch", { name: "顯示對象與備註" }),
    ).not.toBeChecked();
    expect(within(remountedTable).queryByText("阿明")).toBeNull();
    expect(within(remountedTable).queryByText("面交")).toBeNull();
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
        volume: 1,
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
    expect(screen.getByText("第 1 彈")).toBeInTheDocument();
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
        volume: 1,
        packNumber: 1,
        series: "NEW YEAR",
        openedAt: "2026-06-01",
        cost: 600,
        cardCount: 10,
        avgCost: 60,
      },
      {
        id: 2,
        volume: 1,
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
