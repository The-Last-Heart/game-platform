-- Give memory preview enough time for a one-shot readable sequence.
UPDATE content_template_versions
SET definition = jsonb_set(
  jsonb_set(definition, '{clientConfig,previewMs}', '3600'::jsonb, true),
  '{serverConfig,previewMs}',
  '3600'::jsonb,
  true
)
WHERE id = 'dddddddd-dddd-4ddd-8ddd-dddddddddd04';
