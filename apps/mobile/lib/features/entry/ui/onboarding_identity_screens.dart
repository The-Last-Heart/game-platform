import 'package:flutter/material.dart';

import '../../../l10n/app_localization.dart';
import '../../../l10n/translation_catalog.dart';
import '../../../theme/lh_tokens.dart';
import '../../identity/data/identity_store.dart';

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

class _OnboardingScreenState extends State<OnboardingScreen> {
  int _step = 0;

  @override
  Widget build(BuildContext context) {
    final resolver = AppLocalization.of(context);
    final List<({String title, String body, IconData icon})> steps =
        <({String title, String body, IconData icon})>[
          (
            title: resolver.resolve(TranslationKeys.onboardingHeartsTitle),
            body: resolver.resolve(TranslationKeys.onboardingHeartsBody),
            icon: Icons.favorite,
          ),
          (
            title: resolver.resolve(TranslationKeys.onboardingTimingTitle),
            body: resolver.resolve(TranslationKeys.onboardingTimingBody),
            icon: Icons.timer_outlined,
          ),
          (
            title: resolver.resolve(TranslationKeys.onboardingEnergyTitle),
            body: resolver.resolve(TranslationKeys.onboardingEnergyBody),
            icon: Icons.bolt,
          ),
        ];
    final step = steps[_step];

    return Scaffold(
      backgroundColor: LhColors.bg,
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: <Widget>[
              if (widget.replayMode)
                Align(
                  alignment: AlignmentDirectional.centerStart,
                  child: TextButton(
                    onPressed: widget.onReplayExit,
                    child: Text(resolver.resolve(TranslationKeys.commonBack)),
                  ),
                ),
              const Spacer(),
              Icon(step.icon, size: 72, color: LhColors.primary),
              const SizedBox(height: 24),
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
              const Spacer(),
              Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: List<Widget>.generate(
                  steps.length,
                  (int i) => Container(
                    width: 8,
                    height: 8,
                    margin: const EdgeInsets.symmetric(horizontal: 4),
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      color: i == _step ? LhColors.primary : LhColors.border,
                    ),
                  ),
                ),
              ),
              const SizedBox(height: 20),
              SizedBox(
                height: 56,
                child: ElevatedButton(
                  onPressed: () {
                    if (_step < steps.length - 1) {
                      setState(() => _step += 1);
                    } else {
                      widget.onCompleted();
                    }
                  },
                  child: Text(
                    resolver.resolve(
                      _step < steps.length - 1
                          ? TranslationKeys.commonNext
                          : TranslationKeys.onboardingDone,
                    ),
                  ),
                ),
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
    final resolver = AppLocalization.of(context);
    return Scaffold(
      backgroundColor: LhColors.bg,
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: <Widget>[
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
                    onTap: () => setState(() => _color = color),
                    child: Container(
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
                      ),
                    ),
                  );
                }).toList(),
              ),
              const Spacer(),
              SizedBox(
                height: 56,
                child: ElevatedButton(
                  onPressed: _submit,
                  child: Text(resolver.resolve(TranslationKeys.identitySave)),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
