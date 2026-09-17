'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  AUDIO_CLIP_DEFAULT_MAX_DURATION_MS,
  AUDIO_CLIP_HARD_MAX_DURATION_MS,
  AUDIO_CLIP_MIN_MAX_DURATION_MS,
  resolveAudioClipMaxDurationMs,
} from '@thelastheart/contracts';
import { t } from '@/i18n/get-dictionary';
import type { Locale } from '@/i18n/locale';
import type { MessageKey } from '@/i18n/messages/en';
import { adminApiFetch } from '@/lib/api/client';
import {
  addAudioOption,
  audioClientPreview,
  audioQuestionBankIssues,
  audioQuestionBankSignature,
  collectAudioRequiredAssetIds,
  createAudioQuestion,
  parseAudioQuestions,
  parseAudioVisualization,
  parseMaxAudioDurationMs,
  removeAudioOption,
  serializeAudioQuestions,
  inferAudioAnswerTarget,
  withAudioAnswerTarget,
  type AudioAnswerTarget,
  type AudioStudioQuestion,
  type AudioVisualizationPreview,
} from './audio-question-bank';
import { StudioAudioClipPreview } from './AudioVisualizationPreview';
import { FieldGroup, FieldInput, readFieldInputValue } from './Field';
import { DurationSecondsField, SegmentedChoice } from './OperatorControls';

type AudioMultipleChoiceFieldsProps = {
  locale: Locale;
  clientConfig: Record<string, unknown>;
  serverConfig: Record<string, unknown>;
  onClientChange: (config: Record<string, unknown>) => void;
  onServerChange: (config: Record<string, unknown>) => void;
  requiredAssetIds?: string[];
  onRequiredAssetIdsChange?: (ids: string[]) => void;
  disabled?: boolean;
};

type UploadResponse = {
  packVersion: number;
  audioAssetId: string;
  visualizationAssetId: string;
  durationMs: number;
  analysisSchemaVersion: number;
  contentType: string;
  visualization: AudioVisualizationPreview;
};

const visCache = new Map<string, AudioVisualizationPreview>();

function lbl(locale: Locale, key: string): string {
  return t(locale, `studio.field.${key}` as MessageKey);
}

function formatDurationSeconds(ms: number): string {
  const sec = Math.max(0, ms) / 1000;
  if (Number.isInteger(sec)) return String(sec);
  return sec.toFixed(3).replace(/0+$/, '').replace(/\.$/, '');
}

function audioErrorMessage(
  locale: Locale,
  details: unknown,
  fallback: string,
): string {
  const rec =
    details && typeof details === 'object' && !Array.isArray(details)
      ? (details as Record<string, unknown>)
      : null;
  const code = typeof rec?.code === 'string' ? rec.code : '';
  const suffix = code.replace(/^audio\./, '');
  if (!suffix) return fallback;
  try {
    const message = t(locale, `studio.audio.error.${suffix}` as MessageKey);
    if (
      suffix === 'duration_exceeded' &&
      typeof rec?.maxMs === 'number' &&
      Number.isFinite(rec.maxMs)
    ) {
      return message.replace('{seconds}', formatDurationSeconds(rec.maxMs));
    }
    return message;
  } catch {
    return fallback;
  }
}

