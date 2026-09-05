import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import type { useAcquisitionSubmission } from "@/lib/acquisition";

export function AcquisitionFeedback({
  submission,
  onRetry,
}: {
  submission: ReturnType<typeof useAcquisitionSubmission>;
  onRetry: () => void;
}) {
  const { pending, busy, error } = submission;
  if (!error && (!pending?.uncertain || busy)) return null;
  const cards = pending?.request.cards ?? [];
  return (
    <Alert variant="destructive">
      <AlertTitle>
        {pending?.uncertain ? "入藏操作待確認" : "入藏操作提示"}
      </AlertTitle>
      <AlertDescription>
        <p>{error ?? "有一筆先前送出的入藏尚待確認，請重試原內容。"}</p>
        {pending?.uncertain ? (
          <>
            <p>
              原送出 {cards.length} 張：
              {[
                ...new Set(
                  cards.map(
                    (card) => `${card.series} ${card.character} ${card.rarity}`,
                  ),
                ),
              ].join("、")}
            </p>
            <Button type="button" disabled={busy} onClick={onRetry}>
              {busy ? "確認中…" : "重試確認入藏"}
            </Button>
          </>
        ) : null}
      </AlertDescription>
    </Alert>
  );
}
