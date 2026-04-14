const DIGITS = /^\d+$/;

export function parseCount(raw: string | undefined): number | null {
  if (raw === undefined || !DIGITS.test(raw)) return null;
  const n = Number(raw);
  return Number.isSafeInteger(n) ? n : null;
}
