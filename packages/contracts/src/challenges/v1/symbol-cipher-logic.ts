/**
 * Decode the Word / فكّ الشفرة (`trivia.symbol_cipher_word`).
 *
 * Shared by match authority and Challenge Studio. Flutter never evaluates
 * correctness; it only renders server-issued symbols and options.
 *
 * Logical order contract:
 * - Server stores the answer and `encodedSymbols` in Unicode logical order.
 * - Index 0 is the first Arabic grapheme of the word.
 * - Flutter renders index 0 at the rightmost visual position (RTL row).
 * - Decoding symbols from right → left yields the configured answer.
 */

import { z } from "zod";

export const SYMBOL_CIPHER_WORD_ENGINE_ID =
  "trivia.symbol_cipher_word" as const;
/** Product / public challenge type alias used in docs and public payloads. */
export const SYMBOL_CIPHER_WORD_CHALLENGE_TYPE = "symbol_cipher_word" as const;

/** Content-pack background (clean library art — no baked UI). */
export const SYMBOL_CIPHER_WORD_BACKGROUND_ASSET_ID =
  "symbol_cipher_word.background" as const;

export const SYMBOL_CIPHER_WORD_TITLE_COPY = {
  ar: "فكّ الشفرة",
  en: "Decode the Cipher",
} as const;

export const SYMBOL_CIPHER_WORD_INSTRUCTION_COPY = {
  ar: "استخدم المفتاح لاكتشاف الكلمة",
  en: "Use the key to discover the word",
} as const;

export const CIPHER_SYMBOL_IDS = [
  "circle",
  "square",
  "triangle",
  "diamond",
  "hexagon",
  "octagon",
  "star",
  "crescent",
] as const;
export type CipherSymbolId = (typeof CIPHER_SYMBOL_IDS)[number];
export const cipherSymbolIdSchema = z.enum(CIPHER_SYMBOL_IDS);

export const CIPHER_SYMBOL_STYLES = ["gold", "cyan"] as const;
export type CipherSymbolStyle = (typeof CIPHER_SYMBOL_STYLES)[number];
export const cipherSymbolStyleSchema = z.enum(CIPHER_SYMBOL_STYLES);

/** Recommended visual style alternating gold/cyan for the five key slots. */
export const CIPHER_KEY_SLOT_STYLES: readonly CipherSymbolStyle[] = [
  "gold",
  "cyan",
  "gold",
  "cyan",
  "gold",
] as const;

export const SYMBOL_CIPHER_ANSWER_GRAPHEME_COUNT = 5;
export const SYMBOL_CIPHER_KEY_SLOT_COUNT = 5;
export const SYMBOL_CIPHER_OPTION_COUNT = 4;

const opaqueQuestionId = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[a-z0-9][a-z0-9._-]{0,126}$/i);

const optionKey = z.string().min(1).max(128);

const triviaLocaleCopySchema = z
  .object({
    ar: z.string().min(1).max(500),
    en: z.string().min(1).max(500).optional(),
  })
  .strict();

const ARABIC_DIACRITIC_OR_TATWEEL_RE =
  /[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED\u0640]/gu;
const ZERO_WIDTH_RE = /[\u200B-\u200D\uFEFF\u00AD]/gu;
/** Basic Arabic letters only — no digits or Latin. */
const ARABIC_LETTER_RE = /^[\u0621-\u063A\u0641-\u064A]$/u;

/**
 * Normalize authored Arabic for cipher validation.
 * Strips diacritics, tatweel, zero-width marks; trims; collapses whitespace.
 * Does NOT unify materially different letters (أ/ا, ة/ه, etc.).
 */
export function normalizeArabicCipherText(raw: string): string {
  const nfkc = raw.normalize("NFKC");
  let out = "";
  for (const ch of nfkc) {
    if (ARABIC_DIACRITIC_OR_TATWEEL_RE.test(ch) || ZERO_WIDTH_RE.test(ch)) {
      continue;
    }
    out += ch;
  }
  return out.trim().replace(/\s+/gu, " ");
}

