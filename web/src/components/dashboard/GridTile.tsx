import clsx from 'clsx';
import { GripVertical, X } from 'lucide-react';
import type { KeyboardEvent, PointerEvent as ReactPointerEvent, ReactNode } from 'react';
import type { GridPos } from '@/lib/dashboardStore';
import type { PxRect } from '@/lib/gridGeometry';
import type { Handle } from './useGridInteraction';

const HANDLES: { id: Handle; className: string; corner: boolean }[] = [
  { id: 'n', className: 'top-[-5px] left-3 right-3 h-[10px] cursor-ns-resize', corner: false },
  { id: 's', className: 'bottom-[-5px] left-3 right-3 h-[10px] cursor-ns-resize', corner: false },
  { id: 'e', className: 'right-[-5px] top-3 bottom-3 w-[10px] cursor-ew-resize', corner: false },
  { id: 'w', className: 'left-[-5px] top-3 bottom-3 w-[10px] cursor-ew-resize', corner: false },
  { id: 'ne', className: 'top-[-6px] right-[-6px] size-3 cursor-nesw-resize', corner: true },
  { id: 'nw', className: 'top-[-6px] left-[-6px] size-3 cursor-nwse-resize', corner: true },
  { id: 'se', className: 'bottom-[-6px] right-[-6px] size-3 cursor-nwse-resize', corner: true },
  { id: 'sw', className: 'bottom-[-6px] left-[-6px] size-3 cursor-nesw-resize', corner: true },
];

const HANDLE_LABEL: Record<Handle, string> = {
  n: 'top edge',
  s: 'bottom edge',
  e: 'right edge',
  w: 'left edge',
  ne: 'top-right corner',
  nw: 'top-left corner',
  se: 'bottom-right corner',
  sw: 'bottom-left corner',
};

export function GridTile({
  item,
  title,
  rect,
  editing,
  dragging,
  offset,
  children,
  onStartMove,
  onStartResize,
  onRemove,
  onKeyDown,
}: {
  item: GridPos;
  title: string;
  rect: PxRect;
  editing: boolean;
  /** True while this tile is the one being moved or resized. */
  dragging: boolean;
  /** Pixel offset applied while moving so the tile follows the pointer. */
  offset?: { x: number; y: number };
  children: ReactNode;
  onStartMove: (e: ReactPointerEvent) => void;
  onStartResize: (handle: Handle, e: ReactPointerEvent) => void;
  onRemove: () => void;
  onKeyDown: (e: KeyboardEvent<HTMLDivElement>) => void;
}) {
  return (
    <div
      role={editing ? 'group' : undefined}
      tabIndex={editing ? 0 : undefined}
      aria-label={editing ? `${title}, column ${item.x + 1}, row ${item.y + 1}, ${item.w} by ${item.h}. Arrow keys move, shift and arrow keys resize, delete removes.` : undefined}
      onKeyDown={editing ? onKeyDown : undefined}
      className={clsx(
        'absolute group outline-none rounded-2xl',
        editing && 'focus-visible:ring-2 focus-visible:ring-brand-500/60 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas',
        dragging ? 'z-40 shadow-2xl shadow-black/25' : 'z-10',
        !dragging && 'motion-safe:transition-[left,top,width,height] motion-safe:duration-150',
      )}
      style={{
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height,
        transform: offset ? `translate(${offset.x}px, ${offset.y}px)` : undefined,
      }}
    >
      {editing && (
        <div className="absolute inset-x-0 top-0 z-20 h-7 flex items-center gap-1 rounded-t-2xl border border-b-0 border-line bg-surface-raised/95 backdrop-blur-sm px-1.5 text-[12px] text-text-mid">
          <div
            className="flex-1 min-w-0 h-full flex items-center gap-1.5 px-1 cursor-grab active:cursor-grabbing touch-none select-none"
            onPointerDown={onStartMove}
            title="Drag to move"
          >
            <GripVertical className="size-3.5 shrink-0 text-text-soft" />
            <span className="truncate font-medium text-text">{title}</span>
          </div>
          <button
            type="button"
            aria-label={`Remove ${title}`}
            className="rounded-md p-1 text-text-soft hover:text-crit-fg hover:bg-crit-50"
            onClick={onRemove}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <X className="size-3.5" />
          </button>
        </div>
      )}

      <div className={clsx('tile-fill rounded-2xl', editing && 'pointer-events-none select-none')}>{children}</div>

      {editing &&
        HANDLES.map((h) => (
          <div
            key={h.id}
            role="presentation"
            aria-label={`Resize from ${HANDLE_LABEL[h.id]}`}
            className={clsx(
              'absolute z-30 touch-none',
              h.className,
              h.corner && 'rounded-sm border border-accent bg-surface-raised opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 motion-safe:transition-opacity',
            )}
            onPointerDown={(e) => onStartResize(h.id, e)}
          />
        ))}
    </div>
  );
}
