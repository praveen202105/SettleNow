import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LockKeyhole, Mail } from 'lucide-react';
import { useState } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ConfirmDialog } from '../../../apps/web/src/components/ui/ConfirmDialog';
import { Field, FieldError, FieldLabel } from '../../../apps/web/src/components/ui/Field';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from '../../../apps/web/src/components/ui/InputGroup';
import { PasswordInput } from '../../../apps/web/src/components/ui/PasswordInput';
import { Select } from '../../../apps/web/src/components/ui/Select';
import { activityLabel } from '../../../apps/web/src/features/activity/ActivityTimeline';
import { AuthModeSwitch, AuthPage } from '../../../apps/web/src/features/auth/AuthPage';
import { authQueryKey } from '../../../apps/web/src/features/auth/hooks';
import { SecurityPage } from '../../../apps/web/src/features/settings/SecurityPage';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function jsonResponse(data: unknown, status = 200) {
  return Promise.resolve(
    new Response(JSON.stringify(data), {
      headers: { 'content-type': 'application/json' },
      status,
    }),
  );
}

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

describe('form primitives', () => {
  it('renders a correctly sized input addon without replacing the control label', () => {
    render(
      <InputGroup>
        <InputGroupAddon aria-hidden="true">
          <Mail data-testid="email-icon" />
        </InputGroupAddon>
        <InputGroupInput aria-label="Email address" />
      </InputGroup>,
    );

    expect(screen.getByTestId('email-icon')).toBeVisible();
    expect(screen.getByRole('textbox', { name: 'Email address' })).toBeVisible();
  });

  it('associates validation errors with their field', () => {
    render(
      <Field>
        <FieldLabel htmlFor="customer">Customer</FieldLabel>
        <InputGroup>
          <InputGroupInput id="customer" aria-invalid="true" aria-describedby="customer-error" />
        </InputGroup>
        <FieldError id="customer-error">Customer is required.</FieldError>
      </Field>,
    );

    expect(screen.getByLabelText('Customer')).toHaveAccessibleDescription('Customer is required.');
  });

  it('shows and hides a password using an accessible button', async () => {
    const user = userEvent.setup();
    render(
      <Field>
        <FieldLabel htmlFor="password">Password</FieldLabel>
        <PasswordInput id="password" icon={<LockKeyhole />} />
      </Field>,
    );

    const password = screen.getByLabelText('Password');
    expect(password).toHaveAttribute('type', 'password');
    await user.click(screen.getByRole('button', { name: 'Show password' }));
    expect(password).toHaveAttribute('type', 'text');
    expect(screen.getByRole('button', { name: 'Hide password' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });
});

describe('navigation and overlays', () => {
  it('marks the active authentication route as the current page', () => {
    render(
      <MemoryRouter initialEntries={['/signup']}>
        <AuthModeSwitch mode="signup" />
      </MemoryRouter>,
    );
    expect(screen.getByRole('link', { name: 'Sign Up' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Sign In' })).not.toHaveAttribute('aria-current');
  });

  it('supports keyboard selection', async () => {
    const user = userEvent.setup();
    function Example() {
      const [value, setValue] = useState('all');
      return (
        <Select
          ariaLabel="Status"
          value={value}
          onValueChange={setValue}
          options={[
            { label: 'All statuses', value: 'all' },
            { label: 'Paid', value: 'paid' },
          ]}
        />
      );
    }
    render(<Example />);
    const trigger = screen.getByRole('combobox', { name: 'Status' });
    trigger.focus();
    await user.keyboard('{ArrowDown}{ArrowDown}{Enter}');
    expect(trigger).toHaveTextContent('Paid');
  });

  it('moves focus into a destructive confirmation dialog', async () => {
    render(
      <ConfirmDialog
        open
        setOpen={() => undefined}
        title="Delete order?"
        description="This cannot be undone."
        onConfirm={() => undefined}
      />,
    );
    await waitFor(() => expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus());
  });
});

describe('Google authentication UI', () => {
  it('labels Google signup and login audit events explicitly', () => {
    const baseEvent = {
      createdAt: '2026-08-08T00:00:00.000Z',
      entityId: 'user-1',
      entityType: 'user',
      id: 'event-1',
      metadata: { provider: 'google' },
      orderId: null,
      requestId: 'request-1',
      userId: 'user-1',
    } as const;

    expect(activityLabel({ ...baseEvent, action: 'auth.signup' })).toBe('Google account created');
    expect(activityLabel({ ...baseEvent, action: 'auth.login' })).toBe('Signed in with Google');
  });

  it('shows an accessible Google option and actionable callback errors', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      const url = requestUrl(input);
      if (url.endsWith('/auth/config')) {
        return jsonResponse({ data: { providers: { google: true, password: true } } });
      }
      return jsonResponse(
        { error: { code: 'AUTH_REQUIRED', message: 'Sign in to continue.' } },
        401,
      );
    });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={['/login?authError=GOOGLE_ACCOUNT_LINK_REQUIRED']}>
          <AuthPage mode="login" />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(await screen.findByRole('button', { name: 'Continue with Google' })).toBeVisible();
    expect(screen.getByText(/Sign in with your password, then connect Google/)).toBeVisible();
  });

  it('prevents a Google-only user from disconnecting the last sign-in method', async () => {
    const googleUser = {
      authMethods: ['google'] as const,
      createdAt: '2026-08-08T00:00:00.000Z',
      displayName: 'Google User',
      email: 'google@example.com',
      id: 'user-1',
    };
    vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      const url = requestUrl(input);
      if (url.endsWith('/auth/config')) {
        return jsonResponse({ data: { providers: { google: true, password: true } } });
      }
      return jsonResponse({ data: googleUser });
    });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    client.setQueryData(authQueryKey, googleUser);
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={['/settings/security']}>
          <SecurityPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(await screen.findByText(/Google is your only sign-in method/)).toBeVisible();
    expect(await screen.findByRole('button', { name: 'Disconnect' })).toBeDisabled();
  });
});
