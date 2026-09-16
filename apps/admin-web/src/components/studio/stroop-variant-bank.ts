/** Studio helpers for focus.stroop question variants. */

export const STROOP_INK_COLOR_IDS = ['cyan', 'red', 'yellow'] as const;
export type StroopInkColorId = (typeof STROOP_INK_COLOR_IDS)[number];

export const STROOP_WORD_KEY_OPTIONS = [
  'color.red',
  'color.blue',
  'color.cyan',
  'color.yellow',
] as const;

export type StroopStudioVariant = {
  wordKey: string;
  inkColorId: string;
  optionKeys: string[];
  correctOptionKey: string;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function uniqueStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    if (seen.has(value)) continue;
    seen.add(value);
    out.push(value);
  }
  return out;
}

function parseOptionKeys(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return uniqueStrings(
    raw.filter(
      (k): k is string => typeof k === 'string' && k.trim().length > 0,
    ),
  );
}

export function normalizeStroopVariant(
  partial: Partial<StroopStudioVariant>,
): StroopStudioVariant | null {
  const wordKey =
    typeof partial.wordKey === 'string' ? partial.wordKey.trim() : '';
  const inkColorId =
    typeof partial.inkColorId === 'string' ? partial.inkColorId.trim() : '';
  let optionKeys = parseOptionKeys(partial.optionKeys);
  if (!wordKey || !inkColorId) return null;
  if (optionKeys.length < 2) {
    optionKeys = uniqueStrings([
      inkColorId,
      ...STROOP_INK_COLOR_IDS.filter((id) => id !== inkColorId),
    ]).slice(0, 3);
  }
  if (optionKeys.length > 6) optionKeys = optionKeys.slice(0, 6);
  if (!optionKeys.includes(inkColorId)) {
    optionKeys = [inkColorId, ...optionKeys].slice(0, 6);
  }
  const correctRaw =
    typeof partial.correctOptionKey === 'string'
      ? partial.correctOptionKey.trim()
      : '';
  const correctOptionKey = optionKeys.includes(correctRaw)
    ? correctRaw
    : optionKeys.includes(inkColorId)
      ? inkColorId
      : optionKeys[0]!;
  return {
    wordKey,
    inkColorId,
    optionKeys,
    correctOptionKey,
  };
}

function parseOneVariant(raw: unknown): StroopStudioVariant | null {
  const rec = asRecord(raw);
  if (!rec) return null;
  return normalizeStroopVariant({
    wordKey: typeof rec.wordKey === 'string' ? rec.wordKey : undefined,
    inkColorId: typeof rec.inkColorId === 'string' ? rec.inkColorId : undefined,
    optionKeys: Array.isArray(rec.optionKeys)
      ? (rec.optionKeys as string[])
      : undefined,
    correctOptionKey:
      typeof rec.correctOptionKey === 'string'
        ? rec.correctOptionKey
        : undefined,
  });
}

export function defaultStroopVariants(): StroopStudioVariant[] {
  return [
    normalizeStroopVariant({
      wordKey: 'color.red',
      inkColorId: 'cyan',
      optionKeys: ['cyan', 'red', 'yellow'],
      correctOptionKey: 'cyan',
    })!,
    normalizeStroopVariant({
      wordKey: 'color.blue',
      inkColorId: 'yellow',
      optionKeys: ['cyan', 'red', 'yellow'],
      correctOptionKey: 'yellow',
    })!,
  ];
}

export function parseStroopVariants(
  serverConfig: Record<string, unknown>,
): StroopStudioVariant[] {
  const raw = serverConfig.variants;
  if (Array.isArray(raw)) {
    const parsed = raw
      .map(parseOneVariant)
      .filter((v): v is StroopStudioVariant => v != null);
    if (parsed.length > 0) return parsed;
  }
  const legacy = parseOneVariant({
    wordKey: serverConfig.wordKey,
    inkColorId: serverConfig.inkColorId,
    optionKeys: serverConfig.optionKeys,
    correctOptionKey: serverConfig.correctOptionKey,
  });
  return legacy ? [legacy] : defaultStroopVariants();
}

export function serializeStroopVariants(
  variants: StroopStudioVariant[],
): Array<Record<string, unknown>> {
  return variants.map((variant) => {
    const normalized = normalizeStroopVariant(variant)!;
    return {
      wordKey: normalized.wordKey,
      inkColorId: normalized.inkColorId,
      optionKeys: normalized.optionKeys,
      correctOptionKey: normalized.correctOptionKey,
    };
  });
}

export function stroopClientPreview(
  variant: StroopStudioVariant | undefined,
  clientConfig: Record<string, unknown>,
): Record<string, unknown> {
  if (!variant) return { ...clientConfig };
  const normalized = normalizeStroopVariant(variant)!;
  return {
    ...clientConfig,
    wordKey: normalized.wordKey,
    inkColorId: normalized.inkColorId,
    optionKeys: normalized.optionKeys,
  };
}

export function createStroopVariant(
  existing: StroopStudioVariant[],
): StroopStudioVariant {
  const palette = [...STROOP_INK_COLOR_IDS];
  const ink =
    palette[existing.length % palette.length] ??
    STROOP_INK_COLOR_IDS[0]!;
  const words = [...STROOP_WORD_KEY_OPTIONS];
  const word =
    words[(existing.length + 1) % words.length] ?? STROOP_WORD_KEY_OPTIONS[0]!;
  return normalizeStroopVariant({
    wordKey: word,
    inkColorId: ink,
    optionKeys: [...STROOP_INK_COLOR_IDS],
    correctOptionKey: ink,
  })!;
}

export function stroopVariantBankIssues(
  variants: StroopStudioVariant[],
): string[] {
  const issues: string[] = [];
  if (variants.length < 1) {
    issues.push('at least one variant required');
    return issues;
  }
  if (variants.length > 32) {
    issues.push('too many variants');
  }
  for (const [index, variant] of variants.entries()) {
    const normalized = normalizeStroopVariant(variant);
    if (!normalized) {
      issues.push(`variant ${index + 1} incomplete`);
      continue;
    }
    if (!normalized.wordKey.trim()) {
      issues.push(`variant ${index + 1} missing wordKey`);
    }
    if (normalized.optionKeys.length < 2) {
      issues.push(`variant ${index + 1} needs at least 2 options`);
    }
    if (!normalized.optionKeys.includes(normalized.correctOptionKey)) {
      issues.push(`variant ${index + 1} correct option not in options`);
    }
  }
  return issues;
}
