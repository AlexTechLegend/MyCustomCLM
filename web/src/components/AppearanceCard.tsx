import clsx from 'clsx';
import { Moon, Sun } from 'lucide-react';
import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { Card, CardHeader } from '@/components/ui';
import { PALETTES, broadcastAppearance, persistPalette, readPalette, syncThemeColor, type Palette } from '@/lib/palette';
import { persistTheme, readTheme, type Theme } from '@/lib/theme';

const MODES: { id: Theme; label: string; icon: typeof Sun }[] = [
  { id: 'light', label: 'Light', icon: Sun },
  { id: 'dark', label: 'Dark', icon: Moon },
];

export function AppearanceCard() {
  const [theme, setTheme] = useState<Theme>(() => readTheme());
  const [palette, setPalette] = useState<Palette>(() => readPalette());
  const radioRefs = useRef<Partial<Record<Palette, HTMLButtonElement | null>>>({});

  useEffect(() => {
    const sync = () => {
      setTheme(readTheme());
      setPalette(readPalette());
    };
    window.addEventListener('storage', sync);
    window.addEventListener('vigil:appearance', sync);
    return () => {
      window.removeEventListener('storage', sync);
      window.removeEventListener('vigil:appearance', sync);
    };
  }, []);

  const setMode = (next: Theme) => {
    persistTheme(next);
    setTheme(next);
    syncThemeColor();
    broadcastAppearance();
  };

  const choose = (id: Palette) => {
    persistPalette(id);
    setPalette(id);
  };

  const onPaletteKey = (e: KeyboardEvent, id: Palette) => {
    const i = PALETTES.findIndex((p) => p.id === id);
    let next = -1;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (i + 1) % PALETTES.length;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = (i - 1 + PALETTES.length) % PALETTES.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = PALETTES.length - 1;
    else if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      choose(id);
      return;
    } else return;
    e.preventDefault();
    const target = PALETTES[next];
    choose(target.id);
    radioRefs.current[target.id]?.focus();
  };

  return (
    <Card>
      <CardHeader title="Appearance" description="Colour only. Shape and density stay Console. Stored in this browser, not on the server." />

      <Fieldset legend="Mode">
        <div role="radiogroup" aria-label="Colour mode" className="inline-flex items-center gap-0.5 rounded border border-line bg-canvas p-1">
          {MODES.map((m) => {
            const Icon = m.icon;
            const on = theme === m.id;
            return (
              <button
                key={m.id}
                type="button"
                role="radio"
                aria-checked={on}
                tabIndex={on ? 0 : -1}
                onClick={() => setMode(m.id)}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
                    e.preventDefault();
                    setMode(m.id === 'light' ? 'dark' : 'light');
                  } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
                    e.preventDefault();
                    setMode(m.id === 'dark' ? 'light' : 'dark');
                  }
                }}
                className={clsx(
                  'px-3 h-8 text-[12.5px] font-medium rounded inline-flex items-center gap-1.5 border transition-colors',
                  on ? 'bg-surface text-text border-line' : 'bg-transparent text-text-mid border-transparent hover:text-text',
                )}
              >
                <Icon className="size-3.5" />
                {m.label}
              </button>
            );
          })}
        </div>
      </Fieldset>

      <Fieldset legend="Palette" className="mt-5">
        <div role="radiogroup" aria-label="Colour palette" className="grid grid-cols-2 gap-2">
          {PALETTES.map((p) => {
            const on = palette === p.id;
            return (
              <button
                key={p.id}
                type="button"
                role="radio"
                aria-checked={on}
                aria-label={`${p.label}. ${p.description}`}
                tabIndex={on ? 0 : -1}
                ref={(el) => {
                  radioRefs.current[p.id] = el;
                }}
                onClick={() => choose(p.id)}
                onKeyDown={(e) => onPaletteKey(e, p.id)}
                className={clsx(
                  'text-left rounded border p-2.5 transition-colors',
                  on ? 'border-accent bg-accent-soft ring-1 ring-accent' : 'border-line bg-surface hover:border-line-strong',
                )}
              >
                <div className="flex items-center justify-between gap-2 mb-2">
                  <span className="text-[12.5px] font-medium text-text">{p.label}</span>
                  {on && <span className="text-[10px] uppercase tracking-wide text-accent">Active</span>}
                </div>
                <div className="h-8 rounded" style={{ background: p.accent }} />
                <div className="mt-1.5 flex h-3 overflow-hidden rounded">
                  <span className="flex-1" style={{ background: p.canvas }} />
                  <span className="flex-1" style={{ background: p.surface }} />
                </div>
                <div className="mt-2 flex items-center gap-1.5" aria-hidden>
                  <StatusDot color={p.ok} />
                  <StatusDot color={p.warn} />
                  <StatusDot color={p.crit} />
                  <StatusDot color={p.dead} />
                </div>
              </button>
            );
          })}
        </div>
      </Fieldset>
    </Card>
  );
}

function Fieldset({ legend, className, children }: { legend: string; className?: string; children: ReactNode }) {
  return (
    <div className={className}>
      <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-text-soft mb-2">{legend}</div>
      {children}
    </div>
  );
}

function StatusDot({ color }: { color: string }) {
  return <span className="size-2.5 rounded-full shrink-0" style={{ background: color }} />;
}
