import { useMutation, useQuery } from '@tanstack/react-query';
import { Copy, Link2, MessageCircle, RotateCw, Unlink } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import type { OrderResponse } from '@settleflow/shared';

import { Alert } from '../../components/ui/Alert';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { DialogClose, DialogContent, DialogRoot } from '../../components/ui/Dialog';
import { Input } from '../../components/ui/Input';
import { ApiClientError } from '../../lib/api';
import { queryClient } from '../../lib/query';
import { paymentKeys, paymentsApi } from './api';

export function PaymentLinkDialog({
  open,
  order,
  setOpen,
}: {
  open: boolean;
  order: OrderResponse;
  setOpen: (open: boolean) => void;
}) {
  const [shareUrl, setShareUrl] = useState('');
  const link = useQuery({
    queryKey: paymentKeys.link(order.id),
    queryFn: () => paymentsApi.getLink(order.id),
    enabled: open,
  });
  useEffect(() => {
    if (!open) setShareUrl('');
  }, [open]);
  const create = useMutation({
    mutationFn: () => paymentsApi.createLink(order.id),
    onSuccess: (created) => {
      setShareUrl(created.shareUrl ?? '');
      queryClient.setQueryData(paymentKeys.link(order.id), created);
      toast.success('Secure test payment link generated.');
    },
  });
  const revoke = useMutation({
    mutationFn: () => paymentsApi.revokeLink(order.id),
    onSuccess: (updated) => {
      setShareUrl('');
      queryClient.setQueryData(paymentKeys.link(order.id), updated);
      toast.success('Payment link revoked.');
    },
  });
  const copy = async () => {
    await navigator.clipboard.writeText(shareUrl);
    toast.success('Payment link copied.');
  };
  const whatsapp = order.customerMobile
    ? `https://wa.me/${order.customerMobile.replace(/\D/g, '')}?text=${encodeURIComponent(`Pay ${order.orderNumber} securely in SettleFlow test mode: ${shareUrl}`)}`
    : '';
  const error = create.error ?? revoke.error ?? link.error;
  const message =
    error instanceof ApiClientError
      ? error.message
      : error
        ? 'Payment link action could not be completed.'
        : '';
  const active = link.data?.status === 'active';

  return (
    <DialogRoot open={open} onOpenChange={setOpen}>
      <DialogContent
        title="Customer payment link"
        description={`${order.orderNumber} · ${order.customer}`}
      >
        <div className="grid gap-5 p-5 sm:p-6">
          <Alert variant="warning">
            Test payments only. Anyone with this bearer link can view the minimal balance summary.
          </Alert>
          {message ? <Alert variant="danger">{message}</Alert> : null}
          <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div>
              <p className="text-sm font-semibold text-slate-900">Link status</p>
              <p className="mt-1 text-xs text-slate-500">
                {active
                  ? 'Valid until the order is paid or revoked.'
                  : 'Generate a link to collect payment.'}
              </p>
            </div>
            <Badge variant={active ? 'success' : 'neutral'}>
              {link.data?.status ?? 'Not created'}
            </Badge>
          </div>
          {shareUrl ? (
            <div className="space-y-3">
              <Input value={shareUrl} readOnly aria-label="Generated payment link" />
              <div className="grid gap-2 sm:grid-cols-2">
                <Button variant="outline" onClick={() => void copy()}>
                  <Copy aria-hidden="true" /> Copy link
                </Button>
                {whatsapp ? (
                  <Button asChild>
                    <a href={whatsapp} target="_blank" rel="noreferrer">
                      <MessageCircle aria-hidden="true" /> Share on WhatsApp
                    </a>
                  </Button>
                ) : null}
              </div>
            </div>
          ) : active ? (
            <Alert>
              For security, an existing link is not displayed again. Regenerate it to receive a new
              URL; the previous link will stop working.
            </Alert>
          ) : null}
          <div className="flex flex-col-reverse gap-2 border-t border-slate-100 pt-4 sm:flex-row sm:justify-end">
            <DialogClose asChild>
              <Button variant="outline">Close</Button>
            </DialogClose>
            {active ? (
              <Button
                variant="destructive"
                onClick={() => revoke.mutate()}
                disabled={revoke.isPending}
              >
                <Unlink aria-hidden="true" /> {revoke.isPending ? 'Revoking…' : 'Revoke link'}
              </Button>
            ) : null}
            <Button
              onClick={() => create.mutate()}
              disabled={create.isPending || order.amountDueMinor === 0}
            >
              {active ? <RotateCw aria-hidden="true" /> : <Link2 aria-hidden="true" />}
              {create.isPending
                ? 'Generating…'
                : active
                  ? 'Regenerate link'
                  : 'Create payment link'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </DialogRoot>
  );
}
