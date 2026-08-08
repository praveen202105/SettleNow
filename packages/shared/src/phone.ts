const E164_PATTERN = /^\+[1-9]\d{7,14}$/;

export function normalizeE164Phone(value: string): string | null {
  const normalized = value.trim().replace(/[\s().-]/g, '');
  return E164_PATTERN.test(normalized) ? normalized : null;
}
