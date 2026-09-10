import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { LoaderCircle, Upload } from "lucide-react";
import { useId, useRef, useState } from "react";
import { parseBatchListingInput } from "../../shared/batch-listing";
import { MAX_CARD_BATCH_SIZE } from "../../shared/card-batch";
import type {
  BatchListingInput,
  CardRow,
  OverviewCell,
} from "../../shared/types";
import { ApiError, postBatchListing } from "../api";

export interface BatchListingGroup {
  catalogId: number;
  series: string;
  character: string;
  rarity: string;
  cardIds: number[];
}

const groupKey = (card: Pick<CardRow, "series" | "character" | "rarity">) =>
  JSON.stringify([card.series, card.character, card.rarity]);

export function batchListingGroups(
  rows: CardRow[],
  cells: OverviewCell[],
): BatchListingGroup[] {
  const available = new Map<string, number[]>();
  for (const card of rows) {
    if (card.status !== "owned" || card.held || card.reserved) continue;
    const key = groupKey(card);
    const ids = available.get(key) ?? [];
    ids.push(card.id);
    available.set(key, ids);
  }
  return cells.flatMap((cell) => {
    const cardIds = available.get(groupKey(cell));
    return cardIds?.length
      ? [
          {
            catalogId: cell.catalogId,
            series: cell.series,
            character: cell.character,
            rarity: cell.rarity,
            cardIds: cardIds.sort((a, b) => a - b),
          },
        ]
      : [];
  });
}

const groupLabel = (group: BatchListingGroup) =>
  `${group.series} ${group.character} ${group.rarity}`;

interface Preview {
  input: BatchListingInput;
  lines: { label: string; qty: number }[];
}

