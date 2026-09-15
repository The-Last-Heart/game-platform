'use client';

import { useCallback, useEffect, useState } from 'react';
import type {
  AdminContentTemplateDetail,
  ChallengeDefinitionContract,
  LaunchEngineId,
} from '@thelastheart/contracts';
import { STUDIO_ENGINE_REGISTRY } from '@thelastheart/contracts';
import {
  ErrorState,
  ForbiddenState,
  LoadingState,
} from '@/components/ui/confirm-dialog';
import { useToast } from '@/components/ui/toast';
import { t } from '@/i18n/get-dictionary';
import type { Locale } from '@/i18n/locale';
import type { MessageKey } from '@/i18n/messages/en';
import { adminApiFetch } from '@/lib/api/client';
import { localizeAdminError } from '@/i18n/localize-admin-error';
import { scheduleEffectTask } from '@/lib/react/schedule-effect-task';
import { DevicePreviewFrame } from './DevicePreviewFrame';
import { FamilyParamsFields, defaultClientConfig, defaultServerConfig } from './FamilyParamsFields';
import { FieldInput, FieldSelect, FieldTextarea, FieldCheckboxGroup, FieldGroup } from './Field';
import {
  CatalogKeyField,
  ChipMultiSelect,
  DurationSecondsField,
  PresetChips,
  SegmentedChoice,
} from './OperatorControls';
import { StudioPageHeader } from './StudioPageHeader';
import { StudioSectionNav, EDITOR_SECTIONS, type EditorSection } from './StudioSectionNav';
import {
  APP_VERSION_PRESETS,
  DEVICE_CAPABILITY_OPTIONS,
  FALLBACK_KEY_OPTIONS,
  INTRO_DURATION_PRESETS_MS,
  KNOWN_ASSET_OPTIONS,
  OUTCOME_REASON_CODES,
  PROMPT_KEY_OPTIONS,
  RESULT_HOLD_PRESETS_MS,
  TIMING_DURATION_PRESETS_MS,
  WEIGHT_PRESETS,
  slugifyDefinitionId,
} from './studio-catalog-options';
import { ValidationSummary, type ValidationError } from './ValidationSummary';

// ---------------------------------------------------------------------------
// Real contract engine IDs
// ---------------------------------------------------------------------------

const ENGINE_OPTIONS: { value: string; label: string }[] = STUDIO_ENGINE_REGISTRY.map((entry) => ({
  value: entry.engineId,
  label: entry.labelKey,
}));

function localizedEngineOptions(locale: Locale): { value: string; label: string }[] {
  return ENGINE_OPTIONS.map((opt) => ({
    value: opt.value,
    label: t(locale, `studio.engine.${opt.value.split('.').pop()}` as MessageKey),
  }));
}

const MODE_OPTIONS = [
  { value: 'quick_survival', label: 'quick_survival' },
  { value: 'private', label: 'private' },
  { value: 'training', label: 'training' },
  { value: 'dev', label: 'dev' },
];

const DIFFICULTY_OPTIONS = [
  { value: 'easy', label: '' },
  { value: 'medium', label: '' },
  { value: 'hard', label: '' },
];

// ---------------------------------------------------------------------------
// Draft type — configs are objects, not strings
// ---------------------------------------------------------------------------

type DraftDefinition = {
  definitionId: string;
  definitionVersion: number;
  engineId: LaunchEngineId;
  internalTitle: string;
  familyId: string;
  categoryId: string;
  difficulty: 'easy' | 'medium' | 'hard';
  instructionAr: string;
  hintAr: string;
  promptKey: string;
  durationMs: number;
  introDurationMs: number;
  resultHoldMs: number;
  heartPenaltyOnFailure: 0 | 1;
  energyRewardOnSuccess: number;
  clientConfig: Record<string, unknown>;
  serverConfig: Record<string, unknown>;
  eligibleModes: string[];
  roundMin: string;
  roundMax: string;
  selectionWeight: number;
  repetitionCooldownRounds: number;
  minAppVersion: string;
  requiredCapabilities: string[];
  accessibilityFallbackKey: string;
  requiredAssetIds: string[];
  choiceKeys: string[];
  outcomeReasonKeys: Record<string, string>;
  validationNotes: string;
};

// ---------------------------------------------------------------------------
// Default draft — produces a valid wait_for_signal definition
// ---------------------------------------------------------------------------

