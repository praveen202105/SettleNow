import type { HTMLAttributes, LabelHTMLAttributes } from 'react';

import { cn } from '../../lib/cn';

export function Field({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('grid gap-1.5', className)} {...props} />;
}

export function FieldLabel({
  children,
  className,
  htmlFor,
  ...props
}: LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label
      className={cn('text-sm font-semibold text-slate-700', className)}
      htmlFor={htmlFor}
      {...props}
    >
      {children}
    </label>
  );
}

export function FieldDescription({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn('text-xs leading-5 text-slate-500', className)} {...props} />;
}

export function FieldError({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  if (!props.children) return null;
  return <p className={cn('text-xs font-medium leading-5 text-red-600', className)} {...props} />;
}
