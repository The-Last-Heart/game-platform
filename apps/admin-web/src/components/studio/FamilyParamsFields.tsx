'use client';

import { useState } from 'react';
import type { LaunchEngineId } from '@thelastheart/contracts';
import { oppositeSwipeDirection } from '@thelastheart/contracts';
import type { SwipeDirection } from '@thelastheart/contracts';
import { t } from '@/i18n/get-dictionary';
import type { Locale } from '@/i18n/locale';
import type { MessageKey } from '@/i18n/messages/en';
import { FieldCheckboxGroup, FieldGroup } from './Field';
import {
  CatalogKeyField,
  CollapsibleGroup,
  DurationSecondsField,
  FractionPercentField,
  OrderedChipEditor,
  PresetChips,
  SegmentedChoice,
  TargetPad,
  ZonePad,
} from './OperatorControls';
import {
  CATEGORY_KEY_OPTIONS,
  MEMORY_OPTION_PRESETS,
  PAIR_ROLE_PRESETS,
  PROMPT_KEY_OPTIONS,
  RISK_OPTION_PRESETS,
  SHAKE_SENSITIVITY_PRESETS,
  SIGNAL_FEEL_PRESETS,
  SWIPE_DISTANCE_PRESETS,
  ZONE_PRESETS,
} from './studio-catalog-options';

export function defaultClientConfig(engineId: LaunchEngineId): Record<string, unknown> {
  switch (engineId) {
    case 'reaction.wait_for_signal':
      return {
        categoryKey: 'challenge.category.reaction',
        waitingPromptKey: 'challenge.wait_for_signal.waiting',
        waitingHintKey: 'challenge.wait_for_signal.waiting_hint',
        activePromptKey: 'challenge.wait_for_signal.active',
        actionKey: 'challenge.wait_for_signal.action',
      };
    case 'trap.no_touch':
      return {
        categoryKey: 'challenge.category.trap',
        promptKey: 'challenge.no_touch.prompt',
        zoneHintKey: 'challenge.no_touch.zone_hint',
        zone: { x: 0.1, y: 0.1, width: 0.8, height: 0.8 },
      };
    case 'gesture.reverse_swipe':
      return {
        categoryKey: 'challenge.category.gesture',
        promptKey: 'challenge.reverse_swipe.prompt',
        displayedDirection: 'up' as SwipeDirection,
        minDistancePx: 100,
      };
    case 'tap.precision':
      return {
        categoryKey: 'challenge.category.tap',
        promptKey: 'challenge.precision.prompt',
        targets: [{ id: 't1', x: 0.5, y: 0.5 }],
        attemptCount: 1,
      };
    case 'memory.sequence':
      return {
        categoryKey: 'challenge.category.memory',
        promptKey: 'challenge.memory.prompt',
        optionKeys: ['opt.a', 'opt.b', 'opt.c'],
        previewMs: 2000,
      };
    case 'hold.multitouch':
      return {
        categoryKey: 'challenge.category.hold',
        promptKey: 'challenge.hold.prompt',
        requiredContacts: 2,
        holdMs: 3000,
      };
    case 'motion.shake':
      return {
        categoryKey: 'challenge.category.motion',
        promptKey: 'challenge.shake.prompt',
        progressKey: 'challenge.shake.progress',
      };
    case 'motion.tilt_balance':
      return {
        categoryKey: 'challenge.category.motion',
        promptKey: 'challenge.tilt.prompt',
      };
    case 'audio.cue':
      return {
        categoryKey: 'challenge.category.audio',
        promptKey: 'challenge.audio.prompt',
        visualFallbackKey: 'challenge.audio.visual_fallback',
        hapticFallbackKey: 'challenge.audio.haptic_fallback',
      };
    case 'social.pair_sync':
      return {
        categoryKey: 'challenge.category.social',
        promptKey: 'challenge.pair_sync.prompt',
        partnerRoleKeys: ['role.leader', 'role.follower'],
      };
    case 'tactical.risk_choice':
      return {
        categoryKey: 'challenge.category.tactical',
        promptKey: 'challenge.risk_choice.prompt',
        optionKeys: ['option.safe', 'option.risky'],
      };
  }
}

