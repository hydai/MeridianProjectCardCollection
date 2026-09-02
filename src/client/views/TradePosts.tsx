import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
import { Skeleton } from "@/components/ui/skeleton";
import {
  ArchiveIcon,
  ArrowRightIcon,
  MegaphoneIcon,
  TriangleAlertIcon,
} from "lucide-react";
import { Link } from "react-router-dom";
import type {
  TradePost,
  TradePostLine,
  TradePostStatus,
} from "../../shared/types";

export const tradePostUrl = (publicId: string) => `/exchange/${publicId}`;

export const tradePostStatusLabel = (status: TradePostStatus) => {
  if (status === "draft") return "草稿";
  if (status === "closed") return "已關閉";
  return "公開中";
};

export const formatTradePostDate = (value: string | null): string => {
  if (!value) return "尚未發布";
  const normalized = value.includes("T") ? value : value.replace(" ", "T");
  const date = new Date(
    `${normalized}${/[zZ]|[+-]\d{2}:?\d{2}$/.test(normalized) ? "" : "Z"}`,
  );
  if (Number.isNaN(date.getTime())) return value.slice(0, 10);
  return new Intl.DateTimeFormat("zh-TW", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(date);
};

const totalQty = (lines: TradePostLine[]) =>
  lines.reduce((sum, line) => sum + line.qty, 0);

function AvailabilityBadge({ line }: { line: TradePostLine }) {
  if (!line.stale) return null;
  return (
    <Badge variant="destructive">
      公告 {line.qty} · 目前 {line.availableQty}
    </Badge>
  );
}

function TradePostLineList({
  title,
  description,
  emptyDescription,
  lines,
}: {
  title: string;
  description: string;
  emptyDescription: string;
  lines: TradePostLine[];
}) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>
          {lines.length > 0
            ? `${lines.length} 種 · ${totalQty(lines)} 張 · ${description}`
            : description}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {lines.length === 0 ? (
          <Empty className="border py-8">
            <EmptyHeader>
              <EmptyTitle>沒有指定卡種</EmptyTitle>
              <EmptyDescription>{emptyDescription}</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <ul className="flex flex-col gap-2" aria-label={`${title}卡片`}>
            {lines.map((line, index) => (
              <li
                key={`${line.catalogId ?? "removed"}-${index}`}
                className="flex flex-wrap items-center gap-2 rounded-lg border border-border px-3 py-2.5"
              >
                <span className="min-w-0 flex-1 text-sm text-foreground">
                  {line.character}
                  <span className="ml-2 text-xs text-muted-foreground">
                    {line.series}
                  </span>
                </span>
                <Badge variant="outline" className="font-mono">
                  {line.rarity}
                </Badge>
                <span className="font-mono text-sm text-foreground">
                  ×{line.qty}
                </span>
                <AvailabilityBadge line={line} />
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

export function TradePostDetails({ post }: { post: TradePost }) {
  return (
    <div className="flex flex-col gap-5">
      {post.status === "closed" ? (
        <Alert>
          <ArchiveIcon />
          <AlertTitle>這則公告已關閉</AlertTitle>
          <AlertDescription>
            以下保留發布當時的內容，僅供查閱，不代表目前仍可交換。
          </AlertDescription>
        </Alert>
      ) : post.stale ? (
        <Alert variant="destructive">
          <TriangleAlertIcon />
          <AlertTitle>部分內容已有變動</AlertTitle>
          <AlertDescription>
            標示的卡種目前數量已少於公告快照；請以失效標記為準。
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="grid grid-cols-2 gap-4 max-sm:grid-cols-1">
        <TradePostLineList
          title="我可以換出"
          description="發布時的出卡快照"
          emptyDescription="這則公告沒有列出可換出的卡片。"
          lines={post.give}
        />
        <TradePostLineList
          title="我正在找"
          description="發布時的 Want 快照"
          emptyDescription="可接受備註中描述的其他提案。"
          lines={post.want}
        />
      </div>

      {post.note ? (
        <Card size="sm">
          <CardHeader>
            <CardTitle>交換說明</CardTitle>
            <CardDescription>公開備註</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="whitespace-pre-wrap text-sm leading-7 text-foreground">
              {post.note}
            </p>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

function TradePostCard({ post }: { post: TradePost }) {
  const series = [
    ...new Set([...post.give, ...post.want].map((line) => line.series)),
  ];
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>交換公告</CardTitle>
        <CardDescription>
          {formatTradePostDate(post.publishedAt)}
          {series.length > 0 ? ` · ${series.join(" · ")}` : ""}
        </CardDescription>
        <CardAction className="flex gap-1.5">
          {post.stale ? <Badge variant="destructive">內容有變動</Badge> : null}
          <Badge variant="secondary">{tradePostStatusLabel(post.status)}</Badge>
        </CardAction>
      </CardHeader>
      <CardContent className="grid grid-cols-2 gap-3 max-sm:grid-cols-1">
        <div className="rounded-lg bg-muted/45 px-3 py-2.5">
          <p className="text-xs text-muted-foreground">可以換出</p>
          <p className="mt-1 font-mono text-sm text-foreground">
            {post.give.length} 種 · {totalQty(post.give)} 張
          </p>
        </div>
        <div className="rounded-lg bg-muted/45 px-3 py-2.5">
          <p className="text-xs text-muted-foreground">正在找</p>
          <p className="mt-1 font-mono text-sm text-foreground">
            {post.want.length} 種 · {totalQty(post.want)} 張
          </p>
        </div>
      </CardContent>
      <CardFooter className="justify-end">
        <Button asChild variant="outline" size="sm">
          <Link to={tradePostUrl(post.publicId)}>
            查看公告
            <ArrowRightIcon data-icon="inline-end" />
          </Link>
        </Button>
      </CardFooter>
    </Card>
  );
}

export function TradePostsView({
  posts,
  error,
}: {
  posts: TradePost[] | null;
  error?: string | null;
}) {
  if (error) {
    return (
      <Alert variant="destructive">
        <TriangleAlertIcon />
        <AlertTitle>無法載入交換公告</AlertTitle>
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }
  if (posts === null) {
    return (
      <output className="flex flex-col gap-3 py-12" aria-label="載入交換公告">
        <Skeleton className="h-28 w-full rounded-xl" />
        <Skeleton className="h-28 w-full rounded-xl" />
      </output>
    );
  }
  if (posts.length === 0) {
    return (
      <Empty className="border py-14">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <MegaphoneIcon />
          </EmptyMedia>
          <EmptyTitle>目前沒有公開中的交換公告</EmptyTitle>
          <EmptyDescription>
            新公告發布後會顯示在這裡，並保有可直接分享的固定網址。
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }
  return (
    <section aria-label="公開交換公告" className="flex flex-col gap-3">
      {posts.map((post) => (
        <TradePostCard key={post.id} post={post} />
      ))}
    </section>
  );
}
