import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ArrowLeftIcon,
  CheckIcon,
  CopyIcon,
  MegaphoneIcon,
  TriangleAlertIcon,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import type { TradePost } from "../shared/types";
import { fetchTradePost } from "./api";
import {
  TradePostDetails,
  formatTradePostDate,
  tradePostStatusLabel,
} from "./views/TradePosts";

export default function TradePostPage() {
  const { publicId } = useParams<{ publicId: string }>();
  const [post, setPost] = useState<TradePost | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState<string | null>(null);
  const pageGeneration = useRef(0);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    pageGeneration.current += 1;
    let active = true;
    setPost(null);
    setError(null);
    setCopyError(null);
    setCopied(false);
    if (!publicId) {
      setError("缺少公告識別碼");
      return () => {
        active = false;
        pageGeneration.current += 1;
        if (copyTimer.current !== null) clearTimeout(copyTimer.current);
      };
    }
    fetchTradePost(publicId)
      .then((value) => {
        if (active) setPost(value);
      })
      .catch((reason) => {
        if (active) setError(String(reason));
      });
    return () => {
      active = false;
      pageGeneration.current += 1;
      if (copyTimer.current !== null) clearTimeout(copyTimer.current);
    };
  }, [publicId]);

  const copyUrl = async () => {
    const generation = ++pageGeneration.current;
    try {
      if (!publicId) throw new Error("missing public id");
      const url = new URL(`/exchange/${publicId}`, location.origin).toString();
      await navigator.clipboard.writeText(url);
      if (generation !== pageGeneration.current) return;
      setCopyError(null);
      setCopied(true);
      if (copyTimer.current !== null) clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      if (generation === pageGeneration.current) {
        setCopyError("瀏覽器無法複製網址，請從網址列手動複製。");
      }
    }
  };

  return (
    <main className="mx-auto max-w-[920px] px-7 pt-14 pb-24 max-sm:px-4 max-sm:pt-9">
      <Button
        asChild
        variant="link"
        className="mb-8 h-auto p-0 text-muted-foreground"
      >
        <Link to="/#posts">
          <ArrowLeftIcon data-icon="inline-start" />
          回到交換公告
        </Link>
      </Button>

      <header className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="mb-2 flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-primary">
            <MegaphoneIcon /> Meridian Exchange
          </p>
          <h1 className="font-serif text-[clamp(28px,6vw,44px)] font-medium tracking-[0.06em] text-foreground">
            交換公告
          </h1>
          {post ? (
            <p className="mt-2 text-sm text-muted-foreground">
              發布於 {formatTradePostDate(post.publishedAt)}
            </p>
          ) : null}
        </div>
        {post ? (
          <div className="flex items-center gap-2">
            <Badge variant={post.status === "closed" ? "outline" : "secondary"}>
              {tradePostStatusLabel(post.status)}
            </Badge>
            <Button type="button" variant="outline" size="sm" onClick={copyUrl}>
              {copied ? <CheckIcon /> : <CopyIcon />}
              {copied ? "已複製" : "複製網址"}
            </Button>
          </div>
        ) : null}
      </header>

      {copyError ? (
        <Alert variant="destructive" className="mb-4">
          <AlertTitle>無法複製網址</AlertTitle>
          <AlertDescription>{copyError}</AlertDescription>
        </Alert>
      ) : null}
      {error ? (
        <Alert variant="destructive">
          <TriangleAlertIcon />
          <AlertTitle>無法開啟這則公告</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : post ? (
        <TradePostDetails post={post} />
      ) : (
        <output className="flex flex-col gap-4" aria-label="載入交換公告">
          <Skeleton className="h-20 w-full rounded-xl" />
          <div className="grid grid-cols-2 gap-4 max-sm:grid-cols-1">
            <Skeleton className="h-64 w-full rounded-xl" />
            <Skeleton className="h-64 w-full rounded-xl" />
          </div>
        </output>
      )}
    </main>
  );
}
