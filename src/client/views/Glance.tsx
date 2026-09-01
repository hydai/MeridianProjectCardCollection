import { Badge } from "@/components/ui/badge";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useState } from "react";
import {
  type Matrix,
  RARITIES,
  exists,
  existsR,
  getN,
  getReservedN,
} from "../collection";
import {
  CARD_FRAME,
  MODE_BTN,
  MODE_TOGGLE,
  MissChip,
  PROGRESS_LINE,
  VIEW_HEADER,
} from "./shared";

type Owned = { name: string; ri: number; count: number; reserved: number };
type GlanceCellData = { na: true } | { na: false; owned: Owned[] };

// Body cell chrome (legacy `.glance-table tbody td`): hairline divider, centered,
// padded; shared by every GlanceCell branch.
const GLANCE_TD =
  "min-w-[72px] border-b-[0.5px] border-border px-3 py-3 text-center align-middle max-sm:px-[7px] max-sm:py-2.5";
const GLANCE_CHIP_STACK = "glance-chip-stack flex flex-col items-center gap-1";

// Empty marker (legacy `.glance-na`): faint quaternary em dash.
const GlanceNa = () => (
  <span className="select-none font-mono text-[13px] text-[var(--text-quaternary)] opacity-45">
    —
  </span>
);

function GlanceCell({
  cell,
  isWish,
}: { cell: GlanceCellData; isWish: boolean }) {
  if (cell.na) {
    return (
      <td className={GLANCE_TD}>
        <GlanceNa />
      </td>
    );
  }
  if (isWish) {
    const missing = cell.owned.filter((o) => o.count === 0);
    if (missing.length === 0) {
      return (
        <td className={GLANCE_TD}>
          <div className={GLANCE_CHIP_STACK}>
            <Badge
              variant="outline"
              className="h-auto gap-1 rounded-full border-[0.5px] border-primary/35 bg-primary/[0.08] px-2.5 py-[3px] text-[10px] font-normal tracking-[0.12em] text-primary max-sm:px-[7px] max-sm:py-0.5 max-sm:text-[9px] max-sm:tracking-[0.08em]"
            >
              ✓ 完成
            </Badge>
          </div>
        </td>
      );
    }
    return (
      <td className={GLANCE_TD}>
        <div className={GLANCE_CHIP_STACK}>
          {missing.map((r) => (
            <MissChip key={r.name} ri={r.ri} label={r.name} />
          ))}
        </div>
      </td>
    );
  }
  const have = cell.owned.filter((o) => o.count > 0);
  if (have.length === 0) {
    return (
      <td className={GLANCE_TD}>
        <GlanceNa />
      </td>
    );
  }
  return (
    <td className={GLANCE_TD}>
      <div className={GLANCE_CHIP_STACK}>
        {have.map((o) => (
          <MissChip
            key={o.name}
            ri={o.ri}
            label={o.name}
            count={o.count}
            reserved={o.reserved}
          />
        ))}
      </div>
    </td>
  );
}

export function Glance({ m }: { m: Matrix }) {
  const [mode, setMode] = useState<"wishlist" | "collection">("wishlist");
  const isWish = mode === "wishlist";

  let totalSlots = 0;
  let totalMissing = 0;
  let totalOwnedCards = 0;

  const rows = m.characters.map((charName, ci) => {
    const cells: GlanceCellData[] = m.series.map((_s, si) => {
      if (!exists(m, si, ci)) return { na: true };
      const owned = RARITIES.flatMap((name, ri) =>
        existsR(m, si, ci, ri)
          ? [
              {
                name,
                ri,
                count: getN(m, si, ci, ri),
                reserved: getReservedN(m, si, ci, ri),
              },
            ]
          : [],
      );
      return { na: false, owned };
    });
    const live = cells.filter((c): c is { na: false; owned: Owned[] } => !c.na);
    totalSlots += live.reduce((sum, cell) => sum + cell.owned.length, 0);
    totalMissing += live.reduce(
      (s, c) => s + c.owned.filter((o) => o.count === 0).length,
      0,
    );
    totalOwnedCards += live.reduce(
      (s, c) => s + c.owned.reduce((a, o) => a + o.count, 0),
      0,
    );
    const charMiss = live.reduce(
      (s, c) => s + c.owned.filter((o) => o.count === 0).length,
      0,
    );
    return { charName, cells, isComplete: charMiss === 0 };
  });

  const collected = totalSlots - totalMissing;
  const pct = totalSlots ? Math.round((collected / totalSlots) * 100) : 0;

  return (
    <section className="view view-glance">
      <div className={VIEW_HEADER}>
        <ToggleGroup
          type="single"
          aria-label="顯示模式"
          value={mode}
          onValueChange={(v) => v && setMode(v as "wishlist" | "collection")}
          className={MODE_TOGGLE}
        >
          <ToggleGroupItem value="wishlist" className={MODE_BTN}>
            願望清單
          </ToggleGroupItem>
          <ToggleGroupItem value="collection" className={MODE_BTN}>
            收集清單
          </ToggleGroupItem>
        </ToggleGroup>
        <span className={`${PROGRESS_LINE} max-sm:text-[11px]`}>
          {isWish ? (
            <>
              <strong>{collected}</strong> / {totalSlots} · {pct}% · 缺{" "}
              <strong>{totalMissing}</strong>
            </>
          ) : (
            <>
              已收集 <strong>{collected}</strong> / {totalSlots} 種 · 共{" "}
              <strong>{totalOwnedCards}</strong> 張
            </>
          )}
        </span>
      </div>
      <div className={`glance-table-wrap overflow-x-auto ${CARD_FRAME}`}>
        <table className="glance-table w-max min-w-full table-auto border-collapse text-[13px] max-sm:text-xs">
          <thead>
            <tr>
              <th className="w-[110px] min-w-[110px] whitespace-nowrap border-b-[0.5px] border-border bg-secondary px-3 pt-3.5 pb-3 text-left font-sans text-[11px] font-normal tracking-[0.25em] text-foreground max-sm:w-[88px] max-sm:min-w-[88px] max-sm:px-[7px] max-sm:py-2.5 max-sm:text-[9px]">
                角色
              </th>
              {m.series.map((s) => (
                <th
                  key={s}
                  className="whitespace-nowrap border-b-[0.5px] border-border bg-secondary px-3 pt-3.5 pb-3 text-center font-accent text-[11px] font-medium uppercase italic tracking-[0.18em] text-foreground max-sm:px-[7px] max-sm:py-2.5 max-sm:text-[9px] max-sm:tracking-[0.12em]"
                >
                  {s}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.charName}
                className={
                  row.isComplete
                    ? "last:[&_td]:border-b-0 [&_td]:bg-[rgba(201,161,74,0.025)]"
                    : "last:[&_td]:border-b-0"
                }
              >
                <td className="w-[110px] min-w-[110px] whitespace-nowrap border-b-[0.5px] border-border px-3 py-3 text-left align-middle font-sans text-sm text-foreground max-sm:w-[88px] max-sm:min-w-[88px] max-sm:px-[7px] max-sm:py-2.5 max-sm:text-[13px]">
                  {row.charName}
                  {row.isComplete ? (
                    <span className="ml-1.5 inline-block font-accent text-xs italic tracking-[0.1em] text-primary">
                      ✓
                    </span>
                  ) : null}
                </td>
                {row.cells.map((c, si) => (
                  <GlanceCell key={m.series[si]} cell={c} isWish={isWish} />
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
