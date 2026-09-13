'use client';

import { useState } from 'react';
import type { LaunchEngineId } from '@thelastheart/contracts';
import { oppositeSwipeDirection } from '@thelastheart/contracts';
import type { SwipeDirection } from '@thelastheart/contracts';
import { t } from '@/i18n/get-dictionary';
import type { Locale } from '@/i18n/locale';
import type { MessageKey } from '@/i18n/messages/en';
import { FieldInput, FieldSelect, FieldGroup, FieldCheckboxGroup } from './Field';

// ---------------------------------------------------------------------------
// Engine-specific default configs
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Props & helper types
// ---------------------------------------------------------------------------

type FamilyParamsFieldsProps = {
  locale: Locale;
  engineId: LaunchEngineId;
  clientConfig: Record<string, unknown>;
  serverConfig: Record<string, unknown>;
  onClientChange: (config: Record<string, unknown>) => void;
  onServerChange: (config: Record<string, unknown>) => void;
  disabled?: boolean;
};

function lbl(locale: Locale, key: string): string {
  return t(locale, `studio.field.${key}` as MessageKey);
}

// ---------------------------------------------------------------------------
// Per-engine field panels
// ---------------------------------------------------------------------------

function ReactionWaitForSignalFields({ locale, clientConfig, serverConfig, onClientChange, onServerChange, disabled }: FamilyParamsFieldsProps) {
  const cc = clientConfig as Record<string, string | undefined>;
  const sc = serverConfig as Record<string, number>;

  return (
    <>
      <FieldGroup>
        <FieldInput id="fp-categoryKey" label={lbl(locale, 'fp.categoryKey')} hint={lbl(locale, 'fp.categoryKeyHint')}
          value={cc.categoryKey ?? ''} onChange={(e) => onClientChange({ ...clientConfig, categoryKey: e.currentTarget.value })} disabled={disabled} />
        <FieldInput id="fp-waitingPromptKey" label={lbl(locale, 'fp.waitingPromptKey')}
          value={cc.waitingPromptKey ?? ''} onChange={(e) => onClientChange({ ...clientConfig, waitingPromptKey: e.currentTarget.value })} disabled={disabled} />
        <FieldInput id="fp-waitingHintKey" label={lbl(locale, 'fp.waitingHintKey')}
          value={cc.waitingHintKey ?? ''} onChange={(e) => onClientChange({ ...clientConfig, waitingHintKey: e.currentTarget.value })} disabled={disabled} />
        <FieldInput id="fp-activePromptKey" label={lbl(locale, 'fp.activePromptKey')}
          value={cc.activePromptKey ?? ''} onChange={(e) => onClientChange({ ...clientConfig, activePromptKey: e.currentTarget.value })} disabled={disabled} />
        <FieldInput id="fp-actionKey" label={lbl(locale, 'fp.actionKey')}
          value={cc.actionKey ?? ''} onChange={(e) => onClientChange({ ...clientConfig, actionKey: e.currentTarget.value })} disabled={disabled} />
        <FieldInput id="fp-shapeKey" label={lbl(locale, 'fp.shapeKey')} hint={lbl(locale, 'fp.shapeKeyHint')}
          value={(cc.shapeKey as string) ?? ''} onChange={(e) => onClientChange({ ...clientConfig, shapeKey: e.currentTarget.value || undefined })} disabled={disabled} />
      </FieldGroup>
      <FieldGroup horizontal>
        <FieldInput id="fp-signalDelayMs" label={lbl(locale, 'fp.signalDelayMs')} type="number" min={0} max={60000} step={100}
          value={sc.signalDelayMs ?? 1500} onChange={(e) => onServerChange({ ...serverConfig, signalDelayMs: Number(e.currentTarget.value) })} disabled={disabled} />
        <FieldInput id="fp-signalWindowMs" label={lbl(locale, 'fp.signalWindowMs')} type="number" min={1} max={60000} step={100}
          value={sc.signalWindowMs ?? 750} onChange={(e) => onServerChange({ ...serverConfig, signalWindowMs: Number(e.currentTarget.value) })} disabled={disabled} />
      </FieldGroup>
    </>
  );
}

