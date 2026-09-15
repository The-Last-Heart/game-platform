-- LH-009 follow-up: server-driven per-seat variation for wait_for_signal + tilt.
-- Pins stay on existing catalog rows; only definition JSON is patched.

UPDATE content_template_versions ctv
SET definition = jsonb_set(
  jsonb_set(
    definition,
    '{serverConfig,signalDelayRangeMs}',
    '{"min":700,"max":2800}'::jsonb,
    true
  ),
  '{serverConfig,signalDelayMs}',
  '1500'::jsonb,
  true
)
FROM content_templates ct
WHERE ctv.template_id = ct.id
  AND ct.slug = 'reaction.wait_for_signal'
  AND ctv.version = 1;

UPDATE content_template_versions ctv
SET definition = jsonb_set(
  definition,
  '{serverConfig,targetVariants}',
  '[
    {"targetX":0.35,"targetY":0,"targetShape":"circle"},
    {"targetX":-0.4,"targetY":0.15,"targetShape":"square"},
    {"targetX":0.1,"targetY":-0.4,"targetShape":"diamond"},
    {"targetX":-0.25,"targetY":0.35,"targetShape":"heart"}
  ]'::jsonb,
  true
)
FROM content_templates ct
WHERE ctv.template_id = ct.id
  AND ct.slug = 'motion.tilt_balance'
  AND ctv.version = 1;
