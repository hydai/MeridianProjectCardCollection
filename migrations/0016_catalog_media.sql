-- Catalog-level media metadata. The binary originals live in R2; D1 keeps
-- their identity, provenance, and revision so every catalog slot has a stable
-- public URL without tying an image to one physical copy.
CREATE TABLE catalog_media (
  catalog_id        INTEGER NOT NULL REFERENCES card_catalog(id) ON DELETE CASCADE,
  side              TEXT    NOT NULL CHECK (side IN ('front', 'back')),
  object_key        TEXT    NOT NULL UNIQUE,
  content_type      TEXT    NOT NULL,
  byte_size         INTEGER NOT NULL CHECK (byte_size > 0),
  etag              TEXT    NOT NULL,
  original_filename TEXT,
  revision          INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at        TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at        TEXT    NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (catalog_id, side)
);

CREATE INDEX idx_catalog_media_updated
  ON catalog_media(updated_at DESC, catalog_id);
