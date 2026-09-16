import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../../l10n/app_localization.dart';
import '../../../l10n/localized_digits.dart';
import '../../../l10n/translation_catalog.dart';
import '../../../l10n/translation_resolver.dart';
import '../../../theme/lh_tokens.dart';
import '../../content/content_asset_cache.dart';
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
import '../../presence/presence_session.dart';
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
    this.backendBaseUrl,
    this.presence,
    super.key,
  });

  final MatchSessionController controller;
  final IdentityStore? identityStore;
  final EntryPreferencesStore? entryPreferences;

  /// Optional override for tests / splash footer (defaults to pubspec version).
  final String? appVersionLabel;

  /// Backend HTTP origin used to sync the content pack (challenge assets).
  final String? backendBaseUrl;

  /// Live occupancy for the home hero. Tests inject [FakePresenceSession].
  final PresenceSession? presence;

  @override
  State<AppEntryScreen> createState() => _AppEntryScreenState();
}

class _AppEntryScreenState extends State<AppEntryScreen>
    with SingleTickerProviderStateMixin, WidgetsBindingObserver {
  late final IdentityStore _identityStore;
  late final EntryPreferencesStore _entryPreferences;
  late final PresenceSession? _presence;
  bool _ownsPresence = false;
  _EntryPhase _phase = _EntryPhase.loading;
  PlayerIdentity? _identity;
  String? _queueError;
  int _queueSeats = 0;
  String? _ticketId;
  String _versionLabel = '0.0.1';
  double _assetProgress = 0;
  String? _assetStatusKey;
  final TextEditingController _roomCodeController = TextEditingController();
  late final AnimationController _splashPulse;
  late final Animation<double> _splashScale;
  DateTime? _lastBackAt;
  Timer? _searchTimeoutTimer;

  static const Duration _liveSearchTimeout = Duration(minutes: 1);

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _identityStore = widget.identityStore ?? IdentityStore();
    _entryPreferences = widget.entryPreferences ?? EntryPreferencesStore();
    if (widget.presence != null) {
      _presence = widget.presence;
    } else {
      final String? backendUrl = widget.backendBaseUrl;
      if (backendUrl != null && backendUrl.isNotEmpty) {
        _presence = SocketPresenceSession(url: backendUrl);
        _ownsPresence = true;
      } else {
        _presence = null;
      }
    }
    _splashPulse = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1100),
    )..repeat(reverse: true);
    _splashScale = Tween<double>(
      begin: 0.94,
      end: 1.06,
    ).animate(CurvedAnimation(parent: _splashPulse, curve: Curves.easeInOut));
    widget.controller.state.addListener(_onMatchState);
    _bootstrapEntry();
    unawaited(_presence?.setForeground(true));
  }

  @override
  void setState(VoidCallback fn) {
    super.setState(fn);
    if (!mounted) return;
    if (_phase == _EntryPhase.loading) {
      if (!_splashPulse.isAnimating) {
        _splashPulse.repeat(reverse: true);
      }
    } else if (_splashPulse.isAnimating) {
      _splashPulse.stop();
    }
  }

  @override
  void dispose() {
    _searchTimeoutTimer?.cancel();
    WidgetsBinding.instance.removeObserver(this);
    widget.controller.state.removeListener(_onMatchState);
    unawaited(_presence?.setForeground(false));
    if (_ownsPresence) {
      _presence?.dispose();
    }
    _roomCodeController.dispose();
    _splashPulse.dispose();
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    // Process death / swipe-away: drop match seat so next cold start is home.
    if (state == AppLifecycleState.detached) {
      unawaited(widget.controller.clearSessionAndDisconnect());
      unawaited(_presence?.setForeground(false));
      return;
    }
    if (state == AppLifecycleState.paused ||
        state == AppLifecycleState.hidden) {
      unawaited(_presence?.setForeground(false));
      return;
    }
    if (state == AppLifecycleState.resumed) {
      unawaited(_presence?.setForeground(true));
    }
  }

  Future<void> _exitAppCleanly() async {
    await _presence?.setForeground(false);
    await widget.controller.clearSessionAndDisconnect();
    await SystemNavigator.pop();
  }

  void _showExitHint() {
    if (!mounted) return;
    final TranslationResolver resolver = AppLocalization.of(context);
    final ScaffoldMessengerState messenger = ScaffoldMessenger.of(context);
    messenger.hideCurrentSnackBar();
    messenger.showSnackBar(
      SnackBar(
        content: Text(
          resolver.resolve(TranslationKeys.appPressBackAgainToExit),
        ),
        duration: const Duration(seconds: 2),
        behavior: SnackBarBehavior.floating,
      ),
    );
  }

  Future<void> _onRootBack() async {
    final MatchViewState matchState = widget.controller.state.value;
    if (matchState.inMatch) {
      await widget.controller.leaveMatch();
      if (mounted) {
        setState(() {
          _phase = _EntryPhase.home;
          _queueError = null;
        });
      }
      return;
    }

    switch (_phase) {
      case _EntryPhase.matchmaking:
        await _cancelQueue();
        return;
      case _EntryPhase.privateAccess:
      case _EntryPhase.onboardingReplay:
      case _EntryPhase.identityEdit:
        setState(() {
          _phase = _EntryPhase.home;
          _queueError = null;
        });
        return;
      case _EntryPhase.home:
      case _EntryPhase.loading:
      case _EntryPhase.onboarding:
      case _EntryPhase.identity:
        final DateTime now = DateTime.now();
        final DateTime? last = _lastBackAt;
        if (last != null && now.difference(last) < const Duration(seconds: 2)) {
          await _exitAppCleanly();
          return;
        }
        _lastBackAt = now;
        _showExitHint();
        return;
    }
  }

  void _onMatchState() {
    if (!mounted) return;
    final MatchViewState s = widget.controller.state.value;
    if (s.inMatch) {
      // Real table forming — stop the solo-search timeout once 2+ seats exist.
      if (s.players.length >= 2 || s.phase != MatchPhase.lobby) {
        _searchTimeoutTimer?.cancel();
      }
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

    _searchTimeoutTimer?.cancel();
    final bool showToast =
        mapped == TranslationKeys.errorsQueueTimeout ||
        mapped == 'errors.queue_timeout' ||
        _phase == _EntryPhase.matchmaking;
    setState(() {
      _phase = _EntryPhase.home;
      _queueError = mapped;
      _ticketId = null;
      _queueSeats = 0;
    });
    if (showToast) {
      _showQueueToast(mapped);
    }
    widget.controller.clearConnectionError();
  }

  void _showQueueToast(String errorKey) {
    if (!mounted) return;
    final TranslationResolver resolver = AppLocalization.of(context);
    final ScaffoldMessengerState messenger = ScaffoldMessenger.of(context);
    messenger.hideCurrentSnackBar();
    messenger.showSnackBar(
      SnackBar(
        content: Text(displayEntryError(resolver, errorKey)),
        duration: const Duration(seconds: 4),
        behavior: SnackBarBehavior.floating,
      ),
    );
  }

  String _mapConnectError(Object error) {
    if (error is RealtimeConnectException) {
      return switch (error.failure) {
        RealtimeConnectFailure.timeout =>
          TranslationKeys.errorsConnectionTimeout,
        RealtimeConnectFailure.failed => TranslationKeys.errorsConnectionFailed,
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
    if (mounted) {
      setState(() {
        _versionLabel = versionLabel;
        _assetStatusKey = TranslationKeys.splashDownloadingAssets;
        _assetProgress = 0.02;
      });
    }

    final String? backendUrl = widget.backendBaseUrl;
    if (backendUrl != null && backendUrl.isNotEmpty) {
      bool packReady = false;
      for (int attempt = 0; attempt < 3 && !packReady; attempt++) {
        packReady = await ContentAssetCache.instance.sync(
          backendBaseUrl: backendUrl,
          onProgress: (double p) {
            if (!mounted) return;
            setState(() {
              _assetProgress = p.clamp(0.0, 1.0);
              _assetStatusKey = TranslationKeys.splashDownloadingAssets;
            });
          },
        );
      }
      if (mounted) {
        setState(() {
          _assetProgress = 1;
          _assetStatusKey = packReady
              ? TranslationKeys.splashAssetsReady
              : TranslationKeys.errorsContentUnavailable;
        });
      }
    } else if (mounted) {
      setState(() {
        _assetProgress = 1;
        _assetStatusKey = TranslationKeys.splashAssetsReady;
      });
    }

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
    _armSearchTimeout();
    try {
      final String? ticketId = await widget.controller.enqueueMatchmaking(
        identity,
      );
      if (!mounted) return;
      setState(() => _ticketId = ticketId);
    } catch (error) {
      if (!mounted) return;
      _searchTimeoutTimer?.cancel();
      setState(() {
        _phase = _EntryPhase.home;
        _queueError = _mapConnectError(error);
      });
    }
  }

  void _armSearchTimeout() {
    _searchTimeoutTimer?.cancel();
    _searchTimeoutTimer = Timer(_liveSearchTimeout, () {
      unawaited(_onLiveSearchTimeout());
    });
  }

  Future<void> _onLiveSearchTimeout() async {
    if (!mounted) return;
    final MatchViewState matchState = widget.controller.state.value;
    final bool soloQuickSearch =
        !widget.controller.isRematchLobby &&
        matchState.inMatch &&
        matchState.mode == MatchMode.quickSurvival &&
        matchState.phase == MatchPhase.lobby &&
        matchState.players.length < 2;
    final bool stillSearching =
        _phase == _EntryPhase.matchmaking || soloQuickSearch;
    if (!stillSearching) return;

    if (soloQuickSearch || matchState.inMatch) {
      await widget.controller.leaveMatch();
    } else {
      await widget.controller.cancelMatchmaking(_ticketId);
    }
    if (!mounted) return;
    setState(() {
      _phase = _EntryPhase.home;
      _ticketId = null;
      _queueSeats = 0;
      _queueError = TranslationKeys.errorsQueueTimeout;
    });
    _showQueueToast(TranslationKeys.errorsQueueTimeout);
  }

  Future<void> _cancelQueue() async {
    _searchTimeoutTimer?.cancel();
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
        setState(() => _queueError = TranslationKeys.errorsServiceUnavailable);
      }
    } catch (error) {
      if (!mounted) return;
      setState(() => _queueError = _mapConnectError(error));
    }
  }

  @override
  Widget build(BuildContext context) {
    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (bool didPop, Object? result) {
        if (didPop) return;
        unawaited(_onRootBack());
      },
      child: ValueListenableBuilder<MatchViewState>(
        valueListenable: widget.controller.state,
        builder: (BuildContext context, MatchViewState matchState, _) {
          final bool soloQuickSearch =
              !widget.controller.isRematchLobby &&
              matchState.inMatch &&
              matchState.mode == MatchMode.quickSurvival &&
              matchState.phase == MatchPhase.lobby &&
              matchState.players.length < 2;

          if (matchState.inMatch && !soloQuickSearch) {
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

          if (_phase == _EntryPhase.matchmaking || soloQuickSearch) {
            final int seats = soloQuickSearch
                ? matchState.players.length.clamp(1, 6)
                : (matchState.matchmakingAcceptedSeats > 0
                      ? matchState.matchmakingAcceptedSeats
                      : _queueSeats);
            return _MatchmakingView(
              seats: seats,
              identity: _identity,
              onCancel: () {
                unawaited(() async {
                  if (soloQuickSearch || matchState.inMatch) {
                    await widget.controller.leaveMatch();
                    if (!mounted) return;
                    setState(() {
                      _phase = _EntryPhase.home;
                      _ticketId = null;
                      _queueSeats = 0;
                      _queueError = null;
                    });
                  } else {
                    await _cancelQueue();
                  }
                }());
              },
            );
          }

          return switch (_phase) {
            _EntryPhase.loading => _SplashView(
              versionLabel: _versionLabel,
              scale: _splashScale,
              progress: _assetProgress,
              statusKey: _assetStatusKey,
            ),
            _EntryPhase.onboarding ||
            _EntryPhase.onboardingReplay => OnboardingScreen(
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
              onlineCount: _presence?.onlineCount,
              onPlayNow: _enqueueQuickSurvival,
              onPrivate: () => setState(() {
                _phase = _EntryPhase.privateAccess;
                _queueError = null;
              }),
              onTraining: _startTraining,
              onHelp: () =>
                  setState(() => _phase = _EntryPhase.onboardingReplay),
              onEditIdentity: () =>
                  setState(() => _phase = _EntryPhase.identityEdit),
            ),
          };
        },
      ),
    );
  }
}

