import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import en from '@/i18n/messages/en';
import { AudioMultipleChoiceFields } from './AudioMultipleChoiceFields';
import {
  defaultAudioQuestions,
  serializeAudioQuestions,
} from './audio-question-bank';

function Harness() {
  const [serverConfig, setServerConfig] = useState<Record<string, unknown>>({
    maxAudioDurationMs: 7000,
    questions: serializeAudioQuestions(defaultAudioQuestions()),
  });
  const [clientConfig, setClientConfig] = useState<Record<string, unknown>>({});
  return (
    <AudioMultipleChoiceFields
      locale="en"
      clientConfig={clientConfig}
      serverConfig={serverConfig}
      onClientChange={setClientConfig}
      onServerChange={setServerConfig}
    />
  );
}

describe('AudioMultipleChoiceFields copy editing', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        json: async () => ({}),
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('lets Backspace remove question and answer text', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    const question = screen.getAllByLabelText(
      en['studio.field.fp.triviaQuestionAr'],
    )[0] as HTMLInputElement;
    await user.click(question);
    await user.clear(question);
    expect(question.value).toBe('');
    await user.type(question, 'سؤال');
    expect(question.value).toBe('سؤال');

    const answer = screen.getAllByLabelText(
      en['studio.field.fp.triviaAnswerAr'],
    )[0] as HTMLInputElement;
    await user.click(answer);
    await user.clear(answer);
    expect(answer.value).toBe('');
    await user.type(answer, 'رامي');
    expect(answer.value).toBe('رامي');
  });
});
