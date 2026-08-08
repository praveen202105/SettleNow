import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import {
  ArrowRight,
  CheckCircle2,
  CreditCard,
  LockKeyhole,
  Mail,
  ShieldCheck,
  UserRound,
  WalletCards,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { useForm } from 'react-hook-form';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';

import {
  loginSchema,
  signupSchema,
  type LoginInput,
  type SignupInput,
  type UserResponse,
} from '@settleflow/shared';

import { Alert } from '../../components/ui/Alert';
import { Button } from '../../components/ui/Button';
import { Field, FieldDescription, FieldError, FieldLabel } from '../../components/ui/Field';
import { InputGroup, InputGroupAddon, InputGroupInput } from '../../components/ui/InputGroup';
import { PasswordInput } from '../../components/ui/PasswordInput';
import { Spinner } from '../../components/ui/Spinner';
import { cn } from '../../lib/cn';
import { ApiClientError } from '../../lib/api';
import { queryClient } from '../../lib/query';
import { authApi } from './api';
import { GoogleIcon } from './GoogleIcon';
import { authQueryKey, useAuthConfig, useCurrentUser } from './hooks';

type AuthMode = 'login' | 'signup';

export function AuthPage({ mode }: { mode: AuthMode }) {
  const currentUser = useCurrentUser();
  if (currentUser.data) return <Navigate to="/orders" replace />;
  return mode === 'login' ? <LoginForm /> : <SignupForm />;
}

function Brand({ inverse = false }: { inverse?: boolean }) {
  return (
    <div className="inline-flex items-center gap-3">
      <span
        className={cn(
          'flex size-11 items-center justify-center rounded-xl shadow-sm',
          inverse ? 'bg-white/15 text-white ring-1 ring-white/20' : 'bg-blue-600 text-white',
        )}
      >
        <CreditCard className="size-5" aria-hidden="true" />
      </span>
      <span
        className={cn(
          'text-xl font-bold tracking-tight',
          inverse ? 'text-white' : 'text-slate-950',
        )}
      >
        SettleFlow
      </span>
    </div>
  );
}

function AuthShell({ children, mode }: { children: ReactNode; mode: AuthMode }) {
  return (
    <main className="grid min-h-screen min-w-0 grid-cols-1 overflow-x-hidden bg-white lg:grid-cols-[minmax(420px,0.9fr)_minmax(520px,1.1fr)]">
      <section className="relative hidden overflow-hidden bg-slate-950 px-10 py-12 text-white lg:flex lg:flex-col lg:justify-between xl:px-16">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_15%_15%,rgb(37_99_235/0.5),transparent_38%),radial-gradient(circle_at_90%_85%,rgb(14_165_233/0.22),transparent_35%)]" />
        <div className="relative">
          <Brand inverse />
        </div>
        <div className="relative max-w-lg py-16">
          <p className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-semibold text-blue-100">
            <ShieldCheck className="size-4" aria-hidden="true" /> Secure settlement workspace
          </p>
          <h1 className="text-4xl font-semibold leading-tight tracking-tight xl:text-5xl">
            Orders and payments, finally in sync.
          </h1>
          <p className="mt-5 max-w-md text-base leading-7 text-slate-300">
            Create customer orders, track every payment and see outstanding balances without
            spreadsheet guesswork.
          </p>
          <ul className="mt-9 grid gap-4 text-sm text-slate-200">
            {[
              'Server-verified totals and payment balances',
              'Clear pending, overdue and paid order states',
              'Responsive workflows for desktop and mobile',
            ].map((item) => (
              <li className="flex items-center gap-3" key={item}>
                <CheckCircle2 className="size-5 text-blue-400" aria-hidden="true" /> {item}
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-xs text-slate-500">Built for focused B2B operations teams.</p>
      </section>

      <section className="flex min-h-screen min-w-0 items-center justify-center bg-app-bg px-4 py-8 sm:px-8">
        <div className="min-w-0 w-full max-w-[440px]">
          <div className="mb-8 lg:hidden">
            <Brand />
          </div>
          <div className="rounded-2xl border border-slate-200/90 bg-white p-6 shadow-[0_20px_60px_rgb(15_23_42/0.08)] sm:p-8">
            <div>
              <p className="text-sm font-semibold text-blue-600">
                {mode === 'login' ? 'Welcome back' : 'Start tracking settlements'}
              </p>
              <h2 className="mt-1.5 text-2xl font-semibold tracking-tight text-slate-950">
                {mode === 'login' ? 'Sign in to SettleFlow' : 'Create your account'}
              </h2>
              <p className="mt-2 text-sm leading-6 text-slate-500">
                {mode === 'login'
                  ? 'Enter your details to continue to your workspace.'
                  : 'Set up your workspace in less than a minute.'}
              </p>
            </div>

            <AuthModeSwitch mode={mode} />
            {children}
          </div>
          <p className="mt-5 text-center text-xs leading-5 text-slate-400">
            Your session is protected with a secure HttpOnly cookie.
          </p>
        </div>
      </section>
    </main>
  );
}

export function AuthModeSwitch({ mode }: { mode: AuthMode }) {
  const items = [
    { href: '/login', label: 'Sign In', value: 'login' },
    { href: '/signup', label: 'Sign Up', value: 'signup' },
  ] as const;
  return (
    <nav className="my-6 grid grid-cols-2 rounded-xl bg-slate-100 p-1" aria-label="Account access">
      {items.map((item) => (
        <Link
          key={item.value}
          to={item.href}
          aria-current={mode === item.value ? 'page' : undefined}
          className={cn(
            'flex min-h-10 items-center justify-center rounded-lg text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/30',
            mode === item.value
              ? 'bg-white text-slate-950 shadow-sm ring-1 ring-slate-200/70'
              : 'text-slate-500 hover:text-slate-800',
          )}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}

function AuthError({ error }: { error: unknown }) {
  if (!error) return null;
  const message =
    error instanceof ApiClientError ? error.message : 'Something went wrong. Try again.';
  return (
    <Alert variant="danger" className="mb-5">
      {message}
    </Alert>
  );
}

const callbackErrorMessages: Record<string, string> = {
  GOOGLE_ACCESS_DENIED: 'Google sign-in was cancelled. You can try again when ready.',
  GOOGLE_ALREADY_LINKED: 'A different Google account is already connected.',
  GOOGLE_ACCOUNT_LINK_REQUIRED:
    'An account already exists for this email. Sign in with your password, then connect Google from Security settings.',
  GOOGLE_AUTH_EXPIRED: 'The Google sign-in request expired or was already used. Please try again.',
  GOOGLE_AUTH_FAILED: 'Google sign-in could not be completed. Please try again.',
  GOOGLE_EMAIL_NOT_VERIFIED: 'Use a Google account with a verified email address.',
  GOOGLE_IDENTITY_IN_USE: 'This Google account is already connected to another account.',
  GOOGLE_PROFILE_INVALID: 'Google did not return a usable account profile.',
};

function GoogleAccess() {
  const config = useAuthConfig();
  const [searchParams] = useSearchParams();
  const callbackError = searchParams.get('authError');
  const mutation = useMutation({
    mutationFn: () => authApi.startGoogle({ intent: 'signin', returnTo: '/orders' }),
    onSuccess: ({ authorizationUrl }) => window.location.assign(authorizationUrl),
  });

  return (
    <>
      {callbackError ? (
        <Alert variant="danger" className="mb-5">
          {callbackErrorMessages[callbackError] ??
            'Google sign-in could not be completed. Please try again.'}
        </Alert>
      ) : null}
      <AuthError error={mutation.error} />
      {config.data?.providers.google ? (
        <>
          <Button
            type="button"
            variant="outline"
            size="lg"
            className="w-full bg-white"
            disabled={mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending ? (
              <Spinner label="Opening Google…" />
            ) : (
              <>
                <GoogleIcon className="size-[18px]" /> Continue with Google
              </>
            )}
          </Button>
          <div className="my-5 flex items-center gap-3" aria-hidden="true">
            <span className="h-px flex-1 bg-slate-200" />
            <span className="text-xs font-medium uppercase tracking-wider text-slate-400">or</span>
            <span className="h-px flex-1 bg-slate-200" />
          </div>
        </>
      ) : null}
    </>
  );
}

function useAuthSuccess() {
  const navigate = useNavigate();
  return (user: UserResponse) => {
    queryClient.setQueryData(authQueryKey, user);
    void navigate('/orders', { replace: true });
  };
}

function LoginForm() {
  const onSuccess = useAuthSuccess();
  const mutation = useMutation({ mutationFn: authApi.login, onSuccess });
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  return (
    <AuthShell mode="login">
      <GoogleAccess />
      <AuthError error={mutation.error} />
      <form
        className="grid gap-4"
        onSubmit={(event) => void handleSubmit((data) => mutation.mutate(data))(event)}
        noValidate
      >
        <Field>
          <FieldLabel htmlFor="email">Email address</FieldLabel>
          <InputGroup>
            <InputGroupAddon aria-hidden="true">
              <Mail />
            </InputGroupAddon>
            <InputGroupInput
              id="email"
              type="email"
              autoComplete="email"
              placeholder="you@company.com"
              aria-invalid={Boolean(errors.email)}
              aria-describedby={errors.email ? 'email-error' : undefined}
              {...register('email')}
            />
          </InputGroup>
          <FieldError id="email-error">{errors.email?.message}</FieldError>
        </Field>
        <Field>
          <FieldLabel htmlFor="password">Password</FieldLabel>
          <PasswordInput
            id="password"
            icon={<LockKeyhole />}
            autoComplete="current-password"
            placeholder="Enter your password"
            aria-invalid={Boolean(errors.password)}
            aria-describedby={errors.password ? 'password-error' : undefined}
            {...register('password')}
          />
          <FieldError id="password-error">{errors.password?.message}</FieldError>
        </Field>
        <Button type="submit" size="lg" className="mt-2 w-full" disabled={mutation.isPending}>
          {mutation.isPending ? (
            <Spinner label="Signing in…" />
          ) : (
            <>
              Sign In <ArrowRight aria-hidden="true" />
            </>
          )}
        </Button>
      </form>
    </AuthShell>
  );
}

function SignupForm() {
  const onSuccess = useAuthSuccess();
  const mutation = useMutation({ mutationFn: authApi.signup, onSuccess });
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<SignupInput>({
    resolver: zodResolver(signupSchema),
    defaultValues: { displayName: '', email: '', password: '' },
  });

  return (
    <AuthShell mode="signup">
      <GoogleAccess />
      <AuthError error={mutation.error} />
      <form
        className="grid gap-4"
        onSubmit={(event) => void handleSubmit((data) => mutation.mutate(data))(event)}
        noValidate
      >
        <Field>
          <FieldLabel htmlFor="displayName">Full name</FieldLabel>
          <InputGroup>
            <InputGroupAddon aria-hidden="true">
              <UserRound />
            </InputGroupAddon>
            <InputGroupInput
              id="displayName"
              autoComplete="name"
              placeholder="Your full name"
              aria-invalid={Boolean(errors.displayName)}
              aria-describedby={errors.displayName ? 'displayName-error' : undefined}
              {...register('displayName')}
            />
          </InputGroup>
          <FieldError id="displayName-error">{errors.displayName?.message}</FieldError>
        </Field>
        <Field>
          <FieldLabel htmlFor="signupEmail">Email address</FieldLabel>
          <InputGroup>
            <InputGroupAddon aria-hidden="true">
              <Mail />
            </InputGroupAddon>
            <InputGroupInput
              id="signupEmail"
              type="email"
              autoComplete="email"
              placeholder="you@company.com"
              aria-invalid={Boolean(errors.email)}
              aria-describedby={errors.email ? 'signupEmail-error' : undefined}
              {...register('email')}
            />
          </InputGroup>
          <FieldError id="signupEmail-error">{errors.email?.message}</FieldError>
        </Field>
        <Field>
          <FieldLabel htmlFor="signupPassword">Password</FieldLabel>
          <PasswordInput
            id="signupPassword"
            icon={<LockKeyhole />}
            autoComplete="new-password"
            placeholder="At least 12 characters"
            aria-invalid={Boolean(errors.password)}
            aria-describedby="signupPassword-help signupPassword-error"
            {...register('password')}
          />
          <FieldDescription id="signupPassword-help">
            Use 12+ characters with a mix of letters and numbers.
          </FieldDescription>
          <FieldError id="signupPassword-error">{errors.password?.message}</FieldError>
        </Field>
        <Button type="submit" size="lg" className="mt-2 w-full" disabled={mutation.isPending}>
          {mutation.isPending ? (
            <Spinner label="Creating account…" />
          ) : (
            <>
              Create Account <WalletCards aria-hidden="true" />
            </>
          )}
        </Button>
      </form>
    </AuthShell>
  );
}