export function defaultServerConfig(engineId: LaunchEngineId): Record<string, unknown> {
  switch (engineId) {
    case 'reaction.wait_for_signal':
      return { signalDelayMs: 1500, signalWindowMs: 750 };
    case 'trap.no_touch':
      return {};
    case 'gesture.reverse_swipe':
      return { requiredDirection: 'down' as SwipeDirection, minDistancePx: 100, maxDurationMs: 3000 };
    case 'tap.precision':
      return { targetIds: ['t1'], attemptCount: 1 };
    case 'memory.sequence':
      return { sequence: ['opt.a', 'opt.b', 'opt.c'], previewMs: 2000, optionKeys: ['opt.a', 'opt.b', 'opt.c'] };
    case 'hold.multitouch':
      return { requiredContacts: 2, holdMs: 3000, resetOnLift: true };
    case 'motion.shake':
      return { requiredShakeCount: 5, noiseThreshold: 5 };
    case 'motion.tilt_balance':
      return { targetX: 0, targetY: 0, holdMs: 2000, varianceTolerance: 0.15 };
    case 'audio.cue':
      return { pulseCount: 3 };
    case 'social.pair_sync':
      return { partnerRoleKeys: ['role.leader', 'role.follower'], syncWindowMs: 2000 };
    case 'tactical.risk_choice':
      return { optionKeys: ['option.safe', 'option.risky'], riskWeights: [30, 70] };
  }
}

type FamilyParamsFieldsProps = {
  locale: Locale;
  engineId: LaunchEngineId;
  clientConfig: Record<string, unknown>;
  serverConfig: Record<string, unknown>;
  onClientChange: (config: Record<string, unknown>) => void;
  onServerChange: (config: Record<string, unknown>) => void;
  disabled?: boolean;
};

function L(locale: Locale, key: string): string {
  return t(locale, key as MessageKey);
}

function lbl(locale: Locale, key: string): string {
  return t(locale, `studio.field.${key}` as MessageKey);
}

function CopyKeysBlock({
  locale,
  clientConfig,
  onClientChange,
  disabled,
  keys,
}: {
  locale: Locale;
  clientConfig: Record<string, unknown>;
  onClientChange: (config: Record<string, unknown>) => void;
  disabled?: boolean;
  keys: { field: string; labelKey: string }[];
}) {
  return (
    <CollapsibleGroup title={lbl(locale, 'fp.copyKeysGroup')} defaultOpen={false}>
      <FieldGroup>
        <CatalogKeyField
          id="fp-categoryKey"
          label={lbl(locale, 'fp.categoryKey')}
          hint={lbl(locale, 'fp.categoryKeyHint')}
          value={(clientConfig.categoryKey as string) ?? ''}
          onChange={(v) => onClientChange({ ...clientConfig, categoryKey: v })}
          options={CATEGORY_KEY_OPTIONS}
          localize={(k) => L(locale, k)}
          disabled={disabled}
        />
        {keys.map(({ field, labelKey }) => (
          <CatalogKeyField
            key={field}
            id={`fp-${field}`}
            label={lbl(locale, labelKey)}
            value={(clientConfig[field] as string) ?? ''}
            onChange={(v) => onClientChange({ ...clientConfig, [field]: v })}
            options={PROMPT_KEY_OPTIONS}
            localize={(k) => L(locale, k)}
            disabled={disabled}
          />
        ))}
      </FieldGroup>
    </CollapsibleGroup>
  );
}