/** Segment into Unicode grapheme clusters (Intl.Segmenter when available). */
export function arabicGraphemes(text: string): string[] {
  const normalized = text.normalize("NFC");
  if (typeof Intl !== "undefined" && "Segmenter" in Intl) {
    const segmenter = new Intl.Segmenter("ar", { granularity: "grapheme" });
    return [...segmenter.segment(normalized)].map((s) => s.segment);
  }
  return Array.from(normalized);
}

export function isSupportedArabicCipherLetter(grapheme: string): boolean {
  return ARABIC_LETTER_RE.test(grapheme);
}

export type CipherKeyMapping = {
  symbolId: CipherSymbolId;
  letter: string;
  isDecoy: boolean;
};

export type SymbolCipherWordQuestion = {
  questionId: string;
  internalName?: string;
  answerDisplayText: string;
  normalizedAnswer: string;
  keyMappings: CipherKeyMapping[];
  /** Server-derived; never independently authored at publish time. */
  encodedSymbols: CipherSymbolId[];
  optionKeys: string[];
  correctOptionKey: string;
  optionCopy?: Record<string, { ar: string; en?: string }>;
  durationMs?: number;
  difficulty?: string;
  tags?: string[];
  selectionWeight?: number;
  enabled?: boolean;
};

/**
 * Build symbol→letter and letter→symbol maps from key mappings.
 * Throws via Zod issues when called through schema refine.
 */
export function buildCipherLookup(mappings: readonly CipherKeyMapping[]): {
  symbolByLetter: Map<string, CipherSymbolId>;
  letterBySymbol: Map<CipherSymbolId, string>;
} {
  const symbolByLetter = new Map<string, CipherSymbolId>();
  const letterBySymbol = new Map<CipherSymbolId, string>();
  for (const m of mappings) {
    symbolByLetter.set(m.letter, m.symbolId);
    letterBySymbol.set(m.symbolId, m.letter);
  }
  return { symbolByLetter, letterBySymbol };
}

/** Derive encodedSymbols from normalized answer + mappings (logical order). */
export function encodeSymbolCipherAnswer(
  normalizedAnswer: string,
  mappings: readonly CipherKeyMapping[],
): CipherSymbolId[] {
  const graphemes = arabicGraphemes(normalizedAnswer);
  const { symbolByLetter } = buildCipherLookup(mappings);
  return graphemes.map((g) => {
    const symbol = symbolByLetter.get(g);
    if (!symbol) {
      throw new Error(`missing mapping for letter: ${g}`);
    }
    return symbol;
  });
}

/** Decode encodedSymbols using mappings → logical Arabic string. */
export function decodeSymbolCipherSequence(
  encodedSymbols: readonly CipherSymbolId[],
  mappings: readonly CipherKeyMapping[],
): string {
  const { letterBySymbol } = buildCipherLookup(mappings);
  return encodedSymbols
    .map((id) => {
      const letter = letterBySymbol.get(id);
      if (!letter) {
        throw new Error(`missing mapping for symbol: ${id}`);
      }
      return letter;
    })
    .join("");
}

/**
 * Visual RTL index helper: logical index → visual left-to-right slot.
 * For a length-N sequence, logical 0 is rightmost = visual LTR index N-1.
 */
export function logicalIndexToVisualLtrIndex(
  logicalIndex: number,
  length: number,
): number {
  return length - 1 - logicalIndex;
}

/**
 * Visual LTR index → logical index (inverse of above).
 */
export function visualLtrIndexToLogicalIndex(
  visualLtrIndex: number,
  length: number,
): number {
  return length - 1 - visualLtrIndex;
}

