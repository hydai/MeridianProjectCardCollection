import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { Link, MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import TradePostPage from "../../src/client/TradePostPage";
import type { TradePost } from "../../src/shared/types";

function post(publicId: string): TradePost {
  return {
    id: publicId === "a" ? 1 : 2,
    publicId,
    status: "published",
    note: `${publicId} 的交換內容`,
    createdAt: "2026-09-02 02:00:00",
    updatedAt: "2026-09-02 02:00:00",
    publishedAt: "2026-09-02 02:00:00",
    closedAt: null,
    stale: false,
    give: [],
    want: [],
  };
}

function setup(writeText: (text: string) => Promise<void>) {
  vi.stubGlobal(
    "navigator",
    Object.assign(Object.create(navigator), {
      clipboard: { writeText },
    }),
  );
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async (url: string) =>
        new Response(JSON.stringify(post(url.endsWith("/a") ? "a" : "b"))),
    ),
  );
  return render(
    <MemoryRouter initialEntries={["/exchange/a"]}>
      <Link to="/exchange/b">另一則公告</Link>
      <Routes>
        <Route path="/exchange/:publicId" element={<TradePostPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("trade post page feedback", () => {
  it("clears the copy-feedback timer when the page unmounts", async () => {
    const setTimer = vi.spyOn(globalThis, "setTimeout");
    const clearTimer = vi.spyOn(globalThis, "clearTimeout");
    const page = setup(async () => {});
    await screen.findByText("a 的交換內容");
    fireEvent.click(screen.getByRole("button", { name: "複製網址" }));
    await screen.findByRole("button", { name: "已複製" });
    const timerIndex = setTimer.mock.calls.findIndex(
      ([, delay]) => delay === 2000,
    );
    expect(timerIndex).toBeGreaterThanOrEqual(0);
    const timer = setTimer.mock.results[timerIndex].value;
    page.unmount();
    expect(clearTimer).toHaveBeenCalledWith(timer);
  });

  it("keeps loaded contents visible after clipboard failure and clears feedback on retry", async () => {
    const writeText = vi.fn(async () => {});
    writeText.mockRejectedValueOnce(new Error("permission denied"));
    setup(writeText);
    await screen.findByText("a 的交換內容");
    fireEvent.click(screen.getByRole("button", { name: "複製網址" }));
    await screen.findByText("無法複製網址");
    expect(screen.getByText("a 的交換內容")).toBeInTheDocument();
    expect(screen.queryByText("無法開啟這則公告")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "複製網址" }));
    await screen.findByRole("button", { name: "已複製" });
    expect(screen.queryByText("無法複製網址")).toBeNull();
  });

  it("ignores a clipboard failure from the previously displayed announcement", async () => {
    let reject!: (reason: unknown) => void;
    const pending = new Promise<void>((_resolve, no) => {
      reject = no;
    });
    setup(() => pending);
    await screen.findByText("a 的交換內容");
    fireEvent.click(screen.getByRole("button", { name: "複製網址" }));
    fireEvent.click(screen.getByRole("link", { name: "另一則公告" }));
    await screen.findByText("b 的交換內容");
    await act(async () => {
      reject(new Error("old clipboard request failed"));
    });
    await waitFor(() => expect(screen.queryByText("無法複製網址")).toBeNull());
    expect(screen.getByText("b 的交換內容")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "複製網址" }),
    ).toBeInTheDocument();
  });
});
