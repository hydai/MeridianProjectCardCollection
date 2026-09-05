ALTER TABLE activity_events ADD COLUMN request_key TEXT;
ALTER TABLE activity_events ADD COLUMN request_hash TEXT;
ALTER TABLE activity_events ADD COLUMN request_result TEXT
  CHECK (request_result IS NULL OR json_valid(request_result));

CREATE UNIQUE INDEX idx_activity_events_request
  ON activity_events(request_key) WHERE request_key IS NOT NULL;
