import { Hono } from "hono";
import { RARITY_ORDER, canonicalizeRarities } from "../shared/rarity";
import type {
  AddCardInput,
  CompleteReservationInput,
  CreatePurchaseReservationInput,
  CreateReservationInput,
  CreateSeriesInput,
  OpeningInput,
  RecordTxnInput,
  UpdateCardInput,
} from "../shared/types";
import { accessGuard } from "./auth";
import {
  addCards,
  addPack,
  cancelPurchaseReservation,
  cancelReservation,
  completePurchaseReservation,
  completeReservation,
  createOpening,
  createPurchaseReservation,
  createReservation,
  createSeries,
  getAdminPendingPurchases,
  getAdminPendingTrades,
  getCatalog,
  getMarket,
  getMissing,
  getNextPackNumber,
  getOpenings,
  getOverview,
  getPublicPendingPurchases,
  getPublicPendingTrades,
  getStats,
  getTransactions,
  listCards,
  recordTransaction,
  setCardHeld,
  updateCard,
} from "./db/queries";
import type { Env } from "./index";

export const app = new Hono<{ Bindings: Env }>();

const RARITIES = new Set<string>(RARITY_ORDER);
const CARD_SOURCES = new Set(["pull", "purchase", "trade_in"]);

function normalizeSeriesInput(body: CreateSeriesInput): {
  value?: CreateSeriesInput;
  error?: string;
} {
  if (!Number.isInteger(body?.volume) || body.volume < 1) {
    return { error: "volume must be a positive integer" };
  }
  if (typeof body?.name !== "string" || !body.name.trim()) {
    return { error: "name required" };
  }
  if (!Array.isArray(body.characters) || body.characters.length === 0) {
    return { error: "characters required" };
  }
  if (!Array.isArray(body.rarities) || body.rarities.length === 0) {
    return { error: "rarities required" };
  }
  if (body.characters.some((character) => typeof character !== "string")) {
    return { error: "characters must be strings" };
  }
  const name = body.name.trim();
  const characters = body.characters.map((character) => character.trim());
  if (characters.some((character) => !character)) {
    return { error: "characters cannot be blank" };
  }
  if (
    new Set(characters.map((character) => character.toLowerCase())).size !==
    characters.length
  ) {
    return { error: "characters must be unique" };
  }
  if (
    body.rarities.some(
      (rarity) => typeof rarity !== "string" || !RARITIES.has(rarity),
    )
  ) {
    return { error: "rarities contain an unsupported value" };
  }
  if (new Set(body.rarities).size !== body.rarities.length) {
    return { error: "rarities must be unique" };
  }
  return {
    value: {
      name,
      volume: body.volume,
      characters,
      rarities: canonicalizeRarities(body.rarities),
    },
  };
}

function validateCards(
  cards: AddCardInput[],
  opening?: OpeningInput,
): string | null {
  if (opening) {
    if (typeof opening.series !== "string" || !opening.series.trim()) {
      return "opening series required";
    }
    if (!opening.openedAt) return "openedAt required";
    if (
      opening.cost !== undefined &&
      (!Number.isFinite(opening.cost) || opening.cost < 0)
    ) {
      return "opening cost must be finite and nonnegative";
    }
  }
  for (const card of cards) {
    if (!card || typeof card !== "object") return "invalid card";
    if (
      typeof card.series !== "string" ||
      !card.series ||
      typeof card.character !== "string" ||
      !card.character ||
      !RARITIES.has(card.rarity)
    ) {
      return "every card needs a valid series, character, and rarity";
    }
    const source = card.source ?? "pull";
    if (!CARD_SOURCES.has(source)) return "unsupported card source";
    if (source === "purchase") {
      if (
        typeof card.purchasePrice !== "number" ||
        !Number.isFinite(card.purchasePrice) ||
        card.purchasePrice < 0
      ) {
        return "a purchase requires a finite nonnegative purchasePrice";
      }
      if (opening) return "a purchased card cannot belong to a pack";
    } else if (card.purchasePrice !== undefined) {
      return "purchasePrice is only valid for purchased cards";
    }
    if (opening && (source !== "pull" || card.series !== opening.series)) {
      return "pack cards must be pulls matching the opening series";
    }
  }
  return null;
}

function validIsoDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const date = new Date(`${value}T00:00:00Z`);
  return (
    !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value
  );
}

