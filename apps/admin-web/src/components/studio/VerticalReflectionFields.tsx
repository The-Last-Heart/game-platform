'use client';

import { useMemo, useState } from 'react';
import { type VerticalReflectionTemplateId } from '@thelastheart/contracts';
import { t } from '@/i18n/get-dictionary';
import type { Locale } from '@/i18n/locale';
import type { MessageKey } from '@/i18n/messages/en';
import {
  FieldGroup,
  FieldInput,
  FieldSelect,
  readFieldInputValue,
} from './Field';
import {
  availableVerticalReflectionTemplates,
  createVerticalReflectionQuestion,
  defaultVerticalReflectionBank,
  duplicateVerticalReflectionQuestion,
  parseVerticalReflectionBank,
  regenerateVerticalReflectionQuestion,
  serializeVerticalReflectionBank,
  verticalReflectionClientPreview,
  verticalReflectionPublishIssues,
  type VerticalReflectionStudioBank,
  type VerticalReflectionStudioQuestion,
} from './vertical-reflection-question';

type Props = {
  locale: Locale;
  clientConfig: Record<string, unknown>;
  serverConfig: Record<string, unknown>;
  onClientChange: (next: Record<string, unknown>) => void;
  onServerChange: (next: Record<string, unknown>) => void;
  disabled?: boolean;
};

type ShapeModel = VerticalReflectionStudioQuestion['sourceShape'];

const STROKE = '#22E7F2';
const FILL = 'rgba(34,231,242,0.18)';
const ACCENT = '#FFC247';
const PRIMARY = '#FF5365';
const AXIS = '#22E7F2';

const TEMPLATE_LABELS: Record<
  VerticalReflectionTemplateId,
  { ar: string; en: string }
> = {
  asymmetric_arrow_notch: { ar: 'سهم محزّز', en: 'Notched arrow' },
  stepped_polygon: { ar: 'مضلع مدرّج', en: 'Stepped polygon' },
  key_silhouette: { ar: 'مفتاح', en: 'Key silhouette' },
  irregular_flag: { ar: 'راية غير منتظمة', en: 'Irregular flag' },
  asymmetric_shield: { ar: 'درع غير متماثل', en: 'Asymmetric shield' },
  lightning_zigzag: { ar: 'برق متعرج', en: 'Lightning zigzag' },
  boot_hook: { ar: 'حذاء / خطاف', en: 'Boot / hook' },
  offset_chevron: { ar: 'شيفرون مزاح', en: 'Offset chevron' },
  l_block_notch: { ar: 'كتلة L محزّزة', en: 'L-block with notch' },
  irregular_crown: { ar: 'تاج غير منتظم', en: 'Irregular crown' },
  mechanical_plate: { ar: 'لوحة ميكانيكية', en: 'Mechanical plate' },
  maze_silhouette: { ar: 'متاهة', en: 'Maze silhouette' },
  fish_abstract: { ar: 'شكل سمكة', en: 'Abstract fish' },
  hand_silhouette: { ar: 'يد هندسية', en: 'Geometric hand' },
  crystal_concave: { ar: 'بلورة مقعّرة', en: 'Concave crystal' },
};

function lbl(locale: Locale, key: MessageKey): string {
  try {
    return t(locale, key);
  } catch {
    return key;
  }
}

function templateLabel(
  locale: Locale,
  id: VerticalReflectionTemplateId,
): string {
  const entry = TEMPLATE_LABELS[id];
  return locale === 'ar' ? entry.ar : entry.en;
}

function markerFill(role: string): string {
  if (role === 'primary') return PRIMARY;
  if (role === 'secondary') return STROKE;
  return ACCENT;
}

function mapPoint(
  x: number,
  y: number,
  frame: { x0: number; y0: number; w: number; h: number },
) {
  return { x: frame.x0 + x * frame.w, y: frame.y0 + y * frame.h };
}

