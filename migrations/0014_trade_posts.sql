-- 0014_trade_posts.sql — durable, shareable exchange-announcement snapshots.
--
-- Drafts may be edited or deleted by the owner. Once published, their lines
-- are immutable: live inventory changes are surfaced as stale availability
-- rather than rewriting or erasing what was originally announced.

CREATE TABLE trade_posts (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  public_id    TEXT    NOT NULL UNIQUE,
  status       TEXT    NOT NULL DEFAULT 'draft'
                       CHECK (status IN ('draft', 'published', 'closed')),
  note         TEXT,
  created_at   TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT    NOT NULL DEFAULT (datetime('now')),
  published_at TEXT,
  closed_at    TEXT
);

CREATE TABLE trade_post_lines (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id            INTEGER NOT NULL
                     REFERENCES trade_posts(id) ON DELETE CASCADE,
  direction          TEXT    NOT NULL
                     CHECK (direction IN ('give', 'want')),
  catalog_id         INTEGER
                     REFERENCES card_catalog(id) ON DELETE SET NULL,
  snapshot_series    TEXT    NOT NULL,
  snapshot_character TEXT    NOT NULL,
  snapshot_rarity    TEXT    NOT NULL,
  qty                INTEGER NOT NULL CHECK (qty BETWEEN 1 AND 99),
  UNIQUE (post_id, direction, catalog_id)
);

CREATE INDEX idx_trade_posts_public
  ON trade_posts(status, published_at DESC, id DESC);
CREATE INDEX idx_trade_post_lines_post ON trade_post_lines(post_id, id);
CREATE INDEX idx_trade_post_lines_catalog ON trade_post_lines(catalog_id);
