'use client';

import { useState } from 'react';
import type { ChallengeDefinitionContract, LaunchEngineId } from '@thelastheart/contracts';
import { STUDIO_ENGINE_REGISTRY } from '@thelastheart/contracts';
import { useToast } from '@/components/ui/toast';
import { t } from '@/i18n/get-dictionary';
import type { Locale } from '@/i18n/locale';
import type { MessageKey } from '@/i18n/messages/en';
import { adminApiFetch } from '@/lib/api/client';
import { localizeAdminError } from '@/i18n/localize-admin-error';
import { DevicePreviewFrame } from './DevicePreviewFrame';
import { FamilyParamsFields, defaultClientConfig, defaultServerConfig } from './FamilyParamsFields';
import { FieldInput, FieldSelect, FieldTextarea, FieldCheckboxGroup, FieldGroup } from './Field';
import { StudioPageHeader } from './StudioPageHeader';
import { StudioSectionNav, type EditorSection } from './StudioSectionNav';
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
  requiredCapabilities: string;
  accessibilityFallbackKey: string;
  requiredAssetIds: string;
  choiceKeys: string;
  outcomeReasonKeys: string;
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
    requiredCapabilities: '',
    accessibilityFallbackKey: 'reaction.wait_for_signal.v1',
    requiredAssetIds: '',
    choiceKeys: '',
    outcomeReasonKeys: '{}',
    validationNotes: '',
  };
}

// ---------------------------------------------------------------------------
// Draft → contract definition
// ---------------------------------------------------------------------------

