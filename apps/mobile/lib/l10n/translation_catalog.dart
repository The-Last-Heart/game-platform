import 'locale_metadata.dart';

/// Stable product translation keys used by the mobile foundation.
abstract final class TranslationKeys {
  static const String appTitle = 'app.title';
  static const String foundationReady = 'foundation.ready';
  static const String commonLoading = 'common.loading';
  static const String commonRetry = 'common.retry';
  static const String errorsOffline = 'errors.offline';
  static const String errorsTranslationCatalogUnavailable =
      'errors.translation_catalog_unavailable';
  static const String errorsMandatoryUpdate = 'errors.mandatory_update';
  static const String errorsContentUnavailable = 'errors.content_unavailable';

  // ── LH-003 Home / Dev ──
  static const String homeDevPlay = 'home.dev_play';
  static const String homeDevSubtitle = 'home.dev_subtitle';
  static const String homeTagline = 'home.tagline';

  // ── Lobby ──
  static const String lobbyTitle = 'lobby.title';
  static const String lobbyPlayersCount = 'lobby.players_count';
  static const String lobbyWaiting = 'lobby.waiting';
  static const String lobbyMatchId = 'lobby.match_id';

  // ── Countdown ──
  static const String countdownGetReady = 'countdown.get_ready';

  // ── Challenge Intro ──
  static const String introNextChallenge = 'intro.next_challenge';
  static const String introRound = 'intro.round';

  // ── Challenge ──
  static const String challengeWaitForSignalIntro =
      'challenge.wait_for_signal.intro';
  static const String challengeCategoryReaction = 'challenge.category.reaction';
  static const String challengeWaitForSignalWaiting =
      'challenge.wait_for_signal.waiting';
  static const String challengeWaitForSignalWaitingHint =
      'challenge.wait_for_signal.waiting_hint';
  static const String challengeWaitForSignalActive =
      'challenge.wait_for_signal.active';
  static const String challengeWaitForSignalAction =
      'challenge.wait_for_signal.action';

  // ── Results ──
  static const String resultSuccess = 'result.success';
  static const String resultFailure = 'result.failure';
  static const String resultTimeout = 'result.timeout';
  static const String resultTooEarly = 'result.too_early';
  static const String resultHeartLost = 'result.heart_lost';
  static const String resultEnergyGained = 'result.energy_gained';
  static const String resultWaiting = 'result.waiting';

  // ── Spectator ──
  static const String spectatorTitle = 'spectator.title';
  static const String spectatorMessage = 'spectator.message';

  // ── Winner ──
  static const String winnerTitle = 'winner.title';
  static const String winnerYou = 'winner.you';
  static const String winnerOther = 'winner.other';
  static const String winnerBackHome = 'winner.back_home';

  // ── Connection errors ──
  static const String errorsConnectionFailed = 'errors.connection_failed';
  static const String errorsConnectionRetry = 'errors.connection_retry';
  static const String errorsMatchFull = 'errors.match_full';
  static const String errorsProtocol = 'errors.protocol';

  // ── LH-003 Home Chrome ──
  static const String homePlayNow = 'home.play_now';
  static const String homeOnlineCount = 'home.online_count';
  static const String homeGameModes = 'home.game_modes';
  static const String homeViewAll = 'home.view_all';
  static const String homeQuickSurvival = 'home.quick_survival';
  static const String homeQuickSurvivalDesc = 'home.quick_survival_desc';
  static const String homePrivateRoom = 'home.private_room';
  static const String homePrivateRoomDesc = 'home.private_room_desc';
  static const String homeDailyChallenge = 'home.daily_challenge';
  static const String homeDailyChallengeDesc = 'home.daily_challenge_desc';

