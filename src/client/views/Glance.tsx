import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useState } from "react";
import { type Matrix, RARITIES, exists, getN } from "../collection";
import { MODE_BTN, MODE_TOGGLE, MissChip } from "./shared";

type Owned = { name: string; ri: number; count: number };
type GlanceCellData = { na: true } | { na: false; owned: Owned[] };

function GlanceCell({
  cell,
  isWish,
}: { cell: GlanceCellData; isWish: boolean }) {
  if (cell.na) {
    return (
      <td>
        <span className="glance-na">—</span>
      </td>
    );
  }
  if (isWish) {
    const missing = cell.owned.filter((o) => o.count === 0);
    if (missing.length === 0) {
      return (
        <td>
          <span className="glance-complete-badge">✓ 完成</span>
        </td>
      );
    }
    return (
      <td>
        {missing.map((r) => (
          <MissChip key={r.name} ri={r.ri} label={r.name} />
        ))}
      </td>
    );
  }
  const have = cell.owned.filter((o) => o.count > 0);
  if (have.length === 0) {
    return (
      <td>
        <span className="glance-na">—</span>
      </td>
    );
  }
  return (
    <td>
      {have.map((o) => (
        <MissChip key={o.name} ri={o.ri} label={o.name} count={o.count} />
      ))}
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
      const owned = RARITIES.map((name, ri) => ({
        name,
        ri,
        count: getN(m, si, ci, ri),
      }));
      return { na: false, owned };
    });
    const live = cells.filter((c): c is { na: false; owned: Owned[] } => !c.na);
    totalSlots += live.length * RARITIES.length;
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
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2 px-1">
        <ToggleGroup
          type="single"
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
        <span className="font-mono text-xs tracking-[0.08em] text-[var(--text-tertiary)] [&_strong]:font-medium [&_strong]:text-foreground">
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
      <div className="glance-wrap">
        <table className="glance-table">
          <thead>
            <tr>
              <th className="g-char">角色</th>
              {m.series.map((s) => (
                <th key={s}>{s}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.charName}
                className={row.isComplete ? "is-complete" : ""}
              >
                <td className="g-char">
                  {row.charName}
                  {row.isComplete ? (
                    <span className="complete-mark">✓</span>
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
