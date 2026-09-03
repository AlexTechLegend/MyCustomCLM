import clsx from 'clsx';
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';

type Tone = 'success' | 'error' | 'info';
interface Toast {
  id: number;
  tone: Tone;
  title: string;
  description?: string;
}

const Ctx = createContext<{ push: (t: Omit<Toast, 'id'>) => void } | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const seq = useRef(0);
  const push = useCallback((t: Omit<Toast, 'id'>) => {
    const id = ++seq.current;
    setItems((cur) => [...cur, { ...t, id }]);
    window.setTimeout(() => setItems((cur) => cur.filter((x) => x.id !== id)), t.tone === 'error' ? 8000 : 4500);
  }, []);
  const value = useMemo(() => ({ push }), [push]);
  return (
    <Ctx.Provider value={value}>
      {children}
      <div className="fixed bottom-5 right-5 z-[60] flex flex-col gap-2 w-[360px] max-w-[calc(100vw-2.5rem)]">
        {items.map((t) => (
          <div key={t.id} className="card p-4 flex items-start gap-3 shadow-xl shadow-ink-950/10 animate-[fadeIn_150ms_ease-out]">
            {t.tone === 'success' && <CheckCircle2 className="size-5 text-ok-600 shrink-0 mt-0.5" />}
            {t.tone === 'error' && <AlertCircle className="size-5 text-crit-600 shrink-0 mt-0.5" />}
            {t.tone === 'info' && <Info className="size-5 text-brand-600 shrink-0 mt-0.5" />}
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium text-ink-950">{t.title}</div>
              {t.description && <div className={clsx('text-[13px] mt-0.5 break-words', t.tone === 'error' ? 'text-crit-700' : 'text-ink-500')}>{t.description}</div>}
            </div>
            <button type="button" onClick={() => setItems((cur) => cur.filter((x) => x.id !== t.id))} className="text-ink-400 hover:text-ink-700" aria-label="Dismiss">
              <X className="size-4" />
            </button>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export function useToast() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useToast outside provider');
  return {
    success: (title: string, description?: string) => ctx.push({ tone: 'success', title, description }),
    error: (title: string, err?: unknown) => ctx.push({ tone: 'error', title, description: err instanceof Error ? err.message : typeof err === 'string' ? err : undefined }),
    info: (title: string, description?: string) => ctx.push({ tone: 'info', title, description }),
  };
}
