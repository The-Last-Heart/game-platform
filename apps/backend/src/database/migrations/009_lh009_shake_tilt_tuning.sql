-- LH-009 follow-up: tune shake/tilt live definitions for device playability.

UPDATE content_template_versions
SET definition = jsonb_set(
  jsonb_set(definition, '{serverConfig,requiredShakeCount}', '3'::jsonb, true),
  '{clientConfig,progressKey}',
  '"challenge.shake.progress"'::jsonb,
  true
)
WHERE id = 'dddddddd-dddd-4ddd-8ddd-dddddddddd11';

UPDATE content_template_versions
SET definition = jsonb_set(
  jsonb_set(
    jsonb_set(definition, '{serverConfig,targetX}', '0.35'::jsonb, true),
    '{serverConfig,varianceTolerance}',
    '0.22'::jsonb,
    true
  ),
  '{serverConfig,targetY}',
  '0'::jsonb,
  true
)
WHERE id = 'dddddddd-dddd-4ddd-8ddd-dddddddddd12';
