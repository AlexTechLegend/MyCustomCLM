import clsx from 'clsx';
import { Moon, Sun } from 'lucide-react';
import { useEffect, useState } from 'react';
import { syncThemeColor } from '@/lib/palette';
import { applyTheme, cycleTheme, persistTheme, readTheme, type Theme } from '@/lib/theme';

const META: Record<Theme, { label: string; icon: typeof Sun }> = {
  light: { label: 'Light', icon: Sun },
  dark: { label: 'Dark', icon: Moon },
};

export function ThemeToggle({ className }: { className?: string }) {
  const [theme, setTheme] = useState<Theme>(() => readTheme());

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  useEffect(() => {
    const sync = () => setTheme(readTheme());
    window.addEventListener('storage', sync);
    window.addEventListener('vigil:appearance', sync);
    return () => {
      window.removeEventListener('storage', sync);
      window.removeEventListener('vigil:appearance', sync);
    };
  }, []);

  const next = () => {
    const value = cycleTheme(theme);
    persistTheme(value);
    setTheme(value);
    syncThemeColor();
    window.dispatchEvent(new Event('vigil:appearance'));
  };

  const { label, icon: Icon } = META[theme];

  return (
    <button
      type="button"
      onClick={next}
      className={clsx(
        'inline-flex items-center gap-2 rounded-xl px-3 h-10 text-sm font-medium transition-colors',
        'text-white/60 hover:text-white hover:bg-white/8',
        className,
      )}
      aria-label={`Theme: ${label}. Click to switch to ${cycleTheme(theme)}.`}
      title={`Theme: ${label}`}
    >
      <Icon className="size-[18px]" />
      <span>{label}</span>
    </button>
  );
}
