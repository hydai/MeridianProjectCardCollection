import { useEffect, useRef, useState } from "react";
import { ACQUISITION_KEY_PATTERN } from "../../shared/card-batch";
import type {
  AcquisitionEventInput,
  AddCardInput,
  OpeningInput,
} from "../../shared/types";
import { ApiError, postCards } from "../api";

interface AcquisitionRequest {
  cards: AddCardInput[];
  opening?: OpeningInput;
  acquisition?: AcquisitionEventInput;
}

interface Operation {
  id: string;
  request: AcquisitionRequest;
  uncertain: boolean;
  rejected?: boolean;
}

function readOperation(key: string): Operation | null {
  const stored = sessionStorage.getItem(key);
  if (!stored) return null;
  const operation = JSON.parse(stored) as Operation;
  if (
    typeof operation.id !== "string" ||
    !ACQUISITION_KEY_PATTERN.test(operation.id) ||
    !Array.isArray(operation.request?.cards) ||
    typeof operation.uncertain !== "boolean"
  ) {
    throw new Error("未確認的入藏操作資料無效，請勿重新建立同一筆入藏。");
  }
  return { ...operation, uncertain: operation.rejected !== true };
}

function operationId(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return [...crypto.getRandomValues(new Uint8Array(16))]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export function useAcquisitionSubmission(scope: string) {
  const storageKey = `mpc:pending-acquisition:${scope}`;
  const [initial] = useState(() => {
    try {
      return { operation: readOperation(storageKey), error: null };
    } catch (cause) {
      return {
        operation: null,
        error: `無法讀取未確認的入藏操作，請先恢復分頁儲存後重新載入：${String(cause)}`,
      };
    }
  });
  const operation = useRef(initial.operation);
  const inFlight = useRef(false);
  const active = useRef(false);
  const [pending, setPending] = useState(initial.operation);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(initial.error);

  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);

  const submit = async (createRequest: () => AcquisitionRequest) => {
    if (inFlight.current || initial.error) return null;
    const previous = operation.current;
    const current: Operation = previous?.uncertain
      ? previous
      : {
          id: previous?.id ?? operationId(),
          request: JSON.parse(JSON.stringify(createRequest())),
          uncertain: false,
        };
    const wasUncertain = current.uncertain;
    inFlight.current = true;
    operation.current = current;
    setBusy(true);
    setError(null);

    try {
      sessionStorage.setItem(
        storageKey,
        JSON.stringify({ ...current, uncertain: true }),
      );
    } catch (cause) {
      inFlight.current = false;
      setBusy(false);
      setError(
        `無法保留重試識別碼，這次請求未送出${wasUncertain ? "；原操作仍待確認" : ""}：${String(cause)}`,
      );
      return null;
    }

    current.uncertain = true;
    setPending({ ...current });
    try {
      const result = await postCards(
        current.request.cards,
        current.request.opening,
        current.request.acquisition,
        current.id,
      );
      if (!Array.isArray(result.ids)) {
        throw new Error("入藏回應缺少卡片識別碼。");
      }
      if (!active.current) return null;
      operation.current = null;
      try {
        if (readOperation(storageKey)?.id === current.id) {
          sessionStorage.removeItem(storageKey);
        }
      } catch (cause) {
        if (active.current) {
          setError(`入藏已完成，但未能清除本機重試紀錄：${String(cause)}`);
        }
      }
      if (active.current) setPending(null);
      return active.current ? { result, request: current.request } : null;
    } catch (cause) {
      const rejected =
        !wasUncertain &&
        cause instanceof ApiError &&
        cause.acquisitionOutcome === "rejected";
      current.uncertain = !rejected;
      current.rejected = rejected;
      let persistenceError = "";
      try {
        if (readOperation(storageKey)?.id === current.id) {
          sessionStorage.setItem(storageKey, JSON.stringify(current));
        }
      } catch (storageCause) {
        persistenceError = `；重試紀錄未能更新，請勿關閉分頁：${String(storageCause)}`;
      }
      if (active.current) {
        setPending({ ...current });
        setError(
          rejected
            ? `入藏資料遭拒，尚未寫入；請修正後重試：${String(cause)}${persistenceError}`
            : `未能確認入藏結果，請重試原送出內容，勿另建相同入藏：${String(cause)}${persistenceError}`,
        );
      }
      return null;
    } finally {
      inFlight.current = false;
      if (active.current) setBusy(false);
    }
  };

  return {
    busy,
    locked: busy || Boolean(pending?.uncertain) || Boolean(initial.error),
    pending,
    error,
    submit,
  };
}
