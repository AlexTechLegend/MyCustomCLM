import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarClock, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useToast } from '@/components/Toast';
import { Button, Card, EmptyState, ErrorBox, Field, Input, Loading, Modal, PageHeader, Select, Textarea } from '@/components/ui';
import { windowsApi } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import { nextWindowOccurrences, weekdayLabel } from '@/lib/windowPreview';
import type { MaintenanceWindow } from '@/types/automation';

const TZ = ['UTC', 'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles', 'Europe/London', 'Europe/Berlin', 'Asia/Tokyo'];

export function Windows() {
  const qc = useQueryClient();
  const toast = useToast();
  const q = useQuery({ queryKey: ['windows'], queryFn: windowsApi.list });
  const [edit, setEdit] = useState<Partial<MaintenanceWindow> | null>(null);
  const [blackoutText, setBlackoutText] = useState('');

  const save = useMutation({
    mutationFn: () => (edit?.id ? windowsApi.update(edit.id, edit) : windowsApi.create(edit ?? {})),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['windows'] });
      toast.success('Window saved');
      setEdit(null);
    },
    onError: (e) => toast.error('Could not save window', e),
  });
  const remove = useMutation({
    mutationFn: (id: string) => windowsApi.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['windows'] });
      toast.success('Window deleted');
      setEdit(null);
    },
    onError: (e) => toast.error('Could not delete window', e),
  });

  const parseBlackouts = (text: string) =>
    text.split('\n').map((line) => line.trim()).filter(Boolean).map((line) => {
      const [start, end, ...reason] = line.split('|').map((s) => s.trim());
      return { start: start ?? '', end: end ?? start ?? '', reason: reason.join('|') || undefined };
    });

  return (
    <>
      <PageHeader
        title="Maintenance windows"
        description="Weekly slots used for window-relative renewals. Overlay them on the expiry calendar."
        actions={
          <div className="flex gap-2">
            <Link to="/calendar"><Button>Calendar</Button></Link>
            <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => { setEdit({ name: '', weekday: 3, startTime: '02:00', endTime: '04:00', timezone: 'UTC', recurrence: 'weekly', blackoutRanges: [] }); setBlackoutText(''); }}>
              New window
            </Button>
          </div>
        }
      />
      {q.isLoading ? (
        <Loading />
      ) : q.error ? (
        <ErrorBox error={q.error} />
      ) : !q.data?.length ? (
        <Card padded={false}>
          <EmptyState icon={<CalendarClock className="size-5" />} title="No windows" description="Add a Wednesday night slot and attach it to a blueprint." />
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {q.data.map((w) => (
            <button key={w.id} type="button" onClick={() => { setEdit(w); setBlackoutText(w.blackoutRanges.map((b) => [b.start, b.end, b.reason].filter(Boolean).join(' | ')).join('\n')); }} className="card p-5 text-left hover:border-line-strong">
              <div className="text-sm font-semibold text-text">{w.name}</div>
              <p className="text-[13px] text-text-soft mt-1">
                {weekdayLabel(w.weekday)} {w.startTime}–{w.endTime} · {w.timezone}
              </p>
              <ul className="mt-3 text-[12px] text-text-mid space-y-0.5">
                {nextWindowOccurrences(w, 4).map((d) => (
                  <li key={d.toISOString()} className="tnum">{formatDateTime(d.toISOString())}</li>
                ))}
              </ul>
            </button>
          ))}
        </div>
      )}
      <Modal
        open={!!edit}
        onClose={() => setEdit(null)}
        title={edit?.id ? 'Edit window' : 'New window'}
        footer={
          <>
            {edit?.id && <Button variant="danger" className="mr-auto" icon={<Trash2 className="size-3.5" />} onClick={() => edit.id && remove.mutate(edit.id)}>Delete</Button>}
            <Button variant="ghost" onClick={() => setEdit(null)}>Cancel</Button>
            <Button variant="primary" onClick={() => save.mutate()} loading={save.isPending}>Save</Button>
          </>
        }
      >
        {edit && (
          <div className="space-y-3">
            <Field label="Name"><Input value={edit.name ?? ''} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Weekday">
                <Select value={String(edit.weekday ?? 3)} onChange={(e) => setEdit({ ...edit, weekday: Number(e.target.value) })}>
                  {[0, 1, 2, 3, 4, 5, 6].map((n) => <option key={n} value={n}>{weekdayLabel(n)}</option>)}
                </Select>
              </Field>
              <Field label="Timezone">
                <Select value={edit.timezone ?? 'UTC'} onChange={(e) => setEdit({ ...edit, timezone: e.target.value })}>
                  {TZ.map((z) => <option key={z}>{z}</option>)}
                </Select>
              </Field>
              <Field label="Start"><Input type="time" value={edit.startTime ?? '02:00'} onChange={(e) => setEdit({ ...edit, startTime: e.target.value })} /></Field>
              <Field label="End"><Input type="time" value={edit.endTime ?? '04:00'} onChange={(e) => setEdit({ ...edit, endTime: e.target.value })} /></Field>
            </div>
            <Field label="Blackouts" hint="One per line: startISO | endISO | reason">
              <Textarea
                value={blackoutText}
                onChange={(e) => {
                  setBlackoutText(e.target.value);
                  setEdit({ ...edit, blackoutRanges: parseBlackouts(e.target.value) });
                }}
              />
            </Field>
            {edit.weekday !== undefined && edit.startTime && (
              <div>
                <div className="text-[13px] font-medium text-text mb-1">Next occurrences</div>
                <ul className="text-[13px] text-text-mid tnum">
                  {nextWindowOccurrences({
                    id: edit.id ?? 'tmp',
                    name: edit.name ?? '',
                    weekday: edit.weekday,
                    startTime: edit.startTime,
                    endTime: edit.endTime ?? '04:00',
                    timezone: edit.timezone ?? 'UTC',
                    recurrence: 'weekly',
                    blackoutRanges: edit.blackoutRanges ?? [],
                    createdAt: '',
                    updatedAt: '',
                  }, 5).map((d) => <li key={d.toISOString()}>{formatDateTime(d.toISOString())}</li>)}
                </ul>
              </div>
            )}
          </div>
        )}
      </Modal>
    </>
  );
}
