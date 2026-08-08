import type { ReactNode } from 'react';

import { cn } from '../../lib/cn';

export function PageHeader({
  actions,
  back,
  className,
  description,
  eyebrow,
  title,
}: {
  actions?: ReactNode;
  back?: ReactNode;
  className?: string;
  description?: string;
  eyebrow?: ReactNode;
  title: ReactNode;
}) {
  return (
    <header className="sticky top-0 z-20 border-b border-slate-200/90 bg-white/90 px-4 py-4 backdrop-blur-xl sm:px-6">
      <div
        className={cn(
          'mx-auto flex max-w-[1440px] flex-col gap-4 sm:flex-row sm:items-center sm:justify-between',
          className,
        )}
      >
        <div className="flex min-w-0 items-center gap-3">
          {back}
          <div className="min-w-0">
            {eyebrow ? <div className="mb-1">{eyebrow}</div> : null}
            <h1 className="truncate text-xl font-semibold tracking-tight text-slate-950">
              {title}
            </h1>
            {description ? <p className="mt-0.5 text-sm text-slate-500">{description}</p> : null}
          </div>
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
    </header>
  );
}
