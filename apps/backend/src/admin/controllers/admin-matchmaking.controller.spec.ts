import { BadRequestException } from '@nestjs/common';
import { AdminMatchmakingController } from './admin-matchmaking.controller';
import type { MatchmakingService } from '../../match/services/matchmaking.service';

describe('AdminMatchmakingController', () => {
  const matchmaking = {
    getBotFillPolicy: jest.fn(),
    setBotFillPolicy: jest.fn(),
  } as unknown as MatchmakingService;

  const controller = new AdminMatchmakingController(matchmaking);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns the current bot-fill policy envelope', () => {
    matchmaking.getBotFillPolicy = jest
      .fn()
      .mockReturnValue({ enabled: false, waitMs: 15_000 });

    const result = controller.getBotFillPolicy();

    expect(result).toEqual({
      ok: true,
      data: { enabled: false, waitMs: 15_000 },
    });
  });

  it('updates bot-fill policy and returns the new state', () => {
    matchmaking.setBotFillPolicy = jest.fn();
    matchmaking.getBotFillPolicy = jest
      .fn()
      .mockReturnValueOnce({ enabled: true, waitMs: 20_000 });

    const result = controller.patchBotFillPolicy({
      enabled: true,
      waitMs: 20_000,
    });

    expect(matchmaking.setBotFillPolicy).toHaveBeenCalledWith({
      enabled: true,
      waitMs: 20_000,
    });
    expect(result).toEqual({
      ok: true,
      data: { enabled: true, waitMs: 20_000 },
    });
  });

  it('rejects empty patch payloads', () => {
    expect(() => controller.patchBotFillPolicy({})).toThrow(
      BadRequestException,
    );
    expect(matchmaking.setBotFillPolicy).not.toHaveBeenCalled();
  });
});
