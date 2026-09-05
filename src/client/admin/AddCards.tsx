import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useAcquisitionSubmission } from "@/lib/acquisition";
import { todayLocal } from "@/lib/date";
import { cn } from "@/lib/utils";
import { RARITY_TEXT } from "@/shared/rarity";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  MAX_CARD_BATCH_SIZE,
  MAX_CARD_CELL_QUANTITY,
} from "../../shared/card-batch";
import { RARITY_ORDER } from "../../shared/rarity";
import type {
  AddCardInput,
  CatalogSeries,
  OpeningInput,
  Rarity,
} from "../../shared/types";
import { fetchCatalog, fetchNextPackNumber } from "../api";
import { AcquisitionFeedback } from "./AcquisitionFeedback";

type AcquisitionMode = "pack" | "purchase" | "other";

interface TallyEntry {
  series: string;
  character: string;
  rarity: Rarity;
  qty: number;
}

const MODE_COPY: Record<
  AcquisitionMode,
  { label: string; description: string }
> = {
  pack: {
    label: "開卡包",
    description: "記錄同一彈的一包卡片，可同時填入多個系列與稀有度。",
  },
  purchase: {
    label: "已收購入",
    description: "只記錄已經收到的購入卡片；尚未收貨請使用購入預約。",
  },
  other: {
    label: "其他入藏",
    description: "適合贈與、盤點補登等不屬於開包或購入的收藏異動。",
  },
};

const RARITY_CLASS = Object.fromEntries(
  RARITY_ORDER.map((rarity, index) => [rarity, RARITY_TEXT[index]]),
) as Record<Rarity, string>;

function entryKey(series: string, character: string, rarity: Rarity) {
  return `${series}\u0000${character}\u0000${rarity}`;
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("zh-TW", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 0,
  }).format(value);
}

function volumeRarities(series: CatalogSeries[]) {
  return RARITY_ORDER.filter((rarity) =>
    series.some((item) => item.rarities.includes(rarity)),
  );
}

function volumeCharacters(series: CatalogSeries[]) {
  const seen = new Set<string>();
  const characters: string[] = [];
  for (const item of series) {
    for (const character of item.characters) {
      if (seen.has(character)) continue;
      seen.add(character);
      characters.push(character);
    }
  }
  return characters;
}

