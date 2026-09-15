-- LH-009: memory answer window must remain usable after the longer preview.
-- previewMs is 3600; durationMs capped at 8000 → ~4.4s answer window.

UPDATE content_template_versions ctv
SET definition = jsonb_set(definition, '{durationMs}', '8000'::jsonb, true)
FROM content_templates ct
WHERE ctv.template_id = ct.id
  AND ct.slug = 'memory.sequence'
  AND ctv.version = 1
  AND COALESCE((definition ->> 'durationMs')::int, 0) < 8000;
