import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../../l10n/app_localization.dart';
import '../../../l10n/translation_catalog.dart';
import '../../../l10n/translation_resolver.dart';
import '../../../theme/lh_tokens.dart';
import '../../identity/data/identity_store.dart';
import '../../match/protocol/realtime_messages.dart';
import '../../match/session/match_session_controller.dart';
import '../../match/state/match_snapshot.dart';
import '../../match/transport/socket_io_transport.dart';
import '../../match/ui/match_shell.dart';
import '../../match/ui/widgets/lh_background.dart';
import '../../match/ui/widgets/lh_buttons.dart';
import '../../match/ui/widgets/lh_heart_logo.dart';
import '../../match/ui/widgets/lh_ui_sound.dart';
import 'onboarding_identity_screens.dart';

enum _EntryPhase {
  loading,
  onboarding,
  identity,
  home,
  matchmaking,
  privateAccess,
  onboardingReplay,
  identityEdit,
}

/// Product entry: splash → onboarding → identity → home / modes / match.
class AppEntryScreen extends StatefulWidget {
  const AppEntryScreen({
    required this.controller,
    this.identityStore,
    this.entryPreferences,
    this.appVersionLabel,
    super.key,
  });

  final MatchSessionController controller;
  final IdentityStore? identityStore;
  final EntryPreferencesStore? entryPreferences;

  /// Optional override for tests / splash footer (defaults to pubspec version).
  final String? appVersionLabel;

  @override
  State<AppEntryScreen> createState() => _AppEntryScreenState();
}

