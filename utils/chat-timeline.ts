/**
 * Pure timeline builder: turns a flat, chronological message list into the
 * rows the chat list renders — date separators plus messages annotated with
 * grouping and status-visibility flags.
 *
 * No React / RN imports (unit-tested in Node — see tests/).
 */
import type { Message } from './database';

/** Consecutive messages from the same author within this window are grouped. */
export const GROUP_WINDOW_MS = 5 * 60 * 1000;

export type DateRow = {
  kind:  'date';
  key:   string;
  label: string;
};

export type MessageRow = {
  kind:           'message';
  key:            string;
  message:        Message;
  /** First message of a run by the same author — shows the sender label. */
  isFirstInGroup: boolean;
  /** Last message of a run — gets the "tail" corner and extra spacing. */
  isLastInGroup:  boolean;
  /** Whether to render the delivery status line under a user message. */
  showStatus:     boolean;
};

export type TimelineRow = DateRow | MessageRow;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS   = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/**
 * Parse both timestamp formats found in the DB:
 *  - ISO-8601 written by the app ("2026-09-24T10:00:00.000Z")
 *  - SQLite `datetime('now')` defaults on legacy rows ("2026-09-24 10:00:00",
 *    UTC without a zone marker — Hermes' Date parser rejects this form).
 * Returns NaN when unparseable.
 */
export function parseTimestamp(value: string | null | undefined): number {
  if (!value) return NaN;
  const sqlite = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2}(?:\.\d+)?)$/.exec(value);
  if (sqlite) return Date.parse(`${sqlite[1]}T${sqlite[2]}Z`);
  return Date.parse(value);
}

function localDayKey(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

function startOfLocalDay(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** "Today", "Yesterday", "Mon, 22 Sep", or "22 Sep 2025" for other years. */
export function formatDayLabel(ts: number, now: number = Date.now()): string {
  const dayDiff = Math.round((startOfLocalDay(now) - startOfLocalDay(ts)) / 86_400_000);
  if (dayDiff === 0) return 'Today';
  if (dayDiff === 1) return 'Yesterday';
  const d = new Date(ts);
  const sameYear = d.getFullYear() === new Date(now).getFullYear();
  return sameYear
    ? `${DAYS[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]}`
    : `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/** Short clock time for a message ("9:41 PM"). Empty string if unparseable. */
export function formatClock(value: string | null | undefined): string {
  const ts = parseTimestamp(value);
  if (Number.isNaN(ts)) return '';
  const d = new Date(ts);
  const h = d.getHours();
  const m = d.getMinutes();
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
}

function groupable(role: Message['role']): boolean {
  return role !== 'system';
}

/**
 * Build chronological (oldest-first) rows. The chat screen reverses the
 * result for its inverted FlatList.
 */
export function buildTimeline(messages: readonly Message[], now: number = Date.now()): TimelineRow[] {
  const rows: TimelineRow[] = [];

  // Resolve timestamps once. Unparseable values inherit the previous
  // message's time so they stay in the right day bucket instead of jumping
  // to 1970.
  const times: number[] = [];
  let last = now;
  for (let i = 0; i < messages.length; i++) {
    const ts = parseTimestamp(messages[i].createdAt);
    const resolved = Number.isNaN(ts) ? (i > 0 ? last : now) : ts;
    times.push(resolved);
    last = resolved;
  }

  // Only the newest user message shows a plain "Sent"; sending/failed always show.
  let latestUserIdx = -1;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'user') { latestUserIdx = i; break; }
  }

  const sameGroup = (a: number, b: number): boolean => {
    if (a < 0 || b >= messages.length) return false;
    const ma = messages[a];
    const mb = messages[b];
    return (
      groupable(ma.role) &&
      ma.role === mb.role &&
      (ma.authorName ?? null) === (mb.authorName ?? null) &&
      localDayKey(times[a]) === localDayKey(times[b]) &&
      Math.abs(times[b] - times[a]) <= GROUP_WINDOW_MS
    );
  };

  let currentDay = '';
  for (let i = 0; i < messages.length; i++) {
    const m = messages[i];
    const day = localDayKey(times[i]);
    if (day !== currentDay) {
      currentDay = day;
      rows.push({ kind: 'date', key: `date-${day}`, label: formatDayLabel(times[i], now) });
    }

    const status = m.status ?? 'sent';
    rows.push({
      kind:           'message',
      key:            m.id,
      message:        m,
      isFirstInGroup: !sameGroup(i - 1, i),
      isLastInGroup:  !sameGroup(i, i + 1),
      showStatus:
        m.role === 'user' &&
        (status !== 'sent' || i === latestUserIdx),
    });
  }

  return rows;
}
