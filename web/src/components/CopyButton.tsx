import clsx from 'clsx';
import { Check, Copy } from 'lucide-react';
import { useCallback, useState, type ReactNode } from 'react';

/** Copy with Clipboard API, falling back to execCommand for plain-http deployments. */
export async function copyText(value: string): Promise<boolean> {
  const text = value ?? '';
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fall through to execCommand.
  }
  try {
    const el = document.createElement('textarea');
    el.value = text;
    el.setAttribute('readonly', '');
    el.style.position = 'fixed';
    el.style.top = '0';
    el.style.left = '-9999px';
    document.body.appendChild(el);
    el.select();
    el.setSelectionRange(0, text.length);
    const ok = document.execCommand('copy');
    document.body.removeChild(el);
    return ok;
  } catch {
    return false;
  }
}

export function CopyButton({
  value,
  label = 'Copy',
  className,
  size = 'sm',
}: {
  value: string;
  label?: string;
  className?: string;
  size?: 'sm' | 'md';
}) {
  const [copied, setCopied] = useState(false);
  const onCopy = useCallback(async () => {
    const ok = await copyText(value);
    if (!ok) return;
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }, [value]);
  return (
    <button
      type="button"
      onClick={onCopy}
      className={clsx(
        'inline-flex items-center gap-1 rounded-lg text-text-soft hover:text-text hover:bg-surface transition-colors',
        size === 'sm' ? 'p-1' : 'px-2 py-1 text-[13px]',
        className,
      )}
      aria-label={copied ? 'Copied' : label}
      title={copied ? 'Copied' : label}
    >
      {copied ? <Check className="size-3.5 text-ok-fg" /> : <Copy className="size-3.5" />}
      {size === 'md' && <span>{copied ? 'Copied' : label}</span>}
    </button>
  );
}

export function CopyableValue({ value, children, className, mono }: { value: string; children?: ReactNode; className?: string; mono?: boolean }) {
  return (
    <span className={clsx('inline-flex items-center gap-1 min-w-0 max-w-full', className)}>
      <span className={clsx('truncate', mono && 'font-mono text-[12.5px]')}>{children ?? value}</span>
      <CopyButton value={value} />
    </span>
  );
}