function defaultDraft(): DraftDefinition {
  const engineId: LaunchEngineId = 'reaction.wait_for_signal';
  return {
    definitionId: '',
    definitionVersion: 1,
    engineId,
    internalTitle: '',
    familyId: 'reaction',
    categoryId: 'reaction.wait_for_signal',
    difficulty: 'medium',
    instructionAr: '',
    hintAr: '',
    promptKey: 'challenge.wait_for_signal.intro',
    durationMs: 5000,
    introDurationMs: 2000,
    resultHoldMs: 3000,
    heartPenaltyOnFailure: 1,
    energyRewardOnSuccess: 1,
    clientConfig: defaultClientConfig(engineId),
    serverConfig: defaultServerConfig(engineId),
    eligibleModes: ['quick_survival', 'private'],
    roundMin: '',
    roundMax: '',
    selectionWeight: 100,
    repetitionCooldownRounds: 0,
    minAppVersion: '0.0.0',
    requiredCapabilities: ['touch'],
    accessibilityFallbackKey: 'reaction.wait_for_signal.v1',
    requiredAssetIds: [],
    choiceKeys: [],
    outcomeReasonKeys: {
      success: 'challenge.outcome.success',
      failure: 'challenge.outcome.failure',
      timeout: 'challenge.outcome.timeout',
    },
    validationNotes: '',
  };
}

// ---------------------------------------------------------------------------
// Draft → contract definition
// ---------------------------------------------------------------------------