class _AppEntryScreenState extends State<AppEntryScreen>
    with SingleTickerProviderStateMixin {
  late final IdentityStore _identityStore;
  late final EntryPreferencesStore _entryPreferences;
  _EntryPhase _phase = _EntryPhase.loading;
  PlayerIdentity? _identity;
  String? _queueError;
  int _queueSeats = 0;
  String? _ticketId;
  String _versionLabel = '0.0.1';
  final TextEditingController _roomCodeController = TextEditingController();
  late final AnimationController _splashPulse;
  late final Animation<double> _splashScale;

  @override
  void initState() {
    super.initState();
    _identityStore = widget.identityStore ?? IdentityStore();
    _entryPreferences = widget.entryPreferences ?? EntryPreferencesStore();
    _splashPulse = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1100),
    )..repeat(reverse: true);
    _splashScale = Tween<double>(begin: 0.94, end: 1.06).animate(
      CurvedAnimation(parent: _splashPulse, curve: Curves.easeInOut),
    );
    widget.controller.state.addListener(_onMatchState);
    _bootstrapEntry();
  }

  @override
  void dispose() {
    widget.controller.state.removeListener(_onMatchState);
    _roomCodeController.dispose();
    _splashPulse.dispose();
    super.dispose();
  }

  void _onMatchState() {
    if (!mounted) return;
    final MatchViewState s = widget.controller.state.value;
    if (s.inMatch) {
      setState(() {
        _queueError = null;
        _ticketId = null;
        if (_phase == _EntryPhase.matchmaking ||
            _phase == _EntryPhase.privateAccess) {
          _phase = _EntryPhase.home;
        }
      });
      return;
    }

    final String? err = s.connectionError;
    if (err == null || err.isEmpty) return;

    final String mapped = err.startsWith('errors.')
        ? err
        : TranslationKeys.errorsServiceUnavailable;
    debugPrint('AppEntryScreen connectionError=$err mapped=$mapped');

    if (_phase == _EntryPhase.matchmaking) {
      setState(() {
        _phase = _EntryPhase.home;
        _queueError = mapped;
        _ticketId = null;
        _queueSeats = 0;
      });
    } else if (_phase == _EntryPhase.home ||
        _phase == _EntryPhase.privateAccess) {
      setState(() => _queueError = mapped);
    }
  }

  String _mapConnectError(Object error) {
    if (error is RealtimeConnectException) {
      return switch (error.failure) {
        RealtimeConnectFailure.timeout =>
          TranslationKeys.errorsConnectionTimeout,
        RealtimeConnectFailure.failed =>
          TranslationKeys.errorsConnectionFailed,
      };
    }
    return TranslationKeys.errorsServiceUnavailable;
  }

  /// Prefer a catalog string; if missing, keep the raw key so the banner is honest.
  static String displayEntryError(TranslationResolver resolver, String key) {
    final String text = resolver.resolve(key);
    final String fallback = resolver.resolve(
      TranslationKeys.errorsContentUnavailable,
    );
    if (text == fallback && key != TranslationKeys.errorsContentUnavailable) {
      return 'خطأ: $key';
    }
    return text;
  }

  Future<void> _bootstrapEntry() async {
    final String versionLabel = widget.appVersionLabel ?? '0.0.1';
    final bool onboarded = await _entryPreferences.isOnboardingCompleted();
    final PlayerIdentity? identity = await _identityStore.load();
    if (!mounted) return;
    setState(() {
      _versionLabel = versionLabel;
      _identity = identity;
      if (!onboarded) {
        _phase = _EntryPhase.onboarding;
      } else if (identity == null) {
        _phase = _EntryPhase.identity;
      } else {
        _phase = _EntryPhase.home;
      }
    });
  }

  Future<void> _completeOnboarding() async {
    await _entryPreferences.setOnboardingCompleted(true);
    if (!mounted) return;
    setState(() {
      _phase = _identity == null ? _EntryPhase.identity : _EntryPhase.home;
    });
  }

  Future<void> _saveIdentity(PlayerIdentity identity) async {
    await _identityStore.save(identity);
    if (!mounted) return;
    setState(() {
      _identity = identity;
      _phase = _EntryPhase.home;
    });
  }

  Future<void> _enqueueQuickSurvival() async {
    final PlayerIdentity? identity = _identity;
    if (identity == null) return;
    setState(() {
      _phase = _EntryPhase.matchmaking;
      _queueError = null;
      _queueSeats = 1;
    });
    try {
      final String? ticketId = await widget.controller.enqueueMatchmaking(
        identity,
      );
      if (!mounted) return;
      setState(() => _ticketId = ticketId);
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _phase = _EntryPhase.home;
        _queueError = _mapConnectError(error);
      });
    }
  }

  Future<void> _cancelQueue() async {
    await widget.controller.cancelMatchmaking(_ticketId);
    if (!mounted) return;
    setState(() {
      _phase = _EntryPhase.home;
      _ticketId = null;
      _queueSeats = 0;
    });
  }

  Future<void> _createPrivate() async {
    final PlayerIdentity? identity = _identity;
    if (identity == null) return;
    try {
      await widget.controller.createPrivateRoom(identity);
    } catch (error) {
      if (!mounted) return;
      setState(() => _queueError = _mapConnectError(error));
    }
  }

  Future<void> _joinPrivate() async {
    final PlayerIdentity? identity = _identity;
    if (identity == null) return;
    final String code = _roomCodeController.text.trim();
    if (code.length < 4) {
      setState(() => _queueError = TranslationKeys.privateInvalidCode);
      return;
    }
    try {
      await widget.controller.joinPrivateRoom(identity, code);
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _queueError = error is RealtimeConnectException
            ? _mapConnectError(error)
            : TranslationKeys.privateInvalidCode;
      });
    }
  }

  Future<void> _startTraining() async {
    final PlayerIdentity? identity = _identity;
    if (identity == null) return;
    setState(() => _queueError = null);
    try {
      await widget.controller.startTraining(identity);
      for (int i = 0; i < 40; i++) {
        await Future<void>.delayed(const Duration(milliseconds: 100));
        if (!mounted) return;
        if (widget.controller.state.value.inMatch) return;
        final String? err = widget.controller.state.value.connectionError;
        if (err != null && err.isNotEmpty) {
          setState(() {
            _queueError = err.startsWith('errors.')
                ? err
                : TranslationKeys.errorsServiceUnavailable;
          });
          return;
        }
      }
      if (!mounted) return;
      if (!widget.controller.state.value.inMatch) {
        setState(
          () => _queueError = TranslationKeys.errorsServiceUnavailable,
        );
      }
    } catch (error) {
      if (!mounted) return;
      setState(() => _queueError = _mapConnectError(error));
    }
  }

  @override
  Widget build(BuildContext context) {
    return ValueListenableBuilder<MatchViewState>(
      valueListenable: widget.controller.state,
      builder: (BuildContext context, MatchViewState matchState, _) {
        if (matchState.inMatch) {
          return MatchShell(
            controller: widget.controller,
            onBackHome: () async {
              await widget.controller.leaveMatch();
            },
            onRematch: () async {
              if (widget.controller.state.value.mode == MatchMode.training) {
                await widget.controller.retryTraining();
              } else {
                await widget.controller.requestRematch();
              }
            },
          );
        }

        return switch (_phase) {
          _EntryPhase.loading => _SplashView(
            versionLabel: _versionLabel,
            scale: _splashScale,
          ),
          _EntryPhase.onboarding || _EntryPhase.onboardingReplay =>
            OnboardingScreen(
              replayMode: _phase == _EntryPhase.onboardingReplay,
              onCompleted: _completeOnboarding,
              onReplayExit: () => setState(() => _phase = _EntryPhase.home),
            ),
          _EntryPhase.identity || _EntryPhase.identityEdit => IdentityScreen(
            initial: _identity,
            onSaved: _saveIdentity,
          ),
          _EntryPhase.matchmaking => _MatchmakingView(
            seats: matchState.matchmakingAcceptedSeats > 0
                ? matchState.matchmakingAcceptedSeats
                : _queueSeats,
            identity: _identity,
            onCancel: _cancelQueue,
          ),
          _EntryPhase.privateAccess => _PrivateAccessView(
            codeController: _roomCodeController,
            errorKey: _queueError,
            onCreate: _createPrivate,
            onJoin: _joinPrivate,
            onBack: () => setState(() {
              _phase = _EntryPhase.home;
              _queueError = null;
            }),
          ),
          _EntryPhase.home => _HomeView(
            identity: _identity,
            errorKey: _queueError,
            onPlayNow: _enqueueQuickSurvival,
            onPrivate: () => setState(() {
              _phase = _EntryPhase.privateAccess;
              _queueError = null;
            }),
            onTraining: _startTraining,
            onHelp: () => setState(() => _phase = _EntryPhase.onboardingReplay),
            onEditIdentity: () =>
                setState(() => _phase = _EntryPhase.identityEdit),
          ),
        };
      },
    );
  }
}