function TrapNoTouchFields({ locale, clientConfig, serverConfig, onClientChange, onServerChange, disabled }: FamilyParamsFieldsProps) {
  const cc = clientConfig as Record<string, unknown>;
  const zone = (cc.zone as { x: number; y: number; width: number; height: number }) ?? { x: 0.1, y: 0.1, width: 0.8, height: 0.8 };
  const sc = serverConfig as Record<string, unknown>;

  return (
    <>
      <FieldGroup>
        <FieldInput id="fp-nt-categoryKey" label={lbl(locale, 'fp.categoryKey')} hint={lbl(locale, 'fp.categoryKeyHint')}
          value={(cc.categoryKey as string) ?? ''} onChange={(e) => onClientChange({ ...clientConfig, categoryKey: e.currentTarget.value })} disabled={disabled} />
        <FieldInput id="fp-nt-promptKey" label={lbl(locale, 'fp.promptKey')}
          value={(cc.promptKey as string) ?? ''} onChange={(e) => onClientChange({ ...clientConfig, promptKey: e.currentTarget.value })} disabled={disabled} />
        <FieldInput id="fp-nt-zoneHintKey" label={lbl(locale, 'fp.zoneHintKey')}
          value={(cc.zoneHintKey as string) ?? ''} onChange={(e) => onClientChange({ ...clientConfig, zoneHintKey: e.currentTarget.value })} disabled={disabled} />
      </FieldGroup>
      <FieldGroup horizontal>
        <FieldInput id="fp-nt-zone-x" label={lbl(locale, 'fp.zoneX')} type="number" min={0} max={1} step={0.01}
          value={zone.x} onChange={(e) => onClientChange({ ...clientConfig, zone: { ...zone, x: Number(e.currentTarget.value) } })} disabled={disabled} />
        <FieldInput id="fp-nt-zone-y" label={lbl(locale, 'fp.zoneY')} type="number" min={0} max={1} step={0.01}
          value={zone.y} onChange={(e) => onClientChange({ ...clientConfig, zone: { ...zone, y: Number(e.currentTarget.value) } })} disabled={disabled} />
        <FieldInput id="fp-nt-zone-w" label={lbl(locale, 'fp.zoneWidth')} type="number" min={0} max={1} step={0.01}
          value={zone.width} onChange={(e) => onClientChange({ ...clientConfig, zone: { ...zone, width: Number(e.currentTarget.value) } })} disabled={disabled} />
        <FieldInput id="fp-nt-zone-h" label={lbl(locale, 'fp.zoneHeight')} type="number" min={0} max={1} step={0.01}
          value={zone.height} onChange={(e) => onClientChange({ ...clientConfig, zone: { ...zone, height: Number(e.currentTarget.value) } })} disabled={disabled} />
      </FieldGroup>
      <FieldGroup>
        <FieldCheckboxGroup
          label={lbl(locale, 'fp.allowSystemGestures')}
          options={[{ value: 'true', label: lbl(locale, 'fp.allowSystemGesturesLabel') }]}
          selected={sc.allowSystemGestures === true ? ['true'] : []}
          onChange={(sel) => {
            if (sel.includes('true')) {
              onServerChange({ allowSystemGestures: true });
            } else {
              onServerChange({});
            }
          }}
        />
      </FieldGroup>
    </>
  );
}