function ReactionWaitForSignalFields(props: FamilyParamsFieldsProps) {
  const { locale, clientConfig, serverConfig, onClientChange, onServerChange, disabled } = props;
  const sc = serverConfig as Record<string, number>;
  const delay = sc.signalDelayMs ?? 1500;
  const windowMs = sc.signalWindowMs ?? 750;
  const activeFeel =
    SIGNAL_FEEL_PRESETS.find((p) => p.signalDelayMs === delay && p.signalWindowMs === windowMs)?.id ?? null;

  return (
    <>
      <p className="studio-section-lead">{lbl(locale, 'fp.waitLead')}</p>
      <SegmentedChoice
        label={lbl(locale, 'fp.signalFeel')}
        hint={lbl(locale, 'fp.signalFeelHint')}
        value={activeFeel ?? 'custom'}
        options={[
          ...SIGNAL_FEEL_PRESETS.map((p) => ({ value: p.id, label: L(locale, p.labelKey) })),
          { value: 'custom', label: L(locale, 'studio.field.customValue') },
        ]}
        onChange={(id) => {
          const preset = SIGNAL_FEEL_PRESETS.find((p) => p.id === id);
          if (preset) {
            onServerChange({
              ...serverConfig,
              signalDelayMs: preset.signalDelayMs,
              signalWindowMs: preset.signalWindowMs,
            });
          }
        }}
        disabled={disabled}
      />
      <FieldGroup horizontal>
        <DurationSecondsField
          id="fp-signalDelayMs"
          label={lbl(locale, 'fp.signalDelayMs')}
          hint={lbl(locale, 'fp.signalDelayHint')}
          valueMs={delay}
          onChangeMs={(ms) => onServerChange({ ...serverConfig, signalDelayMs: ms })}
          minSec={0}
          maxSec={8}
          disabled={disabled}
        />
        <DurationSecondsField
          id="fp-signalWindowMs"
          label={lbl(locale, 'fp.signalWindowMs')}
          hint={lbl(locale, 'fp.signalWindowHint')}
          valueMs={windowMs}
          onChangeMs={(ms) => onServerChange({ ...serverConfig, signalWindowMs: Math.max(1, ms) })}
          minSec={0.1}
          maxSec={5}
          disabled={disabled}
        />
      </FieldGroup>
      <CopyKeysBlock
        locale={locale}
        clientConfig={clientConfig}
        onClientChange={onClientChange}
        disabled={disabled}
        keys={[
          { field: 'waitingPromptKey', labelKey: 'fp.waitingPromptKey' },
          { field: 'waitingHintKey', labelKey: 'fp.waitingHintKey' },
          { field: 'activePromptKey', labelKey: 'fp.activePromptKey' },
          { field: 'actionKey', labelKey: 'fp.actionKey' },
        ]}
      />
    </>
  );
}

function TrapNoTouchFields(props: FamilyParamsFieldsProps) {
  const { locale, clientConfig, serverConfig, onClientChange, onServerChange, disabled } = props;
  const zone =
    (clientConfig.zone as { x: number; y: number; width: number; height: number }) ?? {
      x: 0.1,
      y: 0.1,
      width: 0.8,
      height: 0.8,
    };
  const sc = serverConfig as Record<string, unknown>;

  return (
    <>
      <p className="studio-section-lead">{lbl(locale, 'fp.noTouchLead')}</p>
      <div className="studio-preset-chips">
        {ZONE_PRESETS.map((p) => (
          <button
            key={p.id}
            type="button"
            className="studio-preset-chip"
            disabled={disabled}
            onClick={() => onClientChange({ ...clientConfig, zone: p.zone })}
          >
            {L(locale, p.labelKey)}
          </button>
        ))}
      </div>
      <ZonePad
        label={lbl(locale, 'fp.forbiddenZone')}
        hint={lbl(locale, 'fp.forbiddenZoneHint')}
        zone={zone}
        onChange={(next) => onClientChange({ ...clientConfig, zone: next })}
        disabled={disabled}
      />
      <FieldCheckboxGroup
        label={lbl(locale, 'fp.allowSystemGestures')}
        options={[{ value: 'true', label: lbl(locale, 'fp.allowSystemGesturesLabel') }]}
        selected={sc.allowSystemGestures === true ? ['true'] : []}
        onChange={(sel) => {
          if (sel.includes('true')) onServerChange({ allowSystemGestures: true });
          else onServerChange({});
        }}
      />
      <CopyKeysBlock
        locale={locale}
        clientConfig={clientConfig}
        onClientChange={onClientChange}
        disabled={disabled}
        keys={[
          { field: 'promptKey', labelKey: 'fp.promptKey' },
          { field: 'zoneHintKey', labelKey: 'fp.zoneHintKey' },
        ]}
      />
    </>
  );
}

