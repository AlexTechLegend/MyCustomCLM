import { useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { Copy, ExternalLink, MoreHorizontal, RefreshCw, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { copyText } from '@/components/CopyButton';
import { useToast } from '@/components/Toast';
import { Button, Modal } from '@/components/ui';
import { api } from '@/lib/api';
import type { Certificate } from '@/types';

const ITEM_CLASS =
  'w-full text-left px-3 py-2 text-[13px] flex items-center gap-2 text-ink-800 hover:bg-ink-50 focus:bg-ink-50 focus:outline-none';

export function CertRowMenu({ cert }: { cert: Certificate }) {
  const nav = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [pos, setPos] = useState({ top: 0, right: 0 });
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  const close = useCallback(() => setOpen(false), []);

  useLayoutEffect(() => {
    if (!open || !btnRef.current) return;
    const place = () => {
      const r = btnRef.current!.getBoundingClientRect();
      setPos({ top: r.bottom + 4, right: window.innerWidth - r.right });
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: MouseEvent) => {
      const t = e.target as Node;
      if (btnRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        close();
        btnRef.current?.focus();
        return;
      }
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
      e.preventDefault();
      const items = menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]');
      if (!items?.length) return;
      const list = [...items];
      const i = list.indexOf(document.activeElement as HTMLButtonElement);
      const next = e.key === 'ArrowDown' ? (i + 1) % list.length : (i - 1 + list.length) % list.length;
      list[next]?.focus();
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, close]);

  useEffect(() => {
    if (!open) return;
    const first = menuRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]');
    first?.focus();
  }, [open]);

  const copy = async (label: string, value: string) => {
    const ok = await copyText(value);
    if (ok) toast.success(`Copied ${label}`);
    else toast.error(`Could not copy ${label}`);
    close();
  };

  const onDelete = async () => {
    setDeleting(true);
    try {
      await api.deleteCertificate(cert.id);
      await Promise.all([qc.invalidateQueries({ queryKey: ['certificates'] }), qc.invalidateQueries({ queryKey: ['dashboard'] })]);
      toast.success('Certificate deleted', cert.name);
      setConfirmDelete(false);
    } catch (e) {
      toast.error('Could not delete certificate', e);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        aria-label="Certificate actions"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex size-8 items-center justify-center rounded-lg text-ink-500 hover:bg-ink-100 hover:text-ink-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
      >
        <MoreHorizontal className="size-4" />
      </button>
      {open &&
        createPortal(
          <div
            ref={menuRef}
            id={menuId}
            role="menu"
            aria-label="Certificate actions"
            style={{ top: pos.top, right: pos.right }}
            className="fixed z-[70] min-w-[200px] py-1 card p-0 shadow-lg shadow-ink-950/10"
          >
            <button type="button" role="menuitem" className={ITEM_CLASS} onClick={() => nav(`/certificates/${cert.id}/renew`)}>
              <RefreshCw className="size-3.5 text-ink-400" /> Renew
            </button>
            <button type="button" role="menuitem" className={ITEM_CLASS} onClick={() => nav(`/certificates/${cert.id}`)}>
              <ExternalLink className="size-3.5 text-ink-400" /> Open certificate
            </button>
            <button type="button" role="menuitem" className={ITEM_CLASS} onClick={() => copy('common name', cert.commonName)}>
              <Copy className="size-3.5 text-ink-400" /> Copy common name
            </button>
            <button type="button" role="menuitem" className={ITEM_CLASS} onClick={() => copy('serial', cert.serial)}>
              <Copy className="size-3.5 text-ink-400" /> Copy serial
            </button>
            <button
              type="button"
              role="menuitem"
              className={clsx(ITEM_CLASS, 'text-crit-600 hover:bg-crit-50 focus:bg-crit-50')}
              onClick={() => {
                close();
                setConfirmDelete(true);
              }}
            >
              <Trash2 className="size-3.5" /> Delete
            </button>
          </div>,
          document.body,
        )}
      <Modal
        open={confirmDelete}
        onClose={() => !deleting && setConfirmDelete(false)}
        title="Delete certificate?"
        description={`${cert.name} will be removed from Vigil. This cannot be undone.`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmDelete(false)} disabled={deleting}>
              Cancel
            </Button>
            <Button variant="danger" onClick={onDelete} loading={deleting}>
              Delete
            </Button>
          </>
        }
      >
        <p className="text-sm text-ink-600">
          Serial <span className="font-mono text-[12.5px] text-ink-900">{cert.serial}</span>
        </p>
      </Modal>
    </>
  );
}
