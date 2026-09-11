import { MAX_CARD_BATCH_SIZE } from "./card-batch";
import type { CreateSaleReservationInput } from "./types";

export class SaleReservationInputError extends Error {}

export function saleReservationDate(value: unknown): string {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    !Number.isFinite(Date.parse(`${value}T00:00:00Z`)) ||
    new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) !== value
  ) {
    throw new SaleReservationInputError("請填寫有效日期（YYYY-MM-DD）。");
  }
  return value;
}

export function parseSaleReservationInput(
  body: unknown,
): CreateSaleReservationInput {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new SaleReservationInputError("出售預約資料格式不正確。");
  }
  const input = body as Record<string, unknown>;
  const reservedAt = saleReservationDate(input.reservedAt);
  const text = (key: string, max: number) => {
    const value = input[key];
    if (value == null) return undefined;
    if (typeof value !== "string" || value.length > max) {
      throw new SaleReservationInputError(
        `${key === "note" ? "備註" : "買家"}不可超過 ${max} 字。`,
      );
    }
    return value.trim() || undefined;
  };
  if (
    !Array.isArray(input.cards) ||
    input.cards.length < 1 ||
    input.cards.length > MAX_CARD_BATCH_SIZE
  ) {
    throw new SaleReservationInputError(
      `每筆請選擇 1 至 ${MAX_CARD_BATCH_SIZE} 張卡片。`,
    );
  }
  const ids = new Set<number>();
  const cards = input.cards.map((raw: unknown) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      throw new SaleReservationInputError("卡片資料格式不正確。");
    }
    const item = raw as Record<string, unknown>;
    if (
      typeof item.cardId !== "number" ||
      !Number.isSafeInteger(item.cardId) ||
      item.cardId < 1 ||
      typeof item.catalogId !== "number" ||
      !Number.isSafeInteger(item.catalogId) ||
      item.catalogId < 1 ||
      ids.has(item.cardId)
    ) {
      throw new SaleReservationInputError(
        "卡片與卡位編號必須有效，且不能重複選取同一張卡。",
      );
    }
    if (
      typeof item.unitPrice !== "number" ||
      !Number.isFinite(item.unitPrice) ||
      item.unitPrice < 0 ||
      item.unitPrice > 1_000_000_000 ||
      !/^\d+(?:\.\d{1,2})?$/.test(String(item.unitPrice))
    ) {
      throw new SaleReservationInputError(
        "請填寫 0 至 10 億元、最多兩位小數的約定單價。",
      );
    }
    ids.add(item.cardId);
    return {
      cardId: item.cardId,
      catalogId: item.catalogId,
      unitPrice: item.unitPrice,
    };
  });
  return {
    reservedAt,
    counterparty: text("counterparty", 200),
    note: text("note", 2000),
    cards,
  };
}
