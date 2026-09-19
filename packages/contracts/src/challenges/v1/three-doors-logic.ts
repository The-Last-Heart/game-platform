/**
 * Door of Truth (باب الحقيقة) — structured three-door logic.
 *
 * Shared by match authority and Challenge Studio. Flutter never evaluates
 * predicates; it only renders server-issued statement strings.
 */

import { z } from "zod";

export const THREE_DOORS_ENGINE_ID = "logic.three_doors" as const;
/** Product / public challenge type alias used in docs and public payloads. */
export const THREE_DOORS_CHALLENGE_TYPE = "three_doors_logic" as const;

export const DOOR_IDS = ["A", "B", "C"] as const;
export type DoorId = (typeof DOOR_IDS)[number];
export const doorIdSchema = z.enum(DOOR_IDS);

export const DOOR_TRUTH_RULES = [
  "exactly_one_true",
  "exactly_one_false",
] as const;
export type DoorTruthRule = (typeof DOOR_TRUTH_RULES)[number];
export const doorTruthRuleSchema = z.enum(DOOR_TRUTH_RULES);

export const doorPredicateSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("is_here") }).strict(),
  z.object({ kind: z.literal("is_not_here") }).strict(),
  z
    .object({
      kind: z.literal("is"),
      doorId: doorIdSchema,
    })
    .strict(),
  z
    .object({
      kind: z.literal("is_not"),
      doorId: doorIdSchema,
    })
    .strict(),
  z
    .object({
      kind: z.literal("is_one_of"),
      doorIds: z.tuple([doorIdSchema, doorIdSchema]),
    })
    .strict(),
  z
    .object({
      kind: z.literal("is_not_one_of"),
      doorIds: z.tuple([doorIdSchema, doorIdSchema]),
    })
    .strict(),
]);
export type DoorPredicate = z.infer<typeof doorPredicateSchema>;

export const doorStatementDefinitionSchema = z
  .object({
    doorId: doorIdSchema,
    predicate: doorPredicateSchema,
  })
  .strict();
export type DoorStatementDefinition = z.infer<
  typeof doorStatementDefinitionSchema
>;

const opaqueQuestionId = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[a-z0-9][a-z0-9._-]{0,126}$/i);

export const threeDoorsQuestionSchema = z
  .object({
    questionId: opaqueQuestionId,
    internalName: z.string().min(1).max(200).optional(),
    truthRule: doorTruthRuleSchema,
    statements: z.tuple([
      doorStatementDefinitionSchema,
      doorStatementDefinitionSchema,
      doorStatementDefinitionSchema,
    ]),
    correctDoorId: doorIdSchema,
    durationMs: z.number().int().positive().max(60_000).optional(),
    difficulty: z.string().min(1).max(64).optional(),
    tags: z.array(z.string().min(1).max(64)).max(32).optional(),
    selectionWeight: z.number().positive().max(1000).optional(),
    enabled: z.boolean().optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    for (let index = 0; index < DOOR_IDS.length; index += 1) {
      const id = DOOR_IDS[index]!;
      const statement = value.statements[index]!;
      if (statement.doorId !== id) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `statements[${index}].doorId must be ${id}`,
          path: ["statements", index, "doorId"],
        });
      }
      const predicate = statement.predicate;
      if (
        (predicate.kind === "is_one_of" ||
          predicate.kind === "is_not_one_of") &&
        predicate.doorIds[0] === predicate.doorIds[1]
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `${predicate.kind} doorIds must be distinct`,
          path: ["statements", index, "predicate", "doorIds"],
        });
      }
    }
  });
export type ThreeDoorsQuestion = z.infer<typeof threeDoorsQuestionSchema>;

/**
 * Publish-time / Studio gate: unique solution must exist and match correctDoorId.
 * Kept out of the base schema so incomplete drafts can still be saved.
 */
export function assertThreeDoorsQuestionUnique(
  question: ThreeDoorsQuestion,
): ThreeDoorsSolveReport {
  const report = solveThreeDoorsQuestion(question);
  if (!report.unique || report.derivedDoorId == null) {
    throw new Error(
      report.validDoorIds.length === 0
        ? "question has no solution"
        : "question has multiple solutions",
    );
  }
  if (report.derivedDoorId !== question.correctDoorId) {
    throw new Error(
      `correctDoorId must match solver (${report.derivedDoorId})`,
    );
  }
  return report;
}

export function assertThreeDoorsBankUnique(
  questions: readonly ThreeDoorsQuestion[],
): void {
  for (const question of questions) {
    if (question.enabled === false) continue;
    assertThreeDoorsQuestionUnique(question);
  }
}

