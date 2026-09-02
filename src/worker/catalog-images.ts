import type { CatalogMediaSide } from "../shared/types";

export const CATALOG_IMAGE_OUTPUT_CONTENT_TYPE = "image/webp";

export const CATALOG_IMAGE_VARIANTS = {
  thumb: { width: 320, quality: 78 },
  card: { width: 960, quality: 82 },
} as const;

export type CatalogImageVariant = keyof typeof CATALOG_IMAGE_VARIANTS;

export function catalogImageVariant(
  value: string | undefined,
): CatalogImageVariant | null {
  if (value === undefined || value === "card") return "card";
  return value === "thumb" ? "thumb" : null;
}

export function catalogImageObjectKeys(
  catalogId: number,
  side: CatalogMediaSide,
  generation: string,
): Record<CatalogImageVariant, string> {
  const prefix = `catalog/${catalogId}/${side}/${generation}`;
  return {
    thumb: `${prefix}/thumb.webp`,
    card: `${prefix}/card.webp`,
  };
}

export function catalogImageObjectKeyForVariant(
  cardObjectKey: string,
  variant: CatalogImageVariant,
): string {
  if (variant === "card") return cardObjectKey;
  const suffix = "/card.webp";
  return cardObjectKey.endsWith(suffix)
    ? `${cardObjectKey.slice(0, -suffix.length)}/thumb.webp`
    : cardObjectKey;
}

export function catalogImageStoredObjectKeys(cardObjectKey: string): string[] {
  return [
    ...new Set([
      cardObjectKey,
      catalogImageObjectKeyForVariant(cardObjectKey, "thumb"),
    ]),
  ];
}

function streamFromBytes(bytes: ArrayBuffer): ReadableStream<Uint8Array> {
  const stream = new Response(bytes).body;
  if (!stream) throw new Error("image input stream is unavailable");
  return stream;
}

export async function validateCatalogImage(
  images: ImagesBinding,
  bytes: ArrayBuffer,
): Promise<void> {
  const info = await images.info(streamFromBytes(bytes));
  if (!("width" in info) || info.width < 1 || info.height < 1) {
    throw new Error("image dimensions are unavailable");
  }
}

export async function optimizeCatalogImage(
  images: ImagesBinding,
  bytes: ArrayBuffer,
  variant: CatalogImageVariant,
): Promise<ArrayBuffer> {
  const spec = CATALOG_IMAGE_VARIANTS[variant];
  const result = await images
    .input(streamFromBytes(bytes))
    .transform({ width: spec.width, fit: "scale-down" })
    .output({
      format: CATALOG_IMAGE_OUTPUT_CONTENT_TYPE,
      quality: spec.quality,
    });
  // R2 requires a stream with a known length. These buffers are bounded by the
  // fixed 320px/960px transformations, unlike the validated 15 MB upload input.
  return result.response().arrayBuffer();
}
