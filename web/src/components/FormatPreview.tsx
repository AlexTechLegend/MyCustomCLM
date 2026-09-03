import { FileText, Folder } from 'lucide-react';
import { previewForSpec } from '@/lib/formatPresets';
import type { OutputSpec } from '@/types';

export function FolderTree({
  directory,
  files,
  highlight,
}: {
  directory: string;
  files: { filename: string; label?: string }[];
  highlight?: string;
}) {
  return (
    <div className="rounded-xl bg-code text-code-fg overflow-hidden border border-white/10">
      <div className="flex items-center gap-2 px-3.5 py-2.5 border-b border-white/10 text-[12px]">
        <Folder className="size-3.5 text-brand-300" />
        <span className="font-mono truncate text-code-muted">{directory || 'destination folder'}</span>
      </div>
      {files.length === 0 ? (
        <p className="px-3.5 py-4 text-[12px] text-code-muted">Select formats to preview the folder.</p>
      ) : (
        <ul className="py-1.5">
          {files.map((f) => {
            const on = highlight === f.filename;
            return (
              <li
                key={f.filename}
                className={`flex items-center gap-2.5 px-3.5 py-1.5 text-[12px] font-mono ${on ? 'bg-brand-500/25 text-white' : 'text-code-fg'}`}
              >
                <FileText className={`size-3.5 shrink-0 ${on ? 'text-brand-300' : 'text-code-muted'}`} />
                <span className="truncate">{f.filename}</span>
                {f.label && <span className="ml-auto text-[10px] text-code-muted truncate max-w-[40%]">{f.label}</span>}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export function ContentsPreview({ spec }: { spec: Pick<OutputSpec, 'format' | 'filename' | 'lineEnding' | 'includeRoot' | 'keyEncoding'> }) {
  const preview = previewForSpec(spec);
  return (
    <div className="rounded-xl bg-code overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-3.5 py-2.5 border-b border-white/8">
        <span className="text-[12px] font-medium text-white truncate">{preview.heading}</span>
        <span className="text-[10px] uppercase tracking-[0.12em] text-code-muted shrink-0">
          {preview.kind === 'pem' ? 'PEM text' : preview.kind === 'pkcs12' ? 'PKCS#12' : 'Binary'}
        </span>
      </div>
      <pre className="px-3.5 py-3 text-[11px] leading-5 font-mono text-code-fg whitespace-pre-wrap break-all max-h-[220px] overflow-y-auto scrollbar-thin">
        {preview.sample}
      </pre>
      {preview.notes.length > 0 && (
        <ul className="px-3.5 py-2.5 border-t border-white/10 text-[11px] text-code-muted space-y-0.5">
          {preview.notes.map((n) => (
            <li key={n}>· {n}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function FormatPreviewPane({
  spec,
  destinationPath,
  siblings,
}: {
  spec: Pick<OutputSpec, 'format' | 'filename' | 'label' | 'lineEnding' | 'includeRoot' | 'keyEncoding'>;
  destinationPath?: string;
  siblings?: { filename: string; label?: string }[];
}) {
  const files = siblings?.length ? siblings : [{ filename: spec.filename, label: spec.label }];
  return (
    <div className="grid grid-cols-1 gap-3">
      <div>
        <div className="text-[11px] font-medium uppercase tracking-[0.12em] text-text-soft mb-1.5">From a folder</div>
        <FolderTree directory={destinationPath || '{cn_safe}'} files={files} highlight={spec.filename} />
      </div>
      <div>
        <div className="text-[11px] font-medium uppercase tracking-[0.12em] text-text-soft mb-1.5">From its contents</div>
        <ContentsPreview spec={spec} />
      </div>
    </div>
  );
}
