-- Run once in the Neon SQL editor. Plain hand-run SQL rather than an
-- ORM/migration tool, kept lightweight on purpose — revisit if/when this
-- needs to evolve more formally (multiple environments, real migrations).

-- One row per team per week captured. Safe to re-run for the same week:
-- captureSnapshot() upserts on (league_id, roster_id, season, week).
CREATE TABLE IF NOT EXISTS roster_snapshots (
  id BIGSERIAL PRIMARY KEY,
  league_id TEXT NOT NULL,
  roster_id INTEGER NOT NULL,
  team_name TEXT NOT NULL,
  season TEXT NOT NULL,
  week INTEGER NOT NULL,
  starters JSONB NOT NULL,
  wins INTEGER NOT NULL DEFAULT 0,
  losses INTEGER NOT NULL DEFAULT 0,
  ties INTEGER NOT NULL DEFAULT 0,
  playoff_odds DOUBLE PRECISION NOT NULL,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (league_id, roster_id, season, week)
);

CREATE INDEX IF NOT EXISTS roster_snapshots_league_roster_idx
  ON roster_snapshots (league_id, roster_id);

-- One row per team per completed season, filled in separately (and later)
-- once a season actually ends — not written by captureSnapshot().
CREATE TABLE IF NOT EXISTS season_outcomes (
  id BIGSERIAL PRIMARY KEY,
  league_id TEXT NOT NULL,
  roster_id INTEGER NOT NULL,
  season TEXT NOT NULL,
  wins INTEGER NOT NULL,
  losses INTEGER NOT NULL,
  ties INTEGER NOT NULL DEFAULT 0,
  made_playoffs BOOLEAN NOT NULL DEFAULT false,
  won_championship BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (league_id, roster_id, season)
);
