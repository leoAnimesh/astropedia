'use no memo'; // renders call language helpers (tPlanet, intlLocale, ...) that the React Compiler would otherwise cache across language switches

import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useAccent } from '@/hooks/use-accent';
import { useProfiles } from '@/hooks/use-profiles';
import { useIndicStyles } from '@/hooks/use-indic-styles';
import { Icon } from '@/components/atoms/Icon';
import { EyebrowLabel } from '@/components/atoms/EyebrowLabel';
import { ScreenLayout } from '@/components/templates/ScreenLayout';
import { FeatureHeader } from '@/components/molecules/FeatureHeader';
import { SegmentedControl } from '@/components/molecules/SegmentedControl';
import { DatePicker } from '@/components/molecules/DatePicker';
import { getSunTimes, moonriseAfter } from '@/utils/sun';
import {
  getAbhijit,
  getChoghadiya,
  getCurrentChoghadiya,
  getGulikaKaal,
  getRahuKaal,
  getYamaganda,
  type ChoghadiyaSlot,
} from '@/utils/choghadiya';
import { limbsAt, tithiName, YOGA_NAMES } from '@/utils/lunar';
import { getLuckyForDay } from '@/utils/lucky';
import { getVara, tKarana, tVara, tYoga } from '@/utils/panchang';
import { localizePlace } from '@/utils/place-names';
import { clockTime, rangeShort, rangeTime, sameDay } from '@/utils/clock';
import { intlLocale, localizeDigits, tNakshatra, tPlanet, tSign, tTithi, tWeekday, useAppLanguage } from '@/utils/i18n';
import { NAKSHATRAS, ZODIAC } from '@/constants/astrology';
import { FONTS, LIGHT_TOKENS, RADIUS } from '@/constants/themes';

/**
 * Location: the app has no device location, so — as before — times are for
 * the active profile's birth place (Delhi when it has none), shown in the
 * phone's time zone. Sunrise/sunset come from utils/sun.ts (NOAA), so the
 * choghadiya, Rahu Kaal and five limbs here match Drik Panchang to about a
 * minute for that place.
 */
