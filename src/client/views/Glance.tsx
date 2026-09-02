import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";
import { CircleCheckBigIcon } from "lucide-react";
import { Fragment, useState } from "react";
import {
  type Matrix,
  RARITIES,
  buildVolumeRows,
  existsR,
  getN,
  getReservedN,
} from "../collection";
import {
  CARD_FRAME,
  MODE_BTN,
  MODE_TOGGLE,
  RARITY_TEXT,
  VIEW_HEADER,
} from "./shared";

const PROGRESS_META =
  "font-mono text-xs tracking-[0.08em] text-muted-foreground [&_strong]:font-medium [&_strong]:text-foreground";

type ProgressStats = {
  collected: number;
  total: number;
  missing: number;
  percentage: number;
};

type ProgressSlot = {
  rarity: string;
  rarityIndex: number;
  owned: number;
  reserved: number;
};

type SeriesProgress = {
  name: string;
  slots: ProgressSlot[];
  stats: ProgressStats;
};

type VolumeProgress = {
  label: string;
  series: SeriesProgress[];
  stats: ProgressStats;
};

type CharacterProgress = {
  name: string;
  index: number;
  volumes: VolumeProgress[];
  stats: ProgressStats;
};

function progressStats(collected: number, total: number): ProgressStats {
  return {
    collected,
    total,
    missing: Math.max(0, total - collected),
    percentage: total ? Math.round((collected / total) * 100) : 0,
  };
}

function combineStats(entries: ProgressStats[]): ProgressStats {
  return progressStats(
    entries.reduce((sum, entry) => sum + entry.collected, 0),
    entries.reduce((sum, entry) => sum + entry.total, 0),
  );
}

function buildCharacterProgress(m: Matrix): CharacterProgress[] {
  const volumeRows = buildVolumeRows(m.series, m.volumes);

  return m.characters.map((name, index) => {
    const volumes = volumeRows.flatMap((volume) => {
      const series = volume.series.flatMap((seriesName) => {
        const seriesIndex = m.series.indexOf(seriesName);
        if (seriesIndex < 0) return [];

        const slots = RARITIES.flatMap((rarity, rarityIndex) =>
          existsR(m, seriesIndex, index, rarityIndex)
            ? [
                {
                  rarity,
                  rarityIndex,
                  owned: getN(m, seriesIndex, index, rarityIndex),
                  reserved: getReservedN(m, seriesIndex, index, rarityIndex),
                },
              ]
            : [],
        );
        if (slots.length === 0) return [];

        const collected = slots.filter((slot) => slot.owned > 0).length;
        return [
          {
            name: seriesName,
            slots,
            stats: progressStats(collected, slots.length),
          },
        ];
      });
      if (series.length === 0) return [];
      return [
        {
          label: volume.label,
          series,
          stats: combineStats(series.map((entry) => entry.stats)),
        },
      ];
    });

    return {
      name,
      index,
      volumes,
      stats: combineStats(volumes.map((entry) => entry.stats)),
    };
  });
}

function progressLabel(stats: ProgressStats): string {
  return `${stats.collected} / ${stats.total}`;
}

function VolumeSummary({
  character,
  volume,
}: {
  character: string;
  volume: VolumeProgress;
}) {
  return (
    <div className="flex min-w-[130px] flex-1 flex-col gap-1.5">
      <div className="flex items-center justify-between gap-3 font-mono text-[10px] tracking-[0.06em] text-muted-foreground">
        <span>{volume.label}</span>
        <span>{progressLabel(volume.stats)}</span>
      </div>
      <Progress
        value={volume.stats.collected}
        max={volume.stats.total}
        aria-label={`${character} ${volume.label} 進度：${progressLabel(volume.stats)}`}
        className="h-1"
      />
    </div>
  );
}

