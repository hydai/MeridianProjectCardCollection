import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ManageCards } from "../../src/client/admin/ManageCards";
import type { CardRow, OverviewCell } from "../../src/shared/types";

const card = (
  id: number,
  series: string,
  rarity: "SSR" | "UR",
  status: "owned" | "for_sale",
): CardRow => ({
  id,
  series,
  character: "Rei",
  rarity,
  status,
  source: "pull",
  purchasePrice: null,
  askingPrice: status === "for_sale" ? 100 : null,
  wantInReturn: null,
  note: null,
  duplicate: true,
  reserved: false,
  reservedGive: 0,
  held: false,
});
const rows = [
  card(1, "KILLER", "UR", "owned"),
  card(2, "OTHER", "SSR", "owned"),
  card(3, "KILLER", "UR", "for_sale"),
  card(4, "OTHER", "SSR", "for_sale"),
];
const cell = (
  catalogId: number,
  series: string,
  rarity: "SSR" | "UR",
  owned: number,
): OverviewCell => ({
  catalogId,
  series,
  character: "Rei",
  rarity,
  volume: 1,
  owned,
  available: owned,
  reserved: 0,
  held: 0,
  wantCount: 0,
  incomingTrade: 0,
  incomingPurchase: 0,
});
function setup() {
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async (url: string) =>
        new Response(
          JSON.stringify(
            url === "/api/catalog"
              ? ["KILLER", "OTHER"].map((name, sortOrder) => ({
                  name,
                  volume: 1,
                  sortOrder,
                  characters: ["Rei"],
                  rarities: ["SSR", "UR"],
                }))
              : url === "/api/overview"
                ? {
                    cells: [
                      cell(11, "KILLER", "UR", 2),
                      cell(12, "KILLER", "SSR", 0),
                      cell(13, "OTHER", "SSR", 2),
                    ],
                    progress: [],
                  }
                : rows,
          ),
          { headers: { "content-type": "application/json" } },
        ),
    ),
  );
  render(<ManageCards />);
}
afterEach(() => vi.unstubAllGlobals());

describe("card search and progressive filters", () => {
  it("matches normalized keywords together and resets to the default inventory", async () => {
    setup();
    const table = await screen.findByRole("table", { name: "卡片群組" });
    expect(screen.queryByRole("radiogroup", { name: "角色篩選" })).toBeNull();
    fireEvent.change(screen.getByLabelText("搜尋卡片"), {
      target: { value: " ｋｉｌｌｅｒ　ｒｅｉ　ＵＲ " },
    });
    expect(within(table).getByText("KILLER")).toBeInTheDocument();
    expect(within(table).queryByText("OTHER")).toBeNull();
    expect(screen.getByRole("status")).toHaveTextContent(
      "顯示 1 種卡 · 2 / 4 張",
    );
    fireEvent.click(screen.getByRole("button", { name: "重設搜尋與篩選" }));
    expect(screen.getByLabelText("搜尋卡片")).toHaveValue("");
    expect(screen.getByRole("status")).toHaveTextContent(
      "顯示 2 種卡 · 4 / 4 張",
    );
  });

  it("keeps collapsed advanced filters visible and applied", async () => {
    setup();
    await screen.findByRole("table", { name: "卡片群組" });
    fireEvent.click(screen.getByRole("button", { name: /更多篩選/ }));
    fireEvent.click(
      within(screen.getByRole("radiogroup", { name: "級別篩選" })).getByRole(
        "radio",
        { name: "SSR" },
      ),
    );
    fireEvent.click(screen.getByRole("button", { name: /更多篩選/ }));
    expect(screen.queryByRole("radiogroup", { name: "級別篩選" })).toBeNull();
    expect(screen.getByLabelText("已套用的進階篩選")).toHaveTextContent("SSR");
    expect(screen.getByRole("status")).toHaveTextContent(
      "顯示 1 種卡 · 2 / 4 張",
    );
    fireEvent.click(screen.getByRole("button", { name: "重設搜尋與篩選" }));
    expect(screen.queryByLabelText("已套用的進階篩選")).toBeNull();
  });

  it("finds catalog kinds with no physical copies", async () => {
    setup();
    await screen.findByRole("table", { name: "卡片群組" });
    fireEvent.click(screen.getByRole("radio", { name: "全部卡位" }));
    fireEvent.change(screen.getByLabelText("搜尋卡片"), {
      target: { value: "KILLER SSR" },
    });
    expect(screen.getByRole("status")).toHaveTextContent(
      "顯示 1 個卡位 · 持有 0 張",
    );
    expect(
      screen.getByRole("button", { name: "開啟 KILLER Rei SSR 卡片工作面板" }),
    ).toBeInTheDocument();
  });

  it("limits both batch listing and repricing to search results", async () => {
    setup();
    await screen.findByRole("table", { name: "卡片群組" });
    fireEvent.change(screen.getByLabelText("搜尋卡片"), {
      target: { value: "KILLER" },
    });
    fireEvent.click(screen.getByRole("button", { name: "批次上架" }));
    let dialog = within(await screen.findByRole("dialog"));
    expect(dialog.getByLabelText("KILLER Rei UR")).toBeInTheDocument();
    expect(dialog.queryByLabelText("OTHER Rei SSR")).toBeNull();
    fireEvent.click(dialog.getByRole("button", { name: "關閉" }));
    fireEvent.click(screen.getByRole("button", { name: "批次改價" }));
    dialog = within(await screen.findByRole("dialog"));
    expect(
      dialog.getByText("目前篩選下有 1 張可改價的待售卡片。"),
    ).toBeInTheDocument();
    fireEvent.change(dialog.getByLabelText("新售價（TWD／張）"), {
      target: { value: "200" },
    });
    fireEvent.click(dialog.getByRole("button", { name: "預覽改價" }));
    expect(
      dialog.getByRole("table", { name: "批次改價預覽" }),
    ).toHaveTextContent("KILLER");
    expect(dialog.queryByText(/OTHER/)).toBeNull();
  });
});
