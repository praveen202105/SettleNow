import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { StatusBadge } from '../../../apps/web/src/components/StatusBadge';

describe('StatusBadge', () => {
  it.each([
    ['pending', 'Pending'],
    ['partially_paid', 'Partially Paid'],
    ['paid', 'Paid'],
    ['overdue', 'Overdue'],
  ] as const)('renders the %s status', (status, label) => {
    render(<StatusBadge status={status} />);
    expect(screen.getByText(label)).toBeVisible();
  });
});
