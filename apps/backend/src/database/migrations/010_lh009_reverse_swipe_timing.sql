-- Soften reverse-swipe timing so deliberate slider pulls are not rejected.

UPDATE content_template_versions
SET definition = jsonb_set(
  definition,
  '{serverConfig,maxDurationMs}',
  '5000'::jsonb,
  true
)
WHERE id = 'dddddddd-dddd-4ddd-8ddd-dddddddddd02';
