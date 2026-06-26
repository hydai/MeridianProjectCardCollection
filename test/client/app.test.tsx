import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import App from "../../src/client/App";
import type { OverviewResponse } from "../../src/shared/types";

const overview: OverviewResponse = {
  cells: [
    {
      catalogId: 1,
      series: "NEW YEAR",
      character: "Mizuki",
      rarity: "R",
      owned: 3,
    },
    {
      catalogId: 2,
      series: "NEW YEAR",
      character: "Mizuki",
      rarity: "SR",
      owned: 1,
    },
    {
      catalogId: 3,
      series: "NEW YEAR",
      character: "Mizuki",
      rarity: "SSR",
      owned: 0,
    },
    {
      catalogId: 4,
      series: "NEW YEAR",
      character: "Mizuki",
      rarity: "UR",
      owned: 0,
    },
  ],
  progress: [{ series: "NEW YEAR", collectedTypes: 2, totalTypes: 4 }],
};

afterEach(() => vi.restoreAllMocks());

describe("App", () => {
  it("renders the hero and stats from the API", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, json: async () => overview })),
    );
    render(<App />);
    expect(screen.getByText("子午計畫")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("張總計")).toBeInTheDocument());
    // total owned = 3 + 1 = 4
    expect(screen.getAllByText("4").length).toBeGreaterThan(0);
  });

  it("shows an error state when the API fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, status: 500, json: async () => ({}) })),
    );
    render(<App />);
    await waitFor(() =>
      expect(screen.getByText(/無法載入資料/)).toBeInTheDocument(),
    );
  });

  it("shows market listings on the 交易看板 tab", async () => {
    const listings = [
      {
        cardId: 1,
        series: "NEW YEAR",
        character: "Mizuki",
        rarity: "SR",
        status: "for_sale",
        askingPrice: 500,
        wantInReturn: null,
        note: null,
      },
    ];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => ({
        ok: true,
        json: async () =>
          String(url).includes("/api/market") ? listings : overview,
      })),
    );
    render(<App />);
    await waitFor(() =>
      expect(screen.getByText("子午計畫")).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByText("交易看板"));
    await waitFor(() => expect(screen.getByText("500 元")).toBeInTheDocument());
  });
});
