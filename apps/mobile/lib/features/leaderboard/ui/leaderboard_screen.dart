import 'package:flutter/material.dart';

import '../../../l10n/app_localization.dart';
import '../../../l10n/localized_digits.dart';
import '../../../l10n/translation_catalog.dart';
import '../../../l10n/translation_resolver.dart';
import '../../../theme/lh_tokens.dart';
import '../../identity/data/countries.dart';
import '../../match/ui/widgets/lh_background.dart';
import '../../match/ui/widgets/lh_buttons.dart';
import '../leaderboard_client.dart';

/// Top-100 Quick Survival leaderboard list.
class LeaderboardScreen extends StatefulWidget {
  const LeaderboardScreen({
    required this.backendBaseUrl,
    required this.onBack,
    this.client,
    super.key,
  });

  final String backendBaseUrl;
  final VoidCallback onBack;
  final LeaderboardClient? client;

  @override
  State<LeaderboardScreen> createState() => _LeaderboardScreenState();
}

class _LeaderboardScreenState extends State<LeaderboardScreen> {
  late final LeaderboardClient _client;
  bool _loading = true;
  String? _errorKey;
  List<LeaderboardEntry> _entries = const <LeaderboardEntry>[];

  @override
  void initState() {
    super.initState();
    _client = widget.client ?? LeaderboardClient();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _errorKey = null;
    });
    try {
      final List<LeaderboardEntry> entries = await _client.fetchTop(
        backendBaseUrl: widget.backendBaseUrl,
      );
      if (!mounted) return;
      setState(() {
        _entries = entries;
        _loading = false;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _errorKey = TranslationKeys.leaderboardLoadError;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final TranslationResolver resolver = AppLocalization.of(context);
    final String locale = Localizations.localeOf(context).languageCode;

    return LhBackground(
      child: SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(20, 12, 20, 20),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: <Widget>[
              Row(
                children: <Widget>[
                  IconButton(
                    onPressed: widget.onBack,
                    icon: const Icon(Icons.arrow_back_rounded),
                    color: LhColors.text,
                  ),
                  Expanded(
                    child: Text(
                      resolver.resolve(TranslationKeys.leaderboardTitle),
                      style: Theme.of(context).textTheme.headlineMedium,
                      textAlign: TextAlign.center,
                    ),
                  ),
                  const SizedBox(width: 48),
                ],
              ),
              const SizedBox(height: 12),
              Expanded(child: _buildBody(resolver, locale)),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildBody(TranslationResolver resolver, String locale) {
    if (_loading) {
      return const Center(child: CircularProgressIndicator());
    }
    if (_errorKey != null) {
      return Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: <Widget>[
          Text(
            resolver.resolve(_errorKey!),
            textAlign: TextAlign.center,
            style: Theme.of(context).textTheme.bodyLarge,
          ),
          const SizedBox(height: 16),
          LhPrimaryButton(
            label: resolver.resolve(TranslationKeys.commonRetry),
            onPressed: _load,
          ),
        ],
      );
    }
    if (_entries.isEmpty) {
      return Center(
        child: Text(
          resolver.resolve(TranslationKeys.leaderboardEmpty),
          textAlign: TextAlign.center,
          style: Theme.of(context).textTheme.bodyLarge,
        ),
      );
    }

    return ListView.separated(
      itemCount: _entries.length,
      separatorBuilder: (_, _) => const SizedBox(height: 8),
      itemBuilder: (BuildContext context, int index) {
        final LeaderboardEntry entry = _entries[index];
        final PlayerCountry? country = playerCountryByCode(entry.countryCode);
        final String flag = country?.flagEmoji ?? '🏳️';
        final String pointsLabel = resolver.resolve(
          TranslationKeys.leaderboardPoints,
          params: <String, String>{
            'points': formatLocalizedCount(entry.totalPoints, locale),
          },
        );
        return Container(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
          decoration: BoxDecoration(
            color: LhColors.surface.withValues(alpha: 0.9),
            borderRadius: LhRadii.mdAll,
            border: Border.all(color: LhColors.border),
          ),
          child: Row(
            children: <Widget>[
              SizedBox(
                width: 36,
                child: Text(
                  formatLocalizedCount(entry.rank, locale),
                  style: Theme.of(context).textTheme.titleMedium,
                ),
              ),
              Text(flag, style: const TextStyle(fontSize: 22)),
              const SizedBox(width: 10),
              Expanded(
                child: Text(
                  entry.displayName,
                  style: Theme.of(context).textTheme.titleMedium,
                  overflow: TextOverflow.ellipsis,
                ),
              ),
              Text(
                pointsLabel,
                style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                  color: LhColors.primaryBright,
                ),
              ),
            ],
          ),
        );
      },
    );
  }
}
