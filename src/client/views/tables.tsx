import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import {
  CARD_COUNT,
  CARD_HEADER,
  CARD_SHELL,
  CARD_TITLE,
  NumCell,
} from "./shared";

// Editorial column-header style: tight, uppercase, letter-spaced, dim.
const TH = "h-auto py-2.5 text-[10px] font-normal uppercase tracking-[0.2em]";
const NAME_CELL = "text-left font-sans";
const TOTAL_CELL = "border-l border-border text-right font-mono";
const CARD_TITLE_SERIES =
  "font-accent text-[26px] font-medium uppercase italic tracking-[0.08em] text-foreground max-sm:text-[22px]";
const CARD_TITLE_RARITY =
  "font-mono text-2xl font-medium tracking-[0.1em] max-sm:text-[22px]";
// ByRarity title colour: R = foreground (per StatsBar), SR/SSR/UR = rarity.
const RARITY_TITLE = [
  "text-foreground",
  "text-rarity-sr",
  "text-rarity-ssr",
  "text-rarity-ur",
] as const;

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
          <Card className={CARD_SHELL} key={charName}>
            <CardHeader className={CARD_HEADER}>
              <CardTitle asChild className={CARD_TITLE}>
                <h2>{charName}</h2>
              </CardTitle>
              <span className={CARD_COUNT}>
                Total ·{" "}
                <strong className="font-medium text-foreground">
                  {charTotal}
                </strong>{" "}
                張
              </span>
            </CardHeader>
            <CardContent className="px-0">
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
                    <TableHead
                      className={cn(TH, "text-center text-rarity-ssr")}
                    >
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
                          <NumCell
                            key={rarity}
                            n={getN(m, si, ci, ri)}
                            ri={ri}
                          />
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
                    <TableCell
                      className={cn(NAME_CELL, "text-muted-foreground")}
                    >
                      小計
                    </TableCell>
                    {RARITIES.map((rarity, ri) => (
                      <NumCell key={rarity} n={totalsByRarity[ri]} ri={ri} />
                    ))}
                    <TableCell className={TOTAL_CELL}>{charTotal}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </CardContent>
          </Card>
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
          <Card className={CARD_SHELL} key={seriesName}>
            <CardHeader className={CARD_HEADER}>
              <CardTitle asChild className={CARD_TITLE_SERIES}>
                <h2>{seriesName}</h2>
              </CardTitle>
              <span className={CARD_COUNT}>
                Total ·{" "}
                <strong className="font-medium text-foreground">
                  {seriesTotal}
                </strong>{" "}
                張
              </span>
            </CardHeader>
            <CardContent className="px-0">
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
                    <TableHead
                      className={cn(TH, "text-center text-rarity-ssr")}
                    >
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
                          <NumCell
                            key={rarity}
                            n={getN(m, si, ci, ri)}
                            ri={ri}
                          />
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
                    <TableCell
                      className={cn(NAME_CELL, "text-muted-foreground")}
                    >
                      小計
                    </TableCell>
                    {RARITIES.map((rarity, ri) => (
                      <NumCell key={rarity} n={totalsByRarity[ri]} ri={ri} />
                    ))}
                    <TableCell className={TOTAL_CELL}>{seriesTotal}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </CardContent>
          </Card>
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
        return (
          <Card className={CARD_SHELL} key={rarityName}>
            <CardHeader className={CARD_HEADER}>
              <CardTitle
                asChild
                className={cn(CARD_TITLE_RARITY, RARITY_TITLE[ri])}
              >
                <h2>{rarityName}</h2>
              </CardTitle>
              <span className={CARD_COUNT}>
                {RARITY_LABELS[ri]} ·{" "}
                <strong className="font-medium text-foreground">
                  {rarityTotal}
                </strong>{" "}
                張
              </span>
            </CardHeader>
            <CardContent className="px-0">
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
                    <TableCell
                      className={cn(NAME_CELL, "text-muted-foreground")}
                    >
                      小計
                    </TableCell>
                    {m.series.map((s, si) => (
                      <NumCell key={s} n={totalsBySeries[si]} ri={ri} />
                    ))}
                    <TableCell className={TOTAL_CELL}>{rarityTotal}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        );
      })}
    </section>
  );
}