/** Pool of decoy Arabic letters for unused key slots. */
const DECOY_LETTER_POOL = [
  "ب",
  "ن",
  "س",
  "ر",
  "ك",
  "ل",
  "ي",
  "و",
  "د",
  "ج",
  "ش",
  "ع",
  "غ",
  "ق",
  "ص",
  "ض",
  "ظ",
  "ذ",
  "ث",
  "خ",
  "ز",
  "ط",
] as const;

/**
 * Complete key mappings to exactly five unique symbol/letter pairs.
 * Answer letters keep (or receive) non-decoy mappings; remaining slots are decoys.
 */
export function completeCipherKeyMappings(input: {
  normalizedAnswer: string;
  mappings: readonly CipherKeyMapping[];
  preferredSymbols?: readonly CipherSymbolId[];
}): CipherKeyMapping[] {
  const graphemes = arabicGraphemes(input.normalizedAnswer);
  const distinctAnswerLetters = [...new Set(graphemes)];
  const usedSymbols = new Set<CipherSymbolId>();
  const usedLetters = new Set<string>();
  const result: CipherKeyMapping[] = [];

  const byLetter = new Map<string, CipherKeyMapping>();
  for (const m of input.mappings) {
    if (!byLetter.has(m.letter)) {
      byLetter.set(m.letter, m);
    }
  }

  const symbolPool: CipherSymbolId[] = [
    ...(input.preferredSymbols ?? []),
    ...CIPHER_SYMBOL_IDS,
  ];
  const takeSymbol = (preferred?: CipherSymbolId): CipherSymbolId => {
    if (preferred && !usedSymbols.has(preferred)) {
      usedSymbols.add(preferred);
      return preferred;
    }
    for (const id of symbolPool) {
      if (!usedSymbols.has(id)) {
        usedSymbols.add(id);
        return id;
      }
    }
    throw new Error("exhausted cipher symbol pool");
  };

  for (const letter of distinctAnswerLetters) {
    const existing = byLetter.get(letter);
    const symbolId = takeSymbol(existing?.symbolId);
    result.push({ symbolId, letter, isDecoy: false });
    usedLetters.add(letter);
  }

  while (result.length < SYMBOL_CIPHER_KEY_SLOT_COUNT) {
    const existingDecoy = input.mappings.find(
      (m) =>
        m.isDecoy &&
        !usedLetters.has(m.letter) &&
        !usedSymbols.has(m.symbolId),
    );
    if (existingDecoy) {
      result.push({ ...existingDecoy, isDecoy: true });
      usedLetters.add(existingDecoy.letter);
      usedSymbols.add(existingDecoy.symbolId);
      continue;
    }
    const letter =
      DECOY_LETTER_POOL.find((l) => !usedLetters.has(l)) ??
      (() => {
        throw new Error("exhausted decoy letter pool");
      })();
    const symbolId = takeSymbol();
    result.push({ symbolId, letter, isDecoy: true });
    usedLetters.add(letter);
  }

  return result.slice(0, SYMBOL_CIPHER_KEY_SLOT_COUNT);
}

/** Shuffle a copy of an array (Fisher–Yates). */
export function shuffleCipherArray<T>(items: readonly T[], rng = Math.random): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = out[i]!;
    out[i] = out[j]!;
    out[j] = tmp;
  }
  return out;
}

export const cipherKeyMappingSchema = z
  .object({
    symbolId: cipherSymbolIdSchema,
    letter: z.string().min(1).max(8),
    isDecoy: z.boolean(),
  })
  .strict();