/** Locale templates for structured predicates (Arabic-first). */
export const THREE_DOORS_STATEMENT_TEMPLATES = {
  ar: {
    is_here: "المفتاح هنا",
    is_not_here: "المفتاح ليس هنا",
    is: "المفتاح خلف الباب {door}",
    is_not: "المفتاح ليس خلف الباب {door}",
    is_one_of: "المفتاح خلف الباب {door1} أو الباب {door2}",
    is_not_one_of: "المفتاح ليس خلف الباب {door1} ولا الباب {door2}",
  },
  en: {
    is_here: "The key is here",
    is_not_here: "The key is not here",
    is: "The key is behind door {door}",
    is_not: "The key is not behind door {door}",
    is_one_of: "The key is behind door {door1} or door {door2}",
    is_not_one_of: "The key is not behind door {door1} or door {door2}",
  },
} as const;

export const THREE_DOORS_INSTRUCTION_KEYS = {
  exactly_one_true: "challenge.three_doors.instruction.exactly_one_true",
  exactly_one_false: "challenge.three_doors.instruction.exactly_one_false",
} as const;

export const THREE_DOORS_INSTRUCTION_COPY = {
  ar: {
    exactly_one_true: "عبارة واحدة فقط صحيحة — أين المفتاح؟",
    exactly_one_false: "عبارة واحدة فقط خاطئة — أين المفتاح؟",
  },
  en: {
    exactly_one_true: "Only one statement is true — where is the key?",
    exactly_one_false: "Only one statement is false — where is the key?",
  },
} as const;

export const THREE_DOORS_TITLE_COPY = {
  ar: "باب الحقيقة",
  en: "Door of Truth",
} as const;

export type ThreeDoorsLocale = "ar" | "en";

export function renderDoorPredicateStatement(
  predicate: DoorPredicate,
  locale: ThreeDoorsLocale = "ar",
): string {
  const templates = THREE_DOORS_STATEMENT_TEMPLATES[locale];
  switch (predicate.kind) {
    case "is_here":
      return templates.is_here;
    case "is_not_here":
      return templates.is_not_here;
    case "is":
      return templates.is.replace("{door}", predicate.doorId);
    case "is_not":
      return templates.is_not.replace("{door}", predicate.doorId);
    case "is_one_of":
      return templates.is_one_of
        .replace("{door1}", predicate.doorIds[0])
        .replace("{door2}", predicate.doorIds[1]);
    case "is_not_one_of":
      return templates.is_not_one_of
        .replace("{door1}", predicate.doorIds[0])
        .replace("{door2}", predicate.doorIds[1]);
    default: {
      const _exhaustive: never = predicate;
      return _exhaustive;
    }
  }
}

export function evaluateDoorPredicate(
  predicate: DoorPredicate,
  statementDoorId: DoorId,
  keyLocation: DoorId,
): boolean {
  switch (predicate.kind) {
    case "is_here":
      return keyLocation === statementDoorId;
    case "is_not_here":
      return keyLocation !== statementDoorId;
    case "is":
      return keyLocation === predicate.doorId;
    case "is_not":
      return keyLocation !== predicate.doorId;
    case "is_one_of":
      return (
        keyLocation === predicate.doorIds[0] ||
        keyLocation === predicate.doorIds[1]
      );
    case "is_not_one_of":
      return (
        keyLocation !== predicate.doorIds[0] &&
        keyLocation !== predicate.doorIds[1]
      );
    default: {
      const _exhaustive: never = predicate;
      return _exhaustive;
    }
  }
}

export function satisfiesTruthRule(
  results: readonly [boolean, boolean, boolean],
  rule: DoorTruthRule,
): boolean {
  const trueCount = results.filter(Boolean).length;
  if (rule === "exactly_one_true") {
    return trueCount === 1;
  }
  return trueCount === 2;
}

export type ThreeDoorsTruthRow = {
  keyLocation: DoorId;
  results: [boolean, boolean, boolean];
  trueCount: number;
  falseCount: number;
  valid: boolean;
};

export type ThreeDoorsSolveReport = {
  truthRule: DoorTruthRule;
  rows: [ThreeDoorsTruthRow, ThreeDoorsTruthRow, ThreeDoorsTruthRow];
  validDoorIds: DoorId[];
  derivedDoorId: DoorId | null;
  unique: boolean;
};

export function solveThreeDoorsQuestion(input: {
  truthRule: DoorTruthRule;
  statements: readonly [
    DoorStatementDefinition,
    DoorStatementDefinition,
    DoorStatementDefinition,
  ];
}): ThreeDoorsSolveReport {
  const rows = DOOR_IDS.map((keyLocation) => {
    const results = input.statements.map((statement) =>
      evaluateDoorPredicate(
        statement.predicate,
        statement.doorId,
        keyLocation,
      ),
    ) as [boolean, boolean, boolean];
    const trueCount = results.filter(Boolean).length;
    return {
      keyLocation,
      results,
      trueCount,
      falseCount: 3 - trueCount,
      valid: satisfiesTruthRule(results, input.truthRule),
    };
  }) as [ThreeDoorsTruthRow, ThreeDoorsTruthRow, ThreeDoorsTruthRow];

  const validDoorIds = rows
    .filter((row) => row.valid)
    .map((row) => row.keyLocation);
  const unique = validDoorIds.length === 1;
  return {
    truthRule: input.truthRule,
    rows,
    validDoorIds,
    derivedDoorId: unique ? validDoorIds[0]! : null,
    unique,
  };
}

