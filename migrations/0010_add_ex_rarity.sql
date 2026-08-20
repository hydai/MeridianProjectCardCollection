-- 0010_add_ex_rarity.sql - EX debuts with Vol.3. Backfill one EX catalog
-- type per character for every series already assigned to Vol.3 or later.

INSERT INTO card_catalog (series, character, rarity, sort_order)
SELECT
  s.name,
  c.character,
  'EX',
  (SELECT COALESCE(MAX(sort_order), -1) FROM card_catalog)
    + ROW_NUMBER() OVER (
        ORDER BY s.sort_order, MIN(c.sort_order), c.character
      )
FROM series s
JOIN card_catalog c ON c.series = s.name
WHERE s.volume_number >= 3
  AND NOT EXISTS (
    SELECT 1
    FROM card_catalog existing_ex
    WHERE existing_ex.series = s.name
      AND existing_ex.character = c.character
      AND existing_ex.rarity = 'EX'
  )
GROUP BY s.name, s.sort_order, c.character;

-- Newly inserted EX rows initially sit at the tail. Rebuild the global order
-- so each character remains R / SR / SSR / UR / EX while preserving series and
-- character first-appearance order.
WITH character_order AS MATERIALIZED (
  SELECT series, character, MIN(sort_order) AS first_sort_order
  FROM card_catalog
  GROUP BY series, character
), normalized AS MATERIALIZED (
  SELECT
    c.id,
    ROW_NUMBER() OVER (
      ORDER BY
        s.sort_order,
        character_order.first_sort_order,
        CASE c.rarity
          WHEN 'R' THEN 0
          WHEN 'SR' THEN 1
          WHEN 'SSR' THEN 2
          WHEN 'UR' THEN 3
          WHEN 'EX' THEN 4
          ELSE 5
        END,
        c.id
    ) - 1 AS normalized_sort_order
  FROM card_catalog c
  JOIN series s ON s.name = c.series
  JOIN character_order
    ON character_order.series = c.series
   AND character_order.character = c.character
)
UPDATE card_catalog
SET sort_order = (
  SELECT normalized_sort_order
  FROM normalized
  WHERE normalized.id = card_catalog.id
);
