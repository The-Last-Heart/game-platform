import 'package:flutter/material.dart';

import '../../../../l10n/translation_catalog.dart';
import '../../../../l10n/translation_resolver.dart';
import '../../../../theme/lh_tokens.dart';
import '../../protocol/realtime_messages.dart';
import '../../state/match_snapshot.dart';

/// Room-wide live feed for strike / shield / reverse between challenges.
class PowerNarrativeBanner extends StatelessWidget {
  const PowerNarrativeBanner({
    required this.state,
    required this.resolver,
    super.key,
  });

  final MatchViewState state;
  final TranslationResolver resolver;

  @override
  Widget build(BuildContext context) {
    final PowerNarrative? narrative = state.tactical?.lastNarrative;
    if (narrative == null) return const SizedBox.shrink();

    final String text = _label(narrative);
    return Container(
      width: double.infinity,
      margin: const EdgeInsets.only(bottom: 16),
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      decoration: BoxDecoration(
        color: LhColors.elevated,
        borderRadius: LhRadii.mdAll,
        border: Border.all(color: LhColors.warning.withValues(alpha: 0.65)),
      ),
      child: Text(
        text,
        style: Theme.of(context).textTheme.titleMedium?.copyWith(
          color: LhColors.warning,
          fontWeight: FontWeight.w600,
        ),
        textAlign: TextAlign.center,
      ),
    );
  }

  String _name(String playerId) {
    for (final PlayerPublic p in state.players) {
      if (p.playerId != playerId) continue;
      final String? name = p.displayName?.trim();
      if (name != null && name.isNotEmpty) return name;
    }
    return '—';
  }

  String _label(PowerNarrative narrative) {
    final String attacker = _name(narrative.attackerId);
    final String target = _name(narrative.targetId);
    return switch (narrative.kind) {
      PowerNarrativeKind.struck => resolver.resolve(
        TranslationKeys.powerNarrativeStruck,
        params: <String, String>{'attacker': attacker, 'target': target},
      ),
      PowerNarrativeKind.reversed => resolver.resolve(
        TranslationKeys.powerNarrativeReversed,
        params: <String, String>{'defender': target, 'attacker': attacker},
      ),
      PowerNarrativeKind.shielded => resolver.resolve(
        TranslationKeys.powerNarrativeShielded,
        params: <String, String>{'defender': target},
      ),
      PowerNarrativeKind.hit => resolver.resolve(
        TranslationKeys.powerNarrativeHit,
        params: <String, String>{'attacker': attacker, 'target': target},
      ),
      PowerNarrativeKind.expired => resolver.resolve(
        TranslationKeys.powerNarrativeExpired,
        params: <String, String>{'target': target},
      ),
    };
  }
}
