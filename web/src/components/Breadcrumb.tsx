import clsx from 'clsx';
import { ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';

export interface BreadcrumbItem {
  label: string;
  to?: string;
}

/**
 * Trail for nested pages. The final item is the current page (no link).
 * A single parent → current pair renders as the rotated-chevron back link
 * used elsewhere in Vigil, so converted pages keep their existing look.
 */
export function Breadcrumb({ items }: { items: BreadcrumbItem[] }) {
  if (!items.length) return null;

  const parents = items.slice(0, -1);
  const current = items[items.length - 1];

  if (parents.length === 1 && parents[0].to) {
    return (
      <div className="mb-2">
        <Link to={parents[0].to} className="text-[13px] text-ink-500 hover:text-ink-800 inline-flex items-center gap-1">
          <ChevronRight className="size-3.5 rotate-180" /> {parents[0].label}
        </Link>
      </div>
    );
  }

  return (
    <nav className="mb-2" aria-label="Breadcrumb">
      <ol className="flex flex-wrap items-center gap-1 text-[13px] min-w-0">
        {items.map((item, i) => {
          const last = i === items.length - 1;
          return (
            <li key={`${item.label}-${i}`} className="inline-flex items-center gap-1 min-w-0">
              {i > 0 && <ChevronRight className="size-3.5 text-ink-300 shrink-0" aria-hidden />}
              {last || !item.to ? (
                <span className={clsx('truncate', last ? 'text-ink-700 font-medium' : 'text-ink-500')} aria-current={last ? 'page' : undefined}>
                  {item.label || current.label}
                </span>
              ) : (
                <Link to={item.to} className="text-ink-500 hover:text-ink-800 truncate">
                  {item.label}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
