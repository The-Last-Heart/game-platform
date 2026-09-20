'use client';

import { useEffect, useMemo, useState, type CSSProperties } from 'react';
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
import { parseCommonWordBank } from './common-word-question';
import { parseSymbolCipherBank } from './symbol-cipher-question';
import { parseThreeDoorsBank, statementPreview } from './three-doors-question';
import { parseVerticalReflectionBank } from './vertical-reflection-question';
import {
  THREE_DOORS_TITLE_COPY,
  VERTICAL_REFLECTION_INSTRUCTION_COPY,
  VERTICAL_REFLECTION_TITLE_COPY,
  threeDoorsInstructionText,
} from '@thelastheart/contracts';

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
        cache: 'no-store',
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

function CommonWordDevicePreview({
  locale,
  durationMs,
  serverConfig,
  activeState,
}: {
  locale: Locale;
  durationMs?: number;
  serverConfig?: Record<string, unknown>;
  activeState: PreviewState;
}) {
  const bank = parseCommonWordBank(serverConfig ?? {});
  const question = bank.questions[0]!;
  const correctLabel =
    question.options.find((o) => o.key === question.correctOptionKey)?.ar ??
    question.correctOptionKey;
  const seconds = durationMs ? (durationMs / 1000).toFixed(0) : '—';

  return (
    <div
      dir="rtl"
      style={{
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        alignItems: 'center',
        background:
          'radial-gradient(ellipse at 50% 20%, #0a1a2e 0%, #050c18 70%)',
        borderRadius: 12,
        padding: '12px 10px',
        border: '1px solid rgba(80, 227, 254, 0.25)',
      }}
    >
      <span style={{ fontSize: '0.7rem', color: '#50e3fe' }}>
        {seconds}s · {t(locale, 'studio.preview.active')}
      </span>
      <span
        style={{
          fontSize: '1.15rem',
          fontWeight: 700,
          color: '#d4af37',
          textAlign: 'center',
        }}
      >
        {bank.titleAr}
      </span>
      <span
        style={{
          fontSize: '0.78rem',
          color: '#e8f4ff',
          textAlign: 'center',
          opacity: 0.9,
        }}
      >
        {bank.instructionAr}
      </span>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr auto 1fr',
          gridTemplateRows: 'auto auto',
          gap: 6,
          width: '100%',
          alignItems: 'center',
          justifyItems: 'center',
        }}
      >
        <div style={{ gridColumn: '2', ...cwCardStyle }}>{question.clues[0].textAr || '—'}</div>
        <div style={{ gridColumn: '1', gridRow: '2', ...cwCardStyle }}>
          {question.clues[1].textAr || '—'}
        </div>
        <div
          style={{
            gridColumn: '2',
            gridRow: '2',
            width: 36,
            height: 36,
            borderRadius: '50%',
            border: '1.5px solid #d4af37',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#d4af37',
            fontWeight: 700,
            boxShadow: '0 0 12px rgba(80,227,254,0.35)',
            background: '#071018',
          }}
        >
          {activeState === 'success' ? correctLabel.slice(0, 4) : '?'}
        </div>
        <div style={{ gridColumn: '3', gridRow: '2', ...cwCardStyle }}>
          {question.clues[2].textAr || '—'}
        </div>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 6,
          width: '100%',
        }}
      >
        {question.options.map((opt) => {
          const isCorrect = opt.key === question.correctOptionKey;
          const showCorrect =
            (activeState === 'success' || activeState === 'failure') && isCorrect;
          const showWrong =
            activeState === 'failure' && !isCorrect && opt === question.options[0];
          return (
            <div
              key={opt.key}
              style={{
                ...cwCardStyle,
                borderColor: showCorrect
                  ? '#22e7f2'
                  : showWrong
                    ? '#ff5365'
                    : 'rgba(80,227,254,0.45)',
                color: '#f7fafc',
              }}
            >
              {opt.ar || '—'}
              {showCorrect ? (
                <span style={{ fontSize: '0.65rem', color: '#22e7f2' }}> ✓</span>
              ) : null}
            </div>
          );
        })}
      </div>

      <div
        style={{
          width: '100%',
          marginTop: 4,
          padding: 8,
          borderRadius: 8,
          background: 'rgba(0,0,0,0.35)',
          border: '1px dashed rgba(212,175,55,0.4)',
        }}
      >
        <div style={{ fontSize: '0.65rem', color: '#d4af37', marginBottom: 4 }}>
          {t(locale, 'studio.field.fp.commonWordRelationshipHint' as MessageKey)}
        </div>
        {question.clues.map((clue) => (
          <div
            key={clue.clueId}
            style={{ fontSize: '0.7rem', color: '#c5d4e2', marginBottom: 2 }}
          >
            {clue.textAr || '—'} → {clue.relationshipAr || '—'}
          </div>
        ))}
      </div>
    </div>
  );
}