function GestureReverseSwipeFields(props: FamilyParamsFieldsProps) {
  const { locale, clientConfig, serverConfig, onClientChange, onServerChange, disabled } = props;
  const displayedDirection = (clientConfig.displayedDirection as SwipeDirection) ?? 'up';
  const minDistancePx = (clientConfig.minDistancePx as number) ?? 100;
  const maxDurationMs = (serverConfig.maxDurationMs as number) ?? 3000;

  return (
    <>
      <p className="studio-section-lead">{lbl(locale, 'fp.swipeLead')}</p>
      <SegmentedChoice
        label={lbl(locale, 'fp.displayedDirection')}
        hint={lbl(locale, 'fp.displayedDirectionHint')}
        value={displayedDirection}
        options={[
          { value: 'up', label: lbl(locale, 'fp.direction.up') },
          { value: 'down', label: lbl(locale, 'fp.direction.down') },
          { value: 'left', label: lbl(locale, 'fp.direction.left') },
          { value: 'right', label: lbl(locale, 'fp.direction.right') },
        ]}
        onChange={(dir) => {
          const d = dir as SwipeDirection;
          onClientChange({ ...clientConfig, displayedDirection: d });
          onServerChange({ ...serverConfig, requiredDirection: oppositeSwipeDirection(d) });
        }}
        disabled={disabled}
      />
      <p className="studio-inline-hint">
        {lbl(locale, 'fp.requiredDirection')}:{' '}
        <strong>{lbl(locale, `fp.direction.${oppositeSwipeDirection(displayedDirection)}`)}</strong>
      </p>
      <div>
        <span className="studio-sublabel">{lbl(locale, 'fp.minDistancePx')}</span>
        <PresetChips
          presets={SWIPE_DISTANCE_PRESETS.map((p) => ({
            value: p.px,
            label: L(locale, p.labelKey),
          }))}
          activeValue={minDistancePx}
          onSelect={(v) => {
            const px = Number(v);
            onClientChange({ ...clientConfig, minDistancePx: px });
            onServerChange({ ...serverConfig, minDistancePx: px });
          }}
          disabled={disabled}
        />
      </div>
      <DurationSecondsField
        id="fp-rs-maxDurationMs"
        label={lbl(locale, 'fp.maxDurationMs')}
        hint={lbl(locale, 'fp.maxDurationHint')}
        valueMs={maxDurationMs}
        onChangeMs={(ms) => onServerChange({ ...serverConfig, maxDurationMs: ms })}
        minSec={0.5}
        maxSec={8}
        disabled={disabled}
      />
      <CopyKeysBlock
        locale={locale}
        clientConfig={clientConfig}
        onClientChange={onClientChange}
        disabled={disabled}
        keys={[{ field: 'promptKey', labelKey: 'fp.promptKey' }]}
      />
    </>
  );
}

type TapTarget = { id: string; x: number; y: number };

