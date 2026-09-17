'use client';

import { useEffect, useMemo, useState } from 'react';
import { t } from '@/i18n/get-dictionary';
import type { Locale } from '@/i18n/locale';
import type { MessageKey } from '@/i18n/messages/en';
import { AssetThumb, collectImageAssetIds } from './AssetThumb';
import {
  inferAudioAnswerTarget,
  parseAudioQuestions,
  parseAudioVisualization,
  type AudioVisualizationPreview,
} from './audio-question-bank';
import { StudioAudioClipPreview } from './AudioVisualizationPreview';

export type PreviewState = 'intro' | 'active' | 'success' | 'failure' | 'timeout' | 'unsupported';

const PREVIEW_STATES: PreviewState[] = ['intro', 'active', 'success', 'failure', 'timeout', 'unsupported'];

const STATE_LABEL_KEYS: Record<PreviewState, MessageKey> = {
  intro: 'studio.preview.intro',
  active: 'studio.preview.active',
  success: 'studio.preview.success',
  failure: 'studio.preview.failure',
  timeout: 'studio.preview.timeout',
  unsupported: 'studio.preview.unsupported',
};

type DevicePreviewFrameProps = {
  locale: Locale;
  challengeTitle?: string;
  instructionAr?: string;
  durationMs?: number;
  engineId?: string;
  clientConfig?: Record<string, unknown>;
  serverConfig?: Record<string, unknown>;
  requiredAssetIds?: string[];
};

