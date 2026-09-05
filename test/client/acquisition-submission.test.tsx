import {
  act,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AddCards } from "../../src/client/admin/AddCards";
import { ManageCards } from "../../src/client/admin/ManageCards";
import { QuickPackOpening } from "../../src/client/admin/QuickPackOpening";
import { postCards } from "../../src/client/api";
import { useAcquisitionSubmission } from "../../src/client/lib/acquisition";

const card = {
  series: "NEW YEAR",
  character: "Mizuki",
  rarity: "R" as const,
  source: "pull" as const,
};
const request = { cards: [card] };
const json = (
  body: unknown,
  status = 200,
  headers: Record<string, string> = {},
) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

function keyOf(init?: RequestInit) {
  return new Headers(init?.headers).get("Idempotency-Key");
}

beforeEach(() => sessionStorage.clear());
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("acquisition operation identity", () => {
  it("fails closed when a stored operation has an empty retry key", async () => {
    sessionStorage.setItem(
      "mpc:pending-acquisition:invalid-key",
      JSON.stringify({ id: "", request, uncertain: true }),
    );
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { result } = renderHook(() =>
      useAcquisitionSubmission("invalid-key"),
    );
    expect(result.current.locked).toBe(true);
    expect(result.current.error).toContain("無法讀取未確認");
    await act(async () => {
      await result.current.submit(() => request);
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("keeps no-key API callers compatible and sends an explicit key when supplied", async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) =>
      json({ ids: [1] }),
    );
    vi.stubGlobal("fetch", fetchMock);
    await postCards([card]);
    await postCards([card], undefined, undefined, "operation-1");
    expect(keyOf(fetchMock.mock.calls[0][1])).toBeNull();
    expect(keyOf(fetchMock.mock.calls[1][1])).toBe("operation-1");
  });

  it("replays a frozen payload after a lost acknowledgement and rotates only after success", async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) =>
      json({ ids: [1] }),
    );
    fetchMock.mockRejectedValueOnce(new TypeError("connection lost"));
    vi.stubGlobal("fetch", fetchMock);
    const { result } = renderHook(() => useAcquisitionSubmission("test"), {
      wrapper: StrictMode,
    });
    await act(async () => {
      await result.current.submit(() => request);
    });
    expect(result.current.locked).toBe(true);
    const changedRequest = vi.fn(() => ({
      cards: [{ ...card, character: "Rei" }],
    }));
    await act(async () => {
      await result.current.submit(changedRequest);
    });
    expect(changedRequest).not.toHaveBeenCalled();
    expect(fetchMock.mock.calls[1][1]?.body).toBe(
      fetchMock.mock.calls[0][1]?.body,
    );
    expect(keyOf(fetchMock.mock.calls[1][1])).toBe(
      keyOf(fetchMock.mock.calls[0][1]),
    );
    expect(result.current.locked).toBe(false);
    await act(async () => {
      await result.current.submit(() => request);
    });
    expect(keyOf(fetchMock.mock.calls[2][1])).not.toBe(
      keyOf(fetchMock.mock.calls[1][1]),
    );
    expect(sessionStorage.length).toBe(0);
  });

  it("recovers an unresolved operation after the form unmounts", async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) =>
      json({ ids: [1] }),
    );
    fetchMock.mockRejectedValueOnce(new TypeError("connection lost"));
    vi.stubGlobal("fetch", fetchMock);
    const first = renderHook(() => useAcquisitionSubmission("recover"));
    await act(async () => {
      await first.result.current.submit(() => request);
    });
    first.unmount();
    const second = renderHook(() => useAcquisitionSubmission("recover"), {
      wrapper: StrictMode,
    });
    expect(second.result.current.locked).toBe(true);
    await act(async () => {
      await second.result.current.submit(() => ({ cards: [] }));
    });
    expect(keyOf(fetchMock.mock.calls[1][1])).toBe(
      keyOf(fetchMock.mock.calls[0][1]),
    );
    expect(fetchMock.mock.calls[1][1]?.body).toBe(
      fetchMock.mock.calls[0][1]?.body,
    );
  });

  it("guards same-tick submissions and does not unlock an unknown operation on a later conflict", async () => {
    const pending = deferred<Response>();
    const fetchMock = vi.fn(
      (_url: string, _init?: RequestInit) => pending.promise,
    );
    vi.stubGlobal("fetch", fetchMock);
    const { result } = renderHook(() => useAcquisitionSubmission("busy"));
    let first!: Promise<unknown>;
    act(() => {
      first = result.current.submit(() => request);
      void result.current.submit(() => request);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await act(async () => {
      pending.reject(new TypeError("connection lost"));
      await first;
    });
    fetchMock.mockResolvedValue(json({ error: "payload conflict" }, 409));
    await act(async () => {
      await result.current.submit(() => ({ cards: [] }));
    });
    expect(result.current.locked).toBe(true);
    expect(keyOf(fetchMock.mock.calls[1][1])).toBe(
      keyOf(fetchMock.mock.calls[0][1]),
    );
  });

  it.each([400, 422, 500])(
    "keeps the original operation frozen after HTTP %i without a committed-outcome contract",
    async (status) => {
      const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) =>
        json({ ids: [1] }),
      );
      fetchMock.mockResolvedValueOnce(
        json({ error: "request failed" }, status),
      );
      vi.stubGlobal("fetch", fetchMock);
      const { result } = renderHook(() =>
        useAcquisitionSubmission("http-failure"),
      );
      await act(async () => {
        await result.current.submit(() => request);
      });
      expect(result.current.locked).toBe(true);
      expect(result.current.error).toContain("未能確認入藏結果");
      expect(result.current.error).not.toContain("尚未寫入");
      const changedRequest = vi.fn(() => ({
        cards: [{ ...card, character: "Rei" }],
      }));
      await act(async () => {
        await result.current.submit(changedRequest);
      });
      expect(changedRequest).not.toHaveBeenCalled();
      expect(keyOf(fetchMock.mock.calls[1][1])).toBe(
        keyOf(fetchMock.mock.calls[0][1]),
      );
      expect(fetchMock.mock.calls[1][1]?.body).toBe(
        fetchMock.mock.calls[0][1]?.body,
      );
      expect(result.current.locked).toBe(false);
      expect(sessionStorage.length).toBe(0);
    },
  );

  it("does not trust a restored operation's earlier HTTP-based rejection classification", async () => {
    sessionStorage.setItem(
      "mpc:pending-acquisition:restored-rejection",
      JSON.stringify({
        id: "original-operation",
        request,
        uncertain: false,
      }),
    );
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) =>
      json({ ids: [1] }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const { result } = renderHook(() =>
      useAcquisitionSubmission("restored-rejection"),
    );
    expect(result.current.locked).toBe(true);
    const changedRequest = vi.fn(() => ({ cards: [] }));
    await act(async () => {
      await result.current.submit(changedRequest);
    });

    expect(changedRequest).not.toHaveBeenCalled();
    expect(keyOf(fetchMock.mock.calls[0][1])).toBe("original-operation");
    expect(fetchMock.mock.calls[0][1]?.body).toBe(JSON.stringify(request));
  });

  it("allows correcting an explicitly rejected first submission without changing its key", async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) =>
      json({ ids: [1] }),
    );
    fetchMock.mockResolvedValueOnce(
      json({ error: "unknown card type" }, 400, {
        "x-acquisition-outcome": "rejected",
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const first = renderHook(() => useAcquisitionSubmission("rejected"));
    await act(async () => {
      await first.result.current.submit(() => request);
    });
    expect(first.result.current.locked).toBe(false);
    expect(first.result.current.error).toContain("尚未寫入");
    first.unmount();
    const second = renderHook(() => useAcquisitionSubmission("rejected"));
    expect(second.result.current.locked).toBe(false);
    const correction = { cards: [{ ...card, character: "Rei" }] };
    await act(async () => {
      await second.result.current.submit(() => correction);
    });
    expect(keyOf(fetchMock.mock.calls[1][1])).toBe(
      keyOf(fetchMock.mock.calls[0][1]),
    );
    expect(JSON.parse(String(fetchMock.mock.calls[1][1]?.body))).toEqual(
      correction,
    );
    expect(sessionStorage.length).toBe(0);
  });
});

