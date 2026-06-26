import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AddCards } from "../../src/client/admin/AddCards";
import { ManageCards } from "../../src/client/admin/ManageCards";

afterEach(() => vi.restoreAllMocks());

describe("AddCards", () => {
  it("submits added cards via POST /api/admin/cards", async () => {
    const fetchMock = vi.fn(async (_url: string, _init: RequestInit) => ({
      ok: true,
      json: async () => ({ ids: [101] }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    render(<AddCards />);
    fireEvent.click(screen.getByRole("button", { name: /新增 1 張/ }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/admin/cards");
    expect(init.method).toBe("POST");
    const body = JSON.parse(init.body as string);
    expect(body.cards).toHaveLength(1);
    expect(body.cards[0]).toMatchObject({ series: "NEW YEAR", rarity: "R" });

    await waitFor(() =>
      expect(screen.getByText(/已新增 1 張/)).toBeInTheDocument(),
    );
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
        source: "pull",
        askingPrice: null,
        wantInReturn: null,
        note: null,
        duplicate: true,
      },
    ];
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, json: async () => rows })),
    );

    render(<ManageCards />);
    await waitFor(() => expect(screen.getByText("Rei")).toBeInTheDocument());
    expect(screen.getByText("重複")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "賣出" }));
    expect(screen.getByText("價格 (TWD)")).toBeInTheDocument();
    expect(screen.getByText("對象")).toBeInTheDocument();
  });
});
