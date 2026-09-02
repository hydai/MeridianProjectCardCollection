export const CATALOG_IMAGE_MAX_BYTES = 15 * 1024 * 1024;

export const CATALOG_IMAGE_CONTENT_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
] as const;

export type CatalogImageContentType =
  (typeof CATALOG_IMAGE_CONTENT_TYPES)[number];

export const CATALOG_IMAGE_ACCEPT = CATALOG_IMAGE_CONTENT_TYPES.join(",");

export function isCatalogImageContentType(
  value: string,
): value is CatalogImageContentType {
  return CATALOG_IMAGE_CONTENT_TYPES.some((candidate) => candidate === value);
}

export function catalogImageExtension(
  contentType: CatalogImageContentType,
): string {
  switch (contentType) {
    case "image/jpeg":
      return "jpg";
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    case "image/avif":
      return "avif";
  }
}