export const symbolCipherWordQuestionSchema = z
  .object({
    questionId: opaqueQuestionId,
    internalName: z.string().min(1).max(200).optional(),
    answerDisplayText: z.string().min(1).max(64),
    normalizedAnswer: z.string().min(1).max(64),
    keyMappings: z
      .array(cipherKeyMappingSchema)
      .length(SYMBOL_CIPHER_KEY_SLOT_COUNT),
    encodedSymbols: z
      .array(cipherSymbolIdSchema)
      .length(SYMBOL_CIPHER_ANSWER_GRAPHEME_COUNT),
    optionKeys: z.array(optionKey).length(SYMBOL_CIPHER_OPTION_COUNT),
    correctOptionKey: optionKey,
    optionCopy: z.record(triviaLocaleCopySchema).optional(),
    durationMs: z.number().int().positive().max(60_000).optional(),
    difficulty: z.string().min(1).max(64).optional(),
    tags: z.array(z.string().min(1).max(64)).max(32).optional(),
    selectionWeight: z.number().positive().max(1000).optional(),
    enabled: z.boolean().optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    const normalized = normalizeArabicCipherText(value.normalizedAnswer);
    if (normalized !== value.normalizedAnswer) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "normalizedAnswer must already be canonically normalized",
        path: ["normalizedAnswer"],
      });
    }
    const graphemes = arabicGraphemes(normalized);
    if (graphemes.length !== SYMBOL_CIPHER_ANSWER_GRAPHEME_COUNT) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `answer must contain exactly ${SYMBOL_CIPHER_ANSWER_GRAPHEME_COUNT} Arabic graphemes`,
        path: ["normalizedAnswer"],
      });
    }
    for (const [i, g] of graphemes.entries()) {
      if (!isSupportedArabicCipherLetter(g)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `unsupported Arabic letter at index ${i}: ${g}`,
          path: ["normalizedAnswer"],
        });
      }
    }

    const symbols = value.keyMappings.map((m) => m.symbolId);
    if (new Set(symbols).size !== symbols.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "key mapping symbols must be unique",
        path: ["keyMappings"],
      });
    }
    const letters = value.keyMappings.map((m) => m.letter);
    if (new Set(letters).size !== letters.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "key mapping letters must be unique",
        path: ["keyMappings"],
      });
    }
    for (const [i, m] of value.keyMappings.entries()) {
      const letterNorm = normalizeArabicCipherText(m.letter);
      if (letterNorm !== m.letter || arabicGraphemes(m.letter).length !== 1) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "each key letter must be one normalized Arabic grapheme",
          path: ["keyMappings", i, "letter"],
        });
      } else if (!isSupportedArabicCipherLetter(m.letter)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "unsupported Arabic letter in key mapping",
          path: ["keyMappings", i, "letter"],
        });
      }
    }

    const distinctAnswer = new Set(graphemes);
    for (const letter of distinctAnswer) {
      if (!letters.includes(letter)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `answer letter missing from key: ${letter}`,
          path: ["keyMappings"],
        });
      }
    }
    for (const m of value.keyMappings) {
      if (!m.isDecoy && !distinctAnswer.has(m.letter)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `non-decoy mapping letter is not in the answer: ${m.letter}`,
          path: ["keyMappings"],
        });
      }
      if (m.isDecoy && distinctAnswer.has(m.letter)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `decoy mapping letter collides with the answer: ${m.letter}`,
          path: ["keyMappings"],
        });
      }
    }

    let derived: CipherSymbolId[] = [];
    try {
      derived = encodeSymbolCipherAnswer(normalized, value.keyMappings);
    } catch (err) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: err instanceof Error ? err.message : "encode failed",
        path: ["encodedSymbols"],
      });
      return;
    }
    if (
      derived.length !== value.encodedSymbols.length ||
      derived.some((s, i) => s !== value.encodedSymbols[i])
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "encodedSymbols must equal encode(normalizedAnswer, keyMappings)",
        path: ["encodedSymbols"],
      });
    }
    try {
      const decoded = decodeSymbolCipherSequence(
        value.encodedSymbols,
        value.keyMappings,
      );
      if (decoded !== normalized) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "decode(encode(answer)) must equal normalizedAnswer",
          path: ["encodedSymbols"],
        });
      }
    } catch (err) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: err instanceof Error ? err.message : "decode failed",
        path: ["encodedSymbols"],
      });
    }

    if (new Set(value.optionKeys).size !== value.optionKeys.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "optionKeys must be unique",
        path: ["optionKeys"],
      });
    }
    if (!value.optionKeys.includes(value.correctOptionKey)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "correctOptionKey must be one of optionKeys",
        path: ["correctOptionKey"],
      });
    }

    const normalizedOptions = value.optionKeys.map((key) => {
      const copy = value.optionCopy?.[key];
      const ar = copy?.ar ? normalizeArabicCipherText(copy.ar) : "";
      return ar || key;
    });
    if (new Set(normalizedOptions).size !== normalizedOptions.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "option texts must be distinct after normalization",
        path: ["optionCopy"],
      });
    }
    const correctNorm =
      value.optionCopy?.[value.correctOptionKey]?.ar != null
        ? normalizeArabicCipherText(
            value.optionCopy[value.correctOptionKey]!.ar,
          )
        : normalized;
    if (correctNorm !== normalized) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "correct option text must match normalizedAnswer",
        path: ["correctOptionKey"],
      });
    }
    const matchingDecoded = value.optionKeys.filter((key) => {
      const ar = value.optionCopy?.[key]?.ar;
      if (!ar) return false;
      return normalizeArabicCipherText(ar) === normalized;
    });
    if (matchingDecoded.length !== 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "exactly one option must match the decoded answer",
        path: ["optionCopy"],
      });
    }
    if (value.optionCopy) {
      for (const key of Object.keys(value.optionCopy)) {
        if (!value.optionKeys.includes(key)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `optionCopy.${key} is not in optionKeys`,
            path: ["optionCopy", key],
          });
        }
      }
    }
  });