function normalizePurchaseReservationInput(body: unknown): {
  value?: CreatePurchaseReservationInput;
  error?: string;
} {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { error: "invalid purchase reservation" };
  }
  const input = body as Record<string, unknown>;
  if (!validIsoDate(input.orderedAt)) {
    return { error: "orderedAt must be a valid YYYY-MM-DD date" };
  }
  if (input.seller !== undefined && typeof input.seller !== "string") {
    return { error: "seller must be a string" };
  }
  if (input.note !== undefined && typeof input.note !== "string") {
    return { error: "note must be a string" };
  }
  if (!Array.isArray(input.lines) || input.lines.length === 0) {
    return { error: "at least one purchase line required" };
  }
  if (input.lines.length > 50) {
    return { error: "at most 50 purchase lines are allowed" };
  }

  const lines: CreatePurchaseReservationInput["lines"] = [];
  let totalQty = 0;
  for (const candidate of input.lines) {
    if (
      !candidate ||
      typeof candidate !== "object" ||
      Array.isArray(candidate)
    ) {
      return { error: "invalid purchase line" };
    }
    const line = candidate as Record<string, unknown>;
    if (typeof line.series !== "string" || !line.series.trim()) {
      return { error: "every purchase line needs a series" };
    }
    if (typeof line.character !== "string" || !line.character.trim()) {
      return { error: "every purchase line needs a character" };
    }
    if (typeof line.rarity !== "string" || !RARITIES.has(line.rarity)) {
      return { error: "every purchase line needs a supported rarity" };
    }
    if (
      !Number.isInteger(line.qty) ||
      (line.qty as number) < 1 ||
      (line.qty as number) > 99
    ) {
      return { error: "qty must be an integer between 1 and 99" };
    }
    totalQty += line.qty as number;
    if (totalQty > 500) {
      return { error: "at most 500 cards are allowed per purchase" };
    }
    if (
      typeof line.unitPrice !== "number" ||
      !Number.isFinite(line.unitPrice) ||
      line.unitPrice < 0
    ) {
      return { error: "unitPrice must be finite and nonnegative" };
    }
    lines.push({
      series: line.series.trim(),
      character: line.character.trim(),
      rarity:
        line.rarity as CreatePurchaseReservationInput["lines"][number]["rarity"],
      qty: line.qty as number,
      unitPrice: line.unitPrice,
    });
  }

  const seller = (input.seller as string | undefined)?.trim();
  const note = (input.note as string | undefined)?.trim();
  return {
    value: {
      orderedAt: input.orderedAt,
      lines,
      ...(seller ? { seller } : {}),
      ...(note ? { note } : {}),
    },
  };
}

// ---- Public read API (no auth) ----
app.get("/api/catalog", async (c) => c.json(await getCatalog(c.env.DB)));
app.get("/api/overview", async (c) => c.json(await getOverview(c.env.DB)));
app.get("/api/missing", async (c) => c.json(await getMissing(c.env.DB)));
app.get("/api/market", async (c) => c.json(await getMarket(c.env.DB)));
app.get("/api/pending-trades", async (c) =>
  c.json(await getPublicPendingTrades(c.env.DB)),
);
app.get("/api/pending-purchases", async (c) =>
  c.json(await getPublicPendingPurchases(c.env.DB)),
);
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

admin.post("/series", async (c) => {
  const normalized = normalizeSeriesInput(
    await c.req.json<CreateSeriesInput>(),
  );
  if (!normalized.value) {
    return c.json({ error: normalized.error ?? "invalid series" }, 400);
  }
  const exists = (await getCatalog(c.env.DB)).some(
    (series) =>
      series.name.toLowerCase() === normalized.value?.name.toLowerCase(),
  );
  if (exists) return c.json({ error: "series already exists" }, 409);
  try {
    return c.json(await createSeries(c.env.DB, normalized.value), 201);
  } catch (error) {
    return c.json({ error: String(error) }, 409);
  }
});

admin.post("/cards", async (c) => {
  const body = await c.req.json<{
    cards: AddCardInput[];
    opening?: OpeningInput;
  }>();
  if (!Array.isArray(body.cards) || body.cards.length === 0) {
    return c.json({ error: "cards required" }, 400);
  }
  const validationError = validateCards(body.cards, body.opening);
  if (validationError) return c.json({ error: validationError }, 400);
  try {
    if (body.opening) {
      return c.json(await addPack(c.env.DB, body.cards, body.opening));
    }
    return c.json({ ids: await addCards(c.env.DB, body.cards) });
  } catch (error) {
    return c.json({ error: String(error) }, 400);
  }
});

admin.patch("/cards/:id", async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id)) return c.json({ error: "bad id" }, 400);
  const body = await c.req.json<UpdateCardInput>();
  try {
    await updateCard(c.env.DB, id, body);
  } catch (error) {
    return c.json({ error: String(error) }, 409);
  }
  return c.json({ ok: true });
});

// Lock a card out of the tradeable list (保留). DELETE releases the hold.
admin.post("/cards/:id/hold", async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id) || id < 1) return c.json({ error: "bad id" }, 400);
  try {
    await setCardHeld(c.env.DB, id, true);
  } catch (error) {
    return c.json({ error: String(error) }, 409);
  }
  return c.json({ ok: true });
});

