import { Injectable } from '@nestjs/common';
import type { AdminOperationalAggregates } from '@thelastheart/contracts';
import { HealthService } from '../../health/health.service';
import { MatchService } from '../../match/services/match.service';
import { AdminAdministratorsService } from './admin-administrators.service';
import { AdminAuthService } from './admin-auth.service';

@Injectable()
export class AdminDashboardService {
  constructor(
    private readonly matchService: MatchService,
    private readonly administrators: AdminAdministratorsService,
    private readonly auth: AdminAuthService,
    private readonly health: HealthService,
  ) {}

  async getOverview() {
    const [aggregates, adminUsers, activeSessions] = await Promise.all([
      this.matchService.getOperationalAggregates(),
      this.administrators.countByStatus(),
      this.auth.countActiveSessions(),
    ]);

    return {
      generatedAt: new Date().toISOString(),
      aggregates,
      adminUsers,
      sessions: { activeCount: activeSessions },
    };
  }

  async getSystemStatus() {
    const [readiness, aggregates, activeSessions] = await Promise.all([
      this.health.getReadiness(),
      this.matchService.getOperationalAggregates(),
      this.auth.countActiveSessions(),
    ]);

    return {
      generatedAt: new Date().toISOString(),
      service: 'backend' as const,
      health: {
        live: 'ok' as const,
        ready: readiness.status,
        checks: readiness.checks.map((check) => ({
          name: check.name,
          status: check.status,
          ...(check.latencyMs !== undefined
            ? { latencyMs: check.latencyMs }
            : {}),
        })),
      },
      sessions: { activeCount: activeSessions },
      aggregates: aggregates as AdminOperationalAggregates,
    };
  }
}
