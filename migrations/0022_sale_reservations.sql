-- Sale reservations lock physical cards without removing them from holdings.
-- Terminal reservations and their agreed prices remain available for history.
CREATE TABLE sale_reservations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  counterparty TEXT,
  reserved_at TEXT NOT NULL,
  note TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'completed', 'cancelled')),
  completed_at TEXT,
  cancelled_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE sale_reservation_lines (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  reservation_id INTEGER NOT NULL REFERENCES sale_reservations(id),
  card_id INTEGER NOT NULL REFERENCES cards(id),
  catalog_id INTEGER NOT NULL REFERENCES card_catalog(id),
  unit_price REAL NOT NULL CHECK (unit_price >= 0),
  UNIQUE (reservation_id, card_id)
);
CREATE INDEX idx_sale_lines_card ON sale_reservation_lines(card_id);
CREATE INDEX idx_sale_lines_catalog ON sale_reservation_lines(catalog_id);
CREATE INDEX idx_sale_reservations_status ON sale_reservations(status);

CREATE VIEW pending_sale_cards AS
SELECT l.card_id, l.catalog_id, l.reservation_id
FROM sale_reservation_lines l
JOIN sale_reservations r ON r.id = l.reservation_id
WHERE r.status = 'pending';
