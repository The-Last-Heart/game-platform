'use client';

import { useState } from 'react';
import { t } from '@/i18n/get-dictionary';
import type { Locale } from '@/i18n/locale';
import type { MessageKey } from '@/i18n/messages/en';

export type PreviewState = 'intro' | 'active' | 'success' | 'failure' | 'timeout' | 'unsupported';

const PREVIEW_STATES: PreviewState[] = ['intro', 'active', 'success', 'failure', 'timeout', 'unsupported'];

const STATE_LABEL_KEYS: Record<PreviewState, MessageKey> = {
  intro: 'studio.preview.intro',
  active: 'studio.preview.active',
  success: 'studio.preview.success',
  failure: 'studio.preview.failure',
  timeout: 'studio.preview.timeout',
  unsupported: 'studio.preview.unsupported',
};

type DevicePreviewFrameProps = {
  locale: Locale;
  challengeTitle?: string;
  instructionAr?: string;
  durationMs?: number;
  engineId?: string;
};

export function DevicePreviewFrame({
  locale,
  challengeTitle,
  instructionAr,
  durationMs,
  engineId,
}: DevicePreviewFrameProps) {
  const [activeState, setActiveState] = useState<PreviewState>('intro');

  const hasChallenge = Boolean(challengeTitle || instructionAr);

  return (
    <div className="device-preview-frame">
      <div className="device-preview-tabs">
        {PREVIEW_STATES.map((state) => (
          <button
            key={state}
            type="button"
            aria-pressed={activeState === state ? 'true' : 'false'}
            onClick={() => setActiveState(state)}
          >
            {t(locale, STATE_LABEL_KEYS[state])}
          </button>
        ))}
      </div>

      <div className="device-preview-chrome">
        <div className="device-preview-notch">
          <div className="device-preview-notch-pill" />
        </div>

        <div className="device-preview-screen">
          <div className="device-preview-test-badge">
            ● {t(locale, 'studio.preview.testData')}
          </div>

          {!hasChallenge ? (
            <p style={{ opacity: 0.5 }}>
              {t(locale, 'studio.preview.noChallenge')}
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', alignItems: 'center' }}>
              {engineId ? (
                <span style={{ fontSize: '0.7rem', opacity: 0.5, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  {engineId}
                </span>
              ) : null}

              {activeState === 'intro' ? (
                <>
                  <span style={{ fontSize: '1.1rem', fontWeight: 700 }}>
                    {instructionAr || challengeTitle}
                  </span>
                  {durationMs ? (
                    <span style={{ fontSize: '2rem', fontFamily: 'var(--lh-font-display)', fontWeight: 700 }}>
                      {(durationMs / 1000).toFixed(1)}s
                    </span>
                  ) : null}
                </>
              ) : null}

              {activeState === 'active' ? (
                <>
                  <span style={{ fontSize: '1rem', fontWeight: 600 }}>
                    {instructionAr || challengeTitle}
                  </span>
                  <div style={{
                    width: '4rem',
                    height: '4rem',
                    borderRadius: '50%',
                    border: '3px solid var(--lh-accent)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '1.5rem',
                  }}>
                    ♥
                  </div>
                  {durationMs ? (
                    <span style={{ fontSize: '0.9rem', opacity: 0.7 }}>
                      {(durationMs / 1000).toFixed(1)}s
                    </span>
                  ) : null}
                </>
              ) : null}

              {activeState === 'success' ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}>
                  <span style={{ fontSize: '2.5rem' }}>✓</span>
                  <span style={{ fontSize: '1rem', fontWeight: 600, color: '#4ade80' }}>
                    {t(locale, 'studio.preview.success')}
                  </span>
                </div>
              ) : null}

              {activeState === 'failure' ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}>
                  <span style={{ fontSize: '2.5rem' }}>✗</span>
                  <span style={{ fontSize: '1rem', fontWeight: 600, color: '#f87171' }}>
                    {t(locale, 'studio.preview.failure')}
                  </span>
                </div>
              ) : null}

              {activeState === 'timeout' ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}>
                  <span style={{ fontSize: '2.5rem' }}>⏱</span>
                  <span style={{ fontSize: '1rem', fontWeight: 600, color: '#fbbf24' }}>
                    {t(locale, 'studio.preview.timeout')}
                  </span>
                </div>
              ) : null}

              {activeState === 'unsupported' ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}>
                  <span style={{ fontSize: '2.5rem' }}>⚠</span>
                  <span style={{ fontSize: '1rem', fontWeight: 600, opacity: 0.6 }}>
                    {t(locale, 'studio.preview.unsupported')}
                  </span>
                </div>
              ) : null}
            </div>
          )}
        </div>

        <div className="device-preview-home-bar">
          <div className="device-preview-home-indicator" />
        </div>
      </div>
    </div>
  );
}
