import type * as React from "react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TableCell } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { RARITY_TEXT } from "@/shared/rarity";

// Re-exported so view-layer callers (Trade, Grid) keep importing it from this
// barrel; the canonical definition now lives in @/shared/rarity.
export { RARITY_TEXT };

// rarity pill: rarity text + rarity border + soft rarity tint (legacy --*-soft).
const RARITY_CHIP = [
  "border-rarity-r/35 bg-[var(--r-soft)] text-rarity-r",
  "border-rarity-sr/40 bg-[var(--sr-soft)] text-rarity-sr",
  "border-rarity-ssr/40 bg-[var(--ssr-soft)] text-rarity-ssr",
  "border-rarity-ur/45 bg-[var(--ur-soft)] text-rarity-ur",
] as const;

// Editorial card shell (shared by tables.tsx + Wishlist.tsx): the shadcn Card
// styled back to the legacy 0.5px-bordered card with a hover and header divider.
export const CARD_SHELL =
  "mb-[18px] gap-0 rounded-[4px] border-[0.5px] border-border px-[26px] py-6 ring-0 transition-colors hover:[border-color:var(--border-strong)] max-sm:px-4 max-sm:py-[18px]";
export const CARD_HEADER =
  "flex flex-row flex-wrap items-baseline justify-between gap-3 border-b-[0.5px] border-border px-0 pb-3.5 mb-4";
export const CARD_TITLE =
  "font-serif text-[22px] font-medium tracking-[0.04em] text-foreground max-sm:text-[19px]";
export const CARD_COUNT =
  "font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground";

// Editorial sub-panel (shared by Trade + Market): the legacy `.trade-panel`
// rebuilt on shadcn Card — 0.5px border, 4px radius, serif title with a mono
// sub on the right and a 0.5px header divider. Smaller than CARD_SHELL.
const PANEL_SHELL =
  "gap-0 overflow-visible rounded-[4px] border-[0.5px] border-border bg-card px-[22px] py-5 ring-0 max-sm:px-4 max-sm:py-4";
const PANEL_HEADER =
  "flex flex-row items-baseline justify-between gap-3 border-b-[0.5px] border-border px-0 pb-3 mb-4";
export const PANEL_TITLE =
  "font-serif text-base font-medium tracking-[0.04em] text-foreground";
const PANEL_SUB =
  "font-mono text-[11px] font-normal tracking-[0.06em] text-[var(--text-tertiary)]";

// Two-column panel board (Trade + Market), collapsing to one column on mobile.
export const PANEL_GRID =
  "grid grid-cols-2 gap-5 max-sm:grid-cols-1 max-sm:gap-4";

// Empty/error state line (legacy `.trade-empty`), shared by Trade + Market.
export const EMPTY_MSG =
  "px-0.5 py-3 text-[13px] tracking-[0.04em] text-[var(--text-tertiary)]";

// Bordered card surface (legacy `.surface` / `.grid-empty` chrome): 4px radius +
// 0.5px hairline + card bg. Shared by the Glance table wrap, the Grid table wrap,
// and the Grid empty state; each adds its own overflow/padding.
export const CARD_FRAME = "rounded-[4px] border-[0.5px] border-border bg-card";

// View top bar (Glance + Grid): mode toggle on the left, progress readout on the
// right, wrapping on narrow screens (legacy `.glance-header` / `.grid-header`).
export const VIEW_HEADER =
  "mb-4 flex flex-wrap items-baseline justify-between gap-2 px-1";

// Progress readout (legacy `.glance-progress` / `.grid-progress`): mono, tertiary,
// with the embedded <strong> count in the foreground. The Glance caller appends a
// `max-sm:text-[11px]` shrink — legacy only shrank the Glance progress on mobile,
// not the Grid one.
export const PROGRESS_LINE =
  "font-mono text-xs tracking-[0.08em] text-[var(--text-tertiary)] [&_strong]:font-medium [&_strong]:text-foreground";

