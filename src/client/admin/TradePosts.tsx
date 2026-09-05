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
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
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
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  ArchiveIcon,
  ArrowRightIcon,
  CopyIcon,
  ExternalLinkIcon,
  FilePenLineIcon,
  HandshakeIcon,
  MegaphoneIcon,
  PlusIcon,
  SearchIcon,
  SendIcon,
  Trash2Icon,
  TriangleAlertIcon,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  AdminTradePost,
  SaveTradePostInput,
  TradePost,
  TradePostCandidate,
  TradePostDirection,
  TradePostLine,
} from "../../shared/types";
import {
  closeTradePost,
  deleteTradePost,
  fetchAdminTradePosts,
  fetchTradePostCandidates,
  postTradePost,
  publishTradePost,
  putTradePost,
} from "../api";
import {
  formatTradePostDate,
  tradePostStatusLabel,
  tradePostUrl,
} from "../views/TradePosts";
import { TradePostReservationForm } from "./TradePostReservationForm";

type Quantities = Record<string, number>;

interface EditorDraft {
  id: number | null;
  note: string;
  give: Quantities;
  want: Quantities;
  sourceGive: TradePostLine[];
  sourceWant: TradePostLine[];
}

const emptyEditor = (): EditorDraft => ({
  id: null,
  note: "",
  give: {},
  want: {},
  sourceGive: [],
  sourceWant: [],
});

const quantitiesFromLines = (lines: TradePostLine[]): Quantities =>
  Object.fromEntries(
    lines.flatMap((line) =>
      line.catalogId === null ? [] : [[String(line.catalogId), line.qty]],
    ),
  );

const editorFromPost = (post: TradePost): EditorDraft => ({
  id: post.id,
  note: post.note ?? "",
  give: quantitiesFromLines(post.give),
  want: quantitiesFromLines(post.want),
  sourceGive: post.give,
  sourceWant: post.want,
});

const lineInputs = (quantities: Quantities) =>
  Object.entries(quantities)
    .filter(([, qty]) => Number.isInteger(qty) && qty > 0)
    .map(([catalogId, qty]) => ({ catalogId: Number(catalogId), qty }))
    .sort((a, b) => a.catalogId - b.catalogId);

function mergedCandidates(
  available: TradePostCandidate[],
  source: TradePostLine[],
): TradePostCandidate[] {
  const byId = new Map(
    available.map((candidate) => [candidate.catalogId, candidate]),
  );
  for (const line of source) {
    if (line.catalogId !== null && !byId.has(line.catalogId)) {
      byId.set(line.catalogId, {
        catalogId: line.catalogId,
        series: line.series,
        character: line.character,
        rarity: line.rarity,
        availableQty: line.availableQty,
      });
    }
  }
  return [...byId.values()].sort(
    (a, b) =>
      a.series.localeCompare(b.series) ||
      a.character.localeCompare(b.character) ||
      a.rarity.localeCompare(b.rarity),
  );
}

