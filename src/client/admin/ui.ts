import type { Rarity } from "../../shared/types";

// === Admin design-system constants (Phase 4) =========================
// Tailwind rebuilds of admin.css, shared across the five admin panels so
// AddCards (4a), ManageCards/PendingTrades (4b), Openings/History (4c) stay
// DRY. Values are ported 1:1 from admin.css; see the plan's token table.

// Panel shell (.panel / .panel-title).
export const PANEL =
  "mb-[18px] rounded-[4px] border-[0.5px] border-border bg-card px-[26px] py-6";
export const PANEL_TITLE =
  "mb-[18px] font-serif text-[17px] font-medium tracking-[0.04em] text-foreground";

// Form field (.field / .field-label) + the shared input/select control
// (.admin input/select). CONTROL fully styles a native control, so it skins
// both <Input> and native <select> (kept native per the Phase 4 fidelity
// decision); it overrides the Input primitive's bg/border/shadow/focus.
export const FIELD = "flex flex-col gap-1.5";
export const FIELD_LABEL =
  "text-[11px] uppercase tracking-[0.15em] text-[var(--text-tertiary)]";
export const CONTROL =
  "w-full appearance-none rounded-[4px] border-[0.5px] border-[var(--border-strong)] bg-[var(--bg-subtle)] px-3 py-[9px] font-sans text-sm text-foreground shadow-none outline-none focus:border-primary focus-visible:border-primary focus-visible:ring-0";

// Buttons. .btn-primary is a gold gradient; rendered on shadcn <Button>, the
// gradient background-image paints over Button's solid bg-primary, so default-
// variant parity holds. .btn-ghost.btn-sm → <Button variant="outline">.
export const BTN_PRIMARY =
  "h-auto rounded-[4px] bg-gradient-to-r from-[var(--primary-dim)] to-primary px-[26px] py-[11px] font-sans text-sm font-semibold tracking-[0.06em] text-[#1a1612] hover:brightness-[1.08]";
export const BTN_GHOST_SM =
  "h-auto rounded-[4px] border-[0.5px] border-[var(--border-strong)] bg-transparent px-2.5 py-1 font-sans text-[11px] font-normal tracking-[0.06em] text-muted-foreground hover:border-primary hover:bg-transparent hover:text-primary";

// Flat option chips (.opt / .opt-group). Series + rarity are single-select
// shadcn <Toggle> (role=button + aria-pressed, like the Phase 3c Grid
// filters); character chips are momentary <Button variant="ghost">. OPT_TOGGLE
// overrides BOTH the toggleVariants base `data-[state=on]:bg-muted` and
// `aria-pressed:bg-muted` with the .opt.active gold fill (distinct variant
// prefixes, so tailwind-merge keeps both).
export const OPT_GROUP = "flex flex-wrap gap-2";
const OPT_BASE =
  "h-auto rounded-[4px] border-[0.5px] border-[var(--border-strong)] bg-[var(--bg-subtle)] px-3.5 py-2 font-sans text-[13px] font-normal tracking-[0.04em] text-muted-foreground transition-colors hover:border-primary hover:bg-[var(--bg-subtle)] hover:text-foreground";
export const OPT_CHIP = OPT_BASE;
export const OPT_TOGGLE = `${OPT_BASE} data-[state=on]:border-primary data-[state=on]:bg-[rgba(201,161,74,0.08)] data-[state=on]:text-primary aria-pressed:border-primary aria-pressed:bg-[rgba(201,161,74,0.08)] aria-pressed:text-primary`;
// Active rarity takes its own colour (.opt.rarity.<r>.active) — overrides the
// gold OPT_TOGGLE active block (same data-[state=on]/aria-pressed props, listed
// last so tailwind-merge keeps these).
export const OPT_RARITY: Record<Rarity, string> = {
  R: "data-[state=on]:border-[rgba(154,149,139,0.5)] data-[state=on]:bg-[rgba(154,149,139,0.08)] data-[state=on]:text-rarity-r aria-pressed:border-[rgba(154,149,139,0.5)] aria-pressed:bg-[rgba(154,149,139,0.08)] aria-pressed:text-rarity-r",
  SR: "data-[state=on]:border-[rgba(212,168,87,0.5)] data-[state=on]:bg-[rgba(212,168,87,0.08)] data-[state=on]:text-rarity-sr aria-pressed:border-[rgba(212,168,87,0.5)] aria-pressed:bg-[rgba(212,168,87,0.08)] aria-pressed:text-rarity-sr",
  SSR: "data-[state=on]:border-[rgba(214,138,163,0.5)] data-[state=on]:bg-[rgba(214,138,163,0.08)] data-[state=on]:text-rarity-ssr aria-pressed:border-[rgba(214,138,163,0.5)] aria-pressed:bg-[rgba(214,138,163,0.08)] aria-pressed:text-rarity-ssr",
  UR: "data-[state=on]:border-[rgba(224,113,113,0.5)] data-[state=on]:bg-[rgba(224,113,113,0.08)] data-[state=on]:text-rarity-ur aria-pressed:border-[rgba(224,113,113,0.5)] aria-pressed:bg-[rgba(224,113,113,0.08)] aria-pressed:text-rarity-ur",
};

// Admin pills (.pill + rarity colour) — 10px neutral-bordered chips kept as a
// styled <span> (smaller/flatter than the views' Badge; see Phase 4 note).
// 4b adds status/dup/reserved variants.
export const PILL_BASE =
  "inline-flex items-center whitespace-nowrap rounded-full border-[0.5px] border-[var(--border-strong)] px-[9px] py-0.5 text-[10px] tracking-[0.1em] text-[var(--text-tertiary)]";
export const PILL_RARITY: Record<Rarity, string> = {
  R: "text-rarity-r",
  SR: "text-rarity-sr",
  SSR: "text-rarity-ssr",
  UR: "text-rarity-ur",
};

// Running tally list (.tally*).
export const TALLY =
  "mt-4 rounded-[4px] border-[0.5px] border-border bg-[var(--bg-subtle)]";
export const TALLY_ROW =
  "flex items-center gap-2.5 border-b-[0.5px] border-border px-3 py-2 last:border-b-0";
export const TALLY_SERIES =
  "whitespace-nowrap text-[11px] tracking-[0.04em] text-[var(--text-tertiary)]";
export const TALLY_NAME = "min-w-[84px] text-sm text-foreground";
export const TALLY_QTY = "ml-auto font-mono text-[13px] text-muted-foreground";
export const TALLY_EMPTY =
  "mt-4 text-[13px] tracking-[0.06em] text-[var(--text-tertiary)]";

// Opening sub-form (.add-actions / .opening-fields) + checkbox row.
export const CHECKBOX_ROW =
  "mt-5 flex cursor-pointer items-center gap-2 text-sm text-muted-foreground";
// appearance-auto restores native checkbox rendering (legacy `.admin input`
// sets appearance:none, which would otherwise make accent-primary inert).
export const CHECKBOX = "h-auto w-auto appearance-auto accent-primary";
export const OPENING_FIELDS =
  "mt-2 mb-4 grid grid-cols-2 gap-3 max-[600px]:grid-cols-1";
export const ADD_ACTIONS = "mt-4 flex flex-wrap items-center gap-3";

// Toast (.toast italic gold accent) + inline error (.error-text).
export const TOAST =
  "font-accent text-sm italic tracking-[0.06em] text-primary";
export const ERROR_TEXT = "text-[13px] text-destructive";
