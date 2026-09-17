import {
  AUDIO_CLIP_DEFAULT_MAX_DURATION_MS,
  resolveAudioClipMaxDurationMs,
} from '@thelastheart/contracts';
import {
  addTriviaOption,
  createTriviaQuestion,
  parseTriviaQuestions,
  removeTriviaOption,
  serializeTriviaQuestions,
  triviaClientPreview,
  triviaQuestionBankIssues,
  type TriviaStudioQuestion,
} from './trivia-question-bank';

export type AudioAnswerTarget = 'artist' | 'track';

export type AudioVisualizationPreview = {
  schemaVersion: number;
  audioContentHash: string;
  durationMs: number;
  frameIntervalMs: number;
  waveform: number[];
  spectrumFrames: number[][];
};

export type AudioStudioQuestion = TriviaStudioQuestion & {
  answerTarget: AudioAnswerTarget;
  audioAssetId: string;
  visualizationAssetId: string;
  audioDurationMs: number;
  analysisSchemaVersion?: number;
  contentType?: string;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function parseTarget(raw: unknown): AudioAnswerTarget {
  return raw === 'track' ? 'track' : 'artist';
}

const TRACK_QUESTION_TEXTS = new Set([
  'ما اسم الأغنية؟',
  'What is the name of the song?',
]);

const ARTIST_QUESTION_TEXTS = new Set([
  'من صاحب هذا الصوت؟',
  'Who is the owner of this voice?',
]);

function keyLooksLikeTarget(
  key: string,
  target: AudioAnswerTarget,
): boolean {
  if (key === `challenge.audio_mc.prompt_${target}`) return true;
  return new RegExp(`(^|[._])${target}([._]|$)`, 'i').test(key);
}

export function inferAudioAnswerTarget(
  question: Pick<
    AudioStudioQuestion,
    'answerTarget' | 'questionKey' | 'questionAr' | 'questionEn'
  >,
): AudioAnswerTarget {
  const ar = question.questionAr.trim();
  const en = question.questionEn.trim();
  if (TRACK_QUESTION_TEXTS.has(ar) || TRACK_QUESTION_TEXTS.has(en)) {
    return 'track';
  }
  if (ARTIST_QUESTION_TEXTS.has(ar) || ARTIST_QUESTION_TEXTS.has(en)) {
    return 'artist';
  }
  const looksTrack = keyLooksLikeTarget(question.questionKey, 'track');
  const looksArtist = keyLooksLikeTarget(question.questionKey, 'artist');
  if (looksTrack && !looksArtist) return 'track';
  if (looksArtist && !looksTrack) return 'artist';
  return parseTarget(question.answerTarget);
}

export function defaultQuestionCopyForTarget(target: AudioAnswerTarget): {
  questionAr: string;
  questionEn: string;
} {
  if (target === 'track') {
    return {
      questionAr: 'ما اسم الأغنية؟',
      questionEn: 'What is the name of the song?',
    };
  }
  return {
    questionAr: 'من صاحب هذا الصوت؟',
    questionEn: 'Who is the owner of this voice?',
  };
}

export function withAudioAnswerTarget(
  question: AudioStudioQuestion,
  answerTarget: AudioAnswerTarget,
): AudioStudioQuestion {
  const ar = question.questionAr.trim();
  const en = question.questionEn.trim();
  const arIsDefault =
    ARTIST_QUESTION_TEXTS.has(ar) || TRACK_QUESTION_TEXTS.has(ar);
  const enIsDefault =
    ARTIST_QUESTION_TEXTS.has(en) || TRACK_QUESTION_TEXTS.has(en);
  const copy = defaultQuestionCopyForTarget(answerTarget);
  return {
    ...question,
    answerTarget,
    questionAr: arIsDefault || ar === '' ? copy.questionAr : question.questionAr,
    questionEn: enIsDefault || en === '' ? copy.questionEn : question.questionEn,
  };
}

export function defaultAudioQuestions(): AudioStudioQuestion[] {
  return [
    {
      questionKey: 'audio_mc.q.artist_1',
      questionAr: 'من صاحب هذا الصوت؟',
      questionEn: 'Who is the owner of this voice?',
      options: [
        { key: 'audio_mc.opt.artist_1_a', ar: 'رامي', en: 'Rami' },
        { key: 'audio_mc.opt.artist_1_b', ar: 'نور', en: 'Nour' },
        { key: 'audio_mc.opt.artist_1_c', ar: 'ليان', en: 'Lyan' },
        { key: 'audio_mc.opt.artist_1_d', ar: 'سليم', en: 'Salim' },
      ],
      correctOptionKey: 'audio_mc.opt.artist_1_b',
      answerTarget: 'artist',
      audioAssetId: 'ca_44384e12ad9a80f1',
      visualizationAssetId: 'cv_44384e12ad9a80f1',
      audioDurationMs: 2000,
      analysisSchemaVersion: 1,
      contentType: 'audio/wav',
    },
    {
      questionKey: 'audio_mc.q.track_1',
      questionAr: 'ما اسم الأغنية؟',
      questionEn: 'What is the name of the song?',
      options: [
        { key: 'audio_mc.opt.track_1_a', ar: 'نبض أخير', en: 'Last Pulse' },
        { key: 'audio_mc.opt.track_1_b', ar: 'ليل بعيد', en: 'Distant Night' },
        {
          key: 'audio_mc.opt.track_1_c',
          ar: 'صوت القلب',
          en: 'Voice of the Heart',
        },
        {
          key: 'audio_mc.opt.track_1_d',
          ar: 'بعد الغياب',
          en: 'After Absence',
        },
      ],
      correctOptionKey: 'audio_mc.opt.track_1_a',
      answerTarget: 'track',
      audioAssetId: 'ca_76fc12197f19bd1b',
      visualizationAssetId: 'cv_76fc12197f19bd1b',
      audioDurationMs: 2000,
      analysisSchemaVersion: 1,
      contentType: 'audio/wav',
    },
  ];
}

function hydrateAudioQuestion(
  question: TriviaStudioQuestion,
  rec: Record<string, unknown>,
  fallback: Record<string, unknown>,
): AudioStudioQuestion {
  return {
    ...question,
    answerTarget: parseTarget(rec.answerTarget ?? fallback.answerTarget),
    audioAssetId:
      typeof rec.audioAssetId === 'string'
        ? rec.audioAssetId
        : typeof fallback.audioAssetId === 'string'
          ? fallback.audioAssetId
          : '',
    visualizationAssetId:
      typeof rec.visualizationAssetId === 'string'
        ? rec.visualizationAssetId
        : typeof fallback.visualizationAssetId === 'string'
          ? fallback.visualizationAssetId
          : '',
    audioDurationMs:
      typeof rec.audioDurationMs === 'number'
        ? rec.audioDurationMs
        : typeof fallback.audioDurationMs === 'number'
          ? fallback.audioDurationMs
          : 0,
    analysisSchemaVersion:
      typeof rec.analysisSchemaVersion === 'number'
        ? rec.analysisSchemaVersion
        : 1,
    contentType:
      typeof rec.contentType === 'string' ? rec.contentType : undefined,
  };
}

export function parseAudioQuestions(
  serverConfig: Record<string, unknown>,
): AudioStudioQuestion[] {
  const raw = Array.isArray(serverConfig.questions)
    ? serverConfig.questions
    : [];
  if (Array.isArray(serverConfig.questions)) {
    const trivia = parseTriviaQuestions(serverConfig);
    return trivia.map((question, index) =>
      hydrateAudioQuestion(question, asRecord(raw[index]) ?? {}, serverConfig),
    );
  }
  if (
    typeof serverConfig.questionKey === 'string' &&
    serverConfig.questionKey
  ) {
    const trivia = parseTriviaQuestions({
      questions: [
        {
          questionKey: serverConfig.questionKey,
          optionKeys: serverConfig.optionKeys,
          correctOptionKey: serverConfig.correctOptionKey,
          questionCopy: serverConfig.questionCopy,
          optionCopy: serverConfig.optionCopy,
        },
      ],
    });
    if (trivia[0]) {
      return [hydrateAudioQuestion(trivia[0], serverConfig, serverConfig)];
    }
  }
  return defaultAudioQuestions();
}

export function serializeAudioQuestions(
  questions: AudioStudioQuestion[],
): Array<Record<string, unknown>> {
  const triviaSerialized = serializeTriviaQuestions(questions);
  return triviaSerialized.map((row, index) => {
    const question = questions[index]!;
    return {
      ...row,
      answerTarget: inferAudioAnswerTarget(question),
      audioAssetId: question.audioAssetId,
      visualizationAssetId: question.visualizationAssetId,
      audioDurationMs: question.audioDurationMs,
      analysisSchemaVersion: question.analysisSchemaVersion ?? 1,
    };
  });
}

export function createAudioQuestion(
  existing: AudioStudioQuestion[],
  answerTarget: AudioAnswerTarget = 'artist',
): AudioStudioQuestion {
  const base = createTriviaQuestion(existing);
  const slug = `custom_${existing.length + 1}_${Date.now().toString(36).slice(-4)}`;
  return {
    ...base,
    questionKey: `audio_mc.q.${slug}`,
    options: base.options.map((option, i) => ({
      ...option,
      key: `audio_mc.opt.${slug}_${String.fromCharCode(97 + i)}`,
    })),
    correctOptionKey: `audio_mc.opt.${slug}_a`,
    answerTarget,
    audioAssetId: '',
    visualizationAssetId: '',
    audioDurationMs: 0,
    analysisSchemaVersion: 1,
  };
}

export function addAudioOption(
  question: AudioStudioQuestion,
): AudioStudioQuestion {
  return addTriviaOption(question) as AudioStudioQuestion;
}

export function removeAudioOption(
  question: AudioStudioQuestion,
  optionKey: string,
): AudioStudioQuestion {
  return removeTriviaOption(question, optionKey) as AudioStudioQuestion;
}

export function parseMaxAudioDurationMs(
  serverConfig: Record<string, unknown>,
): number {
  return resolveAudioClipMaxDurationMs(serverConfig.maxAudioDurationMs);
}

export function audioQuestionBankSignature(
  questions: AudioStudioQuestion[],
): string {
  return questions
    .map(
      (question) =>
        `${question.questionKey}:${question.answerTarget}:${question.audioAssetId}:${question.visualizationAssetId}:${question.correctOptionKey}:${question.options
          .map((option) => option.key)
          .join(',')}`,
    )
    .join('|');
}

export function audioQuestionBankIssues(
  questions: AudioStudioQuestion[],
  maxAudioDurationMs: number = AUDIO_CLIP_DEFAULT_MAX_DURATION_MS,
): string[] {
  const maxMs = resolveAudioClipMaxDurationMs(maxAudioDurationMs);
  const issues = triviaQuestionBankIssues(questions);
  questions.forEach((question, index) => {
    if (
      question.answerTarget !== 'artist' &&
      question.answerTarget !== 'track'
    ) {
      issues.push(`questions.${index}.answerTarget`);
    }
    if (!question.audioAssetId.trim()) {
      issues.push(`questions.${index}.audioAssetId`);
    }
    if (!question.visualizationAssetId.trim()) {
      issues.push(`questions.${index}.visualizationAssetId`);
    }
    if (
      !Number.isFinite(question.audioDurationMs) ||
      question.audioDurationMs <= 0 ||
      question.audioDurationMs > maxMs
    ) {
      issues.push(`questions.${index}.audioDurationMs`);
    }
  });
  return issues;
}

export function audioClientPreview(
  question: AudioStudioQuestion | undefined,
  clientConfig: Record<string, unknown>,
): Record<string, unknown> {
  if (!question) return clientConfig;
  const badgeKey =
    inferAudioAnswerTarget(question) === 'track'
      ? 'challenge.audio_mc.badge_track'
      : 'challenge.audio_mc.badge_artist';
  const promptKey =
    inferAudioAnswerTarget(question) === 'track'
      ? 'challenge.audio_mc.prompt_track'
      : 'challenge.audio_mc.prompt_artist';
  return {
    ...triviaClientPreview(question, clientConfig),
    promptKey,
    titleKey: 'challenge.audio_mc.intro',
    targetBadgeKey: badgeKey,
    answerTarget: inferAudioAnswerTarget(question),
    audioAssetId: question.audioAssetId || undefined,
    visualizationAssetId: question.visualizationAssetId || undefined,
    audioDurationMs: question.audioDurationMs || undefined,
    analysisSchemaVersion: question.analysisSchemaVersion ?? 1,
    footerKey:
      typeof clientConfig.footerKey === 'string'
        ? clientConfig.footerKey
        : 'challenge.audio_mc.footer',
    categoryKey: 'challenge.category.audio',
  };
}

export function collectAudioRequiredAssetIds(
  questions: AudioStudioQuestion[],
): string[] {
  const ids = new Set<string>();
  for (const question of questions) {
    if (question.audioAssetId.trim()) ids.add(question.audioAssetId.trim());
    if (question.visualizationAssetId.trim()) {
      ids.add(question.visualizationAssetId.trim());
    }
  }
  return [...ids];
}

export function parseAudioVisualization(
  raw: unknown,
): AudioVisualizationPreview | null {
  const rec = asRecord(raw);
  if (!rec) return null;
  const waveform = Array.isArray(rec.waveform)
    ? rec.waveform.filter(
        (v): v is number => typeof v === 'number' && Number.isFinite(v),
      )
    : [];
  const spectrumFrames = Array.isArray(rec.spectrumFrames)
    ? rec.spectrumFrames
        .filter((frame): frame is unknown[] => Array.isArray(frame))
        .map((frame) =>
          frame.filter(
            (v): v is number => typeof v === 'number' && Number.isFinite(v),
          ),
        )
    : [];
  if (waveform.length < 8 || spectrumFrames.length < 1) return null;
  return {
    schemaVersion:
      typeof rec.schemaVersion === 'number' ? rec.schemaVersion : 1,
    audioContentHash:
      typeof rec.audioContentHash === 'string' ? rec.audioContentHash : '',
    durationMs: typeof rec.durationMs === 'number' ? rec.durationMs : 0,
    frameIntervalMs:
      typeof rec.frameIntervalMs === 'number' ? rec.frameIntervalMs : 40,
    waveform,
    spectrumFrames,
  };
}
