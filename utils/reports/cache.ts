/**
 * Report cache rules and reading-progress maths. Pure (Node-tested); the
 * database calls live in utils/database.ts and hooks/use-report.ts.
 *
 * A cached payload is used only while all of these hold:
 *   - same REPORT_VERSION (bumped whenever the engine's output changes),
 *   - same language,
 *   - same chart hash (birth details, gender, name: a profile edit misses),
 *   - generated on the same local day (the "now" line and timing move daily).
 * Otherwise the report is regenerated and the row's payload replaced; its
 * reading progress and last-viewed time are kept.
 */
import { REPORT_VERSION, type ReportPayload } from './types';
import type { AnyReportKind } from './areas';
import type { CompatMode } from './compat';

export function reportRowId(profileId: string, kind: AnyReportKind): string {
  return `${profileId}:${kind}`;
}

export function compatRowId(a: string, b: string, mode: CompatMode): string {
  return `${a}:compat:${b}:${mode}`;
}

/** { b, mode } of a compatibility row id, or null. */
export function parseCompatRowId(id: string): { a: string; b: string; mode: CompatMode } | null {
  const m = /^(.+):compat:(.+):(partner|friend|family)$/.exec(id);
  return m ? { a: m[1], b: m[2], mode: m[3] as CompatMode } : null;
}

const localDay = (d: Date) => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;

export function parsePayload(json: string | null | undefined): ReportPayload | null {
  if (!json) return null;
  try {
    const p = JSON.parse(json) as ReportPayload;
    return p && typeof p === 'object' && Array.isArray(p.chapters) && p.summary ? p : null;
  } catch {
    return null;
  }
}

export function isFresh(p: ReportPayload | null, want: { lang: string; chartHash: string; now?: Date }): p is ReportPayload {
  if (!p) return false;
  const now = want.now ?? new Date();
  return p.version === REPORT_VERSION
    && p.lang === want.lang
    && p.chartHash === want.chartHash
    && localDay(new Date(p.generatedAt)) === localDay(now);
}

/**
 * Reading progress as one number: (chapter index + fraction through it) /
 * chapter count, so "Chapter n of N" can be read back from it alone.
 */
export function progressOf(index: number, fraction: number, count: number): number {
  if (count <= 0) return 0;
  const f = Math.min(1, Math.max(0, fraction));
  return Math.min(1, Math.max(0, (index + f) / count));
}

export type Where = { state: 'start' | 'reading' | 'done'; chapter: number; total: number };

/** Where a reader stopped, from the stored progress and the chapter count. */
export function whereFrom(progress: number, total: number): Where {
  if (progress >= 0.98) return { state: 'done', chapter: total, total };
  if (progress <= 0 || total <= 0) return { state: 'start', chapter: 1, total };
  return { state: 'reading', chapter: Math.min(total, Math.floor(progress * total) + 1), total };
}
