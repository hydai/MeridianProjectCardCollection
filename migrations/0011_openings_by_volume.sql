-- 0011_openings_by_volume.sql — a physical pack belongs to a volume, not a
-- single series. Cards in one pack may therefore come from any series in that
-- volume, and pack numbers advance once per volume.

ALTER TABLE openings ADD COLUMN volume_number INTEGER
  CHECK (volume_number IS NULL OR volume_number > 0);

-- Preserve legacy opening metadata while assigning every known series to its
-- configured volume. Unknown/null legacy series remain nullable.
UPDATE openings
SET volume_number = (
  SELECT s.volume_number
  FROM series s
  WHERE s.name = openings.series
)
WHERE series IS NOT NULL;

-- Older imports may have left openings.series null even though every linked
-- card came from the same volume. Infer those safely from their card rows. A
-- genuinely mixed-volume legacy opening remains null rather than guessing.
UPDATE openings AS opening
SET volume_number = (
  SELECT MIN(s.volume_number)
  FROM cards c
  JOIN card_catalog catalog ON catalog.id = c.catalog_id
  JOIN series s ON s.name = catalog.series
  WHERE c.opening_id = opening.id
  HAVING COUNT(DISTINCT s.volume_number) = 1
)
WHERE opening.volume_number IS NULL;

DROP INDEX idx_openings_series_pack;

-- Legacy pack numbers were independent per series. Re-number them in stable
-- insertion order so each volume has one continuous sequence.
UPDATE openings AS opening
SET pack_number = (
  SELECT COUNT(*)
  FROM openings AS earlier
  WHERE earlier.volume_number = opening.volume_number
    AND earlier.id <= opening.id
)
WHERE opening.volume_number IS NOT NULL;

CREATE UNIQUE INDEX idx_openings_volume_pack
  ON openings(volume_number, pack_number)
  WHERE volume_number IS NOT NULL AND pack_number IS NOT NULL;
