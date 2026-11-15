CREATE TABLE IF NOT EXISTS runs (
  id uuid PRIMARY KEY,
  token_hash text NOT NULL,
  started_at timestamptz NOT NULL,
  finished_at timestamptz,
  outcome text CHECK (outcome IN ('victory', 'defeat', 'abandoned'))
);
-- Regular PostgreSQL tables keep retry deduplication simple for this first slice.
-- Tiger Data supports these tables; a hypertable can follow when event volume warrants it.
CREATE TABLE IF NOT EXISTS fight_events (
  run_id uuid NOT NULL REFERENCES runs(id),
  id uuid NOT NULL,
  occurred_at timestamptz NOT NULL,
  elapsed_ms integer NOT NULL CHECK (elapsed_ms >= 0),
  action text NOT NULL,
  source text NOT NULL CHECK (source IN ('keyboard', 'chert', 'harness')),
  phase text,
  value double precision,
  PRIMARY KEY (run_id, id)
);
CREATE INDEX IF NOT EXISTS fight_events_run_time ON fight_events(run_id, occurred_at);
