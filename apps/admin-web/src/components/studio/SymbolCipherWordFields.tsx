'use client';

import { useState } from 'react';
import { t } from '@/i18n/get-dictionary';
import type { Locale } from '@/i18n/locale';
import type { MessageKey } from '@/i18n/messages/en';
import { FieldGroup, FieldInput, FieldSelect, readFieldInputValue } from './Field';
import { McOptionListEditor } from './McOptionListEditor';
import {
  CIPHER_SYMBOL_OPTIONS,
  autoAssignUniqueSymbols,
  createSymbolCipherQuestion,
  defaultSymbolCipherBank,
  parseSymbolCipherBank,
  regenerateSymbolCipherQuestion,
  serializeSymbolCipherBank,
  symbolCipherBankIssues,
  symbolCipherBankSignature,
  symbolCipherClientPreview,
  type SymbolCipherStudioBank,
  type SymbolCipherStudioQuestion,
} from './symbol-cipher-question';

function lbl(locale: Locale, key: string): string {
  return t(locale, `studio.field.${key}` as MessageKey);
}

export type SymbolCipherWordFieldsProps = {
  locale: Locale;
  clientConfig: Record<string, unknown>;
  serverConfig: Record<string, unknown>;
  onClientChange: (next: Record<string, unknown>) => void;
  onServerChange: (next: Record<string, unknown>) => void;
  disabled?: boolean;
};

