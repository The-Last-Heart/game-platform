-- LH-009: pair-sync tap-together duration is server-driven (togetherMs).
UPDATE content_template_versions tv
SET definition = jsonb_set(
  definition,
  '{serverConfig,togetherMs}',
  '5000'::jsonb,
  true
)
FROM content_templates t
WHERE t.id = tv.template_id
  AND t.slug = 'social.pair_sync';
