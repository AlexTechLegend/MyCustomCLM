import { Check, Copy } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { useToast } from '@/components/Toast';
import { Button } from '@/components/ui';
import clsx from 'clsx';

/** Copy via Clipboard API, falling back to execCommand for plain-http LAN deploys. */
export async function copyText(value: string): Promise<boolean> {
  const text = value ?? '';
  if (!text) return false;
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through */
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.top = '0';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    ta.setSelectionRange(0, ta.value.length);
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

export function useCopy() {
  const toast = useToast();
  return async (value: string, successTitle = 'Copied') => {
    const ok = await copyText(value);
    if (ok) toast.success(successTitle);
    else toast.error('Could not copy', 'Clipboard access was blocked. Select the text and copy it manually.');
    return ok;
  };
}

export function CopyButton({
  value,
  label = 'Copy',
  success = 'Copied',
  className,
  size = 'sm',
  variant = 'ghost',
}: {
  value: string;
  label?: string;
  success?: string;
  className?: string;
  size?: 'sm' | 'md';
  variant?: 'ghost' | 'secondary';
}) {
  const copy = useCopy();
  const [done, setDone] = useState(false);
  return (
    <Button
      type="button"
      size={size}
      variant={variant}
      className={className}
      icon={done ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
      onClick={async () => {
        if (await copy(value, success)) {
          setDone(true);
          window.setTimeout(() => setDone(false), 1500);
        }
      }}
    >
      {label}
    </Button>
  );
}

/** Mono value with a copy icon that appears on hover/focus. */
export function CopyableValue({
  value,
  className,
  success,
}: {
  value: string;
  className?: string;
  success?: string;
}) {
  const copy = useCopy();
  const [done, setDone] = useState(false);
  if (!value) return <span className="text-ink-400">—</span>;
  return (
    <span className={clsx('group inline-flex items-start gap-1.5 min-w-0 max-w-full', className)}>
      <span className="font-mono text-[12.5px] text-ink-900 break-all">{value}</span>
      <button
        type="button"
        className="shrink-0 mt-0.5 rounded-md p-0.5 text-ink-400 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus:opacity-100 hover:text-ink-800 hover:bg-ink-100 transition-opacity"
        aria-label="Copy"
        onClick={async () => {
          if (await copy(value, success ?? 'Copied')) {
            setDone(true);
            window.setTimeout(() => setDone(false), 1500);
          }
        }}
      >
        {done ? <Check className="size-3.5 text-ok-600" /> : <Copy className="size-3.5" />}
      </button>
    </span>
  );
}

export function CopyableBadge({ value, children }: { value: string; children?: ReactNode }) {
  const copy = useCopy();
  return (
    <button
      type="button"
      title={`Copy ${value}`}
      onClick={() => copy(value, 'Copied')}
      className="inline-flex items-center gap-1 rounded-lg bg-ink-100 text-ink-700 px-2 py-0.5 text-[12px] font-medium hover:bg-ink-200 transition-colors"
    >
      <span className="font-mono">{children ?? value}</span>
      <Copy className="size-3 text-ink-400" />
    </button>
  );
}