export function SymbolCipherWordFields(props: SymbolCipherWordFieldsProps) {
  const {
    locale,
    clientConfig,
    serverConfig,
    onClientChange,
    onServerChange,
    disabled,
  } = props;
  const parsed = parseSymbolCipherBank(serverConfig);
  const parsedSignature = symbolCipherBankSignature(parsed);
  const [bank, setBank] = useState(parsed);
  const [syncedSignature, setSyncedSignature] = useState(parsedSignature);
  if (parsedSignature !== syncedSignature) {
    setSyncedSignature(parsedSignature);
    setBank(parsed);
  }

  function commit(next: SymbolCipherStudioBank) {
    setBank(next);
    onServerChange(serializeSymbolCipherBank(next));
    onClientChange(symbolCipherClientPreview(next, clientConfig));
  }

  function updateQuestion(index: number, patch: SymbolCipherStudioQuestion) {
    const questions = [...bank.questions];
    questions[index] = regenerateSymbolCipherQuestion(patch);
    commit({ ...bank, questions });
  }

  const issues = symbolCipherBankIssues(bank);

  return (
    <>
      <p className="studio-section-lead">{lbl(locale, 'fp.symbolCipherLead')}</p>
      <FieldGroup>
        <FieldInput
          id="fp-sc-title-ar"
          label={lbl(locale, 'fp.symbolCipherTitleAr')}
          value={bank.titleAr}
          disabled={disabled}
          dir="rtl"
          onChange={(e) =>
            commit({ ...bank, titleAr: readFieldInputValue(e) })
          }
        />
        <FieldInput
          id="fp-sc-title-en"
          label={lbl(locale, 'fp.symbolCipherTitleEn')}
          value={bank.titleEn}
          disabled={disabled}
          onChange={(e) =>
            commit({ ...bank, titleEn: readFieldInputValue(e) })
          }
        />
        <FieldInput
          id="fp-sc-instruction-ar"
          label={lbl(locale, 'fp.symbolCipherInstructionAr')}
          value={bank.instructionAr}
          disabled={disabled}
          dir="rtl"
          onChange={(e) =>
            commit({ ...bank, instructionAr: readFieldInputValue(e) })
          }
        />
        <FieldInput
          id="fp-sc-instruction-en"
          label={lbl(locale, 'fp.symbolCipherInstructionEn')}
          value={bank.instructionEn}
          disabled={disabled}
          onChange={(e) =>
            commit({ ...bank, instructionEn: readFieldInputValue(e) })
          }
        />
      </FieldGroup>

      {bank.questions.map((q, qi) => (
        <div key={q.questionId} className="studio-card" style={{ marginTop: 16 }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              gap: 8,
              alignItems: 'center',
            }}
          >
            <strong>
              {lbl(locale, 'fp.symbolCipherQuestion')} {qi + 1}
            </strong>
            <button
              type="button"
              disabled={disabled || bank.questions.length <= 1}
              onClick={() =>
                commit({
                  ...bank,
                  questions: bank.questions.filter((_, i) => i !== qi),
                })
              }
            >
              {lbl(locale, 'fp.symbolCipherRemoveQuestion')}
            </button>
          </div>
          <FieldGroup>
            <FieldInput
              id={`fp-sc-qid-${qi}`}
              label={lbl(locale, 'fp.symbolCipherQuestionId')}
              value={q.questionId}
              disabled={disabled}
              onChange={(e) =>
                updateQuestion(qi, {
                  ...q,
                  questionId: readFieldInputValue(e),
                })
              }
            />
            <FieldInput
              id={`fp-sc-iname-${qi}`}
              label={lbl(locale, 'fp.symbolCipherInternalName')}
              value={q.internalName}
              disabled={disabled}
              onChange={(e) =>
                updateQuestion(qi, {
                  ...q,
                  internalName: readFieldInputValue(e),
                })
              }
            />
            <FieldInput
              id={`fp-sc-answer-${qi}`}
              label={lbl(locale, 'fp.symbolCipherAnswer')}
              value={q.answerDisplayText}
              disabled={disabled}
              dir="rtl"
              onChange={(e) =>
                updateQuestion(qi, {
                  ...q,
                  answerDisplayText: readFieldInputValue(e),
                })
              }
            />
            <FieldInput
              id={`fp-sc-weight-${qi}`}
              label={lbl(locale, 'fp.symbolCipherWeight')}
              type="number"
              value={String(q.selectionWeight)}
              disabled={disabled}
              onChange={(e) =>
                updateQuestion(qi, {
                  ...q,
                  selectionWeight: Number(readFieldInputValue(e)) || 100,
                })
              }
            />
          </FieldGroup>

          <p className="studio-section-lead">
            {lbl(locale, 'fp.symbolCipherKeyLead')}
          </p>
          <button
            type="button"
            disabled={disabled}
            onClick={() => updateQuestion(qi, autoAssignUniqueSymbols(q))}
          >
            {lbl(locale, 'fp.symbolCipherAutoSymbols')}
          </button>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(5, minmax(0, 1fr))',
              gap: 8,
              marginTop: 8,
            }}
          >
            {q.mappings.map((m, mi) => (
              <div key={mi} className="studio-card" style={{ padding: 8 }}>
                <FieldSelect
                  id={`fp-sc-sym-${qi}-${mi}`}
                  label={lbl(locale, 'fp.symbolCipherSymbol')}
                  value={m.symbolId}
                  disabled={disabled}
                  options={[
                    { value: '', label: '—' },
                    ...CIPHER_SYMBOL_OPTIONS.map((o) => ({
                      value: o.value,
                      label: o.label,
                    })),
                  ]}
                  onChange={(e) => {
                    const mappings = q.mappings.map((row, i) =>
                      i === mi
                        ? {
                            ...row,
                            symbolId: e.target.value as typeof row.symbolId,
                          }
                        : row,
                    );
                    updateQuestion(qi, { ...q, mappings });
                  }}
                />
                <FieldInput
                  id={`fp-sc-let-${qi}-${mi}`}
                  label={lbl(locale, 'fp.symbolCipherLetter')}
                  value={m.letter}
                  disabled={disabled}
                  dir="rtl"
                  onChange={(e) => {
                    const mappings = q.mappings.map((row, i) =>
                      i === mi
                        ? { ...row, letter: readFieldInputValue(e) }
                        : row,
                    );
                    updateQuestion(qi, { ...q, mappings });
                  }}
                />
                <label style={{ fontSize: 12 }}>
                  <input
                    type="checkbox"
                    checked={m.isDecoy}
                    disabled={disabled}
                    onChange={(e) => {
                      const mappings = q.mappings.map((row, i) =>
                        i === mi ? { ...row, isDecoy: e.target.checked } : row,
                      );
                      updateQuestion(qi, { ...q, mappings });
                    }}
                  />{' '}
                  {lbl(locale, 'fp.symbolCipherDecoy')}
                </label>
              </div>
            ))}
          </div>

          <McOptionListEditor
            locale={locale}
            options={q.options}
            correctOptionKey={q.correctOptionKey}
            disabled={disabled}
            radioGroupName={`sc-correct-${qi}`}
            onChange={(next) =>
              updateQuestion(qi, {
                ...q,
                options: next.options,
                correctOptionKey: next.correctOptionKey,
              })
            }
            onAdd={() => {
              /* fixed at 4 options */
            }}
            onRemove={() => {
              /* fixed at 4 options */
            }}
          />
        </div>
      ))}

      <button
        type="button"
        disabled={disabled}
        style={{ marginTop: 12 }}
        onClick={() =>
          commit({
            ...bank,
            questions: [
              ...bank.questions,
              createSymbolCipherQuestion(bank.questions),
            ],
          })
        }
      >
        {lbl(locale, 'fp.symbolCipherAddQuestion')}
      </button>

      {issues.length > 0 ? (
        <ul style={{ color: 'var(--lh-danger, #c44)', marginTop: 12 }}>
          {issues.map((issue) => (
            <li key={issue}>{issue}</li>
          ))}
        </ul>
      ) : (
        <p style={{ color: 'var(--lh-success, #2a8)', marginTop: 12 }}>
          {lbl(locale, 'fp.symbolCipherValid')}
        </p>
      )}
    </>
  );
}

export function resetSymbolCipherDefaults(): SymbolCipherStudioBank {
  return defaultSymbolCipherBank();
}
