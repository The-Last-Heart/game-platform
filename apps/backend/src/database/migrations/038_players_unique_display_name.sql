-- Global unique display names on leaderboard players (case/whitespace-insensitive).

-- Deduplicate existing rows: keep earliest by updated_at, rename the rest with a letter suffix.
WITH ranked AS (
  SELECT
    player_id,
    display_name,
    row_number() OVER (
      PARTITION BY lower(regexp_replace(btrim(display_name), '\s+', ' ', 'g'))
      ORDER BY updated_at ASC, player_id ASC
    ) AS rn
  FROM players
),
renames AS (
  SELECT
    player_id,
    left(
      regexp_replace(btrim(display_name), '\s+', ' ', 'g'),
      22
    ) || ' ' || chr((64 + ((rn - 1) % 26) + 1)::int) AS new_name
  FROM ranked
  WHERE rn > 1
)
UPDATE players p
SET display_name = r.new_name,
    updated_at = now()
FROM renames r
WHERE p.player_id = r.player_id;

CREATE UNIQUE INDEX IF NOT EXISTS players_display_name_key_uidx
  ON players (lower(regexp_replace(btrim(display_name), '\s+', ' ', 'g')));
