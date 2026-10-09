/**
 * "Report this answer" for AI-written chat replies (Google Play's AI-generated
 * content policy: an in-app way to flag offensive output).
 *
 * The app has no server, so nothing is sent automatically: the user's email
 * app opens a draft to SUPPORT_EMAIL (constants/support.ts) with the question,
 * the answer and app / model versions filled in — or, without a usable email
 * address or mail app, the share sheet with the same text. The user decides
 * whether to send it. The answer is then marked reported on this phone and
 * the chat hides it behind a notice (components/organisms/GuruChat.tsx).
 */
import { Linking, Platform, Share } from 'react-native';
import Constants from 'expo-constants';
import i18n from '@/utils/i18n';
import { SUPPORT_EMAIL, hasSupportEmail } from '@/constants/support';
import { Storage } from '@/utils/storage';

export type AnswerReportInput = {
  question: string;
  /** Plain text of the reply (markdown stripped). */
  answer: string;
  /** Guide's display name (Saga, Krishna…). */
  guide: string;
  /** Installed model version, or null when templates answered. */
  model: string | null;
};

export type AnswerReportContext = {
  appVersion: string;
  build: string;
  platform: string;
  language: string;
  date: string;
};

/** Mail clients cut very long mailto: bodies; the share sheet gets the whole answer. */
const MAILTO_ANSWER_MAX = 1500;

function clip(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max).trimEnd()}…` : s;
}

/** Subject and body of a report (pure; t = the i18next translate function). */
export function buildAnswerReport(
  r: AnswerReportInput,
  ctx: AnswerReportContext,
  t: (key: string) => string,
  answerMax = Infinity,
): { subject: string; body: string } {
  const lines = [
    t('chat:report.mailIntro'),
    '',
    t('chat:report.mailReason'),
    '',
    '',
    '———',
    `${t('chat:report.mailQuestion')}: ${r.question || '–'}`,
    '',
    `${t('chat:report.mailAnswer')}:`,
    clip(r.answer, answerMax),
    '———',
    `${t('chat:report.mailGuide')}: ${r.guide}`,
    `${t('chat:report.mailModel')}: ${r.model ?? t('chat:report.mailNoModel')}`,
    `App: ${ctx.appVersion} (${ctx.build}) · ${ctx.platform} · ${ctx.language} · ${ctx.date}`,
  ];
  return { subject: t('chat:report.mailSubject'), body: lines.join('\n') };
}

function context(): AnswerReportContext {
  const cfg = Constants.expoConfig;
  const build = Platform.OS === 'ios' ? cfg?.ios?.buildNumber : cfg?.android?.versionCode;
  return {
    appVersion: cfg?.version ?? '?',
    build: build != null ? String(build) : '–',
    platform: `${Platform.OS} ${String(Platform.Version ?? '')}`.trim(),
    language: i18n.language,
    date: new Date().toISOString().slice(0, 10),
  };
}

/**
 * Opens the email draft (or the share sheet). Resolves true when it opened
 * something the user can send from, false when they dismissed the share sheet.
 */
export async function sendAnswerReport(r: AnswerReportInput): Promise<boolean> {
  const t = (key: string) => i18n.t(key);
  const ctx = context();
  if (hasSupportEmail()) {
    const { subject, body } = buildAnswerReport(r, ctx, t, MAILTO_ANSWER_MAX);
    const url = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    try {
      await Linking.openURL(url);
      return true;
    } catch {
      // No mail app: the share sheet below.
    }
  }
  const { subject, body } = buildAnswerReport(r, ctx, t);
  const to = hasSupportEmail() ? `${t('chat:report.shareTo')} ${SUPPORT_EMAIL}\n\n` : '';
  try {
    const res = await Share.share({ title: subject, message: `${to}${body}` }, { subject });
    return res.action !== Share.dismissedAction;
  } catch {
    return false;
  }
}

export function isAnswerReported(messageId: string): boolean {
  return Storage.getAnswerReported(messageId) != null;
}

export function markAnswerReported(messageId: string): void {
  Storage.setAnswerReported(messageId, new Date().toISOString());
}
