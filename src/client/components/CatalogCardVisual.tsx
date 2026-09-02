import { cn } from "@/lib/utils";
import { ImageOffIcon } from "lucide-react";
import { useState } from "react";

export function CatalogCardVisual({
  src,
  thumbnailSrc,
  sizes,
  alt,
  className,
  emptyLabel = "尚無卡面",
}: {
  src?: string | null;
  thumbnailSrc?: string | null;
  sizes?: string;
  alt: string;
  className?: string;
  emptyLabel?: string | false;
}) {
  const sourceKey = `${thumbnailSrc ?? ""}\n${src ?? ""}`;
  const [failedSourceKey, setFailedSourceKey] = useState<string | null>(null);
  const fallbackSrc = src ?? thumbnailSrc ?? undefined;
  const srcSet =
    src && thumbnailSrc && src !== thumbnailSrc
      ? `${thumbnailSrc} 320w, ${src} 960w`
      : undefined;
  const hasImage = Boolean(fallbackSrc && failedSourceKey !== sourceKey);

  return (
    <div
      className={cn(
        "relative flex aspect-[5/7] items-center justify-center overflow-hidden rounded-md border border-border bg-muted/35",
        className,
      )}
    >
      {hasImage ? (
        <img
          src={fallbackSrc}
          srcSet={srcSet}
          sizes={srcSet ? sizes : undefined}
          alt={alt}
          loading="lazy"
          decoding="async"
          className="size-full object-contain"
          onError={() => setFailedSourceKey(sourceKey)}
        />
      ) : (
        <div className="flex flex-col items-center gap-2 px-2 text-center text-muted-foreground">
          <ImageOffIcon className="size-5" aria-hidden />
          {emptyLabel ? (
            <span className="text-[10px] leading-tight">{emptyLabel}</span>
          ) : null}
        </div>
      )}
    </div>
  );
}