function SymbolCipherDevicePreview({
  locale,
  durationMs,
  serverConfig,
  activeState,
}: {
  locale: Locale;
  durationMs?: number;
  serverConfig?: Record<string, unknown>;
  activeState: PreviewState;
}) {
  const bank = parseSymbolCipherBank(serverConfig ?? {});
  const question = bank.questions[0]!;
  const correctLabel =
    question.options.find((o) => o.key === question.correctOptionKey)?.ar ??
    question.answerDisplayText;
  const seconds = durationMs ? (durationMs / 1000).toFixed(0) : '—';
  const encoded = question.mappings
    .filter((m) => !m.isDecoy)
    .map((m) => m.symbolId || '?')
    .join(' · ');

  return (
    <div
      dir="rtl"
      style={{
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        alignItems: 'center',
        background:
          'radial-gradient(ellipse at 50% 30%, #0a1a2e 0%, #050c18 75%)',
        borderRadius: 12,
        padding: '12px 10px',
        border: '1px solid rgba(224, 193, 90, 0.35)',
      }}
    >
      <span style={{ fontSize: '0.7rem', color: '#50e3fe' }}>
        {seconds}s · {t(locale, 'studio.preview.active')}
      </span>
      <span
        style={{
          fontSize: '1.15rem',
          fontWeight: 700,
          color: '#d4af37',
          textAlign: 'center',
        }}
      >
        {bank.titleAr}
      </span>
      <span style={{ fontSize: '0.78rem', color: '#f5f0e6', textAlign: 'center' }}>
        {bank.instructionAr}
      </span>
      <div
        style={{
          display: 'flex',
          gap: 4,
          width: '100%',
          justifyContent: 'space-between',
        }}
      >
        {question.mappings.map((m, i) => (
          <div
            key={`${m.symbolId}-${i}`}
            style={{
              flex: 1,
              textAlign: 'center',
              fontSize: '0.65rem',
              padding: 4,
              borderRadius: 6,
              border: '1px solid rgba(80,227,254,0.4)',
              color: '#f7fafc',
              background: 'rgba(7,16,28,0.85)',
            }}
          >
            <div>{m.symbolId || '—'}</div>
            <div style={{ fontWeight: 700 }}>{m.letter || '—'}</div>
          </div>
        ))}
      </div>
      <div
        style={{
          width: '100%',
          textAlign: 'center',
          fontSize: '0.75rem',
          color: '#9af6ff',
          padding: 8,
          borderRadius: 8,
          border: '1px solid rgba(212,175,55,0.45)',
          background: 'rgba(7,16,28,0.9)',
        }}
      >
        {encoded || '·····'}
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 6,
          width: '100%',
        }}
      >
        {question.options.map((opt) => {
          const isCorrect = opt.key === question.correctOptionKey;
          const showCorrect =
            (activeState === 'success' || activeState === 'failure') &&
            isCorrect;
          return (
            <div
              key={opt.key}
              style={{
                textAlign: 'center',
                padding: '8px 4px',
                borderRadius: 8,
                border: `1px solid ${
                  showCorrect ? '#22e7f2' : 'rgba(224,193,90,0.55)'
                }`,
                color: '#f7fafc',
                background: 'linear-gradient(#0c1a2e, #060e1a)',
                fontWeight: 700,
              }}
            >
              {opt.ar || '—'}
              {showCorrect ? (
                <span style={{ fontSize: '0.65rem', color: '#22e7f2' }}> ✓</span>
              ) : null}
            </div>
          );
        })}
      </div>
      <div
        style={{
          width: '100%',
          marginTop: 2,
          padding: 8,
          borderRadius: 8,
          background: 'rgba(0,0,0,0.35)',
          border: '1px dashed rgba(212,175,55,0.4)',
          fontSize: '0.7rem',
          color: '#d4af37',
          textAlign: 'center',
        }}
      >
        {/* Admin-only correct answer marker — never in player payloads */}
        ✓ {correctLabel}
      </div>
    </div>
  );
}