  // ── LH-003 Lobby Chrome ──
  static const String lobbyPrivateRoom = 'lobby.private_room';
  static const String lobbyPlayersOfMax = 'lobby.players_of_max';
  static const String lobbyRoomCode = 'lobby.room_code';
  static const String lobbyShareCode = 'lobby.share_code';
  static const String lobbyHostLabel = 'lobby.host_label';
  static const String lobbyReady = 'lobby.ready';
  static const String lobbyBot = 'lobby.bot';
  static const String lobbyEmptySlots = 'lobby.empty_slots';
  static const String lobbyWaitingPlayers = 'lobby.waiting_players';
  static const String lobbyInviteFriend = 'lobby.invite_friend';
  static const String lobbyStartWhenFull = 'lobby.start_when_full';
  static const String lobbyFillStartsIn = 'lobby.fill_starts_in';
  static const String lobbyExtendWait = 'lobby.extend_wait';
  static const String lobbyStartNow = 'lobby.start_now';

  // ── LH-003 Countdown Chrome ──
  static const String countdownAllReady = 'countdown.all_ready';
  static const String countdownMatchStarts = 'countdown.match_starts';
  static const String countdownChallengesStarting =
      'countdown.challenges_starting';
  static const String countdownChallengesStartingSub =
      'countdown.challenges_starting_sub';
  static const String countdownTip1Title = 'countdown.tip1_title';
  static const String countdownTip1Desc = 'countdown.tip1_desc';
  static const String countdownTip2Title = 'countdown.tip2_title';
  static const String countdownTip2Desc = 'countdown.tip2_desc';

  // ── LH-003 Intro Chrome ──
  static const String introChallengeLabel = 'intro.challenge_label';
  static const String introRoundOf = 'intro.round_of';
  static const String introChallengeType = 'intro.challenge_type';
  static const String introReadInstructions = 'intro.read_instructions';
  static const String introGetReady = 'intro.get_ready';

  // ── LH-003 Result Chrome ──
  static const String resultChallengeTitle = 'result.challenge_title';
  static const String resultRoundOf = 'result.round_of';
  static const String resultSurvived = 'result.survived';
  static const String resultNextChallengeIn = 'result.next_challenge_in';
  static const String resultTooEarlyTitle = 'result.too_early_title';
  static const String resultPressedEarlyReason = 'result.pressed_early_reason';
  static const String resultTimeoutReason = 'result.timeout_reason';
  static const String resultFailureReason = 'result.failure_reason';
  static const String resultOutcomeSuccess = 'result.outcome.success';
  static const String resultOutcomeFailure = 'result.outcome.failure';
  static const String resultOutcomeTimeout = 'result.outcome.timeout';
  static const String resultOutcomeSkipped = 'result.outcome.skipped_spectator';
  static const String resultLostHeartLabel = 'result.lost_heart_label';
  static const String resultHeartsRemaining = 'result.hearts_remaining';
  static const String resultAutoContinue = 'result.auto_continue';
  static const String resultPowerEnergy = 'result.power_energy';

  // ── LH-003 Spectator Chrome ──
  static const String spectatorMatchOngoing = 'spectator.match_ongoing';
  static const String spectatorLostLastHeart = 'spectator.lost_last_heart';
  static const String spectatorEliminatedMsg = 'spectator.eliminated_message';
  static const String spectatorCurrentStandings = 'spectator.current_standings';
  static const String spectatorRemainingPlayers = 'spectator.remaining_players';
  static const String spectatorEliminatedBadge = 'spectator.eliminated_badge';
  static const String playerStatusLeft = 'player.status.left';

  // ── LH-003 Winner Chrome ──
  static const String winnerMatchEnded = 'winner.match_ended';
  static const String winnerFirstPlace = 'winner.first_place';
  static const String winnerYouLastHeart = 'winner.you_last_heart';
  static const String winnerPlayerWins = 'winner.player_wins';
  static const String winnerHeartsLeft = 'winner.hearts_left';
  static const String winnerPlayAgain = 'winner.play_again';

  // ── Connection / recovery ──
  static const String sessionReconnecting = 'session.reconnecting';
  static const String sessionRecoveringState = 'session.recovering_state';
  static const String challengeAnswerWaiting = 'challenge.answer_waiting';
  static const String winnerStandings = 'winner.standings';
  static const String winnerEnergyScore = 'winner.energy_score';
  static const String resultEqual = 'result.equal';

