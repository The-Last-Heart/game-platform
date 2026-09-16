-- Quick Survival leaderboard: durable per-install players + idempotent point ledger.

CREATE TABLE IF NOT EXISTS players (
  player_id text PRIMARY KEY,
  display_name text NOT NULL,
  avatar_color text NOT NULL,
  country_code char(2) NOT NULL,
  total_points bigint NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT players_player_id_len CHECK (
    char_length(player_id) BETWEEN 8 AND 128
  ),
  CONSTRAINT players_display_name_len CHECK (
    char_length(display_name) BETWEEN 2 AND 24
  ),
  CONSTRAINT players_avatar_color_hex CHECK (
    avatar_color ~ '^#[0-9A-Fa-f]{6}$'
  ),
  CONSTRAINT players_country_code_fmt CHECK (
    country_code ~ '^[A-Z]{2}$'
  ),
  CONSTRAINT players_total_points_nonneg CHECK (total_points >= 0)
);

CREATE INDEX IF NOT EXISTS players_leaderboard_idx
  ON players (total_points DESC, updated_at ASC, player_id ASC);

CREATE TABLE IF NOT EXISTS player_point_events (
  id bigserial PRIMARY KEY,
  player_id text NOT NULL REFERENCES players (player_id) ON DELETE CASCADE,
  match_id text NOT NULL,
  reason text NOT NULL,
  source_id text NOT NULL,
  points integer NOT NULL,
  mode text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT player_point_events_reason_chk CHECK (
    reason IN ('challenge_win', 'strike_survive', 'strike_fail')
  ),
  CONSTRAINT player_point_events_mode_chk CHECK (mode = 'quick_survival'),
  CONSTRAINT player_point_events_points_chk CHECK (
    points IN (5, 10, -5)
  ),
  CONSTRAINT player_point_events_unique_source UNIQUE (
    player_id,
    match_id,
    reason,
    source_id
  )
);

CREATE INDEX IF NOT EXISTS player_point_events_player_created_idx
  ON player_point_events (player_id, created_at DESC);
