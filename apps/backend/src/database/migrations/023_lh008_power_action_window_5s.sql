-- Align Danger Pulse action window with product default (5s, server-controlled).
UPDATE content_releases
SET payload = jsonb_set(payload, '{actionWindowMs}', '5000'::jsonb, true)
WHERE kind = 'power_configuration'
  AND COALESCE((payload ->> 'actionWindowMs')::int, 0) = 8000;
