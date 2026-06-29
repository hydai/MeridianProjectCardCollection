import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
      <div className="overall">
        <div className="overall-stat">
          <span className="overall-num">{totalCollected}</span>
          <span className="overall-denom">/ {totalSlots}</span>
        </div>
        <div className="overall-label">Unique cards collected</div>
        <div className="progress-bar">
          <div className="progress-fill" style={{ width: `${pct}%` }} />
        </div>
        <div className="overall-detail">
          {pct}% 完成 · 尚缺 {totalMissing} 張 &nbsp;·&nbsp; {breakdownText}
        </div>
      </div>

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
                <div className="miss-complete">✓ Complete · 此角色全集齊</div>
              ) : (
                <div className="miss-grid">
                  {c.missingBySeries
                    .filter((s) => s.missing.length > 0)
                    .map((s) => (
                      <Fragment key={s.seriesName}>
                        <div className="miss-series">{s.seriesName}</div>
                        <div className="miss-chips">
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
