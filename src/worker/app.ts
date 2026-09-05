import { Hono } from "hono";
import { MAX_CARD_BATCH_SIZE } from "../shared/card-batch";
import {
  CATALOG_IMAGE_MAX_BYTES,
  isCatalogImageContentType,
} from "../shared/catalog-media";
import {
  RARITY_ORDER,
  canonicalizeRarities,
  supportsEx,
} from "../shared/rarity";
import type {
  AcquisitionEventInput,
  AddCardInput,
  CatalogMediaSide,
  CompleteReservationInput,
  CreatePurchaseReservationInput,
  CreateReservationInput,
  CreateSeriesInput,
  CreateTradePostReservationInput,
  OpeningInput,
  Rarity,
  ReclassifyCardInput,
  RecordTxnInput,
  SaveTradePostInput,
  UpdateCardInput,
  UpdateCatalogWantInput,
  UpdateSeriesInput,
} from "../shared/types";
import { accessGuard } from "./auth";
import {
  CATALOG_IMAGE_OUTPUT_CONTENT_TYPE,
  catalogImageObjectKeyForVariant,
  catalogImageObjectKeys,
  catalogImageStoredObjectKeys,
  catalogImageVariant,
  optimizeCatalogImage,
  validateCatalogImage,
} from "./catalog-images";
import {
  addCards,
  addPack,
  cancelPurchaseReservation,
  cancelReservation,
  catalogSlotExists,
  closeTradePost,
  completePurchaseReservation,
  completeReservation,
  createOpening,
  createPurchaseReservation,
  createReservation,
  createSeries,
  createTradePost,
  createTradePostReservation,
  deleteCatalogMediaMetadata,
  deleteTradePost,
  getActivities,
  getAdminPendingPurchases,
  getAdminPendingTrades,
  getAdminTradePosts,
  getCatalog,
  getMarket,
  getMissing,
  getNextPackNumber,
  getOpenings,
  getOverview,
  getPublicPendingPurchases,
  getPublicPendingTrades,
  getPublicTradePost,
  getPublicTradePosts,
  getStats,
  getStoredCatalogMedia,
  getTradePostCandidates,
  getTransactions,
  listCards,
  listCatalogMedia,
  publishTradePost,
  reclassifyCard,
  recordTransaction,
  saveCatalogMedia,
  setCardHeld,
  setCatalogWant,
  undoActivity,
  updateCard,
  updateSeries,
  updateTradePost,
} from "./db/queries";
import type { Env } from "./index";

export const app = new Hono<{ Bindings: Env }>();

const RARITIES = new Set<string>(RARITY_ORDER);
const CARD_SOURCES = new Set(["pull", "purchase", "trade_in", "other"]);

function catalogMediaSide(value: string | undefined): CatalogMediaSide | null {
  if (value === undefined || value === "front") return "front";
  return value === "back" ? "back" : null;
}

function decodedUploadFilename(value: string | undefined): {
  filename: string | null;
  error?: string;
} {
  if (!value) return { filename: null };
  let filename: string;
  try {
    filename = decodeURIComponent(value).trim();
  } catch {
    return { filename: null, error: "invalid image filename" };
  }
  const hasControlCharacter = [...filename].some((character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint < 32 || codePoint === 127;
  });
  if (!filename || filename.length > 255 || hasControlCharacter) {
    return { filename: null, error: "invalid image filename" };
  }
  return { filename };
}

function claimedUploadSize(request: Request): number | null {
  const value =
    request.headers.get("x-card-image-size") ??
    request.headers.get("content-length");
  if (value === null) return null;
  const size = Number(value);
  return Number.isInteger(size) ? size : Number.NaN;
}

function immutableImageRequest(request: Request, revision: number): boolean {
  return new URL(request.url).searchParams.get("v") === String(revision);
}

