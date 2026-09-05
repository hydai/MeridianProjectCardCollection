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
import { useEffect, useMemo, useState } from "react";
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

interface PackEntry {
  series: string;
  character: string;
  rarity: Rarity;
  qty: number;
}

const RARITY_CLASS = Object.fromEntries(
  RARITY_ORDER.map((rarity, index) => [rarity, RARITY_TEXT[index]]),
) as Record<Rarity, string>;

function entryKey(series: string, character: string, rarity: Rarity) {
  return `${series}\u0000${character}\u0000${rarity}`;
}

export function QuickPackOpening() {
  const [catalog, setCatalog] = useState<CatalogSeries[] | null>(null);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [selectedVolume, setSelectedVolume] = useState<number | null>(null);
  const [selectedSeriesName, setSelectedSeriesName] = useState("");
  const [selectedRarity, setSelectedRarity] = useState<Rarity | null>(null);
  const [entries, setEntries] = useState<PackEntry[]>([]);
  const [openedAt, setOpenedAt] = useState(todayLocal);
  const [cost, setCost] = useState("");
  const [nextPackNumber, setNextPackNumber] = useState<number | null>(null);
  const [previewUnavailable, setPreviewUnavailable] = useState(false);
  const submission = useAcquisitionSubmission("quick-pack");
  const { busy, locked } = submission;

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
        setSelectedVolume(first.volume);
        setSelectedSeriesName(first.name);
        setSelectedRarity(first.rarities[0] ?? null);
      })
      .catch((error) => {
        if (current) setCatalogError(String(error));
      });
    return () => {
      current = false;
    };
  }, []);

  useEffect(() => {
    if (selectedVolume == null) return;
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
  }, [selectedVolume]);

  const volumes = useMemo(
    () =>
      [...new Set((catalog ?? []).map((item) => item.volume))].sort(
        (left, right) => left - right,
      ),
    [catalog],
  );
  const seriesOptions = useMemo(
    () => (catalog ?? []).filter((item) => item.volume === selectedVolume),
    [catalog, selectedVolume],
  );
  const selectedSeries = seriesOptions.find(
    (item) => item.name === selectedSeriesName,
  );
  const total = entries.reduce((sum, entry) => sum + entry.qty, 0);
  const numericCost = Number(cost);
  const costValid =
    cost.trim() === "" || (Number.isFinite(numericCost) && numericCost >= 0);
  const canSubmit =
    catalog !== null &&
    selectedVolume !== null &&
    total > 0 &&
    total <= MAX_CARD_BATCH_SIZE &&
    Boolean(openedAt) &&
    costValid;

  const clearFeedback = () => {
    setSuccess(null);
  };

  const selectVolume = (volume: number) => {
    if (locked || volume === selectedVolume || total > 0) return;
    const firstSeries = (catalog ?? []).find((item) => item.volume === volume);
    if (!firstSeries) return;
    setSelectedVolume(volume);
    setSelectedSeriesName(firstSeries.name);
    setSelectedRarity(firstSeries.rarities[0] ?? null);
    clearFeedback();
  };

  const selectSeries = (name: string) => {
    if (locked) return;
    const nextSeries = seriesOptions.find((item) => item.name === name);
    if (!nextSeries) return;
    setSelectedSeriesName(nextSeries.name);
    setSelectedRarity(nextSeries.rarities[0] ?? null);
    clearFeedback();
  };

  const addCard = (character: string) => {
    if (locked || !selectedSeries || !selectedRarity) return;
    setEntries((currentEntries) => {
      const currentTotal = currentEntries.reduce(
        (sum, entry) => sum + entry.qty,
        0,
      );
      if (currentTotal >= MAX_CARD_BATCH_SIZE) return currentEntries;
      const key = entryKey(selectedSeries.name, character, selectedRarity);
      const current = currentEntries.find(
        (entry) =>
          entryKey(entry.series, entry.character, entry.rarity) === key,
      );
      if (current && current.qty >= MAX_CARD_CELL_QUANTITY) {
        return currentEntries;
      }
      if (current) {
        return currentEntries.map((entry) =>
          entryKey(entry.series, entry.character, entry.rarity) === key
            ? { ...entry, qty: entry.qty + 1 }
            : entry,
        );
      }
      return [
        ...currentEntries,
        {
          series: selectedSeries.name,
          character,
          rarity: selectedRarity,
          qty: 1,
        },
      ];
    });
    clearFeedback();
  };

  const removeOne = (target: PackEntry) => {
    if (locked) return;
    const targetKey = entryKey(target.series, target.character, target.rarity);
    setEntries((currentEntries) =>
      currentEntries
        .map((entry) =>
          entryKey(entry.series, entry.character, entry.rarity) === targetKey
            ? { ...entry, qty: entry.qty - 1 }
            : entry,
        )
        .filter((entry) => entry.qty > 0),
    );
    clearFeedback();
  };

  const submit = async () => {
    if (busy || (!locked && (!canSubmit || selectedVolume == null))) return;
    setSuccess(null);
    const saved = await submission.submit(() => {
      const cards: AddCardInput[] = entries.flatMap((entry) =>
        Array.from({ length: entry.qty }, () => ({
          series: entry.series,
          character: entry.character,
          rarity: entry.rarity,
          source: "pull" as const,
        })),
      );
      const opening: OpeningInput = {
        volume: selectedVolume as number,
        openedAt,
        cost: cost.trim() === "" ? undefined : numericCost,
      };
      return { cards, opening };
    });
    if (!saved) return;
    const { result, request } = saved;
    const packNumber = result.opening?.packNumber;
    setSuccess(
      packNumber == null
        ? `已記錄 1 包（${result.ids.length} 張）`
        : `第 ${request.opening?.volume} 彈第 ${packNumber} 包已記錄（${result.ids.length} 張）`,
    );
    if (result.opening?.volume === selectedVolume) {
      setNextPackNumber(result.opening.packNumber + 1);
    }
    setEntries([]);
    setCost("");
  };

  return (
    <section aria-labelledby="quick-pack-title" className="grid gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid gap-1">
          <h2
            id="quick-pack-title"
            className="font-serif text-xl font-medium tracking-[0.04em] text-foreground"
          >
            單包開卡
          </h2>
          <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
            選好系列與稀有度後，每點一次角色就加入一張；送出時只會建立一包。
          </p>
        </div>
        <Badge variant="outline">
          本包 {total} / {MAX_CARD_BATCH_SIZE} 張
        </Badge>
      </div>

      {success ? (
        <Alert className="border-primary/30 bg-primary/5">
          <AlertTitle>單包開卡完成</AlertTitle>
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
      {catalog === null && !catalogError ? (
        <Alert>
          <AlertTitle>正在載入卡片目錄</AlertTitle>
          <AlertDescription>稍候即可開始輸入本包內容。</AlertDescription>
        </Alert>
      ) : null}

      {catalog !== null ? (
        <>
          <Card>
            <CardHeader className="border-b">
              <CardTitle asChild>
                <h3>1. 點選本包卡片</h3>
              </CardTitle>
              <CardDescription>
                同一包可切換同彈的不同系列與稀有度；加入第一張後會鎖定彈數。
              </CardDescription>
            </CardHeader>
            <CardContent>
              <FieldGroup>
                <FieldSet disabled={locked}>
                  <FieldLegend variant="label">彈數</FieldLegend>
                  <FieldDescription>
                    一包只能包含同一彈的卡片。
                  </FieldDescription>
                  <ToggleGroup
                    type="single"
                    variant="outline"
                    spacing={2}
                    aria-label="卡包彈數"
                    value={selectedVolume == null ? "" : String(selectedVolume)}
                    onValueChange={(value) => {
                      if (value) selectVolume(Number(value));
                    }}
                    className="w-full flex-wrap justify-start"
                  >
                    {volumes.map((volume) => (
                      <ToggleGroupItem
                        key={volume}
                        value={String(volume)}
                        disabled={total > 0 && volume !== selectedVolume}
                      >
                        第 {volume} 彈
                      </ToggleGroupItem>
                    ))}
                  </ToggleGroup>
                </FieldSet>

                <FieldSet disabled={locked}>
                  <FieldLegend variant="label">系列</FieldLegend>
                  <ToggleGroup
                    type="single"
                    variant="outline"
                    spacing={2}
                    aria-label="卡片系列"
                    value={selectedSeriesName}
                    onValueChange={(value) => {
                      if (value) selectSeries(value);
                    }}
                    className="w-full flex-wrap justify-start"
                  >
                    {seriesOptions.map((item) => (
                      <ToggleGroupItem key={item.name} value={item.name}>
                        {item.name}
                      </ToggleGroupItem>
                    ))}
                  </ToggleGroup>
                </FieldSet>

                <FieldSet disabled={locked}>
                  <FieldLegend variant="label">稀有度</FieldLegend>
                  <ToggleGroup
                    type="single"
                    variant="outline"
                    spacing={2}
                    aria-label="卡片稀有度"
                    value={selectedRarity ?? ""}
                    onValueChange={(value) => {
                      if (value) {
                        setSelectedRarity(value as Rarity);
                        clearFeedback();
                      }
                    }}
                    className="w-full flex-wrap justify-start"
                  >
                    {(selectedSeries?.rarities ?? []).map((rarity) => (
                      <ToggleGroupItem key={rarity} value={rarity}>
                        {rarity}
                      </ToggleGroupItem>
                    ))}
                  </ToggleGroup>
                </FieldSet>

                <FieldSet disabled={locked}>
                  <FieldLegend variant="label">角色</FieldLegend>
                  <FieldDescription>
                    每點一次加入一張；同一卡種最多 {MAX_CARD_CELL_QUANTITY} 張。
                  </FieldDescription>
                  <div className="flex flex-wrap gap-2">
                    {(selectedSeries?.characters ?? []).map((character) => {
                      const quantity =
                        entries.find(
                          (entry) =>
                            entry.series === selectedSeries?.name &&
                            entry.character === character &&
                            entry.rarity === selectedRarity,
                        )?.qty ?? 0;
                      const disabled =
                        locked ||
                        total >= MAX_CARD_BATCH_SIZE ||
                        quantity >= MAX_CARD_CELL_QUANTITY;
                      return (
                        <Button
                          key={character}
                          type="button"
                          variant="outline"
                          aria-label={`加入 ${selectedSeries?.name} ${character} ${selectedRarity} 一張`}
                          onClick={() => addCard(character)}
                          disabled={disabled}
                        >
                          {character}
                          {quantity > 0 ? (
                            <Badge variant="secondary">×{quantity}</Badge>
                          ) : null}
                        </Button>
                      );
                    })}
                  </div>
                </FieldSet>
              </FieldGroup>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="border-b">
              <CardTitle asChild>
                <h3>本包內容</h3>
              </CardTitle>
              <CardDescription>
                可跨同彈系列累加；按「−1」逐張修正。窄螢幕可左右滑動表格。
              </CardDescription>
              <CardAction>
                <Badge variant="secondary">{total} 張</Badge>
              </CardAction>
            </CardHeader>
            <CardContent>
              {entries.length === 0 ? (
                <Alert>
                  <AlertTitle>尚未加入卡片</AlertTitle>
                  <AlertDescription>
                    從上方選好系列與稀有度，再點角色加入本包。
                  </AlertDescription>
                </Alert>
              ) : (
                <Table
                  aria-label="本包卡片明細"
                  scrollLabel="可左右捲動的本包卡片明細"
                  className="min-w-[560px]"
                >
                  <TableHeader>
                    <TableRow>
                      <TableHead>系列</TableHead>
                      <TableHead>角色</TableHead>
                      <TableHead>稀有度</TableHead>
                      <TableHead className="text-right">數量</TableHead>
                      <TableHead className="text-right">調整</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {entries.map((entry) => (
                      <TableRow
                        key={entryKey(
                          entry.series,
                          entry.character,
                          entry.rarity,
                        )}
                      >
                        <TableCell className="font-medium text-foreground">
                          {entry.series}
                        </TableCell>
                        <TableCell>{entry.character}</TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={cn(RARITY_CLASS[entry.rarity])}
                          >
                            {entry.rarity}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          ×{entry.qty}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            type="button"
                            size="xs"
                            variant="outline"
                            aria-label={`從本包移除 ${entry.series} ${entry.character} ${entry.rarity} 一張`}
                            onClick={() => removeOne(entry)}
                            disabled={locked}
                          >
                            −1
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
            {entries.length > 0 ? (
              <CardFooter className="justify-end">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    setEntries([]);
                    clearFeedback();
                  }}
                  disabled={locked}
                >
                  清空本包
                </Button>
              </CardFooter>
            ) : null}
          </Card>

          <Card>
            <CardHeader className="border-b">
              <CardTitle asChild>
                <h3>2. 填寫開卡資訊</h3>
              </CardTitle>
              <CardDescription>
                日期會成為這筆開卡痕跡的時間，本包花費可留空。
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-5">
              <FieldGroup className="sm:grid sm:grid-cols-2">
                <Field data-invalid={!openedAt}>
                  <FieldLabel htmlFor="quick-pack-opened-at">
                    開卡日期
                  </FieldLabel>
                  <Input
                    id="quick-pack-opened-at"
                    type="date"
                    value={openedAt}
                    disabled={locked}
                    aria-invalid={!openedAt}
                    onChange={(event) => {
                      setOpenedAt(event.target.value);
                      clearFeedback();
                    }}
                  />
                  {!openedAt ? <FieldError>開卡日期為必填</FieldError> : null}
                </Field>
                <Field data-invalid={!costValid}>
                  <FieldLabel htmlFor="quick-pack-cost">
                    本包花費 (TWD)
                  </FieldLabel>
                  <Input
                    id="quick-pack-cost"
                    type="number"
                    min={0}
                    step="0.01"
                    inputMode="decimal"
                    placeholder="選填"
                    value={cost}
                    disabled={locked}
                    aria-invalid={!costValid}
                    onChange={(event) => {
                      setCost(event.target.value);
                      clearFeedback();
                    }}
                  />
                  {!costValid ? (
                    <FieldError>本包花費必須為 0 或正數</FieldError>
                  ) : null}
                </Field>
              </FieldGroup>

              <Alert>
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
            </CardContent>
            <CardFooter className="justify-end">
              <Button
                type="button"
                onClick={submit}
                disabled={!canSubmit || locked}
              >
                {busy
                  ? "記錄中…"
                  : nextPackNumber == null
                    ? `記錄本包（${total} 張）`
                    : `記錄第 ${nextPackNumber} 包（${total} 張）`}
              </Button>
            </CardFooter>
          </Card>
        </>
      ) : null}
    </section>
  );
}
