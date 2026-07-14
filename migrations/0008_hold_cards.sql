-- 0008_hold_cards.sql — owner-held cards (保留): a per-card flag that locks a
-- duplicate out of the auto-computed tradeable ("可換出") surplus without
-- changing its status. A held card is still 'owned' — it keeps counting toward
-- the collection grid, completion %, and stats; only `available` excludes it.
-- Kept mutually exclusive with a pending-trade reservation so neither the
-- overview's `reserved` nor `held` count subtracts the same card twice.
-- Consistent with 0002–0007: no BEGIN/COMMIT (remote D1 migration constraint).

ALTER TABLE cards ADD COLUMN held INTEGER NOT NULL DEFAULT 0
  CHECK (held IN (0, 1));

CREATE INDEX idx_cards_held ON cards(held) WHERE held = 1;
