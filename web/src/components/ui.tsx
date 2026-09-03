import clsx from 'clsx';
import { Loader2, X } from 'lucide-react';
import { forwardRef, useEffect, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { Link } from 'react-router-dom';
import type { CertStatus } from '@/types';
import { STATUS_META } from '@/lib/format';

// Buttons -------------------------------------------------------------------

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

const variantClass: Record<Variant, string> = {
  primary: 'bg-brand-600 text-white hover:bg-brand-700 border border-transparent disabled:bg-brand-300',
  secondary: 'bg-surface text-ink-800 border border-ink-200 hover:bg-ink-50 hover:border-ink-300',
  ghost: 'bg-transparent text-ink-600 hover:bg-ink-100 hover:text-ink-900 border border-transparent',
  danger: 'bg-surface text-crit-600 border border-ink-200 hover:bg-crit-50 hover:border-crit-100',
};
const sizeClass: Record<Size, string> = {
  sm: 'h-8 px-3 text-[13px] gap-1.5 rounded-lg',
  md: 'h-9.5 px-4 text-sm gap-2 rounded-xl',
  lg: 'h-11 px-5 text-[15px] gap-2 rounded-xl',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', loading, icon, className, children, disabled, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={clsx(
        'inline-flex items-center justify-center font-medium whitespace-nowrap transition-colors duration-150 disabled:opacity-60 disabled:cursor-not-allowed select-none',
        variantClass[variant],
        sizeClass[size],
        className,
      )}
      {...rest}
    >
      {loading ? <Loader2 className="size-4 animate-spin" /> : icon}
      {children}
    </button>
  );
});

export function LinkButton({ to, variant = 'secondary', size = 'md', icon, className, children }: { to: string; variant?: Variant; size?: Size; icon?: ReactNode; className?: string; children: ReactNode }) {
  return (
    <Link to={to} className={clsx('inline-flex items-center justify-center font-medium whitespace-nowrap transition-colors duration-150', variantClass[variant], sizeClass[size], className)}>
      {icon}
      {children}
    </Link>
  );
}

// Layout primitives ---------------------------------------------------------

export function Card({ className, children, padded = true }: { className?: string; children: ReactNode; padded?: boolean }) {
  return <section className={clsx('card', padded && 'p-6', className)}>{children}</section>;
}

