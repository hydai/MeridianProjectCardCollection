import { fireEvent, render, screen, within } from "@testing-library/react";
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

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("ManageCards acquisition and reservation state", () => {
  it("highlights and locks the exact reserved physical card", async () => {
    const rows: CardRow[] = [
      {
        id: 41,
        series: "KILLER",
        character: "Rei",
        rarity: "UR",
        status: "owned",
        source: "purchase",
        purchasePrice: 880,
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
        json: async () =>
          String(url).includes("/api/catalog") ? catalog : rows,
      })),
    );

    render(<ManageCards />);
    const table = await screen.findByRole("table");

    const row = within(table).getByText("購入 · 880 元").closest("tr");
    expect(row).not.toBeNull();
    expect(row?.className).toContain("reservation-soft");
    expect(
      within(row as HTMLElement).getByText("暫定換出"),
    ).toBeInTheDocument();
    expect(within(row as HTMLElement).getByText("已鎖定")).toBeInTheDocument();
    expect(within(row as HTMLElement).queryByText("賣出")).toBeNull();
    expect(within(row as HTMLElement).queryByText("交換")).toBeNull();
  });

  it("shows a terminal error instead of an endless catalog loader", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        String(url).includes("/api/catalog")
          ? { ok: false, status: 503 }
          : { ok: true, json: async () => [] },
      ),
    );

    render(<ManageCards />);

    await screen.findByText("Error: /api/catalog → 503");
    expect(screen.queryByText("載入中…")).toBeNull();
  });

  it("keeps dynamic names distinct from the all-filter option", async () => {
    const sentinelCatalog: CatalogSeries[] = [
      {
        name: "__all__",
        volume: 1,
        sortOrder: 0,
        characters: ["__all__"],
        rarities: ["R"],
      },
    ];
    const rows: CardRow[] = [
      {
        id: 42,
        series: "__all__",
        character: "__all__",
        rarity: "R",
        status: "owned",
        source: "pull",
        purchasePrice: null,
        askingPrice: null,
        wantInReturn: null,
        note: null,
        duplicate: false,
        reserved: false,
        reservedGive: 0,
      },
    ];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => ({
        ok: true,
        json: async () =>
          String(url).includes("/api/catalog") ? sentinelCatalog : rows,
      })),
    );

    render(<ManageCards />);
    await screen.findByRole("table");

    const seriesOption = within(
      screen.getByRole("radiogroup", { name: "系列篩選" }),
    ).getByRole("radio", { name: "__all__" });
    fireEvent.click(seriesOption);
    expect(seriesOption).toHaveAttribute("aria-checked", "true");

    const characterOption = within(
      screen.getByRole("radiogroup", { name: "角色篩選" }),
    ).getByRole("radio", { name: "__all__" });
    fireEvent.click(characterOption);
    expect(characterOption).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("status")).toHaveTextContent("顯示 1 / 1 張");
  });

  it("filters cards through dependent button groups", async () => {
    const filterCatalog: CatalogSeries[] = [
      {
        name: "FIRST",
        volume: 1,
        sortOrder: 0,
        characters: ["Alice"],
        rarities: ["R"],
      },
      {
        name: "SECOND",
        volume: 2,
        sortOrder: 1,
        characters: ["Bob", "Carol"],
        rarities: ["SSR", "UR"],
      },
    ];
    const rows: CardRow[] = [
      {
        id: 51,
        series: "FIRST",
        character: "Alice",
        rarity: "R",
        status: "owned",
        source: "pull",
        purchasePrice: null,
        askingPrice: null,
        wantInReturn: null,
        note: null,
        duplicate: false,
        reserved: false,
        reservedGive: 0,
      },
      {
        id: 52,
        series: "SECOND",
        character: "Bob",
        rarity: "SSR",
        status: "owned",
        source: "pull",
        purchasePrice: null,
        askingPrice: null,
        wantInReturn: null,
        note: null,
        duplicate: false,
        reserved: false,
        reservedGive: 0,
      },
      {
        id: 53,
        series: "SECOND",
        character: "Carol",
        rarity: "UR",
        status: "for_trade",
        source: "pull",
        purchasePrice: null,
        askingPrice: null,
        wantInReturn: null,
        note: null,
        duplicate: false,
        reserved: false,
        reservedGive: 0,
      },
      {
        id: 54,
        series: "SECOND",
        character: "Bob",
        rarity: "SSR",
        status: "sold",
        source: "purchase",
        purchasePrice: 500,
        askingPrice: null,
        wantInReturn: null,
        note: null,
        duplicate: false,
        reserved: false,
        reservedGive: 0,
      },
    ];
    const fetchMock = vi.fn(async (url: string) => ({
      ok: true,
      json: async () =>
        String(url).includes("/api/catalog") ? filterCatalog : rows,
    }));
    vi.stubGlobal("fetch", fetchMock);

    const { container } = render(<ManageCards />);
    await screen.findByText("顯示 3 / 4 張");

    expect(container.querySelector(".card-filters select")).toBeNull();
    expect(screen.getByRole("status")).toHaveTextContent("顯示 3 / 4 張");
    for (const label of ["彈數", "系列", "角色", "級別", "狀態"]) {
      expect(
        screen.getByRole("radiogroup", { name: `${label}篩選` }),
      ).toBeInTheDocument();
    }

    const volumeFilter = screen.getByRole("radiogroup", {
      name: "彈數篩選",
    });
    const statusFilter = screen.getByRole("radiogroup", {
      name: "狀態篩選",
    });
    const allVolumes = within(volumeFilter).getByRole("radio", {
      name: "全部彈數",
    });
    expect(allVolumes.tagName).toBe("BUTTON");
    expect(allVolumes).toHaveAttribute("aria-checked", "true");
    expect(
      within(statusFilter).getByRole("radio", {
        name: "持有中（可管理）",
      }),
    ).toHaveAttribute("aria-checked", "true");

    fireEvent.click(
      within(volumeFilter).getByRole("radio", { name: "第 2 彈" }),
    );
    expect(screen.getByText("顯示 2 / 4 張")).toBeInTheDocument();
    const seriesFilter = screen.getByRole("radiogroup", {
      name: "系列篩選",
    });
    expect(within(seriesFilter).queryByText("FIRST")).toBeNull();
    fireEvent.click(
      within(seriesFilter).getByRole("radio", { name: "SECOND" }),
    );
    const characterFilter = screen.getByRole("radiogroup", {
      name: "角色篩選",
    });
    fireEvent.click(
      within(characterFilter).getByRole("radio", { name: "Bob" }),
    );
    const rarityFilter = screen.getByRole("radiogroup", {
      name: "級別篩選",
    });
    fireEvent.click(within(rarityFilter).getByRole("radio", { name: "SSR" }));

    expect(screen.getByText("顯示 1 / 4 張")).toBeInTheDocument();
    let table = screen.getByRole("table");
    expect(within(table).getByText("Bob")).toBeInTheDocument();
    expect(within(table).queryByText("Alice")).toBeNull();
    expect(within(table).queryByText("Carol")).toBeNull();

    const row = within(table).getByText("Bob").closest("tr");
    fireEvent.click(
      within(row as HTMLElement).getByRole("button", { name: "賣出" }),
    );
    expect(screen.getByText("價格 (TWD)")).toBeInTheDocument();
    fireEvent.click(
      within(statusFilter).getByRole("radio", { name: "已售出" }),
    );
    expect(screen.queryByText("價格 (TWD)")).toBeNull();
    table = screen.getByRole("table");
    expect(within(table).getByText("已售出")).toBeInTheDocument();

    fireEvent.click(
      within(volumeFilter).getByRole("radio", { name: "第 1 彈" }),
    );
    expect(
      within(screen.getByRole("radiogroup", { name: "系列篩選" })).getByRole(
        "radio",
        { name: "全部系列" },
      ),
    ).toHaveAttribute("aria-checked", "true");
    expect(
      within(screen.getByRole("radiogroup", { name: "角色篩選" })).getByRole(
        "radio",
        { name: "全部角色" },
      ),
    ).toHaveAttribute("aria-checked", "true");
    expect(
      within(screen.getByRole("radiogroup", { name: "級別篩選" })).getByRole(
        "radio",
        { name: "全部級別" },
      ),
    ).toHaveAttribute("aria-checked", "true");

    fireEvent.click(
      within(statusFilter).getByRole("radio", {
        name: "持有中（可管理）",
      }),
    );
    table = screen.getByRole("table");
    expect(within(table).getByText("Alice")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
