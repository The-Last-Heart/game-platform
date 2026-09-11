import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../../l10n/app_localization.dart';
import '../../../l10n/translation_catalog.dart';
import '../../../theme/lh_tokens.dart';
import '../../identity/data/identity_store.dart';
import '../../match/protocol/realtime_messages.dart';
import '../../match/session/match_session_controller.dart';
import '../../match/state/match_snapshot.dart';
import '../../match/ui/match_shell.dart';
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
    super.key,
  });

  final MatchSessionController controller;
  final IdentityStore? identityStore;
  final EntryPreferencesStore? entryPreferences;

  @override
  State<AppEntryScreen> createState() => _AppEntryScreenState();
}

class _AppEntryScreenState extends State<AppEntryScreen> {
  late final IdentityStore _identityStore;
  late final EntryPreferencesStore _entryPreferences;
  _EntryPhase _phase = _EntryPhase.loading;
  PlayerIdentity? _identity;
  String? _queueError;
  int _queueSeats = 0;
  String? _ticketId;
  final TextEditingController _roomCodeController = TextEditingController();

  @override
  void initState() {
    super.initState();
    _identityStore = widget.identityStore ?? IdentityStore();
    _entryPreferences = widget.entryPreferences ?? EntryPreferencesStore();
    widget.controller.state.addListener(_onMatchState);
    _bootstrapEntry();
  }

