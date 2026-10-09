/**
 * Caret geometry for the app keyboard's text display: maps a caret index to
 * a point in the laid-out text and a tap / trackpad point back to an index.
 *
 * React Native's onTextLayout gives each line's text, origin and width but
 * not per-character positions, so positions inside a line come from a glyph
 * width estimate scaled to the line's real width (exact at line ends, within
 * a fraction of a character inside). The display then draws the caret at an
 * exactly measured spot (AppTextInput measures the line prefix).
 *
 * Pure math — no React Native imports.
 */
import { clusterEndAfter, isIndicMark, isMatra, isWordCode, wordEndAfter, wordStartBefore } from './text-edit';

export type TextLine = { text: string; x: number; y: number; width: number; height: number };
export type Point = { x: number; y: number };

// ─── Width estimate ──────────────────────────────────────────────────────────

const NARROW = new Set(Array.from("ijl'.,:;!|`ıí ì î ï".replace(/ /g, '')));
const SEMI   = new Set(Array.from('ftrI()[]{}-/"’‘'));
const WIDE   = new Set(Array.from('mwMW@%'));

/** Rough advance width of one code point in ems (proportional sans font). */
export function charWidthEm(ch: string): number {
  const c = ch.codePointAt(0)!;
  if (ch === ' ' || ch === ' ') return 0.28;
  if (ch === '\n' || c === 0x200b || c === 0x200c || c === 0x200d) return 0;
  if (NARROW.has(ch)) return 0.25;
  if (SEMI.has(ch)) return 0.34;
  if (WIDE.has(ch)) return 0.85;
  if (c >= 0x41 && c <= 0x5a) return 0.68;
  if (c >= 0x30 && c <= 0x39) return 0.56;
  if (c < 0x250) return 0.54;
  if (c >= 0x0300 && c <= 0x036f) return 0;
  if (isIndicMark(c)) return isMatra(c) && !isAboveOrBelow(c) ? 0.28 : 0;
  if ((c >= 0x0900 && c <= 0x09ff)) return 0.62;
  if (c >= 0x1100) return 1; // CJK, emoji…
  return 0.6;
}

/** Vowel signs drawn above / below the letter (no advance of their own). */
function isAboveOrBelow(c: number): boolean {
  return (
    (c >= 0x0941 && c <= 0x0948) || c === 0x0962 || c === 0x0963 || c === 0x093a ||
    (c >= 0x09c1 && c <= 0x09c4) || c === 0x09e2 || c === 0x09e3
  );
}

export type Measure = (s: string) => number;

/** Estimated width of `s` at `fontSize`. */
export function estimateWidth(s: string, fontSize: number): number {
  let w = 0;
  for (const ch of s) w += charWidthEm(ch);
  return w * fontSize;
}

// ─── Lines ───────────────────────────────────────────────────────────────────

/** UTF-16 start offset of each line (lines' texts concatenate to the text). */
export function lineStarts(lines: TextLine[]): number[] {
  const out: number[] = [];
  let at = 0;
  for (const l of lines) { out.push(at); at += l.text.length; }
  return out;
}

/**
 * Which line the caret is on, and its offset in that line. A caret at a
 * soft-wrap boundary goes to the start of the next line (like iOS); the end
 * of the text stays on the last line.
 */
export function locateCaret(lines: TextLine[], caret: number): { line: number; offset: number } {
  if (!lines.length) return { line: 0, offset: 0 };
  const starts = lineStarts(lines);
  for (let i = lines.length - 1; i >= 0; i--) {
    if (caret >= starts[i]) {
      return { line: i, offset: Math.min(caret - starts[i], lines[i].text.length) };
    }
  }
  return { line: 0, offset: 0 };
}

/** Line text without its trailing newline (what's drawn on that line). */
const drawn = (t: string) => t.replace(/\n$/, '');