function ThreeDoorsDevicePreview({
  locale,
  durationMs,
  serverConfig,
  activeState,
}: {
  locale: Locale;
  durationMs?: number;
  serverConfig?: Record<string, unknown>;
  activeState: PreviewState;
}) {
  const bank = parseThreeDoorsBank(serverConfig ?? {});
  const question = bank.questions[0]!;
  const seconds = durationMs ? (durationMs / 1000).toFixed(0) : '—';
  const copyLocale = locale === 'ar' ? 'ar' : 'en';
  const selected =
    activeState === 'success' || activeState === 'failure'
      ? question.correctDoorId
      : null;

  return (
    <div
      dir="rtl"
      style={{
        width: '100%',
        position: 'relative',
        borderRadius: 12,
        overflow: 'hidden',
        border: '1px solid rgba(80, 227, 254, 0.25)',
        background: '#050c18',
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/studio/three_doors_room.jpg"
        alt=""
        style={{ width: '100%', display: 'block', opacity: activeState === 'timeout' ? 0.55 : 1 }}
      />
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          padding: '8px 6px 10px',
          gap: 4,
          pointerEvents: 'none',
        }}
      >
        <span style={{ fontSize: '0.65rem', color: '#d4af37' }}>
          {seconds}s
        </span>
        <span style={{ fontSize: '1rem', fontWeight: 700, color: '#d4af37' }}>
          {THREE_DOORS_TITLE_COPY[copyLocale]}
        </span>
        <span style={{ fontSize: '0.68rem', color: '#f0e6c8', textAlign: 'center' }}>
          {threeDoorsInstructionText(question.truthRule, copyLocale)}
        </span>
        <div
          style={{
            marginTop: 'auto',
            display: 'grid',
            gridTemplateColumns: '1fr 1fr 1fr',
            gap: 4,
            width: '92%',
            marginBottom: '18%',
          }}
        >
          {question.statements.map((statement) => (
            <div
              key={statement.doorId}
              style={{
                textAlign: 'center',
                fontSize: '0.58rem',
                color: '#f7fafc',
                lineHeight: 1.25,
                textShadow: '0 1px 2px rgba(0,0,0,0.85)',
              }}
            >
              <div style={{ color: '#d4af37', fontWeight: 700, marginBottom: 2 }}>
                {statement.doorId}
              </div>
              {statementPreview(statement.predicate, copyLocale)}
            </div>
          ))}
        </div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr 1fr',
            gap: 6,
            width: '90%',
          }}
        >
          {(['A', 'B', 'C'] as const).map((id) => {
            const isSelected = selected === id;
            const ok = activeState === 'success' && isSelected;
            const bad = activeState === 'failure' && isSelected;
            return (
              <div
                key={id}
                style={{
                  textAlign: 'center',
                  padding: '6px 0',
                  borderRadius: 999,
                  border: `1px solid ${ok ? '#50e3fe' : bad ? '#e85d4c' : '#d4af37'}`,
                  color: ok ? '#50e3fe' : bad ? '#e85d4c' : '#d4af37',
                  background: 'rgba(8,16,32,0.75)',
                  fontWeight: 700,
                  opacity: activeState === 'timeout' ? 0.45 : 1,
                }}
              >
                {id}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

const cwCardStyle: CSSProperties = {
  width: '100%',
  minHeight: 28,
  padding: '6px 8px',
  borderRadius: 8,
  border: '1px solid rgba(212,175,55,0.55)',
  background: 'linear-gradient(180deg, rgba(12,28,48,0.95), rgba(5,12,24,0.98))',
  textAlign: 'center',
  fontSize: '0.78rem',
  color: '#f7fafc',
};

function VerticalReflectionDevicePreview({
  locale,
  durationMs,
  serverConfig,
  clientConfig,
  activeState,
}: {
  locale: Locale;
  durationMs?: number;
  serverConfig?: Record<string, unknown>;
  clientConfig?: Record<string, unknown>;
  activeState: PreviewState;
}) {
  const bank = parseVerticalReflectionBank(serverConfig ?? {});
  const wantedId =
    typeof clientConfig?.questionId === 'string'
      ? clientConfig.questionId
      : null;
  const question =
    (wantedId
      ? bank.questions.find((q) => q.questionId === wantedId)
      : null) ?? bank.questions[0];
  if (!question) return null;
  const seconds = durationMs ? (durationMs / 1000).toFixed(0) : '—';
  const copyLocale = locale === 'ar' ? 'ar' : 'en';
  const dimmed = activeState === 'timeout';
  const title =
    typeof clientConfig?.titleText === 'string' && clientConfig.titleText
      ? clientConfig.titleText
      : question.titleAr || VERTICAL_REFLECTION_TITLE_COPY[copyLocale];
  const instruction =
    typeof clientConfig?.instructionText === 'string' &&
    clientConfig.instructionText
      ? clientConfig.instructionText
      : question.instructionAr ||
        VERTICAL_REFLECTION_INSTRUCTION_COPY[copyLocale];

  function map(
    x: number,
    y: number,
    frame: { x0: number; y0: number; w: number; h: number },
  ) {
    return {
      x: frame.x0 + x * frame.w,
      y: frame.y0 + y * frame.h,
    };
  }

  function markerFill(role: string): string {
    if (role === 'primary') return '#FF5365';
    if (role === 'secondary') return '#22E7F2';
    return '#FFC247';
  }

  function renderShape(
    shape: (typeof question)['sourceShape'],
    frame: { x0: number; y0: number; w: number; h: number },
    keyPrefix: string,
  ) {
    return (
      <g opacity={dimmed ? 0.45 : 1}>
        {shape.polygons.map((poly, i) => (
          <polygon
            key={`${keyPrefix}-p-${i}`}
            points={poly.points
              .map((p) => {
                const m = map(p.x, p.y, frame);
                return `${m.x},${m.y}`;
              })
              .join(' ')}
            fill="rgba(34,231,242,0.16)"
            stroke="#22E7F2"
            strokeWidth={1.6}
            strokeLinejoin="round"
          />
        ))}
        {shape.markers.map((m) => {
          const c = map(m.center.x, m.center.y, frame);
          const r = Math.max(2, m.size * Math.min(frame.w, frame.h));
          const fill = markerFill(m.colorRole);
          if (m.type === 'ring') {
            return (
              <circle
                key={`${keyPrefix}-${m.id}`}
                cx={c.x}
                cy={c.y}
                r={r}
                fill="none"
                stroke={fill}
                strokeWidth={1.6}
              />
            );
          }
          if (m.type === 'short_line') {
            return (
              <line
                key={`${keyPrefix}-${m.id}`}
                x1={c.x - r}
                y1={c.y}
                x2={c.x + r}
                y2={c.y}
                stroke={fill}
                strokeWidth={2}
                strokeLinecap="round"
              />
            );
          }
          if (m.type === 'small_triangle') {
            return (
              <polygon
                key={`${keyPrefix}-${m.id}`}
                points={`${c.x},${c.y - r} ${c.x + r * 0.9},${c.y + r * 0.7} ${c.x - r * 0.9},${c.y + r * 0.7}`}
                fill={fill}
              />
            );
          }
          return (
            <circle
              key={`${keyPrefix}-${m.id}`}
              cx={c.x}
              cy={c.y}
              r={r}
              fill={fill}
            />
          );
        })}
      </g>
    );
  }

  const mid = 50;
  const sourceSide = question.sourceSide === 'right' ? 'right' : 'left';
  const halfBounds =
    sourceSide === 'right'
      ? { x0: mid + 4, y0: 8, w: mid - 10, h: 56 }
      : { x0: 4, y0: 8, w: mid - 10, h: 56 };
  const side = Math.min(halfBounds.w, halfBounds.h);
  const sourceFrame = {
    x0: halfBounds.x0 + (halfBounds.w - side) / 2,
    y0: halfBounds.y0 + (halfBounds.h - side) / 2,
    w: side,
    h: side,
  };

  return (
    <div
      dir="rtl"
      style={{
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        alignItems: 'center',
      }}
    >
      <span style={{ fontSize: '0.7rem', color: '#22E7F2' }}>{seconds}s</span>
      <span style={{ fontSize: '0.95rem', fontWeight: 700, color: '#f7fafc' }}>
        {title}
      </span>
      <span
        style={{
          fontSize: '0.68rem',
          color: '#93a4b5',
          textAlign: 'center',
          lineHeight: 1.3,
        }}
      >
        {instruction}
      </span>
      <svg
        viewBox="0 0 100 72"
        width="100%"
        style={{
          borderRadius: 10,
          border: '1px solid rgba(34,231,242,0.28)',
          background: 'linear-gradient(180deg, #0b1d2d 0%, #071522 100%)',
        }}
      >
        <line
          x1={mid}
          y1="8"
          x2={mid}
          y2="64"
          stroke="rgba(34,231,242,0.75)"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
        <circle cx={mid} cy="8" r="1.8" fill="#22E7F2" />
        <circle cx={mid} cy="64" r="1.8" fill="#22E7F2" />
        {renderShape(question.sourceShape, sourceFrame, 'src')}
      </svg>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 6,
          width: '100%',
        }}
      >
        {question.candidates.slice(0, 4).map((c) => {
          const isCorrect = c.id === question.correctCandidateId;
          const showMark =
            activeState === 'success' && isCorrect
              ? 'success'
              : activeState === 'failure' && isCorrect
                ? 'reveal'
                : null;
          return (
            <div
              key={c.id}
              style={{
                height: 56,
                borderRadius: 8,
                border:
                  showMark === 'success'
                    ? '1.5px solid #22E7F2'
                    : showMark === 'reveal'
                      ? '1.5px solid rgba(34,231,242,0.45)'
                      : '1px solid rgba(29,58,80,0.95)',
                background: '#071522',
                overflow: 'hidden',
              }}
            >
              <svg viewBox="0 0 100 100" width="100%" height="100%">
                {renderShape(c.shape, { x0: 12, y0: 12, w: 76, h: 76 }, c.id)}
              </svg>
            </div>
          );
        })}
      </div>
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
      engineId === 'laser.routing' ||
      engineId === 'trivia.common_word' ||
      engineId === 'trivia.symbol_cipher_word' ||
      engineId === 'logic.three_doors' ||
      engineId === 'focus.vertical_reflection',
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

              {engineId === 'trivia.common_word' ? (
                <CommonWordDevicePreview
                  locale={locale}
                  durationMs={durationMs}
                  serverConfig={serverConfig}
                  activeState={activeState}
                />
              ) : null}

              {engineId === 'trivia.symbol_cipher_word' ? (
                <SymbolCipherDevicePreview
                  locale={locale}
                  durationMs={durationMs}
                  serverConfig={serverConfig}
                  activeState={activeState}
                />
              ) : null}

              {engineId === 'logic.three_doors' ? (
                <ThreeDoorsDevicePreview
                  locale={locale}
                  durationMs={durationMs}
                  serverConfig={serverConfig}
                  activeState={activeState}
                />
              ) : null}

              {engineId === 'focus.vertical_reflection' ? (
                <VerticalReflectionDevicePreview
                  locale={locale}
                  durationMs={durationMs}
                  serverConfig={serverConfig}
                  clientConfig={clientConfig}
                  activeState={activeState}
                />
              ) : null}

              {engineId !== 'trivia.common_word' &&
                engineId !== 'trivia.symbol_cipher_word' &&
                engineId !== 'logic.three_doors' &&
                engineId !== 'focus.vertical_reflection' &&
              (activeState === 'intro' || activeState === 'active') ? (
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
