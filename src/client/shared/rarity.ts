// Rarity text-colour utility classes, ordered to line up 1:1 with the catalog's
// RARITIES (seed/catalog-def): RARITY_TEXT[i] is the colour for RARITIES[i].
// The single source for these four colours, shared by the collection views and
// the admin pills, so neither layer keeps a parallel copy.
export const RARITY_TEXT = [
  "text-rarity-r",
  "text-rarity-sr",
  "text-rarity-ssr",
  "text-rarity-ur",
] as const;
