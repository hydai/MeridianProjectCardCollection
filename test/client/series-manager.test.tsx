import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SeriesManager } from "../../src/client/admin/SeriesManager";

const existing = [
  {
    name: "NEW YEAR",
    volume: 1,
    sortOrder: 1,
    characters: ["Mizuki", "Rei"],
    rarities: ["R", "SR", "SSR", "UR"],
  },
];

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("SeriesManager", () => {
  it("validates the volume, trimmed unique name, characters, and rarities", async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => ({
      ok: true,
      json: async () => existing,
    }));
    vi.stubGlobal("fetch", fetchMock);

    render(<SeriesManager />);
    await screen.findByText("NEW YEAR");

    fireEvent.change(screen.getByLabelText("第幾彈"), {
      target: { value: "0" },
    });
    fireEvent.change(screen.getByLabelText("系列名稱"), {
      target: { value: "  NEW YEAR  " },
    });
    for (const rarity of ["R", "SR", "SSR", "UR"]) {
      fireEvent.click(screen.getByRole("button", { name: rarity }));
    }
    fireEvent.click(screen.getByRole("button", { name: "新增系列" }));

    expect(screen.getByText("第幾彈必須是正整數")).toBeInTheDocument();
    expect(screen.getByText("系列名稱已存在")).toBeInTheDocument();
    expect(screen.getByText("至少新增一位角色")).toBeInTheDocument();
    expect(screen.getByText("至少選擇一個卡片級別")).toBeInTheDocument();
    expect(
      fetchMock.mock.calls.filter(([, init]) => init?.method === "POST"),
    ).toHaveLength(0);
  });

  it("submits canonical rarity order, clears the form, and refreshes", async () => {
    const created = {
      name: "STARDUST",
      volume: 7,
      sortOrder: 2,
      characters: ["Alice", "Bob"],
      rarities: ["R", "SSR"],
    };
    let getCount = 0;
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === "POST") {
        return { ok: true, json: async () => created };
      }
      getCount += 1;
      return {
        ok: true,
        json: async () => (getCount === 1 ? existing : [...existing, created]),
      };
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<SeriesManager />);
    await screen.findByText("NEW YEAR");

    fireEvent.change(screen.getByLabelText("第幾彈"), {
      target: { value: "7" },
    });
    fireEvent.change(screen.getByLabelText("系列名稱"), {
      target: { value: "  STARDUST  " },
    });
    fireEvent.change(screen.getByLabelText("角色"), {
      target: { value: "  Alice  " },
    });
    fireEvent.click(screen.getByRole("button", { name: "加入角色" }));
    fireEvent.click(screen.getByRole("button", { name: "移除角色 Alice" }));
    fireEvent.change(screen.getByLabelText("角色"), {
      target: { value: "Alice" },
    });
    fireEvent.click(screen.getByRole("button", { name: "加入角色" }));
    fireEvent.change(screen.getByLabelText("角色"), {
      target: { value: "Bob" },
    });
    fireEvent.click(screen.getByRole("button", { name: "加入角色" }));
    fireEvent.click(screen.getByRole("button", { name: "SR" }));
    fireEvent.click(screen.getByRole("button", { name: "UR" }));
    // Radix appends a reselected item to the value array. The form must keep
    // catalog order instead of turning this interaction into [SSR, R].
    fireEvent.click(screen.getByRole("button", { name: "R" }));
    fireEvent.click(screen.getByRole("button", { name: "R" }));

    expect(screen.getByText(/卡片種類預覽：4 種/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "新增系列" }));

    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some(([, init]) => init?.method === "POST"),
      ).toBe(true);
    });
    const postCall = fetchMock.mock.calls.find(
      ([, init]) => init?.method === "POST",
    );
    expect(postCall?.[0]).toBe("/api/admin/series");
    expect(JSON.parse(postCall?.[1]?.body as string)).toEqual({
      volume: 7,
      name: "STARDUST",
      characters: ["Alice", "Bob"],
      rarities: ["R", "SSR"],
    });

    await waitFor(() => expect(getCount).toBe(2));
    expect(screen.getByText("已新增系列 STARDUST")).toBeInTheDocument();
    expect(screen.getByLabelText("第幾彈")).toHaveValue(null);
    expect(screen.getByLabelText("系列名稱")).toHaveValue("");
    expect(screen.queryByRole("button", { name: "移除角色 Alice" })).toBeNull();
    expect(screen.getByText("第 7 彈")).toBeInTheDocument();
  });

  it("copies an existing character list and lets the manager adjust it", async () => {
    const created = {
      name: "NEW SEASON",
      volume: 3,
      sortOrder: 2,
      characters: ["Mizuki", "Koyuki"],
      rarities: ["R", "SR", "SSR", "UR"],
    };
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => ({
      ok: true,
      json: async () => (init?.method === "POST" ? created : existing),
    }));
    vi.stubGlobal("fetch", fetchMock);

    render(<SeriesManager />);
    await screen.findByText("NEW YEAR");

    fireEvent.change(screen.getByLabelText("從既有系列複製角色"), {
      target: { value: "NEW YEAR" },
    });
    fireEvent.click(screen.getByRole("button", { name: "複製角色" }));
    expect(
      screen.getByRole("button", { name: "移除角色 Mizuki" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "移除角色 Rei" }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "移除角色 Rei" }));
    fireEvent.change(screen.getByLabelText("角色"), {
      target: { value: "Koyuki" },
    });
    fireEvent.click(screen.getByRole("button", { name: "加入角色" }));
    fireEvent.change(screen.getByLabelText("第幾彈"), {
      target: { value: "3" },
    });
    fireEvent.change(screen.getByLabelText("系列名稱"), {
      target: { value: "NEW SEASON" },
    });
    fireEvent.click(screen.getByRole("button", { name: "新增系列" }));

    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(([, init]) => init?.method === "POST"),
      ).toBe(true),
    );
    const postCall = fetchMock.mock.calls.find(
      ([, init]) => init?.method === "POST",
    );
    expect(JSON.parse(postCall?.[1]?.body as string).characters).toEqual([
      "Mizuki",
      "Koyuki",
    ]);
  });
});
