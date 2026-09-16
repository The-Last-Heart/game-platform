import {
  COMPLETE_SUM_DEFAULT_GENERATION_RULES,
  logicCompleteSumAnswerSchema,
  type CompleteSumPlayerCount,
} from '@thelastheart/contracts';
import type {
  ChallengeDefinition,
  ChallengeEvaluation,
  ChallengeEvaluator,
  ChallengeRound,
} from '../types';
import type { SeatChallengeVariant } from '../seat-variants';
import {
  buildInitialCompleteSumState,
  generateCompleteSumRound,
  hashStringToSeed,
  LOGIC_COMPLETE_SUM_ENGINE_ID,
  toCompleteSumPublicPayload,
  type CompleteSumRoundState,
} from './complete-sum';

export {
  applyCompleteSumSelection,
  buildInitialCompleteSumState,
  buildSafeFallback,
  createSeededRng,
  emptySelections,
  generateCompleteSumRound,
  hashStringToSeed,
  isTargetReachable,
  LOGIC_COMPLETE_SUM_ENGINE_ID,
  recalculateCompleteSumTotal,
  resolveGenerationRule,
  toCompleteSumPublicPayload,
  CompleteSumConfigError,
  type CompleteSumGenerationResult,
  type CompleteSumPublicPayload,
  type CompleteSumRoundState,
} from './complete-sum';

export class LogicCompleteSumEvaluator implements ChallengeEvaluator {
  readonly engineId = LOGIC_COMPLETE_SUM_ENGINE_ID;

  evaluate(input: {
    definition: ChallengeDefinition;
    answer: Record<string, unknown>;
    receivedMonoMs: number;
    deadlineMonoMs: number;
  }): ChallengeEvaluation {
    // Collective outcome is injected by MatchEngine at resolve time.
    if (input.answer['_completeSumSucceeded'] === true) {
      return {
        success: true,
        reasonKey: 'result.success',
        measureMs: Math.max(0, Math.floor(input.receivedMonoMs)),
      };
    }
    if (input.receivedMonoMs > input.deadlineMonoMs) {
      return { success: false, reasonKey: 'result.timeout' };
    }
    if (input.answer['_completeSumAllSelected'] === true) {
      return { success: false, reasonKey: 'result.complete_sum.wrong' };
    }
    return { success: false, reasonKey: 'result.timeout' };
  }
}

export function materializeCompleteSumRound(
  challenge: ChallengeRound,
  seed?: number,
): CompleteSumRoundState {
  const participantIds = [...challenge.participatingPlayerIds];
  if (participantIds.length < 2 || participantIds.length > 6) {
    throw new Error(
      `logic.complete_sum requires 2–6 participants, got ${participantIds.length}`,
    );
  }

  const server = challenge.definition.serverConfig;
  const generationRules = server['generationRules'] as
    | Partial<
        Record<CompleteSumPlayerCount | `${CompleteSumPlayerCount}`, unknown>
      >
    | undefined;
  const maxAttempts =
    typeof server['maxGenerationAttempts'] === 'number'
      ? server['maxGenerationAttempts']
      : 48;
  const configuredSeed =
    typeof seed === 'number'
      ? seed
      : typeof server['seed'] === 'number'
        ? server['seed']
        : hashStringToSeed(
            `${challenge.challengeInstanceId}:${participantIds.join(',')}`,
          );

  const generated = generateCompleteSumRound({
    participantIds,
    generationRules,
    maxAttempts,
    seed: configuredSeed,
  });

  // Persist authoritative public params only — never the hidden solution.
  server['target'] = generated.target;
  server['optionsByPlayerId'] = generated.optionsByPlayerId;
  server['frozenParticipantIds'] = participantIds;
  if (server['generationRules'] == null) {
    server['generationRules'] = { ...COMPLETE_SUM_DEFAULT_GENERATION_RULES };
  }

  const state = buildInitialCompleteSumState({
    participantIds,
    generated,
  });
  challenge.completeSumState = state;

  const seats = new Map<string, SeatChallengeVariant>();
  for (const playerId of participantIds) {
    seats.set(playerId, {
      clientOverlay: {
        myChoices: [...(generated.optionsByPlayerId[playerId] ?? [])],
        isParticipant: true,
      },
      serverOverlay: {
        myChoices: [...(generated.optionsByPlayerId[playerId] ?? [])],
      },
    });
  }
  challenge.seatVariants = seats;

  return state;
}

export function mergeCompleteSumIntoClientConfig(
  clientConfig: Record<string, unknown>,
  state: CompleteSumRoundState,
  viewerPlayerId?: string,
): void {
  const pub = toCompleteSumPublicPayload(state);
  clientConfig['participantIds'] = pub.participantIds;
  clientConfig['target'] = pub.target;
  clientConfig['selections'] = pub.selections;
  clientConfig['currentTotal'] = pub.currentTotal;
  clientConfig['allSelected'] = pub.allSelected;
  clientConfig['stateSequence'] = pub.stateSequence;
  clientConfig['incorrectTotal'] = pub.incorrectTotal;

  if (viewerPlayerId != null && state.participantIds.includes(viewerPlayerId)) {
    clientConfig['isParticipant'] = true;
    if (clientConfig['myChoices'] == null) {
      clientConfig['myChoices'] = [
        ...(state.optionsByPlayerId[viewerPlayerId] ?? []),
      ];
    }
  } else if (viewerPlayerId != null) {
    clientConfig['isParticipant'] = false;
    delete clientConfig['myChoices'];
  }
}

export function validateCompleteSumSelectionAnswer(
  answer: Record<string, unknown>,
): { ok: true; selectedValue: number } | { ok: false; reason: string } {
  const raw = answer['selectedValue'];
  if (
    typeof raw !== 'number' ||
    !Number.isInteger(raw) ||
    !Number.isFinite(raw)
  ) {
    return { ok: false, reason: 'malformed' };
  }
  // Out-of-contract range is an invalid selection, not a malformed envelope.
  if (raw < 0 || raw > 20) {
    return { ok: false, reason: 'invalid_value' };
  }
  const parsed = logicCompleteSumAnswerSchema.safeParse(answer);
  if (!parsed.success) {
    return { ok: false, reason: 'malformed' };
  }
  return { ok: true, selectedValue: parsed.data.selectedValue };
}
