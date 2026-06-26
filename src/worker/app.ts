import { Hono } from "hono";
import type {
  AddCardInput,
  OpeningInput,
  RecordTxnInput,
  UpdateCardInput,
} from "../shared/types";
import { accessGuard } from "./auth";
import {
  addCards,
  createOpening,
  getMarket,
  getMissing,
  getOpenings,
  getOverview,
  getStats,
  getTransactions,
  listCards,
  recordTransaction,
  updateCard,
} from "./db/queries";
import type { Env } from "./index";

export const app = new Hono<{ Bindings: Env }>();

// ---- Public read API (no auth) ----
app.get("/api/overview", async (c) => c.json(await getOverview(c.env.DB)));
app.get("/api/missing", async (c) => c.json(await getMissing(c.env.DB)));
app.get("/api/market", async (c) => c.json(await getMarket(c.env.DB)));
app.get("/api/stats", async (c) => c.json(await getStats(c.env.DB)));

// ---- Admin write API (gated by Cloudflare Access) ----
const admin = new Hono<{ Bindings: Env }>();
admin.use("*", accessGuard);

admin.get("/cards", async (c) =>
  c.json(
    await listCards(c.env.DB, {
      series: c.req.query("series"),
      status: c.req.query("status"),
    }),
  ),
);

admin.post("/cards", async (c) => {
  const body = await c.req.json<{
    cards: AddCardInput[];
    opening?: OpeningInput;
  }>();
  if (!Array.isArray(body.cards) || body.cards.length === 0) {
    return c.json({ error: "cards required" }, 400);
  }
  const openingId = body.opening
    ? await createOpening(c.env.DB, body.opening)
    : undefined;
  const ids = await addCards(c.env.DB, body.cards, openingId);
  return c.json({ ids });
});

admin.patch("/cards/:id", async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id)) return c.json({ error: "bad id" }, 400);
  const body = await c.req.json<UpdateCardInput>();
  await updateCard(c.env.DB, id, body);
  return c.json({ ok: true });
});

admin.post("/openings", async (c) => {
  const body = await c.req.json<OpeningInput>();
  if (!body.openedAt) return c.json({ error: "openedAt required" }, 400);
  const id = await createOpening(c.env.DB, body);
  return c.json({ id });
});

admin.get("/openings", async (c) => c.json(await getOpenings(c.env.DB)));

admin.post("/transactions", async (c) => {
  const body = await c.req.json<{ cardId: number } & RecordTxnInput>();
  if (!body.cardId || !body.type || !body.happenedAt) {
    return c.json({ error: "cardId, type, happenedAt required" }, 400);
  }
  const id = await recordTransaction(c.env.DB, body.cardId, body);
  return c.json({ id });
});

admin.get("/transactions", async (c) =>
  c.json(await getTransactions(c.env.DB)),
);

app.route("/api/admin", admin);

export default app;
