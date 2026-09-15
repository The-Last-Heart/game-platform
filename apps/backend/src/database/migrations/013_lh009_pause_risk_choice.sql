-- Pause tactical.risk_choice from the live/training playlist for now.
-- Engine + template stay in-tree; re-add by publishing a catalog that includes it.

DO $$
DECLARE
  v_catalog_release_id uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa13';
  v_wait_vid uuid;
  v_trap_vid uuid;
  v_swipe_vid uuid;
  v_tap_vid uuid;
  v_mem_vid uuid;
  v_hold_vid uuid;
  v_shake_vid uuid;
  v_tilt_vid uuid;
  v_audio_vid uuid;
  v_pair_vid uuid;
BEGIN
  SELECT ctv.id INTO v_wait_vid
  FROM content_template_versions ctv
  JOIN content_templates ct ON ct.id = ctv.template_id
  WHERE ct.slug = 'reaction.wait_for_signal' AND ctv.version = 1 LIMIT 1;

  SELECT ctv.id INTO v_trap_vid
  FROM content_template_versions ctv
  JOIN content_templates ct ON ct.id = ctv.template_id
  WHERE ct.slug = 'trap.no_touch' AND ctv.version = 1 LIMIT 1;

  SELECT ctv.id INTO v_swipe_vid
  FROM content_template_versions ctv
  JOIN content_templates ct ON ct.id = ctv.template_id
  WHERE ct.slug = 'gesture.reverse_swipe' AND ctv.version = 1 LIMIT 1;

  SELECT ctv.id INTO v_tap_vid
  FROM content_template_versions ctv
  JOIN content_templates ct ON ct.id = ctv.template_id
  WHERE ct.slug = 'tap.precision' AND ctv.version = 1 LIMIT 1;

  SELECT ctv.id INTO v_mem_vid
  FROM content_template_versions ctv
  JOIN content_templates ct ON ct.id = ctv.template_id
  WHERE ct.slug = 'memory.sequence' AND ctv.version = 1 LIMIT 1;

  SELECT ctv.id INTO v_hold_vid
  FROM content_template_versions ctv
  JOIN content_templates ct ON ct.id = ctv.template_id
  WHERE ct.slug = 'hold.multitouch' AND ctv.version = 1 LIMIT 1;

  SELECT ctv.id INTO v_shake_vid
  FROM content_template_versions ctv
  JOIN content_templates ct ON ct.id = ctv.template_id
  WHERE ct.slug = 'motion.shake' AND ctv.version = 1 LIMIT 1;

  SELECT ctv.id INTO v_tilt_vid
  FROM content_template_versions ctv
  JOIN content_templates ct ON ct.id = ctv.template_id
  WHERE ct.slug = 'motion.tilt_balance' AND ctv.version = 1 LIMIT 1;

  SELECT ctv.id INTO v_audio_vid
  FROM content_template_versions ctv
  JOIN content_templates ct ON ct.id = ctv.template_id
  WHERE ct.slug = 'audio.cue' AND ctv.version = 1 LIMIT 1;

  SELECT ctv.id INTO v_pair_vid
  FROM content_template_versions ctv
  JOIN content_templates ct ON ct.id = ctv.template_id
  WHERE ct.slug = 'social.pair_sync' AND ctv.version = 1 LIMIT 1;

  IF v_wait_vid IS NULL OR v_trap_vid IS NULL OR v_swipe_vid IS NULL
     OR v_tap_vid IS NULL OR v_mem_vid IS NULL OR v_hold_vid IS NULL
     OR v_shake_vid IS NULL OR v_tilt_vid IS NULL OR v_audio_vid IS NULL
     OR v_pair_vid IS NULL THEN
    RAISE EXCEPTION 'LH-009 template versions missing; cannot publish risk-free catalog';
  END IF;

  INSERT INTO content_releases (id, kind, version_label, payload, changelog)
  VALUES (
    v_catalog_release_id,
    'challenge_catalog',
    'lh009.mixed.v2',
    jsonb_build_object(
      'releaseId', v_catalog_release_id,
      'versionLabel', 'lh009.mixed.v2',
      'entries', jsonb_build_array(
        jsonb_build_object('templateVersionId', v_wait_vid, 'definitionId', 'reaction.wait_for_signal.dev', 'weight', 100, 'repetitionCooldownRounds', 1, 'paused', false),
        jsonb_build_object('templateVersionId', v_trap_vid, 'definitionId', 'trap.no_touch.dev', 'weight', 100, 'repetitionCooldownRounds', 1, 'paused', false),
        jsonb_build_object('templateVersionId', v_shake_vid, 'definitionId', 'motion.shake.dev', 'weight', 100, 'repetitionCooldownRounds', 1, 'paused', false),
        jsonb_build_object('templateVersionId', v_tilt_vid, 'definitionId', 'motion.tilt_balance.dev', 'weight', 100, 'repetitionCooldownRounds', 1, 'paused', false),
        jsonb_build_object('templateVersionId', v_swipe_vid, 'definitionId', 'gesture.reverse_swipe.dev', 'weight', 100, 'repetitionCooldownRounds', 1, 'paused', false),
        jsonb_build_object('templateVersionId', v_tap_vid, 'definitionId', 'tap.precision.dev', 'weight', 100, 'repetitionCooldownRounds', 1, 'paused', false),
        jsonb_build_object('templateVersionId', v_mem_vid, 'definitionId', 'memory.sequence.dev', 'weight', 100, 'repetitionCooldownRounds', 2, 'paused', false),
        jsonb_build_object('templateVersionId', v_audio_vid, 'definitionId', 'audio.cue.dev', 'weight', 100, 'repetitionCooldownRounds', 1, 'paused', false),
        jsonb_build_object('templateVersionId', v_pair_vid, 'definitionId', 'social.pair_sync.dev', 'weight', 100, 'repetitionCooldownRounds', 2, 'paused', false),
        jsonb_build_object('templateVersionId', v_hold_vid, 'definitionId', 'hold.multitouch.dev', 'weight', 100, 'repetitionCooldownRounds', 1, 'paused', false)
      ),
      'changelog', 'LH-009 mixed catalog without tactical.risk_choice (paused for playability)'
    ),
    'Remove risk choice from live playlist for now'
  ) ON CONFLICT (id) DO NOTHING;

  INSERT INTO content_current_releases (kind, release_id)
  VALUES ('challenge_catalog', v_catalog_release_id)
  ON CONFLICT (kind) DO UPDATE SET release_id = EXCLUDED.release_id, updated_at = now();
END $$;
