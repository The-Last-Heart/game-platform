import { describe, expect, it } from 'vitest';
import {
  availableVerticalReflectionTemplates,
  createVerticalReflectionQuestion,
  defaultVerticalReflectionBank,
  regenerateVerticalReflectionQuestion,
  serializeVerticalReflectionBank,
  verticalReflectionClientPreview,
  verticalReflectionPublishIssues,
} from './vertical-reflection-question';

describe('vertical reflection studio bank', () => {
  it('ships at least 12 templates and is not arrow-only', () => {
    const templates = availableVerticalReflectionTemplates();
    expect(templates.length).toBeGreaterThanOrEqual(12);
    expect(templates.filter((t) => t === 'asymmetric_arrow_notch')).toHaveLength(
      1,
    );
    const bank = defaultVerticalReflectionBank();
    expect(bank.questions.length).toBeGreaterThanOrEqual(12);
    const families = new Set(bank.questions.map((q) => q.templateId));
    expect(families.size).toBeGreaterThan(1);
  });

  it('creates, regenerates, and keeps player preview free of correct id', () => {
    const bank = defaultVerticalReflectionBank();
    const created = createVerticalReflectionQuestion(bank.questions, 'fish_abstract');
    expect(created.candidates).toHaveLength(4);
    const regenerated = regenerateVerticalReflectionQuestion(created, {
      newSeed: 'studio-regen-test',
    });
    expect(regenerated.candidates).toHaveLength(4);
    expect(regenerated.correctCandidateId).toBeTruthy();

    const preview = verticalReflectionClientPreview(
      { questions: [regenerated] },
      {},
      0,
    );
    expect(preview.correctCandidateId).toBeUndefined();
    expect(preview.adminCorrectCandidateId).toBeUndefined();
    expect(preview.sourceShape).toBeTruthy();
    expect(preview.candidates).toHaveLength(4);

    const adminPreview = verticalReflectionClientPreview(
      { questions: [regenerated] },
      {},
      0,
      { adminDiagnostics: true },
    );
    expect(adminPreview.adminCorrectCandidateId).toBe(
      regenerated.correctCandidateId,
    );
  });

  it('serializes a publishable bank without issues', () => {
    const bank = defaultVerticalReflectionBank();
    expect(verticalReflectionPublishIssues(bank)).toEqual([]);
    const serialized = serializeVerticalReflectionBank(bank);
    expect(Array.isArray(serialized.questions)).toBe(true);
  });
});