function GestureReverseSwipeFields({ locale, clientConfig, serverConfig, onClientChange, onServerChange, disabled }: FamilyParamsFieldsProps) {
  const cc = clientConfig as Record<string, unknown>;
  const sc = serverConfig as Record<string, unknown>;
  const displayedDirection = (cc.displayedDirection as SwipeDirection) ?? 'up';

  return (
    <>
      <FieldGroup>
        <FieldInput id="fp-rs-categoryKey" label={lbl(locale, 'fp.categoryKey')} hint={lbl(locale, 'fp.categoryKeyHint')}
          value={(cc.categoryKey as string) ?? ''} onChange={(e) => onClientChange({ ...clientConfig, categoryKey: e.currentTarget.value })} disabled={disabled} />
        <FieldInput id="fp-rs-promptKey" label={lbl(locale, 'fp.promptKey')}
          value={(cc.promptKey as string) ?? ''} onChange={(e) => onClientChange({ ...clientConfig, promptKey: e.currentTarget.value })} disabled={disabled} />
        <FieldSelect id="fp-rs-displayedDirection" label={lbl(locale, 'fp.displayedDirection')}
          value={displayedDirection}
          options={[
            { value: 'up', label: lbl(locale, 'fp.direction.up') },
            { value: 'down', label: lbl(locale, 'fp.direction.down') },
            { value: 'left', label: lbl(locale, 'fp.direction.left') },
            { value: 'right', label: lbl(locale, 'fp.direction.right') },
          ]}
          onChange={(e) => {
            const dir = e.currentTarget.value as SwipeDirection;
            onClientChange({ ...clientConfig, displayedDirection: dir });
            onServerChange({ ...serverConfig, requiredDirection: oppositeSwipeDirection(dir) });
          }}
          disabled={disabled}
        />
        <FieldInput id="fp-rs-minDistancePx" label={lbl(locale, 'fp.minDistancePx')} type="number" min={1} max={2000}
          value={(cc.minDistancePx as number) ?? 100}
          onChange={(e) => {
            const v = Number(e.currentTarget.value);
            onClientChange({ ...clientConfig, minDistancePx: v });
            onServerChange({ ...serverConfig, minDistancePx: v });
          }}
          disabled={disabled}
        />
      </FieldGroup>
      <FieldGroup horizontal>
        <FieldInput id="fp-rs-requiredDirection" label={lbl(locale, 'fp.requiredDirection')}
          value={(sc.requiredDirection as string) ?? oppositeSwipeDirection(displayedDirection)}
          disabled
          readOnly
        />
        <FieldInput id="fp-rs-maxDurationMs" label={lbl(locale, 'fp.maxDurationMs')} type="number" min={1} max={60000} step={100}
          value={(sc.maxDurationMs as number) ?? 3000} onChange={(e) => onServerChange({ ...serverConfig, maxDurationMs: Number(e.currentTarget.value) })} disabled={disabled} />
      </FieldGroup>
    </>
  );
}

type TapTarget = { id: string; x: number; y: number };

