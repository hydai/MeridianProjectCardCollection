import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
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
import { useId, useRef, useState } from "react";
import { parseBatchPriceInput } from "../../shared/batch-price";
import { MAX_CARD_BATCH_SIZE } from "../../shared/card-batch";
import type {
  BatchPriceInput,
  CardRow,
  OverviewCell,
} from "../../shared/types";
import { postBatchPrice } from "../api";

const key = (card: Pick<CardRow, "series" | "character" | "rarity">) =>
  JSON.stringify([card.series, card.character, card.rarity]);
const priceLabel = (price: number | null) =>
  price === null ? "面議" : `${price} 元`;

export function batchPriceCards(rows: CardRow[], cells: OverviewCell[]) {
  const catalog = new Map(cells.map((cell) => [key(cell), cell.catalogId]));
  return rows.flatMap((card) => {
    const catalogId = catalog.get(key(card));
    return card.status === "for_sale" &&
      !card.held &&
      !card.reserved &&
      catalogId
      ? [
          {
            cardId: card.id,
            catalogId,
            currentPrice: card.askingPrice,
            label: `${card.series} · ${card.character} · ${card.rarity}`,
          },
        ]
      : [];
  });
}
type PriceCard = ReturnType<typeof batchPriceCards>[number];
function priceLines(cards: PriceCard[]) {
  const groups = new Map<
    string,
    { label: string; currentPrice: number | null; quantity: number }
  >();
  for (const card of cards) {
    const key = JSON.stringify([card.catalogId, card.currentPrice]);
    const group = groups.get(key);
    if (group) group.quantity++;
    else
      groups.set(key, {
        label: card.label,
        currentPrice: card.currentPrice,
        quantity: 1,
      });
  }
  return [...groups.entries()];
}

