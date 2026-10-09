/**
 * Reports: deterministic, chart-grounded reports per life area, plus
 * compatibility. See facts.ts (chart facts), areas.ts (areas and focus
 * dots), build.ts (text), compat.ts, pdf.ts (PDF HTML) and cache.ts.
 */
export { REPORT_KINDS, AREAS, type ReportKind, type AnyReportKind } from './areas';
export { buildReport, areaGlance, canRead, plain, type AreaGlance } from './build';
export { buildCompatReport, partnerAllowed, orientPair, COMPAT_MODES, type CompatMode } from './compat';
export { chartHash, getChartFacts } from './facts';
export { reportRowId, compatRowId, parseCompatRowId, parsePayload, isFresh, progressOf, whereFrom } from './cache';
export * from './types';
