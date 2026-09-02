import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { todayLocal } from "@/lib/date";
import { HandshakeIcon, TriangleAlertIcon } from "lucide-react";
import { useMemo, useState } from "react";
import type {
  CreateTradePostReservationInput,
  TradePost,
  TradePostDirection,
  TradePostLine,
} from "../../shared/types";
import { postTradePostReservation } from "../api";

type Quantities = Record<string, number>;

function reservableQty(line: TradePostLine): number {
  if (line.catalogId === null) return 0;
  return Math.max(0, Math.min(line.qty, line.availableQty));
}

function initialQuantities(lines: TradePostLine[]): Quantities {
  return Object.fromEntries(
    lines.flatMap((line) =>
      line.catalogId === null
        ? []
        : [[String(line.catalogId), reservableQty(line)]],
    ),
  );
}

function reservationLines(lines: TradePostLine[], quantities: Quantities) {
  return lines.flatMap((line) => {
    if (line.catalogId === null) return [];
    const qty = quantities[String(line.catalogId)] ?? 0;
    return qty > 0 ? [{ catalogId: line.catalogId, qty }] : [];
  });
}

function ReservationLineFields({
  direction,
  lines,
  quantities,
  onChange,
}: {
  direction: TradePostDirection;
  lines: TradePostLine[];
  quantities: Quantities;
  onChange: (catalogId: number, qty: number) => void;
}) {
  const action = direction === "give" ? "實際換出" : "實際換入";
  if (lines.length === 0) {
    return <FieldDescription>這則公告沒有列出此方向的卡片。</FieldDescription>;
  }

  return (
    <FieldGroup className="gap-2">
      {lines.map((line, index) => {
        const max = reservableQty(line);
        const id = `trade-post-reservation-${direction}-${line.catalogId ?? `removed-${index}`}`;
        const unavailable = line.catalogId === null || max === 0;
        const value =
          line.catalogId === null
            ? 0
            : (quantities[String(line.catalogId)] ?? 0);
        return (
          <Field
            key={id}
            orientation="horizontal"
            className="items-center rounded-lg border px-3 py-2.5"
            data-disabled={unavailable || undefined}
          >
            <div className="min-w-0 flex-1">
              <FieldLabel htmlFor={id} className="flex-wrap">
                <span>{line.character}</span>
                <span className="font-normal text-muted-foreground">
                  {line.series}
                </span>
                <Badge variant="outline" className="font-mono">
                  {line.rarity}
                </Badge>
              </FieldLabel>
              <FieldDescription>
                公告 {line.qty} 張
                {line.catalogId === null
                  ? " · 卡種已移除，無法建立預約"
                  : ` · 目前可預約 ${max} 張`}
              </FieldDescription>
            </div>
            <Input
              id={id}
              type="number"
              inputMode="numeric"
              min={0}
              max={max}
              value={value}
              disabled={unavailable}
              aria-label={`${line.series} ${line.character} ${line.rarity} ${action}數量`}
              className="w-20 shrink-0 font-mono"
              onChange={(event) => {
                if (line.catalogId === null) return;
                onChange(
                  line.catalogId,
                  Math.max(
                    0,
                    Math.min(max, Math.trunc(Number(event.target.value)) || 0),
                  ),
                );
              }}
            />
          </Field>
        );
      })}
    </FieldGroup>
  );
}

