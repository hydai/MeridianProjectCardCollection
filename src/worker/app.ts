import { Hono } from "hono";
import { MAX_CARD_BATCH_SIZE } from "../shared/card-batch";
import {
  RARITY_ORDER,
  canonicalizeRarities,
  supportsEx,
} from "../shared/rarity";
import type {
  AddCardInput,
  CompleteReservationInput,
  CreatePurchaseReservationInput,
  CreateReservationInput,
  CreateSeriesInput,
  OpeningInput,
  Rarity,
  RecordTxnInput,
  UpdateCardInput,
  UpdateCatalogWantInput,
  UpdateSeriesInput,
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
  getActivities,
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
  setCatalogWant,
  undoActivity,
  updateCard,
  updateSeries,
} from "./db/queries";
import type { Env } from "./index";

export const app = new Hono<{ Bindings: Env }>();

const RARITIES = new Set<string>(RARITY_ORDER);
const CARD_SOURCES = new Set(["pull", "purchase", "trade_in", "other"]);

function isRarity(value: unknown): value is Rarity {
  return typeof value === "string" && RARITIES.has(value);
}

function normalizeSeriesInput(
  body: unknown,
  nameOverride?: string,
): {
  value?: CreateSeriesInput;
  error?: string;
} {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { error: "invalid series" };
  }
  const input = body as Record<string, unknown>;
  if (
    typeof input.volume !== "number" ||
    !Number.isInteger(input.volume) ||
    input.volume < 1
  ) {
    return { error: "volume must be a positive integer" };
  }
  const inputName = nameOverride ?? input.name;
  if (typeof inputName !== "string" || !inputName.trim()) {
    return { error: "name required" };
  }
  if (!Array.isArray(input.characters) || input.characters.length === 0) {
    return { error: "characters required" };
  }
  if (!Array.isArray(input.rarities) || input.rarities.length === 0) {
    return { error: "rarities required" };
  }
  if (input.characters.some((character) => typeof character !== "string")) {
    return { error: "characters must be strings" };
  }
  const name = inputName.trim();
  const characters = input.characters.map((character) => character.trim());
  if (characters.some((character) => !character)) {
    return { error: "characters cannot be blank" };
  }
  if (
    new Set(characters.map((character) => character.toLowerCase())).size !==
    characters.length
  ) {
    return { error: "characters must be unique" };
  }
  if (!input.rarities.every(isRarity)) {
    return { error: "rarities contain an unsupported value" };
  }
  if (new Set(input.rarities).size !== input.rarities.length) {
    return { error: "rarities must be unique" };
  }
  const rarities = canonicalizeRarities(input.rarities);
  const volume = input.volume;
  if (!supportsEx(volume) && rarities.includes("EX")) {
    return { error: "EX is only available from volume 3" };
  }
  return {
    value: {
      name,
      volume,
      characters,
      rarities,
    },
  };
}

async function normalizeOpeningInput(
  db: D1Database,
  body: unknown,
): Promise<{ value?: OpeningInput; error?: string }> {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { error: "invalid opening" };
  }
  const input = body as Record<string, unknown>;
  const catalog = await getCatalog(db);
  let volume: number;

  if (input.volume !== undefined) {
    if (
      typeof input.volume !== "number" ||
      !Number.isInteger(input.volume) ||
      input.volume < 1
    ) {
      return { error: "opening volume must be a positive integer" };
    }
    volume = input.volume;
    if (!catalog.some((entry) => entry.volume === volume)) {
      return { error: "unknown opening volume" };
    }
  } else if (typeof input.series === "string" && input.series.trim()) {
    // Compatibility for a browser tab that still has the pre-volume client
    // loaded during deployment. New clients always submit `volume`.
    const legacySeriesName = input.series.trim();
    const legacySeries = catalog.find(
      (entry) => entry.name === legacySeriesName,
    );
    if (!legacySeries) return { error: "unknown opening series" };
    volume = legacySeries.volume;
  } else {
    return { error: "opening volume required" };
  }

  if (!validIsoDate(input.openedAt)) {
    return { error: "openedAt must be a valid ISO date" };
  }
  if (
    input.cost !== undefined &&
    (typeof input.cost !== "number" ||
      !Number.isFinite(input.cost) ||
      input.cost < 0)
  ) {
    return { error: "opening cost must be finite and nonnegative" };
  }
  if (input.note !== undefined && typeof input.note !== "string") {
    return { error: "opening note must be a string" };
  }

  return {
    value: {
      volume,
      openedAt: input.openedAt,
      cost: input.cost as number | undefined,
      note: input.note as string | undefined,
    },
  };
}

