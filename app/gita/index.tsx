'use no memo'; // renders call language helpers (tPlanet, intlLocale, ...) that the React Compiler would otherwise cache across language switches

import { useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useAccent } from '@/hooks/use-accent';
import { useProfiles } from '@/hooks/use-profiles';
import { useIndicStyles } from '@/hooks/use-indic-styles';
import { Icon } from '@/components/atoms/Icon';
import { EyebrowLabel } from '@/components/atoms/EyebrowLabel';
import { ScreenLayout } from '@/components/templates/ScreenLayout';
import { FeatureHeader } from '@/components/molecules/FeatureHeader';
import { getEarlierVerses, getVerseOfDay, verseText } from '@/utils/gita-daily';
import { getSadeSati } from '@/utils/sade-sati';
import { getDashaTimeline, getMoonLongitudeExact } from '@/utils/astrology';
import { askLanguage, intlLocale, localizeDigits, tAsk, useAppLanguage } from '@/utils/i18n';
import { openGuruChat } from '@/utils/guru-nav';
import { sameDay } from '@/utils/clock';
import { FONTS, RADIUS } from '@/constants/themes';

/**
 * Bhagavad Gita verse of the day (utils/gita-daily.ts): Sanskrit, IAST
 * transliteration, the translation in the app language, a short
 * "For your day" reflection (never a prediction), a way into the Krishna
 * chat, and the verses of the last three days.
 */
export default function GitaScreen() {
  const styles = useIndicStyles(baseStyles);
  const { theme } = useAccent();
  const { t } = useTranslation('gita');
  const lang = useAppLanguage();
  const { profiles, activeProfile } = useProfiles();
  const profile = activeProfile ?? profiles[0] ?? null;
  const scrollRef = useRef<ScrollView>(null);

  const today = new Date();
  const [viewing, setViewing] = useState<Date>(today);
  const verse = getVerseOfDay(viewing);
  const earlier = getEarlierVerses(today, 3);
  const isToday = sameDay(viewing, today);

  // "Things may feel slow": sade sati running, or a Saturn chapter / stretch.
  const slow = useMemo(() => {
    if (!profile?.birthDate) return false;
    try {
      if (getSadeSati(profile, new Date()).phase) return true;
      const moon = getMoonLongitudeExact(profile.birthDate, profile.birthTime, profile.birthLng, profile.birthTz);
      const tl = getDashaTimeline(moon, profile.birthDate, new Date());
      return tl.maha.lord === 'Saturn' || tl.antar.lord === 'Saturn';
    } catch {
      return false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id, profile?.birthDate, profile?.birthTime, profile?.birthLng, profile?.birthTz]);

  const dateLabel = localizeDigits(viewing.toLocaleDateString(intlLocale(), { weekday: 'short', month: 'short', day: 'numeric' }));
  const text = verseText(verse, lang);
  const note = (slow && isToday ? t('slowPrefix') + ' ' : '') + t(`note.${verse.theme}`);

  const talk = () => {
    const ask = askLanguage();
    const q = tAsk('gita:question', { ref: verse.ref, text: verseText(verse, ask) });
    openGuruChat('krishna', null, q);
  };

  const share = () => {
    Share.share({ message: `“${text}”\n— ${t('ref', { chapter: verse.chapter, verse: verse.verse })}` }).catch(() => {});
  };

  const when = (d: Date) => d.toLocaleDateString(intlLocale(), { weekday: 'long' });

  return (
    <ScreenLayout edges={['top', 'left', 'right']}>
      <FeatureHeader title={t('title')} subtitle={t('subtitle', { date: dateLabel })} backLabel={t('back')} />
      <ScrollView ref={scrollRef} style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={[styles.article, { backgroundColor: theme.surface, borderColor: theme.hairline }]}>
          <View style={styles.refRow}>
            <View style={[styles.lotus, { backgroundColor: theme.surface2 }]}>
              <Icon name="lotus" size={19} color={theme.accent} />
            </View>
            <EyebrowLabel size={11}>{t('ref', { chapter: verse.chapter, verse: verse.verse })}</EyebrowLabel>
          </View>
          {verse.sanskrit ? (
            <Text style={[styles.sanskrit, { color: theme.ink }]}>{verse.sanskrit}</Text>
          ) : null}
          {verse.transliteration ? (
            <Text style={[styles.translit, { color: theme.muted }]} accessibilityLabel={`${t('transliterationA11y')}: ${verse.transliteration}`}>
              {verse.transliteration.replace(/\n/g, ', ')}
            </Text>
          ) : null}
          <View style={[styles.rule, { backgroundColor: theme.hairline }]} />
          <Text style={[styles.translation, { color: theme.ink }]}>“{text}”</Text>
          <View style={styles.actions}>
            <Pressable onPress={share} accessibilityRole="button" style={styles.action} hitSlop={4}>
              <Icon name="share" size={14} color={theme.muted} />
              <Text style={[styles.actionText, { color: theme.muted }]}>{t('common:share')}</Text>
            </Pressable>
          </View>
        </View>

        <View style={[styles.forDay, { backgroundColor: theme.surface2 }]}>
          <EyebrowLabel size={11}>{t('forYourDay')}</EyebrowLabel>
          <Text style={[styles.forDayText, { color: theme.ink }]}>{note}</Text>
          <Text style={[styles.small, { color: theme.muted }]}>{t('reflectNote')}</Text>
        </View>

        <Pressable
          onPress={talk}
          accessibilityRole="button"
          style={({ pressed }) => [styles.cta, { backgroundColor: theme.ink, opacity: pressed ? 0.85 : 1 }]}
        >
          <Icon name="lotus" size={18} color={theme.bg} />
          <Text style={[styles.ctaText, { color: theme.bg }]}>{t('talk')}</Text>
        </Pressable>

        <View style={styles.section}>
          <EyebrowLabel size={11}>{t('earlier')}</EyebrowLabel>
          <View style={[styles.listCard, { backgroundColor: theme.surface, borderColor: theme.hairline }]}>
            {(isToday ? earlier : [{ date: today, verse: getVerseOfDay(today) }, ...earlier.filter((e) => !sameDay(e.date, viewing))]).map((e, i) => (
              <Pressable
                key={e.date.toDateString()}
                onPress={() => { setViewing(e.date); scrollRef.current?.scrollTo({ y: 0, animated: true }); }}
                accessibilityRole="button"
                accessibilityLabel={t('earlierA11y', { ref: e.verse.ref, when: when(e.date) })}
                style={({ pressed }) => [styles.earlierRow, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.hairline }, { opacity: pressed ? 0.7 : 1 }]}
              >
                <Text style={[styles.earlierRef, { color: theme.muted }]}>{localizeDigits(e.verse.ref)}</Text>
                <View style={styles.earlierText}>
                  <Text style={[styles.earlierLine, { color: theme.ink }]} numberOfLines={3}>“{verseText(e.verse, lang)}”</Text>
                  <Text style={[styles.small, { color: theme.muted }]}>{sameDay(e.date, today) ? t('common:today') : when(e.date)}</Text>
                </View>
              </Pressable>
            ))}
          </View>
        </View>
      </ScrollView>
    </ScreenLayout>
  );
}