function TapPrecisionFields({ locale, clientConfig, serverConfig, onClientChange, onServerChange, disabled }: FamilyParamsFieldsProps) {
  const cc = clientConfig as Record<string, unknown>;
  const targets = (cc.targets as TapTarget[]) ?? [{ id: 't1', x: 0.5, y: 0.5 }];
  const attemptCount = (cc.attemptCount as number) ?? 1;

  function syncServer(newTargets: TapTarget[], newAttemptCount: number) {
    onServerChange({ targetIds: newTargets.map((t) => t.id), attemptCount: newAttemptCount });
  }

  function updateTargets(newTargets: TapTarget[]) {
    onClientChange({ ...clientConfig, targets: newTargets });
    syncServer(newTargets, attemptCount);
  }

  return (
    <>
      <FieldGroup>
        <FieldInput id="fp-tp-categoryKey" label={lbl(locale, 'fp.categoryKey')} hint={lbl(locale, 'fp.categoryKeyHint')}
          value={(cc.categoryKey as string) ?? ''} onChange={(e) => onClientChange({ ...clientConfig, categoryKey: e.currentTarget.value })} disabled={disabled} />
        <FieldInput id="fp-tp-promptKey" label={lbl(locale, 'fp.promptKey')}
          value={(cc.promptKey as string) ?? ''} onChange={(e) => onClientChange({ ...clientConfig, promptKey: e.currentTarget.value })} disabled={disabled} />
        <FieldInput id="fp-tp-attemptCount" label={lbl(locale, 'fp.attemptCount')} type="number" min={1} max={12}
          value={attemptCount}
          onChange={(e) => {
            const v = Number(e.currentTarget.value) || 1;
            onClientChange({ ...clientConfig, attemptCount: v });
            syncServer(targets, v);
          }}
          disabled={disabled}
        />
      </FieldGroup>
      <div style={{ marginTop: '0.5rem' }}>
        <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>{lbl(locale, 'fp.targets')}</span>
        {targets.map((target, idx) => (
          <FieldGroup horizontal key={target.id}>
            <FieldInput id={`fp-tp-target-id-${idx}`} label={lbl(locale, 'fp.targetId')}
              value={target.id}
              onChange={(e) => {
                const next = targets.map((t, i) => i === idx ? { ...t, id: e.currentTarget.value } : t);
                updateTargets(next);
              }}
              disabled={disabled}
            />
            <FieldInput id={`fp-tp-target-x-${idx}`} label="X" type="number" min={0} max={1} step={0.01}
              value={target.x}
              onChange={(e) => {
                const next = targets.map((t, i) => i === idx ? { ...t, x: Number(e.currentTarget.value) } : t);
                updateTargets(next);
              }}
              disabled={disabled}
            />
            <FieldInput id={`fp-tp-target-y-${idx}`} label="Y" type="number" min={0} max={1} step={0.01}
              value={target.y}
              onChange={(e) => {
                const next = targets.map((t, i) => i === idx ? { ...t, y: Number(e.currentTarget.value) } : t);
                updateTargets(next);
              }}
              disabled={disabled}
            />
            {targets.length > 1 ? (
              <button type="button" className="btn btn-ghost" style={{ fontSize: '0.8rem', marginTop: '1.4rem' }}
                onClick={() => updateTargets(targets.filter((_, i) => i !== idx))} disabled={disabled}>
                ✕
              </button>
            ) : null}
          </FieldGroup>
        ))}
        {targets.length < 4 ? (
          <button type="button" className="btn btn-ghost" style={{ fontSize: '0.85rem', marginTop: '0.25rem' }}
            onClick={() => updateTargets([...targets, { id: `t${targets.length + 1}`, x: 0.5, y: 0.5 }])} disabled={disabled}>
            + {lbl(locale, 'fp.addTarget')}
          </button>
        ) : null}
      </div>
    </>
  );
}

function MemorySequenceFields({ locale, clientConfig, serverConfig, onClientChange, onServerChange, disabled }: FamilyParamsFieldsProps) {
  const cc = clientConfig as Record<string, unknown>;
  const sc = serverConfig as Record<string, unknown>;
  const optionKeys = (cc.optionKeys as string[]) ?? [];
  const sequence = (sc.sequence as string[]) ?? [];
  const previewMs = (cc.previewMs as number) ?? 2000;

  return (
    <>
      <FieldGroup>
        <FieldInput id="fp-ms-categoryKey" label={lbl(locale, 'fp.categoryKey')} hint={lbl(locale, 'fp.categoryKeyHint')}
          value={(cc.categoryKey as string) ?? ''} onChange={(e) => onClientChange({ ...clientConfig, categoryKey: e.currentTarget.value })} disabled={disabled} />
        <FieldInput id="fp-ms-promptKey" label={lbl(locale, 'fp.promptKey')}
          value={(cc.promptKey as string) ?? ''} onChange={(e) => onClientChange({ ...clientConfig, promptKey: e.currentTarget.value })} disabled={disabled} />
        <FieldInput id="fp-ms-optionKeys" label={lbl(locale, 'fp.optionKeys')} hint={lbl(locale, 'fp.optionKeysHint')}
          value={optionKeys.join(', ')}
          onChange={(e) => {
            const keys = e.currentTarget.value.split(',').map((s) => s.trim()).filter(Boolean);
            onClientChange({ ...clientConfig, optionKeys: keys });
            onServerChange({ ...serverConfig, optionKeys: keys });
          }}
          disabled={disabled}
        />
        <FieldInput id="fp-ms-sequence" label={lbl(locale, 'fp.sequence')} hint={lbl(locale, 'fp.sequenceHint')}
          value={sequence.join(', ')}
          onChange={(e) => {
            const seq = e.currentTarget.value.split(',').map((s) => s.trim()).filter(Boolean);
            onServerChange({ ...serverConfig, sequence: seq });
          }}
          disabled={disabled}
        />
        <FieldInput id="fp-ms-previewMs" label={lbl(locale, 'fp.previewMs')} type="number" min={1} max={60000} step={100}
          value={previewMs}
          onChange={(e) => {
            const v = Number(e.currentTarget.value);
            onClientChange({ ...clientConfig, previewMs: v });
            onServerChange({ ...serverConfig, previewMs: v });
          }}
          disabled={disabled}
        />
      </FieldGroup>
    </>
  );
}