export function AddCards() {
  const [catalog, setCatalog] = useState<CatalogSeries[] | null>(null);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [previewUnavailable, setPreviewUnavailable] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [mode, setMode] = useState<AcquisitionMode>("pack");
  const [selectedVolume, setSelectedVolume] = useState<number | null>(null);
  const [activeRarity, setActiveRarity] = useState<Rarity | null>(null);
  const [tally, setTally] = useState<TallyEntry[]>([]);
  const [openedAt, setOpenedAt] = useState(todayLocal);
  const [cost, setCost] = useState("");
  const [purchaseTotal, setPurchaseTotal] = useState("");
  const [nextPackNumber, setNextPackNumber] = useState<number | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const submission = useAcquisitionSubmission("batch");
  const { busy, locked } = submission;
  const reviewHeadingRef = useRef<HTMLHeadingElement>(null);
  const restoreReviewFocus = useRef(false);

  useEffect(() => {
    let current = true;
    fetchCatalog()
      .then((items) => {
        if (!current) return;
        const sorted = [...items].sort(
          (left, right) =>
            left.volume - right.volume || left.sortOrder - right.sortOrder,
        );
        setCatalog(sorted);
        const first = sorted[0];
        if (!first) return;
        const firstVolumeSeries = sorted.filter(
          (item) => item.volume === first.volume,
        );
        setSelectedVolume(first.volume);
        setActiveRarity(volumeRarities(firstVolumeSeries)[0] ?? null);
      })
      .catch((error) => {
        if (current) setCatalogError(String(error));
      });
    return () => {
      current = false;
    };
  }, []);

  useEffect(() => {
    if (selectedVolume == null || mode !== "pack") return;
    let current = true;
    setNextPackNumber(null);
    setPreviewUnavailable(false);
    fetchNextPackNumber(selectedVolume)
      .then((result) => {
        if (current) setNextPackNumber(result.packNumber);
      })
      .catch(() => {
        if (current) setPreviewUnavailable(true);
      });
    return () => {
      current = false;
    };
  }, [mode, selectedVolume]);

  useEffect(() => {
    if (reviewing) {
      reviewHeadingRef.current?.focus();
    } else if (restoreReviewFocus.current) {
      document.getElementById("batch-review-button")?.focus();
      restoreReviewFocus.current = false;
    }
  }, [reviewing]);

  const volumes = useMemo(
    () =>
      [...new Set((catalog ?? []).map((item) => item.volume))].sort(
        (left, right) => left - right,
      ),
    [catalog],
  );
  const selectedSeries = useMemo(
    () => (catalog ?? []).filter((item) => item.volume === selectedVolume),
    [catalog, selectedVolume],
  );
  const rarities = useMemo(
    () => volumeRarities(selectedSeries),
    [selectedSeries],
  );
  const characters = useMemo(
    () => volumeCharacters(selectedSeries),
    [selectedSeries],
  );
  const quantityByKey = useMemo(
    () =>
      new Map(
        tally.map((entry) => [
          entryKey(entry.series, entry.character, entry.rarity),
          entry.qty,
        ]),
      ),
    [tally],
  );
  const total = tally.reduce((sum, entry) => sum + entry.qty, 0);
  const rarityTotals = useMemo(
    () =>
      Object.fromEntries(
        RARITY_ORDER.map((rarity) => [
          rarity,
          tally
            .filter((entry) => entry.rarity === rarity)
            .reduce((sum, entry) => sum + entry.qty, 0),
        ]),
      ) as Record<Rarity, number>,
    [tally],
  );
  const sortedTally = useMemo(() => {
    const seriesOrder = new Map(
      selectedSeries.map((item, index) => [item.name, index]),
    );
    const characterOrder = new Map(
      characters.map((character, index) => [character, index]),
    );
    const rarityOrder = new Map(
      RARITY_ORDER.map((rarity, index) => [rarity, index]),
    );
    return [...tally].sort(
      (left, right) =>
        (seriesOrder.get(left.series) ?? Number.MAX_SAFE_INTEGER) -
          (seriesOrder.get(right.series) ?? Number.MAX_SAFE_INTEGER) ||
        (characterOrder.get(left.character) ?? Number.MAX_SAFE_INTEGER) -
          (characterOrder.get(right.character) ?? Number.MAX_SAFE_INTEGER) ||
        (rarityOrder.get(left.rarity) ?? Number.MAX_SAFE_INTEGER) -
          (rarityOrder.get(right.rarity) ?? Number.MAX_SAFE_INTEGER),
    );
  }, [characters, selectedSeries, tally]);

  const numericCost = Number(cost);
  const costValid =
    cost.trim() === "" || (Number.isFinite(numericCost) && numericCost >= 0);
  const numericPurchaseTotal = Number(purchaseTotal);
  const purchaseTotalNumberValid =
    purchaseTotal.trim() !== "" &&
    Number.isFinite(numericPurchaseTotal) &&
    numericPurchaseTotal >= 0;
  const purchaseTotalCents = Math.round(numericPurchaseTotal * 100);
  const purchaseTotalPrecisionValid =
    purchaseTotalNumberValid &&
    Number.isSafeInteger(purchaseTotalCents) &&
    Math.abs(numericPurchaseTotal * 100 - purchaseTotalCents) < 0.000001;
  const purchaseTotalValid =
    purchaseTotalNumberValid && purchaseTotalPrecisionValid;
  const detailsValid =
    mode === "pack"
      ? Boolean(openedAt) && costValid
      : mode === "purchase"
        ? purchaseTotalValid
        : true;
  const canReview =
    catalog !== null &&
    selectedVolume !== null &&
    activeRarity !== null &&
    total > 0 &&
    total <= MAX_CARD_BATCH_SIZE &&
    detailsValid;

  const selectMode = (nextMode: AcquisitionMode) => {
    if (locked || (total > 0 && nextMode !== mode)) return;
    setMode(nextMode);
    setReviewing(false);
    setSuccess(null);
  };

  const selectVolume = (volume: number) => {
    if (locked || volume === selectedVolume || total > 0) return;
    const nextSeries = (catalog ?? []).filter((item) => item.volume === volume);
    setSelectedVolume(volume);
    setActiveRarity(volumeRarities(nextSeries)[0] ?? null);
    setReviewing(false);
    setSuccess(null);
  };

  const setQuantity = (
    series: string,
    character: string,
    rarity: Rarity,
    rawValue: string,
  ) => {
    if (locked) return;
    const requested = rawValue === "" ? 0 : Math.trunc(Number(rawValue));
    if (!Number.isFinite(requested)) return;
    setTally((entries) => {
      const key = entryKey(series, character, rarity);
      const currentTotal = entries.reduce((sum, entry) => sum + entry.qty, 0);
      const current = entries.find(
        (entry) =>
          entryKey(entry.series, entry.character, entry.rarity) === key,
      );
      const currentQty = current?.qty ?? 0;
      const maximum = Math.min(
        MAX_CARD_CELL_QUANTITY,
        currentQty + MAX_CARD_BATCH_SIZE - currentTotal,
      );
      const nextQty = Math.max(0, Math.min(requested, maximum));
      if (nextQty === 0) {
        return entries.filter(
          (entry) =>
            entryKey(entry.series, entry.character, entry.rarity) !== key,
        );
      }
      if (current) {
        return entries.map((entry) =>
          entryKey(entry.series, entry.character, entry.rarity) === key
            ? { ...entry, qty: nextQty }
            : entry,
        );
      }
      return [...entries, { series, character, rarity, qty: nextQty }];
    });
    setReviewing(false);
    setSuccess(null);
  };

  const clearDraft = () => {
    if (locked) return;
    setTally([]);
    setCost("");
    setPurchaseTotal("");
    setReviewing(false);
    setSuccess(null);
  };

  const buildCards = (): AddCardInput[] => {
    const cards = sortedTally.flatMap((entry) =>
      Array.from({ length: entry.qty }, () => ({
        series: entry.series,
        character: entry.character,
        rarity: entry.rarity,
      })),
    );
    if (mode !== "purchase") {
      const source = mode === "other" ? ("other" as const) : ("pull" as const);
      return cards.map((card) => ({ ...card, source }));
    }

    const baseCents = Math.floor(purchaseTotalCents / cards.length);
    const remainder = purchaseTotalCents % cards.length;
    return cards.map((card, index) => ({
      ...card,
      source: "purchase" as const,
      purchasePrice: (baseCents + (index < remainder ? 1 : 0)) / 100,
    }));
  };

  const submit = async () => {
    if (busy || (!locked && (!canReview || selectedVolume == null))) return;
    setSuccess(null);
    const saved = await submission.submit(() => {
      const cards = buildCards();
      const opening: OpeningInput | undefined =
        mode === "pack"
          ? {
              volume: selectedVolume as number,
              openedAt,
              cost: cost.trim() === "" ? undefined : numericCost,
            }
          : undefined;
      return { cards, opening };
    });
    if (!saved) return;
    const { result, request } = saved;
    if (request.opening) {
      const packNumber = result.opening?.packNumber;
      setSuccess(
        packNumber == null
          ? `已記錄 1 包（${result.ids.length} 張）`
          : `第 ${request.opening.volume} 彈第 ${packNumber} 包已記錄（${result.ids.length} 張）`,
      );
      if (result.opening?.volume === selectedVolume) {
        setNextPackNumber(result.opening.packNumber + 1);
      }
    } else if (request.cards[0]?.source === "purchase") {
      const amount =
        request.cards.reduce(
          (sum, card) => sum + Math.round((card.purchasePrice ?? 0) * 100),
          0,
        ) / 100;
      setSuccess(
        `已記錄 ${result.ids.length} 張已收購入（總額 ${formatMoney(amount)} TWD）`,
      );
    } else {
      setSuccess(`已記錄 ${result.ids.length} 張其他入藏`);
    }
    setTally([]);
    setCost("");
    setPurchaseTotal("");
    setOpenedAt(todayLocal());
    setReviewing(false);
  };

  const openReview = () => {
    if (!canReview || locked) return;
    setSuccess(null);
    setReviewing(true);
  };

  return (
    <section aria-labelledby="batch-workbench-title" className="grid gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid gap-1">
          <h2
            id="batch-workbench-title"
            className="font-serif text-xl font-medium tracking-[0.04em] text-foreground"
          >
            批次收藏工作台
          </h2>
          <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
            先選來源與彈數，再直接在矩陣填入數量；同一批送出後會合併成一筆痕跡。
          </p>
        </div>
        <Badge variant="outline">每批最多 {MAX_CARD_BATCH_SIZE} 張</Badge>
      </div>

      {success ? (
        <Alert className="border-primary/30 bg-primary/5">
          <AlertTitle>批次入藏完成</AlertTitle>
          <AlertDescription>{success}</AlertDescription>
        </Alert>
      ) : null}
      {catalogError ? (
        <Alert variant="destructive">
          <AlertTitle>無法載入卡片目錄</AlertTitle>
          <AlertDescription>{catalogError}</AlertDescription>
        </Alert>
      ) : null}
      <AcquisitionFeedback submission={submission} onRetry={submit} />

      {reviewing ? (
        <Card>
          <CardHeader className="border-b">
            <CardTitle asChild>
              <h3 ref={reviewHeadingRef} tabIndex={-1}>
                確認本次入藏
              </h3>
            </CardTitle>
            <CardDescription>
              請核對來源、張數與明細；確認後會一次寫入收藏與痕跡。
            </CardDescription>
            <CardAction>
              <Badge>{total} 張</Badge>
            </CardAction>
          </CardHeader>
          <CardContent className="grid gap-5">
            <dl className="grid gap-3 rounded-lg border bg-muted/30 p-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
              <div className="grid gap-1">
                <dt className="text-xs text-muted-foreground">入藏來源</dt>
                <dd className="font-medium text-foreground">
                  {MODE_COPY[mode].label}
                </dd>
              </div>
              <div className="grid gap-1">
                <dt className="text-xs text-muted-foreground">彈數</dt>
                <dd className="font-medium text-foreground">
                  第 {selectedVolume} 彈
                </dd>
              </div>
              <div className="grid gap-1">
                <dt className="text-xs text-muted-foreground">卡片</dt>
                <dd className="font-medium text-foreground">
                  {total} 張 · {tally.length} 種
                </dd>
              </div>
              <div className="grid gap-1">
                <dt className="text-xs text-muted-foreground">
                  {mode === "pack"
                    ? "開卡資料"
                    : mode === "purchase"
                      ? "購入總額"
                      : "記錄方式"}
                </dt>
                <dd className="font-medium text-foreground">
                  {mode === "pack"
                    ? `${openedAt} · ${cost.trim() === "" ? "未填花費" : `${formatMoney(numericCost)} TWD`}`
                    : mode === "purchase"
                      ? `${formatMoney(numericPurchaseTotal)} TWD`
                      : "直接計入收藏"}
                </dd>
              </div>
            </dl>

            {mode === "purchase" ? (
              <Alert>
                <AlertTitle>購入總額會分攤到每張實體卡</AlertTitle>
                <AlertDescription>
                  系統以 0.01 TWD
                  為單位平均分攤，無法整除的尾差會自動補在前幾張卡。
                </AlertDescription>
              </Alert>
            ) : null}

            <Table
              aria-label="本次批次入藏明細"
              scrollLabel="可左右捲動的本次批次入藏明細"
            >
              <TableHeader>
                <TableRow>
                  <TableHead>系列</TableHead>
                  <TableHead>角色</TableHead>
                  <TableHead>稀有度</TableHead>
                  <TableHead className="text-right">數量</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedTally.map((entry) => (
                  <TableRow
                    key={entryKey(entry.series, entry.character, entry.rarity)}
                  >
                    <TableCell className="font-medium text-foreground">
                      {entry.series}
                    </TableCell>
                    <TableCell>{entry.character}</TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={RARITY_CLASS[entry.rarity]}
                      >
                        {entry.rarity}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      ×{entry.qty}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
          <CardFooter className="flex flex-wrap justify-between gap-3">
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                restoreReviewFocus.current = true;
                setReviewing(false);
              }}
              disabled={locked}
            >
              返回修改
            </Button>
            <Button type="button" onClick={submit} disabled={locked}>
              {busy ? "寫入中…" : `確認寫入 ${total} 張`}
            </Button>
          </CardFooter>
        </Card>
      ) : (
        <>
          <Card>
            <CardHeader className="border-b">
              <CardTitle asChild>
                <h3>1. 設定這批卡的來源</h3>
              </CardTitle>
              <CardDescription>
                草稿已有卡片時，來源與彈數會鎖定；清空草稿後即可切換。
              </CardDescription>
              <CardAction>
                <Badge variant="secondary">草稿</Badge>
              </CardAction>
            </CardHeader>
            <CardContent>
              <FieldGroup>
                <FieldSet disabled={locked}>
                  <FieldLegend variant="label">取得方式</FieldLegend>
                  <ToggleGroup
                    type="single"
                    variant="outline"
                    value={mode}
                    aria-label="取得方式"
                    className="flex-wrap"
                    onValueChange={(value) => {
                      if (value) selectMode(value as AcquisitionMode);
                    }}
                  >
                    {(Object.keys(MODE_COPY) as AcquisitionMode[]).map(
                      (value) => (
                        <ToggleGroupItem
                          key={value}
                          value={value}
                          disabled={total > 0 && value !== mode}
                          className="data-[state=on]:border-primary data-[state=on]:bg-primary/10 data-[state=on]:text-primary"
                        >
                          {MODE_COPY[value].label}
                        </ToggleGroupItem>
                      ),
                    )}
                  </ToggleGroup>
                  <FieldDescription>
                    {MODE_COPY[mode].description}
                  </FieldDescription>
                </FieldSet>

                <FieldSet disabled={locked}>
                  <FieldLegend variant="label">彈數</FieldLegend>
                  <ToggleGroup
                    type="single"
                    variant="outline"
                    value={selectedVolume == null ? "" : String(selectedVolume)}
                    aria-label="卡片彈數"
                    className="flex-wrap"
                    onValueChange={(value) => {
                      if (value) selectVolume(Number(value));
                    }}
                  >
                    {volumes.map((volume) => (
                      <ToggleGroupItem
                        key={volume}
                        value={String(volume)}
                        disabled={total > 0 && volume !== selectedVolume}
                        className="data-[state=on]:border-primary data-[state=on]:bg-primary/10 data-[state=on]:text-primary"
                      >
                        第 {volume} 彈
                      </ToggleGroupItem>
                    ))}
                  </ToggleGroup>
                </FieldSet>
              </FieldGroup>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="border-b">
              <CardTitle asChild>
                <h3>2. 填入卡片數量</h3>
              </CardTitle>
              <CardDescription>
                切換稀有度填表，數量會保留；空白與 0
                都代表這批沒有該卡。窄螢幕可左右滑動表格。
              </CardDescription>
              <CardAction>
                <Badge variant={total > 0 ? "default" : "secondary"}>
                  {total} / {MAX_CARD_BATCH_SIZE} 張
                </Badge>
              </CardAction>
            </CardHeader>
            <CardContent className="grid gap-4">
              <FieldSet disabled={locked}>
                <FieldLegend variant="label">稀有度</FieldLegend>
                <ToggleGroup
                  type="single"
                  variant="outline"
                  value={activeRarity ?? ""}
                  aria-label="稀有度"
                  className="flex-wrap"
                  onValueChange={(value) => {
                    if (value) setActiveRarity(value as Rarity);
                  }}
                >
                  {rarities.map((rarity) => (
                    <ToggleGroupItem
                      key={rarity}
                      value={rarity}
                      aria-label={`${rarity}，已選 ${rarityTotals[rarity]} 張`}
                      className={cn(
                        "data-[state=on]:border-current data-[state=on]:bg-muted",
                        RARITY_CLASS[rarity],
                      )}
                    >
                      {rarity}
                      {rarityTotals[rarity] > 0 ? (
                        <span className="font-mono text-[0.7rem]">
                          {rarityTotals[rarity]}
                        </span>
                      ) : null}
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
              </FieldSet>

              {catalog === null && !catalogError ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  正在讀取卡片目錄…
                </p>
              ) : null}
              {catalog?.length === 0 ? (
                <Alert>
                  <AlertTitle>卡片目錄是空的</AlertTitle>
                  <AlertDescription>
                    請先到「系列設定」建立系列、角色與稀有度。
                  </AlertDescription>
                </Alert>
              ) : null}
              {activeRarity && selectedSeries.length > 0 ? (
                <Table
                  aria-label={`第 ${selectedVolume} 彈 ${activeRarity} 批次入藏矩陣`}
                  scrollLabel={`可左右捲動的第 ${selectedVolume} 彈 ${activeRarity} 批次入藏矩陣`}
                  className="w-max min-w-full"
                >
                  <TableCaption className="sr-only">
                    角色為列、系列為欄；在可用的格子輸入這批卡片數量。
                  </TableCaption>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="sticky left-0 z-10 min-w-32 bg-card">
                        角色 ＼ 系列
                      </TableHead>
                      {selectedSeries.map((item) => (
                        <TableHead
                          key={item.name}
                          className="min-w-32 text-center"
                        >
                          {item.name}
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {characters.map((character) => (
                      <TableRow key={character}>
                        <TableCell className="sticky left-0 z-10 bg-card font-medium text-foreground">
                          {character}
                        </TableCell>
                        {selectedSeries.map((item) => {
                          const available =
                            item.characters.includes(character) &&
                            item.rarities.includes(activeRarity);
                          const key = entryKey(
                            item.name,
                            character,
                            activeRarity,
                          );
                          const quantity = quantityByKey.get(key) ?? 0;
                          const maximum = Math.min(
                            MAX_CARD_CELL_QUANTITY,
                            quantity + MAX_CARD_BATCH_SIZE - total,
                          );
                          return (
                            <TableCell
                              key={item.name}
                              className={cn(
                                "text-center",
                                quantity > 0 && "bg-primary/5",
                              )}
                            >
                              {available ? (
                                <Input
                                  type="number"
                                  min={0}
                                  max={maximum}
                                  step={1}
                                  inputMode="numeric"
                                  aria-label={`${item.name} ${character} ${activeRarity} 數量`}
                                  className="mx-auto h-8 w-20 text-center font-mono"
                                  value={quantity === 0 ? "" : quantity}
                                  disabled={locked}
                                  placeholder="0"
                                  onChange={(event) =>
                                    setQuantity(
                                      item.name,
                                      character,
                                      activeRarity,
                                      event.target.value,
                                    )
                                  }
                                />
                              ) : (
                                <span
                                  className="text-muted-foreground/50"
                                  title={`${item.name} 沒有 ${character} ${activeRarity}`}
                                >
                                  —
                                </span>
                              )}
                            </TableCell>
                          );
                        })}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : null}
            </CardContent>
            <CardFooter className="flex flex-wrap justify-between gap-3">
              <p className="text-sm text-muted-foreground">
                已選{" "}
                <strong className="font-medium text-foreground">{total}</strong>{" "}
                張，共 {tally.length} 種
              </p>
              <Button
                type="button"
                variant="ghost"
                onClick={clearDraft}
                disabled={locked || total === 0}
              >
                清空草稿
              </Button>
            </CardFooter>
          </Card>

          <Card>
            <CardHeader className="border-b">
              <CardTitle asChild>
                <h3>3. 補上這批資料</h3>
              </CardTitle>
              <CardDescription>
                {mode === "pack"
                  ? "日期會成為這筆開卡痕跡的時間，花費可留空。"
                  : mode === "purchase"
                    ? "填寫這批已收卡片的實付總額。"
                    : "其他入藏不需要額外資料，確認明細後即可寫入。"}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {mode === "pack" ? (
                <FieldGroup className="sm:grid sm:grid-cols-2">
                  <Field>
                    <FieldLabel htmlFor="batch-opened-at">開卡日期</FieldLabel>
                    <Input
                      id="batch-opened-at"
                      type="date"
                      value={openedAt}
                      disabled={locked}
                      aria-invalid={!openedAt}
                      onChange={(event) => {
                        setOpenedAt(event.target.value);
                        setSuccess(null);
                      }}
                    />
                    {!openedAt ? <FieldError>開卡日期為必填</FieldError> : null}
                  </Field>
                  <Field data-invalid={!costValid}>
                    <FieldLabel htmlFor="batch-opening-cost">
                      本包花費 (TWD)
                    </FieldLabel>
                    <Input
                      id="batch-opening-cost"
                      type="number"
                      min={0}
                      step="0.01"
                      inputMode="decimal"
                      value={cost}
                      disabled={locked}
                      placeholder="選填"
                      aria-invalid={!costValid}
                      onChange={(event) => {
                        setCost(event.target.value);
                        setSuccess(null);
                      }}
                    />
                    {!costValid ? (
                      <FieldError>本包花費必須為 0 或正數</FieldError>
                    ) : null}
                  </Field>
                  <Alert className="sm:col-span-2">
                    <AlertTitle>本次開卡</AlertTitle>
                    <AlertDescription>
                      {nextPackNumber == null
                        ? "送出時由系統自動編號。"
                        : `第 ${selectedVolume} 彈 · 第 ${nextPackNumber} 包`}
                      {previewUnavailable
                        ? " 目前無法預覽下一個包號，但仍可正常送出。"
                        : ""}
                    </AlertDescription>
                  </Alert>
                </FieldGroup>
              ) : mode === "purchase" ? (
                <Field
                  data-invalid={purchaseTotal !== "" && !purchaseTotalValid}
                  className="max-w-sm"
                >
                  <FieldLabel htmlFor="batch-purchase-total">
                    購入總額 (TWD)
                  </FieldLabel>
                  <Input
                    id="batch-purchase-total"
                    type="number"
                    min={0}
                    step="0.01"
                    inputMode="decimal"
                    value={purchaseTotal}
                    disabled={locked}
                    placeholder="必填"
                    aria-invalid={purchaseTotal !== "" && !purchaseTotalValid}
                    onChange={(event) => {
                      setPurchaseTotal(event.target.value);
                      setSuccess(null);
                    }}
                  />
                  <FieldDescription>
                    確認時會顯示總額，並平均分攤至這批每張實體卡。
                  </FieldDescription>
                  {purchaseTotal !== "" && !purchaseTotalValid ? (
                    <FieldError>
                      {purchaseTotalNumberValid
                        ? "購入總額最多只能有兩位小數"
                        : "購入總額必須為 0 或正數"}
                    </FieldError>
                  ) : null}
                </Field>
              ) : (
                <Alert>
                  <AlertTitle>會直接計入收藏</AlertTitle>
                  <AlertDescription>
                    這批卡片會形成一筆「新增入藏」痕跡，不建立開卡包或購入紀錄。
                  </AlertDescription>
                </Alert>
              )}
            </CardContent>
            <CardFooter className="flex flex-wrap justify-between gap-3">
              <p className="text-xs text-muted-foreground">
                送出前還會有一次完整確認，不會在這一步寫入。
              </p>
              <Button
                id="batch-review-button"
                type="button"
                onClick={openReview}
                disabled={locked || !canReview}
              >
                檢查本次入藏（{total} 張）
              </Button>
            </CardFooter>
          </Card>
        </>
      )}
    </section>
  );
}
