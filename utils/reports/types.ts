/**
 * The report payload: plain, already-localized text plus a little structure,
 * so it can be cached as JSON (table `reports`, schema v8), rendered on
 * screen, captured as an image and turned into PDF HTML without the engine.
 */
import type { AnyReportKind } from './areas';

/** Bumped whenever generated text or structure changes: cached payloads regenerate. */
export const REPORT_VERSION = 2;

export type ReportLang = 'en' | 'hi' | 'bn';

export type GlanceRow = { k: string; v: string };

export type TextChapter = {
  type: 'text';
  /** Stable id (ch-you, ch-strong …): chip anchors and reading progress. */
  id: string;
  /** Short label for the chapter chips. */
  chip: string;
  title: string;
  body: string;
  items: string[];
  /** Watch-outs get muted bullets. */
  tone: 'plain' | 'watch';
  /** The chart fact behind the chapter, in simple words (signs and houses allowed here). */
  why: string;
};

export type TimelineItem = {
  /** "Now → Jul 2028", "31 Oct 2026". */
  date: string;
  /** "Life chapter" | "Planet move" | "Best window". */
  tag: string;
  title: string;
  sub: string;
  state: 'now' | 'soon' | 'later';
  /** ISO dates for tests and sorting. */
  start: string;
  end: string | null;
  /** 'window': the timing engine's best window (utils/timing-engine.ts), the same one chat gives. */
  source: 'sub' | 'chapter' | 'move' | 'sade' | 'window';
};

export type TimingChapter = {
  type: 'timing';
  id: 'ch-timing';
  chip: string;
  title: string;
  body: string;
  items: TimelineItem[];
  why: string;
};

export type HelpItem = { t: string; s: string };

export type HelpsChapter = {
  type: 'helps';
  id: 'ch-helps';
  chip: string;
  title: string;
  items: HelpItem[];
  note: string;
};

export type Chapter = TextChapter | TimingChapter | HelpsChapter;

export type KootaRow = { key: string; name: string; trad: string; score: number; max: number };

export type CompatExtras = {
  mode: 'partner' | 'friend' | 'family';
  a: { id: string; name: string };
  b: { id: string; name: string };
  /** Partner mode only: the traditional 36-point count. */
  score?: { total: number; band: string; verdict: string; kootas: KootaRow[]; mars: string };
};

export type ReportPayload = {
  version: number;
  lang: ReportLang;
  kind: AnyReportKind;
  profileId: string;
  chartHash: string;
  /** ISO time the payload was generated. */
  generatedAt: string;
  /** Report title ("Career & money"). */
  title: string;
  summary: {
    eyebrow: string;
    /** May contain one <em>…</em> span. */
    line: string;
    glance: GlanceRow[];
    focus: { dots: 1 | 2 | 3; count: number; label: string; reason: string } | null;
  };
  /** Shown above the summary (health: doctor line). */
  topNote: string | null;
  chapters: Chapter[];
  /** Footer: when and from what it was written, plus the kind's caution. */
  disclaimer: string;
  /** Houses counted from the Moon (no birth time / place). */
  approximate: boolean;
  /** "about 8 min". */
  minutes: number;
  compat?: CompatExtras;
};
