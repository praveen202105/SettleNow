import { MAX_MONEY_CENTS } from './constants.js';

const MONEY_PATTERN = /^(?:0|[1-9]\d*)(?:\.(\d{1,2}))?$/;

export class MoneyParseError extends Error {
  constructor(message = 'Enter a valid amount with no more than two decimal places.') {
    super(message);
    this.name = 'MoneyParseError';
  }
}

export function parseMoneyToCents(value: string): number {
  const normalized = value.trim();
  const match = MONEY_PATTERN.exec(normalized);

  if (!match) {
    throw new MoneyParseError();
  }

  const [whole = '0', fraction = ''] = normalized.split('.');
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));

  if (!Number.isSafeInteger(cents) || cents > MAX_MONEY_CENTS) {
    throw new MoneyParseError('Amount is outside the supported range.');
  }

  return cents;
}

export function centsToInput(cents: number): string {
  if (!Number.isSafeInteger(cents) || cents < 0) {
    throw new MoneyParseError('Stored amount is invalid.');
  }

  return (cents / 100).toFixed(2);
}

export function formatUsd(cents: number): string {
  if (!Number.isSafeInteger(cents)) {
    throw new MoneyParseError('Stored amount is invalid.');
  }

  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(cents / 100);
}
