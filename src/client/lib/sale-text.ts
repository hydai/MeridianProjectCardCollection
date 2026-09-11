import { RARITY_ORDER } from "../../shared/rarity";
import type { MarketListing } from "../../shared/types";
import type { Matrix } from "../collection";

/** null means volume metadata is unavailable; an empty string means no available sales. */
export function formatSaleList(
  listings: MarketListing[],
  catalog?: Pick<Matrix, "series" | "volumes" | "characters"> | null,
): string | null {
  const available = listings.filter(
    (item) => item.status === "for_sale" && !item.reserved,
  );
  if (!available.length) return "";
  if (!catalog) return null;
  const series = new Map(catalog.series.map((name, index) => [name, index]));
  const characters = new Map(
    catalog.characters.map((name, index) => [name, index]),
  );
  const groups = new Map<
    string,
    { item: MarketListing; volume: number; quantity: number }
  >();
  for (const item of available) {
    const index = series.get(item.series);
    const volume = index === undefined ? undefined : catalog.volumes[index];
    // Never invent a volume or silently omit a listed card while metadata loads.
    if (volume === undefined || !Number.isInteger(volume) || volume < 1)
      return null;
    const key = JSON.stringify([item.rarity, item.series, item.character]);
    const group = groups.get(key);
    if (group) group.quantity++;
    else groups.set(key, { item, volume, quantity: 1 });
  }
  const ordered = [...groups.values()].sort(
    (a, b) =>
      RARITY_ORDER.indexOf(b.item.rarity) -
        RARITY_ORDER.indexOf(a.item.rarity) ||
      a.volume - b.volume ||
      (characters.get(a.item.character) ?? catalog.characters.length) -
        (characters.get(b.item.character) ?? catalog.characters.length) ||
      a.item.character.localeCompare(b.item.character, "en") ||
      (series.get(a.item.series) ?? 0) - (series.get(b.item.series) ?? 0),
  );
  const lines: string[] = [];
  let rarity: string | undefined;
  let volume: number | undefined;
  for (const group of ordered) {
    if (group.item.rarity !== rarity) {
      rarity = group.item.rarity;
      volume = undefined;
      lines.push(rarity);
    }
    if (group.volume !== volume) {
      volume = group.volume;
      lines.push(`VOL.${volume}`);
    }
    lines.push(
      `${group.item.character} ${group.item.series} ${group.quantity}`,
    );
  }
  return lines.join("\n");
}