function catalogImageCacheKey(
  request: Request,
  catalogId: number,
  side: CatalogMediaSide,
  variant: "thumb" | "card",
): Request | null {
  const requestedRevision = new URL(request.url).searchParams.get("v");
  if (!requestedRevision || !/^\d+$/.test(requestedRevision)) return null;

  const url = new URL(request.url);
  url.search = "";
  url.searchParams.set("side", side);
  url.searchParams.set("variant", variant);
  url.searchParams.set("v", requestedRevision);
  const headers = new Headers();
  const ifNoneMatch = request.headers.get("if-none-match");
  if (ifNoneMatch) headers.set("if-none-match", ifNoneMatch);
  return new Request(url, { headers });
}

function etagMatches(request: Request, etag: string): boolean {
  return (request.headers.get("if-none-match") ?? "")
    .split(",")
    .some((candidate) => candidate.trim() === etag);
}

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

function normalizeAcquisitionEventInput(body: unknown): {
  value?: AcquisitionEventInput;
  error?: string;
} {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { error: "invalid acquisition details" };
  }
  const input = body as Record<string, unknown>;
  if (!validIsoDate(input.occurredAt)) {
    return { error: "occurredAt must be a valid YYYY-MM-DD date" };
  }
  if (
    input.counterparty !== undefined &&
    typeof input.counterparty !== "string"
  ) {
    return { error: "counterparty must be a string" };
  }
  if (input.note !== undefined && typeof input.note !== "string") {
    return { error: "note must be a string" };
  }
  const counterparty = (input.counterparty as string | undefined)?.trim();
  const note = (input.note as string | undefined)?.trim();
  if (counterparty && counterparty.length > 200) {
    return { error: "counterparty must be at most 200 characters" };
  }
  if (note && note.length > 1000) {
    return { error: "note must be at most 1000 characters" };
  }
  return {
    value: {
      occurredAt: input.occurredAt,
      ...(counterparty ? { counterparty } : {}),
      ...(note ? { note } : {}),
    },
  };
}

function normalizeTransactionInput(body: unknown): {
  cardId?: number;
  value?: RecordTxnInput;
  error?: string;
} {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { error: "invalid transaction" };
  }
  const input = body as Record<string, unknown>;
  if (!Number.isInteger(input.cardId) || (input.cardId as number) < 1) {
    return { error: "cardId must be a positive integer" };
  }
  if (
    input.type !== "sale" &&
    input.type !== "trade" &&
    input.type !== "gift"
  ) {
    return { error: "unsupported transaction type" };
  }
  if (!validIsoDate(input.happenedAt)) {
    return { error: "happenedAt must be a valid YYYY-MM-DD date" };
  }
  if (
    input.counterparty !== undefined &&
    typeof input.counterparty !== "string"
  ) {
    return { error: "counterparty must be a string" };
  }
  if (input.note !== undefined && typeof input.note !== "string") {
    return { error: "note must be a string" };
  }
  const counterparty = (input.counterparty as string | undefined)?.trim();
  const note = (input.note as string | undefined)?.trim();
  if (counterparty && counterparty.length > 200) {
    return { error: "counterparty must be at most 200 characters" };
  }
  if (note && note.length > 1000) {
    return { error: "note must be at most 1000 characters" };
  }
  if (
    input.price !== undefined &&
    (typeof input.price !== "number" ||
      !Number.isFinite(input.price) ||
      input.price < 0)
  ) {
    return { error: "price must be finite and nonnegative" };
  }
  if (input.type === "gift" && input.price !== undefined) {
    return { error: "a gift cannot have a price" };
  }

  const receivedValues = [
    input.receivedSeries,
    input.receivedCharacter,
    input.receivedRarity,
  ];
  const receivedCount = receivedValues.filter(
    (value) => value !== undefined,
  ).length;
  if (input.type !== "trade" && receivedCount > 0) {
    return { error: "only a trade can include a received card" };
  }
  if (input.type === "trade" && receivedCount !== 0 && receivedCount !== 3) {
    return { error: "a received card needs series, character, and rarity" };
  }
  if (
    receivedCount === 3 &&
    (typeof input.receivedSeries !== "string" ||
      !input.receivedSeries.trim() ||
      typeof input.receivedCharacter !== "string" ||
      !input.receivedCharacter.trim() ||
      !isRarity(input.receivedRarity))
  ) {
    return { error: "invalid received card" };
  }

  return {
    cardId: input.cardId as number,
    value: {
      type: input.type,
      happenedAt: input.happenedAt,
      ...(counterparty ? { counterparty } : {}),
      ...(note ? { note } : {}),
      ...(typeof input.price === "number" ? { price: input.price } : {}),
      ...(receivedCount === 3
        ? {
            receivedSeries: (input.receivedSeries as string).trim(),
            receivedCharacter: (input.receivedCharacter as string).trim(),
            receivedRarity: input.receivedRarity as Rarity,
          }
        : {}),
    },
  };
}

