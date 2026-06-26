import { type Matrix, RARITIES, exists, getN, sumRow } from "../collection";
import { NumCell } from "./shared";

export function ByCharacter({ m }: { m: Matrix }) {
  return (
    <section className="view view-char">
      {m.characters.map((charName, ci) => {
        const seriesIdxs = m.series
          .map((_s, si) => si)
          .filter((si) => exists(m, si, ci));
        const totalsByRarity = RARITIES.map((_r, ri) =>
          seriesIdxs.reduce((sum, si) => sum + getN(m, si, ci, ri), 0),
        );
        const charTotal = sumRow(totalsByRarity);
        return (
          <article className="card" key={charName}>
            <header className="card-header">
              <h2 className="card-title">{charName}</h2>
              <span className="card-count">
                Total · <strong>{charTotal}</strong> 張
              </span>
            </header>
            <table>
              <thead>
                <tr>
                  <th className="col-name">系列</th>
                  <th className="th-r">R</th>
                  <th className="th-sr">SR</th>
                  <th className="th-ssr">SSR</th>
                  <th className="th-ur">UR</th>
                  <th className="col-total">合計</th>
                </tr>
              </thead>
              <tbody>
                {seriesIdxs.map((si) => {
                  const rowTotal = RARITIES.reduce(
                    (sum, _r, ri) => sum + getN(m, si, ci, ri),
                    0,
                  );
                  return (
                    <tr key={m.series[si]}>
                      <td className="col-name">{m.series[si]}</td>
                      {RARITIES.map((rarity, ri) => (
                        <NumCell key={rarity} n={getN(m, si, ci, ri)} ri={ri} />
                      ))}
                      <td
                        className={`col-total ${rowTotal === 0 ? "zero" : ""}`}
                      >
                        {rowTotal}
                      </td>
                    </tr>
                  );
                })}
                <tr className="subtotal">
                  <td className="col-name">小計</td>
                  {RARITIES.map((rarity, ri) => (
                    <NumCell key={rarity} n={totalsByRarity[ri]} ri={ri} />
                  ))}
                  <td className="col-total">{charTotal}</td>
                </tr>
              </tbody>
            </table>
          </article>
        );
      })}
    </section>
  );
}

export function BySeries({ m }: { m: Matrix }) {
  return (
    <section className="view view-series">
      {m.series.map((seriesName, si) => {
        const charIdxs = m.characters
          .map((_c, ci) => ci)
          .filter((ci) => exists(m, si, ci));
        const totalsByRarity = RARITIES.map((_r, ri) =>
          charIdxs.reduce((sum, ci) => sum + getN(m, si, ci, ri), 0),
        );
        const seriesTotal = sumRow(totalsByRarity);
        return (
          <article className="card" key={seriesName}>
            <header className="card-header">
              <h2 className="card-title is-series">{seriesName}</h2>
              <span className="card-count">
                Total · <strong>{seriesTotal}</strong> 張
              </span>
            </header>
            <table>
              <thead>
                <tr>
                  <th className="col-name">角色</th>
                  <th className="th-r">R</th>
                  <th className="th-sr">SR</th>
                  <th className="th-ssr">SSR</th>
                  <th className="th-ur">UR</th>
                  <th className="col-total">合計</th>
                </tr>
              </thead>
              <tbody>
                {charIdxs.map((ci) => {
                  const rowTotal = RARITIES.reduce(
                    (sum, _r, ri) => sum + getN(m, si, ci, ri),
                    0,
                  );
                  return (
                    <tr key={m.characters[ci]}>
                      <td className="col-name">{m.characters[ci]}</td>
                      {RARITIES.map((rarity, ri) => (
                        <NumCell key={rarity} n={getN(m, si, ci, ri)} ri={ri} />
                      ))}
                      <td
                        className={`col-total ${rowTotal === 0 ? "zero" : ""}`}
                      >
                        {rowTotal}
                      </td>
                    </tr>
                  );
                })}
                <tr className="subtotal">
                  <td className="col-name">小計</td>
                  {RARITIES.map((rarity, ri) => (
                    <NumCell key={rarity} n={totalsByRarity[ri]} ri={ri} />
                  ))}
                  <td className="col-total">{seriesTotal}</td>
                </tr>
              </tbody>
            </table>
          </article>
        );
      })}
    </section>
  );
}

const RARITY_LABELS = ["普通", "較稀有", "稀有", "最稀有"];

export function ByRarity({ m }: { m: Matrix }) {
  return (
    <section className="view view-rarity">
      {RARITIES.map((rarityName, ri) => {
        const totalsBySeries = m.series.map((_s, si) =>
          m.characters.reduce((sum, _c, ci) => sum + getN(m, si, ci, ri), 0),
        );
        const rarityTotal = sumRow(totalsBySeries);
        const rk = rarityName.toLowerCase();
        return (
          <article className="card" key={rarityName}>
            <header className="card-header">
              <h2 className={`card-title is-rarity ${rk}`}>{rarityName}</h2>
              <span className="card-count">
                {RARITY_LABELS[ri]} · <strong>{rarityTotal}</strong> 張
              </span>
            </header>
            <table>
              <thead>
                <tr>
                  <th className="col-name">角色</th>
                  {m.series.map((s) => (
                    <th key={s}>{s}</th>
                  ))}
                  <th className="col-total">合計</th>
                </tr>
              </thead>
              <tbody>
                {m.characters.map((charName, ci) => {
                  const rowTotal = m.series.reduce(
                    (sum, _s, si) => sum + getN(m, si, ci, ri),
                    0,
                  );
                  return (
                    <tr key={charName}>
                      <td className="col-name">{charName}</td>
                      {m.series.map((s, si) =>
                        exists(m, si, ci) ? (
                          <NumCell key={s} n={getN(m, si, ci, ri)} ri={ri} />
                        ) : (
                          <td className="na" key={s}>
                            —
                          </td>
                        ),
                      )}
                      <td
                        className={`col-total ${rowTotal === 0 ? "zero" : ""}`}
                      >
                        {rowTotal}
                      </td>
                    </tr>
                  );
                })}
                <tr className="subtotal">
                  <td className="col-name">小計</td>
                  {m.series.map((s, si) => (
                    <NumCell key={s} n={totalsBySeries[si]} ri={ri} />
                  ))}
                  <td className="col-total">{rarityTotal}</td>
                </tr>
              </tbody>
            </table>
          </article>
        );
      })}
    </section>
  );
}
