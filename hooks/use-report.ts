'use no memo'; // todayIso() and the language are read on every render (the React Compiler would cache them)

/**
 * A report for a person (or a pair), from the SQLite cache when it's still
 * fresh (utils/reports/cache.ts isFresh), else generated after the screen
 * has settled and written back. Generation is synchronous chart maths
 * (~tens of ms after the day's chart facts are cached), so it runs inside
 * InteractionManager to keep navigation smooth.
 */
import { useEffect, useState } from 'react';
import { InteractionManager } from 'react-native';
import { getReportRow, saveReportPayload, type Profile } from '@/utils/database';
import { useAppLanguage } from '@/utils/i18n';
import { todayIso } from '@/utils/format';
import { logger } from '@/utils/logger';
import {
  buildCompatReport,
  buildReport,
  canRead,
  chartHash,
  compatRowId,
  isFresh,
  parsePayload,
  reportRowId,
  type CompatMode,
  type ReportKind,
  type ReportPayload,
} from '@/utils/reports';

type State = { key: string; report: ReportPayload | null };

function useCached(
  key: string | null,
  rowId: string | null,
  profileId: string | null,
  kind: string,
  hash: string,
  lang: string,
  build: () => ReportPayload | null,
): { report: ReportPayload | null; loading: boolean } {
  const [state, setState] = useState<State | null>(null);
  useEffect(() => {
    if (!key || !rowId || !profileId) return;
    let alive = true;
    let task: { cancel: () => void } | null = null;
    (async () => {
      const row = await getReportRow(rowId).catch(() => null);
      const cached = parsePayload(row?.payload);
      if (isFresh(cached, { lang, chartHash: hash })) {
        if (alive) setState({ key, report: cached });
        return;
      }
      task = InteractionManager.runAfterInteractions(() => {
        if (!alive) return;
        let report: ReportPayload | null = null;
        try {
          report = build();
        } catch (e) {
          logger.warn('[reports] build failed', e);
        }
        setState({ key, report });
        if (report) {
          saveReportPayload(rowId, profileId, kind, report.chartHash, report.generatedAt, JSON.stringify(report)).catch(() => {});
        }
      });
    })();
    return () => {
      alive = false;
      task?.cancel();
    };
    // `build` closes over the same inputs `key` encodes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  const ready = !!key && state?.key === key;
  return { report: ready ? state!.report : null, loading: !!key && !ready };
}

/** A life-area report for `profile` (null profile, no birth date, or locked → null). */
export function useReport(kind: ReportKind, profile: Profile | null | undefined) {
  const lang = useAppLanguage();
  const day = todayIso();
  const readable = !!profile && canRead(kind, profile);
  const hash = profile ? chartHash(profile) : '';
  const key = readable ? `${profile!.id}|${kind}|${lang}|${hash}|${day}` : null;
  const rowId = profile ? reportRowId(profile.id, kind) : null;
  const res = useCached(key, rowId, profile?.id ?? null, kind, hash, lang, () => buildReport(kind, profile!));
  return { ...res, rowId, locked: !!profile?.birthDate && !readable };
}

/** The compatibility report for `a` and `b` as `mode`. */
export function useCompatReport(a: Profile | null | undefined, b: Profile | null | undefined, mode: CompatMode) {
  const lang = useAppLanguage();
  const day = todayIso();
  const hash = a && b ? `${chartHash(a)}~${chartHash(b)}` : '';
  const ok = !!a?.birthDate && !!b?.birthDate && a.id !== b.id;
  const key = ok ? `${a!.id}|${b!.id}|${mode}|${lang}|${hash}|${day}` : null;
  const rowId = a && b ? compatRowId(a.id, b.id, mode) : null;
  const res = useCached(key, rowId, a?.id ?? null, 'compat', hash, lang, () => buildCompatReport(a!, b!, mode));
  return { ...res, rowId };
}