/** Scale from estimated to real widths for a line (clamped, 1 when unknown). */
function lineScale(line: TextLine, measure: Measure): number {
  const est = measure(drawn(line.text).replace(/[  ]+$/, ''));
  if (est <= 0 || line.width <= 0) return 1;
  return Math.max(0.6, Math.min(1.6, line.width / est));
}

/** Estimated caret point (top of the line) for an index. */
export function pointFromIndex(lines: TextLine[], caret: number, measure: Measure): Point & { h: number } {
  if (!lines.length) return { x: 0, y: 0, h: 0 };
  const { line, offset } = locateCaret(lines, caret);
  const l = lines[line];
  const prefix = drawn(l.text.slice(0, offset));
  return { x: l.x + measure(prefix) * lineScale(l, measure), y: l.y, h: l.height };
}

/** The line nearest a y coordinate (clamped to the first / last). */
export function lineAtY(lines: TextLine[], y: number): number {
  if (!lines.length) return 0;
  for (let i = 0; i < lines.length; i++) {
    if (y < lines[i].y + lines[i].height) return i;
  }
  return lines.length - 1;
}

/** Cluster boundaries in a string (offsets, starting with 0). */
export function clusterBoundaries(s: string): number[] {
  const out = [0];
  let i = 0;
  while (i < s.length) { i = clusterEndAfter(s, i); out.push(i); }
  return out;
}

/**
 * Text index nearest to a point: the line under y, then the cluster
 * boundary closest to x. Points past a line's end give the line end (before
 * its newline); points past the last line give the end of the text.
 */
export function indexFromPoint(lines: TextLine[], x: number, y: number, measure: Measure): number {
  if (!lines.length) return 0;
  const starts = lineStarts(lines);
  const i = lineAtY(lines, y);
  const l = lines[i];
  const text = drawn(l.text);
  const scale = lineScale(l, measure);
  const isLast = i === lines.length - 1;
  // A soft-wrapped line's trailing space belongs to it, but the caret after
  // it is the next line's start — so stop before it.
  const usable = !isLast && text === l.text ? text.replace(/[  ]$/, '') : text;
  const local = x - l.x;
  let best = 0;
  let bestD = Infinity;
  for (const b of clusterBoundaries(usable)) {
    const d = Math.abs(measure(usable.slice(0, b)) * scale - local);
    if (d < bestD) { bestD = d; best = b; }
  }
  return starts[i] + best;
}

/**
 * Where a tap puts the caret (iOS-style): taps on a word go to its nearer
 * edge; taps elsewhere keep the exact boundary.
 */
export function snapToWordEdge(text: string, index: number): number {
  const i = Math.max(0, Math.min(index, text.length));
  const inside = i > 0 && i < text.length && isWordCode(text.charCodeAt(i - 1)) && isWordCode(text.charCodeAt(i));
  if (!inside) return i;
  const s = wordStartBefore(text, i);
  const e = wordEndAfter(text, i);
  return i - s < e - i ? s : e;
}

/**
 * Space-bar trackpad: the caret follows the finger from where it started.
 * `anchor` is the caret point when the trackpad began; `dx`/`dy` the finger
 * travel; `speed` scales finger travel to text travel.
 */
export function trackpadIndex(
  lines: TextLine[],
  anchor: Point,
  dx: number,
  dy: number,
  measure: Measure,
  speed = 1,
): number {
  if (!lines.length) return 0;
  const first = lines[0];
  const last = lines[lines.length - 1];
  const x = anchor.x + dx * speed;
  // Vertical travel is damped so a slightly diagonal swipe stays on its line.
  const y = Math.max(first.y, Math.min(last.y + last.height - 1, anchor.y + (dy * speed) / 1.6));
  return indexFromPoint(lines, x, y, measure);
}

/** Lines for a single-line display (one line holding the whole text). */
export function singleLine(text: string, width: number, height: number): TextLine[] {
  return [{ text, x: 0, y: 0, width, height }];
}