function normalizeUpdateCardInput(body: unknown): {
  value?: UpdateCardInput;
  error?: string;
} {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { error: "invalid card update" };
  }
  const input = body as Record<string, unknown>;
  if (
    input.status !== undefined &&
    input.status !== "owned" &&
    input.status !== "for_sale" &&
    input.status !== "for_trade"
  ) {
    return { error: "status must be owned, for_sale, or for_trade" };
  }
  if (
    input.askingPrice !== undefined &&
    input.askingPrice !== null &&
    (typeof input.askingPrice !== "number" ||
      !Number.isFinite(input.askingPrice) ||
      input.askingPrice < 0)
  ) {
    return { error: "askingPrice must be finite and nonnegative, or null" };
  }
  for (const field of ["wantInReturn", "note"] as const) {
    if (
      input[field] !== undefined &&
      input[field] !== null &&
      typeof input[field] !== "string"
    ) {
      return { error: `${field} must be a string or null` };
    }
  }
  return {
    value: {
      ...(input.status !== undefined ? { status: input.status } : {}),
      ...(input.askingPrice !== undefined
        ? { askingPrice: input.askingPrice as number | null }
        : {}),
      ...(input.wantInReturn !== undefined
        ? { wantInReturn: input.wantInReturn as string | null }
        : {}),
      ...(input.note !== undefined
        ? { note: input.note as string | null }
        : {}),
    },
  };
}

function normalizeReclassifyCardInput(body: unknown): {
  value?: ReclassifyCardInput;
  error?: string;
} {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { error: "invalid reclassification" };
  }
  const input = body as Record<string, unknown>;
  if (
    !Number.isInteger(input.targetCatalogId) ||
    (input.targetCatalogId as number) < 1
  ) {
    return { error: "targetCatalogId must be a positive integer" };
  }
  if (!validIsoDate(input.happenedAt)) {
    return { error: "happenedAt must be a valid YYYY-MM-DD date" };
  }
  if (input.note !== undefined && typeof input.note !== "string") {
    return { error: "note must be a string" };
  }
  const note = (input.note as string | undefined)?.trim();
  if (note && note.length > 1000) {
    return { error: "note must be at most 1000 characters" };
  }
  return {
    value: {
      targetCatalogId: input.targetCatalogId as number,
      happenedAt: input.happenedAt,
      ...(note ? { note } : {}),
    },
  };
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