function TapPrecisionFields(props: FamilyParamsFieldsProps) {
  const { locale, clientConfig, serverConfig, onClientChange, onServerChange, disabled } = props;
  const targets = (clientConfig.targets as TapTarget[]) ?? [{ id: 't1', x: 0.5, y: 0.5 }];
  const attemptCount = (clientConfig.attemptCount as number) ?? 1;

  function sync(newTargets: TapTarget[], attempts: number) {
    onClientChange({ ...clientConfig, targets: newTargets, attemptCount: attempts });
    onServerChange({ targetIds: newTargets.map((t) => t.id), attemptCount: attempts });
  }

  return (
    <>
      <p className="studio-section-lead">{lbl(locale, 'fp.precisionLead')}</p>
      <SegmentedChoice
        label={lbl(locale, 'fp.attemptCount')}
        hint={lbl(locale, 'fp.attemptCountHint')}
        value={String(attemptCount)}
        options={[1, 2, 3].map((n) => ({ value: String(n), label: String(n) }))}
        onChange={(v) => sync(targets, Number(v))}
        disabled={disabled}
      />
      <TargetPad
        label={lbl(locale, 'fp.targets')}
        hint={lbl(locale, 'fp.targetsHint')}
        targets={targets}
        onChange={(next) => sync(next, attemptCount)}
        disabled={disabled}
        addLabel={lbl(locale, 'fp.addTarget')}
        removeLabel={lbl(locale, 'fp.removeTarget')}
      />
      <CopyKeysBlock
        locale={locale}
        clientConfig={clientConfig}
        onClientChange={onClientChange}
        disabled={disabled}
        keys={[{ field: 'promptKey', labelKey: 'fp.promptKey' }]}
      />
    </>
  );
}

function MemorySequenceFields(props: FamilyParamsFieldsProps) {
  const { locale, clientConfig, serverConfig, onClientChange, onServerChange, disabled } = props;
  const optionKeys = (clientConfig.optionKeys as string[]) ?? [];
  const sequence = (serverConfig.sequence as string[]) ?? [];
  const previewMs = (clientConfig.previewMs as number) ?? 2000;

  return (
    <>
      <p className="studio-section-lead">{lbl(locale, 'fp.memoryLead')}</p>
      <OrderedChipEditor
        label={lbl(locale, 'fp.optionKeys')}
        hint={lbl(locale, 'fp.optionKeysHint')}
        values={optionKeys}
        options={MEMORY_OPTION_PRESETS}
        onChange={(keys) => {
          onClientChange({ ...clientConfig, optionKeys: keys });
          onServerChange({ ...serverConfig, optionKeys: keys });
        }}
        localize={(k) => L(locale, k)}
        disabled={disabled}
      />
      <OrderedChipEditor
        label={lbl(locale, 'fp.sequence')}
        hint={lbl(locale, 'fp.sequenceHint')}
        values={sequence}
        options={MEMORY_OPTION_PRESETS}
        onChange={(seq) => onServerChange({ ...serverConfig, sequence: seq })}
        localize={(k) => L(locale, k)}
        disabled={disabled}
      />
      <DurationSecondsField
        id="fp-ms-previewMs"
        label={lbl(locale, 'fp.previewMs')}
        hint={lbl(locale, 'fp.previewMsHint')}
        valueMs={previewMs}
        onChangeMs={(ms) => {
          onClientChange({ ...clientConfig, previewMs: ms });
          onServerChange({ ...serverConfig, previewMs: ms });
        }}
        minSec={0.5}
        maxSec={8}
        presets={[
          { ms: 1500, label: L(locale, 'studio.preset.intro.brief') },
          { ms: 2000, label: L(locale, 'studio.preset.intro.standard') },
          { ms: 3000, label: L(locale, 'studio.preset.intro.clear') },
        ]}
        disabled={disabled}
      />
      <CopyKeysBlock
        locale={locale}
        clientConfig={clientConfig}
        onClientChange={onClientChange}
        disabled={disabled}
        keys={[{ field: 'promptKey', labelKey: 'fp.promptKey' }]}
      />
    </>
  );
}

