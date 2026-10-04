'use no memo'; // renders call language helpers (tPlanet, intlLocale, ...) that the React Compiler would otherwise cache across language switches

/**
 * Day / month / year wheels in the app language.
 *
 * - Month names and digits come from Intl for intlLocale() (Bengali digits in
 *   bn-IN; hi-IN uses Latin digits, as Intl gives them).
 * - Column order follows the locale's own date order.
 * - The day list is as long as the selected month (28–31) and the chosen day
 *   clamps when the month or year shrinks it (31 Mar → Feb = 28/29 Feb).
 * - Dates outside [minimumDate, maximumDate] are shown faded, can't be landed
 *   on, and any combination that falls outside is clamped back in.
 *
 * Output is a local-midnight Date (what localDateIso() expects).
 */
import { useCallback, useMemo } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useAccent } from '@/hooks/use-accent';
import { intlLocale, localizeDigits } from '@/utils/i18n';
import { WheelPicker, type WheelItem } from './WheelPicker';

export type DatePickerProps = {
  value: Date;
  onChange: (date: Date) => void;
  /** Defaults to 1 Jan 1900. */
  minimumDate?: Date;
  /** Defaults to no limit (pass `new Date()` for birth dates). */
  maximumDate?: Date;
  itemHeight?: number;
  visibleCount?: number;
  style?: StyleProp<ViewStyle>;
};

const DEFAULT_MIN = new Date(1900, 0, 1);
const FAR_FUTURE = new Date(2200, 11, 31);

const daysIn = (year: number, month: number) => new Date(year, month + 1, 0).getDate();
const dayKey = (y: number, m: number, d: number) => y * 10000 + m * 100 + d;
const keyOf = (d: Date) => dayKey(d.getFullYear(), d.getMonth(), d.getDate());

type Part = 'day' | 'month' | 'year';

function columnOrder(locale: string): Part[] {
  try {
    const parts = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long', year: 'numeric' })
      .formatToParts(new Date(2001, 10, 23));
    const order = parts
      .map((p) => p.type)
      .filter((t): t is Part => t === 'day' || t === 'month' || t === 'year');
    if (order.length === 3) return order;
  } catch {
    // fall through
  }
  return ['day', 'month', 'year'];
}

export function DatePicker({
  value,
  onChange,
  minimumDate = DEFAULT_MIN,
  maximumDate = FAR_FUTURE,
  itemHeight = 44,
  visibleCount = 5,
  style,
}: DatePickerProps) {
  const { theme } = useAccent();
  const { t, i18n } = useTranslation('common');
  const locale = intlLocale();

  const y = value.getFullYear();
  const m = value.getMonth();
  const d = value.getDate();

  const minY = minimumDate.getFullYear();
  const maxY = maximumDate.getFullYear();
  const minKey = keyOf(minimumDate);
  const maxKey = keyOf(maximumDate);

  // i18n.language is in deps so labels rebuild when the app language changes.
  const fmt = useMemo(() => {
    const num = new Intl.NumberFormat(locale, { useGrouping: false });
    const month = new Intl.DateTimeFormat(locale, { month: 'long' });
    return { num, month };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locale, i18n.language]);

  const order = useMemo(() => columnOrder(locale), [locale]);

  const years = useMemo<WheelItem<number>[]>(() => {
    const out: WheelItem<number>[] = [];
    for (let yr = minY; yr <= maxY; yr++) out.push({ value: yr, label: localizeDigits(fmt.num.format(yr)) });
    return out;
  }, [minY, maxY, fmt]);

  const months = useMemo<WheelItem<number>[]>(() =>
    Array.from({ length: 12 }, (_, i) => ({
      value: i,
      label: fmt.month.format(new Date(2001, i, 1)),
      disabled: dayKey(y, i, 31) < minKey || dayKey(y, i, 1) > maxKey,
    })),
  [y, minKey, maxKey, fmt]);

  const days = useMemo<WheelItem<number>[]>(() =>
    Array.from({ length: daysIn(y, m) }, (_, i) => ({
      value: i + 1,
      label: localizeDigits(fmt.num.format(i + 1)),
      disabled: dayKey(y, m, i + 1) < minKey || dayKey(y, m, i + 1) > maxKey,
    })),
  [y, m, minKey, maxKey, fmt]);

  /** Build a date, clamping the day to the month and the result to the range. */
  const emit = useCallback((year: number, month: number, day: number) => {
    const clampedDay = Math.min(day, daysIn(year, month));
    let next = new Date(year, month, clampedDay);
    const k = keyOf(next);
    if (k < minKey) next = new Date(minimumDate.getFullYear(), minimumDate.getMonth(), minimumDate.getDate());
    if (k > maxKey) next = new Date(maximumDate.getFullYear(), maximumDate.getMonth(), maximumDate.getDate());
    if (keyOf(next) !== keyOf(value)) onChange(next);
  }, [minKey, maxKey, minimumDate, maximumDate, value, onChange]);

  const columns: Record<Part, React.ReactNode> = {
    day: (
      <WheelPicker
        key="day"
        items={days}
        value={d}
        onChange={(day) => emit(y, m, day)}
        loop
        itemHeight={itemHeight}
        visibleCount={visibleCount}
        showBand={false}
        accessibilityLabel={t('picker.day')}
        style={styles.day}
      />
    ),
    month: (
      <WheelPicker
        key="month"
        items={months}
        value={m}
        onChange={(month) => emit(y, month, d)}
        loop
        itemHeight={itemHeight}
        visibleCount={visibleCount}
        showBand={false}
        accessibilityLabel={t('picker.month')}
        style={styles.month}
      />
    ),
    year: (
      <WheelPicker
        key="year"
        items={years}
        value={y}
        onChange={(year) => emit(year, m, d)}
        itemHeight={itemHeight}
        visibleCount={visibleCount}
        showBand={false}
        accessibilityLabel={t('picker.year')}
        style={styles.year}
      />
    ),
  };

  const half = Math.floor(visibleCount / 2);

  return (
    <View style={[styles.row, style]}>
      <View
        pointerEvents="none"
        style={[
          styles.band,
          { top: half * itemHeight, height: itemHeight, backgroundColor: theme.hairline },
        ]}
      />
      {order.map((part) => columns[part])}
    </View>
  );
}

const styles = StyleSheet.create({
  row:   { flexDirection: 'row', alignItems: 'stretch', paddingHorizontal: 4 },
  band:  { position: 'absolute', left: 0, right: 0, borderRadius: 12 },
  day:   { flex: 0.8 },
  month: { flex: 1.6 },
  year:  { flex: 1.1 },
});