function HoldMultitouchFields({ locale, clientConfig, serverConfig, onClientChange, onServerChange, disabled }: FamilyParamsFieldsProps) {
  const cc = clientConfig as Record<string, unknown>;
  const sc = serverConfig as Record<string, unknown>;
  const holdMs = (cc.holdMs as number) ?? 3000;

  return (
    <>
      <FieldGroup>
        <FieldInput id="fp-hm-categoryKey" label={lbl(locale, 'fp.categoryKey')} hint={lbl(locale, 'fp.categoryKeyHint')}
          value={(cc.categoryKey as string) ?? ''} onChange={(e) => onClientChange({ ...clientConfig, categoryKey: e.currentTarget.value })} disabled={disabled} />
        <FieldInput id="fp-hm-promptKey" label={lbl(locale, 'fp.promptKey')}
          value={(cc.promptKey as string) ?? ''} onChange={(e) => onClientChange({ ...clientConfig, promptKey: e.currentTarget.value })} disabled={disabled} />
        <FieldInput id="fp-hm-requiredContacts" label={lbl(locale, 'fp.requiredContacts')} type="number"
          value={2} disabled readOnly />
        <FieldInput id="fp-hm-holdMs" label={lbl(locale, 'fp.holdMs')} type="number" min={1} max={60000} step={100}
          value={holdMs}
          onChange={(e) => {
            const v = Number(e.currentTarget.value);
            onClientChange({ ...clientConfig, holdMs: v, requiredContacts: 2 });
            onServerChange({ ...serverConfig, holdMs: v, requiredContacts: 2 });
          }}
          disabled={disabled}
        />
        <FieldCheckboxGroup
          label={lbl(locale, 'fp.resetOnLift')}
          options={[{ value: 'true', label: lbl(locale, 'fp.resetOnLiftLabel') }]}
          selected={sc.resetOnLift === true ? ['true'] : []}
          onChange={(sel) => onServerChange({ ...serverConfig, resetOnLift: sel.includes('true') })}
        />
      </FieldGroup>
    </>
  );
}

function MotionShakeFields({ locale, clientConfig, serverConfig, onClientChange, onServerChange, disabled }: FamilyParamsFieldsProps) {
  const cc = clientConfig as Record<string, unknown>;
  const sc = serverConfig as Record<string, unknown>;

  return (
    <>
      <FieldGroup>
        <FieldInput id="fp-ms-categoryKey" label={lbl(locale, 'fp.categoryKey')} hint={lbl(locale, 'fp.categoryKeyHint')}
          value={(cc.categoryKey as string) ?? ''} onChange={(e) => onClientChange({ ...clientConfig, categoryKey: e.currentTarget.value })} disabled={disabled} />
        <FieldInput id="fp-ms-promptKey" label={lbl(locale, 'fp.promptKey')}
          value={(cc.promptKey as string) ?? ''} onChange={(e) => onClientChange({ ...clientConfig, promptKey: e.currentTarget.value })} disabled={disabled} />
        <FieldInput id="fp-ms-progressKey" label={lbl(locale, 'fp.progressKey')}
          value={(cc.progressKey as string) ?? ''} onChange={(e) => onClientChange({ ...clientConfig, progressKey: e.currentTarget.value })} disabled={disabled} />
      </FieldGroup>
      <FieldGroup horizontal>
        <FieldInput id="fp-ms-requiredShakeCount" label={lbl(locale, 'fp.requiredShakeCount')} type="number" min={1} max={100}
          value={(sc.requiredShakeCount as number) ?? 5} onChange={(e) => onServerChange({ ...serverConfig, requiredShakeCount: Number(e.currentTarget.value) })} disabled={disabled} />
        <FieldInput id="fp-ms-noiseThreshold" label={lbl(locale, 'fp.noiseThreshold')} type="number" min={0} max={100} step={0.5}
          value={(sc.noiseThreshold as number) ?? 5} onChange={(e) => onServerChange({ ...serverConfig, noiseThreshold: Number(e.currentTarget.value) })} disabled={disabled} />
      </FieldGroup>
    </>
  );
}