function Slot({
  character,
  series,
  slot,
}: {
  character: string;
  series: string;
  slot: ProgressSlot;
}) {
  const collected = slot.owned > 0;
  const label = collected
    ? `${series} ${character} ${slot.rarity}：持有 ${slot.owned} 張${
        slot.reserved > 0 ? `，其中 ${slot.reserved} 張暫定換出` : ""
      }`
    : `${series} ${character} ${slot.rarity}：尚未收集`;

  return (
    <li
      aria-label={label}
      className={cn(
        "flex min-w-0 flex-col gap-1.5 rounded-md border px-2.5 py-2",
        collected
          ? "border-primary/20 bg-primary/[0.04]"
          : "border-border bg-muted/25",
      )}
    >
      <span
        className={cn(
          "font-mono text-xs font-medium tracking-[0.08em]",
          RARITY_TEXT[slot.rarityIndex],
        )}
      >
        {slot.rarity}
      </span>
      <span className="font-mono text-[11px] text-muted-foreground">
        {collected ? `${slot.owned} 張` : "缺"}
      </span>
      {slot.reserved > 0 ? (
        <Badge variant="outline" className="w-fit font-mono">
          預 {slot.reserved}
        </Badge>
      ) : null}
    </li>
  );
}

function SeriesDetails({
  character,
  series,
}: {
  character: string;
  series: SeriesProgress;
}) {
  return (
    <div className="rounded-lg border border-border bg-background/45 px-4 py-3.5 max-sm:px-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h4 className="progress-series-name font-accent text-[13px] font-medium uppercase italic tracking-[0.12em] text-foreground">
          {series.name}
        </h4>
        <span className={PROGRESS_META}>
          {progressLabel(series.stats)} · {series.stats.percentage}%
        </span>
      </div>
      <Progress
        value={series.stats.collected}
        max={series.stats.total}
        aria-label={`${character} ${series.name} 進度：${progressLabel(series.stats)}`}
        className="mt-2 h-1"
      />
      <ul className="mt-3 grid grid-cols-5 gap-2 max-sm:grid-cols-2">
        {series.slots.map((slot) => (
          <Slot
            key={slot.rarity}
            character={character}
            series={series.name}
            slot={slot}
          />
        ))}
      </ul>
    </div>
  );
}

function CharacterDetails({ character }: { character: CharacterProgress }) {
  return (
    <div className="flex flex-col gap-5 px-5 pt-1 pb-5 max-sm:px-4">
      {character.volumes.map((volume, volumeIndex) => (
        <Fragment key={volume.label}>
          {volumeIndex > 0 ? <Separator /> : null}
          <section
            aria-labelledby={`progress-${character.index}-${volumeIndex}`}
            className="flex flex-col gap-3"
          >
            <header className="flex flex-wrap items-baseline justify-between gap-2">
              <h3
                id={`progress-${character.index}-${volumeIndex}`}
                className="font-serif text-base font-medium tracking-[0.06em] text-foreground"
              >
                {volume.label}
              </h3>
              <span className={PROGRESS_META}>
                {progressLabel(volume.stats)} · {volume.stats.percentage}%
              </span>
            </header>
            <div className="flex flex-col gap-2.5">
              {volume.series.map((series) => (
                <SeriesDetails
                  key={series.name}
                  character={character.name}
                  series={series}
                />
              ))}
            </div>
          </section>
        </Fragment>
      ))}
    </div>
  );
}