function acquisitionApi() {
  const committed = new Map<string, unknown>();
  let loseAcknowledgement = true;
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (url === "/api/catalog") {
      return json([
        {
          name: "NEW YEAR",
          volume: 1,
          sortOrder: 0,
          characters: ["Mizuki"],
          rarities: ["R"],
        },
      ]);
    }
    if (url === "/api/overview") {
      return json({
        cells: [
          {
            catalogId: 1,
            ...card,
            volume: 1,
            owned: committed.size,
            reserved: 0,
            held: 0,
            available: committed.size,
            wantCount: 0,
            incomingTrade: 0,
            incomingPurchase: 0,
          },
        ],
        progress: [],
      });
    }
    if (url.includes("/openings/next"))
      return json({ packNumber: committed.size + 1 });
    if (init?.method === "POST" && url === "/api/admin/cards") {
      const key = keyOf(init);
      if (!key) throw new Error("missing operation identity");
      const body = JSON.parse(init.body as string);
      if (!committed.has(key)) {
        committed.set(key, {
          ids: [committed.size + 1],
          ...(body.opening
            ? {
                opening: {
                  id: committed.size + 1,
                  volume: body.opening.volume,
                  packNumber: committed.size + 1,
                },
              }
            : {}),
        });
      }
      if (loseAcknowledgement) {
        loseAcknowledgement = false;
        throw new TypeError("connection lost after commit");
      }
      return json(committed.get(key));
    }
    if (url === "/api/admin/cards" || url.includes("/activities"))
      return json([]);
    throw new Error(`unexpected request: ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);
  return { committed, fetchMock };
}

describe("acquisition forms", () => {
  it("freezes every quick-pack draft control until a deferred submission completes", async () => {
    const { fetchMock } = acquisitionApi();
    const previous = fetchMock.getMockImplementation();
    if (!previous) throw new Error("missing acquisition API fixture");
    const response = deferred<Response>();
    fetchMock.mockImplementation((url, init) =>
      init?.method === "POST" ? response.promise : previous(url, init),
    );
    render(<QuickPackOpening />);
    fireEvent.click(
      await screen.findByRole("button", {
        name: "加入 NEW YEAR Mizuki R 一張",
      }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "記錄第 1 包（1 張）" }),
    );
    expect(
      screen.getByRole("button", { name: "加入 NEW YEAR Mizuki R 一張" }),
    ).toBeDisabled();
    expect(screen.getByRole("button", { name: /從本包移除/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: "清空本包" })).toBeDisabled();
    expect(screen.getByRole("radio", { name: "NEW YEAR" })).toBeDisabled();
    expect(screen.getByLabelText("開卡日期")).toBeDisabled();
    expect(screen.getByLabelText("本包花費 (TWD)")).toBeDisabled();
    await act(async () => {
      response.resolve(
        json({ ids: [1], opening: { id: 1, volume: 1, packNumber: 1 } }),
      );
    });
    expect(
      await screen.findByText("第 1 彈第 1 包已記錄（1 張）"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "加入 NEW YEAR Mizuki R 一張" }),
    ).toBeEnabled();
  });

  it("retries a quick pack without duplicating it, then accepts another identical pack", async () => {
    const { committed, fetchMock } = acquisitionApi();
    render(<QuickPackOpening />);
    fireEvent.click(
      await screen.findByRole("button", {
        name: "加入 NEW YEAR Mizuki R 一張",
      }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "記錄第 1 包（1 張）" }),
    );
    await screen.findByText(/未能確認入藏結果/);
    expect(
      screen.getByRole("button", { name: "加入 NEW YEAR Mizuki R 一張" }),
    ).toBeDisabled();
    expect(screen.getByLabelText("本包花費 (TWD)")).toBeDisabled();
    expect(screen.getByRole("button", { name: /從本包移除/ })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "重試確認入藏" }));
    await screen.findByText("第 1 彈第 1 包已記錄（1 張）");
    expect(committed.size).toBe(1);
    fireEvent.click(
      screen.getByRole("button", { name: "加入 NEW YEAR Mizuki R 一張" }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "記錄第 2 包（1 張）" }),
    );
    await screen.findByText("第 1 彈第 2 包已記錄（1 張）");
    expect(committed.size).toBe(2);
    const posts = fetchMock.mock.calls.filter(
      ([, init]) => init?.method === "POST",
    );
    expect(posts[0][1]?.body).toBe(posts[1][1]?.body);
    expect(keyOf(posts[0][1])).toBe(keyOf(posts[1][1]));
    expect(keyOf(posts[2][1])).not.toBe(keyOf(posts[1][1]));
  });

  it("retains batch purchase prices and identity across retry", async () => {
    const { committed, fetchMock } = acquisitionApi();
    render(<AddCards />);
    fireEvent.click(await screen.findByRole("radio", { name: "已收購入" }));
    fireEvent.change(screen.getByLabelText("NEW YEAR Mizuki R 數量"), {
      target: { value: "1" },
    });
    fireEvent.change(screen.getByLabelText("購入總額 (TWD)"), {
      target: { value: "123.45" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "檢查本次入藏（1 張）" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "確認寫入 1 張" }));
    await screen.findByText(/未能確認入藏結果/);
    expect(screen.getByRole("button", { name: "返回修改" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "重試確認入藏" }));
    await screen.findByText("已記錄 1 張已收購入（總額 123.45 TWD）");
    expect(committed.size).toBe(1);
    const posts = fetchMock.mock.calls.filter(
      ([, init]) => init?.method === "POST",
    );
    expect(posts[0][1]?.body).toBe(posts[1][1]?.body);
    expect(keyOf(posts[0][1])).toBe(keyOf(posts[1][1]));
  });

  it("retains a direct purchase and its metadata across retry", async () => {
    const { committed, fetchMock } = acquisitionApi();
    render(<ManageCards />);
    fireEvent.click(await screen.findByRole("radio", { name: "全部卡位" }));
    fireEvent.click(
      await screen.findByRole("button", {
        name: "開啟 NEW YEAR Mizuki R 卡片工作面板",
      }),
    );
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "記錄購入" }));
    fireEvent.change(within(dialog).getByLabelText("購入總額 (TWD)"), {
      target: { value: "100" },
    });
    fireEvent.change(within(dialog).getByLabelText("賣家 / 來源"), {
      target: { value: "Shop" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "記錄購入" }));
    await within(dialog).findByText(/未能確認入藏結果/);
    expect(within(dialog).getByLabelText("購入總額 (TWD)")).toBeDisabled();
    fireEvent.click(
      within(dialog).getByRole("button", { name: "重試確認入藏" }),
    );
    await waitFor(() => expect(committed.size).toBe(1));
    await waitFor(() =>
      expect(
        within(dialog).queryByRole("button", { name: "重試確認入藏" }),
      ).toBeNull(),
    );
    const posts = fetchMock.mock.calls.filter(
      ([, init]) => init?.method === "POST",
    );
    expect(posts).toHaveLength(2);
    expect(posts[0][1]?.body).toBe(posts[1][1]?.body);
    expect(keyOf(posts[0][1])).toBe(keyOf(posts[1][1]));
  });
});
