import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ManageCards } from "../../src/client/admin/ManageCards";
import type { CardRow, CatalogSeries } from "../../src/shared/types";

const catalog: CatalogSeries[] = [
  {
    name: "KILLER",
    volume: 1,
    sortOrder: 0,
    characters: ["Rei"],
    rarities: ["UR"],
  },
];

const baseCard: CardRow = {
  id: 70,
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
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const stubFetch = (rows: CardRow[]) => {
  const fetchMock = vi.fn(async (url: string, _options?: RequestInit) => {
    const u = String(url);
    if (u.includes("/api/catalog")) {
      return { ok: true, json: async () => catalog };
    }
    if (u.includes("/hold")) {
      return { ok: true, json: async () => ({ ok: true }) };
    }
    return { ok: true, json: async () => rows };
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
};

const expandDetails = async () => {
  const table = await screen.findByRole("table", { name: "卡片群組" });
  fireEvent.click(
    within(table).getByRole("button", {
      name: "展開 KILLER Rei UR，1 張明細",
    }),
  );
  return screen.getByRole("table", { name: "KILLER Rei UR 實體卡明細" });
};

const holdCall = (fetchMock: ReturnType<typeof stubFetch>, id: number) =>
  fetchMock.mock.calls.find(([u]) =>
    String(u).includes(`/api/admin/cards/${id}/hold`),
  );

describe("ManageCards hold (保留)", () => {
  it("offers 保留 on an owned card and calls the hold endpoint", async () => {
    const fetchMock = stubFetch([{ ...baseCard }]);
    render(<ManageCards />);
    const details = await expandDetails();
    const row = within(details).getByText("#70").closest("tr") as HTMLElement;

    fireEvent.click(within(row).getByRole("button", { name: "保留" }));

    await waitFor(() => {
      const call = holdCall(fetchMock, 70);
      expect(call).toBeDefined();
      expect(call?.[1]?.method).toBe("POST");
    });
  });

  it("locks a held card: shows the 保留 pill, offers 取消保留, hides trade actions", async () => {
    const fetchMock = stubFetch([{ ...baseCard, id: 71, held: true }]);
    render(<ManageCards />);
    const table = await screen.findByRole("table", { name: "卡片群組" });
    // the collapsed group summarises the hold too
    expect(within(table).getByText("保留 1")).toBeInTheDocument();
    fireEvent.click(
      within(table).getByRole("button", {
        name: "展開 KILLER Rei UR，1 張明細",
      }),
    );
    const details = screen.getByRole("table", {
      name: "KILLER Rei UR 實體卡明細",
    });
    const row = within(details).getByText("#71").closest("tr") as HTMLElement;

    expect(within(row).getByText("保留")).toBeInTheDocument();
    expect(
      within(row).getByRole("button", { name: "取消保留" }),
    ).toBeInTheDocument();
    for (const label of ["待售", "待換", "賣出", "交換"]) {
      expect(within(row).queryByRole("button", { name: label })).toBeNull();
    }

    fireEvent.click(within(row).getByRole("button", { name: "取消保留" }));
    await waitFor(() => {
      expect(holdCall(fetchMock, 71)?.[1]?.method).toBe("DELETE");
    });
  });
});