class _SplashView extends StatelessWidget {
  const _SplashView({
    required this.versionLabel,
    required this.scale,
    required this.progress,
    this.statusKey,
  });

  final String versionLabel;
  final Animation<double> scale;
  final double progress;
  final String? statusKey;

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
              ClipRRect(
                borderRadius: LhRadii.pillAll,
                child: LinearProgressIndicator(
                  value: progress <= 0 ? null : progress.clamp(0.0, 1.0),
                  minHeight: 8,
                  backgroundColor: LhColors.border,
                  color: LhColors.success,
                ),
              ),
              if (statusKey != null) ...<Widget>[
                const SizedBox(height: 12),
                Text(
                  resolver.resolve(statusKey!),
                  style: Theme.of(
                    context,
                  ).textTheme.bodySmall?.copyWith(color: LhColors.textMuted),
                  textAlign: TextAlign.center,
                ),
              ],
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
    this.onlineCount,
  });

  final PlayerIdentity? identity;
  final String? errorKey;
  final ValueListenable<int?>? onlineCount;
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
                    border: Border.all(
                      color: LhColors.primary.withValues(alpha: 0.5),
                    ),
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
                      _buildHero(resolver),
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

  Widget _buildHero(TranslationResolver resolver) {
    final ValueListenable<int?>? counts = onlineCount;
    if (counts == null) {
      return _HeroCard(resolver: resolver);
    }
    return ValueListenableBuilder<int?>(
      valueListenable: counts,
      builder: (BuildContext context, int? count, _) {
        return _HeroCard(resolver: resolver, onlineCount: count);
      },
    );
  }
}

