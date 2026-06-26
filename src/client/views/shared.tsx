import { RARITY_KEYS } from "../collection";

export function NumCell({ n, ri }: { n: number; ri: number }) {
  if (n === 0) return <td className="zero">·</td>;
  return <td className={`num-${RARITY_KEYS[ri]}`}>{n}</td>;
}

export function MissChip({
  ri,
  label,
  count,
}: { ri: number; label: string; count?: number }) {
  return (
    <span className={`miss-chip ${RARITY_KEYS[ri]}`}>
      {label}
      {count && count > 1 ? <span className="own-count">{count}</span> : null}
    </span>
  );
}
