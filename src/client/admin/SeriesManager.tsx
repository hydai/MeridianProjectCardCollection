import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";
import { EMPTY_MSG, STATE_MSG } from "@/shared/states";
import { Copy, Pencil, Plus, X } from "lucide-react";
import {
  type FormEvent,
  type KeyboardEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  BASE_RARITY_ORDER,
  RARITY_ORDER,
  canonicalizeRarities,
  supportsEx,
} from "../../shared/rarity";
import type {
  CatalogSeries,
  CreateSeriesInput,
  Rarity,
  UpdateSeriesInput,
} from "../../shared/types";
import { fetchCatalog, patchSeries, postSeries } from "../api";
import {
  ADD_ACTIONS,
  BTN_GHOST_SM,
  BTN_PRIMARY,
  CONTROL,
  ERROR_TEXT,
  FIELD,
  FIELD_LABEL,
  OPT_BASE,
  OPT_GROUP,
  OPT_RARITY,
  PANEL,
  PANEL_TITLE,
  PILL_BASE,
  PILL_RARITY,
  TALLY,
  TALLY_NAME,
  TALLY_ROW,
  TOAST,
} from "./ui";

interface FieldErrors {
  volume?: string;
  name?: string;
  characters?: string;
  rarities?: string;
}

function normalized(value: string) {
  return value.trim().toLocaleLowerCase();
}

function appendCharacter(characters: string[], draft: string) {
  const character = draft.trim();
  if (!character) return { characters };
  if (characters.some((item) => normalized(item) === normalized(character))) {
    return { characters, error: "角色名稱不可重複" };
  }
  return { characters: [...characters, character] };
}

function groupSeries(rows: CatalogSeries[]) {
  const groups = new Map<number, CatalogSeries[]>();
  const sorted = [...rows].sort(
    (a, b) =>
      a.volume - b.volume ||
      a.sortOrder - b.sortOrder ||
      a.name.localeCompare(b.name),
  );
  for (const row of sorted) {
    const group = groups.get(row.volume) ?? [];
    group.push(row);
    groups.set(row.volume, group);
  }
  return [...groups.entries()];
}

