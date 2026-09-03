import { Modal } from '@/components/ui';

const ROWS: { keys: string; action: string }[] = [
  { keys: 'g then d', action: 'Dashboard' },
  { keys: 'g then c', action: 'Certificates' },
  { keys: 'g then p', action: 'Output profiles' },
  { keys: 'g then r', action: 'Renewals' },
  { keys: 'g then a', action: 'Activity' },
  { keys: 'g then s', action: 'Settings' },
  { keys: 'g then k', action: 'Expiry calendar' },
  { keys: '⌘ / Ctrl K', action: 'Command palette' },
  { keys: '?', action: 'This shortcut map' },
  { keys: 'Escape', action: 'Close any overlay' },
];

export function ShortcutMap({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} title="Keyboard shortcuts" description="Ignored while you are typing in a field." width="max-w-md">
      <ul className="divide-y divide-ink-100">
        {ROWS.map((r) => (
          <li key={r.keys} className="flex items-center justify-between gap-4 py-2 text-[13px]">
            <span className="text-ink-800">{r.action}</span>
            <kbd className="font-mono text-[12px] text-ink-600 bg-ink-50 border border-ink-200 rounded-md px-1.5 py-0.5">{r.keys}</kbd>
          </li>
        ))}
      </ul>
    </Modal>
  );
}
