CREATE INDEX idx_resv_lines_catalog_direction
  ON trade_reservation_lines(catalog_id, direction);
