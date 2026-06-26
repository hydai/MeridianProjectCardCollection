import { type Matrix, grandTotalByRarity, sumRow } from "../collection";

export function StatsBar({ m }: { m: Matrix }) {
  const byRarity = grandTotalByRarity(m);
  const cells = [
    { value: sumRow(byRarity), label: "張總計", cls: "" },
    { value: byRarity[0], label: "R", cls: "" },
    { value: byRarity[1], label: "SR", cls: "is-sr" },
    { value: byRarity[2], label: "SSR", cls: "is-ssr" },
    { value: byRarity[3], label: "UR", cls: "is-ur" },
  ];
  return (
    <div className="stats">
      {cells.map((c) => (
        <div className="stat" key={c.label}>
          <div className={`stat-value ${c.cls}`}>{c.value}</div>
          <div className="stat-label">{c.label}</div>
        </div>
      ))}
    </div>
  );
}
