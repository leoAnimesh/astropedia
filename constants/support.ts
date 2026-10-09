/** Where users' reports go (Report this answer, utils/report-answer.ts). */
export const SUPPORT_EMAIL = 'mondalarup808@gmail.com';

/** True once SUPPORT_EMAIL is a real address. */
export const hasSupportEmail = (): boolean => /^[^\s@[\]]+@[^\s@[\]]+\.[^\s@[\]]+$/.test(SUPPORT_EMAIL);

/** Published copies of docs/privacy.md and docs/terms.md (Notion). */
export const LEGAL_URLS = {
  privacy: 'https://ash-larch-a05.notion.site/Astropedia-Privacy-Policy-3f4a0161464a814984a9e0f6c63f8ab4',
  terms: 'https://ash-larch-a05.notion.site/Astropedia-Terms-of-Use-3f4a0161464a81c8a359c572ccd455e5',
} as const;
