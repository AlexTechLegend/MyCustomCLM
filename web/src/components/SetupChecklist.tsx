import { CheckCircle2, Circle } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button, Card, CardHeader } from '@/components/ui';

export type SetupStep = { id: string; title: string; detail: string; to: string; done: boolean };

export function SetupChecklist({
  steps,
  complete,
  onDismiss,
}: {
  steps: SetupStep[];
  complete: boolean;
  onDismiss?: () => void;
}) {
  const done = steps.filter((s) => s.done).length;
  return (
    <Card className="mb-6 border-brand-200 bg-brand-50/30">
      <CardHeader
        title="First-run setup"
        description={`${done} of ${steps.length} complete. These are derived from data you already have — nothing extra to configure.`}
        action={
          complete && onDismiss ? (
            <Button size="sm" variant="ghost" onClick={onDismiss}>
              Dismiss
            </Button>
          ) : undefined
        }
      />
      <ol className="space-y-2">
        {steps.map((s, i) => (
          <li key={s.id}>
            <Link to={s.to} className="flex items-start gap-3 rounded-xl px-2 py-2 hover:bg-canvas">
              {s.done ? <CheckCircle2 className="size-4 text-ok-600 mt-0.5" /> : <Circle className="size-4 text-ink-300 mt-0.5" />}
              <span>
                <span className="block text-sm font-medium text-ink-950">
                  {i + 1}. {s.title}
                </span>
                <span className="block text-[12px] text-ink-500">{s.detail}</span>
              </span>
            </Link>
          </li>
        ))}
      </ol>
    </Card>
  );
}