function normalizeTradePostInput(body: unknown): {
  value?: SaveTradePostInput;
  error?: string;
} {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { error: "invalid announcement" };
  }
  const input = body as Record<string, unknown>;
  if (input.note !== undefined && typeof input.note !== "string") {
    return { error: "announcement note must be a string" };
  }
  if (typeof input.note === "string" && input.note.trim().length > 1000) {
    return { error: "announcement note must be at most 1000 characters" };
  }
  if (!Array.isArray(input.give) || input.give.length === 0) {
    return { error: "at least one give line required" };
  }
  if (!Array.isArray(input.want)) {
    return { error: "want lines must be an array" };
  }
  if (input.give.length + input.want.length > 100) {
    return { error: "at most 100 announcement lines are allowed" };
  }

  const normalizeLines = (
    candidates: unknown[],
  ): SaveTradePostInput["give"] | null => {
    const lines: SaveTradePostInput["give"] = [];
    for (const candidate of candidates) {
      if (
        !candidate ||
        typeof candidate !== "object" ||
        Array.isArray(candidate)
      ) {
        return null;
      }
      const line = candidate as Record<string, unknown>;
      if (
        !Number.isInteger(line.catalogId) ||
        (line.catalogId as number) < 1 ||
        !Number.isInteger(line.qty) ||
        (line.qty as number) < 1 ||
        (line.qty as number) > 99
      ) {
        return null;
      }
      lines.push({
        catalogId: line.catalogId as number,
        qty: line.qty as number,
      });
    }
    return lines;
  };

  const give = normalizeLines(input.give);
  const want = normalizeLines(input.want);
  if (!give || !want) {
    return {
      error: "announcement lines need valid catalog ids and quantities",
    };
  }
  return {
    value: {
      ...(typeof input.note === "string" && input.note.trim()
        ? { note: input.note.trim() }
        : {}),
      give,
      want,
    },
  };
}

function normalizeTradePostReservationInput(body: unknown): {
  value?: CreateTradePostReservationInput;
  error?: string;
} {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { error: "invalid exchange reservation" };
  }
  const input = body as Record<string, unknown>;
  if (!validIsoDate(input.reservedAt)) {
    return { error: "reservedAt must be a valid YYYY-MM-DD date" };
  }
  if (
    input.counterparty !== undefined &&
    typeof input.counterparty !== "string"
  ) {
    return { error: "counterparty must be a string" };
  }
  if (input.note !== undefined && typeof input.note !== "string") {
    return { error: "note must be a string" };
  }
  if (
    typeof input.counterparty === "string" &&
    input.counterparty.trim().length > 200
  ) {
    return { error: "counterparty must be at most 200 characters" };
  }
  if (typeof input.note === "string" && input.note.trim().length > 1000) {
    return { error: "note must be at most 1000 characters" };
  }
  if (!Array.isArray(input.give) || input.give.length === 0) {
    return { error: "at least one give line required" };
  }
  if (!Array.isArray(input.receive)) {
    return { error: "receive lines must be an array" };
  }
  if (input.give.length + input.receive.length > 100) {
    return { error: "at most 100 reservation lines are allowed" };
  }

  const normalizeLines = (candidates: unknown[]) => {
    const lines: CreateTradePostReservationInput["give"] = [];
    for (const candidate of candidates) {
      if (
        !candidate ||
        typeof candidate !== "object" ||
        Array.isArray(candidate)
      ) {
        return null;
      }
      const line = candidate as Record<string, unknown>;
      if (
        !Number.isInteger(line.catalogId) ||
        (line.catalogId as number) < 1 ||
        !Number.isInteger(line.qty) ||
        (line.qty as number) < 1 ||
        (line.qty as number) > 99
      ) {
        return null;
      }
      lines.push({
        catalogId: line.catalogId as number,
        qty: line.qty as number,
      });
    }
    return lines;
  };

  const give = normalizeLines(input.give);
  const receive = normalizeLines(input.receive);
  if (!give || !receive) {
    return { error: "reservation lines need valid catalog ids and quantities" };
  }
  const counterparty = (input.counterparty as string | undefined)?.trim();
  const note = (input.note as string | undefined)?.trim();
  return {
    value: {
      reservedAt: input.reservedAt,
      give,
      receive,
      ...(counterparty ? { counterparty } : {}),
      ...(note ? { note } : {}),
    },
  };
}

