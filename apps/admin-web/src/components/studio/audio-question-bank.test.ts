import { describe, expect, it } from 'vitest';
import {
  AUDIO_CLIP_DEFAULT_MAX_DURATION_MS,
  resolveAudioClipMaxDurationMs,
} from '@thelastheart/contracts';
import {
  addAudioOption,
  audioClientPreview,
  audioQuestionBankIssues,
  createAudioQuestion,
  defaultAudioQuestions,
  parseAudioQuestions,
  parseMaxAudioDurationMs,
  removeAudioOption,
  inferAudioAnswerTarget,
  withAudioAnswerTarget,
  serializeAudioQuestions,
} from './audio-question-bank';

describe('audio question bank', () => {
  it('creates artist and track identification questions', () => {
    const questions = defaultAudioQuestions();
    expect(questions.map((q) => q.answerTarget).sort()).toEqual([
      'artist',
      'track',
    ]);
    expect(questions[0]?.audioAssetId.startsWith('ca_')).toBe(true);
    expect(questions[1]?.visualizationAssetId.startsWith('cv_')).toBe(true);
  });

  it('reuses the trivia option editor rules: 2–6 options and one correct', () => {
    const [artist] = defaultAudioQuestions();
    expect(artist?.options).toHaveLength(4);
    const withFive = addAudioOption(artist!);
    expect(withFive.options).toHaveLength(5);
    const withSix = addAudioOption(addAudioOption(withFive));
    expect(withSix.options).toHaveLength(6);
    expect(addAudioOption(withSix).options).toHaveLength(6);
    const removed = removeAudioOption(withFive, withFive.correctOptionKey);
    expect(removed.options).toHaveLength(4);
    expect(
      removed.options.some((o) => o.key === removed.correctOptionKey),
    ).toBe(true);
  });

  it('round-trips authored copy, target, and audio ids', () => {
    const created = createAudioQuestion([], 'track');
    created.questionAr = 'ما اسم الأغنية؟';
    created.questionEn = 'What is the name of the song?';
    created.options[0]!.ar = 'نبض';
    created.options[1]!.ar = 'ليل';
    created.correctOptionKey = created.options[1]!.key;
    created.audioAssetId = 'ca_testhash0000001';
    created.visualizationAssetId = 'cv_testhash0000001';
    created.audioDurationMs = 7000;
    const serialized = serializeAudioQuestions([created]);
    const parsed = parseAudioQuestions({ questions: serialized });
    expect(parsed[0]?.answerTarget).toBe('track');
    expect(parsed[0]?.correctOptionKey).toBe(created.options[1]!.key);
    expect(parsed[0]?.audioDurationMs).toBe(7000);
    expect(parsed[0]?.questionAr).toBe('ما اسم الأغنية؟');
  });

  it('requires audio before publishing and keeps trivia copy rules', () => {
    const blank = createAudioQuestion([]);
    const issues = audioQuestionBankIssues([blank]);
    expect(issues.some((i) => i.includes('audioAssetId'))).toBe(true);
    expect(issues.some((i) => i.includes('questionAr'))).toBe(true);
    expect(audioQuestionBankIssues(defaultAudioQuestions())).toEqual([]);
  });

  it('uses the operator-configured max clip length instead of a hardcoded 7s cap', () => {
    expect(parseMaxAudioDurationMs({})).toBe(
      AUDIO_CLIP_DEFAULT_MAX_DURATION_MS,
    );
    expect(parseMaxAudioDurationMs({ maxAudioDurationMs: 3000 })).toBe(3000);
    expect(resolveAudioClipMaxDurationMs(99_000)).toBe(15_000);

    const longClip = {
      ...defaultAudioQuestions()[0]!,
      audioDurationMs: 8000,
    };
    expect(
      audioQuestionBankIssues(
        [longClip],
        AUDIO_CLIP_DEFAULT_MAX_DURATION_MS,
      ).some((issue) => issue.includes('audioDurationMs')),
    ).toBe(true);
    expect(audioQuestionBankIssues([longClip], 10_000)).toEqual([]);

    const shortCapClip = {
      ...defaultAudioQuestions()[0]!,
      audioDurationMs: 4000,
    };
    expect(
      audioQuestionBankIssues([shortCapClip], 3000).some((issue) =>
        issue.includes('audioDurationMs'),
      ),
    ).toBe(true);
  });

  it('serializes song-name questions as track even if the dropdown was left on artist', () => {
    const [artist] = defaultAudioQuestions();
    const mismatched = {
      ...artist!,
      questionAr: 'ما اسم الأغنية؟',
      questionEn: 'What is the name of the song?',
      answerTarget: 'artist' as const,
    };
    const serialized = serializeAudioQuestions([mismatched]);
    expect(serialized[0]?.answerTarget).toBe('track');
    expect(inferAudioAnswerTarget(mismatched)).toBe('track');
    expect(withAudioAnswerTarget(mismatched, 'track').answerTarget).toBe(
      'track',
    );
  });

  it('does not alter trivia-shaped option serialization', () => {
    const preview = audioClientPreview(defaultAudioQuestions()[0], {
      footerKey: 'challenge.audio_mc.footer',
    });
    expect(preview.optionKeys).toEqual(
      defaultAudioQuestions()[0]?.options.map((o) => o.key),
    );
    expect(preview.answerTarget).toBe('artist');
    expect(preview.correctOptionKey).toBeUndefined();
  });

  it('round-trips deleting a character from seed question and answer copy', () => {
    const questions = defaultAudioQuestions();
    const shortenedQuestion = questions[0]!.questionAr.slice(0, -1);
    const shortenedAnswer = questions[0]!.options[0]!.ar.slice(0, -1);
    const edited = [
      {
        ...questions[0]!,
        questionAr: shortenedQuestion,
        options: questions[0]!.options.map((option, index) =>
          index === 0 ? { ...option, ar: shortenedAnswer } : option,
        ),
      },
      questions[1]!,
    ];
    const parsed = parseAudioQuestions({
      questions: serializeAudioQuestions(edited),
    });
    expect(parsed[0]?.questionAr).toBe(shortenedQuestion);
    expect(parsed[0]?.options[0]?.ar).toBe(shortenedAnswer);
    expect(parsed[1]?.questionAr).toBe(questions[1]!.questionAr);
  });
});
