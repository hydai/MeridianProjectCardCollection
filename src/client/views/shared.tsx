import type * as React from "react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TableCell } from "@/components/ui/table";
import { cn } from "@/lib/utils";

const RARITY_TEXT = [
  "text-rarity-r",
  "text-rarity-sr",
  "text-rarity-ssr",
  "text-rarity-ur",
] as const;

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
export const PANEL_SHELL =
  "gap-0 overflow-visible rounded-[4px] border-[0.5px] border-border bg-card px-[22px] py-5 ring-0 max-sm:px-4 max-sm:py-4";
export const PANEL_HEADER =
  "flex flex-row items-baseline justify-between gap-3 border-b-[0.5px] border-border px-0 pb-3 mb-4";
export const PANEL_TITLE =
  "font-serif text-base font-medium tracking-[0.04em] text-foreground";
export const PANEL_SUB =
  "font-mono text-[11px] font-normal tracking-[0.06em] text-[var(--text-tertiary)]";

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
