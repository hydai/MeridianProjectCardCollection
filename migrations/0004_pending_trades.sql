-- 0004_pending_trades.sql — 暫定交換預約（SPEC：等待交換中）
-- 與 0002/0003 一致：不使用 BEGIN/COMMIT（遠端 D1 套用 migration 限制）。

CREATE TABLE trade_reservations (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  counterparty TEXT,                              -- 對象（選填；僅後台可見，完成/取消時刪除）
  reserved_at  TEXT    NOT NULL,                  -- 預約日期 YYYY-MM-DD
  note         TEXT,                              -- 備註（選填；僅後台可見，完成/取消時刪除）
  created_at   TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE trade_reservation_lines (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  reservation_id INTEGER NOT NULL REFERENCES trade_reservations(id),
  direction      TEXT    NOT NULL,                -- 'give'（我給出）/ 'receive'（我換入）
  catalog_id     INTEGER NOT NULL REFERENCES card_catalog(id),
  qty            INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX idx_resv_lines_resv ON trade_reservation_lines(reservation_id);
