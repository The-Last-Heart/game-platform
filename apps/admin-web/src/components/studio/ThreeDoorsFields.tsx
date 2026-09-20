'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  DOOR_IDS,
  type DoorId,
  type DoorTruthRule,
} from '@thelastheart/contracts';
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
  DOOR_PREDICATE_KIND_OPTIONS,
  createThreeDoorsQuestion,
  duplicateThreeDoorsQuestion,
  parseThreeDoorsBank,
  serializeThreeDoorsBank,
  solveStudioQuestion,
  statementPreview,
  syncCorrectDoorFromSolver,
  threeDoorsPublishIssues,
  updatePredicateKind,
  threeDoorsClientPreview,
  type DoorPredicateKind,
  type ThreeDoorsStudioBank,
  type ThreeDoorsStudioQuestion,
} from './three-doors-question';

type Props = {
  locale: Locale;
  clientConfig: Record<string, unknown>;
  serverConfig: Record<string, unknown>;
  onClientChange: (next: Record<string, unknown>) => void;
  onServerChange: (next: Record<string, unknown>) => void;
  disabled?: boolean;
};

function lbl(locale: Locale, key: MessageKey): string {
  try {
    return t(locale, key);
  } catch {
    return key;
  }
}

function bankSignature(bank: ThreeDoorsStudioBank): string {
  return JSON.stringify(serializeThreeDoorsBank(bank));
}