export function CardHeader({ title, description, action, className }: { title: ReactNode; description?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={clsx('flex items-start justify-between gap-4 mb-5', className)}>
      <div>
        <h3 className="text-[15px] font-semibold text-ink-950">{title}</h3>
        {description && <p className="text-[13px] text-ink-500 mt-0.5">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function PageHeader({ title, description, actions, eyebrow }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; eyebrow?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4 mb-8">
      <div className="min-w-0">
        {eyebrow && <div className="text-[12px] font-medium uppercase tracking-[0.12em] text-ink-500 mb-2">{eyebrow}</div>}
        <h1 className="text-[28px] leading-tight truncate">{title}</h1>
        {description && <p className="text-ink-500 mt-1.5 max-w-2xl">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
    </div>
  );
}

export function StatCard({ label, value, hint, tone = 'default', icon, to }: { label: string; value: ReactNode; hint?: ReactNode; tone?: 'default' | 'brand' | 'warn' | 'crit' | 'ok' | 'dead'; icon?: ReactNode; to?: string }) {
  const toneClass = {
    default: 'text-ink-950',
    brand: 'text-brand-700',
    warn: 'text-warn-600',
    crit: 'text-crit-600',
    ok: 'text-ok-600',
    dead: 'text-dead-600',
  }[tone];
  const body = (
    <>
      <div className="flex items-center justify-between">
        <span className="text-[13px] font-medium text-ink-500">{label}</span>
        {icon && <span className="text-ink-400">{icon}</span>}
      </div>
      <div className={clsx('mt-3 text-[32px] leading-none font-semibold tracking-tight tnum', toneClass)}>{value}</div>
      {hint && <div className="mt-2.5 text-[13px] text-ink-500">{hint}</div>}
    </>
  );
  return to ? (
    <Link to={to} className="card p-5 block hover:border-ink-300 transition-colors">
      {body}
    </Link>
  ) : (
    <div className="card p-5">{body}</div>
  );
}

export function Badge({ children, className, tone = 'neutral' }: { children: ReactNode; className?: string; tone?: 'neutral' | 'brand' | 'ok' | 'warn' | 'crit' }) {
  const tones = {
    neutral: 'bg-ink-100 text-ink-700',
    brand: 'bg-brand-100 text-brand-800',
    ok: 'bg-ok-100 text-ok-700',
    warn: 'bg-warn-100 text-warn-700',
    crit: 'bg-crit-100 text-crit-700',
  };
  return <span className={clsx('inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[12px] font-medium whitespace-nowrap', tones[tone], className)}>{children}</span>;
}

export function StatusBadge({ status, days }: { status: CertStatus; days?: number }) {
  const m = STATUS_META[status];
  return (
    <span className={clsx('inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[12px] font-medium whitespace-nowrap', m.badge)}>
      <span className={clsx('size-1.5 rounded-full', m.dot)} />
      {m.label}
      {days !== undefined && <span className="opacity-70 tnum">· {days < 0 ? `${Math.abs(days)} d ago` : `${days} d`}</span>}
    </span>
  );
}

export function LifetimeBar({ used, status, className }: { used: number; status: CertStatus; className?: string }) {
  return (
    <div className={clsx('h-1.5 w-full rounded-full bg-ink-100 overflow-hidden', className)}>
      <div className={clsx('h-full rounded-full transition-all', STATUS_META[status].bar)} style={{ width: `${Math.round(Math.min(1, Math.max(0.02, used)) * 100)}%` }} />
    </div>
  );
}

export function EmptyState({ icon, title, description, action }: { icon?: ReactNode; title: string; description?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-16 px-6">
      {icon && <div className="size-12 rounded-2xl bg-ink-100 text-ink-500 flex items-center justify-center mb-4">{icon}</div>}
      <h3 className="text-[15px] font-semibold text-ink-950">{title}</h3>
      {description && <p className="text-ink-500 mt-1 max-w-md">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={clsx('size-5 animate-spin text-ink-400', className)} />;
}

export function Loading({ label = 'Loading' }: { label?: string }) {
  return (
    <div className="flex items-center gap-3 text-ink-500 py-16 justify-center">
      <Spinner /> <span>{label}…</span>
    </div>
  );
}

export function ErrorBox({ error, className }: { error: unknown; className?: string }) {
  if (!error) return null;
  const e = error as { message?: string; command?: string; stderr?: string };
  return (
    <div className={clsx('rounded-xl border border-crit-100 bg-crit-50 text-crit-700 px-4 py-3 text-[13px]', className)}>
      <div className="font-medium">{e.message ?? String(error)}</div>
      {e.command && <div className="mt-1.5 font-mono text-[12px] text-crit-600/80 break-all">{e.command}</div>}
      {e.stderr && <pre className="mt-1 font-mono text-[11px] text-crit-600/70 whitespace-pre-wrap">{e.stderr}</pre>}
    </div>
  );
}

// Forms ---------------------------------------------------------------------

export function Field({ label, hint, children, className, required }: { label: ReactNode; hint?: ReactNode; children: ReactNode; className?: string; required?: boolean }) {
  return (
    <label className={clsx('block', className)}>
      <span className="block text-[13px] font-medium text-ink-800 mb-1.5">
        {label}
        {required && <span className="text-crit-500 ml-0.5">*</span>}
      </span>
      {children}
      {hint && <span className="block text-[12px] text-ink-500 mt-1.5">{hint}</span>}
    </label>
  );
}

const controlClass = 'w-full h-9.5 rounded-xl border border-ink-200 bg-surface px-3 text-sm text-ink-900 placeholder:text-ink-400 hover:border-ink-300 focus:border-brand-500 transition-colors disabled:bg-ink-50 disabled:text-ink-500';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...rest }, ref) {
  return <input ref={ref} className={clsx(controlClass, rest.type === 'password' && 'font-mono tracking-wide', className)} {...rest} />;
});

export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={clsx(controlClass, 'appearance-none bg-[url("data:image/svg+xml,%3Csvg%20xmlns=%27http://www.w3.org/2000/svg%27%20width=%2716%27%20height=%2716%27%20fill=%27none%27%20stroke=%27%2364748b%27%20stroke-width=%272%27%3E%3Cpath%20d=%27m4%206%204%204%204-4%27/%3E%3C/svg%3E")] bg-no-repeat bg-[right_0.6rem_center] pr-9', className)} {...rest}>
      {children}
    </select>
  );
}