  // ── LH-005 entry ──
  static const String commonBack = 'common.back';
  static const String commonNext = 'common.next';
  static const String onboardingHeartsTitle = 'onboarding.hearts_title';
  static const String onboardingHeartsBody = 'onboarding.hearts_body';
  static const String onboardingTimingTitle = 'onboarding.timing_title';
  static const String onboardingTimingBody = 'onboarding.timing_body';
  static const String onboardingEnergyTitle = 'onboarding.energy_title';
  static const String onboardingEnergyBody = 'onboarding.energy_body';
  static const String onboardingDone = 'onboarding.done';
  static const String identityTitle = 'identity.title';
  static const String identitySubtitle = 'identity.subtitle';
  static const String identityNameLabel = 'identity.name_label';
  static const String identityNameInvalid = 'identity.name_invalid';
  static const String identityColorLabel = 'identity.color_label';
  static const String identitySave = 'identity.save';
  static const String homeHelpOnboarding = 'home.help_onboarding';
  static const String homeEditIdentity = 'home.edit_identity';
  static const String homeTraining = 'home.training';
  static const String homeTrainingDesc = 'home.training_desc';
  static const String matchmakingTitle = 'matchmaking.title';
  static const String matchmakingSearching = 'matchmaking.searching';
  static const String matchmakingSeats = 'matchmaking.seats';
  static const String matchmakingCancel = 'matchmaking.cancel';
  static const String privateCreate = 'private.create';
  static const String privateJoin = 'private.join';
  static const String privateCodeLabel = 'private.code_label';
  static const String privateCodeCopied = 'private.code_copied';
  static const String privateShare = 'private.share';
  static const String privateReady = 'private.ready';
  static const String privateLeave = 'private.leave';
  static const String privateInvalidCode = 'private.invalid_code';
  static const String trainingTitle = 'training.title';
  static const String trainingRetry = 'training.retry';
  static const String trainingExplain = 'training.explain';
  static const String rematchRequest = 'rematch.request';
  static const String errorsServiceUnavailable = 'errors.service_unavailable';
  static const String errorsConnectionTimeout = 'errors.connection_timeout';
  static const String errorsQueueTimeout = 'errors.queue_timeout';
  static const String errorsQueueFailed = 'errors.queue_failed';
  static const String errorsProtocolUnauthorized = 'errors.protocol.unauthorized';
  static const String splashTagline = 'splash.tagline';
  static const String splashVersion = 'splash.version';
  static const String splashDownloadingAssets = 'splash.downloading_assets';
  static const String splashAssetsReady = 'splash.assets_ready';
  static const String homeHeroSubtitle = 'home.hero_subtitle';
  static const String homeModesTitle = 'home.modes_title';
  static const String homeGreeting = 'home.greeting';
  static const String onboardingStepOf = 'onboarding.step_of';
  static const String onboardingHowToPlay = 'onboarding.how_to_play';
  static const String appPressBackAgainToExit = 'app.press_back_again_to_exit';

  // ── LH-008 Powers ──
  static const String powerActionTitle = 'power.action.title';
  static const String powerActionChooseTarget = 'power.action.choose_target';
  static const String powerActionSkip = 'power.action.skip';
  static const String powerActionWaiting = 'power.action.waiting';
  static const String powerDefenseTitle = 'power.defense.title';
  static const String powerDefenseIncoming = 'power.defense.incoming';
  static const String powerDefenseReflectedIncoming =
      'power.defense.reflected_incoming';
  static const String powerDefenseWaiting = 'power.defense.waiting';
  static const String powerDefenseNone = 'power.defense.none';
  static const String powerDefenseFrom = 'power.defense.from';
}

/// Shared normalization for catalog create/lookup/resolve.
String normalizeCatalogToken(String value) => value.trim();