function validateCards(
  cards: AddCardInput[],
  opening?: OpeningInput,
): string | null {
  if (opening) {
    if (!Number.isInteger(opening.volume) || opening.volume < 1) {
      return "opening volume must be a positive integer";
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
    if (opening && source !== "pull") {
      return "pack cards must be pulls";
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

admin.get("/catalog/:id/activities", async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id) || id < 1) {
    return c.json({ error: "bad catalog id" }, 400);
  }
  const requestedLimit = Number(c.req.query("limit") ?? 50);
  const limit = Number.isFinite(requestedLimit) ? requestedLimit : 50;
  return c.json(await getActivities(c.env.DB, limit, id));
});

admin.put("/catalog/:id/want", async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id) || id < 1) {
    return c.json({ error: "bad catalog id" }, 400);
  }
  let body: unknown;
  try {
    body = await c.req.json<unknown>();
  } catch {
    return c.json({ error: "invalid JSON body" }, 400);
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return c.json({ error: "invalid Want request" }, 400);
  }
  const wantCount = (body as Record<string, unknown>).wantCount;
  if (
    !Number.isInteger(wantCount) ||
    (wantCount as number) < 0 ||
    (wantCount as number) > 99
  ) {
    return c.json(
      { error: "wantCount must be an integer between 0 and 99" },
      400,
    );
  }
  try {
    const input: UpdateCatalogWantInput = { wantCount: wantCount as number };
    return c.json({ wantCount: await setCatalogWant(c.env.DB, id, input) });
  } catch (error) {
    return c.json({ error: String(error) }, 404);
  }
});

admin.post("/series", async (c) => {
  let body: unknown;
  try {
    body = await c.req.json<unknown>();
  } catch {
    return c.json({ error: "invalid JSON body" }, 400);
  }
  const normalized = normalizeSeriesInput(body);
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

admin.patch("/series/:name", async (c) => {
  const name = c.req.param("name").trim();
  if (!name) return c.json({ error: "name required" }, 400);
  const existing = (await getCatalog(c.env.DB)).find(
    (series) => series.name === name,
  );
  if (!existing) return c.json({ error: "series not found" }, 404);

  let body: unknown;
  try {
    body = await c.req.json<unknown>();
  } catch {
    return c.json({ error: "invalid JSON body" }, 400);
  }
  const normalized = normalizeSeriesInput(body, name);
  if (!normalized.value) {
    return c.json({ error: normalized.error ?? "invalid series" }, 400);
  }
  const input: UpdateSeriesInput = {
    volume: normalized.value.volume,
    characters: normalized.value.characters,
    rarities: normalized.value.rarities,
  };
  try {
    return c.json(await updateSeries(c.env.DB, name, input));
  } catch (error) {
    return c.json({ error: String(error) }, 409);
  }
});

admin.post("/cards", async (c) => {
  let body: unknown;
  try {
    body = await c.req.json<unknown>();
  } catch {
    return c.json({ error: "invalid JSON body" }, 400);
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return c.json({ error: "invalid card request" }, 400);
  }
  const input = body as Record<string, unknown>;
  if (!Array.isArray(input.cards) || input.cards.length === 0) {
    return c.json({ error: "cards required" }, 400);
  }
  if (input.cards.length > MAX_CARD_BATCH_SIZE) {
    return c.json(
      { error: `at most ${MAX_CARD_BATCH_SIZE} cards are allowed per batch` },
      400,
    );
  }
  const cards = input.cards as AddCardInput[];
  let opening: OpeningInput | undefined;
  if (input.opening !== undefined) {
    const normalized = await normalizeOpeningInput(c.env.DB, input.opening);
    if (!normalized.value) {
      return c.json({ error: normalized.error ?? "invalid opening" }, 400);
    }
    opening = normalized.value;
  }
  const validationError = validateCards(cards, opening);
  if (validationError) return c.json({ error: validationError }, 400);
  try {
    if (opening) {
      return c.json(await addPack(c.env.DB, cards, opening));
    }
    return c.json({ ids: await addCards(c.env.DB, cards) });
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
  const catalog = await getCatalog(c.env.DB);
  const requestedVolume = c.req.query("volume");
  const legacySeries = c.req.query("series")?.trim();
  let volume: number;

  if (requestedVolume !== undefined) {
    volume = Number(requestedVolume);
    if (!Number.isInteger(volume) || volume < 1) {
      return c.json({ error: "volume must be a positive integer" }, 400);
    }
  } else if (legacySeries) {
    const matched = catalog.find((entry) => entry.name === legacySeries);
    if (!matched) return c.json({ error: "unknown series" }, 404);
    volume = matched.volume;
  } else {
    return c.json({ error: "volume required" }, 400);
  }

  if (!catalog.some((entry) => entry.volume === volume)) {
    return c.json({ error: "unknown volume" }, 404);
  }
  return c.json({
    volume,
    packNumber: await getNextPackNumber(c.env.DB, volume),
  });
});

admin.post("/openings", async (c) => {
  let body: unknown;
  try {
    body = await c.req.json<unknown>();
  } catch {
    return c.json({ error: "invalid JSON body" }, 400);
  }
  const normalized = await normalizeOpeningInput(c.env.DB, body);
  if (!normalized.value) {
    return c.json({ error: normalized.error ?? "invalid opening" }, 400);
  }
  return c.json(await createOpening(c.env.DB, normalized.value));
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

admin.get("/activities", async (c) => {
  const requestedLimit = Number(c.req.query("limit") ?? 100);
  const limit = Number.isFinite(requestedLimit) ? requestedLimit : 100;
  return c.json(await getActivities(c.env.DB, limit));
});

admin.post("/activities/:id/undo", async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id) || id < 1) {
    return c.json({ error: "bad id" }, 400);
  }
  try {
    await undoActivity(c.env.DB, id);
  } catch (error) {
    return c.json({ error: String(error) }, 409);
  }
  return c.json({ ok: true });
});

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