function HoldMultitouchFields(props: FamilyParamsFieldsProps) {
  const { locale, clientConfig, serverConfig, onClientChange, onServerChange, disabled } = props;
  const holdMs = (clientConfig.holdMs as number) ?? 3000;
  const sc = serverConfig as Record<string, unknown>;

  return (
    <>
      <p className="studio-section-lead">{lbl(locale, 'fp.holdLead')}</p>
      <DurationSecondsField
        id="fp-hm-holdMs"
        label={lbl(locale, 'fp.holdMs')}
        hint={lbl(locale, 'fp.holdMsHint')}
        valueMs={holdMs}
        onChangeMs={(ms) => {
          onClientChange({ ...clientConfig, holdMs: ms, requiredContacts: 2 });
          onServerChange({ ...serverConfig, holdMs: ms, requiredContacts: 2 });
        }}
        minSec={1}
        maxSec={8}
        presets={[
          { ms: 2000, label: L(locale, 'studio.preset.hold.short') },
          { ms: 3000, label: L(locale, 'studio.preset.hold.standard') },
          { ms: 4500, label: L(locale, 'studio.preset.hold.long') },
        ]}
        disabled={disabled}
      />
      <FieldCheckboxGroup
        label={lbl(locale, 'fp.resetOnLift')}
        options={[{ value: 'true', label: lbl(locale, 'fp.resetOnLiftLabel') }]}
        selected={sc.resetOnLift === true ? ['true'] : []}
        onChange={(sel) => onServerChange({ ...serverConfig, resetOnLift: sel.includes('true') })}
      />
      <CopyKeysBlock
        locale={locale}
        clientConfig={clientConfig}
        onClientChange={onClientChange}
        disabled={disabled}
        keys={[{ field: 'promptKey', labelKey: 'fp.promptKey' }]}
      />
    </>
  );
}

function MotionShakeFields(props: FamilyParamsFieldsProps) {
  const { locale, clientConfig, serverConfig, onClientChange, onServerChange, disabled } = props;
  const count = (serverConfig.requiredShakeCount as number) ?? 5;
  const noise = (serverConfig.noiseThreshold as number) ?? 5;
  const active =
    SHAKE_SENSITIVITY_PRESETS.find((p) => p.requiredShakeCount === count && p.noiseThreshold === noise)
      ?.id ?? 'custom';

  return (
    <>
      <p className="studio-section-lead">{lbl(locale, 'fp.shakeLead')}</p>
      <SegmentedChoice
        label={lbl(locale, 'fp.shakeDifficulty')}
        hint={lbl(locale, 'fp.shakeDifficultyHint')}
        value={active}
        options={[
          ...SHAKE_SENSITIVITY_PRESETS.map((p) => ({ value: p.id, label: L(locale, p.labelKey) })),
          { value: 'custom', label: L(locale, 'studio.field.customValue') },
        ]}
        onChange={(id) => {
          const preset = SHAKE_SENSITIVITY_PRESETS.find((p) => p.id === id);
          if (preset) {
            onServerChange({
              ...serverConfig,
              requiredShakeCount: preset.requiredShakeCount,
              noiseThreshold: preset.noiseThreshold,
            });
          }
        }}
        disabled={disabled}
      />
      <CopyKeysBlock
        locale={locale}
        clientConfig={clientConfig}
        onClientChange={onClientChange}
        disabled={disabled}
        keys={[
          { field: 'promptKey', labelKey: 'fp.promptKey' },
          { field: 'progressKey', labelKey: 'fp.progressKey' },
        ]}
      />
    </>
  );
}

function MotionTiltBalanceFields(props: FamilyParamsFieldsProps) {
  const { locale, clientConfig, serverConfig, onClientChange, onServerChange, disabled } = props;
  const holdMs = (serverConfig.holdMs as number) ?? 2000;
  const tolerance = (serverConfig.varianceTolerance as number) ?? 0.15;

  return (
    <>
      <p className="studio-section-lead">{lbl(locale, 'fp.tiltLead')}</p>
      <DurationSecondsField
        id="fp-tb-holdMs"
        label={lbl(locale, 'fp.holdMs')}
        hint={lbl(locale, 'fp.tiltHoldHint')}
        valueMs={holdMs}
        onChangeMs={(ms) => onServerChange({ ...serverConfig, holdMs: ms })}
        minSec={0.5}
        maxSec={8}
        disabled={disabled}
      />
      <FractionPercentField
        id="fp-tb-tolerance"
        label={lbl(locale, 'fp.varianceTolerance')}
        hint={lbl(locale, 'fp.varianceToleranceHint')}
        value={tolerance}
        onChange={(v) => onServerChange({ ...serverConfig, varianceTolerance: v })}
        disabled={disabled}
      />
      <SegmentedChoice
        label={lbl(locale, 'fp.tiltTarget')}
        hint={lbl(locale, 'fp.tiltTargetHint')}
        value={
          (serverConfig.targetX as number) === 0 && (serverConfig.targetY as number) === 0
            ? 'center'
            : 'custom'
        }
        options={[
          { value: 'center', label: L(locale, 'studio.preset.tilt.center') },
          { value: 'custom', label: L(locale, 'studio.field.customValue') },
        ]}
        onChange={(v) => {
          if (v === 'center') onServerChange({ ...serverConfig, targetX: 0, targetY: 0 });
        }}
        disabled={disabled}
      />
      <CopyKeysBlock
        locale={locale}
        clientConfig={clientConfig}
        onClientChange={onClientChange}
        disabled={disabled}
        keys={[{ field: 'promptKey', labelKey: 'fp.promptKey' }]}
      />
    </>
  );
}