function AudioDevicePreview({
  locale,
  serverConfig,
}: {
  locale: Locale;
  clientConfig?: Record<string, unknown>;
  serverConfig?: Record<string, unknown>;
}) {
  const questions = parseAudioQuestions(serverConfig ?? {});
  const question = questions[0];
  const visualizationAssetId = question?.visualizationAssetId ?? '';
  const [loadedVis, setLoadedVis] = useState<{
    id: string;
    data: AudioVisualizationPreview | null;
  } | null>(null);

  useEffect(() => {
    if (!visualizationAssetId) {
      return;
    }
    let cancelled = false;
    void fetch(
      `/api/admin/v1/content/pack/assets/${encodeURIComponent(visualizationAssetId)}`,
      {
        credentials: 'same-origin',
        cache: 'force-cache',
      },
    )
      .then((res) => (res.ok ? res.json() : null))
      .then((json: unknown) => {
        if (cancelled) return;
        setLoadedVis((prev) => {
          const data = parseAudioVisualization(json);
          if (prev?.id === visualizationAssetId && prev.data === data) {
            return prev;
          }
          return { id: visualizationAssetId, data };
        });
      })
      .catch(() => {
        if (!cancelled) {
          setLoadedVis({ id: visualizationAssetId, data: null });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [visualizationAssetId]);

  const vis =
    visualizationAssetId && loadedVis?.id === visualizationAssetId
      ? loadedVis.data
      : null;

  if (!question) return null;
  const badge =
    inferAudioAnswerTarget(question) === 'track'
      ? t(locale, 'studio.audio.badgeTrack')
      : t(locale, 'studio.audio.badgeArtist');
  const options = question.options.slice(0, 4);

  return (
    <div className="studio-audio-device-preview" dir="rtl">
      <span className="studio-audio-device-title">
        {t(locale, 'studio.audio.title')}
      </span>
      <span className="studio-audio-device-prompt">{question.questionAr}</span>
      <span className="studio-audio-badge">{badge}</span>
      {question.audioAssetId ? (
        <StudioAudioClipPreview
          assetId={question.audioAssetId}
          durationMs={question.audioDurationMs}
          visualization={vis}
          waveformHeight={48}
          equalizerHeight={56}
        />
      ) : null}
      <div className="studio-audio-device-options">
        {options.map((option) => (
          <span
            key={option.key}
            className={
              option.key === question.correctOptionKey
                ? 'studio-audio-device-option is-correct'
                : 'studio-audio-device-option'
            }
          >
            {option.ar}
          </span>
        ))}
      </div>
      <span className="studio-audio-admin-flag">
        {t(locale, 'studio.field.fp.audioMcCorrectVisible')}
      </span>
    </div>
  );
}

export function DevicePreviewFrame({
  locale,
  challengeTitle,
  instructionAr,
  durationMs,
  engineId,
  clientConfig,
  serverConfig,
  requiredAssetIds = [],
}: DevicePreviewFrameProps) {
  const [activeState, setActiveState] = useState<PreviewState>('intro');

  const imageIds = useMemo(
    () => collectImageAssetIds(clientConfig, requiredAssetIds, serverConfig).slice(0, 6),
    [clientConfig, serverConfig, requiredAssetIds],
  );

  const hasChallenge = Boolean(challengeTitle || instructionAr || imageIds.length > 0);

  return (
    <div className="device-preview-frame">
      <div className="device-preview-tabs">
        {PREVIEW_STATES.map((state) => (
          <button
            key={state}
            type="button"
            aria-pressed={activeState === state ? 'true' : 'false'}
            onClick={() => setActiveState(state)}
          >
            {t(locale, STATE_LABEL_KEYS[state])}
          </button>
        ))}
      </div>

      <div className="device-preview-chrome">
        <div className="device-preview-notch">
          <div className="device-preview-notch-pill" />
        </div>

        <div className="device-preview-screen">
          <div className="device-preview-test-badge">
            ● {t(locale, 'studio.preview.testData')}
          </div>

          {!hasChallenge ? (
            <p style={{ opacity: 0.5 }}>
              {t(locale, 'studio.preview.noChallenge')}
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', alignItems: 'center', width: '100%' }}>
              {engineId ? (
                <span style={{ fontSize: '0.7rem', opacity: 0.5, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  {engineId}
                </span>
              ) : null}

              {imageIds.length > 0 && (activeState === 'intro' || activeState === 'active') ? (
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: imageIds.length === 1 ? '1fr' : '1fr 1fr',
                    gap: 8,
                    width: '100%',
                    justifyItems: 'center',
                  }}
                >
                  {imageIds.map((id) => (
                    <AssetThumb key={id} assetId={id} size={imageIds.length === 1 ? 160 : 96} />
                  ))}
                </div>
              ) : null}

              {engineId === 'audio.multiple_choice' &&
              (activeState === 'intro' || activeState === 'active') ? (
                <AudioDevicePreview
                  locale={locale}
                  clientConfig={clientConfig}
                  serverConfig={serverConfig}
                />
              ) : null}

              {activeState === 'intro' || activeState === 'active' ? (
                <>
                  <span style={{ fontSize: '1.05rem', fontWeight: 700, textAlign: 'center' }}>
                    {instructionAr || challengeTitle}
                  </span>
                  {durationMs ? (
                    <span style={{ fontSize: '0.8rem', opacity: 0.65 }}>
                      {(durationMs / 1000).toFixed(0)}s
                    </span>
                  ) : null}
                </>
              ) : null}

              {activeState === 'success' ? (
                <span style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--lh-success, #3d8)' }}>
                  {t(locale, 'studio.preview.success')}
                </span>
              ) : null}
              {activeState === 'failure' ? (
                <span style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--lh-danger, #c45)' }}>
                  {t(locale, 'studio.preview.failure')}
                </span>
              ) : null}
              {activeState === 'timeout' ? (
                <span style={{ fontSize: '1.1rem', fontWeight: 700 }}>
                  {t(locale, 'studio.preview.timeout')}
                </span>
              ) : null}
              {activeState === 'unsupported' ? (
                <span style={{ fontSize: '0.9rem', opacity: 0.7, textAlign: 'center' }}>
                  {t(locale, 'studio.preview.unsupported')}
                </span>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
