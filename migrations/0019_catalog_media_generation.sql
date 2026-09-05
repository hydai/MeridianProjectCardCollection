ALTER TABLE catalog_media ADD COLUMN generation TEXT;

UPDATE catalog_media SET generation = lower(hex(randomblob(16)));

CREATE UNIQUE INDEX idx_catalog_media_generation ON catalog_media(generation);
