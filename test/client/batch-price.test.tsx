import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BatchPrice, batchPriceCards } from "../../src/client/admin/BatchPrice";
import { ManageCards } from "../../src/client/admin/ManageCards";
import type { CardRow, OverviewCell } from "../../src/shared/types";

const card = (id: number, overrides: Partial<CardRow> = {}): CardRow => ({
  id,
  series: "NEW YEAR",
  character: "Rei",
  rarity: "SSR",
  status: "for_sale",
  source: "pull",
  purchasePrice: null,
  askingPrice: 150,
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
  series: "NEW YEAR",
  character: "Rei",
  rarity: "SSR",
  owned: 3,
  reserved: 0,
  held: 0,
  available: 3,
  wantCount: 0,
  incomingTrade: 0,
  incomingPurchase: 0,
  ...overrides,
});
const cards = batchPriceCards(
  [card(1), card(2), card(3, { askingPrice: 200 })],
  [cell(11)],
);
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
async function open() {
  fireEvent.click(screen.getByRole("button", { name: "批次改價" }));
  return within(await screen.findByRole("dialog"));
}
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("batch repricing workflow", () => {
  it("uses the current rarity filters and excludes held, reserved and non-sale cards", async () => {
    const rows = [
      card(1),
      card(2, { held: true }),
      card(3, { reserved: true }),
      card(4, { status: "for_trade" }),
      card(5, { status: "owned" }),
      card(6, { status: "sold" }),
      card(7, { rarity: "SR" }),
      card(8, { askingPrice: 200 }),
    ];
    expect(
      batchPriceCards(rows, [cell(11), cell(12, { rarity: "SR" })]).map(
        (c) => c.cardId,
      ),
    ).toEqual([1, 7, 8]);
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url === "/api/catalog")
          return json([
            {
              name: "NEW YEAR",
              volume: 1,
              sortOrder: 0,
              characters: ["Rei"],
              rarities: ["SSR", "SR"],
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
      expect(screen.getByRole("button", { name: "批次改價" })).toBeEnabled(),
    );
    fireEvent.click(
      within(screen.getByRole("radiogroup", { name: "級別篩選" })).getByRole(
        "radio",
        { name: "SSR" },
      ),
    );
    const dialog = await open();
    expect(
      dialog.getByText("目前篩選下有 2 張可改價的待售卡片。"),
    ).toBeInTheDocument();
    fireEvent.change(dialog.getByLabelText("新售價（TWD／張）"), {
      target: { value: "200" },
    });
    fireEvent.click(dialog.getByRole("button", { name: "預覽改價" }));
    expect(
      dialog.getByRole("table", { name: "批次改價預覽" }),
    ).toHaveTextContent("NEW YEAR · Rei · SSR1150 元200 元");
  });

  it("previews original/new prices and posts exact IDs once, skipping unchanged prices", async () => {
    let finish: ((response: Response) => void) | undefined;
    const fetchMock = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          finish = resolve;
        }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const reload = vi.fn(async () => true);
    render(<BatchPrice cards={cards} disabled={false} onReload={reload} />);
    const dialog = await open();
    fireEvent.change(dialog.getByLabelText("新售價（TWD／張）"), {
      target: { value: "200" },
    });
    expect(
      dialog.getByText("將更新 2 張；1 張售價相同，無需更新。"),
    ).toBeInTheDocument();
    fireEvent.click(dialog.getByRole("button", { name: "預覽改價" }));
    expect(fetchMock).not.toHaveBeenCalled();
    fireEvent.click(dialog.getByRole("button", { name: "返回修改" }));
    expect(dialog.getByLabelText("新售價（TWD／張）")).toHaveValue(200);
    fireEvent.click(dialog.getByRole("button", { name: "預覽改價" }));
    const submit = dialog.getByRole("button", { name: "確認更新售價" });
    fireEvent.click(submit);
    fireEvent.click(submit);
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/admin/cards/batch-price",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          askingPrice: 200,
          cards: [
            { cardId: 1, catalogId: 11, currentPrice: 150 },
            { cardId: 2, catalogId: 11, currentPrice: 150 },
          ],
        }),
      }),
    );
    finish?.(json({ count: 2 }));
    await dialog.findByText("已更新 2 張卡片的售價");
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("rejects invalid prices, no changes, and more than 100 changed cards", async () => {
    const view = render(
      <BatchPrice cards={cards} disabled={false} onReload={async () => true} />,
    );
    const dialog = await open();
    for (const value of ["", "-1", "1.001", "1000000000000000000000"]) {
      fireEvent.change(dialog.getByLabelText("新售價（TWD／張）"), {
        target: { value },
      });
      expect(dialog.getByRole("button", { name: "預覽改價" })).toBeDisabled();
    }
    view.rerender(
      <BatchPrice
        cards={[cards[2]]}
        disabled={false}
        onReload={async () => true}
      />,
    );
    fireEvent.change(dialog.getByLabelText("新售價（TWD／張）"), {
      target: { value: "200" },
    });
    expect(dialog.getByRole("button", { name: "預覽改價" })).toBeDisabled();
    view.rerender(
      <BatchPrice
        cards={Array.from({ length: 101 }, (_, i) => ({
          ...cards[0],
          cardId: i + 1,
        }))}
        disabled={false}
        onReload={async () => true}
      />,
    );
    expect(
      dialog.getByText("超過 100 張，請縮小系列或角色篩選後再試。"),
    ).toBeInTheDocument();
    expect(dialog.getByRole("button", { name: "預覽改價" })).toBeDisabled();
    view.rerender(
      <BatchPrice
        cards={[{ ...cards[0], currentPrice: null }]}
        disabled={false}
        onReload={async () => true}
      />,
    );
    fireEvent.change(dialog.getByLabelText("新售價（TWD／張）"), {
      target: { value: "0" },
    });
    fireEvent.click(dialog.getByRole("button", { name: "預覽改價" }));
    expect(
      dialog.getByRole("table", { name: "批次改價預覽" }),
    ).toHaveTextContent("面議0 元");
  });

  it.each([409, 500])(
    "requires a fresh list and review after an uncertain response (%s)",
    async (status) => {
      const fetchMock = vi.fn(async () =>
        json({ error: "售價已變動" }, status),
      );
      vi.stubGlobal("fetch", fetchMock);
      const reload = vi
        .fn()
        .mockResolvedValueOnce(false)
        .mockResolvedValueOnce(true);
      render(<BatchPrice cards={cards} disabled={false} onReload={reload} />);
      const dialog = await open();
      fireEvent.change(dialog.getByLabelText("新售價（TWD／張）"), {
        target: { value: "200" },
      });
      fireEvent.click(dialog.getByRole("button", { name: "預覽改價" }));
      fireEvent.click(dialog.getByRole("button", { name: "確認更新售價" }));
      const refresh = await dialog.findByRole("button", {
        name: "重新整理清單",
      });
      expect(
        dialog.getByRole("button", { name: "確認更新售價" }),
      ).toBeDisabled();
      fireEvent.click(refresh);
      await dialog.findByText("無法更新清單，請稍後再試。");
      expect(
        dialog.getByRole("button", { name: "確認更新售價" }),
      ).toBeDisabled();
      fireEvent.click(refresh);
      await dialog.findByLabelText("新售價（TWD／張）");
      expect(
        dialog.queryByRole("button", { name: "確認更新售價" }),
      ).not.toBeInTheDocument();
      expect(fetchMock).toHaveBeenCalledTimes(1);
    },
  );

  it("retains successful changes when reload fails and retries only the read", async () => {
    const fetchMock = vi.fn(async () => json({ count: 2 }));
    vi.stubGlobal("fetch", fetchMock);
    const reload = vi
      .fn()
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);
    render(<BatchPrice cards={cards} disabled={false} onReload={reload} />);
    const dialog = await open();
    fireEvent.change(dialog.getByLabelText("新售價（TWD／張）"), {
      target: { value: "200" },
    });
    fireEvent.click(dialog.getByRole("button", { name: "預覽改價" }));
    fireEvent.click(dialog.getByRole("button", { name: "確認更新售價" }));
    await dialog.findByText("已更新 2 張卡片的售價");
    fireEvent.click(
      await dialog.findByRole("button", { name: "重新整理清單" }),
    );
    await waitFor(() => expect(reload).toHaveBeenCalledTimes(2));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(
      dialog.queryByRole("button", { name: "確認更新售價" }),
    ).not.toBeInTheDocument();
  });
});
