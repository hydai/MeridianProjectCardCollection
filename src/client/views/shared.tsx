import { Badge } from "@/components/ui/badge";
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
        "gap-1 rounded-full font-mono text-[11px] font-medium tracking-[0.12em]",
        RARITY_CHIP[ri],
      )}
    >
      {label}
      {count && count > 1 ? <span className="opacity-70">{count}</span> : null}
    </Badge>
  );
}
