import { Hono } from "hono";
import { getMarket, getMissing, getOverview, getStats } from "./db/queries";
import type { Env } from "./index";

export const app = new Hono<{ Bindings: Env }>();

// ---- Public read API (no auth) ----
app.get("/api/overview", async (c) => c.json(await getOverview(c.env.DB)));
app.get("/api/missing", async (c) => c.json(await getMissing(c.env.DB)));
app.get("/api/market", async (c) => c.json(await getMarket(c.env.DB)));
app.get("/api/stats", async (c) => c.json(await getStats(c.env.DB)));

export default app;
