import { cn } from "@/lib/utils";
import { type Matrix, grandTotalByRarity, sumRow } from "../collection";

export function StatsBar({ m }: { m: Matrix }) {
  const byRarity = grandTotalByRarity(m);
  const cells = [
    { value: sumRow(byRarity), label: "張總計", cls: "text-foreground" },
    { value: byRarity[0], label: "R", cls: "text-foreground" },
    { value: byRarity[1], label: "SR", cls: "text-rarity-sr" },
    { value: byRarity[2], label: "SSR", cls: "text-rarity-ssr" },
    { value: byRarity[3], label: "UR", cls: "text-rarity-ur" },
  ];
  return (
    <div className="mt-14 grid grid-cols-5 border-y border-border">
      {cells.map((c) => (
        <div
          key={c.label}
          className="border-r border-border px-2 py-[22px] text-center last:border-r-0"
        >
          <div
            className={cn(
              "font-mono text-[28px] leading-none max-sm:text-[22px]",
              c.cls,
            )}
          >
            {c.value}
          </div>
          <div className="mt-2 text-[10px] uppercase tracking-[0.25em] text-muted-foreground max-sm:text-[9px] max-sm:tracking-[0.15em]">
            {c.label}
          </div>
        </div>
      ))}
    </div>
  );
}