export function BatchListing({
  groups,
  disabled,
  onReload,
}: {
  groups: BatchListingGroup[];
  disabled: boolean;
  onReload: () => Promise<boolean>;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [status, setStatus] =
    useState<BatchListingInput["status"]>("for_trade");
  const [quantities, setQuantities] = useState<Record<number, string>>({});
  const [price, setPrice] = useState("");
  const [want, setWant] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [needsRefresh, setNeedsRefresh] = useState(false);
  const [success, setSuccess] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);

  const quantity = (group: BatchListingGroup) =>
    Number(quantities[group.catalogId] || 0);
  const invalidQuantity = (group: BatchListingGroup) =>
    !Number.isSafeInteger(quantity(group)) ||
    quantity(group) < 0 ||
    quantity(group) > group.cardIds.length;
  const selected = groups.filter((group) => quantity(group) > 0);
  const total = selected.reduce((sum, group) => sum + quantity(group), 0);
  const tooMany = total > MAX_CARD_BATCH_SIZE;
  const priceInvalid =
    status === "for_sale" &&
    price.trim() !== "" &&
    (!/^\d+(?:\.\d{1,2})?$/.test(price.trim()) ||
      !Number.isFinite(Number(price)));
  const valid =
    total > 0 &&
    !tooMany &&
    !groups.some(invalidQuantity) &&
    !priceInvalid &&
    want.length <= 1000;

  const changeOpen = (next: boolean) => {
    if (submitting.current) return;
    setOpen(next);
    if (next) {
      setQuantities({});
      setPreview(null);
      setError(null);
      setNeedsRefresh(false);
      setSuccess(null);
    }
  };

  const review = () => {
    if (!valid || needsRefresh) return;
    try {
      const input = parseBatchListingInput({
        status,
        cards: selected.flatMap((group) =>
          group.cardIds
            .slice(0, quantity(group))
            .map((cardId) => ({ cardId, catalogId: group.catalogId })),
        ),
        ...(status === "for_sale"
          ? { askingPrice: price.trim() ? Number(price) : null }
          : { wantInReturn: want.trim() || null }),
      });
      setError(null);
      setPreview({
        input,
        lines: selected.map((group) => ({
          label: groupLabel(group),
          qty: quantity(group),
        })),
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  };

  const refresh = async () => {
    if (submitting.current) return;
    submitting.current = true;
    setBusy(true);
    try {
      if (await onReload()) {
        setQuantities({});
        setPreview(null);
        setNeedsRefresh(false);
        setError(null);
      } else {
        setError("無法更新庫存，請稍後再試。");
      }
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  };

  const submit = async () => {
    if (!preview || submitting.current || needsRefresh || success !== null)
      return;
    submitting.current = true;
    setBusy(true);
    setError(null);
    try {
      const result = await postBatchListing(preview.input);
      setSuccess(result.count);
      setPreview(null);
      if (!(await onReload())) {
        setNeedsRefresh(true);
        setError("上架已完成，但清單更新失敗。請重新整理庫存。");
      }
    } catch (caught) {
      // Keep the exact reviewed IDs after an uncertain response. Refreshing
      // clears quantities, so a retry cannot silently select more copies.
      setNeedsRefresh(true);
      setError(
        caught instanceof ApiError && caught.status === 409
          ? caught.message
          : "無法確認上架結果。請重新整理庫存，確認卡片狀態後再操作。",
      );
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={changeOpen}>
      <SheetTrigger asChild>
        <Button type="button" disabled={disabled}>
          <Upload data-icon="inline-start" />
          批次上架
        </Button>
      </SheetTrigger>
      <SheetContent
        className="data-[side=right]:w-full data-[side=right]:sm:max-w-2xl"
        showCloseButton={!busy}
      >
        <SheetHeader className="pr-12">
          <SheetTitle>
            {success !== null
              ? "上架完成"
              : preview
                ? "確認批次上架"
                : "批次上架"}
          </SheetTitle>
          <SheetDescription>
            沿用目前篩選，只列出尚未上架、未保留、未被預約的卡片。每批最多{" "}
            {MAX_CARD_BATCH_SIZE} 張。
          </SheetDescription>
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
          <div className="flex flex-col gap-5">
            {error ? (
              <Alert variant="destructive">
                <AlertTitle>
                  {success !== null ? "清單尚未更新" : "請確認庫存"}
                </AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}
            {needsRefresh ? (
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => void refresh()}
              >
                重新整理庫存
              </Button>
            ) : null}
            {success !== null ? (
              <Alert>
                <AlertTitle>已上架 {success} 張卡片</AlertTitle>
                <AlertDescription>
                  可到前台「交易 → 交易看板」查看。
                </AlertDescription>
              </Alert>
            ) : preview ? (
              <>
                <Alert>
                  <AlertTitle>
                    {preview.input.status === "for_sale" ? "待售" : "待換"} ·{" "}
                    {preview.lines.length} 種 · 共 {preview.input.cards.length}{" "}
                    張
                  </AlertTitle>
                  <AlertDescription>
                    {preview.input.status === "for_sale"
                      ? preview.input.askingPrice == null
                        ? "每張價格面議"
                        : `每張 ${preview.input.askingPrice} 元`
                      : preview.input.wantInReturn
                        ? `想換：${preview.input.wantInReturn}`
                        : "開放出價"}
                  </AlertDescription>
                </Alert>
                <Table aria-label="批次上架預覽">
                  <TableHeader>
                    <TableRow>
                      <TableHead>卡片</TableHead>
                      <TableHead className="text-right">上架張數</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {preview.lines.map((line) => (
                      <TableRow key={line.label}>
                        <TableCell className="whitespace-normal">
                          {line.label}
                        </TableCell>
                        <TableCell className="text-right">{line.qty}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                <p className="text-sm text-muted-foreground">
                  確認後會公開到交易看板。若庫存已變動，整批取消，重新選擇後再送出。
                </p>
              </>
            ) : groups.length === 0 ? (
              <Empty>
                <EmptyHeader>
                  <EmptyTitle>目前篩選下沒有可上架的卡片</EmptyTitle>
                  <EmptyDescription>
                    請調整篩選；已上架、保留或預約中的卡片不會列入。
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : (
              <FieldGroup>
                <Field data-disabled={busy || needsRefresh}>
                  <FieldLabel id={`${id}-status`}>上架方式</FieldLabel>
                  <ToggleGroup
                    type="single"
                    variant="outline"
                    value={status}
                    aria-labelledby={`${id}-status`}
                    disabled={busy || needsRefresh}
                    onValueChange={(value) => {
                      if (value === "for_sale" || value === "for_trade")
                        setStatus(value);
                    }}
                  >
                    <ToggleGroupItem value="for_trade">待換</ToggleGroupItem>
                    <ToggleGroupItem value="for_sale">待售</ToggleGroupItem>
                  </ToggleGroup>
                </Field>
                {status === "for_sale" ? (
                  <Field
                    data-invalid={priceInvalid}
                    data-disabled={busy || needsRefresh}
                  >
                    <FieldLabel htmlFor={`${id}-price`}>
                      統一售價（每張 / TWD）
                    </FieldLabel>
                    <Input
                      id={`${id}-price`}
                      type="number"
                      min={0}
                      step="0.01"
                      inputMode="decimal"
                      value={price}
                      disabled={busy || needsRefresh}
                      aria-invalid={priceInvalid}
                      onChange={(event) => setPrice(event.target.value)}
                      placeholder="選填，留空表示價格面議"
                    />
                    <FieldDescription>
                      套用至本批所有卡片；不同價格可分批上架。
                    </FieldDescription>
                    {priceInvalid ? (
                      <FieldError>
                        請填入 0 以上、最多兩位小數的金額。
                      </FieldError>
                    ) : null}
                  </Field>
                ) : (
                  <Field data-disabled={busy || needsRefresh}>
                    <FieldLabel htmlFor={`${id}-want`}>統一交換條件</FieldLabel>
                    <Input
                      id={`${id}-want`}
                      value={want}
                      maxLength={1000}
                      disabled={busy || needsRefresh}
                      onChange={(event) => setWant(event.target.value)}
                      placeholder="選填，例如想換 Rei UR；留空表示開放出價"
                    />
                  </Field>
                )}
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    disabled={busy || needsRefresh}
                    onClick={() =>
                      setQuantities(
                        Object.fromEntries(
                          groups.map((group) => [
                            group.catalogId,
                            String(group.cardIds.length),
                          ]),
                        ),
                      )
                    }
                  >
                    全部填滿
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    disabled={busy || needsRefresh}
                    onClick={() => setQuantities({})}
                  >
                    清空數量
                  </Button>
                </div>
                <FieldDescription>
                  每款填入要上架的張數，0
                  表示不選。同款依實體卡編號由小到大選取。
                </FieldDescription>
                <FieldGroup className="gap-4">
                  {groups.map((group) => (
                    <Field
                      key={group.catalogId}
                      data-invalid={invalidQuantity(group)}
                      data-disabled={busy || needsRefresh}
                    >
                      <FieldLabel htmlFor={`${id}-qty-${group.catalogId}`}>
                        {groupLabel(group)}
                      </FieldLabel>
                      <div className="flex flex-wrap items-center gap-3">
                        <Input
                          className="w-24"
                          id={`${id}-qty-${group.catalogId}`}
                          type="number"
                          min={0}
                          max={group.cardIds.length}
                          step={1}
                          inputMode="numeric"
                          value={quantities[group.catalogId] ?? "0"}
                          disabled={busy || needsRefresh}
                          aria-invalid={invalidQuantity(group)}
                          onChange={(event) =>
                            setQuantities((current) => ({
                              ...current,
                              [group.catalogId]: event.target.value,
                            }))
                          }
                        />
                        <span className="text-sm text-muted-foreground">
                          可上架 {group.cardIds.length} 張
                        </span>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          disabled={busy || needsRefresh}
                          aria-label={`全部上架 ${groupLabel(group)}`}
                          onClick={() =>
                            setQuantities((current) => ({
                              ...current,
                              [group.catalogId]: String(group.cardIds.length),
                            }))
                          }
                        >
                          全部
                        </Button>
                      </div>
                      {invalidQuantity(group) ? (
                        <FieldError>
                          請填入 0 至 {group.cardIds.length} 的整數。
                        </FieldError>
                      ) : null}
                    </Field>
                  ))}
                </FieldGroup>
              </FieldGroup>
            )}
          </div>
        </div>
        <SheetFooter>
          {success === null && !preview ? (
            <output aria-live="polite">
              已選 {selected.length} 種 · {total} / {MAX_CARD_BATCH_SIZE} 張
            </output>
          ) : null}
          {tooMany && !preview && success === null ? (
            <FieldError>
              每批最多 {MAX_CARD_BATCH_SIZE} 張，請減少數量或分批上架。
            </FieldError>
          ) : null}
          <div className="flex flex-wrap justify-end gap-2">
            {success !== null ? (
              <Button
                type="button"
                disabled={busy}
                onClick={() => changeOpen(false)}
              >
                完成
              </Button>
            ) : preview ? (
              <>
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy}
                  onClick={() => setPreview(null)}
                >
                  返回修改
                </Button>
                <Button
                  type="button"
                  disabled={busy || needsRefresh}
                  onClick={() => void submit()}
                >
                  {busy ? (
                    <LoaderCircle
                      data-icon="inline-start"
                      className="animate-spin"
                    />
                  ) : null}
                  {busy
                    ? "上架中…"
                    : `確認上架 ${preview.input.cards.length} 張`}
                </Button>
              </>
            ) : (
              <>
                <Button
                  type="button"
                  variant="ghost"
                  disabled={busy}
                  onClick={() => changeOpen(false)}
                >
                  取消
                </Button>
                <Button
                  type="button"
                  disabled={!valid || busy || needsRefresh}
                  onClick={review}
                >
                  預覽上架
                </Button>
              </>
            )}
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
