import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  CameraIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ImageIcon,
  ImageOffIcon,
  SearchIcon,
  Trash2Icon,
  TriangleAlertIcon,
  UploadIcon,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CATALOG_IMAGE_ACCEPT,
  CATALOG_IMAGE_MAX_BYTES,
  isCatalogImageContentType,
} from "../../shared/catalog-media";
import type { CatalogMediaEntry } from "../../shared/types";
import { deleteCatalogImage, fetchCatalogMedia, putCatalogImage } from "../api";
import { CONTROL } from "./ui";

type PresenceFilter = "missing" | "ready" | "all";

const PAGE_SIZE = 24;

const PRESENCE_FILTERS: Array<{ id: PresenceFilter; label: string }> = [
  { id: "missing", label: "待補圖" },
  { id: "ready", label: "已有圖" },
  { id: "all", label: "全部" },
];

function isPresenceFilter(value: string): value is PresenceFilter {
  return PRESENCE_FILTERS.some((filter) => filter.id === value);
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatUpdatedAt(value: string): string {
  const normalized = value.includes("T")
    ? value
    : `${value.replace(" ", "T")}Z`;
  const date = new Date(normalized);
  if (Number.isNaN(date.valueOf())) return value;
  return new Intl.DateTimeFormat("zh-TW", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function cardIdentity(entry: CatalogMediaEntry): string {
  return `${entry.series} ${entry.character} ${entry.rarity}`;
}

function CatalogMediaRow({
  entry,
  busy,
  disabled,
  inputRef,
  onChoose,
  onUpload,
  onDelete,
}: {
  entry: CatalogMediaEntry;
  busy: boolean;
  disabled: boolean;
  inputRef: (node: HTMLInputElement | null) => void;
  onChoose: () => void;
  onUpload: (file: File) => void;
  onDelete: () => void;
}) {
  const identity = cardIdentity(entry);
  const inputId = `catalog-image-${entry.catalogId}`;

  return (
    <li className="grid grid-cols-[64px_minmax(0,1fr)_auto] items-center gap-4 border-b border-border px-4 py-3 last:border-b-0 max-[680px]:grid-cols-[54px_minmax(0,1fr)] max-[680px]:gap-3">
      <div className="flex aspect-[5/7] w-16 items-center justify-center overflow-hidden rounded-md border border-border bg-muted/35 max-[680px]:w-[54px]">
        {entry.front ? (
          <img
            src={entry.front.url}
            alt={`${identity} 卡面`}
            loading="lazy"
            decoding="async"
            className="size-full object-contain"
          />
        ) : (
          <ImageOffIcon className="size-5 text-muted-foreground" aria-hidden />
        )}
      </div>

      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <strong className="font-serif text-[15px] font-medium text-foreground">
            {entry.character}
          </strong>
          <Badge variant="outline" className="font-mono">
            {entry.rarity}
          </Badge>
          <Badge variant={entry.front ? "secondary" : "outline"}>
            {entry.front ? "已有圖" : "待補圖"}
          </Badge>
        </div>
        {entry.front ? (
          <p className="mt-1 truncate text-xs text-muted-foreground">
            {entry.front.originalFilename ?? "未記錄檔名"} ·{" "}
            {formatBytes(entry.front.byteSize)} ·{" "}
            {formatUpdatedAt(entry.front.updatedAt)}
          </p>
        ) : (
          <p className="mt-1 text-xs text-muted-foreground">尚未上傳正面卡圖</p>
        )}
      </div>

      <div className="flex flex-wrap justify-end gap-2 max-[680px]:col-span-2 max-[680px]:justify-start max-[680px]:pl-[66px]">
        <Input
          ref={inputRef}
          id={inputId}
          type="file"
          accept={CATALOG_IMAGE_ACCEPT}
          className="hidden"
          disabled={disabled}
          aria-label={`選擇 ${identity} 卡面`}
          onChange={(event) => {
            const file = event.currentTarget.files?.[0];
            if (file) onUpload(file);
          }}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled}
          onClick={onChoose}
        >
          <UploadIcon data-icon="inline-start" />
          {busy ? "處理中…" : entry.front ? "更換卡圖" : "上傳卡圖"}
        </Button>
        {entry.front ? (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                type="button"
                variant="destructive"
                size="sm"
                disabled={disabled}
              >
                <Trash2Icon data-icon="inline-start" />
                刪除
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>刪除這張卡圖？</AlertDialogTitle>
                <AlertDialogDescription>
                  {identity} 會回到待補圖清單，R2 中的原圖也會一併刪除。
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>取消</AlertDialogCancel>
                <AlertDialogAction variant="destructive" onClick={onDelete}>
                  確認刪除
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        ) : null}
      </div>
    </li>
  );
}

export function CatalogMedia() {
  const [entries, setEntries] = useState<CatalogMediaEntry[] | null>(null);
  const [presence, setPresence] = useState<PresenceFilter>("missing");
  const [series, setSeries] = useState("all");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const [busyCatalogId, setBusyCatalogId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const fileInputs = useRef(new Map<number, HTMLInputElement>());

  const load = useCallback(async () => {
    const rows = await fetchCatalogMedia();
    setEntries(rows);
    return rows;
  }, []);

  useEffect(() => {
    let active = true;
    fetchCatalogMedia()
      .then((rows) => {
        if (active) setEntries(rows);
      })
      .catch((caught) => {
        if (active) setError(String(caught));
      });
    return () => {
      active = false;
    };
  }, []);

  const seriesOptions = useMemo(
    () => [...new Set((entries ?? []).map((entry) => entry.series))],
    [entries],
  );
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const visible = useMemo(
    () =>
      (entries ?? []).filter((entry) => {
        if (presence === "missing" && entry.front) return false;
        if (presence === "ready" && !entry.front) return false;
        if (series !== "all" && entry.series !== series) return false;
        return cardIdentity(entry)
          .toLocaleLowerCase()
          .includes(normalizedQuery);
      }),
    [entries, normalizedQuery, presence, series],
  );
  const pageCount = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
  const pageEntries = visible.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const grouped = useMemo(() => {
    const groups = new Map<string, CatalogMediaEntry[]>();
    for (const entry of pageEntries) {
      const current = groups.get(entry.series) ?? [];
      current.push(entry);
      groups.set(entry.series, current);
    }
    return [...groups.entries()];
  }, [pageEntries]);
  const readyCount = (entries ?? []).filter((entry) => entry.front).length;
  const totalCount = entries?.length ?? 0;
  const percentage = totalCount
    ? Math.round((readyCount / totalCount) * 100)
    : 0;

  useEffect(() => {
    if (page >= pageCount) setPage(pageCount - 1);
  }, [page, pageCount]);

  const refreshAfterMutation = async () => {
    try {
      await load();
    } catch {
      setError("操作已完成，但卡圖清單未能重新載入；請重新整理頁面。");
    }
  };

  const handleUpload = async (entry: CatalogMediaEntry, file: File) => {
    if (!isCatalogImageContentType(file.type)) {
      setError("請選擇 JPEG、PNG、WebP 或 AVIF 圖片。");
      return;
    }
    if (file.size < 1 || file.size > CATALOG_IMAGE_MAX_BYTES) {
      setError("圖片必須大於 0 B，且不可超過 15 MB。");
      return;
    }

    setBusyCatalogId(entry.catalogId);
    setError(null);
    setMessage(null);
    try {
      await putCatalogImage(entry.catalogId, file);
      setMessage(`${cardIdentity(entry)} 的正面卡圖已儲存。`);
      await refreshAfterMutation();
    } catch (caught) {
      setError(String(caught));
    } finally {
      setBusyCatalogId(null);
    }
  };

  const handleDelete = async (entry: CatalogMediaEntry) => {
    setBusyCatalogId(entry.catalogId);
    setError(null);
    setMessage(null);
    try {
      await deleteCatalogImage(entry.catalogId);
      setMessage(`${cardIdentity(entry)} 的卡圖已刪除。`);
      await refreshAfterMutation();
    } catch (caught) {
      setError(String(caught));
    } finally {
      setBusyCatalogId(null);
    }
  };

  return (
    <section aria-labelledby="catalog-media-title" className="grid gap-5">
      <div>
        <h2 id="catalog-media-title" className="font-serif text-xl font-medium">
          卡圖資料
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          每個圖鑑卡位共用一張正面圖，不會綁定到某一張實體卡。
        </p>
      </div>

      <Alert>
        <CameraIcon />
        <AlertTitle>現在不用先把卡片全部拍完</AlertTitle>
        <AlertDescription>
          待補圖就是拍攝清單。之後可逐張上傳或更換；請先使用 JPEG、PNG、WebP 或
          AVIF，每張最多 15 MB。
        </AlertDescription>
      </Alert>

      {error ? (
        <Alert variant="destructive">
          <TriangleAlertIcon />
          <AlertTitle>卡圖操作失敗</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      {message ? (
        <Alert>
          <ImageIcon />
          <AlertTitle>{message}</AlertTitle>
        </Alert>
      ) : null}

      <Card className="ring-border">
        <CardHeader>
          <CardTitle>卡圖完成度</CardTitle>
          <CardDescription>
            {entries === null
              ? "載入圖鑑卡位中…"
              : `尚有 ${totalCount - readyCount} 種待補圖`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="mb-2 flex items-baseline justify-between gap-3">
            <strong className="font-mono text-lg font-medium">
              {readyCount} / {totalCount}
            </strong>
            <Badge variant="secondary">{percentage}%</Badge>
          </div>
          <Progress
            value={readyCount}
            max={Math.max(1, totalCount)}
            aria-label={`卡圖完成度 ${readyCount} / ${totalCount}`}
          />
        </CardContent>
      </Card>

      <Card className="ring-border">
        <CardHeader>
          <CardTitle>圖鑑卡位</CardTitle>
          <CardDescription>
            預設只列出待補圖；可依系列或角色縮小這次要處理的範圍。
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid grid-cols-[auto_minmax(160px,0.7fr)_minmax(220px,1fr)] items-end gap-3 max-[760px]:grid-cols-1">
            <Field>
              <FieldLabel id="catalog-media-presence-label">
                卡圖狀態
              </FieldLabel>
              <ToggleGroup
                type="single"
                variant="outline"
                spacing={1}
                value={presence}
                aria-labelledby="catalog-media-presence-label"
                onValueChange={(value) => {
                  if (isPresenceFilter(value)) {
                    setPresence(value);
                    setPage(0);
                  }
                }}
              >
                {PRESENCE_FILTERS.map((filter) => (
                  <ToggleGroupItem key={filter.id} value={filter.id}>
                    {filter.label}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </Field>

            <Field>
              <FieldLabel htmlFor="catalog-media-series">系列</FieldLabel>
              <select
                id="catalog-media-series"
                value={series}
                onChange={(event) => {
                  setSeries(event.target.value);
                  setPage(0);
                }}
                className={CONTROL}
              >
                <option value="all">全部系列</option>
                {seriesOptions.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </Field>

            <Field>
              <FieldLabel htmlFor="catalog-media-search">搜尋卡種</FieldLabel>
              <div className="relative">
                <SearchIcon className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="catalog-media-search"
                  value={query}
                  onChange={(event) => {
                    setQuery(event.target.value);
                    setPage(0);
                  }}
                  placeholder="系列、角色或稀有度"
                  className="pl-9"
                />
              </div>
              <FieldDescription>{visible.length} 種符合條件</FieldDescription>
            </Field>
          </div>

          {entries === null && !error ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              載入卡圖資料中…
            </div>
          ) : grouped.length === 0 ? (
            <Empty className="border py-10">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <ImageOffIcon />
                </EmptyMedia>
                <EmptyTitle>沒有符合條件的卡位</EmptyTitle>
                <EmptyDescription>
                  {presence === "ready"
                    ? "目前還沒有卡圖；切回待補圖即可開始整理。"
                    : "換個系列或搜尋條件再試一次。"}
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <div className="grid gap-5">
              {grouped.map(([seriesName, rows]) => (
                <section
                  key={seriesName}
                  aria-labelledby={`catalog-media-series-${rows[0].catalogId}`}
                  className="overflow-hidden rounded-lg border border-border"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-muted/30 px-4 py-3">
                    <h3
                      id={`catalog-media-series-${rows[0].catalogId}`}
                      className="font-serif text-[15px] font-medium"
                    >
                      {seriesName}
                    </h3>
                    <span className="text-xs text-muted-foreground">
                      第 {rows[0].volume} 彈 · 本頁 {rows.length} 種
                    </span>
                  </div>
                  <ul>
                    {rows.map((entry) => (
                      <CatalogMediaRow
                        key={entry.catalogId}
                        entry={entry}
                        busy={busyCatalogId === entry.catalogId}
                        disabled={busyCatalogId !== null}
                        inputRef={(node) => {
                          if (node)
                            fileInputs.current.set(entry.catalogId, node);
                          else fileInputs.current.delete(entry.catalogId);
                        }}
                        onChoose={() => {
                          const input = fileInputs.current.get(entry.catalogId);
                          if (!input) return;
                          // Clear before opening the picker so choosing the
                          // same file again still emits a change event.
                          input.value = "";
                          input.click();
                        }}
                        onUpload={(file) => handleUpload(entry, file)}
                        onDelete={() => handleDelete(entry)}
                      />
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          )}

          {visible.length > PAGE_SIZE ? (
            <nav
              aria-label="卡圖清單分頁"
              className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4"
            >
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={page === 0 || busyCatalogId !== null}
                onClick={() => setPage((current) => Math.max(0, current - 1))}
              >
                <ChevronLeftIcon data-icon="inline-start" />
                上一頁
              </Button>
              <span className="text-center text-xs text-muted-foreground">
                第 {page + 1} / {pageCount} 頁 · 目前顯示 {page * PAGE_SIZE + 1}
                –{Math.min((page + 1) * PAGE_SIZE, visible.length)}，共{" "}
                {visible.length} 種
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={page >= pageCount - 1 || busyCatalogId !== null}
                onClick={() =>
                  setPage((current) => Math.min(pageCount - 1, current + 1))
                }
              >
                下一頁
                <ChevronRightIcon data-icon="inline-end" />
              </Button>
            </nav>
          ) : null}
        </CardContent>
      </Card>
    </section>
  );
}
