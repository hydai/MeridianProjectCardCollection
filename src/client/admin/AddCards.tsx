import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Toggle } from "@/components/ui/toggle";
import { cn } from "@/lib/utils";
import { useState } from "react";
import { RARITIES, SERIES, charactersFor } from "../../../seed/catalog-def";
import type { AddCardInput, OpeningInput, Rarity } from "../../shared/types";
import { postCards } from "../api";
import {
  ADD_ACTIONS,
  BTN_GHOST_SM,
  BTN_PRIMARY,
  CHECKBOX,
  CHECKBOX_ROW,
  CONTROL,
  ERROR_TEXT,
  FIELD,
  FIELD_LABEL,
  OPENING_FIELDS,
  OPT_CHIP,
  OPT_GROUP,
  OPT_RARITY,
  OPT_TOGGLE,
  PANEL,
  PANEL_TITLE,
  PILL_BASE,
  PILL_RARITY,
  TALLY,
  TALLY_EMPTY,
  TALLY_NAME,
  TALLY_QTY,
  TALLY_ROW,
  TALLY_SERIES,
  TOAST,
} from "./ui";

interface TallyEntry {
  series: string;
  character: string;
  rarity: Rarity;
  qty: number;
}

export function AddCards() {
  const [series, setSeries] = useState<string>(SERIES[0]);
  const [rarity, setRarity] = useState<Rarity>("R");
  const [tally, setTally] = useState<TallyEntry[]>([]);
  const [isOpening, setIsOpening] = useState(false);
  const [openedAt, setOpenedAt] = useState("");
  const [cost, setCost] = useState("");
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const chars = charactersFor(series);
  const total = tally.reduce((n, e) => n + e.qty, 0);

  // Each tally row remembers the series it was tapped under, so switching the
  // series selector only affects *new* taps — existing rows keep their series.
  const addCard = (character: string) =>
    setTally((t) => {
      const i = t.findIndex(
        (e) =>
          e.series === series &&
          e.character === character &&
          e.rarity === rarity,
      );
      if (i === -1) return [...t, { series, character, rarity, qty: 1 }];
      return t.map((e, j) => (j === i ? { ...e, qty: e.qty + 1 } : e));
    });

  const removeOne = (s: string, character: string, r: Rarity) =>
    setTally((t) =>
      t
        .map((e) =>
          e.series === s && e.character === character && e.rarity === r
            ? { ...e, qty: e.qty - 1 }
            : e,
        )
        .filter((e) => e.qty > 0),
    );

  const submit = async () => {
    setBusy(true);
    setError(null);
    setToast(null);
    try {
      const cards: AddCardInput[] = tally.flatMap((e) =>
        Array.from({ length: e.qty }, () => ({
          series: e.series,
          character: e.character,
          rarity: e.rarity,
        })),
      );
      let opening: OpeningInput | undefined;
      if (isOpening && openedAt) {
        // Derive the opening's series from what was actually tallied: one
        // distinct series → that series; a mixed batch → none (NULL).
        const distinct = [...new Set(tally.map((e) => e.series))];
        opening = {
          series: distinct.length === 1 ? distinct[0] : undefined,
          openedAt,
          cost: cost ? Number(cost) : undefined,
        };
      }
      const { ids } = await postCards(cards, opening);
      setToast(`已新增 ${ids.length} 張${opening ? "（已記為一次開箱）" : ""}`);
      setTally([]);
      setCost("");
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className={PANEL}>
      <h2 className={PANEL_TITLE}>開箱新增</h2>

      <div className={FIELD}>
        <span className={FIELD_LABEL}>系列</span>
        <div className={OPT_GROUP}>
          {SERIES.map((s) => (
            <Toggle
              key={s}
              pressed={s === series}
              onPressedChange={() => setSeries(s)}
              className={OPT_TOGGLE}
            >
              {s}
            </Toggle>
          ))}
        </div>
      </div>

      <div className={cn(FIELD, "mt-4")}>
        <span className={FIELD_LABEL}>稀有度</span>
        <div className={OPT_GROUP}>
          {RARITIES.map((rr) => (
            <Toggle
              key={rr}
              pressed={rr === rarity}
              onPressedChange={() => setRarity(rr)}
              className={cn(OPT_TOGGLE, OPT_RARITY[rr])}
            >
              {rr}
            </Toggle>
          ))}
        </div>
      </div>

      <div className={cn(FIELD, "mt-4")}>
        <span className={FIELD_LABEL}>角色（點一下 = 加一張）</span>
        <div className={OPT_GROUP}>
          {chars.map((c) => (
            <Button
              key={c}
              type="button"
              variant="ghost"
              className={OPT_CHIP}
              onClick={() => addCard(c)}
            >
              {c}
            </Button>
          ))}
        </div>
      </div>

      {tally.length > 0 ? (
        <div className={TALLY}>
          {tally.map((e) => (
            <div
              className={TALLY_ROW}
              key={`${e.series}-${e.character}-${e.rarity}`}
            >
              <span className={TALLY_SERIES}>{e.series}</span>
              <span className={TALLY_NAME}>{e.character}</span>
              <span className={cn(PILL_BASE, PILL_RARITY[e.rarity])}>
                {e.rarity}
              </span>
              <span className={TALLY_QTY}>×{e.qty}</span>
              <Button
                type="button"
                variant="outline"
                className={BTN_GHOST_SM}
                aria-label={`移除 ${e.series} ${e.character} ${e.rarity}`}
                onClick={() => removeOne(e.series, e.character, e.rarity)}
              >
                –
              </Button>
            </div>
          ))}
        </div>
      ) : (
        <p className={TALLY_EMPTY}>點上方角色加入卡片</p>
      )}

      <label className={CHECKBOX_ROW}>
        <input
          type="checkbox"
          className={CHECKBOX}
          checked={isOpening}
          onChange={(e) => setIsOpening(e.target.checked)}
        />
        這是一次開箱（記錄花費，用於成本分析）
      </label>

      {isOpening ? (
        <div className={OPENING_FIELDS}>
          <label className={FIELD}>
            <span className={FIELD_LABEL}>開箱日期</span>
            <Input
              type="date"
              className={CONTROL}
              value={openedAt}
              onChange={(e) => setOpenedAt(e.target.value)}
            />
          </label>
          <label className={FIELD}>
            <span className={FIELD_LABEL}>總花費 (TWD)</span>
            <Input
              type="number"
              inputMode="numeric"
              className={CONTROL}
              value={cost}
              onChange={(e) => setCost(e.target.value)}
              placeholder="例如 600"
            />
          </label>
        </div>
      ) : null}

      <div className={ADD_ACTIONS}>
        <Button
          type="button"
          className={BTN_PRIMARY}
          onClick={submit}
          disabled={busy || total === 0}
        >
          {busy ? "新增中…" : `新增 ${total} 張`}
        </Button>
        {toast ? <span className={TOAST}>{toast}</span> : null}
        {error ? <span className={ERROR_TEXT}>{error}</span> : null}
      </div>
    </section>
  );
}
