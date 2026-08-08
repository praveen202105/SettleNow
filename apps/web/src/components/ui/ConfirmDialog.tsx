import * as AlertDialog from '@radix-ui/react-alert-dialog';

import { Button } from './Button';

export function ConfirmDialog({
  confirmLabel = 'Confirm',
  description,
  onConfirm,
  open,
  setOpen,
  title,
}: {
  confirmLabel?: string;
  description: string;
  onConfirm: () => void;
  open: boolean;
  setOpen: (open: boolean) => void;
  title: string;
}) {
  return (
    <AlertDialog.Root open={open} onOpenChange={setOpen}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="fixed inset-0 z-50 bg-slate-950/40 backdrop-blur-sm" />
        <AlertDialog.Content className="fixed left-1/2 top-1/2 z-[60] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl outline-none">
          <div className="flex size-10 items-center justify-center rounded-xl bg-red-50 text-red-600">
            <span className="text-lg font-bold" aria-hidden="true">
              !
            </span>
          </div>
          <AlertDialog.Title className="mt-4 text-lg font-semibold tracking-tight text-slate-950">
            {title}
          </AlertDialog.Title>
          <AlertDialog.Description className="mt-2 text-sm leading-6 text-slate-500">
            {description}
          </AlertDialog.Description>
          <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <AlertDialog.Cancel asChild>
              <Button variant="outline">Cancel</Button>
            </AlertDialog.Cancel>
            <AlertDialog.Action asChild>
              <Button variant="destructive" onClick={onConfirm}>
                {confirmLabel}
              </Button>
            </AlertDialog.Action>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