function draftToDefinition(draft: DraftDefinition): ChallengeDefinitionContract {
  let outcomeReasonKeys: Record<string, string> | undefined;

  try {
    const parsed = JSON.parse(draft.outcomeReasonKeys);
    if (typeof parsed === 'object' && parsed !== null) outcomeReasonKeys = parsed;
  } catch { /* keep undefined */ }

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
    requiredCapabilities: draft.requiredCapabilities
      ? draft.requiredCapabilities.split(',').map((s) => s.trim()).filter(Boolean)
      : [],
    accessibilityFallbackKey: draft.accessibilityFallbackKey,
    requiredAssetIds: draft.requiredAssetIds
      ? draft.requiredAssetIds.split(',').map((s) => s.trim()).filter(Boolean)
      : [],
    choiceKeys: draft.choiceKeys
      ? draft.choiceKeys.split(',').map((s) => s.trim()).filter(Boolean)
      : undefined,
    outcomeReasonKeys,
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
  if (draft.durationMs < 3000 || draft.durationMs > 8000) errors.push({ path: 'durationMs', message: t(locale, 'studio.validation.invalidRange') });
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
  const [draft, setDraft] = useState<DraftDefinition>(() => {
    if (initialDefinition) {
      return {
        definitionId: initialDefinition.definitionId,
        definitionVersion: initialDefinition.definitionVersion,
        engineId: initialDefinition.engineId as LaunchEngineId,
        internalTitle: initialDefinition.internalTitle,
        familyId: initialDefinition.familyId,
        categoryId: initialDefinition.categoryId,
        difficulty: initialDefinition.difficulty,
        instructionAr: initialDefinition.instructionAr,
        hintAr: initialDefinition.hintAr ?? '',
        promptKey: initialDefinition.promptKey,
        durationMs: initialDefinition.durationMs,
        introDurationMs: initialDefinition.introDurationMs ?? 2000,
        resultHoldMs: initialDefinition.resultHoldMs ?? 3000,
        heartPenaltyOnFailure: initialDefinition.heartPenaltyOnFailure,
        energyRewardOnSuccess: initialDefinition.energyRewardOnSuccess,
        clientConfig: initialDefinition.clientConfig ?? {},
        serverConfig: initialDefinition.serverConfig ?? {},
        eligibleModes: [...initialDefinition.eligibleModes],
        roundMin: initialDefinition.roundMin?.toString() ?? '',
        roundMax: initialDefinition.roundMax?.toString() ?? '',
        selectionWeight: initialDefinition.selectionWeight,
        repetitionCooldownRounds: initialDefinition.repetitionCooldownRounds,
        minAppVersion: initialDefinition.minAppVersion,
        requiredCapabilities: (initialDefinition.requiredCapabilities ?? []).join(', '),
        accessibilityFallbackKey: initialDefinition.accessibilityFallbackKey,
        requiredAssetIds: (initialDefinition.requiredAssetIds ?? []).join(', '),
        choiceKeys: (initialDefinition.choiceKeys ?? []).join(', '),
        outcomeReasonKeys: JSON.stringify(initialDefinition.outcomeReasonKeys ?? {}, null, 2),
        validationNotes: '',
      };
    }
    return defaultDraft();
  });

  const validationErrors = validateDraft(draft, locale);

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
          onSectionChange={setActiveSection}
        />

        {/* Center: form */}
        <div className="studio-editor-form">
          {/* Section 1: Identity & ownership */}
          <div className="section-group" id="section-identity" data-visible={activeSection === 'identity' || undefined}>
            <h3>{t(locale, 'studio.section.identity')}</h3>
            <FieldGroup>
              <FieldInput
                id="def-id"
                label={t(locale, 'studio.field.definitionId')}
                hint={t(locale, 'studio.field.definitionIdHint')}
                value={draft.definitionId}
                onChange={(e) => updateField('definitionId', e.currentTarget.value)}
                disabled={!canDraft}
              />
              <FieldInput
                id="def-title"
                label={t(locale, 'studio.field.internalTitle')}
                hint={t(locale, 'studio.field.internalTitleHint')}
                value={draft.internalTitle}
                onChange={(e) => updateField('internalTitle', e.currentTarget.value)}
                disabled={!canDraft}
                maxLength={120}
              />
              <FieldSelect
                id="def-engine"
                label={t(locale, 'studio.field.engineId')}
                hint={t(locale, 'studio.field.engineIdHint')}
                value={draft.engineId}
                onChange={(e) => handleEngineChange(e.currentTarget.value)}
                options={engineOptions}
                disabled={!canDraft}
              />
              <FieldInput
                id="def-version"
                label={t(locale, 'studio.field.definitionVersion')}
                hint={t(locale, 'studio.field.definitionVersionHint')}
                type="number"
                min={1}
                value={draft.definitionVersion}
                onChange={(e) => updateField('definitionVersion', Number(e.currentTarget.value) || 1)}
                disabled={!canDraft}
              />
            </FieldGroup>
          </div>

          {/* Section 2: Arabic content */}
          <div className="section-group" id="section-arabic">
            <h3>{t(locale, 'studio.section.arabic')}</h3>
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
              <FieldInput
                id="def-prompt-key"
                label={t(locale, 'studio.field.promptKey')}
                hint={t(locale, 'studio.field.promptKeyHint')}
                value={draft.promptKey}
                onChange={(e) => updateField('promptKey', e.currentTarget.value)}
                disabled={!canDraft}
              />
              <FieldInput
                id="def-choice-keys"
                label={t(locale, 'studio.field.choiceKeys')}
                hint={t(locale, 'studio.field.choiceKeysHint')}
                value={draft.choiceKeys}
                onChange={(e) => updateField('choiceKeys', e.currentTarget.value)}
                disabled={!canDraft}
              />
              <FieldTextarea
                id="def-outcome-keys"
                label={t(locale, 'studio.field.outcomeReasonKeys')}
                hint={t(locale, 'studio.field.outcomeReasonKeysHint')}
                value={draft.outcomeReasonKeys}
                onChange={(e) => updateField('outcomeReasonKeys', e.currentTarget.value)}
                disabled={!canDraft}
                style={{ fontFamily: 'monospace', fontSize: '0.82rem' }}
              />
            </FieldGroup>
          </div>

          {/* Section 3: Family & classification */}
          <div className="section-group" id="section-classification">
            <h3>{t(locale, 'studio.section.classification')}</h3>
            <FieldGroup horizontal>
              <FieldInput
                id="def-family"
                label={t(locale, 'studio.field.familyId')}
                value={draft.familyId}
                disabled
                readOnly
              />
              <FieldInput
                id="def-category"
                label={t(locale, 'studio.field.categoryId')}
                value={draft.categoryId}
                disabled
                readOnly
              />
              <FieldSelect
                id="def-difficulty"
                label={t(locale, 'studio.field.difficulty')}
                value={draft.difficulty}
                onChange={(e) => updateField('difficulty', e.currentTarget.value as 'easy' | 'medium' | 'hard')}
                options={localizedDifficultyOptions}
                disabled={!canDraft}
              />
            </FieldGroup>
          </div>

          {/* Section 4: Timing */}
          <div className="section-group" id="section-timing">
            <h3>{t(locale, 'studio.section.timing')}</h3>
            <FieldGroup horizontal>
              <FieldInput
                id="def-duration"
                label={t(locale, 'studio.field.durationMs')}
                hint={t(locale, 'studio.field.durationMsHint')}
                type="number"
                min={3000}
                max={8000}
                step={100}
                value={draft.durationMs}
                onChange={(e) => updateField('durationMs', Number(e.currentTarget.value))}
                disabled={!canDraft}
              />
              <FieldInput
                id="def-intro-duration"
                label={t(locale, 'studio.field.introDurationMs')}
                hint={t(locale, 'studio.field.introDurationMsHint')}
                type="number"
                min={0}
                max={5000}
                step={100}
                value={draft.introDurationMs}
                onChange={(e) => updateField('introDurationMs', Number(e.currentTarget.value))}
                disabled={!canDraft}
              />
              <FieldInput
                id="def-result-hold"
                label={t(locale, 'studio.field.resultHoldMs')}
                hint={t(locale, 'studio.field.resultHoldMsHint')}
                type="number"
                min={0}
                max={10000}
                step={100}
                value={draft.resultHoldMs}
                onChange={(e) => updateField('resultHoldMs', Number(e.currentTarget.value))}
                disabled={!canDraft}
              />
            </FieldGroup>
          </div>

          {/* Section 5: Engine parameters — typed family fields */}
          <div className="section-group" id="section-familyParams">
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
          <div className="section-group" id="section-behavior">
            <h3>{t(locale, 'studio.section.behavior')}</h3>
            <p style={{ color: 'var(--lh-text-muted)', fontSize: '0.85rem', margin: '0 0 0.5rem' }}>
              {t(locale, 'studio.field.fp.behaviorNote' as MessageKey)}
            </p>
          </div>

          {/* Section 7: Heart & energy effects */}
          <div className="section-group" id="section-effects">
            <h3>{t(locale, 'studio.section.effects')}</h3>
            <FieldGroup horizontal>
              <FieldSelect
                id="def-heart-penalty"
                label={t(locale, 'studio.field.heartPenaltyOnFailure')}
                value={String(draft.heartPenaltyOnFailure)}
                onChange={(e) => updateField('heartPenaltyOnFailure', Number(e.currentTarget.value) as 0 | 1)}
                options={[
                  { value: '0', label: t(locale, 'studio.field.heartPenalty.none') },
                  { value: '1', label: t(locale, 'studio.field.heartPenalty.one') },
                ]}
                disabled={!canDraft}
              />
              <FieldInput
                id="def-energy-reward"
                label={t(locale, 'studio.field.energyRewardOnSuccess')}
                hint={t(locale, 'studio.field.energyRewardHint')}
                type="number"
                min={0}
                max={3}
                value={draft.energyRewardOnSuccess}
                onChange={(e) => updateField('energyRewardOnSuccess', Number(e.currentTarget.value))}
                disabled={!canDraft}
              />
            </FieldGroup>
          </div>

          {/* Section 8: Assets, sounds, haptics */}
          <div className="section-group" id="section-assets">
            <h3>{t(locale, 'studio.section.assets')}</h3>
            <FieldGroup>
              <FieldInput
                id="def-asset-ids"
                label={t(locale, 'studio.field.requiredAssetIds')}
                hint={t(locale, 'studio.field.requiredAssetIdsHint')}
                value={draft.requiredAssetIds}
                onChange={(e) => updateField('requiredAssetIds', e.currentTarget.value)}
                disabled={!canDraft}
              />
            </FieldGroup>
          </div>

          {/* Section 9: Capability & accessibility */}
          <div className="section-group" id="section-accessibility">
            <h3>{t(locale, 'studio.section.accessibility')}</h3>
            <FieldGroup>
              <FieldInput
                id="def-capabilities"
                label={t(locale, 'studio.field.requiredCapabilities')}
                hint={t(locale, 'studio.field.requiredCapabilitiesHint')}
                value={draft.requiredCapabilities}
                onChange={(e) => updateField('requiredCapabilities', e.currentTarget.value)}
                disabled={!canDraft}
              />
              <FieldInput
                id="def-fallback"
                label={t(locale, 'studio.field.accessibilityFallbackKey')}
                hint={t(locale, 'studio.field.accessibilityFallbackHint')}
                value={draft.accessibilityFallbackKey}
                onChange={(e) => updateField('accessibilityFallbackKey', e.currentTarget.value)}
                disabled={!canDraft}
              />
            </FieldGroup>
          </div>

          {/* Section 10: Mode & eligibility */}
          <div className="section-group" id="section-eligibility">
            <h3>{t(locale, 'studio.section.eligibility')}</h3>
            <FieldGroup>
              <FieldCheckboxGroup
                label={t(locale, 'studio.field.eligibleModes')}
                options={localizedModeOptions}
                selected={draft.eligibleModes}
                onChange={(selected) => updateField('eligibleModes', selected)}
              />
              <FieldGroup horizontal>
                <FieldInput
                  id="def-round-min"
                  label={t(locale, 'studio.field.roundMin')}
                  hint={t(locale, 'studio.field.roundMinHint')}
                  type="number"
                  min={1}
                  max={99}
                  value={draft.roundMin}
                  onChange={(e) => updateField('roundMin', e.currentTarget.value)}
                  disabled={!canDraft}
                />
                <FieldInput
                  id="def-round-max"
                  label={t(locale, 'studio.field.roundMax')}
                  hint={t(locale, 'studio.field.roundMaxHint')}
                  type="number"
                  min={1}
                  max={99}
                  value={draft.roundMax}
                  onChange={(e) => updateField('roundMax', e.currentTarget.value)}
                  disabled={!canDraft}
                />
              </FieldGroup>
              <FieldGroup horizontal>
                <FieldInput
                  id="def-weight"
                  label={t(locale, 'studio.field.selectionWeight')}
                  hint={t(locale, 'studio.field.selectionWeightHint')}
                  type="number"
                  min={1}
                  max={10000}
                  value={draft.selectionWeight}
                  onChange={(e) => updateField('selectionWeight', Number(e.currentTarget.value))}
                  disabled={!canDraft}
                />
                <FieldInput
                  id="def-cooldown"
                  label={t(locale, 'studio.field.repetitionCooldownRounds')}
                  hint={t(locale, 'studio.field.repetitionCooldownHint')}
                  type="number"
                  min={0}
                  max={20}
                  value={draft.repetitionCooldownRounds}
                  onChange={(e) => updateField('repetitionCooldownRounds', Number(e.currentTarget.value))}
                  disabled={!canDraft}
                />
              </FieldGroup>
            </FieldGroup>
          </div>

          {/* Section 11: Version & app support */}
          <div className="section-group" id="section-versioning">
            <h3>{t(locale, 'studio.section.versioning')}</h3>
            <FieldGroup horizontal>
              <FieldInput
                id="def-min-app"
                label={t(locale, 'studio.field.minAppVersion')}
                hint={t(locale, 'studio.field.minAppVersionHint')}
                value={draft.minAppVersion}
                onChange={(e) => updateField('minAppVersion', e.currentTarget.value)}
                disabled={!canDraft}
              />
            </FieldGroup>
          </div>

          {/* Section 12: Review notes */}
          <div className="section-group" id="section-review">
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
