-- LH-009: widen wait_for_signal blue window so late seat delivery still plays.
-- Per-seat signals are room-broadcast; a 750ms window was too tight on LAN/WSL.

UPDATE content_template_versions ctv
SET definition = jsonb_set(
  jsonb_set(
    definition,
    '{serverConfig,signalWindowMs}',
    '1500'::jsonb,
    true
  ),
  '{serverConfig,signalDelayRangeMs}',
  '{"min":700,"max":2500}'::jsonb,
  true
)
FROM content_templates ct
WHERE ctv.template_id = ct.id
  AND ct.slug = 'reaction.wait_for_signal'
  AND ctv.version = 1;