/** Keep unit-square aspect inside a (possibly tall/wide) half-board frame. */
function squareFrame(bounds: {
  x0: number;
  y0: number;
  w: number;
  h: number;
}): { x0: number; y0: number; w: number; h: number } {
  const side = Math.min(bounds.w, bounds.h);
  return {
    x0: bounds.x0 + (bounds.w - side) / 2,
    y0: bounds.y0 + (bounds.h - side) / 2,
    w: side,
    h: side,
  };
}

function ShapeGeometry({
  shape,
  frame,
  strokeWidth = 1.8,
}: {
  shape: ShapeModel;
  frame: { x0: number; y0: number; w: number; h: number };
  strokeWidth?: number;
}) {
  return (
    <g>
      {shape.polygons.map((poly, i) => (
        <polygon
          key={`p-${i}`}
          points={poly.points
            .map((p) => {
              const m = mapPoint(p.x, p.y, frame);
              return `${m.x},${m.y}`;
            })
            .join(' ')}
          fill={FILL}
          stroke={STROKE}
          strokeWidth={strokeWidth}
          strokeLinejoin="round"
        />
      ))}
      {shape.markers.map((m) => {
        const c = mapPoint(m.center.x, m.center.y, frame);
        const r = Math.max(2.4, m.size * Math.min(frame.w, frame.h));
        const fill = markerFill(m.colorRole);
        if (m.type === 'ring') {
          return (
            <circle
              key={m.id}
              cx={c.x}
              cy={c.y}
              r={r}
              fill="none"
              stroke={fill}
              strokeWidth={1.8}
            />
          );
        }
        if (m.type === 'short_line') {
          return (
            <line
              key={m.id}
              x1={c.x - r}
              y1={c.y}
              x2={c.x + r}
              y2={c.y}
              stroke={fill}
              strokeWidth={2.2}
              strokeLinecap="round"
            />
          );
        }
        if (m.type === 'small_triangle') {
          return (
            <polygon
              key={m.id}
              points={`${c.x},${c.y - r} ${c.x + r * 0.9},${c.y + r * 0.7} ${c.x - r * 0.9},${c.y + r * 0.7}`}
              fill={fill}
            />
          );
        }
        return <circle key={m.id} cx={c.x} cy={c.y} r={r} fill={fill} />;
      })}
    </g>
  );
}

function PuzzleBoardPreview({
  shape,
  sourceSide,
  emptyHint,
}: {
  shape: ShapeModel;
  sourceSide: 'left' | 'right';
  emptyHint: string;
}) {
  const pad = 7;
  const mid = 50;
  const halfBounds =
    sourceSide === 'right'
      ? { x0: mid + pad, y0: pad + 2, w: mid - pad * 2, h: 100 - pad * 2 - 4 }
      : { x0: pad, y0: pad + 2, w: mid - pad * 2, h: 100 - pad * 2 - 4 };
  const sourceFrame = squareFrame(halfBounds);
  const emptyCx = sourceSide === 'left' ? 75 : 25;

  return (
    <svg
      className="studio-vr-board-svg"
      viewBox="0 0 100 100"
      role="img"
      aria-label="Puzzle board"
    >
      <defs>
        <linearGradient id="vrBoardBg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#0b1d2d" />
          <stop offset="100%" stopColor="#071522" />
        </linearGradient>
      </defs>
      <rect
        x="0.5"
        y="0.5"
        width="99"
        height="99"
        rx="10"
        fill="url(#vrBoardBg)"
        stroke="rgba(34,231,242,0.28)"
        strokeWidth="1.2"
      />
      <line
        x1={mid}
        y1="10"
        x2={mid}
        y2="90"
        stroke={AXIS}
        strokeWidth="1.8"
        strokeLinecap="round"
        opacity={0.85}
      />
      <circle cx={mid} cy="10" r="2.4" fill={AXIS} />
      <circle cx={mid} cy="90" r="2.4" fill={AXIS} />
      <ShapeGeometry shape={shape} frame={sourceFrame} strokeWidth={2} />
      <text
        x={emptyCx}
        y="52"
        textAnchor="middle"
        fill="rgba(147,164,181,0.45)"
        fontSize="5.2"
        fontFamily="var(--lh-font-sans), system-ui, sans-serif"
      >
        {emptyHint}
      </text>
    </svg>
  );
}