export default function PanchangScreen() {
  const styles = useIndicStyles(baseStyles);
  const { theme } = useAccent();
  const { t } = useTranslation('panchang');
  const lang = useAppLanguage();
  const { profiles, activeProfile } = useProfiles();
  const profile = activeProfile ?? profiles[0] ?? null;
  const lat = profile?.birthLat ?? null;
  const lng = profile?.birthLng ?? null;

  // Re-render every 30 s for the "Right now" card and countdown.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(id);
  }, []);

  const [picked, setPicked] = useState<Date | null>(null);
  const [picking, setPicking] = useState(false);
  const day = picked ?? now;
  const isToday = sameDay(day, now);
  const dayKey = `${day.getFullYear()}-${day.getMonth()}-${day.getDate()}`;

  const data = useMemo(() => {
    const d = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 12);
    const sun = getSunTimes(d, lat, lng);
    return {
      sun,
      table: getChoghadiya(d, lat, lng),
      rahu: getRahuKaal(d, lat, lng),
      yama: getYamaganda(d, lat, lng),
      gulika: getGulikaKaal(d, lat, lng),
      abhijit: getAbhijit(d, lat, lng),
      moonrise: moonriseAfter(sun.sunrise, lat, lng, 24),
      limbs: limbsAt(new Date(sun.sunrise.getTime() + 60000)),
      vara: getVara(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dayKey, lat, lng]);

  const lucky = useMemo(
    () => getLuckyForDay(profile, new Date(day.getFullYear(), day.getMonth(), day.getDate(), 12)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dayKey, profile?.id, profile?.birthDate, profile?.birthTime, lat, lng, lang],
  );

  const current = isToday ? getCurrentChoghadiya(now, lat, lng) : null;
  const defaultHalf: 'day' | 'night' = current?.current.half ?? 'day';
  const [half, setHalf] = useState<'day' | 'night' | null>(null);
  const shownHalf = half ?? defaultHalf;

  const city = profile?.birthCity ? localizePlace(profile.birthCity, lang) : t('festivals:anyCity');
  const firstName = profile?.name.split(' ')[0] ?? '';
  const dateLabel = localizeDigits(day.toLocaleDateString(intlLocale(), { weekday: 'short', month: 'short', day: 'numeric' }));

  const cName = (s: ChoghadiyaSlot) => t(`choghadiya.name.${s.name}`);
  const minutesText = (ms: number) => {
    const m = Math.max(1, Math.round(ms / 60000));
    return m < 60 ? t('duration.min', { m }) : t('duration.hm', { h: Math.floor(m / 60), m: m % 60 });
  };

  // Rahu Kaal line for the Right-now card.
  let rahuTitle = '', rahuNote = '';
  if (isToday) {
    if (now < data.rahu.start) {
      rahuTitle = t('rahu.in', { time: minutesText(data.rahu.start.getTime() - now.getTime()) });
      rahuNote = t('rahu.inNote');
    } else if (now < data.rahu.end) {
      rahuTitle = t('rahu.now');
      rahuNote = t('rahu.nowNote', { end: clockTime(data.rahu.end) });
    } else {
      rahuTitle = t('rahu.over');
      rahuNote = t('rahu.overNote');
    }
  }

  const slots = shownHalf === 'day' ? data.table.day : data.table.night;
  const L = data.limbs;
  const nextTithi = tTithi(tithiName((L.tithi % 30) + 1));
  const until = (end: Date, next: string) =>
    sameDay(end, data.sun.sunrise)
      ? t('limbSub.until', { time: clockTime(end), next })
      : t('limbSub.untilTomorrow', { time: clockTime(end), next });
  const limbs = [
    { k: t('limb.tithi'), v: tTithi(tithiName(L.tithi)), s: until(L.tithiEnd, nextTithi) },
    { k: t('limb.nakshatra'), v: tNakshatra(NAKSHATRAS[L.nakshatra].name), s: t('limbSub.moonIn', { sign: tSign(ZODIAC[L.moonSign].name) }) },
    { k: t('limb.yoga'), v: tYoga(YOGA_NAMES[L.yoga]), s: until(L.yogaEnd, tYoga(YOGA_NAMES[(L.yoga + 1) % 27])) },
    { k: t('limb.karana'), v: tKarana(L.karana), s: until(L.karanaEnd, tKarana(L.nextKarana)) },
    { k: t('limb.vara'), v: tVara(data.vara.name), s: t('limbSub.vara', { weekday: tWeekday(data.vara.english), planet: tPlanet(data.vara.lord) }) },
    {
      k: t('limb.paksha'),
      v: t(`astro:paksha.${L.tithi <= 15 ? 'Shukla' : 'Krishna'}`),
      s: t(L.tithi <= 15 ? 'limbSub.shukla' : 'limbSub.krishna'),
    },
  ];

  const times = [
    { label: t('times.sun'), sub: city, time: `${clockTime(data.sun.sunrise)} · ${clockTime(data.sun.sunset)}` },
    { label: t('times.rahu'), sub: t('times.rahuSub'), time: rangeShort(data.rahu.start, data.rahu.end) },
    { label: t('times.yamaganda'), sub: t('times.yamagandaSub'), time: rangeShort(data.yama.start, data.yama.end) },
    { label: t('times.gulika'), sub: t('times.gulikaSub'), time: rangeShort(data.gulika.start, data.gulika.end) },
    { label: t('times.abhijit'), sub: t('times.abhijitSub'), time: rangeShort(data.abhijit.start, data.abhijit.end) },
    {
      label: t('times.moonrise'),
      sub: data.moonrise && !sameDay(data.moonrise, day)
        ? localizeDigits(data.moonrise.toLocaleDateString(intlLocale(), { month: 'short', day: 'numeric' }))
        : '',
      time: data.moonrise ? clockTime(data.moonrise) : t('times.moonriseNone'),
    },
  ];

  const pillColors = (q: ChoghadiyaSlot['quality']) =>
    q === 'good'
      ? { backgroundColor: theme.accentMuted, borderColor: 'transparent', color: LIGHT_TOKENS.ink2 }
      : q === 'okay'
        ? { backgroundColor: theme.surface2, borderColor: 'transparent', color: theme.ink2 }
        : { backgroundColor: 'transparent', borderColor: theme.hairline2, color: theme.ink2 };

  return (
    <ScreenLayout edges={['top', 'left', 'right']}>
      <FeatureHeader
        title={t('title')}
        subtitle={t('headerSub', { date: dateLabel, city })}
        backLabel={t('back')}
        right={{ icon: 'calendar', onPress: () => setPicking((v) => !v), label: t('pickDate') }}
      />

      <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {picking && (
          <View style={[styles.card, styles.pickCard, { backgroundColor: theme.surface, borderColor: theme.hairline }]}>
            <DatePicker
              value={day}
              onChange={(d) => { setPicked(sameDay(d, new Date()) ? null : d); setHalf(null); }}
              minimumDate={new Date(1950, 0, 1)}
              maximumDate={new Date(2099, 11, 31)}
            />
            {!isToday && (
              <Pressable onPress={() => { setPicked(null); setHalf(null); }} style={styles.todayLink} accessibilityRole="button">
                <Text style={[styles.todayLinkText, { color: theme.accent }]}>{t('backToToday')}</Text>
              </Pressable>
            )}
          </View>
        )}

        {/* Right now */}
        {current && (
          <View style={[styles.nowCard, { backgroundColor: theme.surface, borderColor: theme.hairline }]} accessibilityLabel={t('rightNow', { time: clockTime(now) })}>
            <View style={styles.nowTop}>
              <EyebrowLabel size={11}>{t('rightNow', { time: clockTime(now) })}</EyebrowLabel>
              <Text style={[styles.nowTitle, { color: theme.ink }]}>
                <Text style={styles.italic}>{cName(current.current)}</Text> {t('choghadiyaWord')}
              </Text>
              <Text style={[styles.nowDesc, { color: theme.ink2 }]}>
                {t(`nowDesc.${current.current.quality}`, {
                  end: clockTime(current.current.end),
                  next: current.next ? cName(current.next) : '',
                  nextStart: current.next ? clockTime(current.next.start) : '',
                })}
              </Text>
            </View>
            <View style={[styles.nowRahu, { backgroundColor: theme.surface2, borderTopColor: theme.hairline }]}>
              <Icon name="clock" size={18} color={theme.ink2} />
              <Text style={[styles.nowRahuText, { color: theme.ink }]}>
                <Text style={styles.bold}>{rahuTitle}</Text>
                {now < data.rahu.end ? ` · ${rangeTime(data.rahu.start, data.rahu.end)}` : ''}
                {'\n'}
                <Text style={{ color: theme.ink2 }}>{rahuNote}</Text>
              </Text>
            </View>
          </View>
        )}

        {/* Lucky */}
        <View style={styles.section}>
          <EyebrowLabel size={11}>{firstName ? t('luckyFor', { name: firstName }) : t('luckyToday')}</EyebrowLabel>
          <View style={styles.luckyRow}>
            <View style={[styles.luckyTile, { backgroundColor: theme.surface, borderColor: theme.hairline }]}>
              <View style={[styles.luckyIcon, { backgroundColor: lucky.colorHex, borderColor: theme.hairline2, borderWidth: 1 }]} />
              <View style={styles.luckyText}>
                <Text style={[styles.luckyLabel, { color: theme.ink2 }]}>{t('lucky.color')}</Text>
                <Text style={[styles.luckyValue, { color: theme.ink }]} numberOfLines={1}>{t(`common:lucky.color.${lucky.color}`)}</Text>
              </View>
            </View>
            <View style={[styles.luckyTile, { backgroundColor: theme.surface, borderColor: theme.hairline }]}>
              <View style={[styles.luckyIcon, { backgroundColor: theme.surface2 }]}>
                <Text style={[styles.luckyNum, { color: theme.accent }]}>{localizeDigits(String(lucky.number))}</Text>
              </View>
              <View style={styles.luckyText}>
                <Text style={[styles.luckyLabel, { color: theme.ink2 }]}>{t('lucky.number')}</Text>
                <Text style={[styles.luckyValue, { color: theme.ink }]}>{localizeDigits(String(lucky.number))}</Text>
              </View>
            </View>
            <View style={[styles.luckyTile, { backgroundColor: theme.surface, borderColor: theme.hairline }]}>
              <View style={[styles.luckyIcon, { backgroundColor: theme.surface2 }]}>
                <Icon name="clock" size={19} color={theme.accent} />
              </View>
              <View style={styles.luckyText}>
                <Text style={[styles.luckyLabel, { color: theme.ink2 }]}>{t('lucky.time')}</Text>
                <Text style={[styles.luckyValue, { color: theme.ink }]} numberOfLines={1} adjustsFontSizeToFit>{lucky.time ?? '—'}</Text>
              </View>
            </View>
          </View>
          <Text style={[styles.note, { color: theme.muted }]}>
            {t(`luckyNote.${lucky.basis}`, {
              weekday: tWeekday(data.vara.english),
              planet: tPlanet(lucky.ruler),
            })}
          </Text>
        </View>

        {/* Choghadiya */}
        <View style={styles.section}>
          <View style={styles.sectionHead}>
            <EyebrowLabel size={11}>{t('choghadiya.title')}</EyebrowLabel>
            <SegmentedControl<'day' | 'night'>
              size="small"
              accessibilityLabel={t('choghadiya.halfA11y')}
              value={shownHalf}
              onChange={setHalf}
              options={[{ key: 'day', label: t('choghadiya.day') }, { key: 'night', label: t('choghadiya.night') }]}
            />
          </View>
          <View style={[styles.listCard, { backgroundColor: theme.surface, borderColor: theme.hairline }]}>
            {slots.map((s, i) => {
              const isNow = !!current && current.current.start.getTime() === s.start.getTime();
              const pill = pillColors(s.quality);
              return (
                <View
                  key={`${s.half}-${i}`}
                  style={[
                    styles.slotRow,
                    i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.hairline },
                    isNow && { backgroundColor: theme.surface2 },
                  ]}
                  accessible
                  accessibilityLabel={`${rangeShort(s.start, s.end)}, ${cName(s)}, ${t(`choghadiya.quality.${s.quality}`)}${isNow ? ', ' + t('choghadiya.now') : ''}`}
                >
                  <Text style={[styles.slotTime, { color: theme.ink2 }]}>{rangeShort(s.start, s.end)}</Text>
                  <View style={styles.slotName}>
                    <Text style={[styles.slotNameText, { color: theme.ink }, isNow && styles.semibold]}>{cName(s)}</Text>
                    {isNow && (
                      <View style={[styles.nowBadge, { backgroundColor: theme.ink }]}>
                        <Text style={[styles.nowBadgeText, { color: theme.bg }]}>{t('choghadiya.now')}</Text>
                      </View>
                    )}
                  </View>
                  <View style={[styles.pill, { backgroundColor: pill.backgroundColor, borderColor: pill.borderColor }]}>
                    <Text style={[styles.pillText, { color: pill.color }]}>{t(`choghadiya.quality.${s.quality}`)}</Text>
                  </View>
                </View>
              );
            })}
          </View>
          <Text style={[styles.note, { color: theme.muted }]}>{t('choghadiya.note')}</Text>
        </View>

        {/* Times today */}
        <View style={styles.section}>
          <EyebrowLabel size={11}>{t('timesToday')}</EyebrowLabel>
          <View style={[styles.timesCard, { backgroundColor: theme.surface, borderColor: theme.hairline }]}>
            {times.map((row, i) => (
              <View key={row.label} style={[styles.timeRow, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.hairline }]}>
                <View style={styles.timeText}>
                  <Text style={[styles.timeLabel, { color: theme.ink }]}>{row.label}</Text>
                  {row.sub ? <Text style={[styles.timeSub, { color: theme.muted }]}>{row.sub}</Text> : null}
                </View>
                <Text style={[styles.timeValue, { color: theme.ink }]}>{row.time}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Five limbs */}
        <View style={styles.section}>
          <EyebrowLabel size={11}>{t('limbsTitle')}</EyebrowLabel>
          <View style={[styles.limbGrid, { backgroundColor: theme.surface, borderColor: theme.hairline }]}>
            {limbs.map((l, i) => (
              <View
                key={l.k}
                style={[
                  styles.limb,
                  i >= 2 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.hairline },
                  i % 2 === 1 && { borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: theme.hairline },
                ]}
              >
                <Text style={[styles.limbKey, { color: theme.muted }]}>{l.k}</Text>
                <Text style={[styles.limbValue, { color: theme.ink }]}>{l.v}</Text>
                <Text style={[styles.limbSub, { color: theme.ink2 }]}>{l.s}</Text>
              </View>
            ))}
          </View>
          <Text style={[styles.note, { color: theme.muted }]}>{t('atSunrise')} · {t('placeNote', { city })}</Text>
        </View>
      </ScrollView>
    </ScreenLayout>
  );
}

