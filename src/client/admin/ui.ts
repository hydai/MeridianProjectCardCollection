import { cn } from "@/lib/utils";
import { RARITY_TEXT } from "@/shared/rarity";
import { RARITIES } from "../../../seed/catalog-def";
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
// shadcn <Toggle> (role=button + aria-pressed, like the Phase 3c Grid filters);
// character chips are momentary <Button variant="ghost">. OPT_BASE carries no
// active state. OPT_TOGGLE adds the gold .opt.active fill for the series toggles
// (its data-[state=on]/aria-pressed utilities also override toggleVariants' own
// data-[state=on]:bg-muted). Rarity toggles instead compose their own colour via
// cn(OPT_BASE, OPT_RARITY[rr]) — OPT_BASE has nothing active to override, so the
// result no longer depends on cn() argument order.
export const OPT_GROUP = "flex flex-wrap gap-2";
export const OPT_BASE =
  "h-auto rounded-[4px] border-[0.5px] border-[var(--border-strong)] bg-[var(--bg-subtle)] px-3.5 py-2 font-sans text-[13px] font-normal tracking-[0.04em] text-muted-foreground transition-colors hover:border-primary hover:bg-[var(--bg-subtle)] hover:text-foreground";
export const OPT_CHIP = OPT_BASE;
export const OPT_TOGGLE = `${OPT_BASE} data-[state=on]:border-primary data-[state=on]:bg-[rgba(201,161,74,0.08)] data-[state=on]:text-primary aria-pressed:border-primary aria-pressed:bg-[rgba(201,161,74,0.08)] aria-pressed:text-primary`;
// Active rarity takes its own colour (.opt.rarity.<r>.active), overriding the
// Toggle's default data-[state=on]/aria-pressed fill. Composed at the call site
// as cn(OPT_BASE, OPT_RARITY[rr]); since OPT_BASE has no active utilities, the
// outcome is independent of cn() argument order.
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
// Rarity text colour reuses the shared RARITY_TEXT token (@/shared/rarity) — the
// single source also used by the collection views — indexed by RARITIES order,
// instead of a parallel map.
export const PILL_RARITY: Record<Rarity, string> = Object.fromEntries(
  RARITIES.map((r, i): [Rarity, string] => [r, RARITY_TEXT[i]]),
) as Record<Rarity, string>;

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

// === Phase 4b: ManageCards (+ shared with PendingTrades / 4c) ========

// Admin data table (.admin-table) — bespoke <table>, ported 1:1 from
// admin.css (4b decision: keep a plain table rather than fight shadcn
// Table's 1px-row-border / nowrap / last-row-stripped defaults). The
// hover tint is the legacy `.admin-table tr:hover td` selector verbatim.
export const TABLE =
  "w-full border-collapse text-[13px] [&_tr:hover_td]:bg-[rgba(255,255,255,0.012)]";
export const TH =
  "border-b-[0.5px] border-border px-2.5 py-2 text-left text-[10px] font-normal uppercase tracking-[0.18em] text-[var(--text-tertiary)]";
export const TD =
  "border-b-[0.5px] border-border p-2.5 text-left align-middle font-sans text-muted-foreground";

// Filter bar (.filters) above the ManageCards table. Each field composes
// cn(FIELD, "min-w-[150px]") for the legacy .filters .field min-width.
export const FILTERS = "mb-[18px] flex flex-wrap items-end gap-[14px]";

// Row action button cluster (.row-actions).
export const ROW_ACTIONS = "flex flex-wrap gap-1.5";

// Inline expand-in-place form (.action-form) + its field row (.inline-fields),
// shared by ManageCards's ActionForm and PendingTrades's ReservationForm.
export const ACTION_FORM =
  "mt-2 rounded-[4px] border-[0.5px] border-border bg-[var(--bg-subtle)] px-3.5 py-3";
export const INLINE_FIELDS = "flex flex-wrap items-end gap-2";

// Small gold primary button (.btn-primary.btn-sm) — the .btn-sm-sized sibling
// of BTN_PRIMARY, for the inline confirm actions (確認 / 新增預約 / 確認完成).
export const BTN_PRIMARY_SM =
  "h-auto rounded-[4px] bg-gradient-to-r from-[var(--primary-dim)] to-primary px-2.5 py-1 font-sans text-[11px] font-semibold tracking-[0.06em] text-[#1a1612] hover:brightness-[1.08]";

// Status / duplicate / reserved pills, layered on PILL_BASE via cn(). `owned`
// has no legacy rule → base only (""). for_sale/for_trade recolour text + border;
// sold/traded dim to quaternary; dup is gold-filled; reserved is amber-filled
// (its border stays PILL_BASE's border-strong — legacy .pill.reserved sets only
// background + color).
export const PILL_STATUS: Record<string, string> = {
  owned: "",
  for_sale: "border-[rgba(212,168,87,0.4)] text-rarity-sr",
  for_trade: "border-[rgba(214,138,163,0.4)] text-rarity-ssr",
  sold: "text-[var(--text-quaternary)]",
  traded: "text-[var(--text-quaternary)]",
};
export const PILL_DUP =
  "border-[rgba(201,161,74,0.4)] bg-[rgba(201,161,74,0.08)] text-primary";
export const PILL_RESERVED = "bg-[rgba(234,179,8,0.15)] text-[#a16207]";

// === Phase 4b: PendingTrades line editor (.line-editor / -head / -row) =
export const LINE_EDITOR = "mt-3";
export const LINE_EDITOR_HEAD = "mb-1.5 flex items-center gap-3";
export const LINE_ROW = "mt-1.5 flex items-center gap-2";

// === Phase 4c: Openings + History ====================================

// Summary line (.summary-line) above the openings / history tables. The
// descendant variant ports `.summary-line strong` (brighter, medium weight)
// so the <strong> children need no per-element class.
export const SUMMARY_LINE =
  "mb-4 text-[13px] tracking-[0.06em] text-muted-foreground [&_strong]:font-medium [&_strong]:text-foreground";

// Monospaced table cell (.admin-table td.mono) — JetBrains Mono + brighter
// foreground, layered on TD. Unlike 4b's inert inner-<span> case, the
// `.admin-table td.mono` selector genuinely matches these <td> cells, so this
// must be ported. cn() lets tailwind-merge drop TD's font-sans + muted text,
// leaving exactly one font-family and one text-colour class.
export const TD_MONO = cn(TD, "font-mono text-foreground");