function draftToDefinition(draft: DraftDefinition): ChallengeDefinitionContract {
  const outcomeReasonKeys = Object.fromEntries(
    Object.entries(draft.outcomeReasonKeys).filter(([, v]) => v.trim().length > 0),
  );

  return {
    definitionId: draft.definitionId,
    definitionVersion: draft.definitionVersion,
    engineId: draft.engineId,
    internalTitle: draft.internalTitle,
    familyId: draft.familyId,
    categoryId: draft.categoryId,
    difficulty: draft.difficulty,
    instructionAr: draft.instructionAr,
    hintAr: draft.hintAr || undefined,
    promptKey: draft.promptKey,
    durationMs: draft.durationMs,
    introDurationMs: draft.introDurationMs || undefined,
    resultHoldMs: draft.resultHoldMs || undefined,
    heartPenaltyOnFailure: draft.heartPenaltyOnFailure,
    energyRewardOnSuccess: draft.energyRewardOnSuccess,
    clientConfig: draft.clientConfig,
    serverConfig: draft.serverConfig,
    eligibleModes: draft.eligibleModes as ChallengeDefinitionContract['eligibleModes'],
    roundMin: draft.roundMin ? Number(draft.roundMin) : undefined,
    roundMax: draft.roundMax ? Number(draft.roundMax) : undefined,
    selectionWeight: draft.selectionWeight,
    repetitionCooldownRounds: draft.repetitionCooldownRounds,
    minAppVersion: draft.minAppVersion,
    requiredCapabilities: draft.requiredCapabilities,
    accessibilityFallbackKey: draft.accessibilityFallbackKey,
    requiredAssetIds: draft.requiredAssetIds,
    choiceKeys: draft.choiceKeys.length > 0 ? draft.choiceKeys : undefined,
    outcomeReasonKeys: Object.keys(outcomeReasonKeys).length > 0 ? outcomeReasonKeys : undefined,
  };
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

function validateDraft(draft: DraftDefinition, locale: Locale): ValidationError[] {
  const errors: ValidationError[] = [];
  if (!draft.definitionId.trim()) errors.push({ path: 'definitionId', message: t(locale, 'studio.validation.required') });
  if (!draft.internalTitle.trim()) errors.push({ path: 'internalTitle', message: t(locale, 'studio.validation.required') });
  if (!draft.instructionAr.trim()) errors.push({ path: 'instructionAr', message: t(locale, 'studio.validation.missingArabic') });
  if (!draft.promptKey.trim()) errors.push({ path: 'promptKey', message: t(locale, 'studio.validation.required') });
  if (draft.durationMs < 3000 || draft.durationMs > 15_000) errors.push({ path: 'durationMs', message: t(locale, 'studio.validation.invalidRange') });
  if (draft.eligibleModes.length === 0) errors.push({ path: 'eligibleModes', message: t(locale, 'studio.validation.required') });
  if (!draft.accessibilityFallbackKey.trim()) errors.push({ path: 'accessibilityFallbackKey', message: t(locale, 'studio.validation.required') });
  if (draft.roundMin && draft.roundMax && Number(draft.roundMin) > Number(draft.roundMax)) {
    errors.push({ path: 'roundMax', message: t(locale, 'studio.validation.invalidRange') });
  }
  return errors;
}

// ---------------------------------------------------------------------------
// Engine registry helper
// ---------------------------------------------------------------------------

function registryEntryForEngine(engineId: string) {
  return STUDIO_ENGINE_REGISTRY.find((e) => e.engineId === engineId);
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

type StudioChallengeEditorProps = {
  locale: Locale;
  canDraft: boolean;
  canReview: boolean;
  mode: 'create' | 'edit';
  templateId?: string;
  initialDefinition?: ChallengeDefinitionContract;
};

function definitionToDraft(def: ChallengeDefinitionContract): DraftDefinition {
  return {
    definitionId: def.definitionId,
    definitionVersion: def.definitionVersion,
    engineId: def.engineId as LaunchEngineId,
    internalTitle: def.internalTitle,
    familyId: def.familyId,
    categoryId: def.categoryId,
    difficulty: def.difficulty,
    instructionAr: def.instructionAr,
    hintAr: def.hintAr ?? '',
    promptKey: def.promptKey,
    durationMs: def.durationMs,
    introDurationMs: def.introDurationMs ?? 2000,
    resultHoldMs: def.resultHoldMs ?? 3000,
    heartPenaltyOnFailure: def.heartPenaltyOnFailure,
    energyRewardOnSuccess: def.energyRewardOnSuccess,
    clientConfig: { ...(def.clientConfig ?? {}) },
    serverConfig: { ...(def.serverConfig ?? {}) },
    eligibleModes: [...def.eligibleModes],
    roundMin: def.roundMin?.toString() ?? '',
    roundMax: def.roundMax?.toString() ?? '',
    selectionWeight: def.selectionWeight,
    repetitionCooldownRounds: def.repetitionCooldownRounds,
    minAppVersion: def.minAppVersion,
    requiredCapabilities: [...(def.requiredCapabilities ?? [])],
    accessibilityFallbackKey: def.accessibilityFallbackKey,
    requiredAssetIds: [...(def.requiredAssetIds ?? [])],
    choiceKeys: [...(def.choiceKeys ?? [])],
    outcomeReasonKeys: { ...(def.outcomeReasonKeys ?? {}) },
    validationNotes: '',
  };
}

export function StudioChallengeEditor({
  locale,
  canDraft,
  canReview: _canReview,
  mode,
  templateId,
  initialDefinition,
}: StudioChallengeEditorProps) {
  void _canReview;
  const { pushToast } = useToast();
  const [activeSection, setActiveSection] = useState<EditorSection>('identity');
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [loadState, setLoadState] = useState<'idle' | 'loading' | 'ready' | 'error' | 'forbidden'>(
    mode === 'edit' && !initialDefinition ? 'loading' : 'ready',
  );
  const [loadError, setLoadError] = useState<string | null>(null);
  const [draft, setDraft] = useState<DraftDefinition>(() => {
    if (initialDefinition) {
      return definitionToDraft(initialDefinition);
    }
    return defaultDraft();
  });

  const loadExisting = useCallback(async () => {
    if (mode !== 'edit' || !templateId || initialDefinition) {
      setLoadState('ready');
      return;
    }
    setLoadState('loading');
    const result = await adminApiFetch<AdminContentTemplateDetail>(
      `/content/templates/${templateId}`,
    );
    if (!result.ok) {
      setLoadState(
        result.status === 403 || result.error.code === 'FORBIDDEN'
          ? 'forbidden'
          : 'error',
      );
      setLoadError(
        localizeAdminError(locale, result.error.code, result.error.message),
      );
      return;
    }
    const latest = result.data.versions[0];
    if (!latest?.definition) {
      setLoadState('error');
      setLoadError(t(locale, 'studio.detail.noVersions'));
      return;
    }
    setDraft(definitionToDraft(latest.definition));
    setLoadError(null);
    setLoadState('ready');
  }, [mode, templateId, initialDefinition, locale]);

  useEffect(() => scheduleEffectTask(() => void loadExisting()), [loadExisting]);

  const validationErrors = validateDraft(draft, locale);
  const activeSectionIndex = EDITOR_SECTIONS.indexOf(activeSection);

  if (loadState === 'loading') {
    return <LoadingState label={t(locale, 'common.loading')} />;
  }
  if (loadState === 'forbidden') {
    return <ForbiddenState label={t(locale, 'common.forbidden')} />;
  }
  if (loadState === 'error') {
    return (
      <ErrorState
        label={loadError ?? t(locale, 'common.error')}
        retryLabel={t(locale, 'common.retry')}
        onRetry={() => void loadExisting()}
      />
    );
  }

  function goToSection(section: EditorSection) {
    setActiveSection(section);
    requestAnimationFrame(() => {
      document.getElementById(`section-${section}`)?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      });
    });
  }

  function updateField<K extends keyof DraftDefinition>(key: K, value: DraftDefinition[K]) {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }

  function handleEngineChange(newEngineId: string) {
    const entry = registryEntryForEngine(newEngineId);
    if (!entry) return;
    setDraft((prev) => ({
      ...prev,
      engineId: entry.engineId,
      familyId: entry.familyId,
      categoryId: entry.categoryId,
      clientConfig: defaultClientConfig(entry.engineId),
      serverConfig: defaultServerConfig(entry.engineId),
      accessibilityFallbackKey: `${entry.engineId}.v1`,
      promptKey:
        entry.engineId === 'reaction.wait_for_signal'
          ? 'challenge.wait_for_signal.intro'
          : prev.promptKey,
    }));
  }

  // Localize mode/difficulty option labels
  const localizedModeOptions = MODE_OPTIONS.map((o) => ({
    value: o.value,
    label: t(locale, `studio.field.mode.${o.value}` as MessageKey),
  }));
  const localizedDifficultyOptions = DIFFICULTY_OPTIONS.map((o) => ({
    value: o.value,
    label: t(locale, `studio.field.difficulty.${o.value}` as MessageKey),
  }));

  async function saveDraft() {
    if (!canDraft) return;
    setSaving(true);
    const definition = draftToDefinition(draft);
    const body: Record<string, unknown> = { definition };
    if (templateId) body.templateId = templateId;
    if (draft.definitionId) body.slug = draft.definitionId;

    const result = await adminApiFetch<{ templateVersionId: string }>(
      '/content/drafts',
      { method: 'POST', body: JSON.stringify(body) },
    );
    setSaving(false);
    if (!result.ok) {
      pushToast(localizeAdminError(locale, result.error.code, result.error.message), 'error');
      return;
    }
    pushToast(t(locale, 'studio.editor.saveSuccess'), 'success');
  }

  async function submitForReview() {
    if (!canDraft) return;
    setSubmitting(true);
    const definition = draftToDefinition(draft);
    const body: Record<string, unknown> = { definition };
    if (templateId) body.templateId = templateId;
    if (draft.definitionId) body.slug = draft.definitionId;

    const result = await adminApiFetch<{ templateVersionId: string }>(
      '/content/drafts',
      { method: 'POST', body: JSON.stringify(body) },
    );
    if (!result.ok) {
      pushToast(localizeAdminError(locale, result.error.code, result.error.message), 'error');
      setSubmitting(false);
      return;
    }

    // Submit
    const submitResult = await adminApiFetch<{ templateVersionId: string }>(
      '/content/submit',
      {
        method: 'POST',
        body: JSON.stringify({
          templateVersionId: result.data.templateVersionId,
          notes: draft.validationNotes || undefined,
        }),
      },
    );
    setSubmitting(false);
    if (!submitResult.ok) {
      pushToast(localizeAdminError(locale, submitResult.error.code, submitResult.error.message), 'error');
      return;
    }
    pushToast(t(locale, 'studio.editor.submitSuccess'), 'success');
  }

  const isCreate = mode === 'create';
  const engineOptions = localizedEngineOptions(locale);

  return (
    <div className="studio-layout">
      <StudioPageHeader
        title={t(locale, isCreate ? 'studio.editor.createTitle' : 'studio.editor.editTitle')}
        subtitle={t(locale, isCreate ? 'studio.editor.createSubtitle' : 'studio.editor.editSubtitle')}
        sticky
      />

      <div className="studio-editor-workspace">
        {/* Left: section nav */}
        <StudioSectionNav
          locale={locale}
          activeSection={activeSection}
          onSectionChange={goToSection}
        />

        {/* Center: form */}
        <div className="studio-editor-form">
          {/* Section 1: Identity & ownership */}
          <div className="section-group" id="section-identity" data-active={activeSection === 'identity' ? 'true' : undefined} hidden={activeSection !== 'identity'}>
            <h3>{t(locale, 'studio.section.identity')}</h3>
            <p className="studio-section-lead">{t(locale, 'studio.editor.identityLead')}</p>
            <FieldGroup>
              <FieldInput
                id="def-title"
                label={t(locale, 'studio.field.internalTitle')}
                hint={t(locale, 'studio.field.internalTitleHint')}
                value={draft.internalTitle}
                onChange={(e) => {
                  const title = e.currentTarget.value;
                  setDraft((prev) => ({
                    ...prev,
                    internalTitle: title,
                    definitionId:
                      mode === 'create' && (!prev.definitionId || prev.definitionId === slugifyDefinitionId(prev.internalTitle))
                        ? slugifyDefinitionId(title)
                        : prev.definitionId,
                  }));
                }}
                disabled={!canDraft}
                maxLength={120}
              />
              <div className="field">
                <label htmlFor="def-id">{t(locale, 'studio.field.definitionId')}</label>
                <div className="studio-id-row">
                  <input
                    id="def-id"
                    value={draft.definitionId}
                    onChange={(e) => updateField('definitionId', e.currentTarget.value)}
                    disabled={!canDraft || mode === 'edit'}
                  />
                  {mode === 'create' && canDraft ? (
                    <button
                      type="button"
                      className="btn btn-ghost"
                      onClick={() => updateField('definitionId', slugifyDefinitionId(draft.internalTitle))}
                    >
                      {t(locale, 'studio.field.generateId')}
                    </button>
                  ) : null}
                </div>
                <span className="field-hint">{t(locale, 'studio.field.definitionIdHint')}</span>
              </div>
              <FieldSelect
                id="def-engine"
                label={t(locale, 'studio.field.engineId')}
                hint={t(locale, 'studio.field.engineIdHint')}
                value={draft.engineId}
                onChange={(e) => handleEngineChange(e.currentTarget.value)}
                options={engineOptions}
                disabled={!canDraft}
              />
              <p className="studio-inline-hint">
                {t(locale, 'studio.field.definitionVersion')}: v{draft.definitionVersion}
              </p>
            </FieldGroup>
          </div>

          {/* Section 2: Arabic content */}
          <div className="section-group" id="section-arabic" data-active={activeSection === 'arabic' ? 'true' : undefined} hidden={activeSection !== 'arabic'}>
            <h3>{t(locale, 'studio.section.arabic')}</h3>
            <p className="studio-section-lead">{t(locale, 'studio.editor.arabicLead')}</p>
            <FieldGroup>
              <FieldTextarea
                id="def-instruction-ar"
                label={t(locale, 'studio.field.instructionAr')}
                hint={t(locale, 'studio.field.instructionArHint')}
                value={draft.instructionAr}
                onChange={(e) => updateField('instructionAr', e.currentTarget.value)}
                disabled={!canDraft}
                dir="rtl"
                maxLength={500}
              />
              <FieldTextarea
                id="def-hint-ar"
                label={t(locale, 'studio.field.hintAr')}
                hint={t(locale, 'studio.field.hintArHint')}
                value={draft.hintAr}
                onChange={(e) => updateField('hintAr', e.currentTarget.value)}
                disabled={!canDraft}
                dir="rtl"
                maxLength={500}
              />
              <CatalogKeyField
                id="def-prompt-key"
                label={t(locale, 'studio.field.promptKey')}
                hint={t(locale, 'studio.field.promptKeyHint')}
                value={draft.promptKey}
                onChange={(v) => updateField('promptKey', v)}
                options={PROMPT_KEY_OPTIONS}
                localize={(k) => t(locale, k as MessageKey)}
                disabled={!canDraft}
              />
              <div className="field">
                <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>
                  {t(locale, 'studio.field.outcomeReasonKeys')}
                </span>
                <span className="field-hint">{t(locale, 'studio.field.outcomeReasonKeysHint')}</span>
                <div className="studio-outcome-grid">
                  {OUTCOME_REASON_CODES.map((code) => (
                    <CatalogKeyField
                      key={code}
                      id={`outcome-${code}`}
                      label={t(locale, `studio.outcome.${code}` as MessageKey)}
                      value={draft.outcomeReasonKeys[code] ?? ''}
                      onChange={(v) =>
                        updateField('outcomeReasonKeys', {
                          ...draft.outcomeReasonKeys,
                          [code]: v,
                        })
                      }
                      options={PROMPT_KEY_OPTIONS}
                      localize={(k) => t(locale, k as MessageKey)}
                      disabled={!canDraft}
                    />
                  ))}
                </div>
              </div>
            </FieldGroup>
          </div>

          {/* Section 3: Family & classification */}
          <div className="section-group" id="section-classification" data-active={activeSection === 'classification' ? 'true' : undefined} hidden={activeSection !== 'classification'}>
            <h3>{t(locale, 'studio.section.classification')}</h3>
            <p className="studio-section-lead">{t(locale, 'studio.editor.classificationLead')}</p>
            <FieldGroup>
              <SegmentedChoice
                label={t(locale, 'studio.field.difficulty')}
                hint={t(locale, 'studio.field.difficultyHint')}
                value={draft.difficulty}
                options={localizedDifficultyOptions}
                onChange={(v) => updateField('difficulty', v as 'easy' | 'medium' | 'hard')}
                disabled={!canDraft}
              />
              <p className="studio-inline-hint">
                {t(locale, 'studio.field.familyId')}: <strong>{draft.familyId}</strong>
                {' · '}
                {t(locale, 'studio.field.categoryId')}: <strong>{draft.categoryId}</strong>
              </p>
            </FieldGroup>
          </div>

          {/* Section 4: Timing */}
          <div className="section-group" id="section-timing" data-active={activeSection === 'timing' ? 'true' : undefined} hidden={activeSection !== 'timing'}>
            <h3>{t(locale, 'studio.section.timing')}</h3>
            <p className="studio-section-lead">{t(locale, 'studio.editor.timingLead')}</p>
            <FieldGroup>
              <DurationSecondsField
                id="def-duration"
                label={t(locale, 'studio.field.durationMs')}
                hint={t(locale, 'studio.field.durationMsHint')}
                valueMs={draft.durationMs}
                onChangeMs={(ms) => updateField('durationMs', Math.min(15_000, Math.max(3000, ms)))}
                minSec={3}
                maxSec={8}
                stepSec={0.5}
                presets={TIMING_DURATION_PRESETS_MS.map((p) => ({
                  ms: p.ms,
                  label: t(locale, p.labelKey as MessageKey),
                }))}
                disabled={!canDraft}
              />
              <DurationSecondsField
                id="def-intro-duration"
                label={t(locale, 'studio.field.introDurationMs')}
                hint={t(locale, 'studio.field.introDurationMsHint')}
                valueMs={draft.introDurationMs}
                onChangeMs={(ms) => updateField('introDurationMs', ms)}
                minSec={0}
                maxSec={5}
                presets={INTRO_DURATION_PRESETS_MS.map((p) => ({
                  ms: p.ms,
                  label: t(locale, p.labelKey as MessageKey),
                }))}
                disabled={!canDraft}
              />
              <DurationSecondsField
                id="def-result-hold"
                label={t(locale, 'studio.field.resultHoldMs')}
                hint={t(locale, 'studio.field.resultHoldMsHint')}
                valueMs={draft.resultHoldMs}
                onChangeMs={(ms) => updateField('resultHoldMs', ms)}
                minSec={0}
                maxSec={10}
                presets={RESULT_HOLD_PRESETS_MS.map((p) => ({
                  ms: p.ms,
                  label: t(locale, p.labelKey as MessageKey),
                }))}
                disabled={!canDraft}
              />
            </FieldGroup>
          </div>

          {/* Section 5: Engine parameters — typed family fields */}
          <div className="section-group" id="section-familyParams" data-active={activeSection === 'familyParams' ? 'true' : undefined} hidden={activeSection !== 'familyParams'}>
            <h3>{t(locale, 'studio.section.familyParams')}</h3>
            <FamilyParamsFields
              locale={locale}
              engineId={draft.engineId}
              clientConfig={draft.clientConfig}
              serverConfig={draft.serverConfig}
              onClientChange={(config) => updateField('clientConfig', config)}
              onServerChange={(config) => updateField('serverConfig', config)}
              disabled={!canDraft}
            />
          </div>

          {/* Section 6: Input & behavior */}
          <div className="section-group" id="section-behavior" data-active={activeSection === 'behavior' ? 'true' : undefined} hidden={activeSection !== 'behavior'}>
            <h3>{t(locale, 'studio.section.behavior')}</h3>
            <p className="studio-section-lead">{t(locale, 'studio.field.fp.behaviorNote' as MessageKey)}</p>
          </div>

          {/* Section 7: Heart & energy effects */}
          <div className="section-group" id="section-effects" data-active={activeSection === 'effects' ? 'true' : undefined} hidden={activeSection !== 'effects'}>
            <h3>{t(locale, 'studio.section.effects')}</h3>
            <p className="studio-section-lead">{t(locale, 'studio.editor.effectsLead')}</p>
            <FieldGroup>
              <SegmentedChoice
                label={t(locale, 'studio.field.heartPenaltyOnFailure')}
                hint={t(locale, 'studio.field.heartPenaltyHint')}
                value={String(draft.heartPenaltyOnFailure)}
                options={[
                  { value: '0', label: t(locale, 'studio.field.heartPenalty.none') },
                  { value: '1', label: t(locale, 'studio.field.heartPenalty.one') },
                ]}
                onChange={(v) => updateField('heartPenaltyOnFailure', Number(v) as 0 | 1)}
                disabled={!canDraft}
              />
              <SegmentedChoice
                label={t(locale, 'studio.field.energyRewardOnSuccess')}
                hint={t(locale, 'studio.field.energyRewardHint')}
                value={String(draft.energyRewardOnSuccess)}
                options={[0, 1, 2, 3].map((n) => ({
                  value: String(n),
                  label: String(n),
                }))}
                onChange={(v) => updateField('energyRewardOnSuccess', Number(v))}
                disabled={!canDraft}
              />
            </FieldGroup>
          </div>

          {/* Section 8: Assets, sounds, haptics */}
          <div className="section-group" id="section-assets" data-active={activeSection === 'assets' ? 'true' : undefined} hidden={activeSection !== 'assets'}>
            <h3>{t(locale, 'studio.section.assets')}</h3>
            <p className="studio-section-lead">{t(locale, 'studio.editor.assetsLead')}</p>
            <ChipMultiSelect
              label={t(locale, 'studio.field.requiredAssetIds')}
              hint={t(locale, 'studio.field.requiredAssetIdsHint')}
              options={KNOWN_ASSET_OPTIONS}
              selected={draft.requiredAssetIds}
              onChange={(selected) => updateField('requiredAssetIds', selected)}
              localize={(k) => t(locale, k as MessageKey)}
              disabled={!canDraft}
            />
          </div>

          {/* Section 9: Capability & accessibility */}
          <div className="section-group" id="section-accessibility" data-active={activeSection === 'accessibility' ? 'true' : undefined} hidden={activeSection !== 'accessibility'}>
            <h3>{t(locale, 'studio.section.accessibility')}</h3>
            <p className="studio-section-lead">{t(locale, 'studio.editor.accessibilityLead')}</p>
            <ChipMultiSelect
              label={t(locale, 'studio.field.requiredCapabilities')}
              hint={t(locale, 'studio.field.requiredCapabilitiesHint')}
              options={DEVICE_CAPABILITY_OPTIONS}
              selected={draft.requiredCapabilities}
              onChange={(selected) => updateField('requiredCapabilities', selected)}
              localize={(k) => t(locale, k as MessageKey)}
              disabled={!canDraft}
            />
            <CatalogKeyField
              id="def-fallback"
              label={t(locale, 'studio.field.accessibilityFallbackKey')}
              hint={t(locale, 'studio.field.accessibilityFallbackHint')}
              value={draft.accessibilityFallbackKey}
              onChange={(v) => updateField('accessibilityFallbackKey', v)}
              options={FALLBACK_KEY_OPTIONS}
              localize={(k) => t(locale, k as MessageKey)}
              disabled={!canDraft}
            />
          </div>

          {/* Section 10: Mode & eligibility */}
          <div className="section-group" id="section-eligibility" data-active={activeSection === 'eligibility' ? 'true' : undefined} hidden={activeSection !== 'eligibility'}>
            <h3>{t(locale, 'studio.section.eligibility')}</h3>
            <p className="studio-section-lead">{t(locale, 'studio.editor.eligibilityLead')}</p>
            <FieldGroup>
              <FieldCheckboxGroup
                label={t(locale, 'studio.field.eligibleModes')}
                options={localizedModeOptions}
                selected={draft.eligibleModes}
                onChange={(selected) => updateField('eligibleModes', selected)}
              />
              <SegmentedChoice
                label={t(locale, 'studio.field.roundBand')}
                hint={t(locale, 'studio.field.roundBandHint')}
                value={!draft.roundMin && !draft.roundMax ? 'any' : 'limited'}
                options={[
                  { value: 'any', label: t(locale, 'studio.field.roundAny') },
                  { value: 'limited', label: t(locale, 'studio.field.roundLimited') },
                ]}
                onChange={(v) => {
                  if (v === 'any') {
                    updateField('roundMin', '');
                    updateField('roundMax', '');
                  } else {
                    updateField('roundMin', draft.roundMin || '1');
                    updateField('roundMax', draft.roundMax || '10');
                  }
                }}
                disabled={!canDraft}
              />
              {draft.roundMin || draft.roundMax ? (
                <FieldGroup horizontal>
                  <FieldSelect
                    id="def-round-min"
                    label={t(locale, 'studio.field.roundMin')}
                    value={draft.roundMin || '1'}
                    options={Array.from({ length: 20 }, (_, i) => ({
                      value: String(i + 1),
                      label: t(locale, 'studio.field.roundN').replace('{n}', String(i + 1)),
                    }))}
                    onChange={(e) => updateField('roundMin', e.currentTarget.value)}
                    disabled={!canDraft}
                  />
                  <FieldSelect
                    id="def-round-max"
                    label={t(locale, 'studio.field.roundMax')}
                    value={draft.roundMax || '10'}
                    options={Array.from({ length: 20 }, (_, i) => ({
                      value: String(i + 1),
                      label: t(locale, 'studio.field.roundN').replace('{n}', String(i + 1)),
                    }))}
                    onChange={(e) => updateField('roundMax', e.currentTarget.value)}
                    disabled={!canDraft}
                  />
                </FieldGroup>
              ) : null}
              <div className="field">
                <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>
                  {t(locale, 'studio.field.selectionWeight')}
                </span>
                <span className="field-hint">{t(locale, 'studio.field.selectionWeightHint')}</span>
                <PresetChips
                  presets={WEIGHT_PRESETS.map((p) => ({
                    value: p.value,
                    label: t(locale, p.labelKey as MessageKey),
                  }))}
                  activeValue={draft.selectionWeight}
                  onSelect={(v) => updateField('selectionWeight', Number(v))}
                  disabled={!canDraft}
                />
              </div>
              <SegmentedChoice
                label={t(locale, 'studio.field.repetitionCooldownRounds')}
                hint={t(locale, 'studio.field.repetitionCooldownHint')}
                value={String(draft.repetitionCooldownRounds)}
                options={[0, 1, 2, 3, 5].map((n) => ({
                  value: String(n),
                  label:
                    n === 0
                      ? t(locale, 'studio.field.cooldownNone')
                      : t(locale, 'studio.field.cooldownN').replace('{n}', String(n)),
                }))}
                onChange={(v) => updateField('repetitionCooldownRounds', Number(v))}
                disabled={!canDraft}
              />
            </FieldGroup>
          </div>

          {/* Section 11: Version & app support */}
          <div className="section-group" id="section-versioning" data-active={activeSection === 'versioning' ? 'true' : undefined} hidden={activeSection !== 'versioning'}>
            <h3>{t(locale, 'studio.section.versioning')}</h3>
            <p className="studio-section-lead">{t(locale, 'studio.editor.versioningLead')}</p>
            <CatalogKeyField
              id="def-min-app"
              label={t(locale, 'studio.field.minAppVersion')}
              hint={t(locale, 'studio.field.minAppVersionHint')}
              value={draft.minAppVersion}
              onChange={(v) => updateField('minAppVersion', v)}
              options={APP_VERSION_PRESETS.map((p) => ({
                value: p.value,
                labelKey: p.labelKey,
              }))}
              localize={(k) => t(locale, k as MessageKey)}
              disabled={!canDraft}
            />
          </div>

          {/* Section 12: Review notes */}
          <div className="section-group" id="section-review" data-active={activeSection === 'review' ? 'true' : undefined} hidden={activeSection !== 'review'}>
            <h3>{t(locale, 'studio.section.review')}</h3>
            <FieldGroup>
              <FieldTextarea
                id="def-notes"
                label={t(locale, 'studio.field.validationNotes')}
                hint={t(locale, 'studio.field.validationNotesHint')}
                value={draft.validationNotes}
                onChange={(e) => updateField('validationNotes', e.currentTarget.value)}
                disabled={!canDraft}
                maxLength={2000}
              />
            </FieldGroup>
          </div>
        </div>

        {/* Right: preview */}
        <DevicePreviewFrame
          locale={locale}
          challengeTitle={draft.internalTitle}
          instructionAr={draft.instructionAr}
          durationMs={draft.durationMs}
          engineId={draft.engineId}
        />
      </div>

      {/* Sticky footer */}
      <div className="studio-editor-footer">
        <div className="studio-section-stepper">
          <button
            type="button"
            className="btn btn-ghost"
            disabled={activeSectionIndex <= 0}
            onClick={() => goToSection(EDITOR_SECTIONS[activeSectionIndex - 1]!)}
          >
            {t(locale, 'studio.editor.prevSection')}
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            disabled={activeSectionIndex >= EDITOR_SECTIONS.length - 1}
            onClick={() => goToSection(EDITOR_SECTIONS[activeSectionIndex + 1]!)}
          >
            {t(locale, 'studio.editor.nextSection')}
          </button>
        </div>
        <ValidationSummary locale={locale} errors={validationErrors} />
        {canDraft ? (
          <div className="footer-actions">
            <button
              type="button"
              className="btn btn-secondary"
              disabled={saving || submitting}
              onClick={() => void saveDraft()}
            >
              {saving ? t(locale, 'studio.editor.saving') : t(locale, 'studio.editor.saveDraft')}
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={saving || submitting || validationErrors.length > 0}
              onClick={() => void submitForReview()}
            >
              {submitting ? t(locale, 'studio.editor.submitting') : t(locale, 'studio.editor.submit')}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