function formatClock(ms: number): string {
  const clamped = Math.max(0, Math.round(ms));
  const totalSec = Math.floor(clamped / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function formatLabel(locale: Locale, key: string): string {
  return t(locale, key as MessageKey);
}

export function AudioMultipleChoiceFields(
  props: AudioMultipleChoiceFieldsProps,
) {
  const {
    locale,
    clientConfig,
    serverConfig,
    onClientChange,
    onServerChange,
    requiredAssetIds,
    onRequiredAssetIdsChange,
    disabled,
  } = props;
  const maxAudioDurationMs = parseMaxAudioDurationMs(serverConfig);
  const parsedQuestions = useMemo(
    () => parseAudioQuestions(serverConfig),
    [serverConfig],
  );
  const parsedSignature = audioQuestionBankSignature(parsedQuestions);
  const [questions, setQuestions] = useState(parsedQuestions);
  const [syncedSignature, setSyncedSignature] = useState(parsedSignature);
  if (parsedSignature !== syncedSignature) {
    setSyncedSignature(parsedSignature);
    setQuestions(parsedQuestions);
  }
  const visIdsKey = questions
    .map((q) => q.visualizationAssetId)
    .filter(Boolean)
    .join('|');
  const [visualizations, setVisualizations] = useState<
    Record<string, AudioVisualizationPreview>
  >({});
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadingIndex, setUploadingIndex] = useState<number | null>(null);

  function commit(next: AudioStudioQuestion[]) {
    setQuestions(next);
    const serialized = serializeAudioQuestions(next);
    const rest = { ...serverConfig };
    delete rest.questionKey;
    delete rest.optionKeys;
    delete rest.correctOptionKey;
    onServerChange({ ...rest, questions: serialized });
    onClientChange(audioClientPreview(next[0], clientConfig));
    onRequiredAssetIdsChange?.(
      collectAudioRequiredAssetIds(next).length > 0
        ? collectAudioRequiredAssetIds(next)
        : (requiredAssetIds ?? []),
    );
  }

  useEffect(() => {
    let cancelled = false;
    const ids = visIdsKey.split('|').filter(Boolean);
    const missing = ids.filter((id) => !visCache.has(id));
    void Promise.all(
      missing.map(async (id) => {
        try {
          const res = await fetch(
            `/api/admin/v1/content/pack/assets/${encodeURIComponent(id)}`,
            { credentials: 'same-origin', cache: 'force-cache' },
          );
          if (!res.ok) return;
          const json: unknown = await res.json();
          const parsed = parseAudioVisualization(json);
          if (parsed) visCache.set(id, parsed);
        } catch {
          /* preview fetch is best-effort */
        }
      }),
    ).then(() => {
      if (cancelled) return;
      setVisualizations((prev) => {
        let changed = false;
        const next = { ...prev };
        for (const id of ids) {
          const vis = visCache.get(id);
          if (vis && prev[id] !== vis) {
            next[id] = vis;
            changed = true;
          }
        }
        return changed ? next : prev;
      });
    });
    return () => {
      cancelled = true;
    };
  }, [visIdsKey]);

  async function handleUpload(index: number, file: File | null) {
    if (!file || disabled) return;
    setUploadingIndex(index);
    setUploadError(null);
    const form = new FormData();
    form.append('file', file);
    const result = await adminApiFetch<UploadResponse>(
      `/content/pack/audio?maxDurationMs=${encodeURIComponent(String(maxAudioDurationMs))}`,
      {
        method: 'POST',
        body: form,
      },
    );
    setUploadingIndex(null);
    if (!result.ok) {
      setUploadError(
        audioErrorMessage(locale, result.error.details, result.error.message),
      );
      return;
    }
    const vis = parseAudioVisualization(result.data.visualization);
    if (vis) visCache.set(result.data.visualizationAssetId, vis);
    const next = [...questions];
    next[index] = {
      ...questions[index]!,
      audioAssetId: result.data.audioAssetId,
      visualizationAssetId: result.data.visualizationAssetId,
      audioDurationMs: result.data.durationMs,
      analysisSchemaVersion: result.data.analysisSchemaVersion,
      contentType: result.data.contentType,
    };
    if (vis) {
      setVisualizations((prev) => ({
        ...prev,
        [result.data.visualizationAssetId]: vis,
      }));
    }
    commit(next);
  }

  function removeAudio(index: number) {
    const next = [...questions];
    next[index] = {
      ...questions[index]!,
      audioAssetId: '',
      visualizationAssetId: '',
      audioDurationMs: 0,
      contentType: undefined,
    };
    commit(next);
  }

  const issues = useMemo(
    () => audioQuestionBankIssues(questions, maxAudioDurationMs),
    [questions, maxAudioDurationMs],
  );

  return (
    <>
      <p className="studio-section-lead">{lbl(locale, 'fp.audioMcLead')}</p>
      <DurationSecondsField
        id="fp-audio-maxDurationMs"
        label={lbl(locale, 'fp.audioMcMaxDuration')}
        hint={lbl(locale, 'fp.audioMcMaxDurationHint')}
        valueMs={maxAudioDurationMs}
        onChangeMs={(ms) =>
          onServerChange({
            ...serverConfig,
            maxAudioDurationMs: resolveAudioClipMaxDurationMs(ms),
          })
        }
        minSec={AUDIO_CLIP_MIN_MAX_DURATION_MS / 1000}
        maxSec={AUDIO_CLIP_HARD_MAX_DURATION_MS / 1000}
        presets={[
          { ms: 3000, label: '3s' },
          { ms: 5000, label: '5s' },
          { ms: AUDIO_CLIP_DEFAULT_MAX_DURATION_MS, label: '7s' },
          { ms: 10_000, label: '10s' },
          { ms: AUDIO_CLIP_HARD_MAX_DURATION_MS, label: '15s' },
        ]}
        disabled={disabled}
      />
      {uploadError ? (
        <p className="studio-audio-error" role="alert">
          {uploadError}
        </p>
      ) : null}
      {issues.length > 0 ? (
        <p className="studio-audio-hint">
          {lbl(locale, 'fp.audioMcPublishHint')}
        </p>
      ) : null}
      {questions.map((question, index) => {
        const vis = visualizations[question.visualizationAssetId] ?? null;
        return (
          <section
            key={question.questionKey}
            className="studio-trivia-question"
          >
            <div className="studio-geo-map-head">
              <h3 className="studio-geo-map-title">
                {lbl(locale, 'fp.triviaQuestionN').replace(
                  '{n}',
                  String(index + 1),
                )}
              </h3>
              <button
                type="button"
                className="btn btn-ghost"
                disabled={disabled || questions.length <= 1}
                onClick={() => commit(questions.filter((q) => q !== question))}
              >
                {lbl(locale, 'fp.triviaRemoveQuestion')}
              </button>
            </div>
            <SegmentedChoice
              label={lbl(locale, 'fp.audioMcTarget')}
              hint={lbl(locale, 'fp.audioMcTargetHint')}
              value={question.answerTarget}
              options={[
                {
                  value: 'artist',
                  label: lbl(locale, 'fp.audioMcTargetArtist'),
                },
                {
                  value: 'track',
                  label: lbl(locale, 'fp.audioMcTargetTrack'),
                },
              ]}
              onChange={(v) => {
                const next = [...questions];
                next[index] = withAudioAnswerTarget(
                  question,
                  v as AudioAnswerTarget,
                );
                commit(next);
              }}
              disabled={disabled}
            />
            <FieldGroup>
              <FieldInput
                id={`fp-audio-q-ar-${index}`}
                label={lbl(locale, 'fp.triviaQuestionAr')}
                value={question.questionAr}
                disabled={disabled}
                dir="rtl"
                onChange={(e) => {
                  const next = [...questions];
                  const edited = {
                    ...question,
                    questionAr: readFieldInputValue(e),
                  };
                  next[index] = {
                    ...edited,
                    answerTarget: inferAudioAnswerTarget(edited),
                  };
                  commit(next);
                }}
              />
              <FieldInput
                id={`fp-audio-q-en-${index}`}
                label={lbl(locale, 'fp.triviaQuestionEn')}
                value={question.questionEn}
                disabled={disabled}
                onChange={(e) => {
                  const next = [...questions];
                  const edited = {
                    ...question,
                    questionEn: readFieldInputValue(e),
                  };
                  next[index] = {
                    ...edited,
                    answerTarget: inferAudioAnswerTarget(edited),
                  };
                  commit(next);
                }}
              />
            </FieldGroup>

            <div className="studio-audio-upload">
              <div className="studio-audio-upload-row">
                <label
                  className="btn btn-secondary"
                  htmlFor={`fp-audio-file-${index}`}
                >
                  {question.audioAssetId
                    ? lbl(locale, 'fp.audioMcReplace')
                    : lbl(locale, 'fp.audioMcUpload')}
                  <input
                    id={`fp-audio-file-${index}`}
                    type="file"
                    accept=".mp3,.wav,audio/mpeg,audio/wav"
                    disabled={disabled || uploadingIndex === index}
                    hidden
                    onChange={(e) => {
                      void handleUpload(
                        index,
                        e.currentTarget.files?.[0] ?? null,
                      );
                      e.currentTarget.value = '';
                    }}
                  />
                </label>
                <button
                  type="button"
                  className="btn btn-ghost"
                  disabled={disabled || !question.audioAssetId}
                  onClick={() => removeAudio(index)}
                >
                  {lbl(locale, 'fp.audioMcRemove')}
                </button>
                {uploadingIndex === index ? (
                  <span className="studio-audio-meta">
                    {lbl(locale, 'fp.audioMcUploading')}
                  </span>
                ) : null}
              </div>
              {question.audioAssetId ? (
                <div className="studio-audio-preview">
                  <p className="studio-audio-meta">
                    {lbl(locale, 'fp.audioMcDuration')}:{' '}
                    {formatClock(question.audioDurationMs)} (
                    {question.audioDurationMs} ms) ·{' '}
                    {question.contentType === 'audio/mpeg' ? 'MP3' : 'WAV'} ·{' '}
                    {question.audioAssetId}
                  </p>
                  <p className="studio-audio-badge" dir="rtl">
                    {inferAudioAnswerTarget(question) === 'track'
                      ? formatLabel(locale, 'studio.audio.badgeTrack')
                      : formatLabel(locale, 'studio.audio.badgeArtist')}
                  </p>
                  <StudioAudioClipPreview
                    assetId={question.audioAssetId}
                    durationMs={question.audioDurationMs}
                    visualization={vis}
                  />
                  {!vis ? (
                    <p className="studio-audio-hint">
                      {lbl(locale, 'fp.audioMcVizPending')}
                    </p>
                  ) : null}
                  <p className="studio-audio-admin-flag">
                    {lbl(locale, 'fp.audioMcCorrectVisible')}:{' '}
                    {question.options.find(
                      (o) => o.key === question.correctOptionKey,
                    )?.ar ?? question.correctOptionKey}
                  </p>
                </div>
              ) : (
                <p className="studio-audio-hint">
                  {lbl(locale, 'fp.audioMcRequired')}
                </p>
              )}
            </div>

            <fieldset className="studio-trivia-answers">
              <legend>{lbl(locale, 'fp.triviaAnswers')}</legend>
              {question.options.map((option, optionIndex) => (
                <div key={option.key} className="studio-trivia-option-row">
                  <label className="studio-trivia-correct">
                    <input
                      type="radio"
                      name={`fp-audio-correct-${index}`}
                      checked={question.correctOptionKey === option.key}
                      disabled={disabled}
                      onChange={() => {
                        const next = [...questions];
                        next[index] = {
                          ...question,
                          correctOptionKey: option.key,
                        };
                        commit(next);
                      }}
                    />
                    <span>{lbl(locale, 'fp.triviaCorrectAnswer')}</span>
                  </label>
                  <FieldInput
                    id={`fp-audio-opt-ar-${index}-${optionIndex}`}
                    label={lbl(locale, 'fp.triviaAnswerAr')}
                    value={option.ar}
                    disabled={disabled}
                    dir="rtl"
                    onChange={(e) => {
                      const value = readFieldInputValue(e);
                      const nextOptions = question.options.map((o) =>
                        o.key === option.key ? { ...o, ar: value } : o,
                      );
                      const next = [...questions];
                      next[index] = { ...question, options: nextOptions };
                      commit(next);
                    }}
                  />
                  <FieldInput
                    id={`fp-audio-opt-en-${index}-${optionIndex}`}
                    label={lbl(locale, 'fp.triviaAnswerEn')}
                    value={option.en}
                    disabled={disabled}
                    onChange={(e) => {
                      const value = readFieldInputValue(e);
                      const nextOptions = question.options.map((o) =>
                        o.key === option.key ? { ...o, en: value } : o,
                      );
                      const next = [...questions];
                      next[index] = { ...question, options: nextOptions };
                      commit(next);
                    }}
                  />
                  <div className="field studio-geo-remove">
                    <label
                      htmlFor={`fp-audio-opt-remove-${index}-${optionIndex}`}
                    >
                      &nbsp;
                    </label>
                    <button
                      id={`fp-audio-opt-remove-${index}-${optionIndex}`}
                      type="button"
                      className="btn btn-ghost"
                      disabled={disabled || question.options.length <= 2}
                      onClick={() => {
                        const next = [...questions];
                        next[index] = removeAudioOption(question, option.key);
                        commit(next);
                      }}
                    >
                      {lbl(locale, 'fp.triviaRemoveAnswer')}
                    </button>
                  </div>
                </div>
              ))}
              {question.options.length < 6 ? (
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={disabled}
                  onClick={() => {
                    const next = [...questions];
                    next[index] = addAudioOption(question);
                    commit(next);
                  }}
                >
                  {lbl(locale, 'fp.triviaAddAnswer')}
                </button>
              ) : null}
            </fieldset>
          </section>
        );
      })}
      {questions.length < 64 ? (
        <button
          type="button"
          className="btn btn-secondary"
          disabled={disabled}
          onClick={() =>
            commit([...questions, createAudioQuestion(questions, 'artist')])
          }
        >
          {lbl(locale, 'fp.triviaAddQuestion')}
        </button>
      ) : null}
    </>
  );
}