// Pill segmented toggle (Glance + Grid mode switch): rebuilds the legacy
// .mode-toggle / .mode-btn / .mode-btn.active pill on shadcn ToggleGroup. The
// active segment gets the elevated fill + gold text + gold hairline. MODE_BTN
// (below) is shared by two components that each carry the toggleVariants base
// muted fill (`aria-pressed:bg-muted data-[state=on]:bg-muted`), so it overrides
// both prefixes: the mode ToggleGroupItem is role=radio (data-[state=on] +
// aria-checked, never aria-pressed); the Grid filter Toggle is a button
// (data-[state=on] + aria-pressed). `data-[state=on]:*` is live on both;
// `aria-pressed:*` only on the filter Toggle (inert on the radio item). Distinct
// variant prefixes, so tailwind-merge keeps both rather than deduping.
export const MODE_TOGGLE =
  "inline-flex w-fit gap-0.5 rounded-full border-[0.5px] border-border p-0.5";
// `data-[state=on]:hover:*` keeps the active segment's fill + gold text when
// hovered (legacy `.mode-btn:hover` only recolors the INACTIVE segments; the
// active one never changes). Without it, `hover:bg-transparent` — needed to kill
// the Toggle base's `hover:bg-muted` — would also wipe the active fill on hover.
// `max-sm:*` restores the legacy `@media (max-width: 540px) .mode-btn`
// compaction (`padding: 5px 12px; font-size: 11px`) the deleted CSS provided.
export const MODE_BTN =
  "h-auto rounded-full px-4 py-1.5 font-sans text-xs font-normal tracking-[0.06em] text-[var(--text-tertiary)] transition-colors hover:bg-transparent hover:text-muted-foreground data-[state=on]:bg-secondary data-[state=on]:text-primary data-[state=on]:shadow-[inset_0_0_0_0.5px_rgba(201,161,74,0.25)] data-[state=on]:hover:bg-secondary data-[state=on]:hover:text-primary aria-pressed:bg-secondary aria-pressed:text-primary max-sm:px-3 max-sm:py-[5px] max-sm:text-[11px]";

// Standalone multi-select filter toggle (Grid rarity + series): the legacy
// `.grid-filter .mode-btn` — the same pill as MODE_BTN plus its own 0.5px outline
// (so the off state still reads as tappable) and a slightly tighter px. Built on
// MODE_BTN via cn so the active-state + Radix override block stays single-sourced;
// the trailing `px-3.5` overrides MODE_BTN's `px-4` while the `max-sm:` shrink is
// inherited. Rendered via shadcn <Toggle> (native button + aria-pressed), so the
// existing role/aria-pressed Grid tests stay green.
export const FILTER_TOGGLE = cn(
  MODE_BTN,
  "border-[0.5px] border-border px-3.5",
);

export function Panel({
  title,
  sub,
  children,
  className,
}: {
  title: React.ReactNode;
  sub?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Card className={cn(PANEL_SHELL, className)}>
      <CardHeader className={PANEL_HEADER}>
        <CardTitle asChild className={PANEL_TITLE}>
          <h3>{title}</h3>
        </CardTitle>
        {sub != null ? <span className={PANEL_SUB}>{sub}</span> : null}
      </CardHeader>
      <CardContent className="px-0">{children}</CardContent>
    </Card>
  );
}

export function NumCell({ n, ri }: { n: number; ri: number }) {
  if (n === 0) {
    return (
      <TableCell className="text-center font-mono text-muted-foreground/40">
        ·
      </TableCell>
    );
  }
  return (
    <TableCell className={cn("text-center font-mono", RARITY_TEXT[ri])}>
      {n}
    </TableCell>
  );
}

export function MissChip({
  ri,
  label,
  count,
}: { ri: number; label: string; count?: number }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "gap-1 rounded-full border-[0.5px] font-mono text-[11px] font-medium tracking-[0.12em]",
        RARITY_CHIP[ri],
      )}
    >
      {label}
      {count && count > 1 ? <span className="opacity-70">{count}</span> : null}
    </Badge>
  );
}
