'use no memo'; // renders call language helpers (tPlanet, intlLocale, ...) that the React Compiler would otherwise cache across language switches

import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import Animated, { useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';
import { useTranslation } from 'react-i18next';
import { useAccent } from '@/hooks/use-accent';
import { useProfiles } from '@/hooks/use-profiles';
import { useIndicStyles } from '@/hooks/use-indic-styles';
import { Icon } from '@/components/atoms/Icon';
import { Chip } from '@/components/atoms/Chip';
import { Toggle } from '@/components/atoms/Toggle';
import { EyebrowLabel } from '@/components/atoms/EyebrowLabel';
import { ScreenLayout } from '@/components/templates/ScreenLayout';
import { FeatureHeader } from '@/components/molecules/FeatureHeader';
import { festivalDate, getFestivals, getFestivalsInMonth, type FestivalEvent, type FestivalKind } from '@/utils/festivals';
import { ensureNotificationPermission, scheduleFestivalReminders } from '@/utils/notifications';
import { Storage } from '@/utils/storage';
import { localizePlace } from '@/utils/place-names';
import { sameDay } from '@/utils/clock';
import { intlLocale, localizeDigits, tTithi, useAppLanguage } from '@/utils/i18n';
import { FONTS, RADIUS } from '@/constants/themes';

type Filter = 'all' | FestivalKind;

const TITHI_SHORT = [
  'Pratipada', 'Dwitiya', 'Tritiya', 'Chaturthi', 'Panchami', 'Shashthi', 'Saptami', 'Ashtami',
  'Navami', 'Dashami', 'Ekadashi', 'Dwadashi', 'Trayodashi', 'Chaturdashi', 'Purnima',
];

const UPCOMING_DAYS = 75;

const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Notification deep link: ?focus=<festival id>&date=<yyyy-mm-dd>. Ids end in their date. */
function parseFocus(focus?: string, date?: string): { id: string | null; ruleId: string | null; day: Date | null } {
  const id = typeof focus === 'string' && focus ? focus : null;
  const idDate = id ? id.match(/-(\d{4}-\d{2}-\d{2})$/)?.[1] : undefined;
  const m = ISO_RE.exec(typeof date === 'string' ? date : '') ?? (idDate ? ISO_RE.exec(idDate) : null);
  const day = m ? new Date(+m[1], +m[2] - 1, +m[3], 12) : null;
  return { id, ruleId: id && idDate ? id.slice(0, id.length - idDate.length - 1) : id, day: day && !isNaN(day.getTime()) ? day : null };
}

/** Brief accent wash over its parent, fading out; marks the festival a notification pointed at. */
function Flash({ color, radius = 14 }: { color: string; radius?: number }) {
  const o = useSharedValue(0.3);
  useEffect(() => { o.value = withDelay(400, withTiming(0, { duration: 1600 })); }, [o]);
  const style = useAnimatedStyle(() => ({ opacity: o.value }));
  return <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: color, borderRadius: radius }, style]} />;
}

/**
 * Festival & vrat calendar. Dates come from utils/festivals.ts for the active
 * profile's birth place (Delhi without one), purnimanta month names; every
 * rule-derived date is approximate and the screen says so.
 */
