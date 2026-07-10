-- 0007_pending_purchases.sql - purchase reservations that do not enter the
-- physical collection until their delivery is confirmed.

CREATE TABLE purchase_reservations (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  seller     TEXT,
  ordered_at TEXT NOT NULL,
  note       TEXT,
  status     TEXT NOT NULL DEFAULT 'pending'
             CHECK (status IN ('pending', 'received', 'cancelled')),
  received_at  TEXT,
  cancelled_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE purchase_reservation_lines (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  reservation_id INTEGER NOT NULL REFERENCES purchase_reservations(id) ON DELETE CASCADE,
  catalog_id     INTEGER NOT NULL REFERENCES card_catalog(id),
  qty            INTEGER NOT NULL CHECK (qty > 0),
  unit_price     REAL NOT NULL CHECK (unit_price >= 0)
);

CREATE INDEX idx_purchase_reservation_lines_reservation
  ON purchase_reservation_lines(reservation_id);

CREATE INDEX idx_purchase_reservations_status
  ON purchase_reservations(status);

ALTER TABLE cards ADD COLUMN purchase_reservation_id INTEGER
  REFERENCES purchase_reservations(id);

CREATE INDEX idx_cards_purchase_reservation
  ON cards(purchase_reservation_id);
