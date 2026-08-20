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
import {
  type Matrix,
  RARITIES,
  exists,
  existsR,
  getN,
  getReservedN,
  sumRow,
} from "../collection";
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
// ByRarity title colour: R = foreground (per StatsBar), higher tiers = rarity.
const RARITY_TITLE = [
  "text-foreground",
  "text-rarity-sr",
  "text-rarity-ssr",
  "text-rarity-ur",
  "text-rarity-ex",
] as const;

const RARITY_LABELS = ["普通", "較稀有", "稀有", "極稀有", "限定級別"];

function rarityIndexesFor(
  m: Matrix,
  coordinates: Array<{ si: number; ci: number }>,
): number[] {
  return RARITIES.map((_rarity, ri) => ri).filter((ri) =>
    coordinates.some(({ si, ci }) => existsR(m, si, ci, ri)),
  );
}

function RarityHeaders({ indexes }: { indexes: number[] }) {
  return indexes.map((ri) => (
    <TableHead
      key={RARITIES[ri]}
      className={cn(TH, "text-center", RARITY_TITLE[ri])}
    >
      {RARITIES[ri]}
    </TableHead>
  ));
}

function CatalogNumCell({
  m,
  si,
  ci,
  ri,
}: { m: Matrix; si: number; ci: number; ri: number }) {
  return existsR(m, si, ci, ri) ? (
    <NumCell
      n={getN(m, si, ci, ri)}
      ri={ri}
      reserved={getReservedN(m, si, ci, ri)}
    />
  ) : (
    <TableCell className="text-center text-muted-foreground/40">—</TableCell>
  );
}

export function ByCharacter({ m }: { m: Matrix }) {
  return (
    <section className="view view-char">
      {m.characters.map((charName, ci) => {
        const seriesIdxs = m.series
          .map((_s, si) => si)
          .filter((si) => exists(m, si, ci));
        const rarityIndexes = rarityIndexesFor(
          m,
          seriesIdxs.map((si) => ({ si, ci })),
        );
        const totalsByRarity = rarityIndexes.map((ri) =>
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
                    <RarityHeaders indexes={rarityIndexes} />
                    <TableHead
                      className={cn(TH, "border-l border-border text-right")}
                    >
                      合計
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {seriesIdxs.map((si) => {
                    const rowTotal = rarityIndexes.reduce(
                      (sum, ri) => sum + getN(m, si, ci, ri),
                      0,
                    );
                    return (
                      <TableRow key={m.series[si]}>
                        <TableCell className={NAME_CELL}>
                          {m.series[si]}
                        </TableCell>
                        {rarityIndexes.map((ri) => (
                          <CatalogNumCell
                            key={RARITIES[ri]}
                            m={m}
                            si={si}
                            ci={ci}
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
                    {rarityIndexes.map((ri, index) => (
                      <NumCell
                        key={RARITIES[ri]}
                        n={totalsByRarity[index]}
                        ri={ri}
                      />
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
        const rarityIndexes = rarityIndexesFor(
          m,
          charIdxs.map((ci) => ({ si, ci })),
        );
        const totalsByRarity = rarityIndexes.map((ri) =>
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
                    <RarityHeaders indexes={rarityIndexes} />
                    <TableHead
                      className={cn(TH, "border-l border-border text-right")}
                    >
                      合計
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {charIdxs.map((ci) => {
                    const rowTotal = rarityIndexes.reduce(
                      (sum, ri) => sum + getN(m, si, ci, ri),
                      0,
                    );
                    return (
                      <TableRow key={m.characters[ci]}>
                        <TableCell className={NAME_CELL}>
                          {m.characters[ci]}
                        </TableCell>
                        {rarityIndexes.map((ri) => (
                          <CatalogNumCell
                            key={RARITIES[ri]}
                            m={m}
                            si={si}
                            ci={ci}
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
                    {rarityIndexes.map((ri, index) => (
                      <NumCell
                        key={RARITIES[ri]}
                        n={totalsByRarity[index]}
                        ri={ri}
                      />
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

export function ByRarity({ m }: { m: Matrix }) {
  const issuedRarityIndexes = rarityIndexesFor(
    m,
    m.series.flatMap((_series, si) =>
      m.characters.map((_character, ci) => ({ si, ci })),
    ),
  );
  return (
    <section className="view view-rarity">
      {issuedRarityIndexes.map((ri) => {
        const rarityName = RARITIES[ri];
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
                        {m.series.map((s, si) => (
                          <CatalogNumCell
                            key={s}
                            m={m}
                            si={si}
                            ci={ci}
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
