import { describe, expect, it } from 'vitest';
import {
  createStroopVariant,
  defaultStroopVariants,
  parseStroopVariants,
  serializeStroopVariants,
  stroopClientPreview,
  stroopVariantBankIssues,
} from './stroop-variant-bank';

describe('stroop-variant-bank', () => {
  it('parses variants from serverConfig', () => {
    const variants = parseStroopVariants({
      variants: [
        {
          wordKey: 'color.red',
          inkColorId: 'cyan',
          optionKeys: ['cyan', 'red', 'yellow'],
          correctOptionKey: 'cyan',
        },
      ],
    });
    expect(variants).toHaveLength(1);
    expect(variants[0]).toMatchObject({
      wordKey: 'color.red',
      inkColorId: 'cyan',
      correctOptionKey: 'cyan',
    });
  });

  it('falls back to legacy top-level fields', () => {
    const variants = parseStroopVariants({
      wordKey: 'color.blue',
      inkColorId: 'yellow',
      optionKeys: ['cyan', 'yellow'],
      correctOptionKey: 'yellow',
    });
    expect(variants).toEqual([
      {
        wordKey: 'color.blue',
        inkColorId: 'yellow',
        optionKeys: ['cyan', 'yellow'],
        correctOptionKey: 'yellow',
      },
    ]);
  });

  it('defaults when empty', () => {
    expect(parseStroopVariants({})).toEqual(defaultStroopVariants());
  });

  it('serializes and previews client config from first variant', () => {
    const variants = defaultStroopVariants();
    const serialized = serializeStroopVariants(variants);
    expect(serialized[0]).toEqual({
      wordKey: 'color.red',
      inkColorId: 'cyan',
      optionKeys: ['cyan', 'red', 'yellow'],
      correctOptionKey: 'cyan',
    });
    expect(
      stroopClientPreview(variants[0], {
        promptKey: 'challenge.stroop.prompt',
      }),
    ).toMatchObject({
      wordKey: 'color.red',
      inkColorId: 'cyan',
      optionKeys: ['cyan', 'red', 'yellow'],
    });
  });

  it('creates additional variants and reports issues', () => {
    const base = defaultStroopVariants();
    const next = createStroopVariant(base);
    expect(next.optionKeys.length).toBeGreaterThanOrEqual(2);
    expect(stroopVariantBankIssues([])).toContain(
      'at least one variant required',
    );
    expect(stroopVariantBankIssues([...base, next])).toEqual([]);
  });
});