function MotionTiltBalanceFields({ locale, clientConfig, serverConfig, onClientChange, onServerChange, disabled }: FamilyParamsFieldsProps) {
  const cc = clientConfig as Record<string, unknown>;
  const sc = serverConfig as Record<string, unknown>;

  return (
    <>
      <FieldGroup>
        <FieldInput id="fp-tb-categoryKey" label={lbl(locale, 'fp.categoryKey')} hint={lbl(locale, 'fp.categoryKeyHint')}
          value={(cc.categoryKey as string) ?? ''} onChange={(e) => onClientChange({ ...clientConfig, categoryKey: e.currentTarget.value })} disabled={disabled} />
        <FieldInput id="fp-tb-promptKey" label={lbl(locale, 'fp.promptKey')}
          value={(cc.promptKey as string) ?? ''} onChange={(e) => onClientChange({ ...clientConfig, promptKey: e.currentTarget.value })} disabled={disabled} />
      </FieldGroup>
      <FieldGroup horizontal>
        <FieldInput id="fp-tb-targetX" label={lbl(locale, 'fp.targetX')} type="number" min={-1} max={1} step={0.01}
          value={(sc.targetX as number) ?? 0} onChange={(e) => onServerChange({ ...serverConfig, targetX: Number(e.currentTarget.value) })} disabled={disabled} />
        <FieldInput id="fp-tb-targetY" label={lbl(locale, 'fp.targetY')} type="number" min={-1} max={1} step={0.01}
          value={(sc.targetY as number) ?? 0} onChange={(e) => onServerChange({ ...serverConfig, targetY: Number(e.currentTarget.value) })} disabled={disabled} />
        <FieldInput id="fp-tb-holdMs" label={lbl(locale, 'fp.holdMs')} type="number" min={1} max={60000} step={100}
          value={(sc.holdMs as number) ?? 2000} onChange={(e) => onServerChange({ ...serverConfig, holdMs: Number(e.currentTarget.value) })} disabled={disabled} />
        <FieldInput id="fp-tb-varianceTolerance" label={lbl(locale, 'fp.varianceTolerance')} type="number" min={0} max={1} step={0.01}
          value={(sc.varianceTolerance as number) ?? 0.15} onChange={(e) => onServerChange({ ...serverConfig, varianceTolerance: Number(e.currentTarget.value) })} disabled={disabled} />
      </FieldGroup>
    </>
  );
}

function AudioCueFields({ locale, clientConfig, serverConfig, onClientChange, onServerChange, disabled }: FamilyParamsFieldsProps) {
  const cc = clientConfig as Record<string, unknown>;
  const sc = serverConfig as Record<string, unknown>;

  return (
    <>
      <FieldGroup>
        <FieldInput id="fp-ac-categoryKey" label={lbl(locale, 'fp.categoryKey')} hint={lbl(locale, 'fp.categoryKeyHint')}
          value={(cc.categoryKey as string) ?? ''} onChange={(e) => onClientChange({ ...clientConfig, categoryKey: e.currentTarget.value })} disabled={disabled} />
        <FieldInput id="fp-ac-promptKey" label={lbl(locale, 'fp.promptKey')}
          value={(cc.promptKey as string) ?? ''} onChange={(e) => onClientChange({ ...clientConfig, promptKey: e.currentTarget.value })} disabled={disabled} />
        <FieldInput id="fp-ac-visualFallbackKey" label={lbl(locale, 'fp.visualFallbackKey')}
          value={(cc.visualFallbackKey as string) ?? ''} onChange={(e) => onClientChange({ ...clientConfig, visualFallbackKey: e.currentTarget.value })} disabled={disabled} />
        <FieldInput id="fp-ac-hapticFallbackKey" label={lbl(locale, 'fp.hapticFallbackKey')}
          value={(cc.hapticFallbackKey as string) ?? ''} onChange={(e) => onClientChange({ ...clientConfig, hapticFallbackKey: e.currentTarget.value })} disabled={disabled} />
      </FieldGroup>
      <FieldGroup>
        <FieldInput id="fp-ac-pulseCount" label={lbl(locale, 'fp.pulseCount')} type="number" min={1} max={20}
          value={(sc.pulseCount as number) ?? 3} onChange={(e) => onServerChange({ ...serverConfig, pulseCount: Number(e.currentTarget.value) })} disabled={disabled} />
      </FieldGroup>
    </>
  );
}

