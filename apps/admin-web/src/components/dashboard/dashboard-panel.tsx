'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { AdminDashboardOverview } from '@thelastheart/contracts';
import {
  EmptyState,
  ErrorState,
  LoadingState,
} from '@/components/ui/confirm-dialog';
import { t } from '@/i18n/get-dictionary';
import { localizeAdminError } from '@/i18n/localize-admin-error';
import type { Locale } from '@/i18n/locale';
import type { MessageKey } from '@/i18n/messages/en';
import { adminApiFetch } from '@/lib/api/client';
import {
  mapDashboardOverview,
  type DashboardViewModel,
  type MatchPhaseKey,
  type PlayerPresenceKey,
} from '@/lib/dashboard/map-overview';
import { scheduleEffectTask } from '@/lib/react/schedule-effect-task';

const POLL_MS = 15_000;

function phaseLabel(locale: Locale, phase: MatchPhaseKey): string {
  return t(locale, `dashboard.phase.${phase}` as MessageKey);
}

function presenceLabel(locale: Locale, presence: PlayerPresenceKey): string {
  return t(locale, `dashboard.presence.${presence}` as MessageKey);
}

export function DashboardPanel({ locale }: { locale: Locale }) {
  const [view, setView] = useState<DashboardViewModel | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stale, setStale] = useState(false);
  const [paused, setPaused] = useState(false);
  const inFlight = useRef(false);
  const mounted = useRef(true);

  const load = useCallback(
    async (manual = false) => {
      if (inFlight.current) {
        return;
      }
      inFlight.current = true;
      if (!view || manual) {
        setLoading(true);
      }
      const result = await adminApiFetch<AdminDashboardOverview>(
        '/dashboard/overview',
      );
      if (!mounted.current) {
        inFlight.current = false;
        return;
      }
      if (!result.ok) {
        setError(
          localizeAdminError(locale, result.error.code, result.error.message),
        );
        if (view) {
          setStale(true);
        }
        setLoading(false);
        inFlight.current = false;
        return;
      }
      setView(mapDashboardOverview(result.data));
      setError(null);
      setStale(false);
      setLoading(false);
      inFlight.current = false;
    },
    [view, locale],
  );

  useEffect(() => {
    mounted.current = true;
    const cancel = scheduleEffectTask(() => {
      void load(true);
    });
    return () => {
      mounted.current = false;
      cancel();
    };
    // intentional: load once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    function onVisibility() {
      setPaused(document.hidden);
      if (!document.hidden) {
        void load(false);
      }
    }
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [load]);

  useEffect(() => {
    if (paused) {
      return;
    }
    const id = window.setInterval(() => {
      if (!document.hidden) {
        void load(false);
      }
    }, POLL_MS);
    return () => window.clearInterval(id);
  }, [load, paused]);

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>{t(locale, 'dashboard.title')}</h1>
          <p>{t(locale, 'dashboard.subtitle')}</p>
          <p>
            {paused
              ? t(locale, 'dashboard.paused')
              : t(locale, 'dashboard.polling')}
          </p>
        </div>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => void load(true)}
        >
          {t(locale, 'common.refresh')}
        </button>
      </div>

      {stale ? (
        <div className="stale-banner" role="status">
          {t(locale, 'common.stale')}
        </div>
      ) : null}

      {loading && !view ? (
        <LoadingState label={t(locale, 'common.loading')} />
      ) : null}

      {!loading && !view && error ? (
        <ErrorState
          label={error || t(locale, 'common.error')}
          retryLabel={t(locale, 'common.retry')}
          onRetry={() => void load(true)}
        />
      ) : null}

      {view ? (
        <>
          <p>
            {t(locale, 'dashboard.generatedAt')}:{' '}
            {new Date(view.generatedAt).toLocaleString(locale)}
          </p>
          <div className="metric-grid">
            <div className="metric">
              <p className="metric-label">
                {t(locale, 'dashboard.matchCount')}
              </p>
              <p className="metric-value">{view.activeMatchCount}</p>
            </div>
            <div className="metric">
              <p className="metric-label">
                {t(locale, 'dashboard.lobbyWaiting')}
              </p>
              <p className="metric-value">{view.waitingLobbyCount}</p>
            </div>
            <div className="metric">
              <p className="metric-label">
                {t(locale, 'dashboard.activeAdmins')}
              </p>
              <p className="metric-value">{view.activeAdmins}</p>
            </div>
            <div className="metric">
              <p className="metric-label">
                {t(locale, 'dashboard.deactivatedAdmins')}
              </p>
              <p className="metric-value">{view.deactivatedAdmins}</p>
            </div>
            <div className="metric">
              <p className="metric-label">
                {t(locale, 'dashboard.activeSessions')}
              </p>
              <p className="metric-value">{view.activeSessions}</p>
            </div>
          </div>

          <div className="stack">
            <section className="panel">
              <h2>{t(locale, 'dashboard.matchesByPhase')}</h2>
              {view.matchesByPhase.every((row) => row.count === 0) ? (
                <EmptyState label={t(locale, 'common.empty')} />
              ) : (
                <div className="table-wrap">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>{t(locale, 'dashboard.col.phase')}</th>
                        <th>{t(locale, 'dashboard.col.count')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {view.matchesByPhase.map((row) => (
                        <tr key={row.phase}>
                          <td>{phaseLabel(locale, row.phase)}</td>
                          <td>{row.count}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <section className="panel">
              <h2>{t(locale, 'dashboard.playersByPresence')}</h2>
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>{t(locale, 'dashboard.col.presence')}</th>
                      <th>{t(locale, 'dashboard.col.count')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {view.playersByPresence.map((row) => (
                      <tr key={row.presence}>
                        <td>{presenceLabel(locale, row.presence)}</td>
                        <td>{row.count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        </>
      ) : null}
    </div>
  );
}
