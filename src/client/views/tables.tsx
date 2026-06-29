import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { type Matrix, RARITIES, exists, getN, sumRow } from "../collection";
import { NumCell } from "./shared";

// Editorial column-header style: tight, uppercase, letter-spaced, dim.
const TH = "h-auto py-2.5 text-[10px] font-normal uppercase tracking-[0.2em]";
const NAME_CELL = "text-left font-sans";
const TOTAL_CELL = "border-l border-border text-right font-mono";

export function ByCharacter({ m }: { m: Matrix }) {
  return (
    <section className="view view-char">
      {m.characters.map((charName, ci) => {
        const seriesIdxs = m.series
          .map((_s, si) => si)
          .filter((si) => exists(m, si, ci));
        const totalsByRarity = RARITIES.map((_r, ri) =>
          seriesIdxs.reduce((sum, si) => sum + getN(m, si, ci, ri), 0),
        );
        const charTotal = sumRow(totalsByRarity);
        return (
          <article className="card" key={charName}>
            <header className="card-header">
              <h2 className="card-title">{charName}</h2>
              <span className="card-count">
                Total · <strong>{charTotal}</strong> 張
              </span>
            </header>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className={cn(TH, "text-left")}>系列</TableHead>
                  <TableHead className={cn(TH, "text-center text-rarity-r")}>
                    R
                  </TableHead>
                  <TableHead className={cn(TH, "text-center text-rarity-sr")}>
                    SR
                  </TableHead>
                  <TableHead className={cn(TH, "text-center text-rarity-ssr")}>
                    SSR
                  </TableHead>
                  <TableHead className={cn(TH, "text-center text-rarity-ur")}>
                    UR
                  </TableHead>
                  <TableHead
                    className={cn(TH, "border-l border-border text-right")}
                  >
                    合計
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {seriesIdxs.map((si) => {
                  const rowTotal = RARITIES.reduce(
                    (sum, _r, ri) => sum + getN(m, si, ci, ri),
                    0,
                  );
                  return (
                    <TableRow key={m.series[si]}>
                      <TableCell className={NAME_CELL}>
                        {m.series[si]}
                      </TableCell>
                      {RARITIES.map((rarity, ri) => (
                        <NumCell key={rarity} n={getN(m, si, ci, ri)} ri={ri} />
                      ))}
                      <TableCell
                        className={cn(
                          TOTAL_CELL,
                          rowTotal === 0 && "text-muted-foreground/40",
                        )}
                      >
                        {rowTotal}
                      </TableCell>
                    </TableRow>
                  );
                })}
                <TableRow className="border-t border-border bg-foreground/[0.02] hover:bg-foreground/[0.02]">
                  <TableCell className={cn(NAME_CELL, "text-muted-foreground")}>
                    小計
                  </TableCell>
                  {RARITIES.map((rarity, ri) => (
                    <NumCell key={rarity} n={totalsByRarity[ri]} ri={ri} />
                  ))}
                  <TableCell className={TOTAL_CELL}>{charTotal}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </article>
        );
      })}
    </section>
  );
}

