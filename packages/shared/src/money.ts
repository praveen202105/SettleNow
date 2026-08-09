import { MAX_MONEY_MINOR } from './constants.js';

const MONEY_PATTERN = /^(?:0|[1-9]\d*)(?:\.(\d{1,2}))?$/;

export class MoneyParseError extends Error {
  constructor(message = 'Enter a valid amount with no more than two decimal places.') {
    super(message);
    this.name = 'MoneyParseError';
  }
}

export function parseMoneyToMinor(value: string): number {
  const normalized = value.trim();
  const match = MONEY_PATTERN.exec(normalized);

  if (!match) {
    throw new MoneyParseError();
  }

  const [whole = '0', fraction = ''] = normalized.split('.');
  const minor = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));

  if (!Number.isSafeInteger(minor) || minor > MAX_MONEY_MINOR) {
    throw new MoneyParseError('Amount is outside the supported range.');
  }

  return minor;
}

export function minorToInput(minor: number): string {
  if (!Number.isSafeInteger(minor) || minor < 0) {
    throw new MoneyParseError('Stored amount is invalid.');
  }

  return (minor / 100).toFixed(2);
}

export function formatInr(minor: number): string {
  if (!Number.isSafeInteger(minor)) {
    throw new MoneyParseError('Stored amount is invalid.');
  }

  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
  }).format(minor / 100);
}
