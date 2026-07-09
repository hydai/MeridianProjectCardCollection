import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Toggle } from "@/components/ui/toggle";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { todayLocal } from "@/lib/date";
import { cn } from "@/lib/utils";
import { useEffect, useState } from "react";
import type {
  AddCardInput,
  CatalogSeries,
  OpeningInput,
  Rarity,
} from "../../shared/types";
import { fetchCatalog, fetchNextPackNumber, postCards } from "../api";
import {
  ADD_ACTIONS,
  BTN_GHOST_SM,
  BTN_PRIMARY,
  CONTROL,
  ERROR_TEXT,
  FIELD,
  FIELD_LABEL,
  OPENING_FIELDS,
  OPT_BASE,
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

type AcquisitionMode = "pack" | "purchase";

interface TallyEntry {
  series: string;
  character: string;
  rarity: Rarity;
  qty: number;
}

export function AddCards() {
  const [catalog, setCatalog] = useState<CatalogSeries[] | null>(null);
  const [mode, setMode] = useState<AcquisitionMode>("pack");
  const [series, setSeries] = useState("");
  const [rarity, setRarity] = useState<Rarity | null>(null);
  const [purchaseCharacter, setPurchaseCharacter] = useState("");
  const [tally, setTally] = useState<TallyEntry[]>([]);
  const [openedAt, setOpenedAt] = useState(todayLocal);
  const [cost, setCost] = useState("");
  const [purchasePrice, setPurchasePrice] = useState("");
  const [nextPackNumber, setNextPackNumber] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let current = true;
    fetchCatalog()
      .then((items) => {
        if (!current) return;
        setCatalog(items);
        const first = items[0];
        if (!first) return;
        setSeries(first.name);
        setRarity(first.rarities[0] ?? null);
        setPurchaseCharacter(first.characters[0] ?? "");
      })
      .catch((e) => {
        if (current) setError(String(e));
      });
    return () => {
      current = false;
    };
  }, []);

  useEffect(() => {
    if (!series || mode !== "pack") return;
    let current = true;
    setNextPackNumber(null);
    fetchNextPackNumber(series)
      .then((result) => {
        if (current) setNextPackNumber(result.packNumber);
      })
      .catch((e) => {
        if (current) setError(String(e));
      });
    return () => {
      current = false;
    };
  }, [mode, series]);

  const selectedSeries = catalog?.find((item) => item.name === series);
  const characters = selectedSeries?.characters ?? [];
  const rarities = selectedSeries?.rarities ?? [];
  const total = tally.reduce((sum, entry) => sum + entry.qty, 0);
  const numericCost = Number(cost);
  const costValid =
    cost.trim() === "" || (Number.isFinite(numericCost) && numericCost >= 0);
  const numericPurchasePrice = Number(purchasePrice);
  const purchasePriceValid =
    purchasePrice.trim() !== "" &&
    Number.isFinite(numericPurchasePrice) &&
    numericPurchasePrice >= 0;

  const selectSeries = (name: string) => {
    if (name === series) return;
    const next = catalog?.find((item) => item.name === name);
    setSeries(name);
    setRarity(next?.rarities[0] ?? null);
    setPurchaseCharacter(next?.characters[0] ?? "");
    setTally([]);
    setToast(null);
    setError(null);
  };

  const addCard = (character: string) => {
    if (!rarity) return;
    setTally((entries) => {
      const index = entries.findIndex(
        (entry) => entry.character === character && entry.rarity === rarity,
      );
      if (index === -1) {
        return [...entries, { series, character, rarity, qty: 1 }];
      }
      return entries.map((entry, entryIndex) =>
        entryIndex === index ? { ...entry, qty: entry.qty + 1 } : entry,
      );
    });
  };

  const removeOne = (character: string, entryRarity: Rarity) =>
    setTally((entries) =>
      entries
        .map((entry) =>
          entry.character === character && entry.rarity === entryRarity
            ? { ...entry, qty: entry.qty - 1 }
            : entry,
        )
        .filter((entry) => entry.qty > 0),
    );

  const submitPack = async () => {
    if (!rarity || !series || total === 0 || !openedAt) return;
    setBusy(true);
    setError(null);
    setToast(null);
    try {
      const cards: AddCardInput[] = tally.flatMap((entry) =>
        Array.from({ length: entry.qty }, () => ({
          series,
          character: entry.character,
          rarity: entry.rarity,
          source: "pull" as const,
        })),
      );
      const opening: OpeningInput = {
        series,
        openedAt,
        cost: cost.trim() === "" ? undefined : numericCost,
      };
      const result = await postCards(cards, opening);
      const packNumber = result.opening?.packNumber ?? nextPackNumber;
      setToast(
        packNumber == null
          ? `已記錄 1 包（${result.ids.length} 張）`
          : `第 ${packNumber} 包已記錄（${result.ids.length} 張）`,
      );
      if (result.opening) setNextPackNumber(result.opening.packNumber + 1);
      setTally([]);
      setCost("");
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  const submitPurchase = async () => {
    if (!rarity || !series || !purchaseCharacter || !purchasePriceValid) return;
    setBusy(true);
    setError(null);
    setToast(null);
    try {
      const card: AddCardInput = {
        series,
        character: purchaseCharacter,
        rarity,
        source: "purchase",
        purchasePrice: numericPurchasePrice,
      };
      await postCards([card]);
      setToast(
        `已記錄購入 ${series} ${purchaseCharacter} ${rarity}（${numericPurchasePrice} 元）`,
      );
      setPurchasePrice("");
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  const submitDisabled =
    busy ||
    catalog === null ||
    !series ||
    !rarity ||
    (mode === "pack"
      ? total === 0 || !openedAt || !costValid
      : !purchaseCharacter || !purchasePriceValid);

  return (
    <section className={PANEL}>
      <h2 className={PANEL_TITLE}>新增卡片</h2>

      <div className={FIELD}>
        <span className={FIELD_LABEL}>取得方式</span>
        <ToggleGroup
          type="single"
          aria-label="取得方式"
          value={mode}
          onValueChange={(value) => {
            if (!value) return;
            setMode(value as AcquisitionMode);
            setToast(null);
            setError(null);
          }}
          className="justify-start"
        >
          <ToggleGroupItem value="pack" className={OPT_TOGGLE}>
            開卡包
          </ToggleGroupItem>
          <ToggleGroupItem
            value="purchase"
            className={OPT_TOGGLE}
            disabled={total > 0}
            title={total > 0 ? "本包已有卡片，需先送出或移除" : undefined}
          >
            單卡購入
          </ToggleGroupItem>
        </ToggleGroup>
      </div>

      <div className={cn(FIELD, "mt-4")}>
        <span className={FIELD_LABEL}>系列</span>
        <div className={OPT_GROUP}>
          {catalog?.map((item) => (
            <Toggle
              key={item.name}
              pressed={item.name === series}
              onPressedChange={() => selectSeries(item.name)}
              className={OPT_TOGGLE}
              disabled={total > 0 && item.name !== series}
              title={
                total > 0 && item.name !== series
                  ? "本包已有卡片，需先送出或移除"
                  : undefined
              }
            >
              {item.name}
            </Toggle>
          ))}
        </div>
      </div>

      <div className={cn(FIELD, "mt-4")}>
        <span className={FIELD_LABEL}>稀有度</span>
        <div className={OPT_GROUP}>
          {rarities.map((itemRarity) => (
            <Toggle
              key={itemRarity}
              pressed={itemRarity === rarity}
              onPressedChange={() => setRarity(itemRarity)}
              className={cn(OPT_BASE, OPT_RARITY[itemRarity])}
            >
              {itemRarity}
            </Toggle>
          ))}
        </div>
      </div>

      <div className={cn(FIELD, "mt-4")}>
        <span className={FIELD_LABEL}>
          {mode === "pack" ? "角色（點一下 = 加一張）" : "角色"}
        </span>
        <div className={OPT_GROUP}>
          {characters.map((character) =>
            mode === "pack" ? (
              <Button
                key={character}
                type="button"
                variant="ghost"
                className={OPT_CHIP}
                onClick={() => addCard(character)}
              >
                {character}
              </Button>
            ) : (
              <Toggle
                key={character}
                pressed={character === purchaseCharacter}
                onPressedChange={() => setPurchaseCharacter(character)}
                className={OPT_TOGGLE}
              >
                {character}
              </Toggle>
            ),
          )}
        </div>
      </div>

      {mode === "pack" ? (
        <>
          {tally.length > 0 ? (
            <div className={TALLY}>
              {tally.map((entry) => (
                <div
                  className={TALLY_ROW}
                  key={`${entry.character}-${entry.rarity}`}
                >
                  <span className={TALLY_SERIES} title={series}>
                    {series}
                  </span>
                  <span className={TALLY_NAME}>{entry.character}</span>
                  <span className={cn(PILL_BASE, PILL_RARITY[entry.rarity])}>
                    {entry.rarity}
                  </span>
                  <span className={TALLY_QTY}>×{entry.qty}</span>
                  <Button
                    type="button"
                    variant="outline"
                    className={BTN_GHOST_SM}
                    aria-label={`移除 ${series} ${entry.character} ${entry.rarity}`}
                    onClick={() => removeOne(entry.character, entry.rarity)}
                  >
                    –
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <p className={TALLY_EMPTY}>點上方角色加入本包卡片</p>
          )}

          <div className={cn(FIELD, "mt-5")}>
            <span className={FIELD_LABEL}>本次開卡</span>
            <strong className="font-mono text-base font-medium text-primary">
              {nextPackNumber == null
                ? "由系統自動編號"
                : `第 ${nextPackNumber} 包`}
            </strong>
          </div>
          <div className={OPENING_FIELDS}>
            <label className={FIELD}>
              <span className={FIELD_LABEL}>開卡日期</span>
              <Input
                type="date"
                className={CONTROL}
                value={openedAt}
                onChange={(event) => setOpenedAt(event.target.value)}
              />
            </label>
            <label className={FIELD}>
              <span className={FIELD_LABEL}>本包花費 (TWD)</span>
              <Input
                type="number"
                min={0}
                inputMode="decimal"
                className={CONTROL}
                value={cost}
                onChange={(event) => setCost(event.target.value)}
                placeholder="選填"
                aria-invalid={!costValid}
              />
            </label>
          </div>
        </>
      ) : (
        <label className={cn(FIELD, "mt-5 max-w-[260px]")}>
          <span className={FIELD_LABEL}>購入價格 (TWD)</span>
          <Input
            type="number"
            min={0}
            inputMode="decimal"
            className={CONTROL}
            value={purchasePrice}
            onChange={(event) => setPurchasePrice(event.target.value)}
            placeholder="必填"
            aria-invalid={purchasePrice !== "" && !purchasePriceValid}
          />
        </label>
      )}

      <div className={ADD_ACTIONS}>
        <Button
          type="button"
          className={BTN_PRIMARY}
          onClick={mode === "pack" ? submitPack : submitPurchase}
          disabled={submitDisabled}
        >
          {busy
            ? "新增中…"
            : mode === "pack"
              ? nextPackNumber == null
                ? `記錄本包（${total} 張）`
                : `記錄第 ${nextPackNumber} 包（${total} 張）`
              : "記錄購入"}
        </Button>
        {mode === "pack" && !openedAt ? (
          <span className={ERROR_TEXT}>開卡日期為必填</span>
        ) : null}
        {mode === "pack" && !costValid ? (
          <span className={ERROR_TEXT}>本包花費必須為 0 或正數</span>
        ) : null}
        {mode === "purchase" && purchasePrice !== "" && !purchasePriceValid ? (
          <span className={ERROR_TEXT}>購入價格必須為 0 或正數</span>
        ) : null}
        {toast ? <span className={TOAST}>{toast}</span> : null}
        {error ? <span className={ERROR_TEXT}>{error}</span> : null}
      </div>
    </section>
  );
}
