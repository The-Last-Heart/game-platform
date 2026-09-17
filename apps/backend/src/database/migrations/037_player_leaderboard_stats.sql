-- Leaderboard display stats: challenges played + playlists completed (QS only).

ALTER TABLE players
  ADD COLUMN IF NOT EXISTS challenges_played bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS playlists_completed bigint NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'players_challenges_played_nonneg'
  ) THEN
    ALTER TABLE players
      ADD CONSTRAINT players_challenges_played_nonneg
      CHECK (challenges_played >= 0);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'players_playlists_completed_nonneg'
  ) THEN
    ALTER TABLE players
      ADD CONSTRAINT players_playlists_completed_nonneg
      CHECK (playlists_completed >= 0);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS player_stat_events (
  id bigserial PRIMARY KEY,
  player_id text NOT NULL REFERENCES players (player_id) ON DELETE CASCADE,
  match_id text NOT NULL,
  reason text NOT NULL,
  source_id text NOT NULL,
  mode text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT player_stat_events_reason_chk CHECK (
    reason IN ('challenge_played', 'playlist_completed')
  ),
  CONSTRAINT player_stat_events_mode_chk CHECK (mode = 'quick_survival'),
  CONSTRAINT player_stat_events_unique_source UNIQUE (
    player_id,
    match_id,
    reason,
    source_id
  )
);

CREATE INDEX IF NOT EXISTS player_stat_events_player_created_idx
  ON player_stat_events (player_id, created_at DESC);