class _HeroCard extends StatelessWidget {
  const _HeroCard({required this.resolver, this.onlineCount});

  final TranslationResolver resolver;
  final int? onlineCount;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.fromLTRB(20, 24, 20, 20),
      decoration: BoxDecoration(
        color: LhColors.surface.withValues(alpha: 0.92),
        borderRadius: LhRadii.lgAll,
        border: Border.all(
          color: LhColors.primary.withValues(alpha: 0.65),
          width: 1.4,
        ),
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
          if (onlineCount != null) ...<Widget>[
            const SizedBox(height: 14),
            _OnlineCountPill(resolver: resolver, count: onlineCount!),
          ],
        ],
      ),
    );
  }
}

class _OnlineCountPill extends StatelessWidget {
  const _OnlineCountPill({required this.resolver, required this.count});

  final TranslationResolver resolver;
  final int count;

  @override
  Widget build(BuildContext context) {
    final String localeCode = resolver.selectedLocaleCode;
    return Container(
      key: const Key('home-online-count'),
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
              params: <String, String>{
                'count': formatLocalizedCount(count, localeCode),
              },
            ),
            style: Theme.of(context).textTheme.bodySmall,
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
    _heartScale = Tween<double>(
      begin: 0.94,
      end: 1.06,
    ).animate(CurvedAnimation(parent: _pulse, curve: Curves.easeInOut));
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
