import { forwardRef, type HTMLAttributes, type InputHTMLAttributes } from 'react';

import { cn } from '../../lib/cn';

export function InputGroup({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'group flex h-11 w-full items-center rounded-lg border border-slate-200 bg-white shadow-sm transition hover:border-slate-300 focus-within:border-blue-500 focus-within:ring-3 focus-within:ring-blue-500/15 has-[[aria-invalid=true]]:border-red-400 has-[[aria-invalid=true]]:bg-red-50/40 has-[[aria-invalid=true]]:ring-red-500/10',
        className,
      )}
      {...props}
    />
  );
}

export function InputGroupAddon({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'flex h-full shrink-0 items-center justify-center px-3 text-slate-400 [&_svg]:size-[18px]',
        className,
      )}
      {...props}
    />
  );
}

export const InputGroupInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function InputGroupInput({ className, ...props }, ref) {
    return (
      <input
        ref={ref}
        className={cn(
          'h-full min-w-0 flex-1 border-0 bg-transparent px-0 pr-3 text-sm text-slate-900 outline-none placeholder:text-slate-400 disabled:cursor-not-allowed disabled:text-slate-500',
          className,
        )}
        {...props}
      />
    );
  },
);

export function InputGroupButton({ className, ...props }: HTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className={cn(
        'mr-1.5 inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/30 [&_svg]:size-4',
        className,
      )}
      {...props}
    />
  );
}