function CandidateThumb({
  shape,
  correct,
  correctLabel,
  indexLabel,
}: {
  shape: ShapeModel;
  correct?: boolean;
  correctLabel?: string;
  indexLabel: string;
}) {
  const frame = squareFrame({ x0: 8, y0: 10, w: 84, h: 80 });
  return (
    <div
      className={`studio-vr-option${correct ? ' is-correct' : ''}`}
      data-correct={correct ? 'true' : 'false'}
    >
      <span className="studio-vr-option-index">{indexLabel}</span>
      {correct && correctLabel ? (
        <span className="studio-vr-option-badge">{correctLabel}</span>
      ) : null}
      <svg viewBox="0 0 100 100" aria-hidden>
        <ShapeGeometry shape={shape} frame={frame} />
      </svg>
    </div>
  );
}

export function VerticalReflectionFields({
  locale,
  clientConfig,
  serverConfig,
  onClientChange,
  onServerChange,
  disabled,
}: Props) {
  const parsed = useMemo(
    () => parseVerticalReflectionBank(serverConfig),
    [serverConfig],
  );
  const [bank, setBank] = useState(parsed);
  const [syncedKey, setSyncedKey] = useState(() =>
    JSON.stringify(serializeVerticalReflectionBank(parsed)),
  );
  const parsedKey = JSON.stringify(serializeVerticalReflectionBank(parsed));
  if (parsedKey !== syncedKey) {
    setSyncedKey(parsedKey);
    setBank(parsed);
  }

  const [activeIndex, setActiveIndex] = useState(0);
  const question =
    bank.questions[
      Math.min(activeIndex, Math.max(0, bank.questions.length - 1))
    ] ?? bank.questions[0];
  const templates = availableVerticalReflectionTemplates();

  function commit(next: VerticalReflectionStudioBank, nextIndex = activeIndex) {
    setBank(next);
    const serialized = serializeVerticalReflectionBank(next);
    onServerChange({
      ...serverConfig,
      ...serialized,
    });
    onClientChange(
      verticalReflectionClientPreview(
        next,
        {
          ...clientConfig,
          categoryKey: 'challenge.category.focus',
          promptKey: 'challenge.vertical_reflection.prompt',
          titleKey: 'challenge.vertical_reflection.title',
        },
        nextIndex,
        { adminDiagnostics: true },
      ),
    );
    setActiveIndex(nextIndex);
  }

  function updateQuestion(patch: Partial<VerticalReflectionStudioQuestion>) {
    if (!question) return;
    const questions = bank.questions.map((q, i) =>
      i === activeIndex ? { ...q, ...patch } : q,
    );
    commit({ questions });
  }

  if (!question) return null;

  const publishIssues = verticalReflectionPublishIssues(bank);
  const emptyHint = locale === 'ar' ? 'فارغ للاعب' : 'Empty for player';
  const optionLetters = ['A', 'B', 'C', 'D'];
  const templateOptions = templates.map((id) => ({
    value: id,
    label: `${templateLabel(locale, id)}`,
  }));
  const difficultyOptions = [
    { value: 'easy', label: locale === 'ar' ? 'سهل' : 'Easy' },
    { value: 'medium', label: locale === 'ar' ? 'متوسط' : 'Medium' },
    { value: 'hard', label: locale === 'ar' ? 'صعب' : 'Hard' },
  ];

  return (
    <div className="studio-vr">
      <p className="studio-section-lead">
        {lbl(locale, 'studio.field.fp.verticalReflectionLead')}
      </p>

      <section className="studio-vr-preview" aria-label="Admin preview">
        <div className="studio-vr-preview-head">
          <h3 className="studio-geo-map-title">
            {lbl(locale, 'studio.field.fp.verticalReflectionPreview')}
          </h3>
          <span className="studio-vr-preview-meta">
            {templateLabel(locale, question.templateId)} ·{' '}
            {question.candidates.length}{' '}
            {locale === 'ar' ? 'خيارات' : 'options'}
          </span>
        </div>

        <div className="studio-vr-preview-layout">
          <div className="studio-vr-board-wrap">
            <div className="studio-vr-kicker">
              {lbl(locale, 'studio.field.fp.verticalReflectionBoard')}
            </div>
            <PuzzleBoardPreview
              shape={question.sourceShape}
              sourceSide={question.sourceSide}
              emptyHint={emptyHint}
            />
            <p className="studio-vr-board-note">
              {lbl(locale, 'studio.field.fp.verticalReflectionEmptyHalf')}
            </p>
          </div>

          <div className="studio-vr-options-wrap">
            <div className="studio-vr-kicker">
              {locale === 'ar' ? 'الخيارات' : 'Candidates'}
            </div>
            <div className="studio-vr-options-grid">
              {question.candidates.map((c, index) => (
                <CandidateThumb
                  key={c.id}
                  shape={c.shape}
                  indexLabel={optionLetters[index] ?? String(index + 1)}
                  correct={c.id === question.correctCandidateId}
                  correctLabel={lbl(
                    locale,
                    'studio.field.fp.verticalReflectionCorrect',
                  )}
                />
              ))}
            </div>
          </div>
        </div>
      </section>

      <div className="studio-vr-bank">
        <div
          className="studio-segmented studio-vr-tabs"
          role="tablist"
          aria-label={lbl(locale, 'studio.field.fp.verticalReflectionQuestion')}
        >
          {bank.questions.map((q, index) => (
            <button
              key={q.questionId}
              type="button"
              role="tab"
              aria-selected={index === activeIndex}
              className={`studio-segmented-btn${index === activeIndex ? ' is-active' : ''}`}
              disabled={disabled}
              onClick={() => {
                setActiveIndex(index);
                onClientChange(
                  verticalReflectionClientPreview(bank, clientConfig, index, {
                    adminDiagnostics: true,
                  }),
                );
              }}
            >
              <span className="studio-vr-tab-label">
                {q.internalName && q.internalName !== q.templateId
                  ? q.internalName
                  : templateLabel(locale, q.templateId)}
              </span>
              <span
                className={`studio-three-doors-tab-dot${q.enabled ? ' is-ok' : ' is-bad'}`}
              />
            </button>
          ))}
        </div>
        <div className="studio-vr-bank-actions">
          <button
            type="button"
            className="btn btn-secondary"
            disabled={disabled}
            onClick={() => {
              const created = createVerticalReflectionQuestion(bank.questions);
              commit(
                { questions: [...bank.questions, created] },
                bank.questions.length,
              );
            }}
          >
            {lbl(locale, 'studio.field.fp.verticalReflectionAdd')}
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            disabled={disabled}
            onClick={() => {
              const copy = duplicateVerticalReflectionQuestion(
                question,
                bank.questions,
              );
              commit(
                { questions: [...bank.questions, copy] },
                bank.questions.length,
              );
            }}
          >
            {lbl(locale, 'studio.field.fp.verticalReflectionDuplicate')}
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            disabled={disabled || bank.questions.length <= 1}
            onClick={() => {
              const questions = bank.questions.filter((_, i) => i !== activeIndex);
              commit({ questions }, Math.max(0, activeIndex - 1));
            }}
          >
            {lbl(locale, 'studio.field.fp.verticalReflectionRemove')}
          </button>
        </div>
      </div>

      <section className="studio-trivia-question studio-vr-question">
        <div className="studio-geo-map-head">
          <h3 className="studio-geo-map-title">
            {lbl(locale, 'studio.field.fp.verticalReflectionQuestion')}{' '}
            {activeIndex + 1}
          </h3>
          <label className="studio-three-doors-enabled">
            <input
              type="checkbox"
              checked={question.enabled}
              disabled={disabled}
              onChange={(e) =>
                updateQuestion({ enabled: e.currentTarget.checked })
              }
            />
            <span>
              {lbl(locale, 'studio.field.fp.verticalReflectionEnabled')}
            </span>
          </label>
        </div>

        <FieldGroup horizontal>
          <FieldInput
            id="vr-internal-name"
            label={lbl(
              locale,
              'studio.field.fp.verticalReflectionInternalName',
            )}
            value={question.internalName}
            disabled={disabled}
            onChange={(e) =>
              updateQuestion({ internalName: readFieldInputValue(e) })
            }
          />
          <FieldSelect
            id="vr-template"
            label={lbl(locale, 'studio.field.fp.verticalReflectionTemplate')}
            value={question.templateId}
            options={templateOptions}
            disabled={disabled}
            onChange={(e) => {
              const templateId = e.currentTarget
                .value as VerticalReflectionTemplateId;
              commit({
                questions: bank.questions.map((q, i) => {
                  if (i !== activeIndex) return q;
                  const next = regenerateVerticalReflectionQuestion(q, {
                    templateId,
                    newSeed: `${q.generationSeed}-${templateId}`,
                  });
                  return {
                    ...next,
                    internalName:
                      !q.internalName || q.internalName === q.templateId
                        ? templateId
                        : q.internalName,
                  };
                }),
              });
            }}
          />
        </FieldGroup>

        <FieldGroup horizontal>
          <FieldInput
            id="vr-seed"
            label={lbl(locale, 'studio.field.fp.verticalReflectionSeed')}
            value={question.generationSeed}
            disabled={disabled}
            onChange={(e) =>
              updateQuestion({ generationSeed: readFieldInputValue(e) })
            }
          />
          <div className="field studio-vr-regen-field">
            <label htmlFor="vr-regen">
              {lbl(locale, 'studio.field.fp.verticalReflectionRegenerate')}
            </label>
            <button
              id="vr-regen"
              type="button"
              className="btn btn-secondary"
              disabled={disabled}
              onClick={() => {
                updateQuestion(
                  regenerateVerticalReflectionQuestion(question, {
                    newSeed: `${question.generationSeed}-${Date.now()}`,
                  }),
                );
              }}
            >
              {lbl(locale, 'studio.field.fp.verticalReflectionRegenerate')}
            </button>
          </div>
        </FieldGroup>

        <FieldGroup>
          <FieldInput
            id="vr-title-ar"
            label={lbl(locale, 'studio.field.fp.verticalReflectionTitle')}
            value={question.titleAr}
            disabled={disabled}
            dir="rtl"
            onChange={(e) =>
              updateQuestion({ titleAr: readFieldInputValue(e) })
            }
          />
          <FieldInput
            id="vr-instruction-ar"
            label={lbl(
              locale,
              'studio.field.fp.verticalReflectionInstruction',
            )}
            value={question.instructionAr}
            disabled={disabled}
            dir="rtl"
            onChange={(e) =>
              updateQuestion({ instructionAr: readFieldInputValue(e) })
            }
          />
        </FieldGroup>

        <FieldGroup horizontal>
          <FieldSelect
            id="vr-difficulty"
            label={lbl(locale, 'studio.field.fp.verticalReflectionDifficulty')}
            value={question.difficulty}
            options={difficultyOptions}
            disabled={disabled}
            onChange={(e) =>
              updateQuestion({ difficulty: e.currentTarget.value })
            }
          />
          <FieldInput
            id="vr-weight"
            type="number"
            min={0.1}
            step={0.1}
            label={lbl(locale, 'studio.field.fp.verticalReflectionWeight')}
            value={String(question.selectionWeight)}
            disabled={disabled}
            onChange={(e) =>
              updateQuestion({
                selectionWeight: Number(readFieldInputValue(e)) || 1,
              })
            }
          />
        </FieldGroup>
      </section>

      {publishIssues.length > 0 ? (
        <ul className="studio-validation-list">
          {publishIssues.map((issue) => (
            <li key={issue}>{issue}</li>
          ))}
        </ul>
      ) : (
        <p className="studio-three-doors-bank-ok">
          {lbl(locale, 'studio.field.fp.verticalReflectionTemplateCount')}:{' '}
          {templates.length}
        </p>
      )}
    </div>
  );
}

export { defaultVerticalReflectionBank };
