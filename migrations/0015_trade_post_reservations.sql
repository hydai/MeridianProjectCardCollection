-- 0015_trade_post_reservations.sql — trace announcement-sourced reservations.
--
-- A published announcement may lead to multiple private reservations. The
-- reservation row keeps the live workflow link, while every lifecycle event
-- keeps the same origin after the pending row is completed or cancelled.

ALTER TABLE trade_reservations ADD COLUMN trade_post_id INTEGER
  REFERENCES trade_posts(id) ON DELETE SET NULL;

CREATE INDEX idx_trade_reservations_trade_post
  ON trade_reservations(trade_post_id);

ALTER TABLE activity_events ADD COLUMN trade_post_id INTEGER
  REFERENCES trade_posts(id) ON DELETE SET NULL;

CREATE INDEX idx_activity_events_trade_post
  ON activity_events(trade_post_id, id DESC);

-- Existing announcement lifecycle events predate the explicit origin column.
UPDATE activity_events
SET trade_post_id = source_id
WHERE source_type = 'trade_post'
  AND source_id IN (SELECT id FROM trade_posts);