export function ThreeDoorsFields({
  locale,
  clientConfig,
  serverConfig,
  onClientChange,
  onServerChange,
  disabled,
}: Props) {
  const parsed = useMemo(
    () => parseThreeDoorsBank(serverConfig),
    [serverConfig],
  );
  const parsedSig = bankSignature(parsed);
  const [bank, setBank] = useState(parsed);
  const [syncedSig, setSyncedSig] = useState(parsedSig);
  const [activeIndex, setActiveIndex] = useState(0);
  const healAttemptedFor = useRef<string | null>(null);

  if (parsedSig !== syncedSig) {
    setSyncedSig(parsedSig);
    setBank(parsed);
  }

  const question =
    bank.questions[Math.min(activeIndex, Math.max(0, bank.questions.length - 1))] ??
    bank.questions[0];

  function commit(next: ThreeDoorsStudioBank, nextIndex = activeIndex) {
    setBank(next);
    const serialized = serializeThreeDoorsBank(next);
    onServerChange({
      ...serverConfig,
      ...serialized,
    });
    onClientChange(
      threeDoorsClientPreview(
        next,
        {
          ...clientConfig,
          categoryKey: 'challenge.category.logic',
          promptKey: 'challenge.three_doors.prompt',
          titleKey: 'challenge.three_doors.title',
          roomAssetId: 'three_doors.room',
          backgroundSfxAssetId: 'three_doors.background',
        },
        nextIndex,
      ),
    );
    setActiveIndex(nextIndex);
  }

  // Persist auto-healed bank sample into the draft when parse rewrites it.
  useEffect(() => {
    if (healAttemptedFor.current === parsedSig) return;
    const before = JSON.stringify(serverConfig.questions ?? null);
    const after = JSON.stringify(serializeThreeDoorsBank(parsed).questions);
    healAttemptedFor.current = parsedSig;
    if (before !== after) {
      commit(parsed, activeIndex);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one-shot heal per bank signature
  }, [parsedSig]);

  function updateQuestion(patch: Partial<ThreeDoorsStudioQuestion>) {
    if (!question) return;
    const questions = bank.questions.map((q, i) =>
      i === activeIndex ? { ...q, ...patch } : q,
    );
    commit({ questions });
  }

  if (!question) return null;

  const report = solveStudioQuestion(question);
  const publishIssues = threeDoorsPublishIssues(bank);
  const previewLocale = locale === 'ar' ? 'ar' : 'en';
  const solverOk = report.unique && report.derivedDoorId != null;
  const solverMatches =
    solverOk && report.derivedDoorId === question.correctDoorId;

  const truthRuleOptions = [
    {
      value: 'exactly_one_true',
      label: lbl(locale, 'studio.field.fp.threeDoorsExactlyOneTrue'),
    },
    {
      value: 'exactly_one_false',
      label: lbl(locale, 'studio.field.fp.threeDoorsExactlyOneFalse'),
    },
  ];
  const doorOptions = DOOR_IDS.map((id) => ({ value: id, label: id }));
  const predicateOptions = DOOR_PREDICATE_KIND_OPTIONS.map((option) => ({
    value: option,
    label: lbl(
      locale,
      `studio.field.fp.threeDoorsPred.${option}` as MessageKey,
    ),
  }));

  return (
    <div className="studio-three-doors">
      <p className="studio-section-lead">
        {lbl(locale, 'studio.field.fp.threeDoorsLead')}
      </p>

      <div className="studio-three-doors-bank">
        <div
          className="studio-segmented studio-three-doors-tabs"
          role="tablist"
          aria-label={lbl(locale, 'studio.field.fp.threeDoorsQuestion')}
        >
          {bank.questions.map((q, index) => {
            const qReport = solveStudioQuestion(q);
            const ok = q.enabled !== false && qReport.unique;
            return (
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
                    threeDoorsClientPreview(bank, clientConfig, index),
                  );
                }}
              >
                <span className="studio-three-doors-tab-label">
                  {q.internalName || `Q${index + 1}`}
                </span>
                <span
                  className={`studio-three-doors-tab-dot${ok ? ' is-ok' : ' is-bad'}`}
                  title={ok ? 'OK' : 'Needs unique solver'}
                />
              </button>
            );
          })}
        </div>
        <div className="studio-three-doors-bank-actions">
          <button
            type="button"
            className="btn btn-secondary"
            disabled={disabled}
            onClick={() => {
              const created = createThreeDoorsQuestion(bank.questions);
              commit(
                { questions: [...bank.questions, created] },
                bank.questions.length,
              );
            }}
          >
            {lbl(locale, 'studio.field.fp.threeDoorsAdd')}
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            disabled={disabled}
            onClick={() => {
              const copy = duplicateThreeDoorsQuestion(question, bank.questions);
              commit(
                { questions: [...bank.questions, copy] },
                bank.questions.length,
              );
            }}
          >
            {lbl(locale, 'studio.field.fp.threeDoorsDuplicate')}
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            disabled={disabled || bank.questions.length <= 1}
            onClick={() => {
              const questions = bank.questions.filter(
                (_, i) => i !== activeIndex,
              );
              commit({ questions }, Math.max(0, activeIndex - 1));
            }}
          >
            {lbl(locale, 'studio.field.fp.threeDoorsRemove')}
          </button>
        </div>
      </div>

      <section className="studio-trivia-question studio-three-doors-question">
        <div className="studio-geo-map-head">
          <h3 className="studio-geo-map-title">
            {lbl(locale, 'studio.field.fp.threeDoorsQuestion')}{' '}
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
            <span>{lbl(locale, 'studio.field.fp.threeDoorsEnabled')}</span>
          </label>
        </div>

        <FieldGroup horizontal>
          <FieldInput
            id="td-internal-name"
            label={lbl(locale, 'studio.field.fp.threeDoorsInternalName')}
            value={question.internalName}
            disabled={disabled}
            onChange={(e) =>
              updateQuestion({ internalName: readFieldInputValue(e) })
            }
          />
          <FieldInput
            id="td-question-id"
            label={lbl(locale, 'studio.field.fp.threeDoorsQuestionId')}
            value={question.questionId}
            disabled={disabled}
            onChange={(e) =>
              updateQuestion({ questionId: readFieldInputValue(e) })
            }
          />
          <FieldSelect
            id="td-truth-rule"
            label={lbl(locale, 'studio.field.fp.threeDoorsTruthRule')}
            value={question.truthRule}
            disabled={disabled}
            options={truthRuleOptions}
            onChange={(e) => {
              const truthRule = e.currentTarget.value as DoorTruthRule;
              updateQuestion(
                syncCorrectDoorFromSolver({ ...question, truthRule }),
              );
            }}
          />
          <FieldInput
            id="td-weight"
            type="number"
            min={0.1}
            step={0.1}
            label={lbl(locale, 'studio.field.fp.threeDoorsWeight')}
            value={question.selectionWeight}
            disabled={disabled}
            onChange={(e) =>
              updateQuestion({
                selectionWeight: Number(readFieldInputValue(e)) || 1,
              })
            }
          />
        </FieldGroup>

        <div className="studio-three-doors-grid">
          {DOOR_IDS.map((doorId, doorIndex) => {
            const statement = question.statements[doorIndex]!;
            const kind = statement.predicate.kind as DoorPredicateKind;
            const preview = statementPreview(statement.predicate, previewLocale);
            return (
              <article
                key={doorId}
                className="studio-three-doors-door"
                data-door={doorId}
              >
                <header className="studio-three-doors-door-head">
                  <span className="studio-three-doors-door-badge">{doorId}</span>
                  <span className="studio-three-doors-door-title">
                    {lbl(locale, 'studio.field.fp.threeDoorsDoor')} {doorId}
                  </span>
                </header>

                <FieldSelect
                  id={`td-pred-${doorId}`}
                  label={lbl(locale, 'studio.field.fp.threeDoorsPredicate')}
                  value={kind}
                  disabled={disabled}
                  options={predicateOptions}
                  onChange={(e) => {
                    const nextKind = e.currentTarget
                      .value as DoorPredicateKind;
                    const statements = [
                      ...question.statements,
                    ] as ThreeDoorsStudioQuestion['statements'];
                    statements[doorIndex] = {
                      doorId,
                      predicate: updatePredicateKind(
                        statement.predicate,
                        nextKind,
                      ),
                    };
                    updateQuestion(
                      syncCorrectDoorFromSolver({ ...question, statements }),
                    );
                  }}
                />

                {(kind === 'is' || kind === 'is_not') && (
                  <FieldSelect
                    id={`td-ref-${doorId}`}
                    label={lbl(locale, 'studio.field.fp.threeDoorsRefDoor')}
                    value={
                      statement.predicate.kind === 'is' ||
                      statement.predicate.kind === 'is_not'
                        ? statement.predicate.doorId
                        : 'A'
                    }
                    disabled={disabled}
                    options={doorOptions}
                    onChange={(e) => {
                      const ref = e.currentTarget.value as DoorId;
                      const statements = [
                        ...question.statements,
                      ] as ThreeDoorsStudioQuestion['statements'];
                      statements[doorIndex] = {
                        doorId,
                        predicate: { kind, doorId: ref },
                      };
                      updateQuestion(
                        syncCorrectDoorFromSolver({ ...question, statements }),
                      );
                    }}
                  />
                )}

                {(kind === 'is_one_of' || kind === 'is_not_one_of') && (
                  <FieldGroup horizontal>
                    <FieldSelect
                      id={`td-ref1-${doorId}`}
                      label={lbl(locale, 'studio.field.fp.threeDoorsRefDoor1')}
                      value={
                        statement.predicate.kind === 'is_one_of' ||
                        statement.predicate.kind === 'is_not_one_of'
                          ? statement.predicate.doorIds[0]
                          : 'A'
                      }
                      disabled={disabled}
                      options={doorOptions}
                      onChange={(e) => {
                        const a = e.currentTarget.value as DoorId;
                        const b =
                          statement.predicate.kind === 'is_one_of' ||
                          statement.predicate.kind === 'is_not_one_of'
                            ? statement.predicate.doorIds[1]
                            : 'B';
                        const statements = [
                          ...question.statements,
                        ] as ThreeDoorsStudioQuestion['statements'];
                        statements[doorIndex] = {
                          doorId,
                          predicate: { kind, doorIds: [a, b] },
                        };
                        updateQuestion(
                          syncCorrectDoorFromSolver({
                            ...question,
                            statements,
                          }),
                        );
                      }}
                    />
                    <FieldSelect
                      id={`td-ref2-${doorId}`}
                      label={lbl(locale, 'studio.field.fp.threeDoorsRefDoor2')}
                      value={
                        statement.predicate.kind === 'is_one_of' ||
                        statement.predicate.kind === 'is_not_one_of'
                          ? statement.predicate.doorIds[1]
                          : 'B'
                      }
                      disabled={disabled}
                      options={doorOptions}
                      onChange={(e) => {
                        const b = e.currentTarget.value as DoorId;
                        const a =
                          statement.predicate.kind === 'is_one_of' ||
                          statement.predicate.kind === 'is_not_one_of'
                            ? statement.predicate.doorIds[0]
                            : 'A';
                        const statements = [
                          ...question.statements,
                        ] as ThreeDoorsStudioQuestion['statements'];
                        statements[doorIndex] = {
                          doorId,
                          predicate: { kind, doorIds: [a, b] },
                        };
                        updateQuestion(
                          syncCorrectDoorFromSolver({
                            ...question,
                            statements,
                          }),
                        );
                      }}
                    />
                  </FieldGroup>
                )}

                <div
                  className="studio-three-doors-plaque"
                  dir={previewLocale === 'ar' ? 'rtl' : 'ltr'}
                >
                  <span className="studio-three-doors-plaque-label">
                    {lbl(locale, 'studio.field.fp.threeDoorsPreview')}
                  </span>
                  <p className="studio-three-doors-plaque-text">{preview}</p>
                </div>
              </article>
            );
          })}
        </div>

        <div
          className={`studio-three-doors-solver${solverOk ? (solverMatches ? ' is-ok' : ' is-warn') : ' is-bad'}`}
        >
          <div className="studio-three-doors-solver-main">
            <div className="studio-three-doors-solver-result">
              <span className="studio-three-doors-solver-kicker">
                {lbl(locale, 'studio.field.fp.threeDoorsDerivedDoor')}
              </span>
              <div className="studio-three-doors-solver-door">
                <span className="studio-three-doors-solver-letter">
                  {report.derivedDoorId ?? '—'}
                </span>
                <span
                  className={`studio-three-doors-solver-badge${report.unique ? ' is-unique' : ''}`}
                >
                  {report.unique
                    ? lbl(locale, 'studio.field.fp.threeDoorsUniqueYes')
                    : lbl(locale, 'studio.field.fp.threeDoorsUniqueNo')}
                </span>
              </div>
              {!solverOk ? (
                <p className="studio-inline-hint">
                  {lbl(locale, 'studio.field.fp.threeDoorsSolverHintBad')}
                </p>
              ) : !solverMatches ? (
                <p className="studio-inline-hint">
                  {lbl(locale, 'studio.field.fp.threeDoorsSolverHintMismatch')}
                </p>
              ) : (
                <p className="studio-inline-hint">
                  {lbl(locale, 'studio.field.fp.threeDoorsSolverHintOk')}
                </p>
              )}
            </div>
            <div className="studio-three-doors-solver-controls">
              <FieldSelect
                id="td-correct-door"
                label={lbl(locale, 'studio.field.fp.threeDoorsCorrectDoor')}
                value={question.correctDoorId}
                disabled={disabled}
                options={doorOptions}
                onChange={(e) =>
                  updateQuestion({
                    correctDoorId: e.currentTarget.value as DoorId,
                  })
                }
              />
              {solverOk && !solverMatches ? (
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={disabled}
                  onClick={() =>
                    updateQuestion(syncCorrectDoorFromSolver(question))
                  }
                >
                  {lbl(locale, 'studio.field.fp.threeDoorsApplySolver')}
                </button>
              ) : null}
            </div>
          </div>
        </div>

        <div className="studio-three-doors-truth">
          <h4>{lbl(locale, 'studio.field.fp.threeDoorsTruthTable')}</h4>
          <div className="studio-three-doors-truth-scroll">
            <table>
              <thead>
                <tr>
                  <th>{lbl(locale, 'studio.field.fp.threeDoorsKeyAt')}</th>
                  <th>A</th>
                  <th>B</th>
                  <th>C</th>
                  <th>{lbl(locale, 'studio.field.fp.threeDoorsValid')}</th>
                </tr>
              </thead>
              <tbody>
                {report.rows.map((row) => (
                  <tr
                    key={row.keyLocation}
                    className={row.valid ? 'is-valid' : undefined}
                  >
                    <td>
                      <strong>{row.keyLocation}</strong>
                    </td>
                    {row.results.map((truth, i) => (
                      <td key={i} data-truth={truth ? 'true' : 'false'}>
                        <span className="studio-three-doors-truth-chip">
                          {truth
                            ? lbl(locale, 'studio.field.fp.threeDoorsTrue')
                            : lbl(locale, 'studio.field.fp.threeDoorsFalse')}
                        </span>
                      </td>
                    ))}
                    <td>
                      <span
                        className={`studio-three-doors-valid-chip${row.valid ? ' is-yes' : ''}`}
                      >
                        {row.valid
                          ? lbl(locale, 'studio.field.fp.threeDoorsYes')
                          : lbl(locale, 'studio.field.fp.threeDoorsNo')}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {publishIssues.length > 0 ? (
        <ul className="studio-validation-list">
          {publishIssues.map((issue) => {
            const [qid, ...rest] = issue.split(':');
            const detail = rest.join(':') || issue;
            return (
              <li key={issue}>
                <strong>{qid}</strong>
                {rest.length > 0 ? ` — ${detail}` : null}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="studio-inline-hint studio-three-doors-bank-ok">
          {lbl(locale, 'studio.field.fp.threeDoorsBankOk')}
        </p>
      )}
    </div>
  );
}
