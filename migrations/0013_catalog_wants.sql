-- 0013_catalog_wants.sql — explicit per-catalog collection targets.
--
-- Missing remains a derived inventory fact. A row here means the owner has
-- actively marked a card type as Want, with a desired physical-card count.

CREATE TABLE catalog_wants (
  catalog_id    INTEGER PRIMARY KEY
                REFERENCES card_catalog(id) ON DELETE CASCADE,
  desired_count INTEGER NOT NULL CHECK (desired_count BETWEEN 1 AND 99),
  updated_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- Want changes are inventory-neutral but still belong in the unified audit
-- stream. Snapshot both sides so history remains readable after later edits.
ALTER TABLE activity_event_lines ADD COLUMN before_want INTEGER;
ALTER TABLE activity_event_lines ADD COLUMN after_want INTEGER;