export default function FestivalsScreen() {
  const styles = useIndicStyles(baseStyles);
  const { theme } = useAccent();
  const { t } = useTranslation('festivals');
  const lang = useAppLanguage();
  const { profiles, activeProfile } = useProfiles();
  const profile = activeProfile ?? profiles[0] ?? null;
  const lat = profile?.birthLat ?? null;
  const lng = profile?.birthLng ?? null;

  const params = useLocalSearchParams<{ focus?: string; date?: string }>();
  const focus = useMemo(() => parseFocus(params.focus, params.date), [params.focus, params.date]);

  const today = new Date();
  // A notification tap opens straight on the festival's month and day.
  const [month, setMonth] = useState(() => {
    const d = focus.day ?? today;
    return new Date(d.getFullYear(), d.getMonth(), 1, 12);
  });
  const [selected, setSelected] = useState<Date>(() => focus.day ?? new Date(today.getFullYear(), today.getMonth(), today.getDate(), 12));
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  const detailY = useRef<number | null>(null);
  const scrolled = useRef(false);
  const [filter, setFilter] = useState<Filter>('all');
  const [, setVersion] = useState(0);
  const [denied, setDenied] = useState(false);

  const monthKey = `${month.getFullYear()}-${month.getMonth()}`;
  const monthEvents = useMemo(
    () => getFestivalsInMonth(month.getFullYear(), month.getMonth() + 1, { lat, lng }),
    [monthKey, lat, lng], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const todayKey = `${today.getFullYear()}-${today.getMonth()}-${today.getDate()}`;
  const upcomingAll = useMemo(
    () => getFestivals(today, new Date(today.getTime() + UPCOMING_DAYS * 86400000), { lat, lng }),
    [todayKey, lat, lng], // eslint-disable-line react-hooks/exhaustive-deps
  );

  // Resolve the festival once its month is computed: exact id, else the same
  // festival on a nearby day (dates shift with birth place), else just the date.
  const focusKey = `${focus.id}|${focus.day?.getTime()}`;
  useEffect(() => {
    if (!focus.id && !focus.day) return;
    scrolled.current = false;
    if (focus.day) setMonth(new Date(focus.day.getFullYear(), focus.day.getMonth(), 1, 12));
    const hit = monthEvents.find((e) => e.id === focus.id)
      ?? monthEvents.find((e) => e.ruleId === focus.ruleId && (!focus.day || Math.abs(festivalDate(e).getTime() - focus.day.getTime()) <= 3 * 86400000));
    if (hit) {
      const d = festivalDate(hit);
      setSelected(new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12));
      setHighlightId(hit.id);
    } else {
      setHighlightId(null);
    }
    const t = setTimeout(() => setHighlightId(null), 2600);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusKey]);
  const scrollToDetail = () => {
    if (scrolled.current || detailY.current == null || !(focus.id || focus.day)) return;
    scrolled.current = true;
    scrollRef.current?.scrollTo({ y: Math.max(0, detailY.current - 12), animated: true });
  };

  const city = profile?.birthCity ? localizePlace(profile.birthCity, lang) : t('anyCity');
  const byDay = new Map<number, FestivalEvent[]>();
  for (const e of monthEvents) {
    const d = festivalDate(e).getDate();
    byDay.set(d, [...(byDay.get(d) ?? []), e]);
  }

  // Calendar grid, Sunday first.
  const firstWeekday = new Date(month.getFullYear(), month.getMonth(), 1).getDay();
  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const cells: (number | null)[] = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7) cells.push(null);
  const weekdays = Array.from({ length: 7 }, (_, i) =>
    new Date(2026, 0, 4 + i).toLocaleDateString(intlLocale(), { weekday: 'short' }));

  const monthTitle = month.toLocaleDateString(intlLocale(), { month: 'long' });
  const yearTitle = localizeDigits(String(month.getFullYear()));
  const selectedEvents = selected.getMonth() === month.getMonth() && selected.getFullYear() === month.getFullYear()
    ? byDay.get(selected.getDate()) ?? []
    : [];

  const shortDate = (d: Date) => localizeDigits(d.toLocaleDateString(intlLocale(), { month: 'short', day: 'numeric' }));
  const isVratKind = (k: FestivalKind) => k !== 'festival';
  const nameOf = (e: FestivalEvent) => t(e.nameKey);
  const remindOn = (e: FestivalEvent) => Storage.getFestivalRemind(e.id) ?? false;
  const lunarLine = (e: FestivalEvent) => {
    if (!e.lunar) return null;
    const month = t(`month.${e.lunar.purnimantaMonth}`);
    const tithiName = e.lunar.paksha === 'Krishna' && e.lunar.tithi === 15 ? 'Amavasya' : TITHI_SHORT[e.lunar.tithi - 1];
    return t('lunarDate', {
      month: e.lunar.adhika ? t('adhika', { month }) : month,
      paksha: t(`astro:paksha.${e.lunar.paksha}`),
      tithi: tTithi(tithiName),
    });
  };

  const setRemind = async (e: FestivalEvent, on: boolean) => {
    Storage.setFestivalRemind(e.id, on);
    setVersion((v) => v + 1);
    if (on) {
      const ok = await ensureNotificationPermission();
      setDenied(!ok);
      if (!ok) return;
    }
    try { await scheduleFestivalReminders(); } catch { /* scheduling is best-effort */ }
  };

  const shiftMonth = (n: number) => {
    const m = new Date(month.getFullYear(), month.getMonth() + n, 1, 12);
    setMonth(m);
    setSelected(sameDay(new Date(m.getFullYear(), m.getMonth(), 1), new Date(today.getFullYear(), today.getMonth(), 1))
      ? new Date(today.getFullYear(), today.getMonth(), today.getDate(), 12)
      : m);
  };

  const upcoming = upcomingAll.filter((e) => filter === 'all' || e.kind === filter);

  return (
    <ScreenLayout edges={['top', 'left', 'right']}>
      <FeatureHeader title={t('title')} subtitle={t('eyebrow', { city })} backLabel={t('back')} />
      <ScrollView ref={scrollRef} style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Month grid */}
        <View style={styles.section}>
          <View style={styles.monthHead}>
            <Text style={[styles.monthTitle, { color: theme.ink }]} accessibilityRole="header">
              {monthTitle} <Text style={[styles.italic, { color: theme.accent }]}>{yearTitle}</Text>
            </Text>
            <View style={styles.monthNav}>
              <Pressable onPress={() => shiftMonth(-1)} hitSlop={6} accessibilityRole="button" accessibilityLabel={t('prevMonth')} style={styles.navBtn}>
                <Icon name="back" size={20} color={theme.ink2} />
              </Pressable>
              <Pressable onPress={() => shiftMonth(1)} hitSlop={6} accessibilityRole="button" accessibilityLabel={t('nextMonth')} style={styles.navBtn}>
                <Icon name="chevron" size={20} color={theme.ink2} />
              </Pressable>
            </View>
          </View>
          <View style={styles.grid}>
            {weekdays.map((w, i) => (
              <Text key={`w${i}`} style={[styles.weekday, { color: theme.muted }]} numberOfLines={1}>{w}</Text>
            ))}
            {cells.map((n, i) => {
              if (n == null) return <View key={`b${i}`} style={styles.cell} />;
              const date = new Date(month.getFullYear(), month.getMonth(), n, 12);
              const evs = byDay.get(n) ?? [];
              const fest = evs.some((e) => e.kind === 'festival');
              const vrat = !fest && evs.some((e) => isVratKind(e.kind));
              const sel = sameDay(date, selected);
              const isToday = sameDay(date, today);
              const past = date < new Date(today.getFullYear(), today.getMonth(), today.getDate());
              const label = evs.length
                ? t('dayEventA11y', { date: shortDate(date), name: evs.map(nameOf).join(', ') })
                : t('dayA11y', { date: shortDate(date) });
              return (
                <Pressable
                  key={`d${n}`}
                  onPress={() => setSelected(date)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: sel }}
                  accessibilityLabel={isToday ? `${label}, ${t('todayA11y')}` : label}
                  style={[
                    styles.cell,
                    styles.dayCell,
                    { backgroundColor: sel ? theme.ink : 'transparent', borderColor: isToday && !sel ? theme.ink : 'transparent' },
                  ]}
                >
                  <Text style={[styles.dayNum, { color: sel ? theme.bg : past ? theme.muted : theme.ink }, (isToday || sel) && styles.semibold]}>
                    {localizeDigits(String(n))}
                  </Text>
                  <View
                    style={[
                      styles.cellDot,
                      fest && { backgroundColor: sel ? theme.bg : theme.accent },
                      vrat && { borderWidth: 1.5, borderColor: sel ? theme.bg : theme.ink2 },
                    ]}
                  />
                </Pressable>
              );
            })}
          </View>
          <View style={styles.legend}>
            <View style={styles.legendItem}><View style={[styles.cellDot, { backgroundColor: theme.accent }]} /><Text style={[styles.legendText, { color: theme.ink2 }]}>{t('legend.festival')}</Text></View>
            <View style={styles.legendItem}><View style={[styles.cellDot, { borderWidth: 1.5, borderColor: theme.ink2 }]} /><Text style={[styles.legendText, { color: theme.ink2 }]}>{t('legend.vrat')}</Text></View>
            <View style={styles.legendItem}><View style={[styles.todayKey, { borderColor: theme.ink }]} /><Text style={[styles.legendText, { color: theme.ink2 }]}>{t('legend.today')}</Text></View>
          </View>
        </View>

        {/* Selected day */}
        <View
          onLayout={(ev) => { detailY.current = ev.nativeEvent.layout.y; scrollToDetail(); }}
          style={[styles.detail, { backgroundColor: theme.surface, borderColor: theme.hairline }]}
        >
          {selectedEvents.length === 0 ? (
            <>
              <EyebrowLabel size={11}>{shortDate(selected)}</EyebrowLabel>
              <Text style={[styles.about, { color: theme.ink2 }]}>{t('noneThisDay')}</Text>
            </>
          ) : selectedEvents.map((e, i) => {
            const day = festivalDate(e);
            const remindAt = new Date(day.getFullYear(), day.getMonth(), day.getDate() - 1, 8);
            const past = remindAt.getTime() <= today.getTime();
            const lunar = lunarLine(e);
            return (
              <View key={e.id} style={[styles.detailItem, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.hairline, paddingTop: 14 }]}>
                {highlightId === e.id && <Flash color={theme.accent} />}
                <EyebrowLabel size={11}>
                  {`${shortDate(day)} · ${t(`kind.${e.kind}`)}${e.region !== 'all' ? ' · ' + t(`region.${e.region}`) : ''}`}
                </EyebrowLabel>
                <Text style={[styles.detailName, { color: theme.ink }]}>{nameOf(e)}</Text>
                {lunar ? <Text style={[styles.lunar, { color: theme.muted }]}>{lunar}</Text> : null}
                <Text style={[styles.about, { color: theme.ink2 }]}>{t(e.aboutKey)}</Text>
                <View style={[styles.remindRow, { borderTopColor: theme.hairline }]}>
                  <Toggle
                    value={remindOn(e)}
                    onValueChange={(v) => setRemind(e, v)}
                    label={t('remind')}
                    sublabel={past ? t('remindPast') : t('remindAt', { date: shortDate(remindAt) })}
                    disabled={past}
                    style={styles.toggle}
                  />
                </View>
              </View>
            );
          })}
          {denied && <Text style={[styles.lunar, { color: theme.muted }]}>{t('remindDenied')}</Text>}
        </View>

        {/* Coming up */}
        <View style={styles.section}>
          <EyebrowLabel size={11}>{t('comingUp')}</EyebrowLabel>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
            {(['all', 'festival', 'vrat', 'ekadashi'] as Filter[]).map((f) => (
              <Chip key={f} label={t(`filter.${f}`)} active={filter === f} onPress={() => setFilter(f)} />
            ))}
          </ScrollView>
          <View style={[styles.listCard, { backgroundColor: theme.surface, borderColor: theme.hairline }]}>
            {upcoming.length === 0 && <Text style={[styles.about, styles.empty, { color: theme.muted }]}>{t('nothing')}</Text>}
            {upcoming.map((e, i) => {
              const d = festivalDate(e);
              const on = remindOn(e);
              return (
                <Pressable
                  key={e.id}
                  onPress={() => { setMonth(new Date(d.getFullYear(), d.getMonth(), 1, 12)); setSelected(new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12)); }}
                  accessibilityRole="button"
                  style={({ pressed }) => [styles.upRow, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.hairline }, { opacity: pressed ? 0.7 : 1 }]}
                >
                  <View style={styles.upDate}>
                    <EyebrowLabel size={10.5}>{d.toLocaleDateString(intlLocale(), { month: 'short' })}</EyebrowLabel>
                    <Text style={[styles.upDay, { color: theme.ink }]}>{localizeDigits(String(d.getDate()))}</Text>
                  </View>
                  <View style={styles.upText}>
                    <Text style={[styles.upName, { color: theme.ink }]}>{nameOf(e)}</Text>
                    <Text style={[styles.upSub, { color: theme.ink2 }]}>
                      {`${t(`kind.${e.kind}`)} · ${t(e.kind === 'ekadashi' ? 'short.ekadashi' : `short.${e.ruleId}`)}`}
                    </Text>
                  </View>
                  {on && <Icon name="bell" size={16} color={theme.accent} />}
                  {highlightId === e.id && <Flash color={theme.accent} radius={0} />}
                </Pressable>
              );
            })}
          </View>
          <Text style={[styles.note, { color: theme.muted }]}>{t('approxNote', { city })}</Text>
        </View>
      </ScrollView>
    </ScreenLayout>
  );
}