const baseStyles = StyleSheet.create({
  scroll:  { flex: 1 },
  content: { paddingHorizontal: 22, paddingTop: 22, paddingBottom: 40, gap: 22 },
  section: { gap: 10 },

  article: { gap: 16, paddingVertical: 22, paddingHorizontal: 20, borderRadius: 22, borderWidth: StyleSheet.hairlineWidth },
  refRow:  { flexDirection: 'row', alignItems: 'center', gap: 10 },
  lotus:   { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  sanskrit: { fontSize: 18, lineHeight: 32 },
  translit: { fontFamily: FONTS.sansRegular, fontStyle: 'italic', fontSize: 13, lineHeight: 19 },
  rule:     { height: StyleSheet.hairlineWidth },
  translation: { fontFamily: FONTS.serifRegular, fontSize: 25, lineHeight: 31 },
  actions:  { flexDirection: 'row', gap: 4, marginTop: -4, marginBottom: -8, marginLeft: -8 },
  action:   { flexDirection: 'row', alignItems: 'center', gap: 5, minHeight: 40, paddingHorizontal: 8 },
  actionText: { fontFamily: FONTS.monoRegular, fontSize: 10.5, lineHeight: 14, letterSpacing: 0.8, textTransform: 'uppercase' },

  forDay:     { gap: 8, paddingVertical: 16, paddingHorizontal: 18, borderRadius: RADIUS.card },
  forDayText: { fontFamily: FONTS.sansRegular, fontSize: 14.5, lineHeight: 21 },
  small:      { fontFamily: FONTS.sansRegular, fontSize: 12, lineHeight: 16 },

  cta:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, height: 52, borderRadius: RADIUS.pill },
  ctaText: { fontFamily: FONTS.sansMedium, fontSize: 15.5, lineHeight: 20 },

  listCard:    { borderRadius: RADIUS.card, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  earlierRow:  { flexDirection: 'row', gap: 14, alignItems: 'flex-start', paddingVertical: 14, paddingHorizontal: 16 },
  earlierRef:  { width: 44, fontFamily: FONTS.monoRegular, fontSize: 11, lineHeight: 20 },
  earlierText: { flex: 1, gap: 2 },
  earlierLine: { fontFamily: FONTS.serifRegular, fontSize: 18, lineHeight: 23 },
});
