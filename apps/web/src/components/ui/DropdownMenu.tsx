import * as DropdownMenuPrimitive from '@radix-ui/react-dropdown-menu';
import type { ReactNode } from 'react';

import { cn } from '../../lib/cn';

export const DropdownMenu = DropdownMenuPrimitive.Root;
export const DropdownMenuTrigger = DropdownMenuPrimitive.Trigger;

export function DropdownMenuContent({
  align = 'end',
  children,
}: {
  align?: 'start' | 'center' | 'end';
  children: ReactNode;
}) {
  return (
    <DropdownMenuPrimitive.Portal>
      <DropdownMenuPrimitive.Content
        align={align}
        sideOffset={6}
        className="z-[100] min-w-44 rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl"
      >
        {children}
      </DropdownMenuPrimitive.Content>
    </DropdownMenuPrimitive.Portal>
  );
}

export function DropdownMenuItem({
  children,
  className,
  destructive = false,
  disabled,
  onSelect,
}: {
  children: ReactNode;
  className?: string;
  destructive?: boolean;
  disabled?: boolean;
  onSelect?: () => void;
}) {
  return (
    <DropdownMenuPrimitive.Item
      {...(disabled === undefined ? {} : { disabled })}
      {...(onSelect ? { onSelect } : {})}
      className={cn(
        'flex min-h-10 select-none items-center gap-2 rounded-lg px-2.5 text-sm font-medium text-slate-700 outline-none data-[disabled]:pointer-events-none data-[disabled]:opacity-40 data-[highlighted]:bg-slate-100',
        destructive && 'text-red-600 data-[highlighted]:bg-red-50',
        className,
      )}
    >
      {children}
    </DropdownMenuPrimitive.Item>
  );
}

export function DropdownMenuSeparator() {
  return <DropdownMenuPrimitive.Separator className="my-1 h-px bg-slate-100" />;
}