const baseStyles = StyleSheet.create({
  scroll:  { flex: 1 },
  content: { paddingHorizontal: 22, paddingTop: 18, paddingBottom: 40, gap: 22 },
  section: { gap: 10 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  card:    { borderRadius: RADIUS.card, borderWidth: StyleSheet.hairlineWidth },
  pickCard: { paddingVertical: 8, paddingHorizontal: 8 },
  todayLink: { alignSelf: 'center', paddingVertical: 10 },
  todayLinkText: { fontFamily: FONTS.sansMedium, fontSize: 14, lineHeight: 18 },

  nowCard:  { borderRadius: 22, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  nowTop:   { gap: 6, paddingVertical: 16, paddingHorizontal: 18 },
  nowTitle: { fontFamily: FONTS.serifRegular, fontSize: 26, lineHeight: 30 },
  italic:   { fontFamily: FONTS.serifItalic },
  nowDesc:  { fontFamily: FONTS.sansRegular, fontSize: 13.5, lineHeight: 19 },
  nowRahu:  {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 12, paddingHorizontal: 18, borderTopWidth: StyleSheet.hairlineWidth,
  },
  nowRahuText: { flex: 1, fontFamily: FONTS.sansRegular, fontSize: 13.5, lineHeight: 18 },
  bold: { fontFamily: FONTS.sansSemiBold },

  luckyRow:  { flexDirection: 'row', gap: 10 },
  luckyTile: { flex: 1, gap: 10, padding: 14, borderRadius: RADIUS.card, borderWidth: StyleSheet.hairlineWidth },
  luckyIcon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  luckyNum:  { fontFamily: FONTS.serifRegular, fontSize: 22, lineHeight: 26 },
  luckyText: { gap: 2 },
  luckyLabel: { fontFamily: FONTS.sansRegular, fontSize: 11.5, lineHeight: 15 },
  luckyValue: { fontFamily: FONTS.serifItalic, fontSize: 19, lineHeight: 22 },
  note: { fontFamily: FONTS.sansRegular, fontSize: 12, lineHeight: 17 },

  listCard: { borderRadius: RADIUS.card, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  slotRow:  { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52, paddingHorizontal: 16 },
  slotTime: { width: 104, fontFamily: FONTS.monoRegular, fontSize: 12, lineHeight: 16 },
  slotName: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  slotNameText: { fontFamily: FONTS.sansRegular, fontSize: 15, lineHeight: 20 },
  semibold: { fontFamily: FONTS.sansSemiBold },
  nowBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: RADIUS.pill },
  nowBadgeText: { fontFamily: FONTS.monoRegular, fontSize: 9.5, lineHeight: 12, letterSpacing: 0.9 },
  pill: { minWidth: 58, alignItems: 'center', paddingHorizontal: 10, paddingVertical: 4, borderRadius: RADIUS.pill, borderWidth: 1 },
  pillText: { fontFamily: FONTS.sansMedium, fontSize: 12, lineHeight: 16 },

  timesCard: { borderRadius: RADIUS.card, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 18, paddingVertical: 4 },
  timeRow:   { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13 },
  timeText:  { flex: 1, gap: 2 },
  timeLabel: { fontFamily: FONTS.sansRegular, fontSize: 14.5, lineHeight: 19 },
  timeSub:   { fontFamily: FONTS.sansRegular, fontSize: 12, lineHeight: 16 },
  timeValue: { fontFamily: FONTS.monoRegular, fontSize: 12.5, lineHeight: 16 },

  limbGrid:  { flexDirection: 'row', flexWrap: 'wrap', borderRadius: RADIUS.card, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  limb:      { width: '50%', gap: 2, paddingVertical: 12, paddingHorizontal: 16 },
  limbKey:   { fontFamily: FONTS.sansRegular, fontSize: 11, lineHeight: 15 },
  limbValue: { fontFamily: FONTS.sansMedium, fontSize: 14, lineHeight: 19 },
  limbSub:   { fontFamily: FONTS.sansRegular, fontSize: 11.5, lineHeight: 16 },
});
