'use client';

import { useState } from 'react';
import { t } from '@/i18n/get-dictionary';
import type { Locale } from '@/i18n/locale';
import type { MessageKey } from '@/i18n/messages/en';
import { FieldGroup, FieldInput, FieldSelect, readFieldInputValue } from './Field';
import { McOptionListEditor } from './McOptionListEditor';
import {
  addCommonWordOption,
  COMMON_WORD_HINT_OPTIONS,
  commonWordBankIssues,
  commonWordBankSignature,
  commonWordClientPreview,
  createCommonWordQuestion,
  parseCommonWordBank,
  removeCommonWordOption,
  serializeCommonWordBank,
  type CommonWordStudioBank,
  type CommonWordStudioQuestion,
} from './common-word-question';

function lbl(locale: Locale, key: string): string {
  return t(locale, `studio.field.${key}` as MessageKey);
}

export type CommonWordFieldsProps = {
  locale: Locale;
  clientConfig: Record<string, unknown>;
  serverConfig: Record<string, unknown>;
  onClientChange: (next: Record<string, unknown>) => void;
  onServerChange: (next: Record<string, unknown>) => void;
  disabled?: boolean;
};

export function CommonWordFields(props: CommonWordFieldsProps) {
  const {
    locale,
    clientConfig,
    serverConfig,
    onClientChange,
    onServerChange,
    disabled,
  } = props;
  const parsed = parseCommonWordBank(serverConfig);
  const parsedSignature = commonWordBankSignature(parsed);
  const [bank, setBank] = useState(parsed);
  const [syncedSignature, setSyncedSignature] = useState(parsedSignature);
  if (parsedSignature !== syncedSignature) {
    setSyncedSignature(parsedSignature);
    setBank(parsed);
  }

  function commit(next: CommonWordStudioBank) {
    setBank(next);
    onServerChange(serializeCommonWordBank(next));
    onClientChange(commonWordClientPreview(next, clientConfig));
  }

  function updateQuestion(
    index: number,
    patch: CommonWordStudioQuestion,
  ) {
    const questions = [...bank.questions];
    questions[index] = patch;
    commit({ ...bank, questions });
  }

  return (
    <>
      <p className="studio-section-lead">{lbl(locale, 'fp.commonWordLead')}</p>
      <FieldGroup>
        <FieldInput
          id="fp-cw-title-ar"
          label={lbl(locale, 'fp.commonWordTitleAr')}
          value={bank.titleAr}
          disabled={disabled}
          dir="rtl"
          onChange={(e) =>
            commit({ ...bank, titleAr: readFieldInputValue(e) })
          }
        />
        <FieldInput
          id="fp-cw-title-en"
          label={lbl(locale, 'fp.commonWordTitleEn')}
          value={bank.titleEn}
          disabled={disabled}
          onChange={(e) =>
            commit({ ...bank, titleEn: readFieldInputValue(e) })
          }
        />
        <FieldInput
          id="fp-cw-instruction-ar"
          label={lbl(locale, 'fp.commonWordInstructionAr')}
          value={bank.instructionAr}
          disabled={disabled}
          dir="rtl"
          onChange={(e) =>
            commit({ ...bank, instructionAr: readFieldInputValue(e) })
          }
        />
        <FieldInput
          id="fp-cw-instruction-en"
          label={lbl(locale, 'fp.commonWordInstructionEn')}
          value={bank.instructionEn}
          disabled={disabled}
          onChange={(e) =>
            commit({ ...bank, instructionEn: readFieldInputValue(e) })
          }
        />
      </FieldGroup>

      {bank.questions.map((question, qIndex) => (
        <section key={question.questionKey} className="studio-trivia-question">
          <div className="studio-geo-map-head">
            <h3 className="studio-geo-map-title">
              {lbl(locale, 'fp.triviaQuestionN').replace(
                '{n}',
                String(qIndex + 1),
              )}
            </h3>
            <button
              type="button"
              className="btn btn-ghost"
              disabled={disabled || bank.questions.length <= 1}
              onClick={() =>
                commit({
                  ...bank,
                  questions: bank.questions.filter((q) => q !== question),
                })
              }
            >
              {lbl(locale, 'fp.triviaRemoveQuestion')}
            </button>
          </div>

          {question.clues.map((clue, index) => (
            <div key={clue.clueId}>
              <h4 className="studio-geo-map-title" style={{ fontSize: '0.9rem' }}>
                {lbl(locale, 'fp.commonWordClueN').replace(
                  '{n}',
                  String(index + 1),
                )}
              </h4>
              <FieldGroup>
                <FieldInput
                  id={`fp-cw-clue-ar-${qIndex}-${index}`}
                  label={lbl(locale, 'fp.commonWordClueAr')}
                  value={clue.textAr}
                  disabled={disabled}
                  dir="rtl"
                  onChange={(e) => {
                    const clues = [
                      ...question.clues,
                    ] as CommonWordStudioQuestion['clues'];
                    clues[index] = {
                      ...clue,
                      textAr: readFieldInputValue(e),
                    };
                    updateQuestion(qIndex, { ...question, clues });
                  }}
                />
                <FieldInput
                  id={`fp-cw-clue-en-${qIndex}-${index}`}
                  label={lbl(locale, 'fp.commonWordClueEn')}
                  value={clue.textEn}
                  disabled={disabled}
                  onChange={(e) => {
                    const clues = [
                      ...question.clues,
                    ] as CommonWordStudioQuestion['clues'];
                    clues[index] = {
                      ...clue,
                      textEn: readFieldInputValue(e),
                    };
                    updateQuestion(qIndex, { ...question, clues });
                  }}
                />
                <FieldInput
                  id={`fp-cw-rel-ar-${qIndex}-${index}`}
                  label={lbl(locale, 'fp.commonWordRelationshipAr')}
                  value={clue.relationshipAr}
                  disabled={disabled}
                  dir="rtl"
                  onChange={(e) => {
                    const clues = [
                      ...question.clues,
                    ] as CommonWordStudioQuestion['clues'];
                    clues[index] = {
                      ...clue,
                      relationshipAr: readFieldInputValue(e),
                    };
                    updateQuestion(qIndex, { ...question, clues });
                  }}
                />
                <FieldInput
                  id={`fp-cw-rel-en-${qIndex}-${index}`}
                  label={lbl(locale, 'fp.commonWordRelationshipEn')}
                  value={clue.relationshipEn}
                  disabled={disabled}
                  onChange={(e) => {
                    const clues = [
                      ...question.clues,
                    ] as CommonWordStudioQuestion['clues'];
                    clues[index] = {
                      ...clue,
                      relationshipEn: readFieldInputValue(e),
                    };
                    updateQuestion(qIndex, { ...question, clues });
                  }}
                />
                <FieldSelect
                  id={`fp-cw-hint-${qIndex}-${index}`}
                  label={lbl(locale, 'fp.commonWordVisualHint')}
                  value={clue.visualHint}
                  disabled={disabled}
                  options={COMMON_WORD_HINT_OPTIONS.map((opt) => ({
                    value: opt.value,
                    label: lbl(locale, opt.labelKey),
                  }))}
                  onChange={(e) => {
                    const clues = [
                      ...question.clues,
                    ] as CommonWordStudioQuestion['clues'];
                    clues[index] = {
                      ...clue,
                      visualHint: e.target.value as typeof clue.visualHint,
                    };
                    updateQuestion(qIndex, { ...question, clues });
                  }}
                />
              </FieldGroup>
            </div>
          ))}

          <p className="studio-inline-hint">
            {lbl(locale, 'fp.commonWordRelationshipHint')}
          </p>

          <McOptionListEditor
            locale={locale}
            options={question.options}
            correctOptionKey={question.correctOptionKey}
            disabled={disabled}
            radioGroupName={`fp-common-word-correct-${qIndex}`}
            onChange={({ options, correctOptionKey }) =>
              updateQuestion(qIndex, {
                ...question,
                options,
                correctOptionKey,
              })
            }
            onAdd={() =>
              updateQuestion(qIndex, addCommonWordOption(question))
            }
            onRemove={(optionKey) =>
              updateQuestion(
                qIndex,
                removeCommonWordOption(question, optionKey),
              )
            }
          />
        </section>
      ))}

      {bank.questions.length < 64 ? (
        <button
          type="button"
          className="btn btn-secondary"
          disabled={disabled}
          onClick={() =>
            commit({
              ...bank,
              questions: [
                ...bank.questions,
                createCommonWordQuestion(bank.questions),
              ],
            })
          }
        >
          {lbl(locale, 'fp.triviaAddQuestion')}
        </button>
      ) : null}

      {commonWordBankIssues(bank).length > 0 ? (
        <p className="studio-inline-hint" style={{ color: 'var(--lh-warning)' }}>
          {lbl(locale, 'fp.commonWordLead')}
        </p>
      ) : null}
    </>
  );
}