export function Textarea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={clsx(controlClass, 'h-auto py-2 min-h-24 resize-y leading-6', className)} {...rest} />;
}

export function Toggle({ checked, onChange, label, description, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode; description?: ReactNode; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={clsx('flex items-start gap-3 text-left w-full rounded-xl p-3 -m-3 hover:bg-ink-50 transition-colors disabled:opacity-60', disabled && 'cursor-not-allowed')}
    >
      <span className={clsx('mt-0.5 relative inline-flex h-5 w-9 shrink-0 rounded-full transition-colors', checked ? 'bg-brand-600' : 'bg-ink-300')}>
        <span className={clsx('absolute top-0.5 size-4 rounded-full bg-white transition-transform', checked ? 'translate-x-4.5' : 'translate-x-0.5')} />
      </span>
      <span>
        <span className="block text-sm font-medium text-ink-900">{label}</span>
        {description && <span className="block text-[12px] text-ink-500 mt-0.5">{description}</span>}
      </span>
    </button>
  );
}

export function Checkbox({ checked, onChange, label, description, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode; description?: ReactNode; disabled?: boolean }) {
  return (
    <label className={clsx('flex items-start gap-3 cursor-pointer', disabled && 'opacity-60 cursor-not-allowed')}>
      <input type="checkbox" className="mt-1 size-4 rounded border-ink-300 accent-brand-600" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span>
        <span className="block text-sm font-medium text-ink-900">{label}</span>
        {description && <span className="block text-[12px] text-ink-500 mt-0.5">{description}</span>}
      </span>
    </label>
  );
}

export function RadioCard({ checked, onChange, title, description, icon, disabled }: { checked: boolean; onChange: () => void; title: ReactNode; description?: ReactNode; icon?: ReactNode; disabled?: boolean }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onChange}
      className={clsx(
        'text-left rounded-xl border p-4 transition-colors w-full',
        checked ? 'border-brand-500 bg-brand-50/60 ring-1 ring-brand-500' : 'border-ink-200 hover:border-ink-300 bg-surface',
        disabled && 'opacity-50 cursor-not-allowed',
      )}
    >
      <div className="flex items-start gap-3">
        {icon && <span className={clsx('mt-0.5', checked ? 'text-brand-700' : 'text-ink-400')}>{icon}</span>}
        <div>
          <div className="text-sm font-medium text-ink-950">{title}</div>
          {description && <div className="text-[12px] text-ink-500 mt-0.5 leading-5">{description}</div>}
        </div>
      </div>
    </button>
  );
}

// Misc ----------------------------------------------------------------------

export function CodeBlock({ children, className, lines = false }: { children: string; className?: string; lines?: boolean }) {
  return (
    <pre className={clsx('rounded-xl bg-ink-950 text-ink-200 text-[12px] leading-5 font-mono p-4 overflow-x-auto scrollbar-thin', className)}>
      {lines
        ? children.split('\n').map((l, i) => (
            <div key={i} className="flex gap-4">
              <span className="text-ink-600 select-none w-5 text-right shrink-0">{i + 1}</span>
              <span className="whitespace-pre-wrap break-all">{l}</span>
            </div>
          ))
        : children}
    </pre>
  );
}

