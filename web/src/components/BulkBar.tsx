import { useEffect, useRef, useState } from 'react';
import { Button, Field, Input, Modal, Select } from '@/components/ui';
import type { Profile } from '@/types';

export function TableCheckbox({
  checked,
  indeterminate,
  onChange,
  label,
}: {
  checked: boolean;
  indeterminate?: boolean;
  onChange: (checked: boolean) => void;
  label: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = !!indeterminate && !checked;
  }, [indeterminate, checked]);
  return (
    <input
      ref={ref}
      type="checkbox"
      aria-label={label}
      checked={checked}
      onChange={(e) => onChange(e.target.checked)}
      className="size-4 rounded border-ink-300 accent-brand-600"
    />
  );
}

export function BulkBar({
  selectedCount,
  matchingCount,
  pageCount,
  progress,
  busy,
  profiles,
  onAddTag,
  onLinkProfile,
  onExportCsv,
  onClear,
}: {
  selectedCount: number;
  matchingCount: number;
  pageCount: number;
  progress: { done: number; total: number } | null;
  busy: boolean;
  profiles: Profile[];
  onAddTag: (tag: string) => void;
  onLinkProfile: (profileId: string) => void;
  onExportCsv: () => void;
  onClear: () => void;
}) {
  const [tagOpen, setTagOpen] = useState(false);
  const [tag, setTag] = useState('');
  const [profileOpen, setProfileOpen] = useState(false);
  const [profileId, setProfileId] = useState('');

  if (selectedCount < 1) return null;

  const allMatching = selectedCount === matchingCount && matchingCount > pageCount;

  return (
    <>
      <div className="sticky bottom-4 z-20 mt-4">
        <div className="card px-4 py-3 flex flex-wrap items-center gap-3 shadow-lg shadow-black/15">
          <div className="text-sm font-medium text-ink-950 tnum">
            {selectedCount} selected
            {allMatching && <span className="ml-1.5 font-normal text-ink-500">· all {matchingCount} matching</span>}
          </div>
          {progress && (
            <span className="text-[13px] text-ink-500 tnum">
              {progress.done} of {progress.total}
            </span>
          )}
          <div className="flex items-center gap-2 ml-auto flex-wrap">
            <Button size="sm" disabled={busy} onClick={() => { setTag(''); setTagOpen(true); }}>
              Add tag
            </Button>
            <Button size="sm" disabled={busy} onClick={() => { setProfileId(profiles[0]?.id ?? ''); setProfileOpen(true); }}>
              Link profile
            </Button>
            <Button size="sm" disabled={busy} onClick={onExportCsv}>
              Export CSV
            </Button>
            <Button size="sm" variant="ghost" disabled={busy} onClick={onClear}>
              Clear selection
            </Button>
          </div>
        </div>
      </div>

      <Modal
        open={tagOpen}
        onClose={() => setTagOpen(false)}
        title="Add tag"
        description={`Applied to ${selectedCount} selected certificate${selectedCount === 1 ? '' : 's'}. Existing tags are kept.`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setTagOpen(false)}>Cancel</Button>
            <Button
              variant="primary"
              disabled={!tag.trim()}
              onClick={() => {
                onAddTag(tag.trim());
                setTagOpen(false);
              }}
            >
              Add tag
            </Button>
          </>
        }
      >
        <Field label="Tag">
          <Input value={tag} onChange={(e) => setTag(e.target.value)} placeholder="e.g. prod" autoFocus onKeyDown={(e) => {
            if (e.key === 'Enter' && tag.trim()) {
              onAddTag(tag.trim());
              setTagOpen(false);
            }
          }} />
        </Field>
      </Modal>

      <Modal
        open={profileOpen}
        onClose={() => setProfileOpen(false)}
        title="Link profile"
        description={`Linked alongside any profiles already on the ${selectedCount} selected certificate${selectedCount === 1 ? '' : 's'}.`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setProfileOpen(false)}>Cancel</Button>
            <Button
              variant="primary"
              disabled={!profileId}
              onClick={() => {
                onLinkProfile(profileId);
                setProfileOpen(false);
              }}
            >
              Link profile
            </Button>
          </>
        }
      >
        {profiles.length === 0 ? (
          <p className="text-sm text-ink-500">No output profiles yet. Create one from Output profiles.</p>
        ) : (
          <Field label="Profile">
            <Select value={profileId} onChange={(e) => setProfileId(e.target.value)}>
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </Select>
          </Field>
        )}
      </Modal>
    </>
  );
}
