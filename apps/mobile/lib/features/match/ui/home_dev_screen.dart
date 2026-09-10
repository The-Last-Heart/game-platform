import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';

import '../../../l10n/app_localization.dart';
import '../../../l10n/translation_catalog.dart';
import '../../../l10n/translation_resolver.dart';
import '../../../theme/lh_tokens.dart';
import '../session/match_session_controller.dart';
import '../state/match_snapshot.dart';
import 'match_shell.dart';
import 'widgets/lh_background.dart';
import 'widgets/lh_heart_logo.dart';

/// Home screen with brand card and development-only play CTA.
///
/// Navigation is driven by authoritative [MatchViewState.inMatch].
class HomeDevScreen extends StatefulWidget {
  const HomeDevScreen({required this.controller, super.key});

  final MatchSessionController controller;

  @override
  State<HomeDevScreen> createState() => _HomeDevScreenState();
}

class _HomeDevScreenState extends State<HomeDevScreen> {
  @override
  Widget build(BuildContext context) {
    return ValueListenableBuilder<MatchViewState>(
      valueListenable: widget.controller.state,
      builder: (BuildContext context, MatchViewState state, Widget? child) {
        if (state.inMatch) {
          return MatchShell(
            controller: widget.controller,
            onBackHome: () async {
              await widget.controller.clearSessionAndDisconnect();
            },
          );
        }

        return _HomeView(
          controller: widget.controller,
          onStartDevMatch: () {
            widget.controller.startDevMatch();
          },
        );
      },
    );
  }
}

class _HomeView extends StatelessWidget {
  const _HomeView({required this.controller, required this.onStartDevMatch});

  final MatchSessionController controller;
  final VoidCallback onStartDevMatch;

