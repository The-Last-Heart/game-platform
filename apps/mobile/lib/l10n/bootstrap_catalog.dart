import 'locale_metadata.dart';
import 'translation_catalog.dart';

/// Minimal bundled bootstrap catalog for recovery before a server catalog is
/// available. This is a resilience fallback — not the primary translation source.
///
/// Expanded in LH-003 to include challenge instruction keys so the resolver
/// works offline for the playable mobile slice milestone.
TranslationCatalog createBootstrapCatalog() {
  return TranslationCatalog.create(
    version: 'bootstrap-0',
    locales: const <String, LocaleMetadata>{
      'ar': defaultMobileLocale,
      'en': LocaleMetadata(
        localeCode: 'en',
        displayName: 'English',
        direction: TextDirectionCode.ltr,
      ),
    },
    entries: const <String, Map<String, String>>{
      'ar': <String, String>{
        // ── Foundation ──
        TranslationKeys.appTitle: 'آخر قلب',
        TranslationKeys.foundationReady: 'Foundation ready',
        TranslationKeys.commonLoading: 'جاري التحميل',
        TranslationKeys.commonRetry: 'إعادة المحاولة',
        TranslationKeys.errorsOffline: 'لا يوجد اتصال بالإنترنت',
        TranslationKeys.errorsTranslationCatalogUnavailable:
            'تعذر تحميل ترجمات التطبيق',
        TranslationKeys.errorsMandatoryUpdate: 'يلزم تحديث التطبيق للمتابعة',
        TranslationKeys.errorsContentUnavailable: 'المحتوى غير متاح',

        // ── LH-003 Home / Dev ──
        TranslationKeys.homeDevPlay: 'تجربة تطوير',
        TranslationKeys.homeDevSubtitle: 'وضع المطوّر',
        TranslationKeys.homeTagline: 'آخر قلب ينبض... يفوز',

        // ── Lobby ──
        TranslationKeys.lobbyTitle: 'غرفة الانتظار',
        TranslationKeys.lobbyPlayersCount: '{count} / 6',
        TranslationKeys.lobbyWaiting: 'في انتظار اللاعبين...',
        TranslationKeys.lobbyMatchId: 'المباراة: {matchId}',

        // ── Countdown ──
        TranslationKeys.countdownGetReady: 'استعد!',

        // ── Challenge Intro ──
        TranslationKeys.introNextChallenge: 'التحدي التالي',
        TranslationKeys.introRound: 'الجولة {round}',

        // ── Challenge (wait_for_signal) ──
        TranslationKeys.challengeWaitForSignalIntro:
            'اضغط عندما يتحول القلب للأزرق',
        TranslationKeys.challengeCategoryReaction: 'ردة فعل',
        TranslationKeys.challengeWaitForSignalWaiting:
            'اضغط عندما يصبح القلب أزرق',
        TranslationKeys.challengeWaitForSignalWaitingHint: 'لا تستعجل',
        TranslationKeys.challengeWaitForSignalActive: 'اضغط الآن!',
        TranslationKeys.challengeWaitForSignalAction: 'اضغط',

        // ── Results ──
        TranslationKeys.resultSuccess: 'نجحت! 🎉',
        TranslationKeys.resultFailure: 'لم تنجح',
        TranslationKeys.resultTimeout: 'انتهى الوقت',
        TranslationKeys.resultTooEarly: 'ضغطت مبكراً!',
        TranslationKeys.resultHeartLost: 'خسرت قلباً ❤️',
        TranslationKeys.resultEnergyGained: '+{energy} طاقة',
        TranslationKeys.resultWaiting: 'في انتظار النتائج...',

        // ── Spectator ──
        TranslationKeys.spectatorTitle: 'مشاهد',
        TranslationKeys.spectatorMessage: 'أنت الآن تشاهد المباراة',

        // ── Winner ──
        TranslationKeys.winnerTitle: 'انتهت المباراة!',
        TranslationKeys.winnerYou: 'أنت الفائز! 🏆',
        TranslationKeys.winnerOther: 'الفائز: لاعب آخر',
        TranslationKeys.winnerBackHome: 'العودة للرئيسية',

        // ── Connection errors ──
        TranslationKeys.errorsConnectionFailed: 'فشل الاتصال بالخادم',
        TranslationKeys.errorsConnectionRetry: 'إعادة الاتصال...',
        TranslationKeys.errorsMatchFull: 'المباراة ممتلئة',
        TranslationKeys.errorsProtocol: 'خطأ في البروتوكول',

        // ── LH-003 Home Chrome ──
        TranslationKeys.homePlayNow: 'العب الآن',
        TranslationKeys.homeOnlineCount: '{count} لاعبًا متصلًا',
        TranslationKeys.homeGameModes: 'أنماط اللعب',
        TranslationKeys.homeViewAll: 'عرض الكل',
        TranslationKeys.homeQuickSurvival: 'نجاة سريعة',
        TranslationKeys.homeQuickSurvivalDesc: '٦ لاعبين، ٤ دقائق',
        TranslationKeys.homePrivateRoom: 'غرفة خاصة',
        TranslationKeys.homePrivateRoomDesc: 'العب مع أصدقائك',
        TranslationKeys.homeDailyChallenge: 'تحدي اليوم',
        TranslationKeys.homeDailyChallengeDesc: 'انجُ من ٥ تحديات متتالية',

        // ── LH-003 Lobby Chrome ──
        TranslationKeys.lobbyPrivateRoom: 'غرفة خاصة',
        TranslationKeys.lobbyPlayersOfMax: '{count} من ٦ لاعبين',
        TranslationKeys.lobbyRoomCode: 'رمز الغرفة',
        TranslationKeys.lobbyShareCode: 'شاركه مع أصدقائك',
        TranslationKeys.lobbyHostLabel: 'المضيف',
        TranslationKeys.lobbyReady: 'جاهز',
        TranslationKeys.lobbyBot: 'بوت',
        TranslationKeys.lobbyEmptySlots: '{count} فارغان',
        TranslationKeys.lobbyWaitingPlayers: 'بانتظار لاعبين',
        TranslationKeys.lobbyInviteFriend: 'دعوة صديق',
        TranslationKeys.lobbyStartWhenFull: 'ابدأ عند اكتمال ٦ لاعبين',

        // ── LH-003 Countdown Chrome ──
        TranslationKeys.countdownAllReady: 'الجميع جاهز',
        TranslationKeys.countdownMatchStarts: 'تبدأ المباراة الآن',
        TranslationKeys.countdownTip1Title: 'اقرأ بسرعة',
        TranslationKeys.countdownTip1Desc: 'التعليمات قد تكون خادعة',
        TranslationKeys.countdownTip2Title: 'نفّذ بدقة',
        TranslationKeys.countdownTip2Desc: 'الخطأ قد يكلّفك قلبًا',

        // ── LH-003 Intro Chrome ──
        TranslationKeys.introChallengeLabel: 'التحدي {number}',
        TranslationKeys.introRoundOf: 'الجولة {round} من {total}',
        TranslationKeys.introChallengeType: 'نوع التحدي',
        TranslationKeys.introReadInstructions: 'اقرأ التعليمات ونفّذ فورًا',

        // ── LH-003 Result Chrome ──
        TranslationKeys.resultChallengeTitle: 'نتيجة التحدي',
        TranslationKeys.resultRoundOf: 'الجولة {round} من {total}',
        TranslationKeys.resultSurvived: 'نجوت!',
        TranslationKeys.resultNextChallengeIn:
            'التحدي التالي بعد {seconds} ثوانٍ',
        TranslationKeys.resultTooEarlyTitle: 'تسرّعت!',
        TranslationKeys.resultPressedEarlyReason:
            'ضغطت قبل أن يتحول القلب إلى الأزرق',
        TranslationKeys.resultLostHeartLabel: 'خسرت قلبًا',
        TranslationKeys.resultHeartsRemaining: 'بقي لك {count}',
        TranslationKeys.resultAutoContinue:
            'لا تخرج من الشاشة — التحدي التالي يبدأ تلقائيًا',
        TranslationKeys.resultPowerEnergy: 'طاقة القوة',

        // ── LH-003 Spectator Chrome ──
        TranslationKeys.spectatorMatchOngoing: 'المباراة مستمرة',
        TranslationKeys.spectatorLostLastHeart: 'خسرت آخر قلب',
        TranslationKeys.spectatorEliminatedMsg:
            'خرجت من المنافسة، لكن يمكنك متابعة المباراة',
        TranslationKeys.spectatorCurrentStandings: 'الترتيب الحالي',
        TranslationKeys.spectatorRemainingPlayers: 'بقي {count} لاعبين',
        TranslationKeys.spectatorEliminatedBadge: 'خرج',
        TranslationKeys.spectatorWatchMatch: 'تابع المباراة',

        // ── LH-003 Winner Chrome ──
        TranslationKeys.winnerMatchEnded: 'انتهت المباراة',
        TranslationKeys.winnerFirstPlace: 'المركز الأول',
        TranslationKeys.winnerYouLastHeart: 'أنت آخر قلب!',
        TranslationKeys.winnerPlayerWins: '{name} يفوز بالمباراة',
        TranslationKeys.winnerChallengesWon: 'تحديات ناجحة',
        TranslationKeys.winnerHeartsLeft: 'متبقيان',
        TranslationKeys.winnerPlayAgain: 'العب مجددًا',
        TranslationKeys.winnerShareResult: 'مشاركة النتيجة',
        TranslationKeys.winnerRewardTitle: 'مكافأة الفوز',
        TranslationKeys.winnerRewardDesc: 'النقاط والخبرة',
      },
      'en': <String, String>{
        // ── Foundation ──
        TranslationKeys.appTitle: 'The Last Heart',
        TranslationKeys.foundationReady: 'Foundation ready',
        TranslationKeys.commonLoading: 'Loading',
        TranslationKeys.commonRetry: 'Retry',
        TranslationKeys.errorsOffline: 'You are offline',
        TranslationKeys.errorsTranslationCatalogUnavailable:
            'Translation catalog unavailable',
        TranslationKeys.errorsMandatoryUpdate:
            'A mandatory update is required to continue',
        TranslationKeys.errorsContentUnavailable: 'Content unavailable',

        // ── LH-003 Home / Dev ──
        TranslationKeys.homeDevPlay: 'Dev Play',
        TranslationKeys.homeDevSubtitle: 'Developer mode',
        TranslationKeys.homeTagline: 'Last heart standing... wins',

        // ── Lobby ──
        TranslationKeys.lobbyTitle: 'Lobby',
        TranslationKeys.lobbyPlayersCount: '{count} / 6',
        TranslationKeys.lobbyWaiting: 'Waiting for players...',
        TranslationKeys.lobbyMatchId: 'Match: {matchId}',

        // ── Countdown ──
        TranslationKeys.countdownGetReady: 'Get ready!',

        // ── Challenge Intro ──
        TranslationKeys.introNextChallenge: 'Next challenge',
        TranslationKeys.introRound: 'Round {round}',

        // ── Challenge (wait_for_signal) ──
        TranslationKeys.challengeWaitForSignalIntro:
            'Tap when the heart turns blue',
        TranslationKeys.challengeCategoryReaction: 'Reaction',
        TranslationKeys.challengeWaitForSignalWaiting:
            'Tap when the heart turns blue',
        TranslationKeys.challengeWaitForSignalWaitingHint: 'Don\'t rush',
        TranslationKeys.challengeWaitForSignalActive: 'Tap now!',
        TranslationKeys.challengeWaitForSignalAction: 'Tap',

        // ── Results ──
        TranslationKeys.resultSuccess: 'Success! 🎉',
        TranslationKeys.resultFailure: 'Failed',
        TranslationKeys.resultTimeout: 'Time\'s up',
        TranslationKeys.resultTooEarly: 'Too early!',
        TranslationKeys.resultHeartLost: 'Lost a heart ❤️',
        TranslationKeys.resultEnergyGained: '+{energy} energy',
        TranslationKeys.resultWaiting: 'Waiting for results...',

        // ── Spectator ──
        TranslationKeys.spectatorTitle: 'Spectator',
        TranslationKeys.spectatorMessage: 'You are now watching',

        // ── Winner ──
        TranslationKeys.winnerTitle: 'Match over!',
        TranslationKeys.winnerYou: 'You win! 🏆',
        TranslationKeys.winnerOther: 'Winner: another player',
        TranslationKeys.winnerBackHome: 'Back to home',

        // ── Connection errors ──
        TranslationKeys.errorsConnectionFailed: 'Connection failed',
        TranslationKeys.errorsConnectionRetry: 'Reconnecting...',
        TranslationKeys.errorsMatchFull: 'Match is full',
        TranslationKeys.errorsProtocol: 'Protocol error',

        // ── LH-003 Home Chrome ──
        TranslationKeys.homePlayNow: 'Play Now',
        TranslationKeys.homeOnlineCount: '{count} online',
        TranslationKeys.homeGameModes: 'Game Modes',
        TranslationKeys.homeViewAll: 'View All',
        TranslationKeys.homeQuickSurvival: 'Quick Survival',
        TranslationKeys.homeQuickSurvivalDesc: '6 players, 4 minutes',
        TranslationKeys.homePrivateRoom: 'Private Room',
        TranslationKeys.homePrivateRoomDesc: 'Play with friends',
        TranslationKeys.homeDailyChallenge: 'Daily Challenge',
        TranslationKeys.homeDailyChallengeDesc:
            'Survive 5 consecutive challenges',

        // ── LH-003 Lobby Chrome ──
        TranslationKeys.lobbyPrivateRoom: 'Private Room',
        TranslationKeys.lobbyPlayersOfMax: '{count} of 6 players',
        TranslationKeys.lobbyRoomCode: 'Room Code',
        TranslationKeys.lobbyShareCode: 'Share with friends',
        TranslationKeys.lobbyHostLabel: 'Host',
        TranslationKeys.lobbyReady: 'Ready',
        TranslationKeys.lobbyBot: 'Bot',
        TranslationKeys.lobbyEmptySlots: '{count} empty',
        TranslationKeys.lobbyWaitingPlayers: 'Waiting for players',
        TranslationKeys.lobbyInviteFriend: 'Invite Friend',
        TranslationKeys.lobbyStartWhenFull: 'Start when 6 players join',

        // ── LH-003 Countdown Chrome ──
        TranslationKeys.countdownAllReady: 'All Ready',
        TranslationKeys.countdownMatchStarts: 'Match starts now',
        TranslationKeys.countdownTip1Title: 'Read fast',
        TranslationKeys.countdownTip1Desc: 'Instructions can be tricky',
        TranslationKeys.countdownTip2Title: 'Act precisely',
        TranslationKeys.countdownTip2Desc: 'A mistake may cost a heart',

        // ── LH-003 Intro Chrome ──
        TranslationKeys.introChallengeLabel: 'Challenge {number}',
        TranslationKeys.introRoundOf: 'Round {round} of {total}',
        TranslationKeys.introChallengeType: 'Challenge Type',
        TranslationKeys.introReadInstructions:
            'Read instructions and act immediately',

        // ── LH-003 Result Chrome ──
        TranslationKeys.resultChallengeTitle: 'Challenge Result',
        TranslationKeys.resultRoundOf: 'Round {round} of {total}',
        TranslationKeys.resultSurvived: 'Survived!',
        TranslationKeys.resultNextChallengeIn: 'Next challenge in {seconds}s',
        TranslationKeys.resultTooEarlyTitle: 'Too early!',
        TranslationKeys.resultPressedEarlyReason:
            'Pressed before the heart turned blue',
        TranslationKeys.resultLostHeartLabel: 'Lost a heart',
        TranslationKeys.resultHeartsRemaining: '{count} remaining',
        TranslationKeys.resultAutoContinue:
            'Stay on screen — next challenge starts automatically',
        TranslationKeys.resultPowerEnergy: 'Power Energy',

        // ── LH-003 Spectator Chrome ──
        TranslationKeys.spectatorMatchOngoing: 'Match ongoing',
        TranslationKeys.spectatorLostLastHeart: 'Lost last heart',
        TranslationKeys.spectatorEliminatedMsg:
            'You are out, but can keep watching',
        TranslationKeys.spectatorCurrentStandings: 'Current Standings',
        TranslationKeys.spectatorRemainingPlayers: '{count} players left',
        TranslationKeys.spectatorEliminatedBadge: 'Out',
        TranslationKeys.spectatorWatchMatch: 'Watch Match',

        // ── LH-003 Winner Chrome ──
        TranslationKeys.winnerMatchEnded: 'Match Over',
        TranslationKeys.winnerFirstPlace: 'First Place',
        TranslationKeys.winnerYouLastHeart: 'You are the Last Heart!',
        TranslationKeys.winnerPlayerWins: '{name} wins the match',
        TranslationKeys.winnerChallengesWon: 'Challenges won',
        TranslationKeys.winnerHeartsLeft: 'Remaining',
        TranslationKeys.winnerPlayAgain: 'Play Again',
        TranslationKeys.winnerShareResult: 'Share Result',
        TranslationKeys.winnerRewardTitle: 'Victory Reward',
        TranslationKeys.winnerRewardDesc: 'Points and XP',
      },
    },
  );
}
