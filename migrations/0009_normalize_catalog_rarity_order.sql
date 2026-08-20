-- 0009_normalize_catalog_rarity_order.sql - restore R/SR/SSR/UR ordering for
-- series created after a rarity toggle was deselected and selected again.

WITH normalized AS MATERIALIZED (
  SELECT
    id,
    MIN(sort_order) OVER (PARTITION BY series, character)
      + ROW_NUMBER() OVER (
          PARTITION BY series, character
          ORDER BY CASE rarity
            WHEN 'R' THEN 0
            WHEN 'SR' THEN 1
            WHEN 'SSR' THEN 2
            WHEN 'UR' THEN 3
            ELSE 4
          END
        ) - 1 AS normalized_sort_order
  FROM card_catalog
)
UPDATE card_catalog
SET sort_order = (
  SELECT normalized_sort_order
  FROM normalized
  WHERE normalized.id = card_catalog.id
);
