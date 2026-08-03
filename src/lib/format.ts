export function formatBaht(amount: number): string {
  return `฿${amount.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

/** Whole-day difference between two ISO date strings (end - start), or null if either is missing. */
export function daysBetween(start: string | null | undefined, end: string | null | undefined): number | null {
  if (!start || !end) return null;
  const a = new Date(start).getTime();
  const b = new Date(end).getTime();
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.max(0, Math.round((b - a) / 86400000));
}
