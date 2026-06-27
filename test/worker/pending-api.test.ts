import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";

const send = (method: string, path: string, body?: unknown) =>
  SELF.fetch(`https://example.com${path}`, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
const getJson = async <T>(path: string): Promise<T> =>
  (await SELF.fetch(`https://example.com${path}`)).json() as Promise<T>;

describe("pending-trade api", () => {
  it("creates via admin, exposes it publicly WITHOUT counterparty/note", async () => {
    const res = await send("POST", "/api/admin/pending-trades", {
      counterparty: "Zoe",
      reservedAt: "2026-06-27",
      note: "private",
      give: [{ series: "KILLER", character: "Rei", rarity: "UR", qty: 1 }],
      receive: [
        { series: "NEW YEAR", character: "Sachi", rarity: "R", qty: 1 },
      ],
    });
    expect(res.status).toBe(200);
    const { id } = (await res.json()) as { id: number };

    const admin = await getJson<
      Array<{ id: number; counterparty: string | null }>
    >("/api/admin/pending-trades");
    expect(admin.find((r) => r.id === id)?.counterparty).toBe("Zoe");

    const pub = await getJson<Array<Record<string, unknown>>>(
      "/api/pending-trades",
    );
    const row = pub.find((r) => r.id === id);
    expect(row).toBeTruthy();
    expect("counterparty" in (row ?? {})).toBe(false);
    expect("note" in (row ?? {})).toBe(false);
  });

  it("rejects a reservation with no give lines (400)", async () => {
    const res = await send("POST", "/api/admin/pending-trades", {
      reservedAt: "2026-06-27",
      give: [],
      receive: [],
    });
    expect(res.status).toBe(400);
  });

  it("cancel deletes the reservation", async () => {
    const { id } = (await (
      await send("POST", "/api/admin/pending-trades", {
        reservedAt: "2026-06-27",
        give: [{ series: "KILLER", character: "998", rarity: "R", qty: 1 }],
        receive: [],
      })
    ).json()) as { id: number };
    const del = await send("DELETE", `/api/admin/pending-trades/${id}`);
    expect(del.status).toBe(200);
    const pub = await getJson<Array<{ id: number }>>("/api/pending-trades");
    expect(pub.some((r) => r.id === id)).toBe(false);
  });
});
