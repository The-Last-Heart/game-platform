import 'package:flutter/material.dart';

import '../../../l10n/app_localization.dart';
import '../../../l10n/translation_catalog.dart';
import '../../../l10n/translation_resolver.dart';
import 'challenge_engine.dart';

/// Fallback engine for unrecognized challenge types.
///
/// Displays the content-unavailable message from l10n.
class UnknownEngine implements ChallengeEngine {
  @override
  String get engineId => '_unknown';

  @override
  Widget build(BuildContext context, ChallengeContext challengeContext) {
    final TranslationResolver resolver = AppLocalization.of(context);
    return Center(
      child: Text(
        resolver.resolve(TranslationKeys.errorsContentUnavailable),
        style: Theme.of(context).textTheme.titleMedium,
        textAlign: TextAlign.center,
      ),
    );
  }
}