export function Glance({ m }: { m: Matrix }) {
  const [filter, setFilter] = useState<"all" | "incomplete">("all");
  const characters = buildCharacterProgress(m);
  const overall = combineStats(characters.map((entry) => entry.stats));
  const completedCharacters = characters.filter(
    (entry) => entry.stats.total > 0 && entry.stats.missing === 0,
  ).length;
  const shownCharacters = characters.filter(
    (entry) => filter === "all" || entry.stats.missing > 0,
  );

  return (
    <section className="view view-glance">
      <Card className="mb-6 gap-0 rounded-[4px] border-[0.5px] border-border py-0 ring-0">
        <CardHeader className="border-b border-border px-6 py-5 max-sm:px-4">
          <CardTitle asChild className="font-serif text-xl tracking-[0.06em]">
            <h2>典藏進度</h2>
          </CardTitle>
          <CardDescription>
            從角色的整體完成度開始，展開後再查看各彈、系列與稀有度。
          </CardDescription>
          <CardAction>
            <Badge variant={overall.missing === 0 ? "default" : "secondary"}>
              {overall.percentage}%
            </Badge>
          </CardAction>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 px-6 py-5 max-sm:px-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="font-mono text-[32px] leading-none text-foreground">
                {progressLabel(overall)}
              </p>
              <p className="mt-2 font-accent text-[11px] uppercase italic tracking-[0.18em] text-muted-foreground">
                Unique cards collected
              </p>
            </div>
            <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground">
              <span>尚缺 {overall.missing} 種</span>
              <span>
                完成角色 {completedCharacters} / {characters.length}
              </span>
            </div>
          </div>
          <Progress
            value={overall.collected}
            max={overall.total}
            aria-label={`整體典藏進度：已收集 ${progressLabel(overall)} 種`}
            className="h-1.5"
          />
        </CardContent>
      </Card>

      <div className={VIEW_HEADER}>
        <ToggleGroup
          type="single"
          aria-label="角色篩選"
          value={filter}
          onValueChange={(value) =>
            value && setFilter(value as "all" | "incomplete")
          }
          className={MODE_TOGGLE}
        >
          <ToggleGroupItem
            value="all"
            className={cn(MODE_BTN, "text-muted-foreground")}
          >
            全部角色
          </ToggleGroupItem>
          <ToggleGroupItem
            value="incomplete"
            className={cn(MODE_BTN, "text-muted-foreground")}
          >
            僅看未完成
          </ToggleGroupItem>
        </ToggleGroup>
        <span className={PROGRESS_META}>
          顯示 {shownCharacters.length} / {characters.length} 位角色
        </span>
      </div>

      {shownCharacters.length === 0 ? (
        <Empty className={cn(CARD_FRAME, "py-12")}>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <CircleCheckBigIcon />
            </EmptyMedia>
            <EmptyTitle>所有角色都已完成典藏</EmptyTitle>
            <EmptyDescription>
              切回「全部角色」可查看每位角色的系列明細。
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <Accordion
          type="multiple"
          className={cn(CARD_FRAME, "overflow-hidden")}
        >
          {shownCharacters.map((character) => {
            const isComplete = character.stats.missing === 0;
            return (
              <AccordionItem
                key={character.name}
                value={`character-${character.index}`}
                className="border-border"
              >
                <AccordionTrigger className="rounded-none px-5 py-4 hover:no-underline data-[state=open]:bg-secondary/35 max-sm:px-4">
                  <div className="flex min-w-0 flex-1 flex-col gap-3 pr-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-serif text-base font-medium tracking-[0.04em] text-foreground">
                          {character.name}
                        </span>
                        <Badge variant={isComplete ? "secondary" : "outline"}>
                          {isComplete
                            ? "完成"
                            : `缺 ${character.stats.missing}`}
                        </Badge>
                      </div>
                      <span className="font-mono text-xs tracking-[0.06em] text-muted-foreground">
                        {progressLabel(character.stats)} ·{" "}
                        {character.stats.percentage}%
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-x-5 gap-y-3 max-sm:grid-cols-1">
                      {character.volumes.map((volume) => (
                        <VolumeSummary
                          key={volume.label}
                          character={character.name}
                          volume={volume}
                        />
                      ))}
                    </div>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="p-0">
                  <CharacterDetails character={character} />
                </AccordionContent>
              </AccordionItem>
            );
          })}
        </Accordion>
      )}
    </section>
  );
}
