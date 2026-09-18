-- LH-009: pair-sync round must outlast togetherMs so both seats can start
-- pressing, then hold. Catalog was durationMs 5000 with togetherMs 5000.
UPDATE content_template_versions tv
SET definition = jsonb_set(
  definition,
  '{durationMs}',
  '10000'::jsonb,
  false
)
FROM content_templates t
WHERE t.id = tv.template_id
  AND t.slug = 'social.pair_sync';
