'use client';

import { useEffect, useId, useRef, type ReactNode } from 'react';
import { t } from '@/i18n/get-dictionary';
import type { Locale } from '@/i18n/locale';

type ConfirmDialogProps = {
  locale: Locale;
  open: boolean;
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export function ConfirmDialog({
  locale,
  open,
  title,
  message,
  confirmLabel,
  cancelLabel,
  danger,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const titleId = useId();
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (open) {
      confirmRef.current?.focus();
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onCancel();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onCancel]);

  if (!open) {
    return null;
  }

  return (
    <div className="dialog-backdrop" role="presentation" onClick={onCancel}>
      <div
        className="dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id={titleId}>{title ?? t(locale, 'confirm.title')}</h2>
        <p>{message}</p>
        <div className="dialog-actions">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={onCancel}
          >
            {cancelLabel ?? t(locale, 'common.cancel')}
          </button>
          <button
            ref={confirmRef}
            type="button"
            className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`}
            onClick={onConfirm}
          >
            {confirmLabel ?? t(locale, 'common.confirm')}
          </button>
        </div>
      </div>
    </div>
  );
}

export function StateBlock({
  children,
  className,
}: {
  children: ReactNode;
  className: string;
}) {
  return <div className={className}>{children}</div>;
}

export function LoadingState({ label }: { label: string }) {
  return (
    <StateBlock className="loading-block">
      <p>{label}</p>
    </StateBlock>
  );
}

export function EmptyState({ label }: { label: string }) {
  return (
    <StateBlock className="empty-block">
      <p>{label}</p>
    </StateBlock>
  );
}

export function ForbiddenState({ label }: { label: string }) {
  return (
    <StateBlock className="forbidden-block">
      <p>{label}</p>
    </StateBlock>
  );
}

export function ErrorState({
  label,
  retryLabel,
  onRetry,
}: {
  label: string;
  retryLabel: string;
  onRetry?: () => void;
}) {
  return (
    <StateBlock className="error-block">
      <p>{label}</p>
      {onRetry ? (
        <button type="button" className="btn btn-secondary" onClick={onRetry}>
          {retryLabel}
        </button>
      ) : null}
    </StateBlock>
  );
}
