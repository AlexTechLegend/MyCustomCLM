import clsx from 'clsx';
import { FileKey2, FileText, Upload, X } from 'lucide-react';
import { useRef, useState, type ReactNode } from 'react';
import { bytes } from '@/lib/format';

export function FileDrop({
  files,
  onChange,
  multiple = true,
  accept,
  title = 'Drop files here or click to browse',
  hint,
  compact = false,
}: {
  files: File[];
  onChange: (files: File[]) => void;
  multiple?: boolean;
  accept?: string;
  title?: ReactNode;
  hint?: ReactNode;
  compact?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);

  const add = (list: FileList | null) => {
    if (!list) return;
    const incoming = Array.from(list);
    onChange(multiple ? dedupe([...files, ...incoming]) : incoming.slice(0, 1));
  };

  return (
    <div>
      <div
        role="button"
        tabIndex={0}
        onClick={() => input.current?.click()}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && input.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          add(e.dataTransfer.files);
        }}
        className={clsx(
          'rounded-2xl border-2 border-dashed transition-colors cursor-pointer flex flex-col items-center justify-center text-center',
          compact ? 'px-4 py-6' : 'px-6 py-12',
          over ? 'border-brand-500 bg-brand-50' : 'border-ink-300 bg-ink-50/60 hover:border-ink-400 hover:bg-ink-50',
        )}
      >
        <div className={clsx('rounded-xl bg-surface border border-ink-200 text-ink-500 flex items-center justify-center', compact ? 'size-9 mb-2' : 'size-12 mb-3')}>
          <Upload className={compact ? 'size-4' : 'size-5'} />
        </div>
        <div className="text-sm font-medium text-ink-900">{title}</div>
        {hint && <div className="text-[12px] text-ink-500 mt-1 max-w-sm">{hint}</div>}
        <input ref={input} type="file" className="hidden" multiple={multiple} accept={accept} onChange={(e) => { add(e.target.files); e.target.value = ''; }} />
      </div>
      {files.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {files.map((f) => (
            <li key={f.name + f.size} className="flex items-center gap-3 rounded-xl border border-ink-200 bg-surface px-3 py-2">
              {/\.(key|pfx|p12|pk8)$/i.test(f.name) ? <FileKey2 className="size-4 text-warn-600 shrink-0" /> : <FileText className="size-4 text-ink-500 shrink-0" />}
              <span className="text-sm text-ink-900 truncate flex-1">{f.name}</span>
              <span className="text-[12px] text-ink-500 tnum">{bytes(f.size)}</span>
              <button type="button" onClick={(e) => { e.stopPropagation(); onChange(files.filter((x) => x !== f)); }} className="text-ink-400 hover:text-crit-600" aria-label={`Remove ${f.name}`}>
                <X className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function dedupe(files: File[]) {
  const seen = new Set<string>();
  return files.filter((f) => {
    const k = `${f.name}:${f.size}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}
