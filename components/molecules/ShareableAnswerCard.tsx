import { forwardRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { FONTS } from '@/constants/themes';
import { indicLineHeight, useIndicStyles, useIsIndic } from '@/hooks/use-indic-styles';

export type AnswerCardLook = 'light' | 'dark';

type Props = {
  answer:       string;
  /** Omit (or pass empty) to hide the question line. */
  question?:    string;
  persona:      'saga' | 'krishna';
  profileName?: string;
  look:         AnswerCardLook;
  /** Display date, e.g. "Oct 3, 2026". */
  dateLabel:    string;
};

// The card has its own fixed palettes so the shared image looks the same
// regardless of the app's accent or dark-mode setting.
const LOOKS = {
  light: { bg: '#faf9f6', ink: '#1d1a14', muted: '#6f6a5e', accent: '#8f5f14', rule: 'rgba(29,26,20,0.10)' },
  dark:  { bg: '#1c1a16', ink: '#f1ede2', muted: '#9a9484', accent: '#e0ad5c', rule: 'rgba(241,237,226,0.14)' },
} as const;

/** Shrink the serif answer as it gets longer so the card stays one screen. */
function answerSize(text: string): { fontSize: number; lineHeight: number } {
  const n = text.length;
  if (n < 140) return { fontSize: 27, lineHeight: 32 };
  if (n < 280) return { fontSize: 23, lineHeight: 28 };
  if (n < 480) return { fontSize: 19.5, lineHeight: 25 };
  return { fontSize: 17, lineHeight: 22 };
}

/**
 * Image-style card for sharing a single chat answer. Rendered on screen in
 * the share modal and captured as-is via react-native-view-shot.
 */
export const ShareableAnswerCard = forwardRef<View, Props>(
  function ShareableAnswerCard({ answer, question, persona, profileName, look, dateLabel }, ref) {
    const styles = useIndicStyles(baseStyles);
    const { t }    = useTranslation('chat');
    const c        = LOOKS[look];
    const who      = persona === 'krishna' ? t('persona.krishna') : t('persona.saga');
    const indic    = useIsIndic();
    const base     = answerSize(answer);
    const size     = indic ? { ...base, lineHeight: indicLineHeight(base.fontSize, base.lineHeight) } : base;

    return (
      <View
        ref={ref}
        collapsable={false}
        style={[styles.card, { backgroundColor: c.bg, borderColor: c.rule }]}
      >
        <Text style={[styles.eyebrow, { color: c.muted }]} numberOfLines={1}>
          {profileName ? t('card.forName', { name: profileName.split(' ')[0] }) : ''}{dateLabel}
        </Text>

        <View style={styles.body}>
          {question ? (
            <Text style={[styles.question, { color: c.muted }]} numberOfLines={3}>
              “{question}”
            </Text>
          ) : null}
          <Text style={[styles.answer, size, { color: c.ink }]}>{answer}</Text>
        </View>

        <View style={[styles.footer, { borderTopColor: c.rule }]}>
          <Text style={[styles.brand, { color: c.ink }]}>
            {who} <Text style={{ color: c.muted }}>·</Text> Astropedia
          </Text>
          <Text style={[styles.footerTag, { color: c.accent }]}>
            {persona === 'krishna' ? t('card.krishnaTag') : t('card.sagaTag')}
          </Text>
        </View>
      </View>
    );
  },
);

const baseStyles = StyleSheet.create({
  card: {
    width:          '100%',
    minHeight:      340,
    borderRadius:   22,
    borderWidth:    StyleSheet.hairlineWidth,
    padding:        24,
    gap:            22,
    justifyContent: 'space-between',
  },
  eyebrow: {
    fontFamily:    FONTS.monoRegular,
    fontSize:      10,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
  },
  body: {
    gap: 14,
  },
  question: {
    fontFamily: FONTS.sansRegular,
    fontSize:   13,
    lineHeight: 18,
  },
  answer: {
    fontFamily: FONTS.serifRegular,
  },
  footer: {
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'space-between',
    gap:            12,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop:     12,
  },
  brand: {
    fontFamily: FONTS.serifItalic,
    fontSize:   17,
  },
  footerTag: {
    fontFamily:    FONTS.monoRegular,
    fontSize:      10,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
});
