import { MAX_CARD_BATCH_SIZE } from "./card-batch";
import type { BatchListingInput } from "./types";

export class BatchListingInputError extends Error {}

export function parseBatchListingInput(body: unknown): BatchListingInput {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new BatchListingInputError("上架資料格式不正確。");
  }
  const input = body as Record<string, unknown>;
  if (input.status !== "for_sale" && input.status !== "for_trade") {
    throw new BatchListingInputError("請選擇待售或待換。");
  }
  if (
    !Array.isArray(input.cards) ||
    input.cards.length < 1 ||
    input.cards.length > MAX_CARD_BATCH_SIZE
  ) {
    throw new BatchListingInputError(
      `每批請選擇 1 至 ${MAX_CARD_BATCH_SIZE} 張卡片。`,
    );
  }
  const ids = new Set<number>();
  const cards = input.cards.map((item: unknown) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new BatchListingInputError("卡片資料格式不正確。");
    }
    const card = item as Record<string, unknown>;
    if (
      typeof card.cardId !== "number" ||
      !Number.isSafeInteger(card.cardId) ||
      card.cardId < 1 ||
      typeof card.catalogId !== "number" ||
      !Number.isSafeInteger(card.catalogId) ||
      card.catalogId < 1 ||
      ids.has(card.cardId)
    ) {
      throw new BatchListingInputError(
        "卡片與卡位編號必須有效，且不能重複選取同一張卡。",
      );
    }
    ids.add(card.cardId);
    return { cardId: card.cardId, catalogId: card.catalogId };
  });
  if (
    input.askingPrice != null &&
    (typeof input.askingPrice !== "number" ||
      !Number.isFinite(input.askingPrice) ||
      input.askingPrice < 0 ||
      !/^\d+(?:\.\d{1,2})?$/.test(String(input.askingPrice)))
  ) {
    throw new BatchListingInputError("售價必須是 0 以上、最多兩位小數的數字。");
  }
  if (
    input.wantInReturn != null &&
    (typeof input.wantInReturn !== "string" || input.wantInReturn.length > 1000)
  ) {
    throw new BatchListingInputError("交換條件不可超過 1000 字。");
  }
  return {
    status: input.status,
    cards,
    ...(input.status === "for_sale"
      ? {
          askingPrice: (input.askingPrice as number | null | undefined) ?? null,
        }
      : {
          wantInReturn:
            (input.wantInReturn as string | null | undefined)?.trim() || null,
        }),
  };
}
