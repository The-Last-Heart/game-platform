import { describe, expect, it } from 'vitest';
import {
  addTriviaOption,
  createTriviaQuestion,
  parseTriviaQuestions,
  removeTriviaOption,
  serializeTriviaQuestions,
  triviaClientPreview,
  triviaQuestionBankIssues,
} from './trivia-question-bank';

describe('trivia question bank', () => {
  it('hydrates launch-pack questions with Arabic and English copy', () => {
    const questions = parseTriviaQuestions({
      questions: [
        {
          questionKey: 'trivia.q.japan_capital',
          optionKeys: [
            'trivia.opt.osaka',
            'trivia.opt.tokyo',
            'trivia.opt.seoul',
            'trivia.opt.kyoto',
          ],
          correctOptionKey: 'trivia.opt.tokyo',
        },
      ],
    });
    expect(questions).toHaveLength(1);
    expect(questions[0]?.questionAr).toBe('ما عاصمة اليابان؟');
    expect(questions[0]?.correctOptionKey).toBe('trivia.opt.tokyo');
    expect(
      questions[0]?.options.find((o) => o.key === 'trivia.opt.tokyo')?.en,
    ).toBe('Tokyo');
  });

  it('round-trips admin-authored copy and the marked correct answer', () => {
    const questions = parseTriviaQuestions({
      questions: [
        {
          questionKey: 'trivia.q.custom_1',
          optionKeys: ['trivia.opt.custom_1_a', 'trivia.opt.custom_1_b'],
          correctOptionKey: 'trivia.opt.custom_1_b',
          questionCopy: { ar: 'ما عاصمة فرنسا؟', en: 'Capital of France?' },
          optionCopy: {
            'trivia.opt.custom_1_a': { ar: 'ليون', en: 'Lyon' },
            'trivia.opt.custom_1_b': { ar: 'باريس', en: 'Paris' },
          },
        },
      ],
    });
    const serialized = serializeTriviaQuestions(questions);
    expect(serialized[0]).toMatchObject({
      questionKey: 'trivia.q.custom_1',
      correctOptionKey: 'trivia.opt.custom_1_b',
      questionCopy: { ar: 'ما عاصمة فرنسا؟', en: 'Capital of France?' },
    });
    expect(
      triviaClientPreview(questions[0], { promptKey: 'x' }).optionKeys,
    ).toEqual(['trivia.opt.custom_1_a', 'trivia.opt.custom_1_b']);
  });

  it('adds a new question without dropping existing ones', () => {
    const existing = parseTriviaQuestions({
      questions: [
        {
          questionKey: 'trivia.q.japan_capital',
          optionKeys: ['trivia.opt.osaka', 'trivia.opt.tokyo'],
          correctOptionKey: 'trivia.opt.tokyo',
        },
      ],
    });
    const next = [...existing, createTriviaQuestion(existing)];
    expect(next).toHaveLength(2);
    expect(next[1]?.options).toHaveLength(4);
    expect(next[1]?.correctOptionKey).toBe(next[1]?.options[0]?.key);
  });

  it('keeps at least two answers and retargets the correct key', () => {
    const [question] = parseTriviaQuestions({
      questions: [
        {
          questionKey: 'trivia.q.custom_1',
          optionKeys: ['a', 'b', 'c'],
          correctOptionKey: 'b',
        },
      ],
    });
    const withFour = addTriviaOption(question!);
    expect(withFour.options).toHaveLength(4);
    const removedCorrect = removeTriviaOption(withFour, 'b');
    expect(removedCorrect.options.map((o) => o.key)).not.toContain('b');
    expect(removedCorrect.correctOptionKey).not.toBe('b');
    const twoLeft = removeTriviaOption(
      removeTriviaOption(removedCorrect, removedCorrect.options[2]!.key),
      removedCorrect.options[1]!.key,
    );
    expect(twoLeft.options).toHaveLength(2);
    expect(
      removeTriviaOption(twoLeft, twoLeft.options[0]!.key).options,
    ).toHaveLength(2);
  });

  it('requires Arabic question and answer copy', () => {
    const blank = createTriviaQuestion([]);
    expect(triviaQuestionBankIssues([blank]).length).toBeGreaterThan(0);
    const filled = parseTriviaQuestions({
      questions: [
        {
          questionKey: 'trivia.q.japan_capital',
          optionKeys: ['trivia.opt.osaka', 'trivia.opt.tokyo'],
          correctOptionKey: 'trivia.opt.tokyo',
        },
      ],
    });
    expect(triviaQuestionBankIssues(filled)).toEqual([]);
  });

  it('keeps spaces in question and answer copy while typing', () => {
    const questions = parseTriviaQuestions({
      questions: [
        {
          questionKey: 'trivia.q.custom_1',
          optionKeys: ['trivia.opt.custom_1_a', 'trivia.opt.custom_1_b'],
          correctOptionKey: 'trivia.opt.custom_1_b',
          questionCopy: { ar: 'ما هي ', en: 'What is ' },
          optionCopy: {
            'trivia.opt.custom_1_a': { ar: 'باريس ', en: 'Paris ' },
            'trivia.opt.custom_1_b': { ar: 'ليون', en: 'Lyon' },
          },
        },
      ],
    });
    expect(questions[0]?.questionAr).toBe('ما هي ');
    expect(questions[0]?.questionEn).toBe('What is ');
    expect(questions[0]?.options[0]?.ar).toBe('باريس ');
    const serialized = serializeTriviaQuestions(questions);
    const copy = serialized[0]?.questionCopy as { ar: string; en?: string };
    expect(copy.ar).toBe('ما هي ');
    expect(copy.en).toBe('What is ');
  });
});
