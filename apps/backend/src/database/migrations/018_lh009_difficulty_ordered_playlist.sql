-- LH-009: rebalance catalog difficulties for 5 easy / 5 medium / 5+ hard packs.
-- Runtime builds a structured playlist (easy → medium → hard) then hard-only
-- sudden-death while ≥2 players still have hearts.

DO $$
DECLARE
  r record;
  v_def jsonb;
BEGIN
  FOR r IN
    SELECT ctv.id AS version_id, ct.slug, ctv.definition
    FROM content_templates ct
    JOIN content_template_versions ctv ON ctv.template_id = ct.id
    WHERE (ct.slug, ctv.version) IN (
      SELECT ct2.slug, MAX(ctv2.version)
      FROM content_templates ct2
      JOIN content_template_versions ctv2 ON ctv2.template_id = ct2.id
      WHERE ct2.slug IN (
        'reaction.wait_for_signal',
        'trap.no_touch',
        'trivia.multiple_choice',
        'focus.odd_one_out',
        'motion.shake',
        'tap.precision',
        'gesture.reverse_swipe',
        'hold.multitouch',
        'search.select_occurrences',
        'order.sequence_sort',
        'memory.sequence',
        'motion.tilt_balance',
        'audio.cue',
        'geography.select_on_map',
        'precision.maze_path',
        'focus.stroop',
        'logic.balance_scale',
        'social.pair_sync',
        'tactical.risk_choice'
      )
      GROUP BY ct2.slug
    )
  LOOP
    v_def := r.definition;
    v_def := jsonb_set(
      v_def,
      '{difficulty}',
      to_jsonb(
        CASE r.slug
          WHEN 'reaction.wait_for_signal' THEN 'easy'
          WHEN 'trap.no_touch' THEN 'easy'
          WHEN 'trivia.multiple_choice' THEN 'easy'
          WHEN 'focus.odd_one_out' THEN 'easy'
          WHEN 'motion.shake' THEN 'easy'
          WHEN 'tap.precision' THEN 'medium'
          WHEN 'gesture.reverse_swipe' THEN 'medium'
          WHEN 'hold.multitouch' THEN 'medium'
          WHEN 'search.select_occurrences' THEN 'medium'
          WHEN 'order.sequence_sort' THEN 'medium'
          WHEN 'tactical.risk_choice' THEN 'medium'
          WHEN 'memory.sequence' THEN 'hard'
          WHEN 'motion.tilt_balance' THEN 'hard'
          WHEN 'audio.cue' THEN 'hard'
          WHEN 'geography.select_on_map' THEN 'hard'
          WHEN 'precision.maze_path' THEN 'hard'
          WHEN 'focus.stroop' THEN 'hard'
          WHEN 'logic.balance_scale' THEN 'hard'
          WHEN 'social.pair_sync' THEN 'hard'
          ELSE COALESCE(v_def->>'difficulty', 'medium')
        END
      ),
      true
    );
    UPDATE content_template_versions
    SET definition = v_def,
        validation_hash = md5(v_def::text)
    WHERE id = r.version_id;
  END LOOP;
END $$;