class _SplashView extends StatelessWidget {
  const _SplashView({required this.versionLabel, required this.scale});

  final String versionLabel;
  final Animation<double> scale;

  @override
  Widget build(BuildContext context) {
    final TranslationResolver resolver = AppLocalization.of(context);
    return LhBackground(
      child: SafeArea(
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 28, vertical: 24),
          child: Column(
            children: <Widget>[
              const Spacer(flex: 2),
              ScaleTransition(
                scale: scale,
                child: const LhHeartLogo(size: 120),
              ),
              const SizedBox(height: 28),
              Text(
                resolver.resolve(TranslationKeys.appTitle),
                style: Theme.of(context).textTheme.displayLarge?.copyWith(
                  shadows: const <Shadow>[
                    Shadow(color: LhColors.primary, blurRadius: 18),
                  ],
                ),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 12),
              Text(
                resolver.resolve(TranslationKeys.splashTagline),
                style: Theme.of(context).textTheme.titleMedium,
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 28),
              const ClipRRect(
                borderRadius: LhRadii.pillAll,
                child: LinearProgressIndicator(
                  minHeight: 6,
                  backgroundColor: LhColors.border,
                  color: LhColors.primary,
                ),
              ),
              const Spacer(flex: 3),
              Text(
                resolver.resolve(
                  TranslationKeys.splashVersion,
                  params: <String, String>{'version': versionLabel},
                ),
                style: Theme.of(context).textTheme.bodySmall,
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _HomeView extends StatelessWidget {
  const _HomeView({
    required this.identity,
    required this.onPlayNow,
    required this.onPrivate,
    required this.onTraining,
    required this.onHelp,
    required this.onEditIdentity,
    this.errorKey,
  });

  final PlayerIdentity? identity;
  final String? errorKey;
  final VoidCallback onPlayNow;
  final VoidCallback onPrivate;
  final VoidCallback onTraining;
  final VoidCallback onHelp;
  final VoidCallback onEditIdentity;

  @override
  Widget build(BuildContext context) {
    final TranslationResolver resolver = AppLocalization.of(context);
    final String name = identity?.displayName ?? '';
    final Color avatar = identity != null
        ? Color(
            int.parse(identity!.avatarColor.substring(1), radix: 16) +
                0xFF000000,
          )
        : LhColors.primary;

    return LhBackground(
      child: SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(20, 12, 20, 20),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: <Widget>[
              Row(
                children: <Widget>[
                  CircleAvatar(
                    backgroundColor: avatar,
                    child: Text(
                      name.isNotEmpty ? name.substring(0, 1) : '?',
                      style: const TextStyle(color: Colors.white),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: <Widget>[
                        Text(
                          name.isEmpty
                              ? resolver.resolve(TranslationKeys.appTitle)
                              : resolver.resolve(
                                  TranslationKeys.homeGreeting,
                                  params: <String, String>{'name': name},
                                ),
                          style: Theme.of(context).textTheme.headlineMedium,
                        ),
                        Text(
                          resolver.resolve(TranslationKeys.homeTagline),
                          style: Theme.of(context).textTheme.bodySmall,
                        ),
                      ],
                    ),
                  ),
                  TextButton(
                    onPressed: () async {
                      await LhUiSound.instance.playTap();
                      onEditIdentity();
                    },
                    child: Text(
                      resolver.resolve(TranslationKeys.homeEditIdentity),
                    ),
                  ),
                ],
              ),
              if (errorKey != null) ...<Widget>[
                const SizedBox(height: 10),
                Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: LhColors.surface,
                    borderRadius: LhRadii.mdAll,
                    border: Border.all(color: LhColors.primary.withValues(alpha: 0.5)),
                  ),
                  child: Text(
                    _AppEntryScreenState.displayEntryError(resolver, errorKey!),
                    style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                      color: LhColors.primaryBright,
                    ),
                  ),
                ),
              ],
              const SizedBox(height: 16),
              Expanded(
                child: SingleChildScrollView(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: <Widget>[
                      _HeroCard(resolver: resolver),
                      const SizedBox(height: 16),
                      LhPrimaryButton(
                        label: resolver.resolve(TranslationKeys.homePlayNow),
                        icon: Icons.play_arrow_rounded,
                        onPressed: onPlayNow,
                      ),
                      const SizedBox(height: 20),
                      Text(
                        resolver.resolve(TranslationKeys.homeModesTitle),
                        style: Theme.of(context).textTheme.headlineMedium,
                      ),
                      const SizedBox(height: 10),
                      _ModeCard(
                        icon: Icons.bolt,
                        accent: LhColors.primary,
                        title: resolver.resolve(
                          TranslationKeys.homeQuickSurvival,
                        ),
                        subtitle: resolver.resolve(
                          TranslationKeys.homeQuickSurvivalDesc,
                        ),
                        onTap: onPlayNow,
                      ),
                      const SizedBox(height: 10),
                      _ModeCard(
                        icon: Icons.groups_rounded,
                        accent: LhColors.success,
                        title: resolver.resolve(
                          TranslationKeys.homePrivateRoom,
                        ),
                        subtitle: resolver.resolve(
                          TranslationKeys.homePrivateRoomDesc,
                        ),
                        onTap: onPrivate,
                      ),
                      const SizedBox(height: 10),
                      _ModeCard(
                        icon: Icons.center_focus_strong,
                        accent: LhColors.warning,
                        title: resolver.resolve(TranslationKeys.homeTraining),
                        subtitle: resolver.resolve(
                          TranslationKeys.homeTrainingDesc,
                        ),
                        onTap: onTraining,
                      ),
                      const SizedBox(height: 12),
                      TextButton(
                        onPressed: () async {
                          await LhUiSound.instance.playTap();
                          onHelp();
                        },
                        child: Text(
                          resolver.resolve(TranslationKeys.homeHelpOnboarding),
                        ),
                      ),
                    ],
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

class _HeroCard extends StatelessWidget {
  const _HeroCard({required this.resolver});

  final TranslationResolver resolver;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.fromLTRB(20, 24, 20, 20),
      decoration: BoxDecoration(
        color: LhColors.surface.withValues(alpha: 0.92),
        borderRadius: LhRadii.lgAll,
        border: Border.all(color: LhColors.primary.withValues(alpha: 0.65), width: 1.4),
        boxShadow: <BoxShadow>[
          BoxShadow(
            color: LhColors.primary.withValues(alpha: 0.28),
            blurRadius: 28,
            spreadRadius: 1,
          ),
        ],
      ),
      child: Column(
        children: <Widget>[
          const LhHeartLogo(size: 72),
          const SizedBox(height: 14),
          Text(
            resolver.resolve(TranslationKeys.appTitle),
            style: Theme.of(context).textTheme.displayLarge?.copyWith(
              fontSize: 32,
              shadows: const <Shadow>[
                Shadow(color: LhColors.primary, blurRadius: 14),
              ],
            ),
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: 6),
          Text(
            resolver.resolve(TranslationKeys.homeHeroSubtitle),
            style: Theme.of(context).textTheme.titleMedium,
            textAlign: TextAlign.center,
          ),
        ],
      ),
    );
  }
}

class _ModeCard extends StatelessWidget {
  const _ModeCard({
    required this.icon,
    required this.accent,
    required this.title,
    required this.subtitle,
    required this.onTap,
  });

  final IconData icon;
  final Color accent;
  final String title;
  final String subtitle;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: LhColors.elevated.withValues(alpha: 0.95),
      borderRadius: LhRadii.mdAll,
      child: InkWell(
        onTap: () async {
          await LhUiSound.instance.playTap();
          onTap();
        },
        borderRadius: LhRadii.mdAll,
        child: Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            borderRadius: LhRadii.mdAll,
            border: Border.all(color: accent.withValues(alpha: 0.35)),
          ),
          child: Row(
            children: <Widget>[
              Container(
                width: 48,
                height: 48,
                decoration: BoxDecoration(
                  color: LhColors.surface,
                  borderRadius: LhRadii.smAll,
                  boxShadow: <BoxShadow>[
                    BoxShadow(
                      color: accent.withValues(alpha: 0.35),
                      blurRadius: 14,
                    ),
                  ],
                ),
                child: Icon(icon, color: accent),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: <Widget>[
                    Text(
                      title,
                      style: Theme.of(context).textTheme.headlineMedium,
                    ),
                    const SizedBox(height: 4),
                    Text(
                      subtitle,
                      style: Theme.of(context).textTheme.bodyMedium,
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _MatchmakingView extends StatefulWidget {
  const _MatchmakingView({
    required this.seats,
    required this.onCancel,
    this.identity,
  });

  final int seats;
  final VoidCallback onCancel;
  final PlayerIdentity? identity;

  @override
  State<_MatchmakingView> createState() => _MatchmakingViewState();
}

class _MatchmakingViewState extends State<_MatchmakingView>
    with TickerProviderStateMixin {
  late final AnimationController _ring;
  late final AnimationController _pulse;
  late final Animation<double> _ringTurn;
  late final Animation<double> _heartScale;

  @override
  void initState() {
    super.initState();
    _ring = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1800),
    )..repeat();
    _pulse = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1100),
    )..repeat(reverse: true);
    _ringTurn = Tween<double>(begin: 0, end: 1).animate(_ring);
    _heartScale = Tween<double>(begin: 0.94, end: 1.06).animate(
      CurvedAnimation(parent: _pulse, curve: Curves.easeInOut),
    );
  }

  @override
  void dispose() {
    _ring.dispose();
    _pulse.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final TranslationResolver resolver = AppLocalization.of(context);
    final int seats = widget.seats.clamp(1, 6);
    final String localLetter =
        (widget.identity?.displayName.isNotEmpty ?? false)
        ? widget.identity!.displayName.substring(0, 1)
        : '?';
    final Color localColor = widget.identity != null
        ? Color(
            int.parse(widget.identity!.avatarColor.substring(1), radix: 16) +
                0xFF000000,
          )
        : kPlayerAvatarColors[0];

    return LhBackground(
      child: SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(20, 12, 20, 20),
          child: Column(
            children: <Widget>[
              Row(
                children: <Widget>[
                  LhChromeIconButton(
                    icon: Icons.chevron_left,
                    onPressed: widget.onCancel,
                  ),
                  const Spacer(),
                  const LhHeartLogo(size: 36),
                  const SizedBox(width: 10),
                  Text(
                    resolver.resolve(TranslationKeys.matchmakingTitle),
                    style: Theme.of(context).textTheme.headlineMedium,
                  ),
                ],
              ),
              const Spacer(flex: 2),
              SizedBox(
                width: 200,
                height: 200,
                child: Stack(
                  alignment: Alignment.center,
                  children: <Widget>[
                    RotationTransition(
                      turns: _ringTurn,
                      child: SizedBox(
                        width: 200,
                        height: 200,
                        child: CircularProgressIndicator(
                          value: 0.72,
                          strokeWidth: 4,
                          color: LhColors.primary,
                          backgroundColor: LhColors.border.withValues(
                            alpha: 0.45,
                          ),
                        ),
                      ),
                    ),
                    ScaleTransition(
                      scale: _heartScale,
                      child: const LhHeartLogo(size: 96),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 28),
              Text(
                resolver.resolve(TranslationKeys.matchmakingSearching),
                style: Theme.of(context).textTheme.headlineLarge,
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 8),
              Text(
                resolver.resolve(
                  TranslationKeys.matchmakingSeats,
                  params: <String, String>{'count': '$seats'},
                ),
                style: Theme.of(context).textTheme.titleMedium,
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 28),
              Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: List<Widget>.generate(6, (int index) {
                  final bool filled = index < seats;
                  if (!filled) {
                    return Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 4),
                      child: Container(
                        width: 44,
                        height: 44,
                        decoration: BoxDecoration(
                          shape: BoxShape.circle,
                          border: Border.all(
                            color: LhColors.border,
                            width: 1.5,
                          ),
                        ),
                        child: const Icon(
                          Icons.add,
                          size: 18,
                          color: LhColors.textMuted,
                        ),
                      ),
                    );
                  }
                  final bool isLocal = index == 0;
                  final Color color = isLocal
                      ? localColor
                      : kPlayerAvatarColors[index % kPlayerAvatarColors.length];
                  return Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 4),
                    child: Container(
                      width: 44,
                      height: 44,
                      alignment: Alignment.center,
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        color: color,
                        boxShadow: <BoxShadow>[
                          BoxShadow(
                            color: color.withValues(alpha: 0.4),
                            blurRadius: 10,
                          ),
                        ],
                      ),
                      child: Text(
                        isLocal ? localLetter : '',
                        style: const TextStyle(
                          color: Colors.white,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ),
                  );
                }),
              ),
              const Spacer(flex: 3),
              LhSecondaryButton(
                label: resolver.resolve(TranslationKeys.matchmakingCancel),
                onPressed: widget.onCancel,
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _PrivateAccessView extends StatelessWidget {
  const _PrivateAccessView({
    required this.codeController,
    required this.onCreate,
    required this.onJoin,
    required this.onBack,
    this.errorKey,
  });

  final TextEditingController codeController;
  final VoidCallback onCreate;
  final VoidCallback onJoin;
  final VoidCallback onBack;
  final String? errorKey;

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
              Row(
                children: <Widget>[
                  LhChromeIconButton(
                    icon: Icons.chevron_left,
                    onPressed: onBack,
                  ),
                  const SizedBox(width: 12),
                  const LhHeartLogo(size: 36),
                  const SizedBox(width: 10),
                  Text(
                    resolver.resolve(TranslationKeys.homePrivateRoom),
                    style: Theme.of(context).textTheme.headlineMedium,
                  ),
                ],
              ),
              const SizedBox(height: 16),
              Text(
                resolver.resolve(TranslationKeys.homePrivateRoomDesc),
                style: Theme.of(context).textTheme.titleMedium,
              ),
              const SizedBox(height: 24),
              if (errorKey != null) ...<Widget>[
                Text(
                  _AppEntryScreenState.displayEntryError(resolver, errorKey!),
                  style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                    color: LhColors.primaryBright,
                  ),
                ),
                const SizedBox(height: 12),
              ],
              LhPrimaryButton(
                label: resolver.resolve(TranslationKeys.privateCreate),
                onPressed: onCreate,
              ),
              const SizedBox(height: 24),
              TextField(
                controller: codeController,
                textCapitalization: TextCapitalization.characters,
                inputFormatters: <TextInputFormatter>[
                  FilteringTextInputFormatter.allow(RegExp(r'[A-Za-z0-9]')),
                  LengthLimitingTextInputFormatter(8),
                ],
                decoration: InputDecoration(
                  labelText: resolver.resolve(TranslationKeys.privateCodeLabel),
                  filled: true,
                  fillColor: LhColors.surface,
                ),
              ),
              const SizedBox(height: 12),
              LhSecondaryButton(
                label: resolver.resolve(TranslationKeys.privateJoin),
                onPressed: onJoin,
              ),
            ],
          ),
        ),
      ),
    );
  }
}
