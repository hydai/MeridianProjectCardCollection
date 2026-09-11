import type { Rarity } from "../../shared/types";
import { type Matrix, RARITIES, getImage } from "../collection";
import { type ListingGroup, listingTerms } from "./market-listings";

export type SaleImageColumns = 6 | 8 | 10;

const TILE = 160;
const GAP = 12;
const MARGIN = 32;
const ART_WIDTH = 140;
const ART_HEIGHT = 196;
// Keep the whole PNG within conservative mobile canvas dimensions and memory.
const MAX_EDGE = 8192;
const MAX_PIXELS = 16_000_000;
const FONT =
  'system-ui, -apple-system, "PingFang TC", "Microsoft JhengHei", sans-serif';

type TextLine = { text: string; size: number; color: string; bold?: boolean };
type Tile = { group: ListingGroup; lines: TextLine[]; height: number };

function wrapText(ctx: CanvasRenderingContext2D, text: string, width: number) {
  const lines: string[] = [];
  for (const paragraph of text.split(/\r?\n/)) {
    let line = "";
    for (const word of paragraph.split(/(\s+)/)) {
      if (!line && !word.trim()) continue;
      if (line && ctx.measureText(line + word).width > width) {
        lines.push(line.trimEnd());
        line = "";
      }
      // Keep Latin words together; wrap long words and unspaced CJK safely.
      for (const character of line ? word : word.trimStart()) {
        if (line && ctx.measureText(line + character).width > width) {
          lines.push(line);
          line = "";
        }
        line += character;
      }
    }
    lines.push(line);
  }
  return lines;
}

function loadImage(
  src: string,
  signal: AbortSignal,
): Promise<HTMLImageElement | null> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const finish = (loaded: boolean, aborted = false) => {
      clearTimeout(timer);
      signal.removeEventListener("abort", abort);
      image.onload = null;
      image.onerror = null;
      if (!loaded) image.src = "";
      if (aborted) reject(new DOMException("Aborted", "AbortError"));
      else resolve(loaded ? image : null);
    };
    const abort = () => finish(false, true);
    const timer = setTimeout(() => finish(false), 12_000);
    image.crossOrigin = "anonymous";
    image.onload = () => finish(image.naturalWidth > 0);
    image.onerror = () => finish(false);
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) abort();
    else image.src = src;
  });
}

