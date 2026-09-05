import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ManageCards } from "../../src/client/admin/ManageCards";
import type {
  CardRow,
  CatalogSeries,
  OverviewResponse,
} from "../../src/shared/types";

const catalog: CatalogSeries[] = [
  {
    name: "KILLER",
    volume: 1,
    sortOrder: 0,
    characters: ["Rei"],
    rarities: ["UR", "SR"],
  },
];

const overview: OverviewResponse = {
  cells: [
    {
      catalogId: 1,
      series: "KILLER",
      volume: 1,
      character: "Rei",
      rarity: "UR",
      owned: 1,
      reserved: 0,
      held: 0,
      available: 1,
      wantCount: 0,
      incomingTrade: 0,
      incomingPurchase: 0,
    },
    {
      catalogId: 2,
      series: "KILLER",
      volume: 1,
      character: "Rei",
      rarity: "SR",
      owned: 0,
      reserved: 0,
      held: 0,
      available: 0,
      wantCount: 0,
      incomingTrade: 0,
      incomingPurchase: 0,
    },
  ],
  progress: [],
};

const ownedCard: CardRow = {
  id: 73,
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
  held: false,
};

function stubFetch(rows: CardRow[]) {
  const fetchMock = vi.fn(async (input: string | URL, init?: RequestInit) => {
    const url = String(input);
    if (url === "/api/catalog") {
      return { ok: true, json: async () => structuredClone(catalog) };
    }
    if (url === "/api/overview") {
      return { ok: true, json: async () => structuredClone(overview) };
    }
    if (url === "/api/admin/cards" && init?.method === "POST") {
      return { ok: true, json: async () => ({ ids: [101, 102] }) };
    }
    if (url === "/api/admin/cards") {
      return { ok: true, json: async () => structuredClone(rows) };
    }
    if (url === "/api/admin/transactions" && init?.method === "POST") {
      return { ok: true, json: async () => ({ id: 15 }) };
    }
    if (url === "/api/admin/cards/73/reclassify" && init?.method === "POST") {
      return { ok: true, json: async () => ({ ok: true }) };
    }
    if (url === "/api/admin/catalog/1/activities?limit=50") {
      return { ok: true, json: async () => [] };
    }
    throw new Error(`unexpected request: ${init?.method ?? "GET"} ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

async function openWorkspace({ includeEmpty = false } = {}) {
  if (includeEmpty) {
    const statusFilters = await screen.findByRole("radiogroup", {
      name: "狀態篩選",
    });
    fireEvent.click(
      within(statusFilters).getByRole("radio", { name: "全部卡位" }),
    );
  }
  const groups = await screen.findByRole("table", { name: "卡片群組" });
  fireEvent.click(
    within(groups).getByRole("button", {
      name: "開啟 KILLER Rei UR 卡片工作面板",
    }),
  );
  return screen.findByRole("dialog");
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("ManageCards single-card workspace actions", () => {
  it("records a received direct purchase from an empty catalog slot", async () => {
    const emptyOverview = overview.cells[0];
    emptyOverview.owned = 0;
    emptyOverview.available = 0;
    const fetchMock = stubFetch([]);
    render(<ManageCards />);
    const dialog = await openWorkspace({ includeEmpty: true });

    fireEvent.click(within(dialog).getByRole("button", { name: "記錄購入" }));
    fireEvent.change(within(dialog).getByLabelText("張數"), {
      target: { value: "2" },
    });
    fireEvent.change(within(dialog).getByLabelText("購入總額 (TWD)"), {
      target: { value: "100.01" },
    });
    fireEvent.change(within(dialog).getByLabelText("賣家 / 來源"), {
      target: { value: "Card Shop" },
    });
    fireEvent.change(within(dialog).getByLabelText("入藏日期"), {
      target: { value: "2026-09-02" },
    });
    fireEvent.change(within(dialog).getByLabelText("備註"), {
      target: { value: "店取" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "記錄購入" }));

    await waitFor(() => {
      const request = fetchMock.mock.calls.find(
        ([url, options]) =>
          String(url) === "/api/admin/cards" && options?.method === "POST",
      );
      expect(request).toBeDefined();
      expect(JSON.parse(String(request?.[1]?.body))).toEqual({
        cards: [
          {
            series: "KILLER",
            character: "Rei",
            rarity: "UR",
            source: "purchase",
            purchasePrice: 50.01,
          },
          {
            series: "KILLER",
            character: "Rei",
            rarity: "UR",
            source: "purchase",
            purchasePrice: 50,
          },
        ],
        acquisition: {
          occurredAt: "2026-09-02",
          counterparty: "Card Shop",
          note: "店取",
        },
      });
    });
    expect(await within(dialog).findByText("購入入藏完成")).toBeInTheDocument();
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.filter(([url]) => String(url) === "/api/overview"),
      ).toHaveLength(2),
    );
    expect(within(dialog).getByText("購入入藏完成")).toBeInTheDocument();
  });

  it("records a gift with its recipient, date, and note", async () => {
    overview.cells[0].owned = 1;
    overview.cells[0].available = 1;
    const fetchMock = stubFetch([{ ...ownedCard }]);
    render(<ManageCards />);
    const dialog = await openWorkspace();

    fireEvent.click(within(dialog).getByRole("button", { name: "贈送" }));
    fireEvent.change(within(dialog).getByLabelText("贈與對象"), {
      target: { value: "Dana" },
    });
    fireEvent.change(within(dialog).getByLabelText("日期"), {
      target: { value: "2026-09-01" },
    });
    fireEvent.change(within(dialog).getByLabelText("備註"), {
      target: { value: "生日禮物" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "確認" }));

    await waitFor(() => {
      const request = fetchMock.mock.calls.find(
        ([url, options]) =>
          String(url) === "/api/admin/transactions" &&
          options?.method === "POST",
      );
      expect(JSON.parse(String(request?.[1]?.body))).toEqual({
        cardId: 73,
        type: "gift",
        counterparty: "Dana",
        happenedAt: "2026-09-01",
        note: "生日禮物",
      });
    });
  });

  it("moves an owned physical card to a corrected catalog slot", async () => {
    overview.cells[0].owned = 1;
    overview.cells[0].available = 1;
    const fetchMock = stubFetch([{ ...ownedCard }]);
    render(<ManageCards />);
    const dialog = await openWorkspace();

    fireEvent.click(within(dialog).getByRole("button", { name: "卡位更正" }));
    fireEvent.change(within(dialog).getByLabelText("正確卡位"), {
      target: { value: "2" },
    });
    fireEvent.change(within(dialog).getByLabelText("日期"), {
      target: { value: "2026-09-02" },
    });
    fireEvent.change(within(dialog).getByLabelText("備註"), {
      target: { value: "稀有度看錯" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "確認" }));

    await waitFor(() => {
      const request = fetchMock.mock.calls.find(
        ([url, options]) =>
          String(url) === "/api/admin/cards/73/reclassify" &&
          options?.method === "POST",
      );
      expect(JSON.parse(String(request?.[1]?.body))).toEqual({
        targetCatalogId: 2,
        happenedAt: "2026-09-02",
        note: "稀有度看錯",
      });
    });
  });
});
