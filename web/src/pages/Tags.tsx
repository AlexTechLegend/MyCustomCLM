import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Layers, Plus, Tags as TagsIcon, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useToast } from '@/components/Toast';
import { Badge, Button, Card, CardHeader, EmptyState, ErrorBox, Field, Input, Loading, Modal, PageHeader, Textarea } from '@/components/ui';
import { api } from '@/lib/api';
import type { TagGroup } from '@/types';

export function Tags() {
  const qc = useQueryClient();
  const toast = useToast();
  const q = useQuery({ queryKey: ['tags'], queryFn: api.tags });
  const [edit, setEdit] = useState<Partial<TagGroup> | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<TagGroup | null>(null);

  const save = useMutation({
    mutationFn: (g: Partial<TagGroup>) => (g.id ? api.updateTagGroup(g.id, g) : api.createTagGroup(g)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tags'] });
      setEdit(null);
      toast.success('Tag group saved');
    },
    onError: (e) => toast.error('Could not save group', e),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.deleteTagGroup(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tags'] });
      setConfirmDelete(null);
      toast.success('Tag group deleted');
    },
  });

  if (q.isLoading) return <Loading />;
  if (q.error || !q.data) return <ErrorBox error={q.error} />;

  return (
    <>
      <PageHeader
        title="Tags & groups"
        description="Every certificate keeps its own unique tags. Groups are named collections of tags — filter the certificate list by a single tag or by a whole group."
        actions={
          <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setEdit({ name: '', description: '', tags: [] })}>
            New group
          </Button>
        }
      />

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <Card className="xl:col-span-1">
          <CardHeader title={<span className="inline-flex items-center gap-2"><TagsIcon className="size-4" /> Tags in use</span>} description="Click a tag to filter certificates." />
          {q.data.tags.length === 0 ? (
            <p className="text-[13px] text-ink-500">No tags yet. Add them when importing or editing a certificate.</p>
          ) : (
            <ul className="flex flex-wrap gap-2">
              {q.data.tags.map((t) => (
                <li key={t.tag}>
                  <Link to={`/certificates?tag=${encodeURIComponent(t.tag)}`} className="inline-flex items-center gap-1.5 rounded-lg border border-ink-200 bg-surface hover:border-brand-400 hover:bg-brand-50 px-2.5 py-1.5 text-[13px] text-ink-800 transition-colors">
                    {t.tag}
                    <span className="text-[11px] text-ink-400 tnum">{t.count}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <div className="xl:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-[15px] font-semibold text-ink-950 inline-flex items-center gap-2">
              <Layers className="size-4" /> Groups
            </h2>
          </div>
          {q.data.groups.length === 0 ? (
            <Card padded={false}>
              <EmptyState
                icon={<Layers className="size-5" />}
                title="No tag groups yet"
                description="A group is a named set of tags — for example “Prod web” = web + prod + iis. Filter the certificate list by the group in one click."
                action={
                  <Button variant="primary" onClick={() => setEdit({ name: '', description: '', tags: [] })}>
                    Create a group
                  </Button>
                }
              />
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {q.data.groups.map((g) => (
                <Card key={g.id} className="flex flex-col">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <Link to={`/certificates?groupId=${g.id}`} className="text-[15px] font-semibold text-ink-950 hover:text-brand-700">
                        {g.name}
                      </Link>
                      <p className="text-[13px] text-ink-500 mt-0.5 line-clamp-2">{g.description || 'No description'}</p>
                    </div>
                    <Badge tone="brand">
                      {g.certificateCount ?? 0} cert{(g.certificateCount ?? 0) === 1 ? '' : 's'}
                    </Badge>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-1.5 flex-1">
                    {g.tags.map((t) => (
                      <Badge key={t}>{t}</Badge>
                    ))}
                    {g.tags.length === 0 && <span className="text-[12px] text-ink-400">No tags in this group</span>}
                  </div>
                  <div className="mt-4 pt-3 border-t border-ink-100 flex items-center gap-2">
                    <Button size="sm" variant="ghost" onClick={() => setEdit(g)}>
                      Edit
                    </Button>
                    <Link to={`/certificates?groupId=${g.id}`} className="text-[13px] font-medium text-brand-700 hover:underline">
                      View certificates
                    </Link>
                    <Button size="sm" variant="ghost" className="ml-auto text-crit-600" icon={<Trash2 className="size-3.5" />} onClick={() => setConfirmDelete(g)}>
                      Delete
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>

      {edit && (
        <GroupEditor
          initial={edit}
          allTags={q.data.tags.map((t) => t.tag)}
          saving={save.isPending}
          onClose={() => setEdit(null)}
          onSave={(g) => save.mutate(g)}
        />
      )}
      <Modal
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        title={`Delete group “${confirmDelete?.name}”?`}
        description="Certificates keep their tags. Only the group definition is removed."
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmDelete(null)}>
              Cancel
            </Button>
            <Button variant="danger" loading={remove.isPending} onClick={() => confirmDelete && remove.mutate(confirmDelete.id)}>
              Delete
            </Button>
          </>
        }
      >
        <p className="text-sm text-ink-600">You can recreate the group later from the same tags.</p>
      </Modal>
    </>
  );
}

function GroupEditor({
  initial,
  allTags,
  saving,
  onClose,
  onSave,
}: {
  initial: Partial<TagGroup>;
  allTags: string[];
  saving: boolean;
  onClose: () => void;
  onSave: (g: Partial<TagGroup>) => void;
}) {
  const [name, setName] = useState(initial.name ?? '');
  const [description, setDescription] = useState(initial.description ?? '');
  const [tags, setTags] = useState<string[]>(initial.tags ?? []);
  const [draft, setDraft] = useState('');

  const add = (raw: string) => {
    const t = raw.trim();
    if (!t) return;
    if (!tags.some((x) => x.toLowerCase() === t.toLowerCase())) setTags([...tags, t]);
    setDraft('');
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={initial.id ? 'Edit tag group' : 'New tag group'}
      description="Pick existing tags or type new ones. A certificate matches the group when it has any of these tags."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" loading={saving} disabled={!name.trim()} onClick={() => onSave({ ...initial, name, description, tags })}>
            Save group
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Name" required>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Prod web farm" />
        </Field>
        <Field label="Description">
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} className="min-h-16" />
        </Field>
        <Field label="Tags" hint="Press Enter to add. Certificates keep unique tags; the group just collects them.">
          <div className="flex flex-wrap gap-1.5 mb-2">
            {tags.map((t) => (
              <span key={t} className="inline-flex items-center gap-1 rounded-md bg-ink-100 text-ink-800 px-2 py-0.5 text-[12px] font-medium">
                {t}
                <button type="button" className="text-ink-400 hover:text-crit-600" onClick={() => setTags(tags.filter((x) => x !== t))} aria-label={`Remove ${t}`}>
                  ×
                </button>
              </span>
            ))}
          </div>
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ',') {
                e.preventDefault();
                add(draft.replace(/,/g, ''));
              }
            }}
            placeholder="Type a tag and press Enter"
          />
          {allTags.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {allTags
                .filter((t) => !tags.some((x) => x.toLowerCase() === t.toLowerCase()))
                .map((t) => (
                  <button key={t} type="button" onClick={() => add(t)} className="rounded-md border border-ink-200 px-2 py-0.5 text-[12px] text-ink-600 hover:border-brand-400 hover:text-brand-700">
                    + {t}
                  </button>
                ))}
            </div>
          )}
        </Field>
      </div>
    </Modal>
  );
}