export async function renderSaleImage({
  groups,
  m,
  columns,
  date,
  source,
  signal,
}: {
  groups: ListingGroup[];
  m?: Matrix | null;
  columns: SaleImageColumns;
  date: string;
  source: string;
  signal: AbortSignal;
}): Promise<{
  blob: Blob;
  width: number;
  height: number;
  missingImages: number;
}> {
  if (!groups.length) throw new Error("目前沒有可匯出的待售卡片。");
  signal.throwIfAborted();
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("瀏覽器無法產生圖片，請換個瀏覽器再試。");
  const style = getComputedStyle(document.documentElement);
  const color = (name: string) => style.getPropertyValue(name).trim();
  const colors = {
    background: color("--bg"),
    card: color("--surface"),
    border: color("--border"),
    text: color("--text"),
    muted: color("--text-secondary"),
    gold: color("--primary"),
    reservation: color("--reservation"),
  };
  const tiles = groups.map((group): Tile => {
    const lines: TextLine[] = [];
    const add = (text: string, size: number, ink: string, bold = false) => {
      ctx.font = `${bold ? 600 : 400} ${size}px ${FONT}`;
      lines.push(
        ...wrapText(ctx, text, ART_WIDTH).map((text) => ({
          text,
          size,
          color: ink,
          bold,
        })),
      );
    };
    add(group.item.character, 16, colors.text, true);
    add(group.item.series, 12, colors.muted);
    add(
      `${listingTerms(group.item)}${group.item.askingPrice == null ? "" : "／張"}`,
      15,
      colors.gold,
      true,
    );
    add(`可售 ${group.quantity - group.reserved} 張`, 14, colors.text);
    if (group.reservedSale)
      add(`預約出售 ${group.reservedSale} 張`, 12, colors.reservation);
    if (group.reserved > group.reservedSale)
      add(
        `預約交換 ${group.reserved - group.reservedSale} 張`,
        12,
        colors.reservation,
      );
    if (group.item.note?.trim()) add(group.item.note.trim(), 12, colors.muted);
    return {
      group,
      lines,
      height:
        ART_HEIGHT + 26 + lines.reduce((sum, line) => sum + line.size + 5, 0),
    };
  });
  const sections: {
    rarity: Rarity;
    y: number;
    rows: { tiles: Tile[]; y: number; height: number }[];
  }[] = [];
  let height = 144;
  for (const rarity of RARITIES) {
    const matching = tiles.filter((tile) => tile.group.item.rarity === rarity);
    if (!matching.length) continue;
    const section = {
      rarity,
      y: height,
      rows: [] as { tiles: Tile[]; y: number; height: number }[],
    };
    height += 44;
    for (let i = 0; i < matching.length; i += columns) {
      const row = matching.slice(i, i + columns);
      const rowHeight = Math.max(...row.map((tile) => tile.height));
      section.rows.push({ tiles: row, y: height, height: rowHeight });
      height += rowHeight + GAP;
    }
    height += 16;
    sections.push(section);
  }
  height += 64;
  const width = MARGIN * 2 + columns * TILE + (columns - 1) * GAP;
  const scale = Math.min(
    2,
    MAX_EDGE / width,
    MAX_EDGE / height,
    Math.sqrt(MAX_PIXELS / (width * height)),
  );
  if (scale < 1)
    throw new Error("清單太長，請增加每排張數或減少稀有度後再匯出。");
  canvas.width = Math.floor(width * scale);
  canvas.height = Math.floor(height * scale);

  const sources = new Map<string, string | null>();
  for (const { group } of tiles) {
    const image = m
      ? getImage(
          m,
          m.series.indexOf(group.item.series),
          m.characters.indexOf(group.item.character),
          RARITIES.indexOf(group.item.rarity),
        )
      : null;
    sources.set(group.key, image?.thumbnailUrl ?? image?.url ?? null);
  }
  const images = new Map<string, HTMLImageElement | null>();
  const uniqueSources = [
    ...new Set(
      [...sources.values()].filter((src): src is string => Boolean(src)),
    ),
  ];
  try {
    // Bound concurrent decoding; many copies can share a single catalog image.
    for (let i = 0; i < uniqueSources.length; i += 8) {
      await Promise.all(
        uniqueSources
          .slice(i, i + 8)
          .map(async (src) => images.set(src, await loadImage(src, signal))),
      );
      signal.throwIfAborted();
    }
    ctx.scale(scale, scale);
    ctx.textBaseline = "top";
    ctx.fillStyle = colors.background;
    ctx.fillRect(0, 0, width, height);
    const text = (
      value: string,
      x: number,
      y: number,
      size: number,
      ink: string,
      bold = false,
    ) => {
      ctx.fillStyle = ink;
      ctx.font = `${bold ? 600 : 400} ${size}px ${FONT}`;
      ctx.fillText(value, x, y);
    };
    text("MERIDIAN PROJECT / CARD COLLECTION", MARGIN, 26, 13, colors.gold);
    text("待售清單", MARGIN, 54, 34, colors.text, true);
    const count = new Set(
      groups.map(({ item }) =>
        JSON.stringify([item.series, item.character, item.rarity]),
      ),
    ).size;
    const quantity = groups.reduce((sum, group) => sum + group.quantity, 0);
    const reserved = groups.reduce((sum, group) => sum + group.reserved, 0);
    text(
      `${sections.map((section) => section.rarity).join(" · ")}   /   ${count} 款 · ${quantity} 張   /   可售 ${quantity - reserved} 張 · 預約 ${reserved} 張`,
      MARGIN,
      104,
      15,
      colors.muted,
    );
    let missingImages = 0;
    for (const section of sections) {
      const ink = color(`--${section.rarity.toLowerCase()}-color`);
      ctx.fillStyle = ink;
      ctx.fillRect(MARGIN, section.y, 3, 24);
      text(section.rarity, MARGIN + 14, section.y + 1, 20, ink, true);
      ctx.fillStyle = colors.border;
      ctx.fillRect(MARGIN + 80, section.y + 12, width - MARGIN * 2 - 80, 1);
      for (const row of section.rows) {
        row.tiles.forEach((tile, index) => {
          const x = MARGIN + index * (TILE + GAP);
          ctx.fillStyle = colors.card;
          ctx.beginPath();
          ctx.roundRect(x, row.y, TILE, row.height, 8);
          ctx.fill();
          const src = sources.get(tile.group.key);
          const image = src ? images.get(src) : null;
          if (image) {
            const fit = Math.min(
              ART_WIDTH / image.naturalWidth,
              ART_HEIGHT / image.naturalHeight,
            );
            const w = image.naturalWidth * fit;
            const h = image.naturalHeight * fit;
            ctx.drawImage(
              image,
              x + 10 + (ART_WIDTH - w) / 2,
              row.y + 10 + (ART_HEIGHT - h) / 2,
              w,
              h,
            );
          } else {
            missingImages++;
            ctx.strokeStyle = colors.border;
            ctx.strokeRect(x + 10, row.y + 10, ART_WIDTH, ART_HEIGHT);
            text(
              src ? "卡圖載入失敗" : "尚無卡面",
              x + 30,
              row.y + 98,
              14,
              colors.muted,
            );
          }
          let y = row.y + ART_HEIGHT + 20;
          for (const line of tile.lines) {
            text(line.text, x + 10, y, line.size, line.color, line.bold);
            y += line.size + 5;
          }
        });
      }
    }
    text(`${date} · ${source}`, MARGIN, height - 54, 13, colors.muted);
    text(
      "單價以新臺幣計算 · 庫存與預約狀態以最新清單為準",
      MARGIN,
      height - 31,
      13,
      colors.muted,
    );
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (value) =>
          value
            ? resolve(value)
            : reject(new Error("圖片產生失敗，請減少稀有度後重試。")),
        "image/png",
      ),
    );
    signal.throwIfAborted();
    return { blob, width: canvas.width, height: canvas.height, missingImages };
  } finally {
    canvas.width = 0;
    canvas.height = 0;
  }
}