// ---- Public read API (no auth) ----
app.get("/api/catalog", async (c) => c.json(await getCatalog(c.env.DB)));
app.get("/api/catalog/:id/image", async (c) => {
  const catalogId = Number(c.req.param("id"));
  if (!Number.isInteger(catalogId) || catalogId < 1) {
    return c.json({ error: "bad catalog id" }, 400);
  }
  const side = catalogMediaSide(c.req.query("side"));
  if (!side) return c.json({ error: "unsupported image side" }, 400);
  const variant = catalogImageVariant(c.req.query("variant"));
  if (!variant) return c.json({ error: "unsupported image variant" }, 400);
  const cacheKey = catalogImageCacheKey(c.req.raw, catalogId, side, variant);
  if (cacheKey) {
    const cached = await caches.default.match(cacheKey);
    if (cached) return cached;
  }

  const stored = await getStoredCatalogMedia(c.env.DB, catalogId, side);
  if (!stored) {
    return c.json({ error: "image not found" }, 404, {
      "cache-control": "no-store",
    });
  }
  const requestedRevision = c.req.query("v");
  if (
    requestedRevision !== undefined &&
    requestedRevision !== String(stored.revision)
  ) {
    return c.json({ error: "image revision not found" }, 404, {
      "cache-control": "no-store",
    });
  }
  const objectKey = catalogImageObjectKeyForVariant(stored.objectKey, variant);
  const object = await c.env.CARD_IMAGES.get(objectKey);
  if (!object) {
    console.error(
      JSON.stringify({
        message: "catalog media object is missing",
        catalogId,
        side,
        variant,
        objectKey,
      }),
    );
    return c.json({ error: "image not found" }, 404, {
      "cache-control": "no-store",
    });
  }

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set(
    "content-type",
    objectKey === stored.objectKey
      ? stored.contentType
      : CATALOG_IMAGE_OUTPUT_CONTENT_TYPE,
  );
  headers.set("etag", object.httpEtag);
  headers.set("x-content-type-options", "nosniff");
  const immutable = immutableImageRequest(c.req.raw, stored.revision);
  headers.set(
    "cache-control",
    immutable
      ? "public, max-age=31536000, immutable"
      : "public, max-age=0, must-revalidate",
  );
  if (etagMatches(c.req.raw, object.httpEtag)) {
    return new Response(null, { status: 304, headers });
  }
  const response = new Response(object.body, { headers });
  if (cacheKey && immutable) {
    c.executionCtx.waitUntil(
      caches.default.put(new Request(cacheKey.url), response.clone()),
    );
  }
  return response;
});
app.get("/api/overview", async (c) => c.json(await getOverview(c.env.DB)));
app.get("/api/missing", async (c) => c.json(await getMissing(c.env.DB)));
app.get("/api/market", async (c) => c.json(await getMarket(c.env.DB)));
app.get("/api/trade-posts", async (c) =>
  c.json(await getPublicTradePosts(c.env.DB)),
);
app.get("/api/trade-posts/:publicId", async (c) => {
  const publicId = c.req.param("publicId");
  if (publicId.length > 64) return c.json({ error: "not found" }, 404);
  const post = await getPublicTradePost(c.env.DB, publicId);
  return post ? c.json(post) : c.json({ error: "not found" }, 404);
});
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

admin.get("/catalog-media", async (c) =>
  c.json(await listCatalogMedia(c.env.DB)),
);

