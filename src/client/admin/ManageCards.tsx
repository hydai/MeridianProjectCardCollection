import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { Fragment, useCallback, useEffect, useState } from "react";
import { RARITIES, SERIES, charactersFor } from "../../../seed/catalog-def";
import type { CardRow, Rarity } from "../../shared/types";
import { listCards, patchCard, postTransaction } from "../api";
import {
  ACTION_FORM,
  BTN_GHOST_SM,
  BTN_PRIMARY_SM,
  CONTROL,
  ERROR_TEXT,
  FIELD,
  FIELD_LABEL,
  FILTERS,
  INLINE_FIELDS,
  PANEL,
  PANEL_TITLE,
  PILL_BASE,
  PILL_DUP,
  PILL_RARITY,
  PILL_RESERVED,
  PILL_STATUS,
  ROW_ACTIONS,
  TABLE,
  TD,
  TH,
} from "./ui";

type ActionKind = "list_sale" | "list_trade" | "sale" | "trade";

const STATUS_LABEL: Record<string, string> = {
  owned: "持有",
  for_sale: "待售",
  for_trade: "待換",
  sold: "已售出",
  traded: "已交換",
};

function ActionForm({
  card,
  kind,
  onDone,
  onCancel,
}: {
  card: CardRow;
  kind: ActionKind;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [price, setPrice] = useState("");
  const [want, setWant] = useState("");
  const [counterparty, setCounterparty] = useState("");
  const [happenedAt, setHappenedAt] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const [rSeries, setRSeries] = useState(SERIES[0]);
  const rChars = charactersFor(rSeries);
  const [rChar, setRChar] = useState(rChars[0]);
  const [rRarity, setRRarity] = useState<Rarity>("R");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setErr(null);
    try {
      if (kind === "list_sale") {
        await patchCard(card.id, {
          status: "for_sale",
          askingPrice: price ? Number(price) : null,
        });
      } else if (kind === "list_trade") {
        await patchCard(card.id, {
          status: "for_trade",
          wantInReturn: want || null,
        });
      } else if (kind === "sale") {
        await postTransaction({
          cardId: card.id,
          type: "sale",
          price: price ? Number(price) : undefined,
          counterparty: counterparty || undefined,
          happenedAt,
        });
      } else {
        await postTransaction({
          cardId: card.id,
          type: "trade",
          counterparty: counterparty || undefined,
          happenedAt,
          receivedSeries: rSeries,
          receivedCharacter: rChar,
          receivedRarity: rRarity,
        });
      }
      onDone();
    } catch (e) {
      setErr(String(e));
      setBusy(false);
    }
  };

  return (
    <div className={ACTION_FORM}>
      <div className={INLINE_FIELDS}>
        {kind === "list_sale" || kind === "sale" ? (
          <label className={FIELD}>
            <span className={FIELD_LABEL}>價格 (TWD)</span>
            <Input
              type="number"
              className={CONTROL}
              value={price}
              onChange={(e) => setPrice(e.target.value)}
            />
          </label>
        ) : null}
        {kind === "list_trade" ? (
          <label className={FIELD}>
            <span className={FIELD_LABEL}>想換的卡 / 條件</span>
            <Input
              className={CONTROL}
              value={want}
              onChange={(e) => setWant(e.target.value)}
              placeholder="例如 KILLER Kirari UR"
            />
          </label>
        ) : null}
        {kind === "sale" || kind === "trade" ? (
          <>
            <label className={FIELD}>
              <span className={FIELD_LABEL}>對象</span>
              <Input
                className={CONTROL}
                value={counterparty}
                onChange={(e) => setCounterparty(e.target.value)}
              />
            </label>
            <label className={FIELD}>
              <span className={FIELD_LABEL}>日期</span>
              <Input
                type="date"
                className={CONTROL}
                value={happenedAt}
                onChange={(e) => setHappenedAt(e.target.value)}
              />
            </label>
          </>
        ) : null}
        {kind === "trade" ? (
          <>
            <label className={FIELD}>
              <span className={FIELD_LABEL}>換得系列</span>
              <select
                className={CONTROL}
                value={rSeries}
                onChange={(e) => {
                  setRSeries(e.target.value);
                  setRChar(charactersFor(e.target.value)[0]);
                }}
              >
                {SERIES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
            <label className={FIELD}>
              <span className={FIELD_LABEL}>換得角色</span>
              <select
                className={CONTROL}
                value={rChar}
                onChange={(e) => setRChar(e.target.value)}
              >
                {rChars.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
            <label className={FIELD}>
              <span className={FIELD_LABEL}>稀有度</span>
              <select
                className={CONTROL}
                value={rRarity}
                onChange={(e) => setRRarity(e.target.value as Rarity)}
              >
                {RARITIES.map((rr) => (
                  <option key={rr} value={rr}>
                    {rr}
                  </option>
                ))}
              </select>
            </label>
          </>
        ) : null}
        <Button
          type="button"
          className={BTN_PRIMARY_SM}
          onClick={submit}
          disabled={busy}
        >
          {busy ? "處理中…" : "確認"}
        </Button>
        <Button
          type="button"
          variant="outline"
          className={BTN_GHOST_SM}
          onClick={onCancel}
        >
          取消
        </Button>
      </div>
      {err ? <div className={cn(ERROR_TEXT, "mt-2")}>{err}</div> : null}
    </div>
  );
}

export function ManageCards() {
  const [filterSeries, setFilterSeries] = useState("");
  const [filterStatus, setFilterStatus] = useState("active");
  const [rows, setRows] = useState<CardRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [action, setAction] = useState<{
    cardId: number;
    kind: ActionKind;
  } | null>(null);

  const reload = useCallback(() => {
    setRows(null);
    setError(null);
    listCards({
      series: filterSeries || undefined,
      status: filterStatus || undefined,
    })
      .then(setRows)
      .catch((e) => setError(String(e)));
  }, [filterSeries, filterStatus]);

  useEffect(() => {
    reload();
  }, [reload]);

  const onDone = () => {
    setAction(null);
    reload();
  };

  return (
    <section className={PANEL}>
      <h2 className={PANEL_TITLE}>卡片管理</h2>
      <div className={FILTERS}>
        <label className={cn(FIELD, "min-w-[150px]")}>
          <span className={FIELD_LABEL}>系列</span>
          <select
            className={CONTROL}
            value={filterSeries}
            onChange={(e) => setFilterSeries(e.target.value)}
          >
            <option value="">全部系列</option>
            {SERIES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <label className={cn(FIELD, "min-w-[150px]")}>
          <span className={FIELD_LABEL}>狀態</span>
          <select
            className={CONTROL}
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
          >
            <option value="active">持有中（可管理）</option>
            <option value="for_sale">待售</option>
            <option value="for_trade">待換</option>
            <option value="owned">純持有</option>
            <option value="sold">已售出</option>
            <option value="traded">已交換</option>
          </select>
        </label>
      </div>

      {error ? <div className={ERROR_TEXT}>{error}</div> : null}
      {rows === null ? (
        <div className="state-msg">載入中…</div>
      ) : rows.length === 0 ? (
        <div className="trade-empty">沒有符合的卡片。</div>
      ) : (
        <table className={TABLE}>
          <thead>
            <tr>
              <th className={TH}>系列</th>
              <th className={TH}>角色</th>
              <th className={TH}>稀有度</th>
              <th className={TH}>狀態</th>
              <th className={TH}>操作</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((card) => {
              const isActive =
                card.status === "owned" ||
                card.status === "for_sale" ||
                card.status === "for_trade";
              const open = action?.cardId === card.id;
              return (
                <Fragment key={card.id}>
                  <tr>
                    <td className={TD}>{card.series}</td>
                    <td className={TD}>{card.character}</td>
                    <td className={TD}>
                      <span className={cn(PILL_BASE, PILL_RARITY[card.rarity])}>
                        {card.rarity}
                      </span>
                    </td>
                    <td className={TD}>
                      <span className={cn(PILL_BASE, PILL_STATUS[card.status])}>
                        {STATUS_LABEL[card.status]}
                      </span>
                      {card.duplicate && isActive ? (
                        <span className={cn(PILL_BASE, PILL_DUP, "ml-1.5")}>
                          重複
                        </span>
                      ) : null}
                      {card.reservedGive > 0 && isActive ? (
                        <span
                          className={cn(PILL_BASE, PILL_RESERVED, "ml-1.5")}
                        >
                          預約中 ×{card.reservedGive}
                        </span>
                      ) : null}
                      {card.status === "for_sale" &&
                      card.askingPrice != null ? (
                        <span className="ml-2">{card.askingPrice} 元</span>
                      ) : null}
                      {card.status === "for_trade" && card.wantInReturn ? (
                        <span className="ml-2 text-[var(--text-tertiary)]">
                          想換：{card.wantInReturn}
                        </span>
                      ) : null}
                    </td>
                    <td className={TD}>
                      {isActive ? (
                        <div className={ROW_ACTIONS}>
                          <Button
                            type="button"
                            variant="outline"
                            className={BTN_GHOST_SM}
                            onClick={() =>
                              setAction({ cardId: card.id, kind: "list_sale" })
                            }
                          >
                            待售
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            className={BTN_GHOST_SM}
                            onClick={() =>
                              setAction({ cardId: card.id, kind: "list_trade" })
                            }
                          >
                            待換
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            className={BTN_GHOST_SM}
                            onClick={() =>
                              setAction({ cardId: card.id, kind: "sale" })
                            }
                          >
                            賣出
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            className={BTN_GHOST_SM}
                            onClick={() =>
                              setAction({ cardId: card.id, kind: "trade" })
                            }
                          >
                            交換
                          </Button>
                          {card.status !== "owned" ? (
                            <Button
                              type="button"
                              variant="outline"
                              className={BTN_GHOST_SM}
                              onClick={() => {
                                patchCard(card.id, { status: "owned" })
                                  .then(reload)
                                  .catch(() => {});
                              }}
                            >
                              取消上架
                            </Button>
                          ) : null}
                        </div>
                      ) : (
                        <span className="text-[var(--text-quaternary)]">—</span>
                      )}
                    </td>
                  </tr>
                  {open && action ? (
                    <tr>
                      <td className={TD} colSpan={5}>
                        <ActionForm
                          card={card}
                          kind={action.kind}
                          onDone={onDone}
                          onCancel={() => setAction(null)}
                        />
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      )}
    </section>
  );
}