export function SeriesManager() {
  const [catalog, setCatalog] = useState<CatalogSeries[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [editingName, setEditingName] = useState<string | null>(null);
  const [volume, setVolume] = useState("");
  const [name, setName] = useState("");
  const [copyFrom, setCopyFrom] = useState("");
  const [characterDraft, setCharacterDraft] = useState("");
  const [characters, setCharacters] = useState<string[]>([]);
  const [rarities, setRarities] = useState<Rarity[]>([...BASE_RARITY_ORDER]);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    setLoadError(null);
    try {
      setCatalog(await fetchCatalog());
    } catch (error) {
      setLoadError(String(error));
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const grouped = useMemo(() => groupSeries(catalog ?? []), [catalog]);
  const isEditing = editingName !== null;
  const exAvailable = supportsEx(Number(volume));
  const previewCharacterCount = appendCharacter(characters, characterDraft)
    .characters.length;
  const typeCount = previewCharacterCount * rarities.length;

  const resetForm = () => {
    setEditingName(null);
    setVolume("");
    setName("");
    setCopyFrom("");
    setCharacterDraft("");
    setCharacters([]);
    setRarities([...BASE_RARITY_ORDER]);
    setFieldErrors({});
    setSubmitError(null);
  };

  const editSeries = (series: CatalogSeries) => {
    setEditingName(series.name);
    setVolume(String(series.volume));
    setName(series.name);
    setCopyFrom("");
    setCharacterDraft("");
    setCharacters([...series.characters]);
    setRarities(canonicalizeRarities(series.rarities));
    setFieldErrors({});
    setSubmitError(null);
    setSuccess(null);
  };

  const changeVolume = (nextValue: string) => {
    const hadExAvailable = supportsEx(Number(volume));
    const hasExAvailable = supportsEx(Number(nextValue));
    setVolume(nextValue);
    setRarities((current) => {
      if (!hasExAvailable) {
        return current.filter((rarity) => rarity !== "EX");
      }
      if (!hadExAvailable) {
        return canonicalizeRarities([...current, "EX"]);
      }
      return current;
    });
    setFieldErrors((current) => ({
      ...current,
      volume: undefined,
      rarities: undefined,
    }));
  };

  const addCharacter = () => {
    const next = appendCharacter(characters, characterDraft);
    if (next.error) {
      setFieldErrors((current) => ({
        ...current,
        characters: next.error,
      }));
      return;
    }
    if (next.characters !== characters) {
      setCharacters(next.characters);
      setCharacterDraft("");
      setFieldErrors((current) => ({ ...current, characters: undefined }));
    }
  };

  const copyCharacters = () => {
    const source = catalog?.find((series) => series.name === copyFrom);
    if (!source) return;
    setCharacters([...source.characters]);
    setCharacterDraft("");
    setFieldErrors((current) => ({ ...current, characters: undefined }));
  };

  const onCharacterKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    addCharacter();
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSuccess(null);
    setSubmitError(null);

    const pendingCharacter = appendCharacter(characters, characterDraft);
    const parsedVolume = Number(volume);
    const trimmedName = name.trim();
    const errors: FieldErrors = {};

    if (!Number.isInteger(parsedVolume) || parsedVolume < 1) {
      errors.volume = "第幾彈必須是正整數";
    }
    if (!trimmedName) {
      errors.name = "系列名稱為必填";
    } else if (
      !isEditing &&
      catalog?.some((row) => normalized(row.name) === normalized(trimmedName))
    ) {
      errors.name = "系列名稱已存在";
    }
    if (pendingCharacter.error) {
      errors.characters = pendingCharacter.error;
    } else if (pendingCharacter.characters.length === 0) {
      errors.characters = "至少新增一位角色";
    }
    if (rarities.length === 0) {
      errors.rarities = "至少選擇一個卡片級別";
    } else if (!supportsEx(parsedVolume) && rarities.includes("EX")) {
      errors.rarities = "EX 僅適用於第 3 彈以後的系列";
    }

    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    const input: UpdateSeriesInput = {
      volume: parsedVolume,
      characters: pendingCharacter.characters,
      rarities,
    };

    setBusy(true);
    try {
      if (editingName) {
        await patchSeries(editingName, input);
      } else {
        const createInput: CreateSeriesInput = { ...input, name: trimmedName };
        await postSeries(createInput);
      }
      resetForm();
      setSuccess(
        editingName ? `已更新系列 ${editingName}` : `已新增系列 ${trimmedName}`,
      );
      await reload();
    } catch (error) {
      setSubmitError(String(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className={PANEL} aria-labelledby="series-manager-title">
      <h2 className={PANEL_TITLE} id="series-manager-title">
        系列管理
      </h2>

      {editingName ? (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-[4px] border-[0.5px] border-primary/35 bg-primary/[0.06] px-3 py-2 text-[13px] text-muted-foreground">
          <span>
            正在編輯{" "}
            <strong className="font-medium text-foreground">
              {editingName}
            </strong>
          </span>
          <span className="text-[11px] text-[var(--text-tertiary)]">
            系列名稱不可變更；移除已被卡片或預約使用的卡種會被系統阻止。
          </span>
        </div>
      ) : null}

      <form onSubmit={submit} noValidate>
        <div className="grid grid-cols-[minmax(120px,0.35fr)_minmax(220px,1fr)] gap-3 max-[600px]:grid-cols-1">
          <label className={FIELD}>
            <span className={FIELD_LABEL}>第幾彈</span>
            <Input
              type="number"
              min={1}
              step={1}
              inputMode="numeric"
              className={CONTROL}
              value={volume}
              onChange={(event) => changeVolume(event.target.value)}
              aria-invalid={fieldErrors.volume ? true : undefined}
              aria-describedby={
                fieldErrors.volume ? "series-volume-error" : undefined
              }
            />
            {fieldErrors.volume ? (
              <span
                className={ERROR_TEXT}
                id="series-volume-error"
                role="alert"
              >
                {fieldErrors.volume}
              </span>
            ) : null}
          </label>

          <label className={FIELD}>
            <span className={FIELD_LABEL}>系列名稱</span>
            <Input
              className={CONTROL}
              value={name}
              disabled={isEditing}
              onChange={(event) => {
                setName(event.target.value);
                setFieldErrors((current) => ({
                  ...current,
                  name: undefined,
                }));
              }}
              aria-invalid={fieldErrors.name ? true : undefined}
              aria-describedby={
                fieldErrors.name ? "series-name-error" : undefined
              }
            />
            {fieldErrors.name ? (
              <span className={ERROR_TEXT} id="series-name-error" role="alert">
                {fieldErrors.name}
              </span>
            ) : null}
          </label>
        </div>

        <div className={cn(FIELD, "mt-4")}>
          <label className={FIELD_LABEL} htmlFor="series-character-source">
            從既有系列複製角色
          </label>
          <div className="flex items-end gap-2 max-[600px]:flex-col max-[600px]:items-stretch">
            <select
              id="series-character-source"
              className={CONTROL}
              value={copyFrom}
              onChange={(event) => setCopyFrom(event.target.value)}
            >
              <option value="">選擇既有系列</option>
              {(catalog ?? []).map((series) => (
                <option key={series.name} value={series.name}>
                  {series.name}（{series.characters.length} 位）
                </option>
              ))}
            </select>
            <Button
              type="button"
              variant="outline"
              className={cn(
                BTN_GHOST_SM,
                "shrink-0 px-3 py-[9px] max-[600px]:w-full",
              )}
              disabled={!copyFrom}
              onClick={copyCharacters}
            >
              <Copy data-icon="inline-start" />
              複製角色
            </Button>
          </div>
        </div>

        <div className={cn(FIELD, "mt-4")}>
          <label className={FIELD_LABEL} htmlFor="series-character">
            角色
          </label>
          <div className="flex items-end gap-2 max-[600px]:flex-col max-[600px]:items-stretch">
            <Input
              id="series-character"
              className={CONTROL}
              value={characterDraft}
              onChange={(event) => {
                setCharacterDraft(event.target.value);
                setFieldErrors((current) => ({
                  ...current,
                  characters: undefined,
                }));
              }}
              onKeyDown={onCharacterKeyDown}
              aria-invalid={fieldErrors.characters ? true : undefined}
              aria-describedby={
                fieldErrors.characters ? "series-characters-error" : undefined
              }
            />
            <Button
              type="button"
              variant="outline"
              className={cn(
                BTN_GHOST_SM,
                "shrink-0 px-3 py-[9px] max-[600px]:w-full",
              )}
              onClick={addCharacter}
            >
              <Plus data-icon="inline-start" />
              加入角色
            </Button>
          </div>
          {fieldErrors.characters ? (
            <span
              className={ERROR_TEXT}
              id="series-characters-error"
              role="alert"
            >
              {fieldErrors.characters}
            </span>
          ) : null}
          {characters.length > 0 ? (
            <div className={TALLY} aria-label="已新增角色">
              {characters.map((character) => (
                <div className={TALLY_ROW} key={character}>
                  <span className={TALLY_NAME}>{character}</span>
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="outline"
                    className={cn(BTN_GHOST_SM, "ml-auto size-7 p-0")}
                    aria-label={`移除角色 ${character}`}
                    title={`移除 ${character}`}
                    onClick={() =>
                      setCharacters((current) =>
                        current.filter((item) => item !== character),
                      )
                    }
                  >
                    <X />
                  </Button>
                </div>
              ))}
            </div>
          ) : null}
        </div>

        <div className={cn(FIELD, "mt-4")}>
          <span className={FIELD_LABEL} id="series-rarity-label">
            卡片級別
          </span>
          <ToggleGroup
            type="multiple"
            value={rarities}
            onValueChange={(values) => {
              setRarities(canonicalizeRarities(values as Rarity[]));
              setFieldErrors((current) => ({
                ...current,
                rarities: undefined,
              }));
            }}
            aria-labelledby="series-rarity-label"
            aria-describedby={
              fieldErrors.rarities ? "series-rarities-error" : undefined
            }
            className={OPT_GROUP}
          >
            {RARITY_ORDER.map((rarity) => (
              <ToggleGroupItem
                key={rarity}
                value={rarity}
                aria-label={rarity}
                className={cn(OPT_BASE, OPT_RARITY[rarity])}
                disabled={rarity === "EX" && !exAvailable}
                title={
                  rarity === "EX" && !exAvailable
                    ? "EX 自第 3 彈起適用"
                    : undefined
                }
              >
                {rarity}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          <span className="text-[11px] text-[var(--text-tertiary)]">
            EX 自第 3 彈起適用。
          </span>
          {fieldErrors.rarities ? (
            <span
              className={ERROR_TEXT}
              id="series-rarities-error"
              role="alert"
            >
              {fieldErrors.rarities}
            </span>
          ) : null}
        </div>

        <div className={ADD_ACTIONS}>
          <Button
            type="submit"
            className={BTN_PRIMARY}
            disabled={busy || catalog === null}
          >
            {busy
              ? isEditing
                ? "儲存中…"
                : "新增中…"
              : isEditing
                ? "儲存變更"
                : "新增系列"}
          </Button>
          {isEditing ? (
            <Button
              type="button"
              variant="outline"
              className={BTN_GHOST_SM}
              disabled={busy}
              onClick={() => {
                resetForm();
                setSuccess(null);
              }}
            >
              取消編輯
            </Button>
          ) : null}
          <output className="text-[13px] text-muted-foreground">
            卡片種類預覽：{typeCount} 種（{previewCharacterCount} 位角色 ×{" "}
            {rarities.length} 個級別）
          </output>
          {success ? <span className={TOAST}>{success}</span> : null}
          {submitError ? (
            <span className={ERROR_TEXT} role="alert">
              {submitError}
            </span>
          ) : null}
        </div>
      </form>

      <div className="mt-8 border-t-[0.5px] border-border pt-6">
        <h3 className={PANEL_TITLE}>現有系列</h3>
        {loadError ? (
          <div className={ERROR_TEXT} role="alert">
            {loadError}
          </div>
        ) : catalog === null ? (
          <div className={STATE_MSG}>載入中…</div>
        ) : catalog.length === 0 ? (
          <div className={EMPTY_MSG}>尚無系列。</div>
        ) : (
          <div className="flex flex-col gap-6">
            {grouped.map(([groupVolume, rows]) => (
              <section
                key={groupVolume}
                aria-labelledby={`series-volume-${groupVolume}`}
              >
                <h4
                  className="mb-2 text-[11px] uppercase tracking-[0.15em] text-primary"
                  id={`series-volume-${groupVolume}`}
                >
                  第 {groupVolume} 彈
                </h4>
                <div className="border-t-[0.5px] border-border">
                  {rows.map((row) => (
                    <div
                      key={row.name}
                      className={cn(
                        "grid grid-cols-[minmax(130px,0.7fr)_minmax(220px,1.5fr)_auto_auto] items-center gap-4 border-b-[0.5px] border-border px-2 py-3 max-[700px]:grid-cols-1 max-[700px]:gap-2",
                        editingName === row.name && "bg-primary/[0.04]",
                      )}
                    >
                      <strong className="font-serif text-[15px] font-medium text-foreground">
                        {row.name}
                      </strong>
                      <span className="text-[13px] leading-6 text-muted-foreground">
                        {row.characters.join("、")}
                      </span>
                      <div
                        className="flex flex-wrap gap-1.5"
                        aria-label="卡片級別"
                      >
                        {row.rarities.map((rarity) => (
                          <span
                            key={rarity}
                            className={cn(PILL_BASE, PILL_RARITY[rarity])}
                          >
                            {rarity}
                          </span>
                        ))}
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        className={cn(
                          BTN_GHOST_SM,
                          "justify-self-end max-[700px]:justify-self-start",
                        )}
                        aria-label={`編輯系列 ${row.name}`}
                        onClick={() => editSeries(row)}
                      >
                        <Pencil data-icon="inline-start" />
                        編輯
                      </Button>
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
