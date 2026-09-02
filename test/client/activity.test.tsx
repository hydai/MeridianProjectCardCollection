import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Activity } from "../../src/client/admin/Activity";
import type { ActivityEvent } from "../../src/shared/types";

const acquisition: ActivityEvent = {
  id: 41,
  kind: "opening",
  occurredAt: "2026-09-02 10:53:00",
  sourceType: "opening",
  sourceId: 12,
  counterparty: null,
  amount: 200,
  note: "第四彈",
  revertsEventId: null,
  reversedAt: null,
  createdAt: "2026-09-02 10:53:00",
  canUndo: true,
  lines: [
    {
      catalogId: 1,
      series: "SUMMER BEACH & YOU",
      character: "Mizuki",
      rarity: "UR",
      action: "acquired",
      qty: 1,
      delta: 1,
      beforeStatus: null,
      afterStatus: "owned",
      unitAmount: null,
      note: null,
    },
  ],
};

const sale: ActivityEvent = {
  id: 40,
  kind: "sale",
  occurredAt: "2026-09-01",
  sourceType: "card",
  sourceId: 5,
  counterparty: "Alice",
  amount: 300,
  note: null,
  revertsEventId: null,
  reversedAt: null,
  createdAt: "2026-09-01 12:00:00",
  canUndo: false,
  lines: [
    {
      catalogId: 2,
      series: "COLLEGE",
      character: "Rei",
      rarity: "SR",
      action: "given",
      qty: 1,
      delta: -1,
      beforeStatus: "owned",
      afterStatus: "sold",
      unitAmount: null,
      note: null,
    },
  ],
};

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("Activity", () => {
  it("shows acquisitions, adjustments, and trades in one filterable stream", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => [acquisition, sale],
      })),
    );

    render(<Activity />);

    expect(await screen.findByText("開卡入藏")).toBeInTheDocument();
    expect(screen.getByText("售出卡片")).toBeInTheDocument();
    expect(screen.getByText("SUMMER BEACH & YOU · Mizuki")).toBeInTheDocument();
    expect(screen.getByText(/Alice/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "交易" }));
    expect(screen.queryByText("開卡入藏")).toBeNull();
    expect(screen.getByText("售出卡片")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "全部" }));
    expect(screen.getByText("開卡入藏")).toBeInTheDocument();
  });

  it("requires confirmation, calls undo, and keeps both audit entries", async () => {
    let rows = [acquisition];
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url === "/api/admin/activities/41/undo" && init?.method === "POST") {
        rows = [
          {
            ...acquisition,
            canUndo: false,
            reversedAt: "2026-09-02 11:00:00",
          },
          {
            ...acquisition,
            id: 42,
            kind: "undo" as const,
            amount: null,
            note: "撤銷 #41",
            revertsEventId: 41,
            reversedAt: null,
            canUndo: false,
            lines: [
              { ...acquisition.lines[0], action: "undone" as const, delta: -1 },
            ],
          },
        ];
        return { ok: true, json: async () => ({ ok: true }) };
      }
      return { ok: true, json: async () => rows };
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<Activity />);
    fireEvent.click(
      await screen.findByRole("button", { name: "復原這筆入藏" }),
    );
    expect(screen.getByText("將移除這筆新增的卡片")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "確認復原" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/admin/activities/41/undo",
        expect.objectContaining({ method: "POST" }),
      ),
    );
    expect(
      await screen.findByText("已復原入藏；原痕跡與復原痕跡都會保留。"),
    ).toBeInTheDocument();
    expect(screen.getByText("復原入藏紀錄")).toBeInTheDocument();
    expect(screen.getByText("已復原")).toBeInTheDocument();
  });
});
