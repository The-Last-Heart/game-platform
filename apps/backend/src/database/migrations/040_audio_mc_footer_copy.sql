-- Align Guess the Audio instruction copy with the production mockup.
UPDATE content_releases
SET payload = jsonb_set(
  jsonb_set(
    payload,
    '{entries,ar,challenge.audio_mc.footer}',
    '"استمع للمقطع واختر الإجابة الصحيحة"'::jsonb,
    true
  ),
  '{entries,en,challenge.audio_mc.footer}',
  '"Listen to the clip and choose the correct answer"'::jsonb,
  true
),
changelog = COALESCE(changelog, '') || ' audio_mc footer copy'
WHERE kind = 'localization'
  AND payload #>> '{entries,ar,challenge.audio_mc.footer}' IS NOT NULL;
