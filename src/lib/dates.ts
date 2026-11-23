function pad2(value: number): string {
  return value < 10 ? `0${value}` : String(value);
}

/** Local calendar date (not UTC) in the YYYY-MM-DD format the storage layer expects. */
export function todayISO(): string {
  const now = new Date();
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
}

/** Inclusive local-calendar month bounds in the YYYY-MM-DD form storage uses. */
export function currentMonthBounds(now: Date): {
  dateFrom: string;
  dateTo: string;
} {
  const year = now.getFullYear();
  const month = now.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  return {
    dateFrom: `${year}-${pad2(month + 1)}-01`,
    dateTo: `${year}-${pad2(month + 1)}-${pad2(daysInMonth)}`,
  };
}

/** Human-readable label for the local calendar month containing `now`. */
export function currentMonthLabel(now: Date): string {
  return new Intl.DateTimeFormat('en-IN', {
    month: 'long',
    year: 'numeric',
  }).format(now);
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