const baseStyles = StyleSheet.create({
  scroll:  { flex: 1 },
  content: { paddingHorizontal: 22, paddingTop: 18, paddingBottom: 40, gap: 22 },
  section: { gap: 10 },
  semibold: { fontFamily: FONTS.sansSemiBold },
  italic:  { fontFamily: FONTS.serifItalic },

  monthHead:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  monthTitle: { fontFamily: FONTS.serifRegular, fontSize: 30, lineHeight: 34 },
  monthNav:   { flexDirection: 'row', gap: 4 },
  navBtn:     { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  grid:       { flexDirection: 'row', flexWrap: 'wrap' },
  weekday:    {
    width: `${100 / 7}%`, textAlign: 'center', paddingVertical: 6,
    fontFamily: FONTS.monoRegular, fontSize: 10, lineHeight: 13, letterSpacing: 0.6, textTransform: 'uppercase',
  },
  cell:     { width: `${100 / 7}%`, aspectRatio: 1, padding: 2 },
  dayCell:  { alignItems: 'center', justifyContent: 'center', gap: 3, borderRadius: 999, borderWidth: 1 },
  dayNum:   { fontFamily: FONTS.sansRegular, fontSize: 14.5, lineHeight: 18 },
  cellDot:  { width: 6, height: 6, borderRadius: 3 },
  todayKey: { width: 10, height: 10, borderRadius: 5, borderWidth: 1 },
  legend:   { flexDirection: 'row', gap: 14, flexWrap: 'wrap' },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendText: { fontFamily: FONTS.sansRegular, fontSize: 12, lineHeight: 16 },

  detail:     { gap: 14, padding: 18, borderRadius: 22, borderWidth: StyleSheet.hairlineWidth },
  detailItem: { gap: 6 },
  detailName: { fontFamily: FONTS.serifRegular, fontSize: 26, lineHeight: 30 },
  lunar:      { fontFamily: FONTS.sansRegular, fontSize: 12, lineHeight: 16 },
  about:      { fontFamily: FONTS.sansRegular, fontSize: 14, lineHeight: 20 },
  remindRow:  { marginTop: 6, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth },
  toggle:     { minHeight: 44 },

  chips:    { gap: 8, paddingRight: 8 },
  listCard: { borderRadius: RADIUS.card, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  empty:    { padding: 16 },
  upRow:    { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 12, paddingHorizontal: 16 },
  upDate:   { width: 40, alignItems: 'center' },
  upDay:    { fontFamily: FONTS.serifRegular, fontSize: 22, lineHeight: 26 },
  upText:   { flex: 1, gap: 2 },
  upName:   { fontFamily: FONTS.sansMedium, fontSize: 14.5, lineHeight: 19 },
  upSub:    { fontFamily: FONTS.sansRegular, fontSize: 12.5, lineHeight: 17 },
  note:     { fontFamily: FONTS.sansRegular, fontSize: 12, lineHeight: 17 },
});
