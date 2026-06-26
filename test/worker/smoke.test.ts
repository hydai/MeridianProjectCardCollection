import { SELF, env } from "cloudflare:test";
import { describe, expect, it } from "vitest";

describe("worker", () => {
  it("answers /api with ok", async () => {
    const res = await SELF.fetch("https://example.com/api/ping");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });
});