export type SymbolCipherWordQuestionInferred = z.infer<
  typeof symbolCipherWordQuestionSchema
>;

/** Public key mapping (no isDecoy flag). */
export const symbolCipherPublicKeyMappingSchema = z
  .object({
    symbolId: cipherSymbolIdSchema,
    letter: z.string().min(1).max(8),
  })
  .strict();

export const symbolCipherWordClientConfigSchema = z
  .object({
    categoryKey: z.string().min(1).max(256),
    promptKey: z.string().min(1).max(256),
    titleKey: z.string().min(1).max(256).optional(),
    titleText: z.string().min(1).max(200).optional(),
    instructionText: z.string().min(1).max(500).optional(),
    questionId: opaqueQuestionId.optional(),
    /** Pinned after materialize — omitted on Studio drafts / catalog chrome. */
    keyMappings: z
      .array(symbolCipherPublicKeyMappingSchema)
      .length(SYMBOL_CIPHER_KEY_SLOT_COUNT)
      .optional(),
    encodedSymbols: z
      .array(cipherSymbolIdSchema)
      .length(SYMBOL_CIPHER_ANSWER_GRAPHEME_COUNT)
      .optional(),
    optionKeys: z
      .array(optionKey)
      .length(SYMBOL_CIPHER_OPTION_COUNT)
      .optional(),
    optionTexts: z.record(z.string().min(1).max(500)).optional(),
    backgroundAssetId: z.string().min(1).max(128).optional(),
  })
  .strict();
export type SymbolCipherWordClientConfig = z.infer<
  typeof symbolCipherWordClientConfigSchema
>;

export const symbolCipherWordServerConfigSchema = z
  .object({
    titleCopy: triviaLocaleCopySchema.optional(),
    instructionCopy: triviaLocaleCopySchema.optional(),
    questions: z.array(symbolCipherWordQuestionSchema).min(1).max(64),
    /** Pinned after materialize. */
    questionId: opaqueQuestionId.optional(),
    answerDisplayText: z.string().min(1).max(64).optional(),
    normalizedAnswer: z.string().min(1).max(64).optional(),
    keyMappings: z.array(cipherKeyMappingSchema).optional(),
    encodedSymbols: z.array(cipherSymbolIdSchema).optional(),
    optionKeys: z.array(optionKey).length(SYMBOL_CIPHER_OPTION_COUNT).optional(),
    correctOptionKey: optionKey.optional(),
  })
  .strict();
