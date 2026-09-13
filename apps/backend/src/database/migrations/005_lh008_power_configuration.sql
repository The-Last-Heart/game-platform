-- LH-008: full bootstrap power configuration (Danger Pulse / Shield / Reflection).
-- Publishes a new immutable power release and points content_current_releases at it.

DO $$
DECLARE
  v_power_release_id uuid := '44444444-4444-4444-8444-444444444008';
  v_loc_release_id uuid := 'dddddddd-dddd-4ddd-8ddd-dddddddddd08';
BEGIN
  INSERT INTO content_releases (id, kind, version_label, payload, changelog)
  VALUES (
    v_power_release_id,
    'power_configuration',
    'bootstrap.powers.v1',
    jsonb_build_object(
      'releaseId', v_power_release_id,
      'versionLabel', 'bootstrap.powers.v1',
      'energyThreshold', 4,
      'inventoryMaxTotal', 3,
      'inventoryMaxPerPower', 1,
      'actionWindowMs', 8000,
      'defenseWindowMs', 5000,
      'powers', jsonb_build_array(
        jsonb_build_object(
          'powerId', 'danger_pulse',
          'enabled', true,
          'grantWeight', 100,
          'eligibleModes', jsonb_build_array('quick_survival', 'private', 'training', 'dev'),
          'nameKey', 'power.danger_pulse.name',
          'explanationKey', 'power.danger_pulse.explanation',
          'assetIds', jsonb_build_array()
        ),
        jsonb_build_object(
          'powerId', 'shield',
          'enabled', true,
          'grantWeight', 100,
          'eligibleModes', jsonb_build_array('quick_survival', 'private', 'training', 'dev'),
          'nameKey', 'power.shield.name',
          'explanationKey', 'power.shield.explanation',
          'assetIds', jsonb_build_array()
        ),
        jsonb_build_object(
          'powerId', 'reflection',
          'enabled', true,
          'grantWeight', 100,
          'eligibleModes', jsonb_build_array('quick_survival', 'private', 'training', 'dev'),
          'nameKey', 'power.reflection.name',
          'explanationKey', 'power.reflection.explanation',
          'assetIds', jsonb_build_array()
        )
      ),
      'changelog', 'LH-008 launch powers'
    ),
    'LH-008 launch powers'
  )
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO content_releases (id, kind, version_label, payload, changelog)
  VALUES (
    v_loc_release_id,
    'localization',
    'bootstrap.powers.l10n.v1',
    jsonb_build_object(
      'releaseId', v_loc_release_id,
      'versionLabel', 'bootstrap.powers.l10n.v1',
      'locales', jsonb_build_array('ar', 'en'),
      'entries', jsonb_build_object(
        'ar', jsonb_build_object(
          'power.danger_pulse.name', 'نبضة خطر',
          'power.danger_pulse.explanation', 'هاجم لاعباً نشطاً بين الجولات',
          'power.shield.name', 'درع',
          'power.shield.explanation', 'أبطل هجوماً قادماً',
          'power.reflection.name', 'انعكاس',
          'power.reflection.explanation', 'أعد الهجوم إلى مرسله مرة واحدة',
          'power.inventory_full', 'الحقيبة ممتلئة',
          'power.granted', 'حصلت على قدرة',
          'power.no_targets', 'لا يوجد هدف صالح',
          'errors.power.not_available', 'القدرة غير متاحة',
          'errors.power.phase_invalid', 'ليس وقت استخدام القدرة',
          'errors.power.illegal_target', 'هدف غير صالح',
          'errors.power.attack_not_found', 'الهجوم غير موجود',
          'errors.power.offensive_disabled', 'الهجمات متوقفة مؤقتاً'
        ),
        'en', jsonb_build_object(
          'power.danger_pulse.name', 'Danger Pulse',
          'power.danger_pulse.explanation', 'Attack an active player between rounds',
          'power.shield.name', 'Shield',
          'power.shield.explanation', 'Cancel an incoming attack',
          'power.reflection.name', 'Reflection',
          'power.reflection.explanation', 'Return an attack to its sender once',
          'power.inventory_full', 'Inventory full',
          'power.granted', 'Power unlocked',
          'power.no_targets', 'No eligible target',
          'errors.power.not_available', 'Power not available',
          'errors.power.phase_invalid', 'Not a power action moment',
          'errors.power.illegal_target', 'Illegal target',
          'errors.power.attack_not_found', 'Attack not found',
          'errors.power.offensive_disabled', 'Offensive powers temporarily disabled'
        )
      ),
      'changelog', 'LH-008 power localization'
    ),
    'LH-008 power localization'
  )
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO content_current_releases (kind, release_id)
  VALUES ('power_configuration', v_power_release_id)
  ON CONFLICT (kind) DO UPDATE SET release_id = EXCLUDED.release_id;

  -- Power chrome strings live in bootstrap.powers.l10n.v1 for admin/export;
  -- mobile bootstrap_catalog also carries the same keys for APK chrome.
END $$;