admin.put("/catalog/:id/image", async (c) => {
  const catalogId = Number(c.req.param("id"));
  if (!Number.isInteger(catalogId) || catalogId < 1) {
    return c.json({ error: "bad catalog id" }, 400);
  }
  if (!(await catalogSlotExists(c.env.DB, catalogId))) {
    return c.json({ error: "catalog slot not found" }, 404);
  }

  const contentType = (c.req.header("content-type") ?? "")
    .split(";", 1)[0]
    .trim()
    .toLowerCase();
  if (!isCatalogImageContentType(contentType)) {
    return c.json({ error: "image must be JPEG, PNG, WebP, or AVIF" }, 415);
  }
  const claimedSize = claimedUploadSize(c.req.raw);
  if (
    claimedSize !== null &&
    (!Number.isInteger(claimedSize) || claimedSize < 1)
  ) {
    return c.json({ error: "image size must be a positive integer" }, 400);
  }
  if (claimedSize !== null && claimedSize > CATALOG_IMAGE_MAX_BYTES) {
    return c.json({ error: "image exceeds the 15 MB limit" }, 413);
  }
  if (claimedSize === null) {
    return c.json({ error: "image size required" }, 411);
  }
  if (!c.req.raw.body) return c.json({ error: "image body required" }, 400);

  let imageBytes: ArrayBuffer;
  try {
    imageBytes = await c.req.arrayBuffer();
  } catch {
    return c.json({ error: "image body could not be read" }, 400);
  }
  if (imageBytes.byteLength !== claimedSize) {
    return c.json({ error: "image size does not match the request body" }, 400);
  }

  const uploadFilename = decodedUploadFilename(
    c.req.header("x-card-image-filename"),
  );
  if (uploadFilename.error) {
    return c.json({ error: uploadFilename.error }, 400);
  }

  const side: CatalogMediaSide = "front";
  const oldMedia = await getStoredCatalogMedia(c.env.DB, catalogId, side);
  const objectKeys = catalogImageObjectKeys(
    catalogId,
    side,
    crypto.randomUUID(),
  );
  let optimized: Record<"thumb" | "card", ArrayBuffer>;
  try {
    await validateCatalogImage(c.env.IMAGES, imageBytes);
    const [thumb, card] = await Promise.all([
      optimizeCatalogImage(c.env.IMAGES, imageBytes, "thumb"),
      optimizeCatalogImage(c.env.IMAGES, imageBytes, "card"),
    ]);
    optimized = { thumb, card };
  } catch (error) {
    console.error(
      JSON.stringify({
        message: "catalog media optimization failed",
        catalogId,
        side,
        error: String(error),
      }),
    );
    return c.json({ error: "image could not be decoded or optimized" }, 422);
  }

  const imageMetadata = {
    httpMetadata: {
      contentType: CATALOG_IMAGE_OUTPUT_CONTENT_TYPE,
      contentDisposition: "inline" as const,
      cacheControl: "public, max-age=31536000, immutable",
    },
  };
  const [thumbUpload, cardUpload] = await Promise.allSettled([
    c.env.CARD_IMAGES.put(objectKeys.thumb, optimized.thumb, {
      ...imageMetadata,
      customMetadata: {
        catalogId: String(catalogId),
        side,
        variant: "thumb",
      },
    }),
    c.env.CARD_IMAGES.put(objectKeys.card, optimized.card, {
      ...imageMetadata,
      customMetadata: {
        catalogId: String(catalogId),
        side,
        variant: "card",
      },
    }),
  ]);
  if (thumbUpload.status === "rejected" || cardUpload.status === "rejected") {
    try {
      await c.env.CARD_IMAGES.delete(Object.values(objectKeys));
    } catch (cleanupError) {
      console.error(
        JSON.stringify({
          message: "failed to clean up partially uploaded catalog media",
          catalogId,
          side,
          objectKeys,
          error: String(cleanupError),
        }),
      );
    }
    console.error(
      JSON.stringify({
        message: "catalog media upload failed",
        catalogId,
        side,
        objectKeys,
        error: String(
          thumbUpload.status === "rejected"
            ? thumbUpload.reason
            : cardUpload.status === "rejected"
              ? cardUpload.reason
              : "unknown upload failure",
        ),
      }),
    );
    return c.json({ error: "image storage is unavailable" }, 503);
  }

  const uploaded = { thumb: thumbUpload.value, card: cardUpload.value };
  const invalidOutput = Object.values(uploaded).find(
    (object) => object.size < 1 || object.size > CATALOG_IMAGE_MAX_BYTES,
  );
  if (invalidOutput) {
    await c.env.CARD_IMAGES.delete(Object.values(objectKeys));
    return invalidOutput.size < 1
      ? c.json({ error: "image body required" }, 400)
      : c.json({ error: "optimized image exceeds the 15 MB limit" }, 413);
  }

  let revision: number;
  try {
    revision = await saveCatalogMedia(c.env.DB, {
      catalogId,
      side,
      objectKey: objectKeys.card,
      contentType: CATALOG_IMAGE_OUTPUT_CONTENT_TYPE,
      byteSize: uploaded.card.size,
      etag: uploaded.card.etag,
      originalFilename: uploadFilename.filename,
    });
  } catch (error) {
    try {
      await c.env.CARD_IMAGES.delete(Object.values(objectKeys));
    } catch (cleanupError) {
      console.error(
        JSON.stringify({
          message: "failed to clean up an unreferenced catalog media object",
          catalogId,
          side,
          objectKeys,
          error: String(cleanupError),
        }),
      );
    }
    console.error(
      JSON.stringify({
        message: "catalog media metadata save failed",
        catalogId,
        side,
        error: String(error),
      }),
    );
    return c.json({ error: "image metadata could not be saved" }, 500);
  }

  if (oldMedia && oldMedia.objectKey !== objectKeys.card) {
    try {
      await c.env.CARD_IMAGES.delete(
        catalogImageStoredObjectKeys(oldMedia.objectKey),
      );
    } catch (error) {
      console.error(
        JSON.stringify({
          message: "failed to clean up a replaced catalog media object",
          catalogId,
          side,
          objectKey: oldMedia.objectKey,
          error: String(error),
        }),
      );
    }
  }
  return c.json({ ok: true as const, revision });
});

