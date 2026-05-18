const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const MONTHS_LONG  = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const DAYS         = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

export function formatBirthDate(iso: string): string {
  if (!iso) return '';
  const parts = iso.split('-').map(Number);
  const y = parts[0]; const m = parts[1]; const d = parts[2];
  return `${MONTHS_SHORT[m - 1]} ${d}, ${y}`;
}

export function formatBirthTime(t: string): string {
  if (!t) return '';
  const parts = t.split(':').map(Number);
  const h = parts[0]; const m = parts[1];
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hr = ((h + 11) % 12) + 1;
  return `${hr}:${String(m).padStart(2, '0')} ${ampm}`;
}

export function formatBirthInfo(profile: {
  birthDate: string;
  birthTime?: string;
  birthCity?: string;
}): string {
  const parts: string[] = [];
  if (profile.birthDate) parts.push(formatBirthDate(profile.birthDate));
  if (profile.birthTime) parts.push(formatBirthTime(profile.birthTime));
  if (profile.birthCity) parts.push(profile.birthCity);
  return parts.join(' · ');
}

export function formatRelativeTime(ts: number): string {
  const s = (Date.now() - ts) / 1000;
  if (s < 60)    return 'just now';
  if (s < 3600)  return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export function formatMessageDate(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  if (diff < 86400000 && now.getDate() === d.getDate()) {
    return formatBirthTime(`${d.getHours()}:${String(d.getMinutes()).padStart(2,'0')}`);
  }
  if (diff < 604800000) return DAYS[d.getDay()];
  return `${MONTHS_SHORT[d.getMonth()]} ${d.getDate()}`;
}

export function formatFullDate(date: Date): string {
  return `${MONTHS_LONG[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
}

export function greeting(): string {
  const h = new Date().getHours();
  if (h < 5)  return 'Still up';
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

export function todayShort(): string {
  const d = new Date();
  return `${MONTHS_SHORT[d.getMonth()]} ${d.getDate()}`;
}

/**
 * YYYY-MM-DD in the device's LOCAL timezone — never UTC.
 *
 * `Date.toISOString()` returns UTC; for users east of GMT this can shift a
 * locally-picked date back by one day (e.g. IST midnight on Aug 6 → Aug 5
 * UTC). Always use this helper for birth dates and "today".
 */
export function localDateIso(date: Date): string {
  const y   = date.getFullYear();
  const m   = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function todayIso(): string {
  return localDateIso(new Date());
}
