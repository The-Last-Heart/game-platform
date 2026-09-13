'use client';

import type { ReactNode } from 'react';
import { Field, FieldGroup } from './Field';
import type { CatalogOption } from './studio-catalog-options';

type Preset = { value: string | number; label: string };

export function PresetChips({
  presets,
  activeValue,
  onSelect,
  disabled,
}: {
  presets: Preset[];
  activeValue?: string | number | null;
  onSelect: (value: string | number) => void;
  disabled?: boolean;
}) {
  return (
    <div className="studio-preset-chips" role="group">
      {presets.map((p) => {
        const active = activeValue === p.value || String(activeValue) === String(p.value);
        return (
          <button
            key={String(p.value)}
            type="button"
            className={`studio-preset-chip${active ? ' is-active' : ''}`}
            disabled={disabled}
            onClick={() => onSelect(p.value)}
          >
            {p.label}
          </button>
        );
      })}
    </div>
  );
}

export function SegmentedChoice({
  label,
  hint,
  options,
  value,
  onChange,
  disabled,
}: {
  label: string;
  hint?: string;
  options: { value: string; label: string }[];
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <Field label={label} hint={hint}>
      <div className="studio-segmented" role="radiogroup" aria-label={label}>
        {options.map((opt) => (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={value === opt.value}
            className={`studio-segmented-btn${value === opt.value ? ' is-active' : ''}`}
            disabled={disabled}
            onClick={() => onChange(opt.value)}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </Field>
  );
}

/** Edit duration in seconds; persist milliseconds. */
export function DurationSecondsField({
  id,
  label,
  hint,
  valueMs,
  onChangeMs,
  minSec = 0,
  maxSec = 60,
  stepSec = 0.1,
  presets,
  disabled,
}: {
  id: string;
  label: string;
  hint?: string;
  valueMs: number;
  onChangeMs: (ms: number) => void;
  minSec?: number;
  maxSec?: number;
  stepSec?: number;
  presets?: { ms: number; label: string }[];
  disabled?: boolean;
}) {
  const seconds = Math.round((valueMs / 1000) * 10) / 10;
  return (
    <Field label={label} hint={hint} htmlFor={id}>
      {presets && presets.length > 0 ? (
        <PresetChips
          presets={presets.map((p) => ({ value: p.ms, label: p.label }))}
          activeValue={valueMs}
          onSelect={(v) => onChangeMs(Number(v))}
          disabled={disabled}
        />
      ) : null}
      <div className="studio-duration-row">
        <input
          id={id}
          type="number"
          min={minSec}
          max={maxSec}
          step={stepSec}
          value={seconds}
          disabled={disabled}
          onChange={(e) => {
            const sec = Number(e.currentTarget.value);
            if (Number.isFinite(sec)) onChangeMs(Math.round(sec * 1000));
          }}
        />
        <span className="studio-unit">s</span>
        <span className="studio-unit-muted">{valueMs} ms</span>
      </div>
    </Field>
  );
}

export function CatalogKeyField({
  id,
  label,
  hint,
  value,
  onChange,
  options,
  localize,
  allowCustom = true,
  disabled,
}: {
  id: string;
  label: string;
  hint?: string;
  value: string;
  onChange: (value: string) => void;
  options: CatalogOption[];
  localize: (labelKey: string) => string;
  allowCustom?: boolean;
  disabled?: boolean;
}) {
  const known = options.some((o) => o.value === value);
  const selectValue = known ? value : allowCustom ? '__custom__' : options[0]?.value ?? '';

  return (
    <Field label={label} hint={hint} htmlFor={id}>
      <select
        id={id}
        value={selectValue}
        disabled={disabled}
        onChange={(e) => {
          const next = e.currentTarget.value;
          if (next === '__custom__') {
            if (!known) return;
            onChange('');
            return;
          }
          onChange(next);
        }}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {localize(opt.labelKey)}
          </option>
        ))}
        {allowCustom ? <option value="__custom__">{localize('studio.field.customValue')}</option> : null}
      </select>
      {!known && allowCustom ? (
        <input
          className="studio-custom-key"
          value={value}
          disabled={disabled}
          placeholder={localize('studio.field.customKeyPlaceholder')}
          onChange={(e) => onChange(e.currentTarget.value)}
          aria-label={label}
        />
      ) : null}
    </Field>
  );
}

export function ChipMultiSelect({
  label,
  hint,
  options,
  selected,
  onChange,
  localize,
  disabled,
}: {
  label: string;
  hint?: string;
  options: CatalogOption[];
  selected: string[];
  onChange: (selected: string[]) => void;
  localize: (labelKey: string) => string;
  disabled?: boolean;
}) {
  return (
    <Field label={label} hint={hint}>
      <div className="studio-chip-multi">
        {options.map((opt) => {
          const on = selected.includes(opt.value);
          return (
            <button
              key={opt.value}
              type="button"
              className={`studio-preset-chip${on ? ' is-active' : ''}`}
              disabled={disabled}
              aria-pressed={on}
              onClick={() => {
                if (on) onChange(selected.filter((v) => v !== opt.value));
                else onChange([...selected, opt.value]);
              }}
            >
              {localize(opt.labelKey)}
            </button>
          );
        })}
      </div>
    </Field>
  );
}

export function FractionPercentField({
  id,
  label,
  hint,
  value,
  onChange,
  min = 0,
  max = 100,
  disabled,
}: {
  id: string;
  label: string;
  hint?: string;
  /** 0–1 fraction */
  value: number;
  onChange: (fraction: number) => void;
  min?: number;
  max?: number;
  disabled?: boolean;
}) {
  const pct = Math.round(value * 100);
  return (
    <Field label={label} hint={hint} htmlFor={id}>
      <div className="studio-slider-row">
        <input
          id={id}
          type="range"
          min={min}
          max={max}
          value={pct}
          disabled={disabled}
          onChange={(e) => onChange(Number(e.currentTarget.value) / 100)}
        />
        <span className="studio-unit">{pct}%</span>
      </div>
    </Field>
  );
}