function AudioCueFields(props: FamilyParamsFieldsProps) {
  const { locale, clientConfig, serverConfig, onClientChange, onServerChange, disabled } = props;
  const pulseCount = (serverConfig.pulseCount as number) ?? 3;

  return (
    <>
      <p className="studio-section-lead">{lbl(locale, 'fp.audioLead')}</p>
      <SegmentedChoice
        label={lbl(locale, 'fp.pulseCount')}
        hint={lbl(locale, 'fp.pulseCountHint')}
        value={String(pulseCount)}
        options={[1, 2, 3, 4, 5].map((n) => ({ value: String(n), label: String(n) }))}
        onChange={(v) => onServerChange({ ...serverConfig, pulseCount: Number(v) })}
        disabled={disabled}
      />
      <CopyKeysBlock
        locale={locale}
        clientConfig={clientConfig}
        onClientChange={onClientChange}
        disabled={disabled}
        keys={[
          { field: 'promptKey', labelKey: 'fp.promptKey' },
          { field: 'visualFallbackKey', labelKey: 'fp.visualFallbackKey' },
          { field: 'hapticFallbackKey', labelKey: 'fp.hapticFallbackKey' },
        ]}
      />
    </>
  );
}

function SocialPairSyncFields(props: FamilyParamsFieldsProps) {
  const { locale, clientConfig, serverConfig, onClientChange, onServerChange, disabled } = props;
  const partnerRoleKeys = (clientConfig.partnerRoleKeys as string[]) ?? [];
  const syncWindowMs = (serverConfig.syncWindowMs as number) ?? 2000;

  return (
    <>
      <p className="studio-section-lead">{lbl(locale, 'fp.pairLead')}</p>
      <OrderedChipEditor
        label={lbl(locale, 'fp.partnerRoleKeys')}
        hint={lbl(locale, 'fp.partnerRoleKeysHint')}
        values={partnerRoleKeys}
        options={PAIR_ROLE_PRESETS}
        onChange={(keys) => {
          onClientChange({ ...clientConfig, partnerRoleKeys: keys });
          onServerChange({ ...serverConfig, partnerRoleKeys: keys });
        }}
        localize={(k) => L(locale, k)}
        disabled={disabled}
      />
      <DurationSecondsField
        id="fp-ps-syncWindowMs"
        label={lbl(locale, 'fp.syncWindowMs')}
        hint={lbl(locale, 'fp.syncWindowHint')}
        valueMs={syncWindowMs}
        onChangeMs={(ms) => onServerChange({ ...serverConfig, syncWindowMs: ms })}
        minSec={0.5}
        maxSec={8}
        disabled={disabled}
      />
      <CopyKeysBlock
        locale={locale}
        clientConfig={clientConfig}
        onClientChange={onClientChange}
        disabled={disabled}
        keys={[{ field: 'promptKey', labelKey: 'fp.promptKey' }]}
      />
    </>
  );
}

