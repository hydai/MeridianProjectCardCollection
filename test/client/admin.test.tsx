import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildCatalog } from "../../seed/catalog-def";
import { AddCards } from "../../src/client/admin/AddCards";
import { ManageCards } from "../../src/client/admin/ManageCards";
import { PendingTrades } from "../../src/client/admin/PendingTrades";

afterEach(() => vi.restoreAllMocks());

describe("AddCards", () => {
  it("disables the submit button while the tally is empty", () => {
    render(<AddCards />);
    expect(screen.getByRole("button", { name: "新增 0 張" })).toBeDisabled();
    expect(screen.getByText("點上方角色加入卡片")).toBeInTheDocument();
  });

  it("adds a tapped character at the selected rarity and submits via POST", async () => {
    const fetchMock = vi.fn(async (_url: string, _init: RequestInit) => ({
      ok: true,
      json: async () => ({ ids: [101] }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    render(<AddCards />);
    // Defaults: series "NEW YEAR", rarity "R".
    fireEvent.click(screen.getByRole("button", { name: "Mizuki" }));
    fireEvent.click(screen.getByRole("button", { name: "新增 1 張" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/admin/cards");
    expect(init.method).toBe("POST");
    const body = JSON.parse(init.body as string);
    expect(body.cards).toHaveLength(1);
    expect(body.cards[0]).toMatchObject({
      series: "NEW YEAR",
      character: "Mizuki",
      rarity: "R",
    });

    await waitFor(() =>
      expect(screen.getByText(/已新增 1 張/)).toBeInTheDocument(),
    );
  });

  it("increments quantity when the same character+rarity is tapped again", async () => {
    const fetchMock = vi.fn(async (_url: string, _init: RequestInit) => ({
      ok: true,
      json: async () => ({ ids: [1, 2] }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    render(<AddCards />);
    fireEvent.click(screen.getByRole("button", { name: "Mizuki" }));
    fireEvent.click(screen.getByRole("button", { name: "Mizuki" }));
    expect(screen.getByText("×2")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "新增 2 張" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.cards).toHaveLength(2);
    expect(
      body.cards.every(
        (c: { character: string; rarity: string }) =>
          c.character === "Mizuki" && c.rarity === "R",
      ),
    ).toBe(true);
  });

  it("adds at the chosen rarity and decrements a row with its remove button", () => {
    render(<AddCards />);
    fireEvent.click(screen.getByRole("button", { name: "SR" }));
    fireEvent.click(screen.getByRole("button", { name: "Rei" }));
    fireEvent.click(screen.getByRole("button", { name: "Rei" }));
    expect(screen.getByText("×2")).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: "移除 NEW YEAR Rei SR" }),
    );
    expect(screen.getByText("×1")).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: "移除 NEW YEAR Rei SR" }),
    );
    expect(screen.queryByText("×1")).toBeNull();
    expect(screen.getByText("點上方角色加入卡片")).toBeInTheDocument();
  });

  it("submits each card under the series it was added in, not the last-selected series", async () => {
    const fetchMock = vi.fn(async (_url: string, _init: RequestInit) => ({
      ok: true,
      json: async () => ({ ids: [1, 2] }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    render(<AddCards />);
    // Tally a KILLER SSR, switch series, then tally a NEW YEAR SSR.
    fireEvent.click(screen.getByRole("button", { name: "SSR" }));
    fireEvent.click(screen.getByRole("button", { name: "KILLER" }));
    fireEvent.click(screen.getByRole("button", { name: "Koyuki" }));
    fireEvent.click(screen.getByRole("button", { name: "NEW YEAR" }));
    fireEvent.click(screen.getByRole("button", { name: "Hitomi" }));

    fireEvent.click(screen.getByRole("button", { name: "新增 2 張" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());

    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.cards).toContainEqual(
      expect.objectContaining({
        series: "KILLER",
        character: "Koyuki",
        rarity: "SSR",
      }),
    );
    expect(body.cards).toContainEqual(
      expect.objectContaining({
        series: "NEW YEAR",
        character: "Hitomi",
        rarity: "SSR",
      }),
    );
  });

  it("keeps tally entries under their own series when the series selector changes", () => {
    render(<AddCards />);
    fireEvent.click(screen.getByRole("button", { name: "MP 4TH" }));
    fireEvent.click(screen.getByRole("button", { name: "KSP" }));
    expect(
      screen.getByRole("button", { name: "新增 1 張" }),
    ).toBeInTheDocument();

    // Switching the selector must NOT drop the MP 4TH-only KSP row; it stays
    // tallied under MP 4TH even though NEW YEAR has no KSP.
    fireEvent.click(screen.getByRole("button", { name: "NEW YEAR" }));
    expect(screen.getByText("KSP")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "新增 1 張" }),
    ).toBeInTheDocument();
  });

  it("records a mixed-series opening with no series (NULL)", async () => {
    const fetchMock = vi.fn(async (_url: string, _init: RequestInit) => ({
      ok: true,
      json: async () => ({ ids: [1, 2] }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    render(<AddCards />);
    fireEvent.click(screen.getByRole("button", { name: "SSR" }));
    fireEvent.click(screen.getByRole("button", { name: "KILLER" }));
    fireEvent.click(screen.getByRole("button", { name: "Koyuki" }));
    fireEvent.click(screen.getByRole("button", { name: "NEW YEAR" }));
    fireEvent.click(screen.getByRole("button", { name: "Hitomi" }));

    fireEvent.click(screen.getByLabelText(/這是一次開箱/));
    fireEvent.change(screen.getByLabelText("開箱日期"), {
      target: { value: "2026-06-28" },
    });

    fireEvent.click(screen.getByRole("button", { name: "新增 2 張" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.opening.openedAt).toBe("2026-06-28");
    expect(body.opening.series ?? null).toBeNull();
  });

  it("records a single-series opening under that series", async () => {
    const fetchMock = vi.fn(async (_url: string, _init: RequestInit) => ({
      ok: true,
      json: async () => ({ ids: [1] }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    render(<AddCards />);
    fireEvent.click(screen.getByRole("button", { name: "SSR" }));
    fireEvent.click(screen.getByRole("button", { name: "KILLER" }));
    fireEvent.click(screen.getByRole("button", { name: "Koyuki" }));

    fireEvent.click(screen.getByLabelText(/這是一次開箱/));
    fireEvent.change(screen.getByLabelText("開箱日期"), {
      target: { value: "2026-06-28" },
    });

    fireEvent.click(screen.getByRole("button", { name: "新增 1 張" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.opening.series).toBe("KILLER");
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

  it("shows a 預約中 badge for cards whose type has a pending give", async () => {
    const rows = [
      {
        id: 1,
        series: "KILLER",
        character: "Iruni",
        rarity: "SSR",
        status: "owned",
        source: "pull",
        askingPrice: null,
        wantInReturn: null,
        note: null,
        duplicate: false,
        reservedGive: 1,
      },
    ];
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, json: async () => rows })),
    );
    render(<ManageCards />);
    await waitFor(() => expect(screen.getByText("Iruni")).toBeInTheDocument());
    expect(screen.getByText(/預約中/)).toBeInTheDocument();
  });

  it("hides the 預約中 badge on a sold/traded row even when its type is reserved", async () => {
    const rows = [
      {
        id: 1,
        series: "KILLER",
        character: "Iruni",
        rarity: "SSR",
        status: "traded",
        source: "pull",
        askingPrice: null,
        wantInReturn: null,
        note: null,
        duplicate: false,
        reservedGive: 1,
      },
    ];
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, json: async () => rows })),
    );
    render(<ManageCards />);
    await waitFor(() => expect(screen.getByText("Iruni")).toBeInTheDocument());
    expect(screen.queryByText(/預約中/)).toBeNull();
  });
});

// Overview where every type is missing except two duplicates we can give away.
const overviewJson = () => ({
  cells: buildCatalog().map((c, i) => ({
    catalogId: i + 1,
    series: c.series,
    character: c.character,
    rarity: c.rarity,
    owned:
      c.series === "MP 4TH" && c.character === "Mizuki" && c.rarity === "R"
        ? 2
        : 0,
  })),
  progress: [],
});

function stubFetchFor(pending: unknown[]) {
  return vi.fn(async (url: string, _init?: RequestInit) => {
    if (url === "/api/overview")
      return { ok: true, json: async () => overviewJson() };
    if (url === "/api/admin/pending-trades")
      return { ok: true, json: async () => pending };
    return { ok: true, json: async () => ({ ok: true }) };
  });
}

const sampleReservation = {
  id: 9,
  reservedAt: "2026-06-27",
  counterparty: "阿明",
  note: "面交",
  give: [
    {
      direction: "give",
      catalogId: 5,
      series: "MP 4TH",
      character: "Mizuki",
      rarity: "R",
      qty: 1,
    },
  ],
  receive: [
    {
      direction: "receive",
      catalogId: 6,
      series: "KILLER",
      character: "Rei",
      rarity: "SR",
      qty: 1,
    },
  ],
};

describe("PendingTrades", () => {
  it("renders the form and an existing reservation with 完成/取消", async () => {
    vi.stubGlobal("fetch", stubFetchFor([sampleReservation]));

    render(<PendingTrades />);
    await waitFor(() =>
      expect(screen.getByText("交換預約")).toBeInTheDocument(),
    );
    expect(screen.getByText("阿明")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "完成" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "取消" })).toBeInTheDocument();
  });

  it("completing a reservation POSTs to /complete", async () => {
    const fetchMock = stubFetchFor([sampleReservation]);
    vi.stubGlobal("fetch", fetchMock);

    render(<PendingTrades />);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "完成" })).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByRole("button", { name: "完成" }));
    fireEvent.click(screen.getByRole("button", { name: "確認完成" }));

    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(([u]) =>
          u.endsWith("/api/admin/pending-trades/9/complete"),
        ),
      ).toBe(true),
    );
    const call = fetchMock.mock.calls.find(([u]) =>
      u.endsWith("/api/admin/pending-trades/9/complete"),
    );
    expect(call?.[1]?.method).toBe("POST");
  });

  it("cancelling a reservation sends DELETE", async () => {
    const fetchMock = stubFetchFor([sampleReservation]);
    vi.stubGlobal("fetch", fetchMock);

    render(<PendingTrades />);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "取消" })).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByRole("button", { name: "取消" }));

    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(([u]) =>
          u.endsWith("/api/admin/pending-trades/9"),
        ),
      ).toBe(true),
    );
    const call = fetchMock.mock.calls.find(([u]) =>
      u.endsWith("/api/admin/pending-trades/9"),
    );
    expect(call?.[1]?.method).toBe("DELETE");
  });

  it("surfaces a failed completion (Fix 1)", async () => {
    const fetchMock = vi.fn(async (url: string, _init?: RequestInit) => {
      if (url === "/api/overview")
        return { ok: true, json: async () => overviewJson() };
      if (url === "/api/admin/pending-trades")
        return { ok: true, json: async () => [sampleReservation] };
      if (url.endsWith("/api/admin/pending-trades/9/complete"))
        return { ok: false, status: 500, json: async () => ({}) };
      return { ok: true, json: async () => ({ ok: true }) };
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<PendingTrades />);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "完成" })).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByRole("button", { name: "完成" }));
    fireEvent.click(screen.getByRole("button", { name: "確認完成" }));

    expect(await screen.findByText(/500/)).toBeInTheDocument();
  });

  it("lists the whole catalog in one 換入 section with 持有/缺/已預定 hints", async () => {
    // sampleReservation receives KILLER Rei SR (owned 0, pending-incoming).
    vi.stubGlobal("fetch", stubFetchFor([sampleReservation]));

    render(<PendingTrades />);
    await waitFor(() =>
      expect(screen.getByText("交換預約")).toBeInTheDocument(),
    );

    // Give side unchanged: surplus only, 餘 hint.
    fireEvent.click(screen.getByRole("button", { name: "＋ 新增給出" }));
    expect(screen.getByText("MP 4TH Mizuki R（餘 1）")).toBeInTheDocument();

    // One unified 換入 list: owned, plain-missing, and already-incoming together.
    fireEvent.click(screen.getByRole("button", { name: "＋ 新增換入" }));
    expect(screen.getByText("MP 4TH Mizuki R（持有 2）")).toBeInTheDocument();
    expect(
      screen.getByText("KILLER Rei SR（缺・已預定換入 1）"),
    ).toBeInTheDocument();
    expect(
      screen.getAllByText(/（缺）$/, { selector: "option" }).length,
    ).toBeGreaterThan(0);
  });

  it("can receive an already-owned card through the unified 換入 list", async () => {
    const fetchMock = stubFetchFor([]);
    vi.stubGlobal("fetch", fetchMock);

    render(<PendingTrades />);
    await waitFor(() =>
      expect(screen.getByText("交換預約")).toBeInTheDocument(),
    );

    fireEvent.click(screen.getByRole("button", { name: "＋ 新增給出" }));
    fireEvent.click(screen.getByRole("button", { name: "＋ 新增換入" }));

    // Pick the owned card MP 4TH Mizuki R (持有 2) in the 換入 dropdown.
    const owned = screen.getByText("MP 4TH Mizuki R（持有 2）");
    const select = owned.closest("select");
    if (select) {
      fireEvent.change(select, {
        target: { value: owned.getAttribute("value") ?? "" },
      });
    }
    fireEvent.click(screen.getByRole("button", { name: "新增預約" }));

    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(
          ([u, init]) =>
            u === "/api/admin/pending-trades" && init?.method === "POST",
        ),
      ).toBe(true),
    );
    const call = fetchMock.mock.calls.find(
      ([u, init]) =>
        u === "/api/admin/pending-trades" && init?.method === "POST",
    );
    const body = JSON.parse(call?.[1]?.body as string);
    expect(body.receive).toContainEqual(
      expect.objectContaining({
        series: "MP 4TH",
        character: "Mizuki",
        rarity: "R",
        qty: 1,
      }),
    );
  });
});
