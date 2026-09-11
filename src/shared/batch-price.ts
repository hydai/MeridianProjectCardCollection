import { MAX_CARD_BATCH_SIZE } from "./card-batch";
import type { BatchPriceInput } from "./types";

export class BatchPriceInputError extends Error {}

export function parseBatchPriceInput(body: unknown): BatchPriceInput {
  if (!body || typeof body !== "object" || Array.isArray(body))
    throw new BatchPriceInputError("改價資料格式不正確。");
  const input = body as Record<string, unknown>;
  if (
    typeof input.askingPrice !== "number" ||
    !Number.isFinite(input.askingPrice) ||
    input.askingPrice < 0 ||
    !/^\d+(?:\.\d{1,2})?$/.test(String(input.askingPrice))
  )
    throw new BatchPriceInputError("新售價必須是 0 以上、最多兩位小數的數字。");
  if (
    !Array.isArray(input.cards) ||
    input.cards.length < 1 ||
    input.cards.length > MAX_CARD_BATCH_SIZE
  )
    throw new BatchPriceInputError(
      `每批請選擇 1 至 ${MAX_CARD_BATCH_SIZE} 張卡片。`,
    );
  const ids = new Set<number>();
  const cards = input.cards.map((value: unknown) => {
    if (!value || typeof value !== "object" || Array.isArray(value))
      throw new BatchPriceInputError("卡片資料格式不正確。");
    const card = value as Record<string, unknown>;
    if (
      typeof card.cardId !== "number" ||
      !Number.isSafeInteger(card.cardId) ||
      card.cardId < 1 ||
      ids.has(card.cardId) ||
      typeof card.catalogId !== "number" ||
      !Number.isSafeInteger(card.catalogId) ||
      card.catalogId < 1
    )
      throw new BatchPriceInputError(
        "卡片與卡位編號必須有效，且不能重複選取同一張卡。",
      );
    if (
      card.currentPrice !== null &&
      (typeof card.currentPrice !== "number" ||
        !Number.isFinite(card.currentPrice) ||
        card.currentPrice < 0)
    )
      throw new BatchPriceInputError(
        "請提供預覽時的原售價，或重新整理後再試。",
      );
    ids.add(card.cardId);
    return {
      cardId: card.cardId,
      catalogId: card.catalogId,
      currentPrice: card.currentPrice as number | null,
    };
  });
  return { askingPrice: input.askingPrice, cards };
}