function TacticalRiskChoiceFields(props: FamilyParamsFieldsProps) {
  const { locale, clientConfig, serverConfig, onClientChange, onServerChange, disabled } = props;
  const optionKeys = (clientConfig.optionKeys as string[]) ?? [];
  const riskWeights = (serverConfig.riskWeights as number[]) ?? [];

  return (
    <>
      <p className="studio-section-lead">{lbl(locale, 'fp.riskLead')}</p>
      <OrderedChipEditor
        label={lbl(locale, 'fp.optionKeys')}
        hint={lbl(locale, 'fp.riskOptionsHint')}
        values={optionKeys}
        options={RISK_OPTION_PRESETS}
        onChange={(keys) => {
          onClientChange({ ...clientConfig, optionKeys: keys });
          const newWeights = keys.map((_, i) => riskWeights[i] ?? (i === 0 ? 30 : 70));
          onServerChange({ ...serverConfig, optionKeys: keys, riskWeights: newWeights });
        }}
        localize={(k) => L(locale, k)}
        disabled={disabled}
      />
      <div className="studio-risk-weights">
        {optionKeys.map((key, idx) => {
          const opt = RISK_OPTION_PRESETS.find((o) => o.value === key);
          const weight = riskWeights[idx] ?? 50;
          return (
            <div key={key} className="studio-slider-block">
              <span className="studio-sublabel">{opt ? L(locale, opt.labelKey) : key}</span>
              <div className="studio-slider-row">
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={weight}
                  disabled={disabled}
                  onChange={(e) => {
                    const next = [...riskWeights];
                    next[idx] = Number(e.currentTarget.value);
                    onServerChange({ ...serverConfig, riskWeights: next });
                  }}
                />
                <span className="studio-unit">{weight}</span>
              </div>
            </div>
          );
        })}
      </div>
      <CopyKeysBlock
        locale={locale}
        clientConfig={clientConfig}
        onClientChange={onClientChange}
        disabled={disabled}
        keys={[{ field: 'promptKey', labelKey: 'fp.promptKey' }]}
      />
    </>
  );
}

export function FamilyParamsFields(props: FamilyParamsFieldsProps) {
  const { engineId, locale } = props;
  const [showAdvanced, setShowAdvanced] = useState(false);

  const fields = (() => {
    switch (engineId) {
      case 'reaction.wait_for_signal':
        return <ReactionWaitForSignalFields {...props} />;
      case 'trap.no_touch':
        return <TrapNoTouchFields {...props} />;
      case 'gesture.reverse_swipe':
        return <GestureReverseSwipeFields {...props} />;
      case 'tap.precision':
        return <TapPrecisionFields {...props} />;
      case 'memory.sequence':
        return <MemorySequenceFields {...props} />;
      case 'hold.multitouch':
        return <HoldMultitouchFields {...props} />;
      case 'motion.shake':
        return <MotionShakeFields {...props} />;
      case 'motion.tilt_balance':
        return <MotionTiltBalanceFields {...props} />;
      case 'audio.cue':
        return <AudioCueFields {...props} />;
      case 'social.pair_sync':
        return <SocialPairSyncFields {...props} />;
      case 'tactical.risk_choice':
        return <TacticalRiskChoiceFields {...props} />;
      default:
        return (
          <p style={{ color: 'var(--lh-text-muted)', fontSize: '0.85rem' }}>
            {t(locale, 'studio.field.fp.unknownEngine' as MessageKey)}
          </p>
        );
    }
  })();

  return (
    <div>
      {fields}
      <details
        style={{ marginTop: '1rem' }}
        open={showAdvanced}
        onToggle={(e) => setShowAdvanced((e.target as HTMLDetailsElement).open)}
      >
        <summary
          style={{
            cursor: 'pointer',
            fontSize: '0.8rem',
            color: 'var(--lh-text-muted)',
            userSelect: 'none',
          }}
        >
          {t(locale, 'studio.field.fp.advancedExport' as MessageKey)}
        </summary>
        <div style={{ marginTop: '0.5rem' }}>
          <pre className="studio-json-export">{JSON.stringify(props.clientConfig, null, 2)}</pre>
          <pre className="studio-json-export">{JSON.stringify(props.serverConfig, null, 2)}</pre>
        </div>
      </details>
    </div>
  );
}
