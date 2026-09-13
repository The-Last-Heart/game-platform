'use client';

import { t } from '@/i18n/get-dictionary';
import type { Locale } from '@/i18n/locale';
import type { MessageKey } from '@/i18n/messages/en';

export type EditorSection =
  | 'identity'
  | 'arabic'
  | 'classification'
  | 'timing'
  | 'familyParams'
  | 'behavior'
  | 'effects'
  | 'assets'
  | 'accessibility'
  | 'eligibility'
  | 'versioning'
  | 'review';

export const EDITOR_SECTIONS: readonly EditorSection[] = [
  'identity',
  'arabic',
  'classification',
  'timing',
  'familyParams',
  'behavior',
  'effects',
  'assets',
  'accessibility',
  'eligibility',
  'versioning',
  'review',
];

const SECTION_LABEL_KEYS: Record<EditorSection, MessageKey> = {
  identity: 'studio.section.identity',
  arabic: 'studio.section.arabic',
  classification: 'studio.section.classification',
  timing: 'studio.section.timing',
  familyParams: 'studio.section.familyParams',
  behavior: 'studio.section.behavior',
  effects: 'studio.section.effects',
  assets: 'studio.section.assets',
  accessibility: 'studio.section.accessibility',
  eligibility: 'studio.section.eligibility',
  versioning: 'studio.section.versioning',
  review: 'studio.section.review',
};

type StudioSectionNavProps = {
  locale: Locale;
  activeSection: EditorSection;
  onSectionChange: (section: EditorSection) => void;
};

export function StudioSectionNav({
  locale,
  activeSection,
  onSectionChange,
}: StudioSectionNavProps) {
  return (
    <nav className="studio-section-nav" aria-label="Editor sections">
      {EDITOR_SECTIONS.map((section, index) => (
        <button
          key={section}
          type="button"
          className="studio-section-nav-item"
          aria-current={activeSection === section ? 'true' : undefined}
          onClick={() => onSectionChange(section)}
        >
          <span className="section-index">{index + 1}</span>
          {t(locale, SECTION_LABEL_KEYS[section])}
        </button>
      ))}
    </nav>
  );
}
