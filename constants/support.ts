/**
 * Where users' reports go (Report this answer, utils/report-answer.ts).
 *
 * TODO(before release): replace the placeholder with the real support
 * address. While it is a placeholder (no "@"), reports open the share sheet
 * instead of an email draft.
 */
export const SUPPORT_EMAIL = '[support email]';

/** True once SUPPORT_EMAIL is a real address. */
export const hasSupportEmail = (): boolean => /^[^\s@[\]]+@[^\s@[\]]+\.[^\s@[\]]+$/.test(SUPPORT_EMAIL);