function CandidateQuantityList({
  direction,
  candidates,
  quantities,
  opposite,
  onChange,
}: {
  direction: TradePostDirection;
  candidates: TradePostCandidate[];
  quantities: Quantities;
  opposite: Quantities;
  onChange: (catalogId: number, qty: number) => void;
}) {
  const [query, setQuery] = useState("");
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const visible = candidates.filter((candidate) =>
    `${candidate.series} ${candidate.character} ${candidate.rarity}`
      .toLocaleLowerCase()
      .includes(normalizedQuery),
  );
  const verb = direction === "give" ? "換出" : "徵求";

  if (candidates.length === 0) {
    return (
      <Empty className="border py-8">
        <EmptyHeader>
          <EmptyTitle>目前沒有可選卡種</EmptyTitle>
          <EmptyDescription>
            {direction === "give"
              ? "先將實體卡標記為可交換，才會出現在這裡。"
              : "先在卡片管理設定 Want，尚缺卡種才會出現在這裡。"}
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <Field>
        <FieldLabel htmlFor={`trade-post-${direction}-search`}>
          搜尋卡種
        </FieldLabel>
        <div className="relative">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground" />
          <Input
            id={`trade-post-${direction}-search`}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="系列、角色或稀有度"
            className="pl-9"
          />
        </div>
      </Field>

      {visible.length === 0 ? (
        <Empty className="border py-8">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <SearchIcon />
            </EmptyMedia>
            <EmptyTitle>找不到符合的卡種</EmptyTitle>
            <EmptyDescription>換個關鍵字再試一次。</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="max-h-[360px] overflow-y-auto rounded-lg border">
          {visible.map((candidate) => {
            const qty = quantities[String(candidate.catalogId)] ?? 0;
            const usedOpposite =
              (opposite[String(candidate.catalogId)] ?? 0) > 0;
            const stale = qty > candidate.availableQty;
            const id = `trade-post-${direction}-${candidate.catalogId}`;
            return (
              <Field
                key={candidate.catalogId}
                orientation="horizontal"
                className="items-center gap-3 border-b px-3 py-2.5 last:border-b-0"
                data-invalid={stale || undefined}
              >
                <div className="min-w-0 flex-1">
                  <FieldLabel htmlFor={id} className="flex-wrap">
                    <span>{candidate.character}</span>
                    <span className="font-normal text-muted-foreground">
                      {candidate.series}
                    </span>
                    <Badge variant="outline" className="font-mono">
                      {candidate.rarity}
                    </Badge>
                  </FieldLabel>
                  <FieldDescription>
                    {direction === "give" ? "目前可用" : "目前尚缺"}{" "}
                    {candidate.availableQty}
                    {usedOpposite
                      ? ` · 已列入${direction === "give" ? "徵求" : "換出"}`
                      : ""}
                    {stale ? " · 數量已失效，請調整後再發布" : ""}
                  </FieldDescription>
                </div>
                <Input
                  id={id}
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={99}
                  value={qty}
                  disabled={usedOpposite}
                  aria-label={`${candidate.series} ${candidate.character} ${candidate.rarity} ${verb}數量`}
                  aria-invalid={stale}
                  className="w-20 shrink-0 font-mono"
                  onChange={(event) =>
                    onChange(
                      candidate.catalogId,
                      Math.max(
                        0,
                        Math.min(
                          99,
                          Math.trunc(Number(event.target.value)) || 0,
                        ),
                      ),
                    )
                  }
                />
              </Field>
            );
          })}
        </div>
      )}
    </div>
  );
}

function PostSummary({ post }: { post: TradePost }) {
  const giveQty = post.give.reduce((sum, line) => sum + line.qty, 0);
  const wantQty = post.want.reduce((sum, line) => sum + line.qty, 0);
  return (
    <div className="grid grid-cols-2 gap-2 max-sm:grid-cols-1">
      <div className="rounded-lg bg-muted px-3 py-2">
        <span className="text-xs text-muted-foreground">換出</span>
        <p className="font-mono text-sm">
          {post.give.length} 種 · {giveQty} 張
        </p>
      </div>
      <div className="rounded-lg bg-muted px-3 py-2">
        <span className="text-xs text-muted-foreground">徵求</span>
        <p className="font-mono text-sm">
          {post.want.length} 種 · {wantQty} 張
        </p>
      </div>
    </div>
  );
}

function hasReservableGive(post: TradePost): boolean {
  return post.give.some(
    (line) =>
      line.catalogId !== null && Math.min(line.qty, line.availableQty) > 0,
  );
}

export function TradePosts({
  onOpenReservations,
}: {
  onOpenReservations?: () => void;
}) {
  const [posts, setPosts] = useState<AdminTradePost[] | null>(null);
  const [candidates, setCandidates] = useState<{
    give: TradePostCandidate[];
    want: TradePostCandidate[];
  } | null>(null);
  const [editor, setEditor] = useState<EditorDraft | null>(null);
  const [reservationPost, setReservationPost] = useState<AdminTradePost | null>(
    null,
  );
  const [createdReservationId, setCreatedReservationId] = useState<
    number | null
  >(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [refreshError, setRefreshError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const [nextPosts, nextCandidates] = await Promise.all([
      fetchAdminTradePosts(),
      fetchTradePostCandidates(),
    ]);
    setPosts(nextPosts);
    setCandidates(nextCandidates);
  }, []);

  const revalidate = async () => {
    setRefreshError(null);
    try {
      await refresh();
    } catch (reason) {
      setRefreshError(
        `操作結果已保留，但公告列表未能重新載入：${String(reason)}`,
      );
    }
  };

  const rememberPost = (post: TradePost) => {
    setPosts((current) => {
      const existing = current?.find((item) => item.id === post.id);
      const next = {
        reservationCount: 0,
        activeReservationCount: 0,
        ...existing,
        ...post,
      };
      return existing
        ? (current ?? []).map((item) => (item.id === post.id ? next : item))
        : [...(current ?? []), next];
    });
  };

  useEffect(() => {
    let active = true;
    Promise.all([fetchAdminTradePosts(), fetchTradePostCandidates()])
      .then(([nextPosts, nextCandidates]) => {
        if (!active) return;
        setPosts(nextPosts);
        setCandidates(nextCandidates);
      })
      .catch((reason) => {
        if (active) setError(String(reason));
      });
    return () => {
      active = false;
    };
  }, []);

  const giveCandidates = useMemo(
    () => mergedCandidates(candidates?.give ?? [], editor?.sourceGive ?? []),
    [candidates?.give, editor?.sourceGive],
  );
  const wantCandidates = useMemo(
    () => mergedCandidates(candidates?.want ?? [], editor?.sourceWant ?? []),
    [candidates?.want, editor?.sourceWant],
  );

  const payload: SaveTradePostInput | null = editor
    ? {
        note: editor.note,
        give: lineInputs(editor.give),
        want: lineInputs(editor.want),
      }
    : null;
  const selectedLines = payload ? payload.give.length + payload.want.length : 0;
  const hasRemovedLine = Boolean(
    editor &&
      [...editor.sourceGive, ...editor.sourceWant].some(
        (line) => line.catalogId === null,
      ),
  );
  const giveAvailability = new Map(
    giveCandidates.map((candidate) => [
      candidate.catalogId,
      candidate.availableQty,
    ]),
  );
  const wantAvailability = new Map(
    wantCandidates.map((candidate) => [
      candidate.catalogId,
      candidate.availableQty,
    ]),
  );
  const hasStaleSelection = Boolean(
    payload &&
      (payload.give.some(
        (line) => line.qty > (giveAvailability.get(line.catalogId) ?? 0),
      ) ||
        payload.want.some(
          (line) => line.qty > (wantAvailability.get(line.catalogId) ?? 0),
        )),
  );
  const canSave = Boolean(
    payload && payload.give.length > 0 && selectedLines <= 100 && !busy,
  );
  const canPublish = canSave && !hasStaleSelection && !hasRemovedLine;

  const changeQty = (
    direction: TradePostDirection,
    catalogId: number,
    qty: number,
  ) => {
    setEditor((current) => {
      if (!current) return current;
      return {
        ...current,
        [direction]: { ...current[direction], [String(catalogId)]: qty },
      };
    });
  };

  const save = async (publishNow: boolean) => {
    if (!editor || !payload || !canSave || (publishNow && !canPublish)) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    let saved: TradePost | null = null;
    try {
      saved = editor.id
        ? await putTradePost(editor.id, payload)
        : await postTradePost(payload);
      if (publishNow) {
        saved = await publishTradePost(saved.id);
      }
      rememberPost(saved);
      setEditor(null);
      setMessage(publishNow ? "交換公告已發布。" : "交換公告草稿已儲存。");
    } catch (reason) {
      if (saved) {
        rememberPost(saved);
        setEditor(editorFromPost(saved));
      }
      setError(String(reason));
    } finally {
      await revalidate();
      setBusy(false);
    }
  };

  const runClose = async (post: TradePost) => {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      rememberPost(await closeTradePost(post.id));
      setMessage("公告已關閉；原分享網址仍可查閱快照。");
    } catch (reason) {
      setError(String(reason));
    } finally {
      await revalidate();
      setBusy(false);
    }
  };

  const runDelete = async (post: TradePost) => {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await deleteTradePost(post.id);
      setPosts(
        (current) => current?.filter((item) => item.id !== post.id) ?? [],
      );
      if (editor?.id === post.id) setEditor(null);
      setMessage("草稿已刪除。");
    } catch (reason) {
      setError(String(reason));
    } finally {
      await revalidate();
      setBusy(false);
    }
  };

  const copyUrl = async (post: TradePost) => {
    try {
      if (!navigator.clipboard) throw new Error("clipboard unavailable");
      const url = new URL(
        tradePostUrl(post.publicId),
        location.origin,
      ).toString();
      await navigator.clipboard.writeText(url);
      setMessage("分享網址已複製。");
      setError(null);
    } catch {
      setError("瀏覽器無法複製網址，請開啟公告後從網址列複製。");
    }
  };

  return (
    <section
      className="flex flex-col gap-6"
      aria-labelledby="trade-posts-title"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="trade-posts-title" className="font-serif text-xl font-medium">
            交換公告
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            整理可換出與正在找的卡，發布成固定網址；公開後內容會保留為快照。
          </p>
        </div>
        <Button
          type="button"
          onClick={() => {
            setEditor(emptyEditor());
            setReservationPost(null);
            setCreatedReservationId(null);
            setError(null);
            setMessage(null);
          }}
          disabled={
            !candidates || busy || editor !== null || reservationPost !== null
          }
        >
          <PlusIcon data-icon="inline-start" />
          新增公告
        </Button>
      </div>

      {error ? (
        <Alert variant="destructive">
          <TriangleAlertIcon />
          <AlertTitle>交換公告操作失敗</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      {refreshError ? (
        <Alert variant="destructive">
          <AlertTitle>公告列表更新失敗</AlertTitle>
          <AlertDescription>
            <p>{refreshError}</p>
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                await revalidate();
                setBusy(false);
              }}
            >
              重新載入公告
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}
      {message ? (
        <Alert>
          <MegaphoneIcon />
          <AlertTitle>{message}</AlertTitle>
          {createdReservationId !== null && onOpenReservations ? (
            <AlertDescription>
              <Button
                type="button"
                variant="link"
                className="h-auto p-0"
                onClick={onOpenReservations}
              >
                查看交換預約
                <ArrowRightIcon data-icon="inline-end" />
              </Button>
            </AlertDescription>
          ) : null}
        </Alert>
      ) : null}

      {editor && candidates ? (
        <Card>
          <CardHeader>
            <CardTitle>{editor.id ? "編輯公告草稿" : "新增交換公告"}</CardTitle>
            <CardDescription>
              數量 0 不會列入公告；至少選一種換出卡。發布前仍可儲存與修改草稿。
            </CardDescription>
          </CardHeader>
          <CardContent>
            <FieldGroup>
              {hasRemovedLine ? (
                <Alert variant="destructive">
                  <TriangleAlertIcon />
                  <AlertTitle>草稿含已移除的卡種</AlertTitle>
                  <AlertDescription>
                    儲存後會移除該項目；請重新確認內容再發布。
                  </AlertDescription>
                </Alert>
              ) : null}
              <FieldSet disabled={busy}>
                <FieldLegend>我可以換出</FieldLegend>
                <FieldDescription>
                  只列出目前標記為「可交換」且未保留、未被預約的實體卡。
                </FieldDescription>
                <CandidateQuantityList
                  direction="give"
                  candidates={giveCandidates}
                  quantities={editor.give}
                  opposite={editor.want}
                  onChange={(catalogId, qty) =>
                    changeQty("give", catalogId, qty)
                  }
                />
              </FieldSet>

              <FieldSet disabled={busy}>
                <FieldLegend>我正在找</FieldLegend>
                <FieldDescription>
                  依目前未滿足的 Want 顯示；這是明確徵求清單，可留空。
                </FieldDescription>
                <CandidateQuantityList
                  direction="want"
                  candidates={wantCandidates}
                  quantities={editor.want}
                  opposite={editor.give}
                  onChange={(catalogId, qty) =>
                    changeQty("want", catalogId, qty)
                  }
                />
              </FieldSet>

              <Field>
                <FieldLabel htmlFor="trade-post-note">公開交換說明</FieldLabel>
                <Textarea
                  id="trade-post-note"
                  maxLength={1000}
                  rows={5}
                  value={editor.note}
                  disabled={busy}
                  onChange={(event) =>
                    setEditor((current) =>
                      current
                        ? { ...current, note: event.target.value }
                        : current,
                    )
                  }
                  placeholder="例如交換偏好、面交方式或聯絡管道。請勿填入不希望公開的資訊。"
                />
                <FieldDescription className="text-right">
                  {editor.note.length} / 1000
                </FieldDescription>
              </Field>
            </FieldGroup>
          </CardContent>
          <CardFooter className="flex-wrap justify-between gap-3">
            <p className="text-xs text-muted-foreground">
              已選 {selectedLines} 種
              {hasStaleSelection ? " · 有數量已失效，只能先存草稿" : ""}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setEditor(null)}
                disabled={busy}
              >
                取消
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => save(false)}
                disabled={!canSave}
              >
                <FilePenLineIcon data-icon="inline-start" />
                {busy ? "處理中…" : "儲存草稿"}
              </Button>
              <Button
                type="button"
                onClick={() => save(true)}
                disabled={!canPublish}
              >
                <SendIcon data-icon="inline-start" />
                {busy ? "處理中…" : "發布公告"}
              </Button>
            </div>
          </CardFooter>
        </Card>
      ) : null}

      {reservationPost ? (
        <TradePostReservationForm
          key={reservationPost.id}
          post={reservationPost}
          onCancel={() => setReservationPost(null)}
          onCreated={async (id) => {
            setReservationPost(null);
            setCreatedReservationId(id);
            setMessage(`已從公告建立交換預約 #${id}。`);
            setError(null);
            try {
              await refresh();
            } catch {
              setError("預約已建立，但公告列表未能重新載入；請重新整理頁面。");
            }
          }}
        />
      ) : null}

      {posts === null ? (
        <output className="flex flex-col gap-3" aria-label="載入交換公告草稿">
          <Skeleton className="h-36 w-full rounded-xl" />
          <Skeleton className="h-36 w-full rounded-xl" />
        </output>
      ) : posts.length === 0 ? (
        <Empty className="border py-14">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <MegaphoneIcon />
            </EmptyMedia>
            <EmptyTitle>還沒有交換公告</EmptyTitle>
            <EmptyDescription>
              建立第一份草稿，挑選要換出與正在找的卡片。
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="flex flex-col gap-3">
          {posts.map((post) => (
            <Card key={post.id} size="sm">
              <CardHeader>
                <CardTitle>公告 #{post.id}</CardTitle>
                <CardDescription>
                  {post.status === "draft"
                    ? `更新於 ${formatTradePostDate(post.updatedAt)}`
                    : `發布於 ${formatTradePostDate(post.publishedAt)}`}
                </CardDescription>
                <CardAction className="flex gap-1.5">
                  {post.stale && post.status !== "closed" ? (
                    <Badge variant="destructive" className="text-foreground">
                      內容有變動
                    </Badge>
                  ) : null}
                  <Badge
                    variant={post.status === "closed" ? "outline" : "secondary"}
                  >
                    {tradePostStatusLabel(post.status)}
                  </Badge>
                </CardAction>
              </CardHeader>
              <CardContent>
                <PostSummary post={post} />
                {post.reservationCount > 0 ? (
                  <p className="mt-3 text-xs text-muted-foreground">
                    已建立 {post.reservationCount} 筆預約 ·{" "}
                    {post.activeReservationCount} 筆進行中
                  </p>
                ) : null}
                {post.note ? (
                  <p className="mt-3 line-clamp-2 whitespace-pre-wrap text-sm text-muted-foreground">
                    {post.note}
                  </p>
                ) : null}
              </CardContent>
              <CardFooter className="flex-wrap justify-end gap-2">
                {post.status === "draft" ? (
                  <>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setEditor(editorFromPost(post));
                        setReservationPost(null);
                        setCreatedReservationId(null);
                        setError(null);
                        setMessage(null);
                      }}
                      disabled={
                        busy || editor !== null || reservationPost !== null
                      }
                    >
                      <FilePenLineIcon data-icon="inline-start" />
                      編輯
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          type="button"
                          variant="destructive"
                          size="sm"
                          className="text-foreground"
                          disabled={busy || reservationPost !== null}
                        >
                          <Trash2Icon data-icon="inline-start" />
                          刪除草稿
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>
                            刪除這份公告草稿？
                          </AlertDialogTitle>
                          <AlertDialogDescription>
                            草稿尚未公開，刪除後無法復原。
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>取消</AlertDialogCancel>
                          <AlertDialogAction
                            variant="destructive"
                            className="text-foreground"
                            onClick={() => runDelete(post)}
                          >
                            確認刪除
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </>
                ) : (
                  <>
                    {post.status === "published" ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setReservationPost(post);
                          setCreatedReservationId(null);
                          setError(null);
                          setMessage(null);
                        }}
                        disabled={
                          busy ||
                          editor !== null ||
                          reservationPost !== null ||
                          !hasReservableGive(post)
                        }
                        title={
                          hasReservableGive(post)
                            ? undefined
                            : "目前沒有可預約的換出卡"
                        }
                      >
                        <HandshakeIcon data-icon="inline-start" />
                        由公告建立預約
                      </Button>
                    ) : null}
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => copyUrl(post)}
                    >
                      <CopyIcon data-icon="inline-start" />
                      複製網址
                    </Button>
                    <Button asChild variant="outline" size="sm">
                      <a
                        href={tradePostUrl(post.publicId)}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <ExternalLinkIcon data-icon="inline-start" />
                        開啟公告
                      </a>
                    </Button>
                    {post.status === "published" ? (
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            type="button"
                            variant="destructive"
                            size="sm"
                            className="text-foreground"
                            disabled={
                              busy ||
                              editor !== null ||
                              reservationPost !== null
                            }
                          >
                            <ArchiveIcon data-icon="inline-start" />
                            關閉公告
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>
                              關閉這則公開公告？
                            </AlertDialogTitle>
                            <AlertDialogDescription>
                              公告會從公開列表移除，但固定網址與發布快照仍可查閱。
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>取消</AlertDialogCancel>
                            <AlertDialogAction
                              variant="destructive"
                              className="text-foreground"
                              onClick={() => runClose(post)}
                            >
                              確認關閉
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    ) : null}
                  </>
                )}
              </CardFooter>
            </Card>
          ))}
        </div>
      )}
    </section>
  );
}