export type SymbolCipherWordServerConfig = z.infer<
  typeof symbolCipherWordServerConfigSchema
>;

/** Same command body as trivia multiple choice. */
export const symbolCipherWordAnswerSchema = z
  .object({
    chosenOptionKey: optionKey,
  })
  .strict();
export type SymbolCipherWordAnswer = z.infer<
  typeof symbolCipherWordAnswerSchema
>;

/** Reference question matching the design mockup (مفتاح). */
export const SYMBOL_CIPHER_WORD_REFERENCE_QUESTION: SymbolCipherWordQuestion = {
  questionId: "symbol_cipher.q.miftah",
  internalName: "مفتاح",
  answerDisplayText: "مفتاح",
  normalizedAnswer: "مفتاح",
  keyMappings: [
    { symbolId: "hexagon", letter: "م", isDecoy: false },
    { symbolId: "circle", letter: "ف", isDecoy: false },
    { symbolId: "triangle", letter: "ت", isDecoy: false },
    { symbolId: "diamond", letter: "ا", isDecoy: false },
    { symbolId: "square", letter: "ح", isDecoy: false },
  ],
  encodedSymbols: ["hexagon", "circle", "triangle", "diamond", "square"],
  optionKeys: [
    "symbol_cipher.opt.miftah",
    "symbol_cipher.opt.misbah",
    "symbol_cipher.opt.tuffaha",
    "symbol_cipher.opt.minshar",
  ],
  correctOptionKey: "symbol_cipher.opt.miftah",
  optionCopy: {
    "symbol_cipher.opt.miftah": { ar: "مفتاح", en: "Key" },
    "symbol_cipher.opt.misbah": { ar: "مصباح", en: "Lamp" },
    "symbol_cipher.opt.tuffaha": { ar: "تفاحة", en: "Apple" },
    "symbol_cipher.opt.minshar": { ar: "منشار", en: "Saw" },
  },
  selectionWeight: 100,
  enabled: true,
};

/**
 * Build a publish-ready question from Studio draft fields.
 * Derives normalizedAnswer, completes decoys, and regenerates encodedSymbols.
 */
export function buildSymbolCipherQuestion(input: {
  questionId: string;
  internalName?: string;
  answerDisplayText: string;
  keyMappings: readonly CipherKeyMapping[];
  optionKeys: string[];
  correctOptionKey: string;
  optionCopy?: Record<string, { ar: string; en?: string }>;
  durationMs?: number;
  difficulty?: string;
  tags?: string[];
  selectionWeight?: number;
  enabled?: boolean;
}): SymbolCipherWordQuestion {
  const normalizedAnswer = normalizeArabicCipherText(input.answerDisplayText);
  const keyMappings = completeCipherKeyMappings({
    normalizedAnswer,
    mappings: input.keyMappings.map((m) => ({
      ...m,
      letter: normalizeArabicCipherText(m.letter),
    })),
  });
  const encodedSymbols = encodeSymbolCipherAnswer(
    normalizedAnswer,
    keyMappings,
  );
  const question: SymbolCipherWordQuestion = {
    questionId: input.questionId,
    answerDisplayText: input.answerDisplayText.trim(),
    normalizedAnswer,
    keyMappings,
    encodedSymbols,
    optionKeys: input.optionKeys,
    correctOptionKey: input.correctOptionKey,
  };
  if (input.internalName != null) question.internalName = input.internalName;
  if (input.optionCopy != null) question.optionCopy = input.optionCopy;
  if (input.durationMs != null) question.durationMs = input.durationMs;
  if (input.difficulty != null) question.difficulty = input.difficulty;
  if (input.tags != null) question.tags = input.tags;
  if (input.selectionWeight != null) {
    question.selectionWeight = input.selectionWeight;
  }
  if (input.enabled != null) question.enabled = input.enabled;
  return question;
}
