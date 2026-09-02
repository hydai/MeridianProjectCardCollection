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
  ActivityEvent,
  CatalogSeries,
  OverviewResponse,
} from "../../src/shared/types";

const catalog: CatalogSeries[] = [
  {
    name: "KILLER",
    volume: 1,
    sortOrder: 0,
    characters: ["Rei"],
    rarities: ["UR"],
  },
];

const overview = (wantCount: number): OverviewResponse => ({
  cells: [
    {
      catalogId: 1,
      series: "KILLER",
      volume: 1,
      character: "Rei",
      rarity: "UR",
      owned: 0,
      reserved: 0,
      held: 0,
      available: 0,
      wantCount,
      incomingTrade: 0,
      incomingPurchase: 0,
    },
  ],
  progress: [],
});

const wantActivity = (afterWant: number): ActivityEvent => ({
  id: 91,
  kind: "want_updated",
  occurredAt: "2026-09-02T10:30:00.000Z",
  sourceType: "catalog",
  sourceId: 1,
  counterparty: null,
  amount: null,
  note: null,
  revertsEventId: null,
  reversedAt: null,
  createdAt: "2026-09-02T10:30:00.000Z",
  canUndo: false,
  lines: [
    {
      catalogId: 1,
      series: "KILLER",
      character: "Rei",
      rarity: "UR",
      action: "wanted",
      qty: 1,
      delta: 0,
      beforeStatus: null,
      afterStatus: null,
      beforeWant: 0,
      afterWant,
      unitAmount: null,
      note: null,
    },
  ],
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("ManageCards Want workspace", () => {
  it("opens a zero-owned catalog slot and records an explicit Want target", async () => {
    let wantCount = 0;
    const fetchMock = vi.fn(async (input: string | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/catalog") {
        return { ok: true, json: async () => catalog };
      }
      if (url === "/api/admin/cards") {
        return { ok: true, json: async () => [] };
      }
      if (url === "/api/overview") {
        return { ok: true, json: async () => overview(wantCount) };
      }
      if (url === "/api/admin/catalog/1/activities?limit=50") {
        return {
          ok: true,
          json: async () => (wantCount > 0 ? [wantActivity(wantCount)] : []),
        };
      }
      if (url === "/api/admin/catalog/1/want" && init?.method === "PUT") {
        wantCount = (JSON.parse(String(init.body)) as { wantCount: number })
          .wantCount;
        return { ok: true, json: async () => ({ wantCount }) };
      }
      throw new Error(`unexpected request: ${init?.method ?? "GET"} ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<ManageCards />);
    const statusFilters = await screen.findByRole("radiogroup", {
      name: "狀態篩選",
    });
    fireEvent.click(
      within(statusFilters).getByRole("radio", { name: "全部卡位" }),
    );

    const groups = await screen.findByRole("table", { name: "卡片群組" });
    expect(screen.getByRole("status")).toHaveTextContent(
      "顯示 1 個卡位 · 持有 0 張",
    );
    expect(within(groups).getByText("Rei")).toBeInTheDocument();
    expect(within(groups).queryByRole("button", { name: /^展開/ })).toBeNull();

    fireEvent.click(
      within(groups).getByRole("button", {
        name: "開啟 KILLER Rei UR 卡片工作面板",
      }),
    );
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveStyle({
      width: "min(100vw, 680px)",
      maxWidth: "none",
    });
    expect(
      within(dialog).getByRole("heading", { name: "Rei · KILLER" }),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByText("尚未有這個卡位的實體卡紀錄。"),
    ).toBeInTheDocument();

    fireEvent.change(within(dialog).getByLabelText("期望持有張數"), {
      target: { value: "2" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "儲存 Want" }));

    await waitFor(() => {
      const request = fetchMock.mock.calls.find(
        ([url, options]) =>
          String(url) === "/api/admin/catalog/1/want" &&
          options?.method === "PUT",
      );
      expect(JSON.parse(String(request?.[1]?.body))).toEqual({ wantCount: 2 });
    });
    expect(await within(dialog).findByText("尚找 2")).toBeInTheDocument();
    expect(await within(dialog).findByText("Want 0 → 2")).toBeInTheDocument();
  });
});
