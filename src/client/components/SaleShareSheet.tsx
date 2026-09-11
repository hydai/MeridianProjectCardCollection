import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { todayLocal } from "@/lib/date";
import { type ListingGroup, listingTerms } from "@/lib/market-listings";
import { type SaleImageColumns, renderSaleImage } from "@/lib/sale-image";
import { DownloadIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { type Matrix, RARITIES } from "../collection";

export function SaleShareSheet({
  groups,
  m,
}: { groups: ListingGroup[]; m?: Matrix | null }) {
  const [columns, setColumns] = useState<SaleImageColumns>(8);
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{
    url: string;
    width: number;
    height: number;
    missingImages: number;
    filename: string;
    groups: ListingGroup[];
    m: Matrix | null | undefined;
    columns: SaleImageColumns;
    attempt: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Never offer an old PNG while a newer filter, layout or catalog is rendering.
  const current =
    result?.groups === groups &&
    result.m === m &&
    result.columns === columns &&
    result.attempt === attempt
      ? result
      : null;

  useEffect(() => {
    const controller = new AbortController();
    let url: string | undefined;
    setError(null);
    const date = todayLocal();
    void renderSaleImage({
      groups,
      m,
      columns,
      date,
      source: window.location.host,
      signal: controller.signal,
    })
      .then((image) => {
        if (controller.signal.aborted) return;
        url = URL.createObjectURL(image.blob);
        const rarities = RARITIES.filter((rarity) =>
          groups.some((group) => group.item.rarity === rarity),
        );
        setResult({
          ...image,
          url,
          filename: `待售清單-${rarities.join("-")}-${date}.png`,
          groups,
          m,
          columns,
          attempt,
        });
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted)
          setError(
            reason instanceof Error ? reason.message : "圖片產生失敗，請重試。",
          );
      });
    return () => {
      controller.abort();
      if (url) URL.revokeObjectURL(url);
    };
  }, [groups, m, columns, attempt]);

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">每排張數</span>
          <ToggleGroup
            type="single"
            variant="outline"
            size="sm"
            value={String(columns)}
            onValueChange={(value) => {
              if (value) setColumns(Number(value) as SaleImageColumns);
            }}
            aria-label="分享圖片每排張數"
          >
            {[6, 8, 10].map((value) => (
              <ToggleGroupItem key={value} value={String(value)}>
                {value}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>
        {current ? (
          <Button asChild>
            <a href={current.url} download={current.filename}>
              <DownloadIcon data-icon="inline-start" />
              匯出 PNG
            </a>
          </Button>
        ) : (
          <Button disabled>
            <DownloadIcon data-icon="inline-start" />
            匯出 PNG
          </Button>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        完整清單會匯出成一張圖片。增加每排張數可縮短圖片；點擊預覽可開啟原圖，手機也可長按儲存。
      </p>
      {error ? (
        <Alert variant="destructive">
          <AlertTitle>無法產生分享圖片</AlertTitle>
          <AlertDescription>
            {error}
            <Button
              variant="outline"
              onClick={() => setAttempt((value) => value + 1)}
            >
              重試
            </Button>
          </AlertDescription>
        </Alert>
      ) : current ? (
        <>
          <output className="text-xs text-muted-foreground">
            {current.width} × {current.height} px · PNG
            {current.missingImages > 0
              ? ` · ${current.missingImages} 筆卡圖未提供或載入失敗，已保留文字資訊。`
              : ""}
          </output>
          <a
            href={current.url}
            target="_blank"
            rel="noreferrer"
            aria-label="開啟待售清單原圖"
          >
            <img
              src={current.url}
              width={current.width}
              height={current.height}
              alt="待售清單分享圖片，卡片明細如下"
              className="h-auto max-h-[75vh] w-full rounded-lg border border-border object-contain"
            />
          </a>
        </>
      ) : (
        <output className="py-10 text-center text-sm text-muted-foreground">
          正在載入卡圖並產生完整預覽…
        </output>
      )}
      <ul className="sr-only" aria-label="待售分享卡片明細">
        {groups.map((group) => (
          <li key={group.key}>
            {group.item.character} · {group.item.series} · {group.item.rarity} ·{" "}
            {listingTerms(group.item)}
            {group.item.askingPrice == null ? "" : "／張"} · 可售{" "}
            {group.quantity - group.reserved} 張 · 預約 {group.reserved} 張
            {group.item.note ? ` · ${group.item.note}` : ""}
          </li>
        ))}
      </ul>
    </div>
  );
}