/// Immutable translation catalog for one or more locales.
///
/// Translation values are data only. They must never contain executable code
/// and must not be rendered as HTML.
class TranslationCatalog {
  TranslationCatalog._({
    required this.version,
    required this.locales,
    required this.entries,
  });

  final String version;
  final Map<String, LocaleMetadata> locales;
  final Map<String, Map<String, String>> entries;

  /// Validates and freezes a catalog.
  factory TranslationCatalog.create({
    required String version,
    required Map<String, LocaleMetadata> locales,
    required Map<String, Map<String, String>> entries,
  }) {
    final String normalizedVersion = normalizeCatalogToken(version);
    if (normalizedVersion.isEmpty) {
      throw ArgumentError.value(version, 'version', 'must not be empty');
    }
    if (locales.isEmpty) {
      throw ArgumentError('locales must not be empty');
    }

    final Map<String, LocaleMetadata> frozenLocales =
        <String, LocaleMetadata>{};
    for (final MapEntry<String, LocaleMetadata> entry in locales.entries) {
      final String code = normalizeCatalogToken(entry.key);
      if (code.isEmpty) {
        throw ArgumentError('locale map keys must not be empty');
      }
      if (frozenLocales.containsKey(code)) {
        throw ArgumentError('duplicate locale code after normalization: $code');
      }
      final String metaCode = normalizeCatalogToken(entry.value.localeCode);
      if (metaCode != code) {
        throw ArgumentError(
          'locale metadata code "$metaCode" must match map key "$code"',
        );
      }
      if (normalizeCatalogToken(entry.value.displayName).isEmpty) {
        throw ArgumentError('locale "$code" displayName must not be empty');
      }
      frozenLocales[code] = LocaleMetadata(
        localeCode: code,
        displayName: entry.value.displayName.trim(),
        direction: entry.value.direction,
      );
    }

    final Map<String, Map<String, String>> frozenEntries =
        <String, Map<String, String>>{};
    for (final MapEntry<String, Map<String, String>> localeEntry
        in entries.entries) {
      final String localeCode = normalizeCatalogToken(localeEntry.key);
      if (localeCode.isEmpty) {
        throw ArgumentError('entry locale codes must not be empty');
      }
      if (!frozenLocales.containsKey(localeCode)) {
        throw ArgumentError('entries reference unknown locale "$localeCode"');
      }
      if (frozenEntries.containsKey(localeCode)) {
        throw ArgumentError(
          'duplicate entry locale after normalization: $localeCode',
        );
      }

      final Map<String, String> frozenForLocale = <String, String>{};
      for (final MapEntry<String, String> keyEntry
          in localeEntry.value.entries) {
        final String key = normalizeCatalogToken(keyEntry.key);
        if (key.isEmpty) {
          throw ArgumentError('translation keys must not be empty');
        }
        if (frozenForLocale.containsKey(key)) {
          throw ArgumentError(
            'duplicate translation key after normalization: $key',
          );
        }
        final String value = keyEntry.value.trim();
        if (value.isEmpty) {
          throw ArgumentError(
            'translation values must not be empty or whitespace-only',
          );
        }
        frozenForLocale[key] = value;
      }
      frozenEntries[localeCode] = Map<String, String>.unmodifiable(
        frozenForLocale,
      );
    }

    return TranslationCatalog._(
      version: normalizedVersion,
      locales: Map<String, LocaleMetadata>.unmodifiable(frozenLocales),
      entries: Map<String, Map<String, String>>.unmodifiable(frozenEntries),
    );
  }

  String? lookup(String localeCode, String key) {
    final String normalizedLocale = normalizeCatalogToken(localeCode);
    final String normalizedKey = normalizeCatalogToken(key);
    if (normalizedLocale.isEmpty || normalizedKey.isEmpty) {
      return null;
    }
    return entries[normalizedLocale]?[normalizedKey];
  }

  LocaleMetadata? localeMetadata(String localeCode) {
    return locales[normalizeCatalogToken(localeCode)];
  }
}
