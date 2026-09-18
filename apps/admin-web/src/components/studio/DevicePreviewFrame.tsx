'use client';

import { useEffect, useMemo, useState } from 'react';
import { t } from '@/i18n/get-dictionary';
import type { Locale } from '@/i18n/locale';
import type { MessageKey } from '@/i18n/messages/en';
import { previewLaserRoutingPuzzle } from '@thelastheart/contracts';
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

function LaserDevicePreview({
  locale,
  durationMs,
  clientConfig,
  serverConfig,
  showSolution,
}: {
  locale: Locale;
  durationMs?: number;
  clientConfig?: Record<string, unknown>;
  serverConfig?: Record<string, unknown>;
  showSolution: boolean;
}) {
  const preview = useMemo(() => {
    try {
      return previewLaserRoutingPuzzle({
        seed:
          typeof serverConfig?.seed === 'number' ? serverConfig.seed : 4242,
        serverConfig: serverConfig ?? {},
        challengeDurationMs: durationMs ?? 15_000,
      });
    } catch {
      return null;
    }
  }, [serverConfig, durationMs]);

  if (!preview) {
    return (
      <span style={{ fontSize: '0.8rem', opacity: 0.7 }}>
        {t(locale, 'studio.preview.laserInvalid')}
      </span>
    );
  }

  const board = showSolution ? preview.solvedBoard : preview.board;
  const traces = showSolution ? preview.solvedTraces : preview.traces;
  const titleKey =
    (clientConfig?.titleKey as string | undefined) ??
    `challenge.laser.${preview.variant}.title`;
  const cellSize = Math.max(18, Math.min(36, 180 / Math.max(board.width, board.height)));

  return (
    <div dir="rtl" style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center' }}>
      <span style={{ fontSize: '0.95rem', fontWeight: 700 }}>{titleKey}</span>
      <div
        style={{
          position: 'relative',
          width: board.width * cellSize,
          height: board.height * cellSize,
          background: '#04111f',
          border: '1px solid #3ce7ff88',
          borderRadius: 12,
        }}
      >
        {Array.from({ length: board.height * board.width }, (_, i) => {
          const row = Math.floor(i / board.width);
          const col = i % board.width;
          return (
            <span
              key={`${row}:${col}`}
              style={{
                position: 'absolute',
                left: col * cellSize,
                top: row * cellSize,
                width: cellSize,
                height: cellSize,
                boxShadow: 'inset 0 0 0 1px #1c6c8a44',
              }}
            />
          );
        })}
        {traces.flatMap((trace, ti) =>
          trace.cells.slice(0, -1).map((cell, i) => {
            const next = trace.cells[i + 1]!;
            const x1 = (cell.col + 0.5) * cellSize;
            const y1 = (cell.row + 0.5) * cellSize;
            const x2 = (next.col + 0.5) * cellSize;
            const y2 = (next.row + 0.5) * cellSize;
            const color =
              trace.color === 'amber'
                ? '#ffb14a'
                : trace.color === 'fused'
                  ? '#e8fbff'
                  : '#3ce7ff';
            return (
              <span
                key={`${ti}-${i}`}
                style={{
                  position: 'absolute',
                  left: Math.min(x1, x2) - 1,
                  top: Math.min(y1, y2) - 1,
                  width: Math.max(2, Math.abs(x2 - x1) + 2),
                  height: Math.max(2, Math.abs(y2 - y1) + 2),
                  background: color,
                  boxShadow: `0 0 6px ${color}`,
                }}
              />
            );
          }),
        )}
        {board.components.map((component) => {
          const glyph =
            component.kind === 'heart'
              ? '♥'
              : component.kind === 'mirror'
                ? component.orientation === 'backslash'
                  ? '\\'
                  : '/'
                : component.kind === 'gate'
                  ? component.axis === 'vertical'
                    ? '▮'
                    : '▬'
                  : component.kind === 'combiner'
                    ? '◆'
                    : component.kind === 'source'
                      ? '◎'
                      : '·';
          return (
            <span
              key={component.id}
              style={{
                position: 'absolute',
                left: component.col * cellSize,
                top: component.row * cellSize,
                width: cellSize,
                height: cellSize,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color:
                  component.kind === 'heart'
                    ? '#ff4e8c'
                    : component.color === 'amber'
                      ? '#ffb14a'
                      : '#9ed4e6',
                fontSize: cellSize * 0.55,
                fontWeight: 700,
              }}
            >
              {glyph}
            </span>
          );
        })}
      </div>
      <span style={{ fontSize: '0.72rem', opacity: 0.75 }}>
        {t(locale, 'studio.preview.laserStats')
          .replace('{moves}', String(preview.minimumMoves))
          .replace('{solvable}', preview.solvable ? '✓' : '✗')
          .replace('{unique}', preview.unique ? '✓' : '✗')}
      </span>
      {showSolution ? (
        <span style={{ fontSize: '0.7rem', color: '#3ce7ff' }}>
          {t(locale, 'studio.preview.laserSolution')}
        </span>
      ) : null}
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

  const hasChallenge = Boolean(
    challengeTitle ||
      instructionAr ||
      imageIds.length > 0 ||
      engineId === 'laser.routing',
  );

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

              {engineId === 'laser.routing' &&
              (activeState === 'intro' ||
                activeState === 'active' ||
                activeState === 'success') ? (
                <LaserDevicePreview
                  locale={locale}
                  durationMs={durationMs}
                  clientConfig={clientConfig}
                  serverConfig={serverConfig}
                  showSolution={activeState === 'success'}
                />
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