function SocialPairSyncFields({ locale, clientConfig, serverConfig, onClientChange, onServerChange, disabled }: FamilyParamsFieldsProps) {
  const cc = clientConfig as Record<string, unknown>;
  const sc = serverConfig as Record<string, unknown>;
  const partnerRoleKeys = (cc.partnerRoleKeys as string[]) ?? [];

  return (
    <>
      <FieldGroup>
        <FieldInput id="fp-ps-categoryKey" label={lbl(locale, 'fp.categoryKey')} hint={lbl(locale, 'fp.categoryKeyHint')}
          value={(cc.categoryKey as string) ?? ''} onChange={(e) => onClientChange({ ...clientConfig, categoryKey: e.currentTarget.value })} disabled={disabled} />
        <FieldInput id="fp-ps-promptKey" label={lbl(locale, 'fp.promptKey')}
          value={(cc.promptKey as string) ?? ''} onChange={(e) => onClientChange({ ...clientConfig, promptKey: e.currentTarget.value })} disabled={disabled} />
        <FieldInput id="fp-ps-partnerRoleKeys" label={lbl(locale, 'fp.partnerRoleKeys')} hint={lbl(locale, 'fp.partnerRoleKeysHint')}
          value={partnerRoleKeys.join(', ')}
          onChange={(e) => {
            const keys = e.currentTarget.value.split(',').map((s) => s.trim()).filter(Boolean);
            onClientChange({ ...clientConfig, partnerRoleKeys: keys });
            onServerChange({ ...serverConfig, partnerRoleKeys: keys });
          }}
          disabled={disabled}
        />
        <FieldInput id="fp-ps-syncWindowMs" label={lbl(locale, 'fp.syncWindowMs')} type="number" min={1} max={60000} step={100}
          value={(sc.syncWindowMs as number) ?? 2000} onChange={(e) => onServerChange({ ...serverConfig, syncWindowMs: Number(e.currentTarget.value) })} disabled={disabled} />
      </FieldGroup>
    </>
  );
}

