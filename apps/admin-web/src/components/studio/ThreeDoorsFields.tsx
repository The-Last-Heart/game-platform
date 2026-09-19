'use client';

import { useMemo, useState } from 'react';
import {
  DOOR_IDS,
  type DoorId,
  type DoorTruthRule,
} from '@thelastheart/contracts';
import { t } from '@/i18n/get-dictionary';
import type { Locale } from '@/i18n/locale';
import type { MessageKey } from '@/i18n/messages/en';
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

export function ThreeDoorsFields({
  locale,
  clientConfig,
  serverConfig,
  onClientChange,
  onServerChange,
}: Props) {
  const bank = useMemo(
    () => parseThreeDoorsBank(serverConfig),
    [serverConfig],
  );
  const [activeIndex, setActiveIndex] = useState(0);
  const question =
    bank.questions[Math.min(activeIndex, bank.questions.length - 1)] ??
    bank.questions[0];

  function commit(next: ThreeDoorsStudioBank, nextIndex = activeIndex) {
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

  return (
    <div className="studio-field-stack">
      <p className="studio-field-lead">
        {lbl(locale, 'studio.field.fp.threeDoorsLead')}
      </p>

      <div className="studio-inline-actions">
        <label className="studio-field">
          <span>{lbl(locale, 'studio.field.fp.threeDoorsQuestion')}</span>
          <select
            value={String(activeIndex)}
            onChange={(e) => setActiveIndex(Number(e.currentTarget.value))}
          >
            {bank.questions.map((q, index) => (
              <option key={q.questionId} value={index}>
                {q.internalName || q.questionId}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="btn-secondary"
          onClick={() => {
            const created = createThreeDoorsQuestion(bank.questions);
            commit({ questions: [...bank.questions, created] }, bank.questions.length);
          }}
        >
          {lbl(locale, 'studio.field.fp.threeDoorsAdd')}
        </button>
        <button
          type="button"
          className="btn-secondary"
          onClick={() => {
            const copy = duplicateThreeDoorsQuestion(question, bank.questions);
            commit({ questions: [...bank.questions, copy] }, bank.questions.length);
          }}
        >
          {lbl(locale, 'studio.field.fp.threeDoorsDuplicate')}
        </button>
        <button
          type="button"
          className="btn-secondary"
          disabled={bank.questions.length <= 1}
          onClick={() => {
            const questions = bank.questions.filter((_, i) => i !== activeIndex);
            commit({ questions }, Math.max(0, activeIndex - 1));
          }}
        >
          {lbl(locale, 'studio.field.fp.threeDoorsRemove')}
        </button>
      </div>

      <label className="studio-field">
        <span>{lbl(locale, 'studio.field.fp.threeDoorsInternalName')}</span>
        <input
          value={question.internalName}
          onChange={(e) => updateQuestion({ internalName: e.currentTarget.value })}
        />
      </label>

      <label className="studio-field">
        <span>{lbl(locale, 'studio.field.fp.threeDoorsQuestionId')}</span>
        <input
          value={question.questionId}
          onChange={(e) => updateQuestion({ questionId: e.currentTarget.value })}
        />
      </label>

      <label className="studio-field">
        <span>{lbl(locale, 'studio.field.fp.threeDoorsTruthRule')}</span>
        <select
          value={question.truthRule}
          onChange={(e) => {
            const truthRule = e.currentTarget.value as DoorTruthRule;
            const next = syncCorrectDoorFromSolver({ ...question, truthRule });
            updateQuestion(next);
          }}
        >
          <option value="exactly_one_true">
            {lbl(locale, 'studio.field.fp.threeDoorsExactlyOneTrue')}
          </option>
          <option value="exactly_one_false">
            {lbl(locale, 'studio.field.fp.threeDoorsExactlyOneFalse')}
          </option>
        </select>
      </label>

      {DOOR_IDS.map((doorId, doorIndex) => {
        const statement = question.statements[doorIndex]!;
        const kind = statement.predicate.kind as DoorPredicateKind;
        return (
          <fieldset key={doorId} className="studio-fieldset">
            <legend>
              {lbl(locale, 'studio.field.fp.threeDoorsDoor')} {doorId}
            </legend>
            <label className="studio-field">
              <span>{lbl(locale, 'studio.field.fp.threeDoorsPredicate')}</span>
              <select
                value={kind}
                onChange={(e) => {
                  const nextKind = e.currentTarget.value as DoorPredicateKind;
                  const statements = [...question.statements] as ThreeDoorsStudioQuestion['statements'];
                  statements[doorIndex] = {
                    doorId,
                    predicate: updatePredicateKind(statement.predicate, nextKind),
                  };
                  updateQuestion(
                    syncCorrectDoorFromSolver({ ...question, statements }),
                  );
                }}
              >
                {DOOR_PREDICATE_KIND_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {lbl(
                      locale,
                      `studio.field.fp.threeDoorsPred.${option}` as MessageKey,
                    )}
                  </option>
                ))}
              </select>
            </label>
            {(kind === 'is' || kind === 'is_not') && (
              <label className="studio-field">
                <span>{lbl(locale, 'studio.field.fp.threeDoorsRefDoor')}</span>
                <select
                  value={
                    statement.predicate.kind === 'is' ||
                    statement.predicate.kind === 'is_not'
                      ? statement.predicate.doorId
                      : 'A'
                  }
                  onChange={(e) => {
                    const ref = e.currentTarget.value as DoorId;
                    const statements = [...question.statements] as ThreeDoorsStudioQuestion['statements'];
                    statements[doorIndex] = {
                      doorId,
                      predicate: { kind, doorId: ref },
                    };
                    updateQuestion(
                      syncCorrectDoorFromSolver({ ...question, statements }),
                    );
                  }}
                >
                  {DOOR_IDS.map((id) => (
                    <option key={id} value={id}>
                      {id}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {(kind === 'is_one_of' || kind === 'is_not_one_of') && (
              <div className="studio-inline-actions">
                <label className="studio-field">
                  <span>{lbl(locale, 'studio.field.fp.threeDoorsRefDoor1')}</span>
                  <select
                    value={
                      statement.predicate.kind === 'is_one_of' ||
                      statement.predicate.kind === 'is_not_one_of'
                        ? statement.predicate.doorIds[0]
                        : 'A'
                    }
                    onChange={(e) => {
                      const a = e.currentTarget.value as DoorId;
                      const b =
                        statement.predicate.kind === 'is_one_of' ||
                        statement.predicate.kind === 'is_not_one_of'
                          ? statement.predicate.doorIds[1]
                          : 'B';
                      const statements = [...question.statements] as ThreeDoorsStudioQuestion['statements'];
                      statements[doorIndex] = {
                        doorId,
                        predicate: { kind, doorIds: [a, b] },
                      };
                      updateQuestion(
                        syncCorrectDoorFromSolver({ ...question, statements }),
                      );
                    }}
                  >
                    {DOOR_IDS.map((id) => (
                      <option key={id} value={id}>
                        {id}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="studio-field">
                  <span>{lbl(locale, 'studio.field.fp.threeDoorsRefDoor2')}</span>
                  <select
                    value={
                      statement.predicate.kind === 'is_one_of' ||
                      statement.predicate.kind === 'is_not_one_of'
                        ? statement.predicate.doorIds[1]
                        : 'B'
                    }
                    onChange={(e) => {
                      const b = e.currentTarget.value as DoorId;
                      const a =
                        statement.predicate.kind === 'is_one_of' ||
                        statement.predicate.kind === 'is_not_one_of'
                          ? statement.predicate.doorIds[0]
                          : 'A';
                      const statements = [...question.statements] as ThreeDoorsStudioQuestion['statements'];
                      statements[doorIndex] = {
                        doorId,
                        predicate: { kind, doorIds: [a, b] },
                      };
                      updateQuestion(
                        syncCorrectDoorFromSolver({ ...question, statements }),
                      );
                    }}
                  >
                    {DOOR_IDS.map((id) => (
                      <option key={id} value={id}>
                        {id}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            )}
            <p className="studio-field-hint" dir="auto">
              {lbl(locale, 'studio.field.fp.threeDoorsPreview')}:{' '}
              {statementPreview(statement.predicate, locale === 'ar' ? 'ar' : 'en')}
            </p>
          </fieldset>
        );
      })}

      <label className="studio-field">
        <span>{lbl(locale, 'studio.field.fp.threeDoorsCorrectDoor')}</span>
        <select
          value={question.correctDoorId}
          onChange={(e) =>
            updateQuestion({ correctDoorId: e.currentTarget.value as DoorId })
          }
        >
          {DOOR_IDS.map((id) => (
            <option key={id} value={id}>
              {id}
            </option>
          ))}
        </select>
      </label>
      <p className="studio-field-hint">
        {lbl(locale, 'studio.field.fp.threeDoorsDerivedDoor')}:{' '}
        {report.derivedDoorId ?? '—'}{' '}
        {report.unique
          ? lbl(locale, 'studio.field.fp.threeDoorsUniqueYes')
          : lbl(locale, 'studio.field.fp.threeDoorsUniqueNo')}
      </p>

      <div className="studio-truth-table">
        <h4>{lbl(locale, 'studio.field.fp.threeDoorsTruthTable')}</h4>
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
              <tr key={row.keyLocation}>
                <td>{row.keyLocation}</td>
                <td>{row.results[0] ? 'true' : 'false'}</td>
                <td>{row.results[1] ? 'true' : 'false'}</td>
                <td>{row.results[2] ? 'true' : 'false'}</td>
                <td>{row.valid ? 'yes' : 'no'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <label className="studio-field studio-checkbox">
        <input
          type="checkbox"
          checked={question.enabled}
          onChange={(e) => updateQuestion({ enabled: e.currentTarget.checked })}
        />
        <span>{lbl(locale, 'studio.field.fp.threeDoorsEnabled')}</span>
      </label>

      <label className="studio-field">
        <span>{lbl(locale, 'studio.field.fp.threeDoorsWeight')}</span>
        <input
          type="number"
          min={0.1}
          step={0.1}
          value={question.selectionWeight}
          onChange={(e) =>
            updateQuestion({
              selectionWeight: Number(e.currentTarget.value) || 1,
            })
          }
        />
      </label>

      {publishIssues.length > 0 && (
        <ul className="studio-validation-list">
          {publishIssues.map((issue) => (
            <li key={issue}>{issue}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
