-- 0012_activity_events.sql — unified append-only activity stream.
--
-- Events are the durable audit header; lines snapshot the affected card types so
-- history remains readable even when an acquisition is safely undone and its
-- physical card rows are removed later.

CREATE TABLE activity_events (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  source_key       TEXT    NOT NULL UNIQUE,
  kind             TEXT    NOT NULL,
  occurred_at      TEXT    NOT NULL,
  source_type      TEXT,
  source_id        INTEGER,
  counterparty     TEXT,
  amount           REAL,
  note             TEXT,
  reverts_event_id INTEGER REFERENCES activity_events(id),
  reversed_at      TEXT,
  created_at       TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE activity_event_lines (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id      INTEGER NOT NULL REFERENCES activity_events(id),
  catalog_id    INTEGER REFERENCES card_catalog(id),
  action        TEXT    NOT NULL,
  qty           INTEGER NOT NULL DEFAULT 1 CHECK (qty > 0),
  delta         INTEGER NOT NULL DEFAULT 0,
  before_status TEXT,
  after_status  TEXT,
  unit_amount   REAL,
  note          TEXT
);

CREATE INDEX idx_activity_events_occurred
  ON activity_events(occurred_at DESC, id DESC);
CREATE INDEX idx_activity_events_source
  ON activity_events(source_type, source_id, kind);
CREATE UNIQUE INDEX idx_activity_events_revert
  ON activity_events(reverts_event_id) WHERE reverts_event_id IS NOT NULL;
CREATE INDEX idx_activity_lines_event ON activity_event_lines(event_id);
CREATE INDEX idx_activity_lines_catalog ON activity_event_lines(catalog_id);
CREATE INDEX idx_txn_received_card ON transactions(received_card_id)
  WHERE received_card_id IS NOT NULL;

-- Every newly acquired physical card points back to the event that introduced
-- it. This makes acquisition undo dependency-aware without deleting history.
ALTER TABLE cards ADD COLUMN acquired_event_id INTEGER
  REFERENCES activity_events(id);
CREATE INDEX idx_cards_acquired_event ON cards(acquired_event_id);

-- Backfill pack openings.
INSERT INTO activity_events
  (source_key, kind, occurred_at, source_type, source_id, amount, note, created_at)
SELECT 'opening:' || id, 'opening', opened_at, 'opening', id, cost, note, created_at
FROM openings;

INSERT INTO activity_event_lines
  (event_id, catalog_id, action, qty, delta, after_status)
SELECT e.id, k.catalog_id, 'acquired', COUNT(k.id), COUNT(k.id), 'owned'
FROM openings o
JOIN activity_events e
  ON e.source_type = 'opening' AND e.source_id = o.id AND e.kind = 'opening'
JOIN cards k ON k.opening_id = o.id
GROUP BY e.id, k.catalog_id;

UPDATE cards
SET acquired_event_id = (
  SELECT e.id
  FROM activity_events e
  WHERE e.source_type = 'opening'
    AND e.source_id = cards.opening_id
    AND e.kind = 'opening'
)
WHERE opening_id IS NOT NULL;

-- Backfill completed sales and trades. Historic multi-card trades predate an
-- event group id, so each transaction becomes one faithful legacy event.
INSERT INTO activity_events
  (source_key, kind, occurred_at, source_type, source_id,
   counterparty, amount, note, created_at)
SELECT 'transaction:' || id, type, happened_at, 'transaction', id,
       counterparty, price, note, created_at
FROM transactions;

INSERT INTO activity_event_lines
  (event_id, catalog_id, action, qty, delta, before_status, after_status)
SELECT e.id, k.catalog_id, 'given', 1, -1, 'owned',
       CASE t.type WHEN 'sale' THEN 'sold' ELSE 'traded' END
FROM transactions t
JOIN activity_events e
  ON e.source_type = 'transaction' AND e.source_id = t.id
JOIN cards k ON k.id = t.card_id;

INSERT INTO activity_event_lines
  (event_id, catalog_id, action, qty, delta, after_status)
SELECT e.id, t.received_catalog_id, 'received', 1, 1, 'owned'
FROM transactions t
JOIN activity_events e
  ON e.source_type = 'transaction' AND e.source_id = t.id
WHERE t.received_catalog_id IS NOT NULL;

UPDATE cards
SET acquired_event_id = (
  SELECT e.id
  FROM transactions t
  JOIN activity_events e
    ON e.source_type = 'transaction' AND e.source_id = t.id
  WHERE t.received_card_id = cards.id
)
WHERE id IN (
  SELECT received_card_id FROM transactions WHERE received_card_id IS NOT NULL
);

-- Backfill purchase reservation lifecycle. Ordered, received and cancelled are
-- separate events because they happened at different times and have different
-- inventory effects.
INSERT INTO activity_events
  (source_key, kind, occurred_at, source_type, source_id,
   counterparty, amount, note, created_at)
SELECT 'purchase-ordered:' || r.id, 'purchase_ordered', r.ordered_at,
       'purchase_reservation', r.id, r.seller,
       (SELECT SUM(l.qty * l.unit_price)
        FROM purchase_reservation_lines l WHERE l.reservation_id = r.id),
       r.note, r.created_at
FROM purchase_reservations r;

INSERT INTO activity_event_lines
  (event_id, catalog_id, action, qty, delta, unit_amount)
SELECT e.id, l.catalog_id, 'ordered', l.qty, 0, l.unit_price
FROM purchase_reservation_lines l
JOIN activity_events e
  ON e.source_type = 'purchase_reservation'
 AND e.source_id = l.reservation_id
 AND e.kind = 'purchase_ordered';

INSERT INTO activity_events
  (source_key, kind, occurred_at, source_type, source_id,
   counterparty, amount, note, created_at)
SELECT 'purchase-received:' || r.id, 'purchase_received',
       COALESCE(r.received_at, r.ordered_at),
       'purchase_reservation', r.id, r.seller,
       (SELECT SUM(l.qty * l.unit_price)
        FROM purchase_reservation_lines l WHERE l.reservation_id = r.id),
       r.note, COALESCE(r.received_at, r.created_at)
FROM purchase_reservations r
WHERE r.status = 'received';

INSERT INTO activity_event_lines
  (event_id, catalog_id, action, qty, delta, unit_amount, after_status)
SELECT e.id, l.catalog_id, 'acquired', l.qty, l.qty, l.unit_price, 'owned'
FROM purchase_reservation_lines l
JOIN activity_events e
  ON e.source_type = 'purchase_reservation'
 AND e.source_id = l.reservation_id
 AND e.kind = 'purchase_received';

UPDATE cards
SET acquired_event_id = (
  SELECT e.id
  FROM activity_events e
  WHERE e.source_type = 'purchase_reservation'
    AND e.source_id = cards.purchase_reservation_id
    AND e.kind = 'purchase_received'
)
WHERE purchase_reservation_id IS NOT NULL;

INSERT INTO activity_events
  (source_key, kind, occurred_at, source_type, source_id,
   counterparty, amount, note, created_at)
SELECT 'purchase-cancelled:' || r.id, 'purchase_cancelled',
       COALESCE(r.cancelled_at, r.ordered_at),
       'purchase_reservation', r.id, r.seller,
       (SELECT SUM(l.qty * l.unit_price)
        FROM purchase_reservation_lines l WHERE l.reservation_id = r.id),
       r.note, COALESCE(r.cancelled_at, r.created_at)
FROM purchase_reservations r
WHERE r.status = 'cancelled';

INSERT INTO activity_event_lines
  (event_id, catalog_id, action, qty, delta, unit_amount)
SELECT e.id, l.catalog_id, 'cancelled', l.qty, 0, l.unit_price
FROM purchase_reservation_lines l
JOIN activity_events e
  ON e.source_type = 'purchase_reservation'
 AND e.source_id = l.reservation_id
 AND e.kind = 'purchase_cancelled';

-- Existing trade reservations are still pending (completed/cancelled rows are
-- deleted by the legacy workflow), so snapshot them as open lifecycle events.
INSERT INTO activity_events
  (source_key, kind, occurred_at, source_type, source_id,
   counterparty, note, created_at)
SELECT 'trade-reserved:' || id, 'trade_reserved', reserved_at,
       'trade_reservation', id, counterparty, note, created_at
FROM trade_reservations;

INSERT INTO activity_event_lines
  (event_id, catalog_id, action, qty, delta)
SELECT e.id, l.catalog_id,
       CASE l.direction
         WHEN 'give' THEN 'reserved_give'
         ELSE 'reserved_receive'
       END,
       SUM(l.qty), 0
FROM trade_reservation_lines l
JOIN activity_events e
  ON e.source_type = 'trade_reservation'
 AND e.source_id = l.reservation_id
 AND e.kind = 'trade_reserved'
GROUP BY e.id, l.catalog_id, l.direction;
