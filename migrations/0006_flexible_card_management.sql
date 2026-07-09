-- 0006_flexible_card_management.sql - dynamic catalog, numbered packs,
-- purchase costs, and physical-card trade reservations.

ALTER TABLE series ADD COLUMN volume_number INTEGER NOT NULL DEFAULT 1
  CHECK (volume_number > 0);

INSERT INTO series (name, sort_order, is_active, volume_number)
SELECT series,
       MIN(sort_order),
       1,
       CASE series
         WHEN 'NEW YEAR' THEN 1
         WHEN 'BUNNY GIRL' THEN 1
         WHEN 'KILLER' THEN 1
         WHEN 'MP 4TH' THEN 2
         ELSE 1
       END
FROM card_catalog
GROUP BY series
ON CONFLICT(name) DO UPDATE SET volume_number = excluded.volume_number;

ALTER TABLE cards ADD COLUMN purchase_price REAL
  CHECK (purchase_price IS NULL OR purchase_price >= 0);

ALTER TABLE openings ADD COLUMN pack_number INTEGER;

-- Give every legacy opening a stable number within its series. `IS` also
-- groups the legacy NULL-series openings, even though all new openings require
-- a series.
UPDATE openings AS opening
SET pack_number = (
  SELECT COUNT(*)
  FROM openings AS earlier
  WHERE earlier.series IS opening.series
    AND earlier.id <= opening.id
);

CREATE UNIQUE INDEX idx_openings_series_pack
  ON openings(series, pack_number)
  WHERE series IS NOT NULL AND pack_number IS NOT NULL;

ALTER TABLE trade_reservation_lines ADD COLUMN card_id INTEGER REFERENCES cards(id);

CREATE UNIQUE INDEX idx_resv_lines_give_card
  ON trade_reservation_lines(card_id)
  WHERE direction = 'give' AND card_id IS NOT NULL;