export function BySeries({ m }: { m: Matrix }) {
  return (
    <section className="view view-series">
      {m.series.map((seriesName, si) => {
        const charIdxs = m.characters
          .map((_c, ci) => ci)
          .filter((ci) => exists(m, si, ci));
        const totalsByRarity = RARITIES.map((_r, ri) =>
          charIdxs.reduce((sum, ci) => sum + getN(m, si, ci, ri), 0),
        );
        const seriesTotal = sumRow(totalsByRarity);
        return (
          <article className="card" key={seriesName}>
            <header className="card-header">
              <h2 className="card-title is-series">{seriesName}</h2>
              <span className="card-count">
                Total · <strong>{seriesTotal}</strong> 張
              </span>
            </header>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className={cn(TH, "text-left")}>角色</TableHead>
                  <TableHead className={cn(TH, "text-center text-rarity-r")}>
                    R
                  </TableHead>
                  <TableHead className={cn(TH, "text-center text-rarity-sr")}>
                    SR
                  </TableHead>
                  <TableHead className={cn(TH, "text-center text-rarity-ssr")}>
                    SSR
                  </TableHead>
                  <TableHead className={cn(TH, "text-center text-rarity-ur")}>
                    UR
                  </TableHead>
                  <TableHead
                    className={cn(TH, "border-l border-border text-right")}
                  >
                    合計
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {charIdxs.map((ci) => {
                  const rowTotal = RARITIES.reduce(
                    (sum, _r, ri) => sum + getN(m, si, ci, ri),
                    0,
                  );
                  return (
                    <TableRow key={m.characters[ci]}>
                      <TableCell className={NAME_CELL}>
                        {m.characters[ci]}
                      </TableCell>
                      {RARITIES.map((rarity, ri) => (
                        <NumCell key={rarity} n={getN(m, si, ci, ri)} ri={ri} />
                      ))}
                      <TableCell
                        className={cn(
                          TOTAL_CELL,
                          rowTotal === 0 && "text-muted-foreground/40",
                        )}
                      >
                        {rowTotal}
                      </TableCell>
                    </TableRow>
                  );
                })}
                <TableRow className="border-t border-border bg-foreground/[0.02] hover:bg-foreground/[0.02]">
                  <TableCell className={cn(NAME_CELL, "text-muted-foreground")}>
                    小計
                  </TableCell>
                  {RARITIES.map((rarity, ri) => (
                    <NumCell key={rarity} n={totalsByRarity[ri]} ri={ri} />
                  ))}
                  <TableCell className={TOTAL_CELL}>{seriesTotal}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </article>
        );
      })}
    </section>
  );
}

const RARITY_LABELS = ["普通", "較稀有", "稀有", "最稀有"];

export function ByRarity({ m }: { m: Matrix }) {
  return (
    <section className="view view-rarity">
      {RARITIES.map((rarityName, ri) => {
        const totalsBySeries = m.series.map((_s, si) =>
          m.characters.reduce((sum, _c, ci) => sum + getN(m, si, ci, ri), 0),
        );
        const rarityTotal = sumRow(totalsBySeries);
        const rk = rarityName.toLowerCase();
        return (
          <article className="card" key={rarityName}>
            <header className="card-header">
              <h2 className={`card-title is-rarity ${rk}`}>{rarityName}</h2>
              <span className="card-count">
                {RARITY_LABELS[ri]} · <strong>{rarityTotal}</strong> 張
              </span>
            </header>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className={cn(TH, "text-left")}>角色</TableHead>
                  {m.series.map((s) => (
                    <TableHead key={s} className={cn(TH, "text-center")}>
                      {s}
                    </TableHead>
                  ))}
                  <TableHead
                    className={cn(TH, "border-l border-border text-right")}
                  >
                    合計
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {m.characters.map((charName, ci) => {
                  const rowTotal = m.series.reduce(
                    (sum, _s, si) => sum + getN(m, si, ci, ri),
                    0,
                  );
                  return (
                    <TableRow key={charName}>
                      <TableCell className={NAME_CELL}>{charName}</TableCell>
                      {m.series.map((s, si) =>
                        exists(m, si, ci) ? (
                          <NumCell key={s} n={getN(m, si, ci, ri)} ri={ri} />
                        ) : (
                          <TableCell
                            key={s}
                            className="text-center text-muted-foreground/40"
                          >
                            —
                          </TableCell>
                        ),
                      )}
                      <TableCell
                        className={cn(
                          TOTAL_CELL,
                          rowTotal === 0 && "text-muted-foreground/40",
                        )}
                      >
                        {rowTotal}
                      </TableCell>
                    </TableRow>
                  );
                })}
                <TableRow className="border-t border-border bg-foreground/[0.02] hover:bg-foreground/[0.02]">
                  <TableCell className={cn(NAME_CELL, "text-muted-foreground")}>
                    小計
                  </TableCell>
                  {m.series.map((s, si) => (
                    <NumCell key={s} n={totalsBySeries[si]} ri={ri} />
                  ))}
                  <TableCell className={TOTAL_CELL}>{rarityTotal}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </article>
        );
      })}
    </section>
  );
}
