// Shared "state line" tokens, ported 1:1 from the legacy index.css `.state-msg`
// (loading) and `.trade-empty` (empty) rules so those two hand-written classes
// can be deleted (Phase 5). Kept in @/shared (like RARITY_TEXT) because both the
// public views and the admin panels render these lines — a neutral home avoids a
// public↔admin import edge.

// Loading line (legacy `.state-msg`): Cormorant italic, dim, centred, 48px pad.
export const STATE_MSG =
  "py-12 text-center font-accent italic tracking-[0.1em] text-[var(--text-tertiary)]";

// Empty line (legacy `.trade-empty`): dim, 13px, tight tracking, 12px/2px pad.
export const EMPTY_MSG =
  "px-0.5 py-3 text-[13px] tracking-[0.04em] text-[var(--text-tertiary)]";
