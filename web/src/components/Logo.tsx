import clsx from 'clsx';

export function Mark({ size = 32, className, onDark = false }: { size?: number; className?: string; onDark?: boolean }) {
  return (
    <svg viewBox="0 0 48 48" width={size} height={size} className={className} aria-hidden="true">
      <path d="M24 3.5 41 9.8v13.4c0 10.2-7.1 18.2-17 21.3C14.1 41.4 7 33.4 7 23.2V9.8Z" fill={onDark ? '#4fd6ab' : '#1f5d52'} />
      <path d="M30.36 17.64A9 9 0 1 0 32.69 26.33" fill="none" stroke="#fff" strokeWidth="2.75" strokeLinecap="round" />
      <path d="m19.6 24.4 3.3 3.3 6.5-7.2" fill="none" stroke="#fff" strokeWidth="2.75" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Logo({ onDark = false, className }: { onDark?: boolean; className?: string }) {
  return (
    <div className={clsx('flex items-center gap-3', className)}>
      <Mark size={34} onDark={onDark} />
      <div className="flex items-baseline gap-2 leading-none">
        <span className={clsx('text-[22px] font-semibold tracking-tight', onDark ? 'text-white' : 'text-text')}>Vigil</span>
        <span className={clsx('text-[11px] font-medium tracking-[0.18em]', onDark ? 'text-ink-400' : 'text-text-soft')}>CLM</span>
      </div>
    </div>
  );
}