export function TradePostReservationForm({
  post,
  onCancel,
  onCreated,
}: {
  post: TradePost;
  onCancel: () => void;
  onCreated: (id: number) => void | Promise<void>;
}) {
  const [counterparty, setCounterparty] = useState("");
  const [reservedAt, setReservedAt] = useState(todayLocal);
  const [note, setNote] = useState("");
  const [give, setGive] = useState<Quantities>(() =>
    initialQuantities(post.give),
  );
  const [receive, setReceive] = useState<Quantities>(() =>
    initialQuantities(post.want),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const payload = useMemo<CreateTradePostReservationInput>(
    () => ({
      ...(counterparty.trim() ? { counterparty: counterparty.trim() } : {}),
      reservedAt,
      ...(note.trim() ? { note: note.trim() } : {}),
      give: reservationLines(post.give, give),
      receive: reservationLines(post.want, receive),
    }),
    [counterparty, give, note, post.give, post.want, receive, reservedAt],
  );
  const totalGive = payload.give.reduce((sum, line) => sum + line.qty, 0);
  const totalReceive = payload.receive.reduce((sum, line) => sum + line.qty, 0);
  const canSubmit = totalGive > 0 && Boolean(reservedAt) && !busy;

  const changeQuantity = (
    direction: TradePostDirection,
    catalogId: number,
    qty: number,
  ) => {
    const setter = direction === "give" ? setGive : setReceive;
    setter((current) => ({ ...current, [String(catalogId)]: qty }));
  };

  const submit = async () => {
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    try {
      const created = await postTradePostReservation(post.id, payload);
      await onCreated(created.id);
    } catch (reason) {
      setError(String(reason));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <Card>
        <CardHeader>
          <CardTitle>由公告 #{post.id} 建立交換預約</CardTitle>
          <CardDescription>
            已依公告快照與目前可用量預填；將不交換的項目改為
            0。建立後公告仍會保持公開。
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            {error ? (
              <Alert variant="destructive">
                <TriangleAlertIcon />
                <AlertTitle>無法建立交換預約</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}

            <Field>
              <FieldLabel htmlFor="trade-post-reservation-counterparty">
                交換對象
              </FieldLabel>
              <Input
                id="trade-post-reservation-counterparty"
                maxLength={200}
                value={counterparty}
                onChange={(event) => setCounterparty(event.target.value)}
                placeholder="選填；僅後台可見"
              />
            </Field>

            <Field data-invalid={!reservedAt || undefined}>
              <FieldLabel htmlFor="trade-post-reservation-date">
                預約日期
              </FieldLabel>
              <Input
                id="trade-post-reservation-date"
                type="date"
                required
                value={reservedAt}
                aria-invalid={!reservedAt}
                onChange={(event) => setReservedAt(event.target.value)}
              />
              {!reservedAt ? <FieldError>請選擇預約日期。</FieldError> : null}
            </Field>

            <FieldSet>
              <FieldLegend>實際換出</FieldLegend>
              <FieldDescription>
                建立時會鎖定對應的實體卡；其他預約不能再使用同一張卡。
              </FieldDescription>
              <ReservationLineFields
                direction="give"
                lines={post.give}
                quantities={give}
                onChange={(catalogId, qty) =>
                  changeQuantity("give", catalogId, qty)
                }
              />
            </FieldSet>

            <FieldSet>
              <FieldLegend>實際換入</FieldLegend>
              <FieldDescription>
                只建立這次已談妥的數量；尚未談成的部分保留在公告快照。
              </FieldDescription>
              <ReservationLineFields
                direction="want"
                lines={post.want}
                quantities={receive}
                onChange={(catalogId, qty) =>
                  changeQuantity("want", catalogId, qty)
                }
              />
            </FieldSet>

            <Field>
              <FieldLabel htmlFor="trade-post-reservation-note">
                私人備註
              </FieldLabel>
              <Textarea
                id="trade-post-reservation-note"
                maxLength={1000}
                rows={3}
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder="選填；例如聯絡方式、面交地點，只會出現在後台"
              />
              <FieldDescription className="text-right">
                {note.length} / 1000
              </FieldDescription>
            </Field>
          </FieldGroup>
        </CardContent>
        <CardFooter className="flex-wrap justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            實際換出 {totalGive} 張 · 換入 {totalReceive} 張
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={onCancel}
              disabled={busy}
            >
              取消
            </Button>
            <Button type="submit" disabled={!canSubmit}>
              <HandshakeIcon data-icon="inline-start" />
              {busy ? "建立中…" : "確認建立交換預約"}
            </Button>
          </div>
        </CardFooter>
      </Card>
    </form>
  );
}