export function CommandTrail({ commands }: { commands: string[] }) {
  if (!commands.length) return <p className="text-[13px] text-ink-500">No OpenSSL commands were recorded for this action.</p>;
  return (
    <div className="rounded-xl bg-ink-950 p-4 overflow-x-auto scrollbar-thin">
      {commands.map((c, i) => (
        <div key={i} className="flex gap-3 text-[12px] leading-5 font-mono">
          <span className="text-brand-400 select-none shrink-0">$</span>
          <span className="text-ink-200 whitespace-pre-wrap break-all">{c}</span>
        </div>
      ))}
    </div>
  );
}

export function KeyValue({ items, className }: { items: { label: string; value: ReactNode; mono?: boolean }[]; className?: string }) {
  return (
    <dl className={clsx('grid grid-cols-[minmax(120px,160px)_1fr] gap-x-6 gap-y-3', className)}>
      {items.map((it) => (
        <div key={it.label} className="contents">
          <dt className="text-[13px] text-ink-500 pt-0.5">{it.label}</dt>
          <dd className={clsx('text-sm text-ink-900 break-words min-w-0', it.mono && 'font-mono text-[12.5px]')}>{it.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: { id: T; label: ReactNode; count?: number }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="flex items-center gap-1 border-b border-ink-200">
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => onChange(t.id)}
          className={clsx(
            '-mb-px px-3.5 h-10 text-sm font-medium border-b-2 transition-colors inline-flex items-center gap-2',
            value === t.id ? 'border-brand-600 text-ink-950' : 'border-transparent text-ink-500 hover:text-ink-800',
          )}
        >
          {t.label}
          {t.count !== undefined && <span className={clsx('rounded-md px-1.5 text-[11px] tnum', value === t.id ? 'bg-brand-100 text-brand-800' : 'bg-ink-100 text-ink-600')}>{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function Chips<T extends string>({ options, value, onChange }: { options: { id: T; label: ReactNode; count?: number }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          onClick={() => onChange(o.id)}
          className={clsx(
            'h-8 rounded-lg px-3 text-[13px] font-medium border transition-colors inline-flex items-center gap-1.5',
            value === o.id ? 'bg-ink-950 text-white border-ink-950' : 'bg-surface text-ink-600 border-ink-200 hover:border-ink-300 hover:text-ink-900',
          )}
        >
          {o.label}
          {o.count !== undefined && <span className={clsx('tnum text-[11px]', value === o.id ? 'text-ink-300' : 'text-ink-400')}>{o.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function Modal({ open, onClose, title, description, children, footer, width = 'max-w-lg' }: { open: boolean; onClose: () => void; title: ReactNode; description?: ReactNode; children: ReactNode; footer?: ReactNode; width?: string }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-ink-950/40 backdrop-blur-[2px]" onClick={onClose} />
      <div role="dialog" aria-modal className={clsx('relative w-full card p-0 shadow-2xl shadow-ink-950/20', width)}>
        <div className="flex items-start justify-between gap-4 px-6 pt-6">
          <div>
            <h2 className="text-lg">{title}</h2>
            {description && <p className="text-[13px] text-ink-500 mt-1">{description}</p>}
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-ink-400 hover:bg-ink-100 hover:text-ink-700 transition-colors" aria-label="Close">
            <X className="size-4" />
          </button>
        </div>
        <div className="px-6 py-5">{children}</div>
        {footer && <div className="px-6 pb-6 flex items-center justify-end gap-2">{footer}</div>}
      </div>
    </div>
  );
}

export function Divider({ className }: { className?: string }) {
  return <hr className={clsx('border-ink-200', className)} />;
}