export function BatchPrice({
  cards,
  disabled,
  onReload,
}: {
  cards: PriceCard[];
  disabled: boolean;
  onReload: () => Promise<boolean>;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [price, setPrice] = useState("");
  const [preview, setPreview] = useState<{
    input: BatchPriceInput;
    lines: ReturnType<typeof priceLines>;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [needsRefresh, setNeedsRefresh] = useState(false);
  const [success, setSuccess] = useState<number | null>(null);
  const validPrice =
    /^\d+(?:\.\d{1,2})?$/.test(price.trim()) &&
    Number.isFinite(Number(price)) &&
    /^\d+(?:\.\d{1,2})?$/.test(String(Number(price)));
  const changed = validPrice
    ? cards.filter((card) => card.currentPrice !== Number(price))
    : [];
  const valid =
    validPrice && changed.length > 0 && changed.length <= MAX_CARD_BATCH_SIZE;

  const changeOpen = (value: boolean) => {
    if (submitting.current) return;
    setOpen(value);
    if (value) {
      setPrice("");
      setPreview(null);
      setError(null);
      setSuccess(null);
    }
  };
  const review = () => {
    if (!valid || needsRefresh) return;
    const input = parseBatchPriceInput({
      askingPrice: Number(price),
      cards: changed,
    });
    setPreview({ input, lines: priceLines(changed) });
  };
  const refresh = async () => {
    if (submitting.current) return;
    submitting.current = true;
    setBusy(true);
    try {
      if (await onReload()) {
        setNeedsRefresh(false);
        setPreview(null);
        setError(null);
      } else setError("無法更新清單，請稍後再試。");
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
      const result = await postBatchPrice(preview.input);
      setSuccess(result.count);
      setPreview(null);
      if (!(await onReload())) {
        setNeedsRefresh(true);
        setError("改價已完成，但清單更新失敗。請重新整理。");
      }
    } catch (caught) {
      setNeedsRefresh(true);
      setError(
        `${caught instanceof Error ? caught.message : String(caught)} 請重新整理並確認目前售價後再操作。`,
      );
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={changeOpen}>
      <SheetTrigger asChild>
        <Button type="button" variant="outline" disabled={disabled}>
          批次改價
        </Button>
      </SheetTrigger>
      <SheetContent
        className="data-[side=right]:w-full data-[side=right]:sm:max-w-2xl"
        showCloseButton={!busy}
      >
        <SheetHeader className="pr-12">
          <SheetTitle>
            {success !== null
              ? "改價完成"
              : preview
                ? "確認批次改價"
                : "批次改價"}
          </SheetTitle>
          <SheetDescription>
            沿用目前篩選，統一調整待售卡片的每張售價。保留及預約中的卡片不列入，每批最多{" "}
            {MAX_CARD_BATCH_SIZE} 張。
          </SheetDescription>
        </SheetHeader>
        <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-4 pb-4">
          {error ? (
            <Alert variant="destructive">
              <AlertTitle>請確認售價</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
          {needsRefresh ? (
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => void refresh()}
            >
              重新整理清單
            </Button>
          ) : null}
          {success !== null ? (
            <Alert>
              <AlertTitle>已更新 {success} 張卡片的售價</AlertTitle>
              <AlertDescription>
                待售清單與分享圖片會使用新的價格。
              </AlertDescription>
            </Alert>
          ) : preview ? (
            <>
              <Alert>
                <AlertTitle>
                  共 {preview.input.cards.length} 張，每張{" "}
                  {preview.input.askingPrice} 元
                </AlertTitle>
                <AlertDescription>
                  售價會公開到交易看板。以下卡片會一起更新，並記錄原售價與新售價。
                </AlertDescription>
              </Alert>
              <Table aria-label="批次改價預覽">
                <TableHeader>
                  <TableRow>
                    <TableHead>卡片</TableHead>
                    <TableHead>張數</TableHead>
                    <TableHead>原售價</TableHead>
                    <TableHead>新售價</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {preview.lines.map(([key, line]) => (
                    <TableRow key={key}>
                      <TableCell className="whitespace-normal">
                        {line.label}
                      </TableCell>
                      <TableCell>{line.quantity}</TableCell>
                      <TableCell>{priceLabel(line.currentPrice)}</TableCell>
                      <TableCell>
                        {priceLabel(preview.input.askingPrice)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </>
          ) : (
            <>
              <p className="text-sm">
                目前篩選下有 {cards.length} 張可改價的待售卡片。
              </p>
              {cards.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  請先篩選待售狀態與想調整的稀有度，例如 SSR。
                </p>
              ) : (
                <FieldGroup>
                  <Field data-invalid={price !== "" && !validPrice}>
                    <FieldLabel htmlFor={id}>新售價（TWD／張）</FieldLabel>
                    <Input
                      id={id}
                      type="number"
                      min={0}
                      step="0.01"
                      inputMode="decimal"
                      value={price}
                      disabled={busy || needsRefresh}
                      aria-invalid={price !== "" && !validPrice}
                      onChange={(event) => setPrice(event.target.value)}
                      placeholder="例如 200"
                    />
                    <FieldDescription>
                      已經是新售價的卡片會自動略過。
                    </FieldDescription>
                    {price !== "" && !validPrice ? (
                      <FieldError>
                        請填寫 0 以上、最多兩位小數的金額。
                      </FieldError>
                    ) : null}
                  </Field>
                  {validPrice ? (
                    <p className="text-sm">
                      將更新 {changed.length} 張；
                      {cards.length - changed.length} 張售價相同，無需更新。
                    </p>
                  ) : null}
                  {changed.length > MAX_CARD_BATCH_SIZE ? (
                    <FieldError>
                      超過 {MAX_CARD_BATCH_SIZE}{" "}
                      張，請縮小系列或角色篩選後再試。
                    </FieldError>
                  ) : null}
                </FieldGroup>
              )}
            </>
          )}
        </div>
        <SheetFooter>
          {success !== null ? (
            <Button onClick={() => changeOpen(false)} disabled={busy}>
              完成
            </Button>
          ) : preview ? (
            <>
              <Button
                onClick={() => void submit()}
                disabled={busy || needsRefresh}
              >
                {busy ? "更新中…" : "確認更新售價"}
              </Button>
              <Button
                variant="outline"
                onClick={() => setPreview(null)}
                disabled={busy || needsRefresh}
              >
                返回修改
              </Button>
            </>
          ) : (
            <Button onClick={review} disabled={!valid || busy || needsRefresh}>
              預覽改價
            </Button>
          )}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
