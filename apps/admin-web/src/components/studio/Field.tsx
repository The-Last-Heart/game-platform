'use client';

import type { ReactNode, InputHTMLAttributes, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react';

type FieldProps = {
  label: string;
  hint?: string;
  error?: string;
  htmlFor?: string;
  children: ReactNode;
};

export function Field({ label, hint, error, htmlFor, children }: FieldProps) {
  return (
    <div className="field">
      <label htmlFor={htmlFor}>
        {label}
      </label>
      {children}
      {hint && !error ? (
        <span className="field-hint" style={{ color: 'var(--lh-text-muted)', fontSize: '0.8rem' }}>
          {hint}
        </span>
      ) : null}
      {error ? <span className="field-error">{error}</span> : null}
    </div>
  );
}

type FieldGroupProps = {
  horizontal?: boolean;
  children: ReactNode;
};

export function FieldGroup({ horizontal, children }: FieldGroupProps) {
  return (
    <div className={`field-group${horizontal ? ' field-group-horizontal' : ''}`}>
      {children}
    </div>
  );
}

type FieldInputProps = {
  label: string;
  hint?: string;
  error?: string;
} & InputHTMLAttributes<HTMLInputElement>;

export function FieldInput({ label, hint, error, id, ...rest }: FieldInputProps) {
  return (
    <Field label={label} hint={hint} error={error} htmlFor={id}>
      <input id={id} {...rest} />
    </Field>
  );
}

type FieldSelectProps = {
  label: string;
  hint?: string;
  error?: string;
  options: { value: string; label: string }[];
} & SelectHTMLAttributes<HTMLSelectElement>;

export function FieldSelect({ label, hint, error, id, options, ...rest }: FieldSelectProps) {
  return (
    <Field label={label} hint={hint} error={error} htmlFor={id}>
      <select id={id} {...rest}>
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </Field>
  );
}

type FieldTextareaProps = {
  label: string;
  hint?: string;
  error?: string;
} & TextareaHTMLAttributes<HTMLTextAreaElement>;

export function FieldTextarea({ label, hint, error, id, ...rest }: FieldTextareaProps) {
  return (
    <Field label={label} hint={hint} error={error} htmlFor={id}>
      <textarea id={id} style={{ minHeight: '5rem', resize: 'vertical' }} {...rest} />
    </Field>
  );
}

type FieldCheckboxGroupProps = {
  label: string;
  options: { value: string; label: string }[];
  selected: string[];
  onChange: (selected: string[]) => void;
};

export function FieldCheckboxGroup({ label, options, selected, onChange }: FieldCheckboxGroupProps) {
  return (
    <div className="field">
      <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>{label}</span>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem 1rem', marginTop: '0.25rem' }}>
        {options.map((opt) => (
          <label key={opt.value} style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.88rem', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={selected.includes(opt.value)}
              onChange={(e) => {
                if (e.target.checked) {
                  onChange([...selected, opt.value]);
                } else {
                  onChange(selected.filter((v) => v !== opt.value));
                }
              }}
              style={{ width: 'auto', accentColor: 'var(--lh-accent)' }}
            />
            {opt.label}
          </label>
        ))}
      </div>
    </div>
  );
}
