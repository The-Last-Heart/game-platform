'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

type BreadcrumbLabelContextValue = {
  labels: Record<string, string>;
  setLabel: (path: string, label: string | null) => void;
};

const BreadcrumbLabelContext = createContext<BreadcrumbLabelContextValue>({
  labels: {},
  setLabel: () => {},
});

export function BreadcrumbLabelProvider({ children }: { children: ReactNode }) {
  const [labels, setLabels] = useState<Record<string, string>>({});
  const setLabel = useCallback((path: string, label: string | null) => {
    setLabels((prev) => {
      const trimmed = label?.trim() ?? '';
      if (trimmed === '') {
        if (!(path in prev)) return prev;
        const next = { ...prev };
        delete next[path];
        return next;
      }
      if (prev[path] === trimmed) return prev;
      return { ...prev, [path]: trimmed };
    });
  }, []);
  const value = useMemo(() => ({ labels, setLabel }), [labels, setLabel]);
  return (
    <BreadcrumbLabelContext.Provider value={value}>
      {children}
    </BreadcrumbLabelContext.Provider>
  );
}

export function useBreadcrumbLabels(): Record<string, string> {
  return useContext(BreadcrumbLabelContext).labels;
}

/** Registers an operator-facing name for a locale-stripped path while mounted. */
export function useBreadcrumbLabel(
  path: string | null,
  label: string | null,
): void {
  const { setLabel } = useContext(BreadcrumbLabelContext);
  useEffect(() => {
    if (!path) return;
    setLabel(path, label);
    return () => setLabel(path, null);
  }, [path, label, setLabel]);
}