/** Reference question from the product brief (exactly_one_true → B). */
export const THREE_DOORS_REFERENCE_QUESTION: ThreeDoorsQuestion = {
  questionId: "three_doors.q.reference_exactly_one_true",
  internalName: "Reference — exactly one true",
  truthRule: "exactly_one_true",
  statements: [
    { doorId: "A", predicate: { kind: "is_not_here" } },
    { doorId: "B", predicate: { kind: "is", doorId: "A" } },
    { doorId: "C", predicate: { kind: "is_not", doorId: "B" } },
  ],
  correctDoorId: "B",
  enabled: true,
};

export const threeDoorsPublicDoorSchema = z
  .object({
    id: doorIdSchema,
    statement: z.string().min(1).max(200),
  })
  .strict();
export type ThreeDoorsPublicDoor = z.infer<typeof threeDoorsPublicDoorSchema>;

export const threeDoorsClientConfigSchema = z
  .object({
    categoryKey: z.string().min(1).max(256),
    promptKey: z.string().min(1).max(256),
    titleKey: z.string().min(1).max(256).optional(),
    titleText: z.string().min(1).max(200).optional(),
    instructionKey: z.string().min(1).max(256).optional(),
    instructionText: z.string().min(1).max(500).optional(),
    truthRule: doorTruthRuleSchema.optional(),
    questionId: opaqueQuestionId.optional(),
    doors: z
      .tuple([
        threeDoorsPublicDoorSchema,
        threeDoorsPublicDoorSchema,
        threeDoorsPublicDoorSchema,
      ])
      .optional(),
    roomAssetId: z.string().min(1).max(128).optional(),
    /** Looping bed from the content pack (never bundled in the APK). */
    backgroundSfxAssetId: z.string().min(1).max(128).optional(),
  })
  .strict();
export type ThreeDoorsClientConfig = z.infer<
  typeof threeDoorsClientConfigSchema
>;

export const threeDoorsServerConfigSchema = z
  .object({
    questions: z.array(threeDoorsQuestionSchema).min(1).max(64),
    /** Pinned after materialize — never mirrored into clientConfig. */
    questionId: opaqueQuestionId.optional(),
    truthRule: doorTruthRuleSchema.optional(),
    statements: z
      .tuple([
        doorStatementDefinitionSchema,
        doorStatementDefinitionSchema,
        doorStatementDefinitionSchema,
      ])
      .optional(),
    correctDoorId: doorIdSchema.optional(),
  })
  .strict();
export type ThreeDoorsServerConfig = z.infer<
  typeof threeDoorsServerConfigSchema
>;

export const threeDoorsAnswerSchema = z
  .object({
    selectedDoorId: doorIdSchema,
  })
  .strict();
export type ThreeDoorsAnswer = z.infer<typeof threeDoorsAnswerSchema>;

export function parseThreeDoorsClientConfig(input: unknown) {
  return threeDoorsClientConfigSchema.parse(input);
}
export function parseThreeDoorsServerConfig(input: unknown) {
  return threeDoorsServerConfigSchema.parse(input);
}
export function parseThreeDoorsAnswer(input: unknown) {
  return threeDoorsAnswerSchema.parse(input);
}

export function buildThreeDoorsPublicDoors(
  statements: readonly [
    DoorStatementDefinition,
    DoorStatementDefinition,
    DoorStatementDefinition,
  ],
  locale: ThreeDoorsLocale = "ar",
): [ThreeDoorsPublicDoor, ThreeDoorsPublicDoor, ThreeDoorsPublicDoor] {
  return statements.map((statement) => ({
    id: statement.doorId,
    statement: renderDoorPredicateStatement(statement.predicate, locale),
  })) as [ThreeDoorsPublicDoor, ThreeDoorsPublicDoor, ThreeDoorsPublicDoor];
}

export function threeDoorsInstructionText(
  truthRule: DoorTruthRule,
  locale: ThreeDoorsLocale = "ar",
): string {
  return THREE_DOORS_INSTRUCTION_COPY[locale][truthRule];
}

/** Soft plaque fit warning for Studio (character budget, not a hard reject). */
export const THREE_DOORS_STATEMENT_SOFT_MAX_CHARS = 42;

export function threeDoorsStatementMayOverflow(statement: string): boolean {
  return statement.trim().length > THREE_DOORS_STATEMENT_SOFT_MAX_CHARS;
}
