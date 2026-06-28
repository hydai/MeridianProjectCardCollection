import { TableCell } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { RARITY_KEYS } from "../collection";

const RARITY_TEXT = [
  "text-rarity-r",
  "text-rarity-sr",
  "text-rarity-ssr",
  "text-rarity-ur",
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
    <span className={`miss-chip ${RARITY_KEYS[ri]}`}>
      {label}
      {count && count > 1 ? <span className="own-count">{count}</span> : null}
    </span>
  );
}
