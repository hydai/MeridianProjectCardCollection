import type { MarketListing } from "../../shared/types";

export interface ListingGroup {
  key: string;
  item: MarketListing;
  quantity: number;
  reserved: number;
  reservedSale: number;
}

export function groupListings(items: MarketListing[]): ListingGroup[] {
  const groups = new Map<string, ListingGroup>();
  for (const item of items) {
    // Only combine copies with the same public terms and condition notes.
    // Irrelevant stale fields (e.g. an old trade wish on a sale) are ignored.
    const key = JSON.stringify([
      item.series,
      item.character,
      item.rarity,
      item.status,
      item.status === "for_sale"
        ? item.askingPrice
        : item.wantInReturn?.trim() || null,
      item.note?.trim() || null,
    ]);
    const existing = groups.get(key);
    if (existing) {
      existing.quantity++;
      existing.reserved += Number(item.reserved);
      existing.reservedSale += Number(
        item.reserved && item.reservationType === "sale",
      );
    } else {
      groups.set(key, {
        key,
        item,
        quantity: 1,
        reserved: Number(item.reserved),
        reservedSale: Number(item.reserved && item.reservationType === "sale"),
      });
    }
  }
  return [...groups.values()];
}

export function listingTerms(item: MarketListing): string {
  return item.status === "for_sale"
    ? item.askingPrice == null
      ? "價格面議"
      : `${item.askingPrice} 元`
    : item.wantInReturn?.trim()
      ? `想換：${item.wantInReturn.trim()}`
      : "開放出價";
}
