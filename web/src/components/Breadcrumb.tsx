import { ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';

export type Crumb = { label: string; to?: string };

/** Last item is the current page. A single linked crumb renders as a back link. */
export function Breadcrumb({ items }: { items: Crumb[] }) {
  if (items.length === 1 && items[0].to) {
    return (
      <div className="mb-2">
        <Link to={items[0].to} className="text-[13px] text-ink-500 hover:text-ink-800 inline-flex items-center gap-1">
          <ChevronRight className="size-3.5 rotate-180" /> {items[0].label}
        </Link>
      </div>
    );
  }

  return (
    <nav aria-label="Breadcrumb" className="mb-2 flex items-center gap-1 text-[13px] text-ink-500 flex-wrap">
      {items.map((item, i) => {
        const last = i === items.length - 1;
        return (
          <span key={`${item.label}-${i}`} className="inline-flex items-center gap-1">
            {i > 0 && <ChevronRight className="size-3.5 text-ink-300" />}
            {last || !item.to ? (
              <span className={last ? 'text-ink-800' : undefined} aria-current={last ? 'page' : undefined}>
                {item.label}
              </span>
            ) : (
              <Link to={item.to} className="hover:text-ink-800">
                {item.label}
              </Link>
            )}
          </span>
        );
      })}
    </nav>
  );
}
