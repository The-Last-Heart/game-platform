'use client';

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { t } from '@/i18n/get-dictionary';
import type { Locale } from '@/i18n/locale';

type ToastItem = {
  id: string;
  message: string;
  variant: 'success' | 'error';
};

type ToastContextValue = {
  pushToast: (message: string, variant?: 'success' | 'error') => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({
  locale,
  children,
}: {
  locale: Locale;
  children: ReactNode;
}) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const pushToast = useCallback(
    (message: string, variant: 'success' | 'error' = 'success') => {
      const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
      setItems((prev) => [...prev, { id, message, variant }]);
      window.setTimeout(() => {
        setItems((prev) => prev.filter((item) => item.id !== id));
      }, 4500);
    },
    [],
  );

  const value = useMemo(() => ({ pushToast }), [pushToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        className="toast-region"
        aria-live="polite"
        aria-relevant="additions"
      >
        {items.map((item) => (
          <div
            key={item.id}
            className="toast"
            data-variant={item.variant}
            role="status"
          >
            <div>
              <strong>
                {item.variant === 'success'
                  ? t(locale, 'toast.success')
                  : t(locale, 'toast.error')}
              </strong>
              <div>{item.message}</div>
            </div>
            <button
              type="button"
              className="btn btn-ghost"
              aria-label={t(locale, 'toast.dismiss')}
              onClick={() =>
                setItems((prev) => prev.filter((x) => x.id !== item.id))
              }
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error('useToast must be used within ToastProvider');
  }
  return ctx;
}
