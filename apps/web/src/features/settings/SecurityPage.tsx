import { useMutation } from '@tanstack/react-query';
import { KeyRound, Link2, ShieldCheck } from 'lucide-react';
import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';

import { Alert } from '../../components/ui/Alert';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../../components/ui/Card';
import { PageHeader } from '../../components/ui/PageHeader';
import { Spinner } from '../../components/ui/Spinner';
import { authApi } from '../auth/api';
import { GoogleIcon } from '../auth/GoogleIcon';
import { authQueryKey, useAuthConfig, useCurrentUser } from '../auth/hooks';
import { queryClient } from '../../lib/query';

const linkErrorMessages: Record<string, string> = {
  GOOGLE_ACCESS_DENIED: 'Google account connection was cancelled.',
  GOOGLE_ALREADY_LINKED: 'Disconnect the current Google account before connecting a different one.',
  GOOGLE_AUTH_EXPIRED: 'The connection request expired or was already used. Please try again.',
  GOOGLE_AUTH_FAILED: 'Google could not be connected. Please try again.',
  GOOGLE_EMAIL_MISMATCH:
    'Choose the Google account with the same email address as this SettleFlow account.',
  GOOGLE_EMAIL_NOT_VERIFIED: 'Use a Google account with a verified email address.',
  GOOGLE_IDENTITY_IN_USE: 'That Google account is already connected to another SettleFlow user.',
  GOOGLE_LINK_SESSION_EXPIRED: 'Your session expired while connecting Google. Sign in and retry.',
};

export function SecurityPage() {
  const user = useCurrentUser();
  const config = useAuthConfig();
  const [searchParams, setSearchParams] = useSearchParams();
  const googleConnected = user.data?.authMethods.includes('google') ?? false;
  const passwordConnected = user.data?.authMethods.includes('password') ?? false;
  const callbackError = searchParams.get('authError');

  useEffect(() => {
    if (searchParams.get('google') !== 'linked') return;
    toast.success('Google account connected');
    const next = new URLSearchParams(searchParams);
    next.delete('google');
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  const connect = useMutation({
    mutationFn: () =>
      authApi.startGoogle({ intent: 'link', returnTo: '/settings/security?google=linked' }),
    onSuccess: ({ authorizationUrl }) => window.location.assign(authorizationUrl),
  });
  const disconnect = useMutation({
    mutationFn: authApi.unlinkGoogle,
    onSuccess: (updatedUser) => {
      queryClient.setQueryData(authQueryKey, updatedUser);
      toast.success('Google account disconnected');
    },
  });

  return (
    <>
      <PageHeader
        title="Security"
        description="Manage the methods you use to sign in to SettleFlow."
      />
      <div className="mx-auto w-full max-w-4xl space-y-6 p-4 sm:p-6 lg:p-8">
        {callbackError ? (
          <Alert variant="danger">
            {linkErrorMessages[callbackError] ?? 'Google could not be connected. Please try again.'}
          </Alert>
        ) : null}
        {connect.error || disconnect.error ? (
          <Alert variant="danger">
            {connect.error instanceof Error
              ? connect.error.message
              : disconnect.error instanceof Error
                ? disconnect.error.message
                : 'The authentication method could not be updated.'}
          </Alert>
        ) : null}

        <Card>
          <CardHeader className="border-b border-slate-100">
            <div className="flex items-start gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
                <ShieldCheck className="size-5" aria-hidden="true" />
              </span>
              <div>
                <CardTitle>Sign-in methods</CardTitle>
                <CardDescription>
                  Keep at least one method connected so you do not lose access to your workspace.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="divide-y divide-slate-100 pt-0">
            <div className="flex flex-col gap-4 py-5 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 items-start gap-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-700">
                  <KeyRound className="size-5" aria-hidden="true" />
                </span>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold text-slate-900">Email and password</p>
                    <Badge variant={passwordConnected ? 'success' : 'neutral'}>
                      {passwordConnected ? 'Connected' : 'Not configured'}
                    </Badge>
                  </div>
                  <p className="mt-1 truncate text-sm text-slate-500">{user.data?.email}</p>
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-4 py-5 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 items-start gap-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white">
                  <GoogleIcon className="size-5" />
                </span>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold text-slate-900">Google</p>
                    <Badge variant={googleConnected ? 'success' : 'neutral'}>
                      {googleConnected ? 'Connected' : 'Not connected'}
                    </Badge>
                  </div>
                  <p className="mt-1 text-sm text-slate-500">
                    Use your verified Google account for secure, passwordless sign-in.
                  </p>
                  {googleConnected && !passwordConnected ? (
                    <p className="mt-2 text-xs font-medium text-amber-700">
                      Google is your only sign-in method and cannot be disconnected.
                    </p>
                  ) : null}
                </div>
              </div>

              {config.data?.providers.google ? (
                googleConnected ? (
                  <Button
                    variant="outline"
                    onClick={() => disconnect.mutate()}
                    disabled={!passwordConnected || disconnect.isPending}
                  >
                    {disconnect.isPending ? (
                      <Spinner label="Disconnecting…" />
                    ) : (
                      <>
                        <Link2 aria-hidden="true" /> Disconnect
                      </>
                    )}
                  </Button>
                ) : (
                  <Button onClick={() => connect.mutate()} disabled={connect.isPending}>
                    {connect.isPending ? (
                      <Spinner label="Opening Google…" />
                    ) : (
                      <>
                        <GoogleIcon /> Connect Google
                      </>
                    )}
                  </Button>
                )
              ) : (
                <Badge variant="warning">Unavailable</Badge>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
