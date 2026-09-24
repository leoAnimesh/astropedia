import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildTimeline, formatDayLabel, parseTimestamp, type MessageRow } from '../utils/chat-timeline';
import { msg } from './helpers';

const NOW = new Date(2026, 8, 24, 12, 0, 0).getTime();
const at = (d: number, h: number, m = 0) => new Date(2026, 8, d, h, m, 0).toISOString();
const messageRows = (rows: ReturnType<typeof buildTimeline>) =>
  rows.filter((r): r is MessageRow => r.kind === 'message');

test('parses ISO and legacy SQLite timestamps', () => {
  assert.equal(parseTimestamp('2026-09-24 10:00:00'), Date.UTC(2026, 8, 24, 10, 0, 0));
  assert.equal(parseTimestamp('2026-09-24T10:00:00.000Z'), Date.UTC(2026, 8, 24, 10, 0, 0));
  assert.ok(Number.isNaN(parseTimestamp('not a date')));
  assert.ok(Number.isNaN(parseTimestamp(undefined)));
});

test('day labels', () => {
  assert.equal(formatDayLabel(new Date(2026, 8, 24, 8).getTime(), NOW), 'Today');
  assert.equal(formatDayLabel(new Date(2026, 8, 23, 23).getTime(), NOW), 'Yesterday');
  assert.equal(formatDayLabel(new Date(2026, 8, 20, 9).getTime(), NOW), 'Sun, 20 Sep');
  assert.equal(formatDayLabel(new Date(2025, 0, 5, 9).getTime(), NOW), '5 Jan 2025');
});

test('inserts one date separator per day, before that day\'s first message', () => {
  const rows = buildTimeline([
    msg({ role: 'user', createdAt: at(23, 9) }),
    msg({ role: 'assistant', createdAt: at(23, 9, 1) }),
    msg({ role: 'user', createdAt: at(24, 11) }),
  ], NOW);
  assert.deepEqual(rows.map((r) => r.kind), ['date', 'message', 'message', 'date', 'message']);
  assert.equal(rows[0].kind === 'date' && rows[0].label, 'Yesterday');
  assert.equal(rows[3].kind === 'date' && rows[3].label, 'Today');
});

test('groups consecutive same-author messages within 5 minutes', () => {
  const rows = messageRows(buildTimeline([
    msg({ role: 'assistant', createdAt: at(24, 10, 0) }),
    msg({ role: 'assistant', createdAt: at(24, 10, 2) }),
    msg({ role: 'assistant', createdAt: at(24, 10, 20) }), // gap > 5 min → new group
    msg({ role: 'user',      createdAt: at(24, 10, 21) }),
  ], NOW));
  assert.deepEqual(rows.map((r) => [r.isFirstInGroup, r.isLastInGroup]), [
    [true, false],
    [false, true],
    [true, true],
    [true, true],
  ]);
});

test('system messages never group; different human authors never group', () => {
  const rows = messageRows(buildTimeline([
    msg({ role: 'system', createdAt: at(24, 10, 0) }),
    msg({ role: 'system', createdAt: at(24, 10, 0) }),
    msg({ role: 'human', authorName: 'A', createdAt: at(24, 10, 1) }),
    msg({ role: 'human', authorName: 'B', createdAt: at(24, 10, 1) }),
  ], NOW));
  assert.ok(rows.every((r) => r.isFirstInGroup && r.isLastInGroup));
});

test('status line: always for sending/failed, "Sent" only on the latest user message', () => {
  const rows = messageRows(buildTimeline([
    msg({ id: 'a', role: 'user', status: 'failed', createdAt: at(24, 10, 0) }),
    msg({ id: 'b', role: 'user', createdAt: at(24, 10, 1) }), // legacy, no status = sent
    msg({ id: 'c', role: 'assistant', createdAt: at(24, 10, 2) }),
    msg({ id: 'd', role: 'user', status: 'sent', createdAt: at(24, 10, 3) }),
  ], NOW));
  const show = Object.fromEntries(rows.map((r) => [r.message.id, r.showStatus]));
  assert.deepEqual(show, { a: true, b: false, c: false, d: true });
});

test('unparseable timestamps inherit the previous message\'s day', () => {
  const rows = buildTimeline([
    msg({ role: 'user', createdAt: at(23, 9) }),
    msg({ role: 'assistant', createdAt: 'garbage' }),
  ], NOW);
  assert.equal(rows.filter((r) => r.kind === 'date').length, 1);
});

test('empty input → no rows', () => {
  assert.deepEqual(buildTimeline([], NOW), []);
});
