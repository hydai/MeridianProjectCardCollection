ALTER TABLE cards ADD COLUMN mutation_version INTEGER NOT NULL DEFAULT 0
  CHECK (mutation_version >= 0);

CREATE TRIGGER cards_mutation_version
AFTER UPDATE ON cards
WHEN NEW.mutation_version = OLD.mutation_version
BEGIN
  UPDATE cards
  SET mutation_version = OLD.mutation_version + 1
  WHERE id = NEW.id;
END;
