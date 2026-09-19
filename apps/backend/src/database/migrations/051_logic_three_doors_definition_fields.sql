-- Repair Door of Truth seed: playlist resolver requires full challengeDefinitionSchema
-- fields (eligibleModes, governance keys). Incomplete 049 rows were silently skipped.
UPDATE content_template_versions
SET definition = definition
  || jsonb_build_object(
    'internalTitle', COALESCE(definition->>'internalTitle', 'Door of Truth — باب الحقيقة'),
    'familyId', COALESCE(definition->>'familyId', 'logic'),
    'categoryId', COALESCE(definition->>'categoryId', 'logic.three_doors'),
    'instructionAr', COALESCE(
      definition->>'instructionAr',
      'اقرأ العبارات على الأبواب واختر الباب الذي يخفي القلب'
    ),
    'eligibleModes', COALESCE(
      definition->'eligibleModes',
      '["quick_survival", "private", "training", "dev"]'::jsonb
    ),
    'selectionWeight', COALESCE((definition->>'selectionWeight')::int, 100),
    'repetitionCooldownRounds', COALESCE((definition->>'repetitionCooldownRounds')::int, 1),
    'introDurationMs', COALESCE((definition->>'introDurationMs')::int, 1200),
    'resultHoldMs', COALESCE((definition->>'resultHoldMs')::int, 1600),
    'accessibilityFallbackKey', COALESCE(
      definition->>'accessibilityFallbackKey',
      'challenge.three_doors.a11y_fallback'
    )
  )
WHERE definition->>'definitionId' = 'logic.three_doors.door_of_truth'
   OR definition->>'engineId' = 'logic.three_doors';