function TacticalRiskChoiceFields({ locale, clientConfig, serverConfig, onClientChange, onServerChange, disabled }: FamilyParamsFieldsProps) {
  const cc = clientConfig as Record<string, unknown>;
  const sc = serverConfig as Record<string, unknown>;
  const optionKeys = (cc.optionKeys as string[]) ?? [];
  const riskWeights = (sc.riskWeights as number[]) ?? [];

  return (
    <>
      <FieldGroup>
        <FieldInput id="fp-rc-categoryKey" label={lbl(locale, 'fp.categoryKey')} hint={lbl(locale, 'fp.categoryKeyHint')}
          value={(cc.categoryKey as string) ?? ''} onChange={(e) => onClientChange({ ...clientConfig, categoryKey: e.currentTarget.value })} disabled={disabled} />
        <FieldInput id="fp-rc-promptKey" label={lbl(locale, 'fp.promptKey')}
          value={(cc.promptKey as string) ?? ''} onChange={(e) => onClientChange({ ...clientConfig, promptKey: e.currentTarget.value })} disabled={disabled} />
        <FieldInput id="fp-rc-optionKeys" label={lbl(locale, 'fp.optionKeys')} hint={lbl(locale, 'fp.optionKeysHint')}
          value={optionKeys.join(', ')}
          onChange={(e) => {
            const keys = e.currentTarget.value.split(',').map((s) => s.trim()).filter(Boolean);
            onClientChange({ ...clientConfig, optionKeys: keys });
            const newWeights = keys.map((_, i) => riskWeights[i] ?? 50);
            onServerChange({ ...serverConfig, optionKeys: keys, riskWeights: newWeights });
          }}
          disabled={disabled}
        />
      </FieldGroup>
      <div style={{ marginTop: '0.5rem' }}>
        <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>{lbl(locale, 'fp.riskWeights')}</span>
        <FieldGroup horizontal>
          {optionKeys.map((key, idx) => (
            <FieldInput key={key} id={`fp-rc-weight-${idx}`} label={key} type="number" min={0} max={10000}
              value={riskWeights[idx] ?? 50}
              onChange={(e) => {
                const next = [...riskWeights];
                next[idx] = Number(e.currentTarget.value);
                onServerChange({ ...serverConfig, riskWeights: next });
              }}
              disabled={disabled}
            />
          ))}
        </FieldGroup>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Main switch component
// ---------------------------------------------------------------------------

export function FamilyParamsFields(props: FamilyParamsFieldsProps) {
  const { engineId, locale } = props;
  const [showAdvanced, setShowAdvanced] = useState(false);

  const fields = (() => {
    switch (engineId) {
      case 'reaction.wait_for_signal': return <ReactionWaitForSignalFields {...props} />;
      case 'trap.no_touch': return <TrapNoTouchFields {...props} />;
      case 'gesture.reverse_swipe': return <GestureReverseSwipeFields {...props} />;
      case 'tap.precision': return <TapPrecisionFields {...props} />;
      case 'memory.sequence': return <MemorySequenceFields {...props} />;
      case 'hold.multitouch': return <HoldMultitouchFields {...props} />;
      case 'motion.shake': return <MotionShakeFields {...props} />;
      case 'motion.tilt_balance': return <MotionTiltBalanceFields {...props} />;
      case 'audio.cue': return <AudioCueFields {...props} />;
      case 'social.pair_sync': return <SocialPairSyncFields {...props} />;
      case 'tactical.risk_choice': return <TacticalRiskChoiceFields {...props} />;
      default: return <p style={{ color: 'var(--lh-text-muted)', fontSize: '0.85rem' }}>{t(locale, 'studio.field.fp.unknownEngine' as MessageKey)}</p>;
    }
  })();

  return (
    <div>
      {fields}
      <details style={{ marginTop: '1rem' }} open={showAdvanced} onToggle={(e) => setShowAdvanced((e.target as HTMLDetailsElement).open)}>
        <summary style={{ cursor: 'pointer', fontSize: '0.8rem', color: 'var(--lh-text-muted)', userSelect: 'none' }}>
          {t(locale, 'studio.field.fp.advancedExport' as MessageKey)}
        </summary>
        <div style={{ marginTop: '0.5rem' }}>
          <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.25rem' }}>
            {t(locale, 'studio.field.clientConfig' as MessageKey)}
          </label>
          <pre style={{ background: 'var(--lh-bg-muted, #f5f5f5)', padding: '0.5rem', borderRadius: '0.25rem', fontSize: '0.75rem', overflow: 'auto', maxHeight: '12rem', whiteSpace: 'pre-wrap' }}>
            {JSON.stringify(props.clientConfig, null, 2)}
          </pre>
          <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.25rem', marginTop: '0.5rem' }}>
            {t(locale, 'studio.field.serverConfig' as MessageKey)}
          </label>
          <pre style={{ background: 'var(--lh-bg-muted, #f5f5f5)', padding: '0.5rem', borderRadius: '0.25rem', fontSize: '0.75rem', overflow: 'auto', maxHeight: '12rem', whiteSpace: 'pre-wrap' }}>
            {JSON.stringify(props.serverConfig, null, 2)}
          </pre>
        </div>
      </details>
    </div>
  );
}
