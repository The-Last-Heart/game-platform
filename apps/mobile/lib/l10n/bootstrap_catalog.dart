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
        TranslationKeys.lobbyMatchId: 'التحدي: {matchId}',

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
        TranslationKeys.challengeWaitForSignalAction: 'اضغط في أي مكان',

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
        TranslationKeys.spectatorMessage: 'أنت الآن تشاهد التحدي',

        // ── Winner ──
        TranslationKeys.winnerTitle: 'انتهى التحدي!',
        TranslationKeys.winnerYou: 'أنت الفائز! 🏆',
        TranslationKeys.winnerOther: 'الفائز: {name}',
        TranslationKeys.winnerBackHome: 'العودة للرئيسية',

        // ── Connection errors ──
        TranslationKeys.errorsConnectionFailed:
            'تعذّر الاتصال بالخادم. تأكد أن الجهاز على نفس الشبكة وأن الخادم يعمل.',
        TranslationKeys.errorsConnectionRetry: 'إعادة الاتصال...',
        TranslationKeys.errorsMatchFull: 'التحدي ممتلئ',
        TranslationKeys.errorsProtocol: 'خطأ في البروتوكول',
        TranslationKeys.errorsConnectionTimeout:
            'انتهت مهلة الاتصال بالخادم. تحقق من الشبكة وإعدادات المنفذ.',
        TranslationKeys.errorsQueueTimeout:
            'انتهت مهلة البحث عن تحدي. حاول مرة أخرى.',
        TranslationKeys.errorsQueueFailed:
            'تعذّر إكمال البحث عن تحدي. حاول مرة أخرى.',
        TranslationKeys.errorsProtocolUnauthorized:
            'انتهت الجلسة السابقة. أعد المحاولة.',

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
        TranslationKeys.lobbyFillStartsIn: 'تبدأ اللعبة خلال {seconds}',
        TranslationKeys.lobbyExtendWait: 'تمديد الانتظار',
        TranslationKeys.lobbyStartNow: 'ابدأ الآن',

        // ── LH-003 Countdown Chrome ──
        TranslationKeys.countdownAllReady: 'الجميع جاهز',
        TranslationKeys.countdownMatchStarts: 'يبدأ التحدي الآن',
        TranslationKeys.countdownChallengesStarting: 'التحديات على وشك البدء',
        TranslationKeys.countdownChallengesStartingSub:
            'استعد — العداد بدأ',
        TranslationKeys.countdownTip1Title: 'اقرأ بسرعة',
        TranslationKeys.countdownTip1Desc: 'التعليمات قد تكون خادعة',
        TranslationKeys.countdownTip2Title: 'نفّذ بدقة',
        TranslationKeys.countdownTip2Desc: 'الخطأ قد يكلّفك قلبًا',

        // ── LH-003 Intro Chrome ──
        TranslationKeys.introChallengeLabel: 'التحدي {number}',
        TranslationKeys.introRoundOf: 'الجولة {round} من {total}',
        TranslationKeys.introChallengeType: 'نوع التحدي',
        TranslationKeys.introReadInstructions: 'اقرأ التعليمات ونفّذ فورًا',
        TranslationKeys.introGetReady: 'استعد',

        // ── LH-003 Result Chrome ──
        TranslationKeys.resultChallengeTitle: 'نتيجة التحدي',
        TranslationKeys.resultRoundOf: 'الجولة {round} من {total}',
        TranslationKeys.resultSurvived: 'نجوت!',
        TranslationKeys.resultNextChallengeIn:
            'التحدي التالي بعد {seconds} ثوانٍ',
        TranslationKeys.resultTooEarlyTitle: 'تسرّعت!',
        TranslationKeys.resultPressedEarlyReason:
            'ضغطت قبل أن يتحول القلب إلى الأزرق',
        TranslationKeys.resultTimeoutReason: 'انتهى الوقت قبل أن تُكمل الإجراء',
        TranslationKeys.resultFailureReason: 'لم يُقبل الإجراء في هذا التحدي',
        TranslationKeys.resultOutcomeSuccess: 'نجاح',
        TranslationKeys.resultOutcomeFailure: 'فشل',
        TranslationKeys.resultOutcomeTimeout: 'انتهى الوقت',
        TranslationKeys.resultOutcomeSkipped: 'متفرج',
        TranslationKeys.resultLostHeartLabel: 'خسرت قلبًا',
        TranslationKeys.resultHeartsRemaining: 'بقي لك {count}',
        TranslationKeys.resultAutoContinue:
            'لا تخرج من الشاشة — التحدي التالي يبدأ تلقائيًا',
        TranslationKeys.resultPowerEnergy: 'طاقة القوة',

        // ── LH-003 Spectator Chrome ──
        TranslationKeys.spectatorMatchOngoing: 'التحدي مستمر',
        TranslationKeys.spectatorLostLastHeart: 'خسرت آخر قلب',
        TranslationKeys.spectatorEliminatedMsg:
            'خرجت من المنافسة، لكن يمكنك متابعة التحدي',
        TranslationKeys.spectatorCurrentStandings: 'الترتيب الحالي',
        TranslationKeys.spectatorRemainingPlayers: 'بقي {count} لاعبين',
        TranslationKeys.spectatorEliminatedBadge: 'خرج',

        // ── LH-003 Winner Chrome ──
        TranslationKeys.winnerMatchEnded: 'انتهى التحدي',
        TranslationKeys.winnerFirstPlace: 'المركز الأول',
        TranslationKeys.winnerYouLastHeart: 'أنت آخر قلب!',
        TranslationKeys.winnerPlayerWins: '{name} يفوز بالتحدي',
        TranslationKeys.winnerHeartsLeft: 'قلوب متبقية',
        TranslationKeys.winnerPlayAgain: 'العب مجددًا',

        TranslationKeys.sessionReconnecting: 'جارٍ إعادة الاتصال…',
        TranslationKeys.sessionRecoveringState: 'جارٍ استعادة حالة التحدي…',
        TranslationKeys.challengeAnswerWaiting:
            'تم الإرسال — بانتظار نتيجة الجولة',
        TranslationKeys.winnerStandings: 'الترتيب',
        TranslationKeys.winnerEnergyScore: 'النقاط',
        TranslationKeys.resultEqual: 'نتيجة التحدي: تعادل',
        
        'challenge.category.trap': 'فخ',
        'challenge.category.gesture': 'إيماءة',
        'challenge.category.tap': 'لمس',
        'challenge.category.memory': 'ذاكرة',
        'challenge.category.hold': 'ضغط',
        'challenge.no_touch.intro': 'لا تلمس',
        'challenge.no_touch.prompt': 'لا تلمس المنطقة الحمراء',
        'challenge.no_touch.zone_hint': 'منطقة محظورة',
        'challenge.reverse_swipe.intro': 'اسحب بالعكس',
        'challenge.reverse_swipe.prompt': 'اسحب بعكس السهم',
        'challenge.precision.intro': 'اضغط الأهداف',
        'challenge.precision.prompt': 'اضغط كل الأهداف',
        'challenge.memory.intro': 'تذكّر التسلسل',
        'challenge.memory.prompt': 'أعد التسلسل',
        'challenge.memory.preview': 'احفظ الترتيب…',
        'memory.opt.a': 'أ',
        'memory.opt.b': 'ب',
        'memory.opt.c': 'ج',
        'memory.opt.d': 'د',
        'challenge.hold.intro': 'أمسك بإصبعين',
        'challenge.hold.prompt': 'أمسك بإصبعين حتى يمتلئ الشريط',
        'result.no_touch.touched': 'لمست المنطقة المحظورة',
        'result.swipe.invalid': 'إيماءة غير صالحة',
        'result.swipe.too_short': 'السحبة قصيرة جداً',
        'result.swipe.wrong_direction': 'اتجاه خاطئ',
        'result.precision.invalid': 'إجابة غير صالحة',
        'result.precision.wrong_count': 'عدد أهداف خاطئ',
        'result.precision.miss': 'أهداف خاطئة',
        'result.memory.invalid': 'إجابة غير صالحة',
        'result.memory.wrong': 'تسلسل خاطئ',
        'result.hold.incomplete': 'الإمساك غير مكتمل',


        TranslationKeys.commonBack: 'رجوع',
        TranslationKeys.commonNext: 'التالي',
        TranslationKeys.onboardingHeartsTitle: 'ثلاثة قلوب',
        TranslationKeys.onboardingHeartsBody:
            'كل لاعب يبدأ بثلاثة قلوب. خسارة القلب الأخيرة تحوّلك إلى متفرج.',
        TranslationKeys.onboardingTimingTitle: 'تحدٍّ موقوت',
        TranslationKeys.onboardingTimingBody:
            'نفّذ الإجراء في الوقت الصحيح. الموعد النهائي دقيق ويُحسب من الخادم.',
        TranslationKeys.onboardingEnergyTitle: 'الطاقة والقوى',
        TranslationKeys.onboardingEnergyBody:
            'النجاح يملأ الطاقة. عند اكتمالها تحصل على قوة تكتيكية',
        TranslationKeys.onboardingDone: 'ابدأ',
        TranslationKeys.identityTitle: 'هويتك في اللعبة',
        TranslationKeys.identitySubtitle:
            'اختر اسم العرض ولونًا مجردًا. لا حاجة لحساب.',
        TranslationKeys.identityNameLabel: 'اسم العرض',
        TranslationKeys.identityNameInvalid: 'الاسم يجب أن يكون بين حرفين و٢٤ حرفًا',
        TranslationKeys.identityColorLabel: 'اللون',
        TranslationKeys.identitySave: 'حفظ والمتابعة',
        TranslationKeys.homeHelpOnboarding: 'كيف تُلعب؟',
        TranslationKeys.homeEditIdentity: 'تعديل الهوية',
        TranslationKeys.homeTraining: 'تدريب',
        TranslationKeys.homeTrainingDesc: 'تمرّن على التحديات دون تأثير تنافسي',
        TranslationKeys.matchmakingTitle: 'تحدي سريع',
        TranslationKeys.matchmakingSearching: 'جارٍ العثور على لاعبين',
        TranslationKeys.matchmakingSeats: '{count} من ٦ لاعبين',
        TranslationKeys.matchmakingCancel: 'إلغاء البحث',
        TranslationKeys.privateCreate: 'إنشاء غرفة',
        TranslationKeys.privateJoin: 'انضم برمز',
        TranslationKeys.privateCodeLabel: 'رمز الغرفة',
        TranslationKeys.privateCodeCopied: 'تم نسخ الرمز',
        TranslationKeys.privateShare: 'مشاركة الرمز',
        TranslationKeys.privateReady: 'جاهز',
        TranslationKeys.privateLeave: 'مغادرة',
        TranslationKeys.privateInvalidCode: 'الرمز غير صالح أو منتهٍ',
        TranslationKeys.trainingTitle: 'وضع التدريب',
        TranslationKeys.trainingRetry: 'أعد المحاولة',
        TranslationKeys.trainingExplain: 'انتظر الأزرق ثم اضغط. لا مكافآت تنافسية.',
        TranslationKeys.rematchRequest: 'إعادة التحدي',
        TranslationKeys.errorsServiceUnavailable: 'الخدمة غير متاحة الآن',
        TranslationKeys.splashTagline: 'اركض مع الوقت واحمِ آخر قلب',
        TranslationKeys.splashVersion: 'الإصدار {version}',
        TranslationKeys.homeHeroSubtitle: 'سرعة، تركيز، ونجاة',
        TranslationKeys.homeModesTitle: 'أنماط اللعب',
        TranslationKeys.homeGreeting: 'مرحبًا، {name}',
        TranslationKeys.onboardingStepOf: 'الخطوة {current} من {total}',
        TranslationKeys.onboardingHowToPlay: 'كيف تلعب',
        TranslationKeys.appPressBackAgainToExit: 'اضغط مرة أخرى للخروج',
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
        TranslationKeys.lobbyMatchId: 'Challenge: {matchId}',

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
        TranslationKeys.challengeWaitForSignalAction: 'Tap anywhere',

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
        TranslationKeys.winnerTitle: 'Challenge over!',
        TranslationKeys.winnerYou: 'You win! 🏆',
        TranslationKeys.winnerOther: 'Winner: {name}',
        TranslationKeys.winnerBackHome: 'Back to home',

        // ── Connection errors ──
        TranslationKeys.errorsConnectionFailed:
            'Could not reach the server. Stay on the same Wi-Fi and keep the backend running.',
        TranslationKeys.errorsConnectionRetry: 'Reconnecting...',
        TranslationKeys.errorsMatchFull: 'Challenge is full',
        TranslationKeys.errorsProtocol: 'Protocol error',
        TranslationKeys.errorsConnectionTimeout:
            'Connection timed out. Check the network and port forwarding.',
        TranslationKeys.errorsQueueTimeout:
            'Challenge search timed out. Try again.',
        TranslationKeys.errorsQueueFailed:
            'Could not complete challenge search. Try again.',
        TranslationKeys.errorsProtocolUnauthorized:
            'Previous session expired. Try again.',

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
        TranslationKeys.lobbyFillStartsIn: 'Game starts in {seconds}',
        TranslationKeys.lobbyExtendWait: 'Extend wait',
        TranslationKeys.lobbyStartNow: 'Start now',

        // ── LH-003 Countdown Chrome ──
        TranslationKeys.countdownAllReady: 'All Ready',
        TranslationKeys.countdownMatchStarts: 'Challenge starts now',
        TranslationKeys.countdownChallengesStarting:
            'Challenges are about to start',
        TranslationKeys.countdownChallengesStartingSub:
            'Get ready — countdown started',
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
        TranslationKeys.introGetReady: 'Get ready',

        // ── LH-003 Result Chrome ──
        TranslationKeys.resultChallengeTitle: 'Challenge Result',
        TranslationKeys.resultRoundOf: 'Round {round} of {total}',
        TranslationKeys.resultSurvived: 'Survived!',
        TranslationKeys.resultNextChallengeIn: 'Next challenge in {seconds}s',
        TranslationKeys.resultTooEarlyTitle: 'Too early!',
        TranslationKeys.resultPressedEarlyReason:
            'Pressed before the heart turned blue',
        TranslationKeys.resultTimeoutReason:
            'Time ran out before you completed the action',
        TranslationKeys.resultFailureReason:
            'Your action was not accepted for this challenge',
        TranslationKeys.resultOutcomeSuccess: 'Success',
        TranslationKeys.resultOutcomeFailure: 'Failed',
        TranslationKeys.resultOutcomeTimeout: 'Timed out',
        TranslationKeys.resultOutcomeSkipped: 'Spectating',
        TranslationKeys.resultLostHeartLabel: 'Lost a heart',
        TranslationKeys.resultHeartsRemaining: '{count} remaining',
        TranslationKeys.resultAutoContinue:
            'Stay on screen — next challenge starts automatically',
        TranslationKeys.resultPowerEnergy: 'Power Energy',

        // ── LH-003 Spectator Chrome ──
        TranslationKeys.spectatorMatchOngoing: 'Challenge ongoing',
        TranslationKeys.spectatorLostLastHeart: 'Lost last heart',
        TranslationKeys.spectatorEliminatedMsg:
            'You are out, but can keep watching the challenge',
        TranslationKeys.spectatorCurrentStandings: 'Current Standings',
        TranslationKeys.spectatorRemainingPlayers: '{count} players left',
        TranslationKeys.spectatorEliminatedBadge: 'Out',

        // ── LH-003 Winner Chrome ──
        TranslationKeys.winnerMatchEnded: 'Challenge Over',
        TranslationKeys.winnerFirstPlace: 'First Place',
        TranslationKeys.winnerYouLastHeart: 'You are the Last Heart!',
        TranslationKeys.winnerPlayerWins: '{name} wins the challenge',
        TranslationKeys.winnerHeartsLeft: 'Hearts left',
        TranslationKeys.winnerPlayAgain: 'Play Again',

        TranslationKeys.sessionReconnecting: 'Reconnecting…',
        TranslationKeys.sessionRecoveringState: 'Recovering challenge state…',
        TranslationKeys.challengeAnswerWaiting:
            'Submitted — waiting for round result',
        TranslationKeys.winnerStandings: 'Standings',
        TranslationKeys.winnerEnergyScore: 'Score',
        TranslationKeys.resultEqual: 'Result: Equal',
        
        'challenge.category.trap': 'Trap',
        'challenge.category.gesture': 'Gesture',
        'challenge.category.tap': 'Tap',
        'challenge.category.memory': 'Memory',
        'challenge.category.hold': 'Hold',
        'challenge.no_touch.intro': 'Do not touch',
        'challenge.no_touch.prompt': 'Do not touch the red zone',
        'challenge.no_touch.zone_hint': 'Forbidden zone',
        'challenge.reverse_swipe.intro': 'Swipe opposite',
        'challenge.reverse_swipe.prompt': 'Swipe opposite the arrow',
        'challenge.precision.intro': 'Tap the targets',
        'challenge.precision.prompt': 'Tap every target',
        'challenge.memory.intro': 'Remember the sequence',
        'challenge.memory.prompt': 'Repeat the sequence',
        'challenge.memory.preview': 'Memorize…',
        'memory.opt.a': 'A',
        'memory.opt.b': 'B',
        'memory.opt.c': 'C',
        'memory.opt.d': 'D',
        'challenge.hold.intro': 'Hold with two fingers',
        'challenge.hold.prompt': 'Hold with two fingers until full',
        'result.no_touch.touched': 'Touched the forbidden zone',
        'result.swipe.invalid': 'Invalid swipe',
        'result.swipe.too_short': 'Swipe too short',
        'result.swipe.wrong_direction': 'Wrong direction',
        'result.precision.invalid': 'Invalid answer',
        'result.precision.wrong_count': 'Wrong target count',
        'result.precision.miss': 'Wrong targets',
        'result.memory.invalid': 'Invalid answer',
        'result.memory.wrong': 'Wrong sequence',
        'result.hold.incomplete': 'Hold incomplete',


        TranslationKeys.commonBack: 'Back',
        TranslationKeys.commonNext: 'Next',
        TranslationKeys.onboardingHeartsTitle: 'Three hearts',
        TranslationKeys.onboardingHeartsBody:
            'Every player starts with three hearts. Losing the last heart makes you a spectator.',
        TranslationKeys.onboardingTimingTitle: 'Timed action',
        TranslationKeys.onboardingTimingBody:
            'Act at the right moment. The exact deadline is authoritative on the server.',
        TranslationKeys.onboardingEnergyTitle: 'Energy and powers',
        TranslationKeys.onboardingEnergyBody:
            'Success fills energy. A full meter grants one tactical power.',
        TranslationKeys.onboardingDone: 'Start',
        TranslationKeys.identityTitle: 'Your in-game identity',
        TranslationKeys.identitySubtitle:
            'Choose a display name and abstract color. No account required.',
        TranslationKeys.identityNameLabel: 'Display name',
        TranslationKeys.identityNameInvalid:
            'Name must be between 2 and 24 characters',
        TranslationKeys.identityColorLabel: 'Color',
        TranslationKeys.identitySave: 'Save and continue',
        TranslationKeys.homeHelpOnboarding: 'How to play?',
        TranslationKeys.homeEditIdentity: 'Edit identity',
        TranslationKeys.homeTraining: 'Training',
        TranslationKeys.homeTrainingDesc:
            'Practice challenges with no competitive impact',
        TranslationKeys.matchmakingTitle: 'Quick Challenge',
        TranslationKeys.matchmakingSearching: 'Finding players',
        TranslationKeys.matchmakingSeats: '{count} of 6 players',
        TranslationKeys.matchmakingCancel: 'Cancel search',
        TranslationKeys.privateCreate: 'Create room',
        TranslationKeys.privateJoin: 'Join with code',
        TranslationKeys.privateCodeLabel: 'Room code',
        TranslationKeys.privateCodeCopied: 'Code copied',
        TranslationKeys.privateShare: 'Share code',
        TranslationKeys.privateReady: 'Ready',
        TranslationKeys.privateLeave: 'Leave',
        TranslationKeys.privateInvalidCode: 'Code is invalid or expired',
        TranslationKeys.trainingTitle: 'Training mode',
        TranslationKeys.trainingRetry: 'Try again',
        TranslationKeys.trainingExplain:
            'Wait for blue, then tap. No competitive rewards.',
        TranslationKeys.rematchRequest: 'Retry challenge',
        TranslationKeys.errorsServiceUnavailable: 'Service unavailable',
        TranslationKeys.splashTagline: 'Race the clock and protect the last heart',
        TranslationKeys.splashVersion: 'Version {version}',
        TranslationKeys.homeHeroSubtitle: 'Speed, focus, and survival',
        TranslationKeys.homeModesTitle: 'Game modes',
        TranslationKeys.homeGreeting: 'Hello, {name}',
        TranslationKeys.onboardingStepOf: 'Step {current} of {total}',
        TranslationKeys.onboardingHowToPlay: 'How to play',
        TranslationKeys.appPressBackAgainToExit: 'Press back again to exit',
      },
    },
  );
}