  @override
  Widget build(BuildContext context) {
    final TranslationResolver resolver = AppLocalization.of(context);

    return LhBackground(
      child: SafeArea(
        child: ValueListenableBuilder<MatchViewState>(
          valueListenable: controller.state,
          builder: (BuildContext context, MatchViewState state, Widget? child) {
            return SingleChildScrollView(
              padding: const EdgeInsets.symmetric(horizontal: 20),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: <Widget>[
                  const SizedBox(height: 8),
                  _buildHeader(context, resolver),
                  const SizedBox(height: 20),
                  _buildHeroCard(context, resolver),
                  const SizedBox(height: 20),
                  if (state.connectionError != null)
                    _buildErrorBanner(context, resolver, state),
                  if (state.lifecycle == SessionLifecycle.resuming ||
                      state.lifecycle == SessionLifecycle.connecting)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 12),
                      child: Text(
                        resolver.resolve(
                          TranslationKeys.errorsConnectionFailed,
                        ),
                        textAlign: TextAlign.center,
                        style: Theme.of(context).textTheme.bodyMedium,
                      ),
                    ),
                  if (!kReleaseMode) _buildPlayButton(context, resolver),
                  const SizedBox(height: 24),
                  _buildModesSection(context, resolver),
                  const SizedBox(height: 24),
                  _buildDailyChallenge(context, resolver),
                  const SizedBox(height: 24),
                  _buildBottomNav(context),
                  const SizedBox(height: 8),
                ],
              ),
            );
          },
        ),
      ),
    );
  }

  Widget _buildHeader(BuildContext context, TranslationResolver resolver) {
    return Row(
      children: <Widget>[
        Container(
          width: 40,
          height: 40,
          decoration: const BoxDecoration(
            color: Color(0xFF2196F3),
            shape: BoxShape.circle,
          ),
          child: const Center(
            child: Text(
              'و',
              style: TextStyle(
                color: LhColors.text,
                fontSize: 18,
                fontWeight: FontWeight.w700,
              ),
            ),
          ),
        ),
        const SizedBox(width: 10),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: <Widget>[
              Text(
                'مرحبًا، واجدي',
                style: Theme.of(
                  context,
                ).textTheme.bodyLarge?.copyWith(fontWeight: FontWeight.w600),
              ),
              Text('المستوى ١٢', style: Theme.of(context).textTheme.bodySmall),
            ],
          ),
        ),
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
          decoration: BoxDecoration(
            color: LhColors.surface,
            borderRadius: LhRadii.pillAll,
            border: Border.all(color: LhColors.border),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: <Widget>[
              const Icon(Icons.star, color: LhColors.warning, size: 16),
              const SizedBox(width: 4),
              Text('٣٤٥٠', style: Theme.of(context).textTheme.bodyMedium),
            ],
          ),
        ),
        const SizedBox(width: 8),
        Container(
          width: 36,
          height: 36,
          decoration: BoxDecoration(
            color: LhColors.surface,
            shape: BoxShape.circle,
            border: Border.all(color: LhColors.border),
          ),
          child: const Icon(
            Icons.notifications_outlined,
            color: LhColors.textMuted,
            size: 18,
          ),
        ),
      ],
    );
  }

  Widget _buildHeroCard(BuildContext context, TranslationResolver resolver) {
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 28, horizontal: 24),
      decoration: BoxDecoration(
        color: LhColors.surface.withValues(alpha: 0.9),
        borderRadius: LhRadii.lgAll,
        border: Border.all(color: LhColors.primary.withValues(alpha: 0.6)),
        boxShadow: <BoxShadow>[
          BoxShadow(
            color: LhColors.primary.withValues(alpha: 0.15),
            blurRadius: 24,
            spreadRadius: 2,
          ),
        ],
      ),
      child: Column(
        children: <Widget>[
          const LhHeartLogo(size: 72),
          const SizedBox(height: 12),
          Text(
            resolver.resolve(TranslationKeys.appTitle),
            style: Theme.of(context).textTheme.displayLarge,
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: 6),
          Text(
            resolver.resolve(TranslationKeys.homeTagline),
            style: Theme.of(context).textTheme.titleMedium,
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: 14),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
            decoration: const BoxDecoration(
              color: LhColors.elevated,
              borderRadius: LhRadii.pillAll,
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: <Widget>[
                Container(
                  width: 8,
                  height: 8,
                  decoration: const BoxDecoration(
                    color: Color(0xFF4CAF50),
                    shape: BoxShape.circle,
                  ),
                ),
                const SizedBox(width: 6),
                Text(
                  resolver.resolve(
                    TranslationKeys.homeOnlineCount,
                    params: <String, String>{'count': '١٢٤٨'},
                  ),
                  style: Theme.of(context).textTheme.bodySmall,
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildErrorBanner(
    BuildContext context,
    TranslationResolver resolver,
    MatchViewState state,
  ) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: LhColors.elevated,
          borderRadius: LhRadii.smAll,
          border: Border.all(color: LhColors.primary),
        ),
        child: Column(
          children: <Widget>[
            Text(
              resolver.resolve(TranslationKeys.errorsConnectionFailed),
              style: Theme.of(
                context,
              ).textTheme.bodyMedium?.copyWith(color: LhColors.primary),
              textAlign: TextAlign.center,
            ),
            if (state.canRetry) ...<Widget>[
              const SizedBox(height: 12),
              OutlinedButton(
                onPressed: onStartDevMatch,
                style: OutlinedButton.styleFrom(
                  foregroundColor: LhColors.text,
                  side: const BorderSide(color: LhColors.primary),
                ),
                child: Text(resolver.resolve(TranslationKeys.commonRetry)),
              ),
            ],
          ],
        ),
      ),
    );
  }

  Widget _buildPlayButton(BuildContext context, TranslationResolver resolver) {
    return SizedBox(
      width: double.infinity,
      height: 56,
      child: ElevatedButton.icon(
        onPressed: onStartDevMatch,
        icon: const Icon(Icons.play_arrow, size: 24),
        label: Text(
          resolver.resolve(TranslationKeys.homePlayNow),
          style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w700),
        ),
      ),
    );
  }

  Widget _buildModesSection(
    BuildContext context,
    TranslationResolver resolver,
  ) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: <Widget>[
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: <Widget>[
            Text(
              resolver.resolve(TranslationKeys.homeGameModes),
              style: Theme.of(context).textTheme.headlineMedium,
            ),
            Text(
              resolver.resolve(TranslationKeys.homeViewAll),
              style: Theme.of(context).textTheme.bodySmall,
            ),
          ],
        ),
        const SizedBox(height: 12),
        Row(
          children: <Widget>[
            Expanded(
              child: _ModeCard(
                icon: Icons.bolt,
                iconColor: LhColors.primary,
                title: resolver.resolve(TranslationKeys.homeQuickSurvival),
                subtitle: resolver.resolve(
                  TranslationKeys.homeQuickSurvivalDesc,
                ),
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: _ModeCard(
                icon: Icons.people_outline,
                iconColor: LhColors.warning,
                title: resolver.resolve(TranslationKeys.homePrivateRoom),
                subtitle: resolver.resolve(TranslationKeys.homePrivateRoomDesc),
              ),
            ),
          ],
        ),
      ],
    );
  }

  Widget _buildDailyChallenge(
    BuildContext context,
    TranslationResolver resolver,
  ) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: <Widget>[
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: <Widget>[
            Text(
              resolver.resolve(TranslationKeys.homeDailyChallenge),
              style: Theme.of(context).textTheme.headlineMedium,
            ),
            Text('٠ / ٥', style: Theme.of(context).textTheme.bodySmall),
          ],
        ),
        const SizedBox(height: 12),
        Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            color: LhColors.surface,
            borderRadius: LhRadii.mdAll,
            border: Border.all(color: LhColors.border),
          ),
          child: Column(
            children: <Widget>[
              Text(
                resolver.resolve(TranslationKeys.homeDailyChallengeDesc),
                style: Theme.of(context).textTheme.bodyLarge,
              ),
              const SizedBox(height: 12),
              const ClipRRect(
                borderRadius: LhRadii.pillAll,
                child: LinearProgressIndicator(
                  value: 0.0,
                  minHeight: 8,
                  backgroundColor: LhColors.border,
                  valueColor: AlwaysStoppedAnimation<Color>(LhColors.success),
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }

  Widget _buildBottomNav(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 10),
      decoration: BoxDecoration(
        color: LhColors.surface.withValues(alpha: 0.8),
        borderRadius: LhRadii.lgAll,
      ),
      child: const Row(
        mainAxisAlignment: MainAxisAlignment.spaceAround,
        children: <Widget>[
          _NavIcon(icon: Icons.person_outline, active: false),
          _NavIcon(icon: Icons.people_outline, active: false),
          _NavIcon(icon: Icons.shopping_bag_outlined, active: false),
          _NavIcon(icon: Icons.local_fire_department_outlined, active: false),
          _NavIcon(icon: Icons.home, active: true),
        ],
      ),
    );
  }
}

class _ModeCard extends StatelessWidget {
  const _ModeCard({
    required this.icon,
    required this.iconColor,
    required this.title,
    required this.subtitle,
  });

  final IconData icon;
  final Color iconColor;
  final String title;
  final String subtitle;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: LhColors.surface,
        borderRadius: LhRadii.mdAll,
        border: Border.all(color: LhColors.border),
      ),
      child: Column(
        children: <Widget>[
          Align(
            alignment: AlignmentDirectional.topEnd,
            child: Icon(icon, color: iconColor, size: 28),
          ),
          const SizedBox(height: 8),
          Text(
            title,
            style: Theme.of(context).textTheme.labelLarge,
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: 4),
          Text(
            subtitle,
            style: Theme.of(context).textTheme.bodySmall,
            textAlign: TextAlign.center,
          ),
        ],
      ),
    );
  }
}

class _NavIcon extends StatelessWidget {
  const _NavIcon({required this.icon, required this.active});

  final IconData icon;
  final bool active;

  @override
  Widget build(BuildContext context) {
    return Icon(
      icon,
      color: active ? LhColors.primary : LhColors.textMuted,
      size: 26,
    );
  }
}
