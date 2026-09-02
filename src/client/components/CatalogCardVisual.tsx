import { cn } from "@/lib/utils";
import { ImageOffIcon } from "lucide-react";
import { useState } from "react";

export function CatalogCardVisual({
  src,
  alt,
  className,
  emptyLabel = "尚無卡面",
}: {
  src?: string | null;
  alt: string;
  className?: string;
  emptyLabel?: string | false;
}) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const hasImage = Boolean(src && failedSrc !== src);

  return (
    <div
      className={cn(
        "relative flex aspect-[5/7] items-center justify-center overflow-hidden rounded-md border border-border bg-muted/35",
        className,
      )}
    >
      {hasImage ? (
        <img
          src={src ?? undefined}
          alt={alt}
          loading="lazy"
          decoding="async"
          className="size-full object-contain"
          onError={() => src && setFailedSrc(src)}
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