  @override
  void dispose() {
    widget.controller.state.removeListener(_onMatchState);
    _roomCodeController.dispose();
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
    }
  }

  Future<void> _bootstrapEntry() async {
    final bool onboarded = await _entryPreferences.isOnboardingCompleted();
    final PlayerIdentity? identity = await _identityStore.load();
    if (!mounted) return;
    setState(() {
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
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _phase = _EntryPhase.home;
        _queueError = TranslationKeys.errorsServiceUnavailable;
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
    } catch (_) {
      if (!mounted) return;
      setState(() => _queueError = TranslationKeys.errorsServiceUnavailable);
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
    } catch (_) {
      if (!mounted) return;
      setState(() => _queueError = TranslationKeys.privateInvalidCode);
    }
  }

  Future<void> _startTraining() async {
    final PlayerIdentity? identity = _identity;
    if (identity == null) return;
    try {
      await widget.controller.startTraining(identity);
    } catch (_) {
      if (!mounted) return;
      setState(() => _queueError = TranslationKeys.errorsServiceUnavailable);
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
          _EntryPhase.loading => const Scaffold(
            backgroundColor: LhColors.bg,
            body: Center(child: CircularProgressIndicator()),
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
    final resolver = AppLocalization.of(context);
    final String name = identity?.displayName ?? '';
    final Color avatar = identity != null
        ? Color(
            int.parse(identity!.avatarColor.substring(1), radix: 16) +
                0xFF000000,
          )
        : LhColors.primary;

    return Scaffold(
      backgroundColor: LhColors.bg,
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(20, 16, 20, 24),
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
                    child: Text(
                      name.isEmpty
                          ? resolver.resolve(TranslationKeys.appTitle)
                          : name,
                      style: Theme.of(context).textTheme.headlineMedium,
                    ),
                  ),
                  TextButton(
                    onPressed: onEditIdentity,
                    child: Text(
                      resolver.resolve(TranslationKeys.homeEditIdentity),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 12),
              Text(
                resolver.resolve(TranslationKeys.homeTagline),
                style: Theme.of(context).textTheme.titleMedium,
              ),
              if (errorKey != null) ...<Widget>[
                const SizedBox(height: 12),
                Text(
                  resolver.resolve(errorKey!),
                  style: Theme.of(
                    context,
                  ).textTheme.bodyMedium?.copyWith(color: LhColors.primary),
                ),
              ],
              const Spacer(),
              SizedBox(
                height: 56,
                child: ElevatedButton(
                  onPressed: onPlayNow,
                  child: Text(resolver.resolve(TranslationKeys.homePlayNow)),
                ),
              ),
              const SizedBox(height: 12),
              _ModeCard(
                title: resolver.resolve(TranslationKeys.homeQuickSurvival),
                subtitle: resolver.resolve(
                  TranslationKeys.homeQuickSurvivalDesc,
                ),
                onTap: onPlayNow,
              ),
              const SizedBox(height: 10),
              _ModeCard(
                title: resolver.resolve(TranslationKeys.homePrivateRoom),
                subtitle: resolver.resolve(TranslationKeys.homePrivateRoomDesc),
                onTap: onPrivate,
              ),
              const SizedBox(height: 10),
              _ModeCard(
                title: resolver.resolve(TranslationKeys.homeTraining),
                subtitle: resolver.resolve(TranslationKeys.homeTrainingDesc),
                onTap: onTraining,
              ),
              const SizedBox(height: 16),
              TextButton(
                onPressed: onHelp,
                child: Text(
                  resolver.resolve(TranslationKeys.homeHelpOnboarding),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _ModeCard extends StatelessWidget {
  const _ModeCard({
    required this.title,
    required this.subtitle,
    required this.onTap,
  });

  final String title;
  final String subtitle;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: LhColors.surface,
      borderRadius: LhRadii.mdAll,
      child: InkWell(
        onTap: onTap,
        borderRadius: LhRadii.mdAll,
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: <Widget>[
              Text(title, style: Theme.of(context).textTheme.headlineMedium),
              const SizedBox(height: 4),
              Text(subtitle, style: Theme.of(context).textTheme.bodyMedium),
            ],
          ),
        ),
      ),
    );
  }
}

class _MatchmakingView extends StatelessWidget {
  const _MatchmakingView({required this.seats, required this.onCancel});

  final int seats;
  final VoidCallback onCancel;

  @override
  Widget build(BuildContext context) {
    final resolver = AppLocalization.of(context);
    return Scaffold(
      backgroundColor: LhColors.bg,
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            children: <Widget>[
              Text(
                resolver.resolve(TranslationKeys.matchmakingTitle),
                style: Theme.of(context).textTheme.displayLarge,
              ),
              const Spacer(),
              const CircularProgressIndicator(),
              const SizedBox(height: 16),
              Text(resolver.resolve(TranslationKeys.matchmakingSearching)),
              const SizedBox(height: 8),
              Text(
                resolver.resolve(
                  TranslationKeys.matchmakingSeats,
                  params: <String, String>{'count': '$seats'},
                ),
              ),
              const Spacer(),
              SizedBox(
                width: double.infinity,
                height: 52,
                child: OutlinedButton(
                  onPressed: onCancel,
                  child: Text(
                    resolver.resolve(TranslationKeys.matchmakingCancel),
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
    final resolver = AppLocalization.of(context);
    return Scaffold(
      backgroundColor: LhColors.bg,
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: <Widget>[
              Align(
                alignment: AlignmentDirectional.centerStart,
                child: TextButton(
                  onPressed: onBack,
                  child: Text(resolver.resolve(TranslationKeys.commonBack)),
                ),
              ),
              Text(
                resolver.resolve(TranslationKeys.homePrivateRoom),
                style: Theme.of(context).textTheme.displayLarge,
              ),
              const SizedBox(height: 24),
              SizedBox(
                height: 52,
                child: ElevatedButton(
                  onPressed: onCreate,
                  child: Text(resolver.resolve(TranslationKeys.privateCreate)),
                ),
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
                ),
              ),
              if (errorKey != null) ...<Widget>[
                const SizedBox(height: 8),
                Text(
                  resolver.resolve(errorKey!),
                  style: const TextStyle(color: LhColors.primary),
                ),
              ],
              const SizedBox(height: 12),
              SizedBox(
                height: 52,
                child: OutlinedButton(
                  onPressed: onJoin,
                  child: Text(resolver.resolve(TranslationKeys.privateJoin)),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