export function ZonePad({
  zone,
  onChange,
  disabled,
  label,
  hint,
}: {
  zone: { x: number; y: number; width: number; height: number };
  onChange: (zone: { x: number; y: number; width: number; height: number }) => void;
  disabled?: boolean;
  label: string;
  hint?: string;
}) {
  return (
    <Field label={label} hint={hint}>
      <div className="studio-zone-pad" aria-hidden>
        <div
          className="studio-zone-rect"
          style={{
            left: `${zone.x * 100}%`,
            top: `${zone.y * 100}%`,
            width: `${zone.width * 100}%`,
            height: `${zone.height * 100}%`,
          }}
        />
      </div>
      <FieldGroup horizontal>
        <FractionPercentField
          id="zone-w"
          label="W"
          value={zone.width}
          onChange={(width) => onChange({ ...zone, width: Math.min(width, 1 - zone.x) })}
          disabled={disabled}
        />
        <FractionPercentField
          id="zone-h"
          label="H"
          value={zone.height}
          onChange={(height) => onChange({ ...zone, height: Math.min(height, 1 - zone.y) })}
          disabled={disabled}
        />
      </FieldGroup>
      <FieldGroup horizontal>
        <FractionPercentField
          id="zone-x"
          label="X"
          value={zone.x}
          onChange={(x) => onChange({ ...zone, x: Math.min(x, 1 - zone.width) })}
          disabled={disabled}
        />
        <FractionPercentField
          id="zone-y"
          label="Y"
          value={zone.y}
          onChange={(y) => onChange({ ...zone, y: Math.min(y, 1 - zone.height) })}
          disabled={disabled}
        />
      </FieldGroup>
    </Field>
  );
}

export function TargetPad({
  targets,
  onChange,
  disabled,
  label,
  hint,
  addLabel,
  removeLabel,
}: {
  targets: { id: string; x: number; y: number }[];
  onChange: (targets: { id: string; x: number; y: number }[]) => void;
  disabled?: boolean;
  label: string;
  hint?: string;
  addLabel: string;
  removeLabel: string;
}) {
  return (
    <Field label={label} hint={hint}>
      <div className="studio-zone-pad studio-target-pad">
        {targets.map((t, idx) => (
          <button
            key={t.id}
            type="button"
            className="studio-target-dot"
            style={{ left: `${t.x * 100}%`, top: `${t.y * 100}%` }}
            disabled={disabled}
            title={`${t.id} (${Math.round(t.x * 100)}%, ${Math.round(t.y * 100)}%)`}
            onClick={() => {
              // Cycle preset positions on click
              const presets = [
                { x: 0.5, y: 0.5 },
                { x: 0.25, y: 0.35 },
                { x: 0.75, y: 0.35 },
                { x: 0.25, y: 0.7 },
                { x: 0.75, y: 0.7 },
              ];
              const next = presets[(idx + 1) % presets.length]!;
              onChange(targets.map((item, i) => (i === idx ? { ...item, ...next } : item)));
            }}
          >
            {idx + 1}
          </button>
        ))}
      </div>
      <p className="field-hint studio-inline-hint">{hint}</p>
      <div className="studio-target-actions">
        {targets.length < 4 ? (
          <button
            type="button"
            className="btn btn-ghost"
            disabled={disabled}
            onClick={() =>
              onChange([
                ...targets,
                {
                  id: `t${targets.length + 1}`,
                  x: 0.5 + (targets.length % 2) * 0.2 - 0.1,
                  y: 0.4 + Math.floor(targets.length / 2) * 0.2,
                },
              ])
            }
          >
            + {addLabel}
          </button>
        ) : null}
        {targets.length > 1 ? (
          <button
            type="button"
            className="btn btn-ghost"
            disabled={disabled}
            onClick={() => onChange(targets.slice(0, -1))}
          >
            {removeLabel}
          </button>
        ) : null}
      </div>
    </Field>
  );
}

export function OrderedChipEditor({
  label,
  hint,
  values,
  options,
  onChange,
  localize,
  disabled,
}: {
  label: string;
  hint?: string;
  values: string[];
  options: readonly { value: string; labelKey: string }[];
  onChange: (values: string[]) => void;
  localize: (labelKey: string) => string;
  disabled?: boolean;
}) {
  return (
    <Field label={label} hint={hint}>
      <div className="studio-ordered-chips">
        {values.map((v, idx) => {
          const opt = options.find((o) => o.value === v);
          return (
            <span key={`${v}-${idx}`} className="studio-ordered-chip">
              <span>{opt ? localize(opt.labelKey) : v}</span>
              <button
                type="button"
                disabled={disabled}
                aria-label="remove"
                onClick={() => onChange(values.filter((_, i) => i !== idx))}
              >
                ×
              </button>
            </span>
          );
        })}
      </div>
      <div className="studio-preset-chips">
        {options.map((opt) => (
          <button
            key={opt.value}
            type="button"
            className="studio-preset-chip"
            disabled={disabled}
            onClick={() => onChange([...values, opt.value])}
          >
            + {localize(opt.labelKey)}
          </button>
        ))}
      </div>
    </Field>
  );
}

export function CollapsibleGroup({
  title,
  children,
  defaultOpen = false,
}: {
  title: string;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  return (
    <details className="studio-collapsible" open={defaultOpen}>
      <summary>{title}</summary>
      <div className="studio-collapsible-body">{children}</div>
    </details>
  );
}