admin.delete("/catalog/:id/image", async (c) => {
  const catalogId = Number(c.req.param("id"));
  if (!Number.isInteger(catalogId) || catalogId < 1) {
    return c.json({ error: "bad catalog id" }, 400);
  }
  const side: CatalogMediaSide = "front";
  const stored = await getStoredCatalogMedia(c.env.DB, catalogId, side);
  if (!stored) return c.json({ error: "image not found" }, 404);

  try {
    await c.env.CARD_IMAGES.delete(
      catalogImageStoredObjectKeys(stored.objectKey),
    );
    if (!(await deleteCatalogMediaMetadata(c.env.DB, catalogId, side))) {
      return c.json({ error: "image not found" }, 404);
    }
  } catch (error) {
    console.error(
      JSON.stringify({
        message: "catalog media delete failed",
        catalogId,
        side,
        error: String(error),
      }),
    );
    return c.json({ error: "image could not be deleted" }, 503);
  }
  return c.json({ ok: true as const });
});

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
  let acquisition: AcquisitionEventInput | undefined;
  if (input.acquisition !== undefined) {
    if (opening) {
      return c.json(
        { error: "pack cards cannot include separate acquisition details" },
        400,
      );
    }
    const normalized = normalizeAcquisitionEventInput(input.acquisition);
    if (!normalized.value) {
      return c.json(
        { error: normalized.error ?? "invalid acquisition details" },
        400,
      );
    }
    acquisition = normalized.value;
  }
  const validationError = validateCards(cards, opening);
  if (validationError) return c.json({ error: validationError }, 400);
  try {
    if (opening) {
      return c.json(await addPack(c.env.DB, cards, opening));
    }
    return c.json({
      ids: await addCards(c.env.DB, cards, undefined, acquisition),
    });
  } catch (error) {
    return c.json({ error: String(error) }, 400);
  }
});

admin.patch("/cards/:id", async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id) || id < 1) return c.json({ error: "bad id" }, 400);
  let body: unknown;
  try {
    body = await c.req.json<unknown>();
  } catch {
    return c.json({ error: "invalid JSON body" }, 400);
  }
  const normalized = normalizeUpdateCardInput(body);
  if (!normalized.value) {
    return c.json({ error: normalized.error ?? "invalid card update" }, 400);
  }
  try {
    await updateCard(c.env.DB, id, normalized.value);
  } catch (error) {
    return c.json({ error: String(error) }, 409);
  }
  return c.json({ ok: true });
});

