import { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useAccent } from '@/hooks/use-accent';
import { useProfiles } from '@/hooks/use-profiles';
import { Icon } from '@/components/atoms/Icon';
import { EyebrowLabel } from '@/components/atoms/EyebrowLabel';
import { ScreenLayout } from '@/components/templates/ScreenLayout';
import { getLifeChapters } from '@/utils/astrology';
import { askLanguage, formatMonthYear, tAsk, tPlanet } from '@/utils/i18n';
import { phaseMeaning } from '@/utils/transits';
import { FONTS, RADIUS } from '@/constants/themes';

export default function LifePhaseScreen() {
  const { t }         = useTranslation('phase');
  const { theme }     = useAccent();
  const { profileId } = useLocalSearchParams<{ profileId: string }>();
  const { profiles }  = useProfiles();
  const profile       = profiles.find((p) => p.id === profileId);

  const life = useMemo(
    () => (profile?.birthDate ? getLifeChapters(profile) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [profile?.birthDate, profile?.birthTime, profile?.birthLng, profile?.birthTz],
  );

  if (!profile || !life) {
    router.back();
    return null;
  }

  const chapter   = life.chapters[life.currentIndex];
  const sub       = life.subs[life.currentSub];
  const pct       = Math.round(life.progress * 100);
  const yearsLeft = Math.max(0, Math.round((chapter.end.getTime() - Date.now()) / (365.25 * 864e5)));
  const isYou     = profile.isYou;
  const first     = profile.name.split(' ')[0];

  // Whole-life bar: each chapter sized by the part of it inside birth..untilAge.
  const birthMs = new Date(profile.birthDate + 'T00:00:00').getTime();
  const endMs   = birthMs + life.untilAge * 365.25 * 864e5;
  const segments = life.chapters.map((c, i) => ({
    key:  `${c.lord}-${i}`,
    grow: Math.max(0, Math.min(c.end.getTime(), endMs) - Math.max(c.start.getTime(), birthMs)),
    tone: i < life.currentIndex ? 'past' : i === life.currentIndex ? 'now' : 'future',
  }));
  const nowLeft = `${Math.min(100, Math.max(0, (life.ageNow / life.untilAge) * 100))}%` as const;

  // Sent in the app language when the model speaks it (tAsk), else English.
  const askSaga = () => {
    const lng = askLanguage();
    const q = tAsk(`phase:question.${isYou ? 'you' : 'other'}`, {
      name: first, planet: tPlanet(sub.lord, lng), date: formatMonthYear(sub.end, lng),
    });
    const tempId = 't_' + Math.random().toString(36).slice(2, 11);
    router.push(`/chat/${tempId}?profileId=${profile.id}&isNew=true&ask=${encodeURIComponent(q)}`);
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
        {/* Where you are */}
        <View style={styles.section}>
          <EyebrowLabel size={11}>{isYou ? t('eyebrow.you') : t('eyebrow.other', { name: first })}</EyebrowLabel>
          <Text style={[styles.title, { color: theme.ink }]}>
            {t(isYou ? 'title.you.before' : 'title.other.before', { name: first })}
            <Text style={[styles.titleItalic, { color: theme.accent }]}>{tPlanet(chapter.lord)}</Text>
            {t(isYou ? 'title.you.after' : 'title.other.after', { name: first })}
          </Text>
          <Text style={[styles.lead, { color: theme.ink2 }]}>{phaseMeaning(chapter.lord, 'chapter')}</Text>
          <View
            style={[styles.track, { backgroundColor: theme.hairline }]}
            accessibilityRole="progressbar"
            accessibilityValue={{ min: 0, max: 100, now: pct }}
          >
            <View style={[styles.fill, { width: `${pct}%`, backgroundColor: theme.accent }]} />
          </View>
          <View style={styles.trackLabels}>
            <Text style={[styles.small, { color: theme.muted }]}>{formatMonthYear(chapter.start)}</Text>
            <Text style={[styles.small, styles.smallMid, { color: theme.muted }]}>
              {t('progress', { pct, count: yearsLeft })}
            </Text>
            <Text style={[styles.small, { color: theme.muted }]}>{formatMonthYear(chapter.end)}</Text>
          </View>
        </View>

        {/* Right now */}
        <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.hairline }]}>
          <EyebrowLabel size={11}>{t('rightNow', { date: formatMonthYear(sub.end) })}</EyebrowLabel>
          <Text style={[styles.cardTitle, { color: theme.ink }]}>
            {tPlanet(sub.lord)} <Text style={styles.titleItalic}>{t('subPeriod')}</Text>
          </Text>
          <Text style={[styles.body, { color: theme.ink2 }]}>{phaseMeaning(sub.lord, 'sub')}</Text>
          <TouchableOpacity onPress={askSaga} style={styles.askLink} hitSlop={6}>
            <Text style={[styles.askText, { color: theme.accent }]}>
              {isYou ? t('ask.you') : t('ask.other', { name: first })}
            </Text>
          </TouchableOpacity>
        </View>

        {/* What's next */}
        <View>
          <EyebrowLabel size={11}>{t('next')}</EyebrowLabel>
          {life.upcoming.map(({ kind, period }) => (
            <View key={`${kind}-${period.lord}-${period.start.getTime()}`} style={[styles.row, { borderBottomColor: theme.hairline }]}>
              <Text style={[styles.rowDate, { color: theme.muted }]}>{formatMonthYear(period.start)}</Text>
              <View style={{ flex: 1 }}>
                <Text style={[styles.rowTitle, { color: theme.ink }]}>
                  {t(kind === 'chapter' ? 'kind.chapter' : 'kind.sub', { planet: tPlanet(period.lord) })}
                </Text>
                <Text style={[styles.rowSub, { color: theme.ink2 }]}>{phaseMeaning(period.lord, kind)}</Text>
              </View>
            </View>
          ))}
        </View>

        {/* Your whole life */}
        <View style={styles.section}>
          <EyebrowLabel size={11}>{isYou ? t('wholeLife.you') : t('wholeLife.other', { name: first })}</EyebrowLabel>
          <View style={styles.lifeBar}>
            <View style={styles.lifeSegments}>
              {segments.map((s) => (
                <View
                  key={s.key}
                  style={[
                    styles.lifeSeg,
                    {
                      flexGrow: s.grow,
                      backgroundColor:
                        s.tone === 'now' ? theme.accent : s.tone === 'past' ? theme.faint : theme.hairline2,
                    },
                  ]}
                />
              ))}
            </View>
            <View style={[styles.nowDot, { left: nowLeft, borderColor: theme.accent, backgroundColor: theme.bg }]} />
          </View>
          <View style={styles.trackLabels}>
            <Text style={[styles.small, { color: theme.muted }]}>{t('birth')}</Text>
            <Text style={[styles.small, styles.smallMid, { color: theme.muted }]}>
              {t(isYou ? 'chapters.you' : 'chapters.other', {
                count: life.chapters.length,
                name:  first,
                ord:   t(`ordinal.${life.currentIndex + 1}`, { defaultValue: String(life.currentIndex + 1) }),
              })}
            </Text>
            <Text style={[styles.small, { color: theme.muted }]}>{life.untilAge}</Text>
          </View>
        </View>
      </ScrollView>
    </ScreenLayout>
  );
}

