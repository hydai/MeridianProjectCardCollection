import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { CheckIcon, CopyIcon } from "lucide-react";
import { useId, useRef, useState } from "react";

/** The parent keys this component by text so changed filters reset copy feedback. */
export function SaleTextCopy({ text }: { text: string | null }) {
  const id = useId();
  const [status, setStatus] = useState<
    "idle" | "copying" | "copied" | "manual"
  >("idle");
  const copying = useRef(false);
  const copy = async () => {
    if (!text || copying.current) return;
    copying.current = true;
    setStatus("copying");
    try {
      if (!navigator.clipboard) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(text);
      setStatus("copied");
    } catch {
      setStatus("manual");
    } finally {
      copying.current = false;
    }
  };
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          variant="outline"
          disabled={!text || status === "copying"}
          onClick={() => void copy()}
        >
          {status === "copied" ? (
            <CheckIcon data-icon="inline-start" aria-hidden />
          ) : (
            <CopyIcon data-icon="inline-start" aria-hidden />
          )}
          {status === "copied"
            ? "已複製文字清單"
            : status === "copying"
              ? "複製中…"
              : "複製文字清單"}
        </Button>
        <output className="text-xs text-muted-foreground">
          {text === null
            ? "彈數資料尚未載入，請稍後或重新整理後再複製。"
            : text === ""
              ? "目前篩選下沒有可售的卡片。"
              : "依稀有度與彈數分組，列出角色、系列與可售張數；不含預約、價格及備註。"}
        </output>
      </div>
      {status === "manual" ? (
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor={id}>待售文字清單</FieldLabel>
            <Alert>
              <AlertDescription>
                瀏覽器無法自動複製，請選取下方文字後手動複製。
              </AlertDescription>
            </Alert>
            <Textarea
              id={id}
              value={text ?? ""}
              readOnly
              rows={12}
              className="max-h-80"
              onFocus={(event) => event.currentTarget.select()}
            />
          </Field>
        </FieldGroup>
      ) : null}
    </div>
  );
}
