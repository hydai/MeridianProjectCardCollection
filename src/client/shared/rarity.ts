// Rarity text-colour utility classes, ordered to line up 1:1 with the shared
// RARITY_ORDER: RARITY_TEXT[i] is the colour for RARITY_ORDER[i].
// The single source for these five colours, shared by the collection views and
// the admin pills, so neither layer keeps a parallel copy.
export const RARITY_TEXT = [
  "text-rarity-r",
  "text-rarity-sr",
  "text-rarity-ssr",
  "text-rarity-ur",
  "text-rarity-ex",
] as const;
