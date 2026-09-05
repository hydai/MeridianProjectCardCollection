import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ManageCards } from "../../src/client/admin/ManageCards";
import type {
  ActivityEvent,
  CardRow,
  OverviewResponse,
} from "../../src/shared/types";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status });

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

function activity(catalogId: number, note: string): ActivityEvent {
  return {
    id: catalogId,
    kind: "want_updated",
    occurredAt: "2026-09-02T10:30:00.000Z",
    sourceType: "catalog",
    sourceId: catalogId,
    counterparty: null,
    amount: null,
    note,
    revertsEventId: null,
    reversedAt: null,
    createdAt: "2026-09-02T10:30:00.000Z",
    canUndo: false,
    lines: [],
  };
}

function apiFixture() {
  const state = { want: 0, held: false, failReload: false };
  const row: CardRow = {
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
  const overview = (): OverviewResponse => ({
    cells: [
      {
        catalogId: 1,
        series: "KILLER",
        character: "Rei",
        rarity: "UR",
        volume: 1,
        owned: 1,
        available: state.held ? 0 : 1,
        held: Number(state.held),
        reserved: 0,
        wantCount: state.want,
        incomingTrade: 0,
        incomingPurchase: 0,
      },
      {
        catalogId: 2,
        series: "KILLER",
        character: "Rei",
        rarity: "SR",
        volume: 1,
        owned: 0,
        available: 0,
        held: 0,
        reserved: 0,
        wantCount: 0,
        incomingTrade: 0,
        incomingPurchase: 0,
      },
    ],
    progress: [],
  });
  const fetchMock = vi.fn(
    async (url: string, init?: RequestInit): Promise<Response> => {
      if (url === "/api/catalog")
        return json([
          {
            name: "KILLER",
            volume: 1,
            sortOrder: 0,
            characters: ["Rei"],
            rarities: ["UR", "SR"],
          },
        ]);
      if (url === "/api/overview") {
        if (state.failReload)
          return json({ error: "overview unavailable" }, 503);
        return json(overview());
      }
      if (url === "/api/admin/cards")
        return json([{ ...row, held: state.held }]);
      if (url === "/api/admin/catalog/1/want") {
        state.want = JSON.parse(String(init?.body)).wantCount;
        return json({ wantCount: state.want });
      }
      if (url === "/api/admin/cards/73/hold") {
        state.held = true;
        return json({ ok: true });
      }
      if (url.includes("/catalog/1/activities"))
        return json([activity(1, "A 的痕跡")]);
      if (url.includes("/catalog/2/activities"))
        return json([activity(2, "B 的痕跡")]);
      throw new Error(`unexpected request: ${url}`);
    },
  );
  vi.stubGlobal("fetch", fetchMock);
  return { state, row, fetchMock };
}

async function openWorkspace(rarity = "UR") {
  fireEvent.click(
    await screen.findByRole("button", {
      name: `開啟 KILLER Rei ${rarity} 卡片工作面板`,
    }),
  );
  return screen.findByRole("dialog");
}

async function showCatalog() {
  fireEvent.click(await screen.findByRole("radio", { name: "全部卡位" }));
}

beforeEach(() => sessionStorage.clear());
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("ManageCards editor and request lifetimes", () => {
  it("preserves purchase and action drafts when Want refreshes the same catalog identity", async () => {
    const { fetchMock } = apiFixture();
    render(<ManageCards />);
    const dialog = await openWorkspace();
    await within(dialog).findByText("A 的痕跡");
    fireEvent.click(within(dialog).getByRole("button", { name: "記錄購入" }));
    fireEvent.change(within(dialog).getByLabelText("購入總額 (TWD)"), {
      target: { value: "100.01" },
    });
    fireEvent.change(within(dialog).getByLabelText("賣家 / 來源"), {
      target: { value: "Draft Shop" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "待售" }));
    fireEvent.change(within(dialog).getByLabelText("價格 (TWD)"), {
      target: { value: "230" },
    });
    fireEvent.change(within(dialog).getByLabelText("期望持有張數"), {
      target: { value: "3" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "儲存 Want" }));
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.filter(([url]) =>
          url.includes("/catalog/1/activities"),
        ),
      ).toHaveLength(2),
    );
    expect(within(dialog).getByLabelText("購入總額 (TWD)")).toHaveValue(100.01);
    expect(within(dialog).getByLabelText("賣家 / 來源")).toHaveValue(
      "Draft Shop",
    );
    expect(within(dialog).getByLabelText("價格 (TWD)")).toHaveValue(230);
    expect(within(dialog).getByLabelText("期望持有張數")).toHaveValue(3);
    expect(
      fetchMock.mock.calls.filter(([url]) => url === "/api/catalog"),
    ).toHaveLength(1);
  });

  it("preserves a dirty Want when another card operation refreshes the sheet", async () => {
    const { fetchMock } = apiFixture();
    render(<ManageCards />);
    const dialog = await openWorkspace();
    await within(dialog).findByText("A 的痕跡");
    fireEvent.change(within(dialog).getByLabelText("期望持有張數"), {
      target: { value: "7" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "保留" }));
    await within(dialog).findByRole("button", { name: "取消保留" });
    expect(within(dialog).getByLabelText("期望持有張數")).toHaveValue(7);
    expect(
      fetchMock.mock.calls.filter(([url]) =>
        url.includes("/catalog/1/activities"),
      ),
    ).toHaveLength(2);
  });

  it("ignores an old activity refresh after changing the selected catalog identity", async () => {
    const { fetchMock } = apiFixture();
    const base = fetchMock.getMockImplementation();
    if (!base) throw new Error("missing fixture");
    const lateActivities = deferred<Response>();
    let activityReads = 0;
    fetchMock.mockImplementation((url, init) => {
      if (url.includes("/catalog/1/activities") && ++activityReads > 1)
        return lateActivities.promise;
      return base(url, init);
    });
    render(<ManageCards />);
    await showCatalog();
    const first = await openWorkspace();
    await within(first).findByText("A 的痕跡");
    fireEvent.change(within(first).getByLabelText("期望持有張數"), {
      target: { value: "2" },
    });
    fireEvent.click(within(first).getByRole("button", { name: "儲存 Want" }));
    await waitFor(() => expect(activityReads).toBe(2));
    fireEvent.click(within(first).getByRole("button", { name: "關閉" }));
    const second = await openWorkspace("SR");
    await within(second).findByText("B 的痕跡");
    await act(async () => {
      lateActivities.resolve(json([activity(1, "延遲的 A 痕跡")]));
    });
    expect(within(second).getByText("B 的痕跡")).toBeInTheDocument();
    expect(within(second).queryByText("延遲的 A 痕跡")).toBeNull();
    expect(within(second).getByLabelText("期望持有張數")).toHaveValue(0);
  });

  it("does not send an old card's mutation failure to a newly selected editor", async () => {
    const { fetchMock } = apiFixture();
    const base = fetchMock.getMockImplementation();
    if (!base) throw new Error("missing fixture");
    const mutation = deferred<Response>();
    fetchMock.mockImplementation((url, init) =>
      url.endsWith("/1/want") ? mutation.promise : base(url, init),
    );
    render(<ManageCards />);
    await showCatalog();
    const first = await openWorkspace();
    fireEvent.change(within(first).getByLabelText("期望持有張數"), {
      target: { value: "2" },
    });
    fireEvent.click(within(first).getByRole("button", { name: "儲存 Want" }));
    fireEvent.click(within(first).getByRole("button", { name: "關閉" }));
    const second = await openWorkspace("SR");
    fireEvent.change(within(second).getByLabelText("期望持有張數"), {
      target: { value: "8" },
    });
    await act(async () => {
      mutation.reject(new Error("old card request failed"));
    });
    expect(within(second).getByLabelText("期望持有張數")).toHaveValue(8);
    expect(within(second).queryByText(/old card request failed/)).toBeNull();
  });

  it("does not close a newer physical-card action when an earlier action completes", async () => {
    const { row, fetchMock } = apiFixture();
    const base = fetchMock.getMockImplementation();
    if (!base) throw new Error("missing fixture");
    const transaction = deferred<Response>();
    fetchMock.mockImplementation((url, init) => {
      if (url === "/api/admin/cards")
        return Promise.resolve(json([row, { ...row, id: 74 }]));
      if (url === "/api/admin/transactions") return transaction.promise;
      return base(url, init);
    });
    render(<ManageCards />);
    const dialog = await openWorkspace();
    const first = within(dialog)
      .getByText("實體卡 #73")
      .closest('[data-slot="card"]');
    const second = within(dialog)
      .getByText("實體卡 #74")
      .closest('[data-slot="card"]');
    if (!(first instanceof HTMLElement) || !(second instanceof HTMLElement)) {
      throw new Error("missing physical-card panels");
    }
    fireEvent.click(within(first).getByRole("button", { name: "賣出" }));
    fireEvent.change(within(first).getByLabelText("價格 (TWD)"), {
      target: { value: "100" },
    });
    fireEvent.click(within(first).getByRole("button", { name: "確認" }));
    fireEvent.click(within(second).getByRole("button", { name: "待售" }));
    fireEvent.change(within(second).getByLabelText("價格 (TWD)"), {
      target: { value: "230" },
    });
    await act(async () => {
      transaction.resolve(json({ id: 1 }));
    });
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.filter(([url]) => url === "/api/overview"),
      ).toHaveLength(2),
    );
    expect(within(second).getByLabelText("價格 (TWD)")).toHaveValue(230);
  });

  it("offers a read-only retry when a successful Want write cannot revalidate", async () => {
    const { state, fetchMock } = apiFixture();
    render(<ManageCards />);
    const dialog = await openWorkspace();
    state.failReload = true;
    fireEvent.change(within(dialog).getByLabelText("期望持有張數"), {
      target: { value: "2" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "儲存 Want" }));
    await within(dialog).findByText("卡片資料更新失敗");
    expect(within(dialog).getByLabelText("期望持有張數")).toHaveValue(2);
    state.failReload = false;
    fireEvent.click(
      within(dialog).getByRole("button", { name: "重新載入卡片資料" }),
    );
    await waitFor(() =>
      expect(within(dialog).queryByText("卡片資料更新失敗")).toBeNull(),
    );
    expect(
      fetchMock.mock.calls.filter(([, init]) => init?.method === "PUT"),
    ).toHaveLength(1);
  });

  it("surfaces inline cancel-listing errors rather than swallowing them", async () => {
    const { row, fetchMock } = apiFixture();
    row.status = "for_sale";
    const base = fetchMock.getMockImplementation();
    if (!base) throw new Error("missing fixture");
    fetchMock.mockImplementation((url, init) =>
      init?.method === "PATCH"
        ? Promise.resolve(json({ error: "listing conflict" }, 409))
        : base(url, init),
    );
    render(<ManageCards />);
    fireEvent.click(await screen.findByRole("button", { name: /^展開/ }));
    fireEvent.click(screen.getByRole("button", { name: "取消上架" }));
    expect(await screen.findByText(/listing conflict/)).toBeInTheDocument();
  });
});
