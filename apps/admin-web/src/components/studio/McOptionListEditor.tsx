'use client';

import { t } from '@/i18n/get-dictionary';
import type { Locale } from '@/i18n/locale';
import type { MessageKey } from '@/i18n/messages/en';
import { FieldInput, readFieldInputValue } from './Field';
import type { TriviaStudioOption } from './trivia-question-bank';

function lbl(locale: Locale, key: string): string {
  return t(locale, `studio.field.${key}` as MessageKey);
}

export type McOptionListEditorProps = {
  locale: Locale;
  options: TriviaStudioOption[];
  correctOptionKey: string;
  disabled?: boolean;
  radioGroupName: string;
  onChange: (next: {
    options: TriviaStudioOption[];
    correctOptionKey: string;
  }) => void;
  onAdd: () => void;
  onRemove: (optionKey: string) => void;
};

/**
 * Shared multiple-choice option editor used by trivia and common-word Studio forms.
 */
export function McOptionListEditor(props: McOptionListEditorProps) {
  const {
    locale,
    options,
    correctOptionKey,
    disabled,
    radioGroupName,
    onChange,
    onAdd,
    onRemove,
  } = props;

  return (
    <fieldset className="studio-trivia-answers">
      <legend>{lbl(locale, 'fp.triviaAnswers')}</legend>
      {options.map((option, optionIndex) => (
        <div key={option.key} className="studio-trivia-option-row">
          <label className="studio-trivia-correct">
            <input
              type="radio"
              name={radioGroupName}
              checked={correctOptionKey === option.key}
              disabled={disabled}
              onChange={() =>
                onChange({ options, correctOptionKey: option.key })
              }
            />
            <span>{lbl(locale, 'fp.triviaCorrectAnswer')}</span>
          </label>
          <FieldInput
            id={`${radioGroupName}-ar-${optionIndex}`}
            label={lbl(locale, 'fp.triviaAnswerAr')}
            value={option.ar}
            disabled={disabled}
            dir="rtl"
            onChange={(e) => {
              const value = readFieldInputValue(e);
              onChange({
                correctOptionKey,
                options: options.map((o) =>
                  o.key === option.key ? { ...o, ar: value } : o,
                ),
              });
            }}
          />
          <FieldInput
            id={`${radioGroupName}-en-${optionIndex}`}
            label={lbl(locale, 'fp.triviaAnswerEn')}
            value={option.en}
            disabled={disabled}
            onChange={(e) => {
              const value = readFieldInputValue(e);
              onChange({
                correctOptionKey,
                options: options.map((o) =>
                  o.key === option.key ? { ...o, en: value } : o,
                ),
              });
            }}
          />
          <div className="field studio-geo-remove">
            <label htmlFor={`${radioGroupName}-remove-${optionIndex}`}>
              &nbsp;
            </label>
            <button
              id={`${radioGroupName}-remove-${optionIndex}`}
              type="button"
              className="btn btn-ghost"
              disabled={disabled || options.length <= 2}
              onClick={() => onRemove(option.key)}
            >
              {lbl(locale, 'fp.triviaRemoveAnswer')}
            </button>
          </div>
        </div>
      ))}
      {options.length < 6 ? (
        <button
          type="button"
          className="btn btn-secondary"
          disabled={disabled}
          onClick={onAdd}
        >
          {lbl(locale, 'fp.triviaAddAnswer')}
        </button>
      ) : null}
    </fieldset>
  );
}
