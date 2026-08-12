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

-- Beta waitlist signups from the marketing landing page. league_id is
-- optional context for a future invite flow, not populated by the current
-- signup form.
CREATE TABLE IF NOT EXISTS beta_signups (
  id BIGSERIAL PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  league_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Every Sleeper league ID a real visitor has successfully validated via
-- /start. The weekly snapshot Cron (app/api/snapshot/route.ts) loops over
-- this table instead of a single hardcoded league. Upserted from
-- validateLeagueId() on every successful validation — last_seen advances
-- each time, first_seen only set once.
CREATE TABLE IF NOT EXISTS tracked_leagues (
  league_id TEXT PRIMARY KEY,
  first_seen TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Free-text feedback from beta testers. Deliberately a separate table from
-- beta_signups rather than an extra column on it: signups are one-time-
-- per-email (UNIQUE, enforced by submitBetaSignup()'s duplicate check),
-- while the same person can send feedback multiple times over the beta —
-- a different shape/cardinality, not just more columns on the same row.
CREATE TABLE IF NOT EXISTS beta_feedback (
  id BIGSERIAL PRIMARY KEY,
  email TEXT NOT NULL,
  feedback TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS beta_feedback_email_idx ON beta_feedback (email);

-- Manually-entered leagues (no Sleeper connection) — teams/rosters/records
-- typed in and edited by hand. id is generated as "manual-<uuid>" in
-- lib/manual-league.ts and used directly as the app's leagueId route
-- param; real Sleeper league IDs are always plain numeric strings, so
-- there's no collision risk and no separate "source" flag is needed
-- anywhere else in the app — everything branches on this ID's prefix.
CREATE TABLE IF NOT EXISTS manual_leagues (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS manual_teams (
  id BIGSERIAL PRIMARY KEY,
  league_id TEXT NOT NULL REFERENCES manual_leagues(id) ON DELETE CASCADE,
  team_name TEXT NOT NULL,
  wins INTEGER NOT NULL DEFAULT 0,
  losses INTEGER NOT NULL DEFAULT 0,
  ties INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS manual_teams_league_idx ON manual_teams (league_id);

-- sleeper_player_id is a real Sleeper player ID, used purely as a stable
-- key into the existing global player catalog (getAllPlayers()) and
-- FantasyCalc values (getPlayerValues()) for name/position/trade-value —
-- no live roster sync, the user adds/removes these by hand.
CREATE TABLE IF NOT EXISTS manual_team_players (
  id BIGSERIAL PRIMARY KEY,
  team_id BIGINT NOT NULL REFERENCES manual_teams(id) ON DELETE CASCADE,
  sleeper_player_id TEXT NOT NULL,
  added_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (team_id, sleeper_player_id)
);

CREATE INDEX IF NOT EXISTS manual_team_players_team_idx ON manual_team_players (team_id);

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

-- Distilled per-season positional scoring tiers, computed from 13 seasons
-- (2012-2025) of real NFL performance data by
-- scripts/ingest-position-baselines.ts. The source CSVs (~340MB at the
-- largest) never touch production — only this small summary table does.
-- One row per season so multi-season averaging can happen at query time
-- (lib/position-baselines.ts) without re-running ingestion to change the
-- window.
CREATE TABLE IF NOT EXISTS position_scoring_baselines (
  id BIGSERIAL PRIMARY KEY,
  season TEXT NOT NULL,
  position TEXT NOT NULL,
  scoring_format TEXT NOT NULL, -- 'standard' | 'half_ppr' | 'ppr'
  tier TEXT NOT NULL, -- 'top_12' | 'top_24' | 'top_36' | 'replacement_level'
  points_threshold NUMERIC NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (season, position, scoring_format, tier)
);

-- Current FantasyPros overall-rank snapshot, converted to a FantasyCalc-
-- comparable value scale by scripts/ingest-fantasypros-values.ts. One row
-- per player (no season/week dimension, "current" like FantasyCalc's own
-- live values) — re-running the script with a fresh weekly CSV export
-- upserts and replaces, it doesn't accumulate history. Read by
-- lib/fantasycalc.ts's getPlayerValues() to blend into FantasyCalc's value
-- (average when both sources have a player, this value alone when only
-- FantasyPros does).
CREATE TABLE IF NOT EXISTS fantasypros_values (
  sleeper_player_id TEXT PRIMARY KEY,
  player_name TEXT NOT NULL,
  position TEXT NOT NULL,
  -- FantasyPros' own position-relative rank (e.g. "WR45" -> 45) — used as
  -- TradeablePlayer.positionRank for players FantasyCalc doesn't price at
  -- all, since fabricating one at blend time would be a guess and this
  -- isn't.
  position_rank INTEGER NOT NULL,
  overall_rank INTEGER NOT NULL,
  tier INTEGER NOT NULL,
  converted_value NUMERIC NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- User accounts. Email/password only (no OAuth) — password_hash is bcrypt,
-- never plaintext, and is the only place credentials live.
--
-- email is stored lowercased. The CHECK enforces that at the database level
-- rather than trusting every future code path to normalize first, which in
-- turn makes the plain UNIQUE constraint effectively case-insensitive
-- (without a functional index, so ON CONFLICT (email) still works normally).
--
-- plan gates the league quota (see user_leagues below). No billing here —
-- 'premium' is set by hand for now; real payment processing is a separate
-- future project.
CREATE TABLE IF NOT EXISTS users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email         TEXT NOT NULL UNIQUE CHECK (email = lower(email)),
  password_hash TEXT NOT NULL,
  plan          TEXT NOT NULL DEFAULT 'free' CHECK (plan IN ('free', 'premium')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Which leagues a user has added to their account.
--
-- Deliberately a join table rather than a user_id column on tracked_leagues:
-- a Sleeper league is inherently multi-user (twelve managers share one real
-- league), and tracked_leagues.league_id is a PRIMARY KEY that doubles as
-- the snapshot Cron's work queue (getTrackedLeagueIds() ->
-- app/api/snapshot/route.ts). Putting ownership there would either stop two
-- leaguemates from both using the app, or break the Cron. This table is the
-- ownership layer; tracked_leagues stays the global snapshot registry, and
-- a league is snapshotted if *any* user has added it.
--
-- PRIMARY KEY (user_id, league_id) constrains the pair, not league_id
-- alone: any number of users may add the same league (each row counts
-- against that user's own quota), while one user can't add the same league
-- twice. Nobody "owns" a league_id exclusively.
--
-- league_id is intentionally NOT a foreign key — it spans both league kinds
-- (a Sleeper numeric ID, or a "manual-<uuid>" ID from manual_leagues),
-- discriminated by prefix exactly as lib/manual-league.ts's
-- isManualLeagueId() already does throughout the app.
--
-- No separate index on user_id: the composite primary key's btree is
-- user_id-first, so quota counts and "my leagues" lookups already use it.
CREATE TABLE IF NOT EXISTS user_leagues (
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  league_id  TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, league_id)
);

-- FantasyPros' Waiver Wire Rankings snapshot, a *different* export from the
-- draft rankings one above (only published once the season is underway —
-- there's no meaningful "who's hot on waivers" signal pre-season) — its own
-- table rather than merged into fantasypros_values, since these rank two
-- different things for two different purposes (overall trade value vs.
-- "who should I add this week"). Ingested by
-- scripts/ingest-fantasypros-waiver.ts once a real export exists; that
-- script's CSV-column mapping is a deliberate stub until then — see its
-- top comment. Deliberately minimal: only the fields any FantasyPros rank
-- export is expected to carry (name/position/team/rank). Extend with
-- tier/trend/%-owned columns once the real file's actual shape is known,
-- not guessed at now.
CREATE TABLE IF NOT EXISTS fantasypros_waiver_values (
  sleeper_player_id TEXT PRIMARY KEY,
  player_name TEXT NOT NULL,
  position TEXT NOT NULL,
  team TEXT,
  waiver_rank INTEGER NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Forgot-password tokens. A separate table rather than a column on users,
-- matching this schema's existing preference for join/child tables (see
-- user_leagues, beta_feedback): a user can have more than one pending
-- request live at once (clicks "forgot password" twice, opens an older
-- email first), which one column can't represent cleanly.
--
-- token_hash stores sha256(token), never the raw token — the same
-- "don't store the secret itself" instinct as users.password_hash, but a
-- fast hash rather than bcrypt is the right tool here: bcrypt's cost factor
-- defends against *guessing* a low-entropy human password, and a 256-bit
-- random token is already unguessable, so the only property that matters is
-- "a DB leak doesn't hand out live tokens" — sha256 covers that and lets
-- the lookup use a plain unique index instead of scanning + bcrypt-
-- comparing every row.
--
-- used_at IS NULL + expires_at together give single-use and expiry with no
-- separate boolean; lib/db/password-reset.ts's redeemResetToken() flips
-- used_at from NULL to now() in one atomic UPDATE...RETURNING, the same
-- race-free idiom lib/db/users.ts's createUser() already uses via
-- ON CONFLICT DO NOTHING RETURNING.
CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id         BIGSERIAL PRIMARY KEY,
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at    TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Caden's own hand-curated notes ("GM Insight" on the dashboard), distinct
-- from the app's computed advice signals (lib/team-advice.ts). player_id is
-- a Sleeper player_id for a note tied to one player, NULL for a
-- general/scenario note that isn't. active is a plain boolean here rather
-- than this schema's usual nullable-timestamp idiom (e.g.
-- password_reset_tokens.used_at) because the point is explicitly to flip a
-- note on/off by hand, possibly more than once, not a one-way expiry.
CREATE TABLE IF NOT EXISTS gm_insights (
  id BIGSERIAL PRIMARY KEY,
  content TEXT NOT NULL,
  player_id TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS gm_insights_player_idx ON gm_insights (player_id);
CREATE INDEX IF NOT EXISTS gm_insights_active_idx ON gm_insights (active);
