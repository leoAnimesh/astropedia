'use no memo'; // renders call language helpers (tPlanet, intlLocale, ...) that the React Compiler would otherwise cache across language switches

import { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useAccent } from '@/hooks/use-accent';
import { useProfiles } from '@/hooks/use-profiles';
import { Icon } from '@/components/atoms/Icon';
import { EyebrowLabel } from '@/components/atoms/EyebrowLabel';
import { ScreenLayout } from '@/components/templates/ScreenLayout';
import { askLanguage, formatMonthYear, tAsk, tPlanet } from '@/utils/i18n';
import { getYearAhead, transitLabel, type ForecastMonth } from '@/utils/forecast';
import { FONTS, RADIUS } from '@/constants/themes';
import { useIndicStyles } from '@/hooks/use-indic-styles';

export default function ForecastScreen() {
  const styles = useIndicStyles(baseStyles);
  const { t, i18n }   = useTranslation('forecast');
  const { theme }     = useAccent();
  const { profileId } = useLocalSearchParams<{ profileId: string }>();
  const { profiles }  = useProfiles();
  const profile       = profiles.find((p) => p.id === profileId);

  const months = useMemo(
    () => (profile?.birthDate ? getYearAhead(profile) : null),
    // Month labels, tags and lines are translated inside getYearAhead.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [profile?.birthDate, profile?.birthTime, profile?.birthLng, profile?.birthTz, i18n.language],
  );

  if (!profile || !months) {
    router.back();
    return null;
  }

  const isYou = profile.isYou;
  const first = profile.name.split(' ')[0];
  const displayRange = `${formatMonthYear(months[0].start)} – ${formatMonthYear(months[months.length - 1].start)}`;
  const who = isYou ? 'you' : 'other';

  // Questions go out in the app language when the model speaks it (tAsk), else English.
  const ask = (q: string) => {
    const tempId = 't_' + Math.random().toString(36).slice(2, 11);
    router.push(`/chat/${tempId}?profileId=${profile.id}&isNew=true&ask=${encodeURIComponent(q)}`);
  };

  const askMonth = (m: ForecastMonth) => {
    const lng    = askLanguage();
    const change = m.changes[m.changes.length - 1];
    const what   = tAsk(`forecast:question.kind.${change.kind === 'chapter' ? 'chapter' : 'sub'}`, {
      planet: tPlanet(change.lord, lng),
    });
    ask(tAsk(`forecast:question.month.${who}`, { name: first, what, month: formatMonthYear(m.start, lng) }));
  };

  const askYear = () => {
    const lng   = askLanguage();
    const range = `${formatMonthYear(months[0].start, lng)} – ${formatMonthYear(months[months.length - 1].start, lng)}`;
    ask(tAsk(`forecast:question.year.${who}`, { name: first, range, planet: tPlanet(months[0].lord, lng) }));
  };

  return (
    <ScreenLayout edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={[styles.back, { borderColor: theme.hairline2 }]}
          accessibilityLabel={t('back')}
        >
          <Icon name="back" size={20} color={theme.ink} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.section}>
          <EyebrowLabel size={11}>{displayRange}</EyebrowLabel>
          <Text style={[styles.title, { color: theme.ink }]}>
            {t(isYou ? 'title.you.before' : 'title.other.before', { name: first })}
            <Text style={[styles.italic, { color: theme.accent }]}>{t('title.em')}</Text>
            {t('title.after')}
          </Text>
          <Text style={[styles.lead, { color: theme.ink2 }]}>{t(isYou ? 'lead.you' : 'lead.other')}</Text>
        </View>

        <View style={{ gap: 10 }}>
          {months.map((m) => {
            const inverse = m.isChange;
            const fg      = inverse ? theme.bg : theme.ink;
            const sub     = inverse ? theme.surface3 : theme.ink2;
            // Inverted cards flip between dark and cream with the theme, so
            // their labels use the card's own text colours, not the accent.
            const meta    = inverse ? sub : theme.muted;
            return (
              <View
                key={m.start.getTime()}
                style={[
                  styles.month,
                  inverse
                    ? { backgroundColor: theme.ink, borderColor: theme.ink }
                    : {
                        backgroundColor: theme.surface,
                        borderColor:     m.isCurrent ? theme.accent : theme.hairline,
                        borderWidth:     m.isCurrent ? 1.5 : StyleSheet.hairlineWidth,
                      },
                ]}
              >
                <View style={styles.monthDate}>
                  <Text style={[styles.mon, { color: inverse ? fg : m.isCurrent ? theme.accent : meta }]}>
                    {m.label.toUpperCase()}
                  </Text>
                  <Text style={[styles.year, { color: meta }]}>{m.year}</Text>
                </View>
                <View style={{ flex: 1, gap: 3 }}>
                  <Text style={[styles.tag, { color: fg }]}>
                    {m.isCurrent && !m.isChange ? t('now', { tag: m.tag }) : m.tag}
                  </Text>
                  <Text style={[styles.line, { color: sub }]}>{m.line}</Text>
                  {m.transits.length > 0 && (
                    <Text style={[styles.transit, { color: meta }]}>
                      {m.transits.map(transitLabel).join('  ·  ')}
                    </Text>
                  )}
                  {m.isChange && (
                    <TouchableOpacity onPress={() => askMonth(m)} style={styles.askInline} hitSlop={6}>
                      <Text style={[styles.askText, { color: fg, textDecorationLine: 'underline' }]}>
                        {t('askMonth', { month: m.label })}
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            );
          })}
        </View>

        <View style={{ gap: 4 }}>
          <Text style={[styles.note, { color: theme.muted }]}>
            {t('note')}
          </Text>
          <TouchableOpacity onPress={askYear} style={styles.askLink} hitSlop={6}>
            <Text style={[styles.askText, { color: theme.accent }]}>
              {isYou ? t('askYear.you') : t('askYear.other', { name: first })}
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </ScreenLayout>
  );
}

const baseStyles = StyleSheet.create({
  header: {
    paddingHorizontal: 22,
    paddingTop:        12,
    paddingBottom:     6,
  },
  back: {
    width:          44,
    height:         44,
    borderRadius:   22,
    borderWidth:    1,
    alignItems:     'center',
    justifyContent: 'center',
  },
  content: {
    paddingHorizontal: 26,
    paddingTop:        24,
    paddingBottom:     60,
    gap:               36,
  },
  section: { gap: 14 },
  title: {
    fontFamily:    FONTS.serifRegular,
    fontSize:      44,
    lineHeight:    46,
    letterSpacing: -0.5,
  },
  italic: { fontFamily: FONTS.serifItalic },
  lead: {
    fontFamily: FONTS.sansRegular,
    fontSize:   16,
    lineHeight: 24,
  },
  month: {
    flexDirection: 'row',
    gap:           16,
    borderRadius:  RADIUS.card,
    borderWidth:   StyleSheet.hairlineWidth,
    paddingHorizontal: 18,
    paddingVertical:   16,
  },
  monthDate: { width: 48, paddingTop: 1 },
  mon: {
    fontFamily:    FONTS.monoRegular,
    fontSize:      12,
    letterSpacing: 0.9,
  },
  year: {
    fontFamily: FONTS.monoRegular,
    fontSize:   10.5,
    marginTop:  2,
  },
  tag: {
    fontFamily: FONTS.sansMedium,
    fontSize:   15,
    lineHeight: 20,
  },
  line: {
    fontFamily: FONTS.sansRegular,
    fontSize:   13.5,
    lineHeight: 19,
  },
  transit: {
    fontFamily: FONTS.sansRegular,
    fontSize:   12,
    lineHeight: 17,
    marginTop:  3,
  },
  askInline: {
    minHeight:      44,
    justifyContent: 'center',
    marginBottom:   -10,
  },
  note: {
    fontFamily: FONTS.sansRegular,
    fontSize:   12.5,
    lineHeight: 18,
  },
  askLink: {
    minHeight:      44,
    justifyContent: 'center',
  },
  askText: {
    fontFamily: FONTS.sansMedium,
    fontSize:   14.5,
  },
});
