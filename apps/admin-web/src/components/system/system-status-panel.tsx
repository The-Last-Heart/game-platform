'use client';

import { useCallback, useEffect, useState } from 'react';
import type { AdminSystemStatus } from '@thelastheart/contracts';
import {
  ErrorState,
  ForbiddenState,
  LoadingState,
} from '@/components/ui/confirm-dialog';
import { t } from '@/i18n/get-dictionary';
import type { Locale } from '@/i18n/locale';
import type { MessageKey } from '@/i18n/messages/en';
import { adminApiFetch } from '@/lib/api/client';
import { scheduleEffectTask } from '@/lib/react/schedule-effect-task';

export function SystemStatusPanel({ locale }: { locale: Locale }) {
  const [data, setData] = useState<AdminSystemStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const result = await adminApiFetch<AdminSystemStatus>('/system/status');
    if (!result.ok) {
      setForbidden(result.status === 403 || result.error.code === 'FORBIDDEN');
      setError(result.error.message);
      setData(null);
      setLoading(false);
      return;
    }
    setForbidden(false);
    setError(null);
    setData(result.data);
    setLoading(false);
  }, []);

  useEffect(() => scheduleEffectTask(() => void load()), [load]);

  if (forbidden) {
    return <ForbiddenState label={t(locale, 'common.forbidden')} />;
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>{t(locale, 'system.title')}</h1>
          <p>{t(locale, 'system.subtitle')}</p>
        </div>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => void load()}
        >
          {t(locale, 'common.refresh')}
        </button>
      </div>

      {loading ? <LoadingState label={t(locale, 'common.loading')} /> : null}
      {!loading && error ? (
        <ErrorState
          label={error}
          retryLabel={t(locale, 'common.retry')}
          onRetry={() => void load()}
        />
      ) : null}

      {data ? (
        <div className="stack">
          <section className="panel">
            <dl className="definition-list">
              <div>
                <dt>{t(locale, 'system.generatedAt')}</dt>
                <dd>{new Date(data.generatedAt).toLocaleString(locale)}</dd>
              </div>
              <div>
                <dt>{t(locale, 'system.service')}</dt>
                <dd>{data.service}</dd>
              </div>
              <div>
                <dt>{t(locale, 'system.live')}</dt>
                <dd>{data.health.live}</dd>
              </div>
              <div>
                <dt>{t(locale, 'system.ready')}</dt>
                <dd>
                  {t(locale, `system.ready.${data.health.ready}` as MessageKey)}
                </dd>
              </div>
              <div>
                <dt>{t(locale, 'system.sessions')}</dt>
                <dd>{data.sessions.activeCount}</dd>
              </div>
            </dl>
          </section>

          <section className="panel">
            <h2>{t(locale, 'system.checks')}</h2>
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>{t(locale, 'common.status')}</th>
                    <th>{t(locale, 'system.latency')}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.health.checks.map((check) => (
                    <tr key={check.name}>
                      <td>{check.name}</td>
                      <td>
                        {t(
                          locale,
                          `system.status.${check.status}` as MessageKey,
                        )}
                      </td>
                      <td>
                        {typeof check.latencyMs === 'number'
                          ? `${check.latencyMs} ms`
                          : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="panel">
            <h2>{t(locale, 'system.aggregates')}</h2>
            <dl className="definition-list">
              <div>
                <dt>{t(locale, 'dashboard.matchCount')}</dt>
                <dd>{data.aggregates.matchCount}</dd>
              </div>
              <div>
                <dt>{t(locale, 'dashboard.lobbyWaiting')}</dt>
                <dd>{data.aggregates.lobbyWaitingPlayers}</dd>
              </div>
            </dl>
          </section>
        </div>
      ) : null}
    </div>
  );
}
