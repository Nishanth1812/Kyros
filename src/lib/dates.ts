function pad2(value: number): string {
  return value < 10 ? `0${value}` : String(value);
}

/** Local calendar date (not UTC) in the YYYY-MM-DD format the storage layer expects. */
export function todayISO(): string {
  const now = new Date();
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
}

/** Human-readable date for display; keeps the calendar day local to avoid UTC shifts. */
export function formatDisplayDate(iso: string): string {
  const [year, month, day] = iso.split('-').map(Number);
  if (!year || !month || !day) return iso;
  const date = new Date(year, month - 1, day);
  return new Intl.DateTimeFormat('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(date);
}
