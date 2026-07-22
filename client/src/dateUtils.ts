const MONTH_FMT = new Intl.DateTimeFormat("en-US", { month: "short" });
const DAY_HEADER_FMT = new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric" });
const TIME_FMT = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
const HOUR_FMT = new Intl.DateTimeFormat("en-US", { hour: "numeric", hour12: true });
const DATE_TIME_FMT = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});

export function startOfWeek(date: Date): Date {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  d.setDate(d.getDate() - d.getDay());
  return d;
}

export function addDays(date: Date, n: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

export function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export function formatWeekRange(start: Date): string {
  const end = addDays(start, 6);
  const startMonth = MONTH_FMT.format(start);
  const endMonth = MONTH_FMT.format(end);
  const year = end.getFullYear();
  if (startMonth === endMonth) {
    return `${startMonth} ${start.getDate()} - ${end.getDate()}, ${year}`;
  }
  return `${startMonth} ${start.getDate()} - ${endMonth} ${end.getDate()}, ${year}`;
}

export function formatDayHeader(date: Date): string {
  return DAY_HEADER_FMT.format(date);
}

export function formatTime(date: Date): string {
  return TIME_FMT.format(date);
}

export function formatTimeRange(start: Date, end: Date): string {
  return `${formatTime(start)} - ${formatTime(end)}`;
}

export function formatDateTime(iso?: string): string {
  if (!iso) return "";
  return DATE_TIME_FMT.format(new Date(iso));
}

export function formatHourLabel(hour: number): string {
  return HOUR_FMT.format(new Date(2000, 0, 1, hour, 0, 0));
}

export function formatDuration(seconds: number): string {
  const totalMinutes = Math.round(seconds / 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

// Jira requires an explicit numeric offset with no colon and no trailing Z
// (e.g. "2026-07-16T14:00:00.000+0530"). The browser already knows the
// correct local->UTC offset for this exact instant (DST-aware), so no
// timezone library or server-side logic is needed.
export function toJiraStarted(date: Date): string {
  const pad = (n: number, len = 2) => String(n).padStart(len, "0");
  const offsetMin = -date.getTimezoneOffset();
  const sign = offsetMin >= 0 ? "+" : "-";
  const abs = Math.abs(offsetMin);
  const offH = pad(Math.floor(abs / 60));
  const offM = pad(abs % 60);
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${pad(date.getMilliseconds(), 3)}` +
    `${sign}${offH}${offM}`
  );
}

export function snapToMinutes(date: Date, step = 15): Date {
  const ms = step * 60 * 1000;
  return new Date(Math.round(date.getTime() / ms) * ms);
}

// For binding to a native <input type="time">, which speaks "HH:mm".
export function toTimeInputValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

// Applies an "HH:mm" input value to `day`'s date, keeping the day fixed.
export function setTimeOnDay(day: Date, timeInputValue: string): Date {
  const [hours, minutes] = timeInputValue.split(":").map(Number);
  const d = new Date(day);
  d.setHours(hours || 0, minutes || 0, 0, 0);
  return d;
}