const styles = StyleSheet.create({
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
    gap:               44,
  },
  section: { gap: 14 },
  title: {
    fontFamily:    FONTS.serifRegular,
    fontSize:      44,
    lineHeight:    46,
    letterSpacing: -0.5,
  },
  titleItalic: { fontFamily: FONTS.serifItalic },
  lead: {
    fontFamily: FONTS.sansRegular,
    fontSize:   16,
    lineHeight: 24,
  },
  track: {
    height:       4,
    borderRadius: 2,
    marginTop:    6,
    overflow:     'hidden',
  },
  fill: { height: 4, borderRadius: 2 },
  trackLabels: {
    flexDirection:  'row',
    justifyContent: 'space-between',
  },
  small: {
    fontFamily: FONTS.sansRegular,
    fontSize:   12.5,
  },
  smallMid: {
    flexShrink:        1,
    textAlign:         'center',
    paddingHorizontal: 6,
  },
  card: {
    borderRadius: RADIUS.card + 4,
    borderWidth:  StyleSheet.hairlineWidth,
    padding:      22,
    gap:          8,
  },
  cardTitle: {
    fontFamily: FONTS.serifRegular,
    fontSize:   26,
    lineHeight: 30,
  },
  body: {
    fontFamily: FONTS.sansRegular,
    fontSize:   15,
    lineHeight: 22,
  },
  askLink: {
    minHeight:      44,
    justifyContent: 'center',
    marginTop:      2,
  },
  askText: {
    fontFamily: FONTS.sansMedium,
    fontSize:   14.5,
  },
  row: {
    flexDirection:     'row',
    gap:               16,
    paddingVertical:   16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowDate: {
    width:      70,
    fontFamily: FONTS.sansRegular,
    fontSize:   13,
    lineHeight: 21,
  },
  rowTitle: {
    fontFamily:   FONTS.sansMedium,
    fontSize:     15.5,
    lineHeight:   21,
    marginBottom: 3,
  },
  rowSub: {
    fontFamily: FONTS.sansRegular,
    fontSize:   13.5,
    lineHeight: 19,
  },
  lifeBar: {
    height:         14,
    justifyContent: 'center',
  },
  lifeSegments: {
    flexDirection: 'row',
    gap:           3,
    height:        6,
  },
  lifeSeg: {
    flexBasis:    0,
    height:       6,
    borderRadius: 3,
  },
  nowDot: {
    position:     'absolute',
    width:        14,
    height:       14,
    marginLeft:   -7,
    borderRadius: 7,
    borderWidth:  3,
  },
});
