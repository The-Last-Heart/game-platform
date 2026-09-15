-- LH-009: training is solo-only — no pair sync, no strike / power grants.

-- 1) Drop training from social.pair_sync eligibleModes
UPDATE content_template_versions AS ctv
SET definition = jsonb_set(
  definition,
  '{eligibleModes}',
  (
    SELECT COALESCE(jsonb_agg(to_jsonb(mode)), '[]'::jsonb)
    FROM jsonb_array_elements_text(ctv.definition -> 'eligibleModes') AS mode
    WHERE mode <> 'training'
  ),
  true
)
FROM content_templates AS ct
WHERE ctv.template_id = ct.id
  AND ct.slug = 'social.pair_sync'
  AND jsonb_typeof(ctv.definition -> 'eligibleModes') = 'array';

-- 2) Powers are multiplayer tactics — remove training from array-shaped power packs
UPDATE content_releases
SET payload = jsonb_set(
  payload,
  '{powers}',
  (
    SELECT COALESCE(jsonb_agg(
      CASE
        WHEN jsonb_typeof(power -> 'eligibleModes') = 'array' THEN
          jsonb_set(
            power,
            '{eligibleModes}',
            (
              SELECT COALESCE(jsonb_agg(to_jsonb(mode)), '[]'::jsonb)
              FROM jsonb_array_elements_text(power -> 'eligibleModes') AS mode
              WHERE mode <> 'training'
            ),
            true
          )
        ELSE power
      END
    ), '[]'::jsonb)
    FROM jsonb_array_elements(payload -> 'powers') AS power
  ),
  true
)
WHERE kind = 'power_configuration'
  AND jsonb_typeof(payload -> 'powers') = 'array';
