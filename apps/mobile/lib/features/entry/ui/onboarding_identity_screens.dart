import 'package:flutter/material.dart';

import '../../../l10n/app_localization.dart';
import '../../../l10n/translation_catalog.dart';
import '../../../l10n/translation_resolver.dart';
import '../../../theme/lh_tokens.dart';
import '../../identity/data/identity_store.dart';
import '../../match/ui/widgets/lh_background.dart';
import '../../match/ui/widgets/lh_buttons.dart';
import '../../match/ui/widgets/lh_heart_logo.dart';
import '../../match/ui/widgets/lh_ui_sound.dart';

/// Three-step Arabic onboarding: hearts, timed action, energy/powers.
class OnboardingScreen extends StatefulWidget {
  const OnboardingScreen({
    required this.onCompleted,
    required this.onReplayExit,
    this.replayMode = false,
    super.key,
  });

  final VoidCallback onCompleted;
  final VoidCallback onReplayExit;
  final bool replayMode;

  @override
  State<OnboardingScreen> createState() => _OnboardingScreenState();
}

class _OnboardingScreenState extends State<OnboardingScreen>
    with SingleTickerProviderStateMixin {
  int _step = 0;
  late final AnimationController _fade;
  late final Animation<double> _opacity;

  @override
  void initState() {
    super.initState();
    _fade = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 320),
    );
    _opacity = CurvedAnimation(parent: _fade, curve: Curves.easeOut);
    _fade.forward();
  }

  @override
  void dispose() {
    _fade.dispose();
    super.dispose();
  }

  Future<void> _goNext(int total) async {
    if (_step < total - 1) {
      await _fade.reverse();
      if (!mounted) return;
      setState(() => _step += 1);
      await _fade.forward();
    } else {
      widget.onCompleted();
    }
  }

  @override
  Widget build(BuildContext context) {
    final TranslationResolver resolver = AppLocalization.of(context);
    final List<({String title, String body, Widget visual})> steps =
        <({String title, String body, Widget visual})>[
          (
            title: resolver.resolve(TranslationKeys.onboardingHeartsTitle),
            body: resolver.resolve(TranslationKeys.onboardingHeartsBody),
            visual: const Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: <Widget>[
                LhHeartLogo(size: 56),
                SizedBox(width: 16),
                LhHeartLogo(size: 56),
                SizedBox(width: 16),
                LhHeartLogo(size: 56),
              ],
            ),
          ),
          (
            title: resolver.resolve(TranslationKeys.onboardingTimingTitle),
            body: resolver.resolve(TranslationKeys.onboardingTimingBody),
            visual: Container(
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                boxShadow: <BoxShadow>[
                  BoxShadow(
                    color: LhColors.primary.withValues(alpha: 0.45),
                    blurRadius: 28,
                  ),
                ],
              ),
              child: const Icon(
                Icons.timer_outlined,
                size: 72,
                color: LhColors.primary,
              ),
            ),
          ),
          (
            title: resolver.resolve(TranslationKeys.onboardingEnergyTitle),
            body: resolver.resolve(TranslationKeys.onboardingEnergyBody),
            visual: Container(
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                boxShadow: <BoxShadow>[
                  BoxShadow(
                    color: LhColors.warning.withValues(alpha: 0.4),
                    blurRadius: 28,
                  ),
                ],
              ),
              child: const Icon(
                Icons.bolt,
                size: 72,
                color: LhColors.warning,
              ),
            ),
          ),
        ];
    final step = steps[_step];

    return LhBackground(
      child: SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(24, 12, 24, 24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: <Widget>[
              Row(
                children: <Widget>[
                  if (widget.replayMode)
                    LhChromeIconButton(
                      icon: Icons.chevron_left,
                      onPressed: widget.onReplayExit,
                    )
                  else
                    const SizedBox(width: 48),
                  const Spacer(),
                  const LhHeartLogo(size: 36),
                  const SizedBox(width: 10),
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.end,
                    children: <Widget>[
                      Text(
                        resolver.resolve(TranslationKeys.onboardingHowToPlay),
                        style: Theme.of(context).textTheme.headlineMedium,
                      ),
                      Text(
                        resolver.resolve(
                          TranslationKeys.onboardingStepOf,
                          params: <String, String>{
                            'current': '${_step + 1}',
                            'total': '${steps.length}',
                          },
                        ),
                        style: Theme.of(context).textTheme.bodySmall,
                      ),
                    ],
                  ),
                ],
              ),
              const Spacer(),
              FadeTransition(
                opacity: _opacity,
                child: Column(
                  children: <Widget>[
                    step.visual,
                    const SizedBox(height: 28),
                    Text(
                      step.title,
                      style: Theme.of(context).textTheme.displayLarge,
                      textAlign: TextAlign.center,
                    ),
                    const SizedBox(height: 12),
                    Text(
                      step.body,
                      style: Theme.of(context).textTheme.titleMedium,
                      textAlign: TextAlign.center,
                    ),
                  ],
                ),
              ),
              const Spacer(),
              Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: List<Widget>.generate(
                  steps.length,
                  (int i) => AnimatedContainer(
                    duration: const Duration(milliseconds: 220),
                    width: i == _step ? 28 : 8,
                    height: 8,
                    margin: const EdgeInsets.symmetric(horizontal: 4),
                    decoration: BoxDecoration(
                      borderRadius: LhRadii.pillAll,
                      color: i == _step ? LhColors.primary : LhColors.border,
                    ),
                  ),
                ),
              ),
              const SizedBox(height: 20),
              LhPrimaryButton(
                label: resolver.resolve(
                  _step < steps.length - 1
                      ? TranslationKeys.commonNext
                      : TranslationKeys.onboardingDone,
                ),
                onPressed: () => _goNext(steps.length),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Display name + abstract avatar color editor.
class IdentityScreen extends StatefulWidget {
  const IdentityScreen({
    required this.initial,
    required this.onSaved,
    this.allowSkip = false,
    super.key,
  });

  final PlayerIdentity? initial;
  final ValueChanged<PlayerIdentity> onSaved;
  final bool allowSkip;

  @override
  State<IdentityScreen> createState() => _IdentityScreenState();
}

class _IdentityScreenState extends State<IdentityScreen> {
  late final TextEditingController _nameController;
  late String _color;
  String? _error;

  @override
  void initState() {
    super.initState();
    _nameController = TextEditingController(
      text: widget.initial?.displayName ?? '',
    );
    _color = widget.initial?.avatarColor ?? kApprovedAvatarColors.first;
  }

  @override
  void dispose() {
    _nameController.dispose();
    super.dispose();
  }

  void _submit() {
    final String name = _nameController.text.trim();
    if (name.length < 2 || name.length > 24) {
      setState(() {
        _error = AppLocalization.of(
          context,
        ).resolve(TranslationKeys.identityNameInvalid);
      });
      return;
    }
    widget.onSaved(PlayerIdentity(displayName: name, avatarColor: _color));
  }

  @override
  Widget build(BuildContext context) {
    final TranslationResolver resolver = AppLocalization.of(context);
    return LhBackground(
      child: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: <Widget>[
              const LhHeartLogo(size: 48),
              const SizedBox(height: 16),
              Text(
                resolver.resolve(TranslationKeys.identityTitle),
                style: Theme.of(context).textTheme.displayLarge,
              ),
              const SizedBox(height: 8),
              Text(
                resolver.resolve(TranslationKeys.identitySubtitle),
                style: Theme.of(context).textTheme.bodyMedium,
              ),
              const SizedBox(height: 24),
              TextField(
                controller: _nameController,
                maxLength: 24,
                decoration: InputDecoration(
                  labelText: resolver.resolve(TranslationKeys.identityNameLabel),
                  errorText: _error,
                  filled: true,
                  fillColor: LhColors.surface,
                ),
                onChanged: (_) {
                  if (_error != null) setState(() => _error = null);
                },
              ),
              const SizedBox(height: 16),
              Text(
                resolver.resolve(TranslationKeys.identityColorLabel),
                style: Theme.of(context).textTheme.titleMedium,
              ),
              const SizedBox(height: 12),
              Wrap(
                spacing: 12,
                runSpacing: 12,
                children: kApprovedAvatarColors.map((String color) {
                  final bool selected = color == _color;
                  return GestureDetector(
                    onTap: () async {
                      await LhUiSound.instance.playTap();
                      setState(() => _color = color);
                    },
                    child: AnimatedContainer(
                      duration: const Duration(milliseconds: 180),
                      width: 44,
                      height: 44,
                      decoration: BoxDecoration(
                        color: Color(
                          int.parse(color.substring(1), radix: 16) + 0xFF000000,
                        ),
                        shape: BoxShape.circle,
                        border: Border.all(
                          color: selected ? LhColors.text : LhColors.border,
                          width: selected ? 3 : 1,
                        ),
                        boxShadow: selected
                            ? <BoxShadow>[
                                BoxShadow(
                                  color: LhColors.primary.withValues(alpha: 0.35),
                                  blurRadius: 12,
                                ),
                              ]
                            : null,
                      ),
                    ),
                  );
                }).toList(),
              ),
              const Spacer(),
              LhPrimaryButton(
                label: resolver.resolve(TranslationKeys.identitySave),
                onPressed: _submit,
              ),
            ],
          ),
        ),
      ),
    );
  }
}