admin.delete("/cards/:id/hold", async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id) || id < 1) return c.json({ error: "bad id" }, 400);
  try {
    await setCardHeld(c.env.DB, id, false);
  } catch (error) {
    return c.json({ error: String(error) }, 409);
  }
  return c.json({ ok: true });
});

admin.get("/openings/next", async (c) => {
  const series = c.req.query("series")?.trim();
  if (!series) return c.json({ error: "series required" }, 400);
  if (!(await getCatalog(c.env.DB)).some((entry) => entry.name === series)) {
    return c.json({ error: "unknown series" }, 404);
  }
  return c.json({
    series,
    packNumber: await getNextPackNumber(c.env.DB, series),
  });
});

admin.post("/openings", async (c) => {
  const body = await c.req.json<OpeningInput>();
  if (!body.series?.trim() || !body.openedAt) {
    return c.json({ error: "series and openedAt required" }, 400);
  }
  if (
    body.cost !== undefined &&
    (!Number.isFinite(body.cost) || body.cost < 0)
  ) {
    return c.json(
      { error: "opening cost must be finite and nonnegative" },
      400,
    );
  }
  if (
    !(await getCatalog(c.env.DB)).some((entry) => entry.name === body.series)
  ) {
    return c.json({ error: "unknown series" }, 404);
  }
  return c.json(await createOpening(c.env.DB, body));
});

admin.get("/openings", async (c) => c.json(await getOpenings(c.env.DB)));

admin.post("/transactions", async (c) => {
  const body = await c.req.json<{ cardId: number } & RecordTxnInput>();
  if (!body.cardId || !body.type || !body.happenedAt) {
    return c.json({ error: "cardId, type, happenedAt required" }, 400);
  }
  try {
    const id = await recordTransaction(c.env.DB, body.cardId, body);
    return c.json({ id });
  } catch (error) {
    return c.json({ error: String(error) }, 409);
  }
});

admin.get("/transactions", async (c) =>
  c.json(await getTransactions(c.env.DB)),
);

admin.get("/pending-trades", async (c) =>
  c.json(await getAdminPendingTrades(c.env.DB)),
);

admin.get("/pending-purchases", async (c) =>
  c.json(await getAdminPendingPurchases(c.env.DB)),
);

admin.post("/pending-purchases", async (c) => {
  let body: unknown;
  try {
    body = await c.req.json<unknown>();
  } catch {
    return c.json({ error: "invalid JSON body" }, 400);
  }
  const normalized = normalizePurchaseReservationInput(body);
  if (!normalized.value) {
    return c.json(
      { error: normalized.error ?? "invalid purchase reservation" },
      400,
    );
  }
  try {
    const id = await createPurchaseReservation(c.env.DB, normalized.value);
    return c.json({ id });
  } catch (error) {
    return c.json({ error: String(error) }, 409);
  }
});

admin.post("/pending-purchases/:id/complete", async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id) || id < 1) {
    return c.json({ error: "bad id" }, 400);
  }
  try {
    await completePurchaseReservation(c.env.DB, id);
  } catch (error) {
    return c.json({ error: String(error) }, 409);
  }
  return c.json({ ok: true });
});

admin.delete("/pending-purchases/:id", async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id) || id < 1) {
    return c.json({ error: "bad id" }, 400);
  }
  try {
    await cancelPurchaseReservation(c.env.DB, id);
  } catch (error) {
    return c.json({ error: String(error) }, 409);
  }
  return c.json({ ok: true });
});

admin.post("/pending-trades", async (c) => {
  const body = await c.req.json<CreateReservationInput>();
  if (!body.reservedAt) return c.json({ error: "reservedAt required" }, 400);
  if (!Array.isArray(body.give) || body.give.length === 0) {
    return c.json({ error: "at least one give line required" }, 400);
  }
  const allLines = [...body.give, ...(body.receive ?? [])];
  if (allLines.some((l) => !Number.isInteger(l.qty) || l.qty < 1)) {
    return c.json({ error: "qty must be a positive integer" }, 400);
  }
  try {
    const id = await createReservation(c.env.DB, body);
    return c.json({ id });
  } catch (error) {
    return c.json({ error: String(error) }, 409);
  }
});

admin.post("/pending-trades/:id/complete", async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id)) return c.json({ error: "bad id" }, 400);
  const body = await c.req.json<CompleteReservationInput>();
  if (!body.happenedAt) return c.json({ error: "happenedAt required" }, 400);
  try {
    await completeReservation(c.env.DB, id, body.happenedAt);
  } catch (error) {
    return c.json({ error: String(error) }, 409);
  }
  return c.json({ ok: true });
});

admin.delete("/pending-trades/:id", async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id)) return c.json({ error: "bad id" }, 400);
  await cancelReservation(c.env.DB, id);
  return c.json({ ok: true });
});

app.route("/api/admin", admin);

export default app;
