import { BadRequestException } from '@nestjs/common';
import { AdminMatchmakingController } from './admin-matchmaking.controller';
import type { EmergencyControlsService } from '../../content/services/emergency-controls.service';
import type { MatchService } from '../../match/services/match.service';
import type { MatchmakingService } from '../../match/services/matchmaking.service';
import type { AdminAuthContext } from '../services/admin.types';

describe('AdminMatchmakingController', () => {
  const matchmaking = {
    getBotFillPolicy: jest.fn(),
    setBotFillPolicy: jest.fn(),
  } as unknown as MatchmakingService;

  const emergency = {
    getBotFillPolicy: jest.fn(),
    patchControls: jest.fn(),
  } as unknown as EmergencyControlsService;

  const matches = {
    setBotFillPolicy: jest.fn(),
    getBotFillPolicy: jest.fn(),
    refreshEmergencyControlsFromStore: jest.fn(),
  } as unknown as MatchService;

  const controller = new AdminMatchmakingController(
    matchmaking,
    emergency,
    matches,
  );

  const admin = {
    user: { id: '11111111-1111-4111-8111-111111111111' },
  } as unknown as AdminAuthContext;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns the current bot-fill policy envelope', async () => {
    emergency.getBotFillPolicy = jest
      .fn()
      .mockResolvedValue({ enabled: false, waitMs: 15_000 });

    const result = await controller.getBotFillPolicy();

    expect(result).toEqual({
      ok: true,
      data: { enabled: false, waitMs: 15_000 },
    });
  });

  it('updates bot-fill policy and returns the new state', async () => {
    emergency.patchControls = jest.fn().mockResolvedValue({
      botFillEnabled: true,
      botFillWaitMs: 20_000,
    });
    matches.refreshEmergencyControlsFromStore = jest
      .fn()
      .mockResolvedValue(undefined);
    matches.getBotFillPolicy = jest
      .fn()
      .mockReturnValue({ enabled: true, waitMs: 20_000 });

    const result = await controller.patchBotFillPolicy(admin, {
      enabled: true,
      waitMs: 20_000,
      reason: 'ops test reason',
    });

    expect(emergency.patchControls).toHaveBeenCalled();
    expect(result).toEqual({
      ok: true,
      data: { enabled: true, waitMs: 20_000 },
    });
  });

  it('rejects empty patch payloads', async () => {
    await expect(controller.patchBotFillPolicy(admin, {})).rejects.toThrow(
      BadRequestException,
    );
    expect(emergency.patchControls).not.toHaveBeenCalled();
  });
});
