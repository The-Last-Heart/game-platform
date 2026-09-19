import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../l10n/translation_catalog.dart';
import '../../../l10n/translation_resolver.dart';
import '../../../theme/lh_tokens.dart';

/// Full-screen, non-dismissible mandatory update gate for online play.
class AppUpdateRequiredScreen extends StatelessWidget {
  const AppUpdateRequiredScreen({
    super.key,
    required this.resolver,
    required this.minimumVersion,
    required this.storeUrl,
    required this.onRetry,
  });

  final TranslationResolver resolver;
  final String minimumVersion;
  final String storeUrl;
  final Future<void> Function() onRetry;

  @override
  Widget build(BuildContext context) {
    final TextTheme textTheme = Theme.of(context).textTheme;
    return PopScope(
      canPop: false,
      child: Scaffold(
        backgroundColor: LhColors.bg,
        body: SafeArea(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: <Widget>[
                const Spacer(),
                Text(
                  resolver.resolve(TranslationKeys.appUpdateTitle),
                  textAlign: TextAlign.center,
                  style: textTheme.displayLarge,
                ),
                const SizedBox(height: 16),
                Text(
                  resolver
                      .resolve(TranslationKeys.appUpdateBody)
                      .replaceAll('{minimumVersion}', minimumVersion),
                  textAlign: TextAlign.center,
                  style: textTheme.bodyLarge,
                ),
                const Spacer(),
                FilledButton(
                  onPressed: () => _openStore(),
                  child: Text(resolver.resolve(TranslationKeys.appUpdateNow)),
                ),
                const SizedBox(height: 12),
                OutlinedButton(
                  onPressed: () => onRetry(),
                  child: Text(resolver.resolve(TranslationKeys.appUpdateRetry)),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Future<void> _openStore() async {
    final Uri? uri = Uri.tryParse(storeUrl);
    if (uri == null || !uri.isScheme('https')) {
      return;
    }
    try {
      await launchUrl(uri, mode: LaunchMode.externalApplication);
    } on PlatformException {
      // Missing / invalid store URL must not crash.
    }
  }
}
