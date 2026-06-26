-- 0001_init.sql — schema per SPEC §6 (TWD only, no currency columns)

-- Master list of every collectible card type (the "universe").
CREATE TABLE card_catalog (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  series     TEXT    NOT NULL,
  character  TEXT    NOT NULL,
  rarity     TEXT    NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  UNIQUE (series, character, rarity)
);

-- Series metadata (ordering / active flag) for UI and future expansion.
CREATE TABLE series (
  name       TEXT    PRIMARY KEY,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active  INTEGER NOT NULL DEFAULT 1
);

-- Pack opening events (optional parent of cards) for cost analysis.
CREATE TABLE openings (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  series     TEXT,
  opened_at  TEXT    NOT NULL,
  cost       REAL,
  note       TEXT,
  created_at TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- Physical cards the owner has (or once had).
CREATE TABLE cards (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  catalog_id     INTEGER NOT NULL REFERENCES card_catalog(id),
  status         TEXT    NOT NULL DEFAULT 'owned',
  source         TEXT    NOT NULL DEFAULT 'pull',
  opening_id     INTEGER REFERENCES openings(id),
  asking_price   REAL,
  want_in_return TEXT,
  note           TEXT,
  created_at     TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- Completed sale / trade history.
CREATE TABLE transactions (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  card_id             INTEGER NOT NULL REFERENCES cards(id),
  type                TEXT    NOT NULL,
  counterparty        TEXT,
  price               REAL,
  received_catalog_id INTEGER REFERENCES card_catalog(id),
  received_card_id    INTEGER REFERENCES cards(id),
  happened_at         TEXT    NOT NULL,
  note                TEXT,
  created_at          TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_cards_catalog ON cards(catalog_id);
CREATE INDEX idx_cards_status  ON cards(status);
CREATE INDEX idx_cards_opening ON cards(opening_id);
CREATE INDEX idx_txn_card      ON transactions(card_id);
