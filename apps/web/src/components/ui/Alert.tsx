import { AlertCircle, CheckCircle2, Info } from 'lucide-react';
import type { HTMLAttributes, ReactNode } from 'react';

import { cn } from '../../lib/cn';

type AlertVariant = 'default' | 'danger' | 'success' | 'warning';

const alertStyles: Record<AlertVariant, string> = {
  default: 'border-blue-200 bg-blue-50 text-blue-800',
  danger: 'border-red-200 bg-red-50 text-red-800',
  success: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  warning: 'border-amber-200 bg-amber-50 text-amber-800',
};

export function Alert({
  children,
  className,
  title,
  variant = 'default',
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  title?: string;
  variant?: AlertVariant;
  children: ReactNode;
}) {
  const Icon = variant === 'danger' ? AlertCircle : variant === 'success' ? CheckCircle2 : Info;
  return (
    <div
      role={variant === 'danger' ? 'alert' : 'status'}
      className={cn('flex gap-3 rounded-xl border p-3.5 text-sm', alertStyles[variant], className)}
      {...props}
    >
      <Icon className="mt-0.5 size-4" aria-hidden="true" />
      <div className="min-w-0">
        {title ? <p className="font-semibold">{title}</p> : null}
        <div className={cn('leading-5', title && 'mt-0.5 opacity-90')}>{children}</div>
      </div>
    </div>
  );
}
