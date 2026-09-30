import {
  act,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import Admin from "../../src/client/admin/Admin";
import { usePendingTaskCounts } from "../../src/client/admin/PendingTaskOverview";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status });
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("pending task overview", () => {
  it("opens the matching reservation tab and updates the count after completion", async () => {
    let purchases = [
      {
        id: 7,
        seller: "Shop",
        orderedAt: "2026-09-30",
        note: null,
        lines: [
          {
            catalogId: 1,
            series: "KILLER",
            character: "Rei",
            rarity: "UR",
            qty: 5,
            unitPrice: 100,
          },
        ],
      },
    ];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        if (url === "/api/admin/pending-purchases") return json(purchases);
        if (url === "/api/admin/pending-purchases/7/complete") {
          purchases = [];
          return json({ ok: true });
        }
        if (url === "/api/admin/pending-trades") return json([]);
        if (url === "/api/admin/pending-sales")
          return json([{ id: 1 }, { id: 2 }]);
        if (url === "/api/admin/trade-posts/candidates")
          return json({ give: [], want: [] });
        if (init?.method) return json({ ok: true });
        return json([]);
      }),
    );
    history.replaceState(null, "", "/admin#posts");
    render(<Admin />);
    const tasks = within(screen.getByRole("region", { name: "待處理交易" }));
    fireEvent.click(
      await tasks.findByRole("button", { name: "前往購入待收（1 筆）" }),
    );
    expect(screen.getByRole("tab", { name: "購入預約" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    fireEvent.click(await screen.findByRole("button", { name: "確認收貨" }));
    fireEvent.click(screen.getByRole("button", { name: "確定收貨" }));
    await tasks.findByRole("button", { name: "前往購入待收（0 筆）" });
    expect(
      tasks.getByRole("button", { name: "前往出售待完成（2 筆）" }),
    ).toBeInTheDocument();
  });

  it("keeps successful counts and does not treat failed requests as zero", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        url.endsWith("pending-sales")
          ? json({ error: "Unavailable" }, 503)
          : json([{}, {}]),
      ),
    );
    const { result } = renderHook(() => usePendingTaskCounts(true, "posts"));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.counts).toEqual({
      purchase: 2,
      reserve: 2,
      sales: null,
    });
  });

  it("does not overwrite a newer panel count with an older refresh response", async () => {
    let finish!: (response: Response) => void;
    const delayed = new Promise<Response>((resolve) => {
      finish = resolve;
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        url.endsWith("pending-purchases") ? delayed : json([]),
      ),
    );
    const { result } = renderHook(() => usePendingTaskCounts(true, "posts"));
    await waitFor(() => expect(result.current.loading).toBe(true));
    act(() => result.current.updateCount("purchase", 0));
    await act(async () => {
      finish(json([{}]));
    });
    expect(result.current.counts.purchase).toBe(0);
    expect(result.current.loading).toBe(false);
  });

  it("ignores responses from a previous section after navigation", async () => {
    let finish!: (response: Response) => void;
    const delayed = new Promise<Response>((resolve) => {
      finish = resolve;
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => delayed),
    );
    const { result, rerender } = renderHook(
      ({ enabled }) => usePendingTaskCounts(enabled, "posts"),
      { initialProps: { enabled: true } },
    );
    rerender({ enabled: false });
    await act(async () => {
      finish(json([{}]));
    });
    expect(result.current.counts).toEqual({
      purchase: null,
      reserve: null,
      sales: null,
    });
  });
});
