import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  BatchListing,
  batchListingGroups,
} from "../../src/client/admin/BatchListing";
import { ManageCards } from "../../src/client/admin/ManageCards";
import type { CardRow, OverviewCell } from "../../src/shared/types";

const card = (id: number, overrides: Partial<CardRow> = {}): CardRow => ({
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
  duplicate: true,
  reserved: false,
  reservedGive: 0,
  held: false,
  ...overrides,
});
const cell = (
  catalogId: number,
  overrides: Partial<OverviewCell> = {},
): OverviewCell => ({
  catalogId,
  volume: 1,
  series: "KILLER",
  character: "Rei",
  rarity: "UR",
  owned: 3,
  reserved: 0,
  held: 0,
  available: 3,
  wantCount: 0,
  incomingTrade: 0,
  incomingPurchase: 0,
  ...overrides,
});
const groups = batchListingGroups(
  [card(3), card(1), card(2), card(4, { rarity: "SR" })],
  [cell(11), cell(12, { rarity: "SR" })],
);
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
async function open() {
  fireEvent.click(screen.getByRole("button", { name: "批次上架" }));
  return within(await screen.findByRole("dialog"));
}
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("batch listing workflow", () => {
  it("groups only eligible copies and keeps selections inside the current filters", async () => {
    const rows = [
      card(1),
      card(2, { held: true }),
      card(3, { reserved: true }),
      card(4, { status: "for_trade" }),
      card(5, { status: "for_sale" }),
      card(6, { status: "sold" }),
      card(7, { rarity: "SR" }),
    ];
    expect(
      batchListingGroups(rows, [cell(11), cell(12, { rarity: "SR" })]),
    ).toMatchObject([{ cardIds: [1] }, { cardIds: [7] }]);
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
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
        if (url === "/api/overview")
          return json({
            cells: [cell(11), cell(12, { rarity: "SR" })],
            progress: [],
          });
        return json(rows);
      }),
    );
    render(<ManageCards />);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "批次上架" })).toBeEnabled(),
    );
    const filters = screen.getByRole("radiogroup", { name: "級別篩選" });
    fireEvent.click(within(filters).getByRole("radio", { name: "UR" }));
    const dialog = await open();
    expect(dialog.getByLabelText("KILLER Rei UR")).toBeInTheDocument();
    expect(dialog.queryByLabelText("KILLER Rei SR")).not.toBeInTheDocument();
    expect(dialog.getByText("可上架 1 張")).toBeInTheDocument();
  });

  it("reviews multi-kind quantities, returns to editing, and sends one exact request", async () => {
    const fetchMock = vi.fn(async () => json({ count: 3 }));
    vi.stubGlobal("fetch", fetchMock);
    const reload = vi.fn(async () => true);
    render(<BatchListing groups={groups} disabled={false} onReload={reload} />);
    const dialog = await open();
    expect(dialog.getByRole("button", { name: "預覽上架" })).toBeDisabled();
    fireEvent.change(dialog.getByLabelText("KILLER Rei UR"), {
      target: { value: "2" },
    });
    fireEvent.click(
      dialog.getByRole("button", { name: "全部上架 KILLER Rei SR" }),
    );
    fireEvent.change(dialog.getByLabelText("統一交換條件"), {
      target: { value: "  想換 SSR  " },
    });
    fireEvent.click(dialog.getByRole("button", { name: "預覽上架" }));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(
      dialog.getByRole("table", { name: "批次上架預覽" }),
    ).toHaveTextContent("KILLER Rei UR2");
    fireEvent.click(dialog.getByRole("button", { name: "返回修改" }));
    expect(dialog.getByLabelText("KILLER Rei UR")).toHaveValue(2);
    fireEvent.click(dialog.getByRole("button", { name: "預覽上架" }));
    fireEvent.click(dialog.getByRole("button", { name: "確認上架 3 張" }));
    await dialog.findByText("已上架 3 張卡片");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/admin/cards/batch-listing",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          status: "for_trade",
          cards: [
            { cardId: 1, catalogId: 11 },
            { cardId: 2, catalogId: 11 },
            { cardId: 4, catalogId: 12 },
          ],
          wantInReturn: "想換 SSR",
        }),
      }),
    );
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("supports fill all / clear and rejects fractions, excessive quantities, and invalid prices", async () => {
    render(
      <BatchListing
        groups={groups}
        disabled={false}
        onReload={async () => true}
      />,
    );
    const dialog = await open();
    fireEvent.click(dialog.getByRole("button", { name: "全部填滿" }));
    expect(dialog.getByLabelText("KILLER Rei UR")).toHaveValue(3);
    fireEvent.click(dialog.getByRole("button", { name: "清空數量" }));
    expect(dialog.getByRole("button", { name: "預覽上架" })).toBeDisabled();
    for (const value of ["1.5", "-1", "4"]) {
      fireEvent.change(dialog.getByLabelText("KILLER Rei UR"), {
        target: { value },
      });
      expect(dialog.getByRole("button", { name: "預覽上架" })).toBeDisabled();
    }
    fireEvent.change(dialog.getByLabelText("KILLER Rei UR"), {
      target: { value: "2" },
    });
    fireEvent.click(dialog.getByRole("radio", { name: "待售" }));
    fireEvent.change(dialog.getByLabelText("統一售價（每張 / TWD）"), {
      target: { value: "1.001" },
    });
    expect(dialog.getByRole("button", { name: "預覽上架" })).toBeDisabled();
    fireEvent.change(dialog.getByLabelText("統一售價（每張 / TWD）"), {
      target: { value: "0" },
    });
    fireEvent.click(dialog.getByRole("button", { name: "預覽上架" }));
    expect(dialog.getByText("每張 0 元")).toBeInTheDocument();
  });

  it("explains empty results and the 100-card limit", async () => {
    const view = render(
      <BatchListing groups={[]} disabled={false} onReload={async () => true} />,
    );
    const dialog = await open();
    expect(dialog.getByText("目前篩選下沒有可上架的卡片")).toBeInTheDocument();
    view.rerender(
      <BatchListing
        groups={[
          {
            ...groups[0],
            cardIds: Array.from({ length: 101 }, (_, i) => i + 1),
          },
        ]}
        disabled={false}
        onReload={async () => true}
      />,
    );
    fireEvent.click(dialog.getByRole("button", { name: "全部填滿" }));
    expect(
      dialog.getByText("每批最多 100 張，請減少數量或分批上架。"),
    ).toBeInTheDocument();
    expect(dialog.getByRole("button", { name: "預覽上架" })).toBeDisabled();
  });

  it("blocks repeated submits and dismissal while a request is in flight", async () => {
    let finish!: (response: Response) => void;
    const fetchMock = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          finish = resolve;
        }),
    );
    vi.stubGlobal("fetch", fetchMock);
    render(
      <BatchListing
        groups={groups}
        disabled={false}
        onReload={async () => true}
      />,
    );
    const dialog = await open();
    fireEvent.click(dialog.getByRole("button", { name: "全部填滿" }));
    fireEvent.click(dialog.getByRole("button", { name: "預覽上架" }));
    const submit = dialog.getByRole("button", { name: "確認上架 4 張" });
    fireEvent.click(submit);
    fireEvent.click(submit);
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    finish(json({ count: 4 }));
    await dialog.findByText("已上架 4 張卡片");
  });

  it.each([409, 500])(
    "requires refresh and reselection after an unsuccessful response (%s)",
    async (status) => {
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => json({ error: "庫存已变動，整批未上架。" }, status)),
      );
      const reload = vi.fn(async () => true);
      render(
        <BatchListing groups={groups} disabled={false} onReload={reload} />,
      );
      const dialog = await open();
      fireEvent.click(dialog.getByRole("button", { name: "全部填滿" }));
      fireEvent.click(dialog.getByRole("button", { name: "預覽上架" }));
      fireEvent.click(dialog.getByRole("button", { name: "確認上架 4 張" }));
      fireEvent.click(
        await dialog.findByRole("button", { name: "重新整理庫存" }),
      );
      await waitFor(() =>
        expect(dialog.getByLabelText("KILLER Rei UR")).toHaveValue(0),
      );
      expect(reload).toHaveBeenCalledTimes(1);
      expect(dialog.getByRole("button", { name: "預覽上架" })).toBeDisabled();
    },
  );

  it("keeps a successful result when list refresh fails and retries only the read", async () => {
    const fetchMock = vi.fn(async () => json({ count: 4 }));
    vi.stubGlobal("fetch", fetchMock);
    const reload = vi
      .fn()
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);
    render(<BatchListing groups={groups} disabled={false} onReload={reload} />);
    const dialog = await open();
    fireEvent.click(dialog.getByRole("button", { name: "全部填滿" }));
    fireEvent.click(dialog.getByRole("button", { name: "預覽上架" }));
    fireEvent.click(dialog.getByRole("button", { name: "確認上架 4 張" }));
    await dialog.findByText("已上架 4 張卡片");
    fireEvent.click(
      await dialog.findByRole("button", { name: "重新整理庫存" }),
    );
    await waitFor(() => expect(reload).toHaveBeenCalledTimes(2));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(
      dialog.queryByRole("button", { name: /確認上架/ }),
    ).not.toBeInTheDocument();
  });
});