admin.post("/cards/:id/reclassify", async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id) || id < 1) return c.json({ error: "bad id" }, 400);
  let body: unknown;
  try {
    body = await c.req.json<unknown>();
  } catch {
    return c.json({ error: "invalid JSON body" }, 400);
  }
  const normalized = normalizeReclassifyCardInput(body);
  if (!normalized.value) {
    return c.json(
      { error: normalized.error ?? "invalid reclassification" },
      400,
    );
  }
  try {
    await reclassifyCard(c.env.DB, id, normalized.value);
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
  let body: unknown;
  try {
    body = await c.req.json<unknown>();
  } catch {
    return c.json({ error: "invalid JSON body" }, 400);
  }
  const normalized = normalizeTransactionInput(body);
  if (!normalized.value || normalized.cardId === undefined) {
    return c.json({ error: normalized.error ?? "invalid transaction" }, 400);
  }
  try {
    const id = await recordTransaction(
      c.env.DB,
      normalized.cardId,
      normalized.value,
    );
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

admin.get("/trade-posts", async (c) =>
  c.json(await getAdminTradePosts(c.env.DB)),
);

admin.get("/trade-posts/candidates", async (c) =>
  c.json(await getTradePostCandidates(c.env.DB)),
);

admin.post("/trade-posts", async (c) => {
  let body: unknown;
  try {
    body = await c.req.json<unknown>();
  } catch {
    return c.json({ error: "invalid JSON body" }, 400);
  }
  const normalized = normalizeTradePostInput(body);
  if (!normalized.value) {
    return c.json({ error: normalized.error ?? "invalid announcement" }, 400);
  }
  try {
    return c.json(await createTradePost(c.env.DB, normalized.value), 201);
  } catch (error) {
    return c.json({ error: String(error) }, 409);
  }
});

admin.put("/trade-posts/:id", async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id) || id < 1) {
    return c.json({ error: "bad announcement id" }, 400);
  }
  let body: unknown;
  try {
    body = await c.req.json<unknown>();
  } catch {
    return c.json({ error: "invalid JSON body" }, 400);
  }
  const normalized = normalizeTradePostInput(body);
  if (!normalized.value) {
    return c.json({ error: normalized.error ?? "invalid announcement" }, 400);
  }
  try {
    return c.json(await updateTradePost(c.env.DB, id, normalized.value));
  } catch (error) {
    return c.json({ error: String(error) }, 409);
  }
});

admin.post("/trade-posts/:id/publish", async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id) || id < 1) {
    return c.json({ error: "bad announcement id" }, 400);
  }
  try {
    return c.json(await publishTradePost(c.env.DB, id));
  } catch (error) {
    return c.json({ error: String(error) }, 409);
  }
});

admin.post("/trade-posts/:id/close", async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id) || id < 1) {
    return c.json({ error: "bad announcement id" }, 400);
  }
  try {
    return c.json(await closeTradePost(c.env.DB, id));
  } catch (error) {
    return c.json({ error: String(error) }, 409);
  }
});

admin.post("/trade-posts/:id/reservations", async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id) || id < 1) {
    return c.json({ error: "bad announcement id" }, 400);
  }
  let body: unknown;
  try {
    body = await c.req.json<unknown>();
  } catch {
    return c.json({ error: "invalid JSON body" }, 400);
  }
  const normalized = normalizeTradePostReservationInput(body);
  if (!normalized.value) {
    return c.json(
      { error: normalized.error ?? "invalid exchange reservation" },
      400,
    );
  }
  try {
    const reservationId = await createTradePostReservation(
      c.env.DB,
      id,
      normalized.value,
    );
    return c.json({ id: reservationId }, 201);
  } catch (error) {
    return c.json({ error: String(error) }, 409);
  }
});

admin.delete("/trade-posts/:id", async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id) || id < 1) {
    return c.json({ error: "bad announcement id" }, 400);
  }
  try {
    await deleteTradePost(c.env.DB, id);
    return c.json({ ok: true });
  } catch (error) {
    return c.json({ error: String(error) }, 409);
  }
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
