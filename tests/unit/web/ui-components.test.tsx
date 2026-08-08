import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LockKeyhole, Mail } from 'lucide-react';
import { useState } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { ConfirmDialog } from '../../../apps/web/src/components/ui/ConfirmDialog';
import { Field, FieldError, FieldLabel } from '../../../apps/web/src/components/ui/Field';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from '../../../apps/web/src/components/ui/InputGroup';
import { PasswordInput } from '../../../apps/web/src/components/ui/PasswordInput';
import { Select } from '../../../apps/web/src/components/ui/Select';
import { AuthModeSwitch } from '../../../apps/web/src/features/auth/AuthPage';

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
