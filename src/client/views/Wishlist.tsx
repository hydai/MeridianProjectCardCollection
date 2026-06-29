import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { Fragment } from "react";
import { type Matrix, RARITIES, exists, getN } from "../collection";
import {
  CARD_COUNT,
  CARD_HEADER,
  CARD_SHELL,
  CARD_TITLE,
  MissChip,
} from "./shared";

export function Wishlist({ m }: { m: Matrix }) {
  const charMissing = m.characters.map((charName, ci) => {
    const seriesIdxs = m.series
      .map((_s, si) => si)
      .filter((si) => exists(m, si, ci));
    const missingBySeries = seriesIdxs.map((si) => {
      const missing = RARITIES.map((name, ri) => ({
        name,
        ri,
        count: getN(m, si, ci, ri),
      })).filter((x) => x.count === 0);
      return { seriesName: m.series[si], missing };
    });
    const totalMissing = missingBySeries.reduce(
      (sum, x) => sum + x.missing.length,
      0,
    );
    const totalSlots = seriesIdxs.length * RARITIES.length;
    return { charName, missingBySeries, totalMissing, totalSlots };
  });

  const totalSlots = charMissing.reduce((s, c) => s + c.totalSlots, 0);
  const totalMissing = charMissing.reduce((s, c) => s + c.totalMissing, 0);
  const totalCollected = totalSlots - totalMissing;
  const pct = totalSlots ? Math.round((totalCollected / totalSlots) * 100) : 0;

  const missingByRarity = RARITIES.map((_r, ri) =>
    m.series.reduce(
      (sum, _s, si) =>
        sum +
        m.characters.reduce(
          (acc, _c, ci) =>
            acc + (exists(m, si, ci) && getN(m, si, ci, ri) === 0 ? 1 : 0),
          0,
        ),
      0,
    ),
  );
  const breakdownText = RARITIES.map(
    (r, ri) => `${r} ${missingByRarity[ri]}`,
  ).join(" · ");

  return (
    <section className="view view-wishlist">
      <Card className="mb-7 gap-0 rounded-[4px] border-[0.5px] border-border px-8 pt-[30px] pb-7 text-center ring-0 max-sm:px-[18px] max-sm:pt-[22px] max-sm:pb-5">
        <div className="flex items-baseline justify-center gap-1.5">
          <span className="font-mono text-[40px] leading-none text-foreground max-sm:text-[30px]">
            {totalCollected}
          </span>
          <span className="font-mono text-[18px] text-muted-foreground max-sm:text-[15px]">
            / {totalSlots}
          </span>
        </div>
        <div className="mt-2.5 font-accent text-[13px] uppercase italic tracking-[0.2em] text-muted-foreground">
          Unique cards collected
        </div>
        <Progress
          value={pct}
          className="mx-auto mt-[22px] h-[3px] max-w-[340px] border-[0.5px] border-border [&_[data-slot=progress-indicator]]:[background-image:linear-gradient(90deg,var(--primary-dim),var(--primary))]"
        />
        <div className="mt-3.5 text-xs tracking-[0.08em] text-muted-foreground">
          {pct}% 完成 · 尚缺 {totalMissing} 張 &nbsp;·&nbsp; {breakdownText}
        </div>
      </Card>

      {charMissing.map((c) => {
        const isComplete = c.totalMissing === 0;
        return (
          <Card className={CARD_SHELL} key={c.charName}>
            <CardHeader className={CARD_HEADER}>
              <CardTitle className={CARD_TITLE}>{c.charName}</CardTitle>
              <span className={cn(CARD_COUNT, isComplete && "text-primary")}>
                {isComplete ? (
                  `${c.totalSlots} / ${c.totalSlots} · ✓ 集齊`
                ) : (
                  <>
                    缺{" "}
                    <strong className="font-medium text-foreground">
                      {c.totalMissing}
                    </strong>{" "}
                    / {c.totalSlots} 張
                  </>
                )}
              </span>
            </CardHeader>
            <CardContent className="px-0">
              {isComplete ? (
                <div className="py-1 text-center font-accent text-[15px] italic tracking-[0.08em] text-primary">
                  ✓ Complete · 此角色全集齊
                </div>
              ) : (
                <div className="grid grid-cols-[110px_1fr] items-center gap-x-[18px] gap-y-3.5 max-sm:grid-cols-[88px_1fr] max-sm:gap-x-3 max-sm:gap-y-2.5">
                  {c.missingBySeries
                    .filter((s) => s.missing.length > 0)
                    .map((s) => (
                      <Fragment key={s.seriesName}>
                        <div className="font-accent text-[13px] uppercase italic tracking-[0.12em] text-muted-foreground max-sm:text-[11px] max-sm:tracking-[0.1em]">
                          {s.seriesName}
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {s.missing.map((r) => (
                            <MissChip key={r.name} ri={r.ri} label={r.name} />
                          ))}
                        </div>
                      </Fragment>
                    ))}
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
    </section>
  );
}
