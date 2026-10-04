'use no memo'; // renders call language helpers (tPlanet, intlLocale, ...) that the React Compiler would otherwise cache across language switches

/**
 * Hour / minute (/ day-period) wheels. Value in and out is the app's stored
 * birth-time format: a 24-hour "HH:mm" string.
 *
 * 12- vs 24-hour follows the locale's own convention (Intl hourCycle) unless
 * `hour12` is passed; the AM/PM labels and digits are whatever Intl gives for
 * intlLocale(). Hours and minutes loop; the period column doesn't.
 */
import { useMemo } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useAccent } from '@/hooks/use-accent';
import { FONTS } from '@/constants/themes';
import { intlLocale, localizeDigits, localizeTime } from '@/utils/i18n';
import { WheelPicker, type WheelItem } from './WheelPicker';

export type TimePickerProps = {
  /** "HH:mm", 24-hour. */
  value: string;
  onChange: (value: string) => void;
  /** Force 12- or 24-hour wheels; defaults to the locale's convention. */
  hour12?: boolean;
  itemHeight?: number;
  visibleCount?: number;
  style?: StyleProp<ViewStyle>;
};

const pad = (n: number) => String(n).padStart(2, '0');

/** Parse "HH:mm" (lenient); falls back to 12:00. */
export function parseHHmm(s: string | null | undefined): { h: number; m: number } {
  const match = /^(\d{1,2}):(\d{2})/.exec(s ?? '');
  if (!match) return { h: 12, m: 0 };
  const h = Math.min(23, Math.max(0, Number(match[1])));
  const m = Math.min(59, Math.max(0, Number(match[2])));
  return { h, m };
}

export const toHHmm = (h: number, m: number) => `${pad(h)}:${pad(m)}`;

function localeUses12h(locale: string): boolean {
  try {
    const opts = new Intl.DateTimeFormat(locale, { hour: 'numeric' }).resolvedOptions() as Intl.ResolvedDateTimeFormatOptions & { hourCycle?: string };
    if (opts.hourCycle) return opts.hourCycle === 'h12' || opts.hourCycle === 'h11';
    if (typeof opts.hour12 === 'boolean') return opts.hour12;
    return new Intl.DateTimeFormat(locale, { hour: 'numeric' })
      .formatToParts(new Date(2001, 0, 1, 15))
      .some((p) => p.type === 'dayPeriod');
  } catch {
    return true;
  }
}

function periodLabels(locale: string): [string, string] {
  const at = (hour: number, fallback: string) => {
    try {
      const part = new Intl.DateTimeFormat(locale, { hour: 'numeric', hour12: true })
        .formatToParts(new Date(2001, 0, 1, hour))
        .find((p) => p.type === 'dayPeriod');
      return part?.value ?? fallback;
    } catch {
      return fallback;
    }
  };
  return [at(9, 'AM'), at(21, 'PM')];
}

export function TimePicker({
  value,
  onChange,
  hour12,
  itemHeight = 44,
  visibleCount = 5,
  style,
}: TimePickerProps) {
  const { theme } = useAccent();
  const { t, i18n } = useTranslation('common');
  const locale = intlLocale();
  const use12 = hour12 ?? localeUses12h(locale);

  const { h, m } = parseHHmm(value);
  const period = h >= 12 ? 1 : 0;

  const labels = useMemo(() => {
    const num = new Intl.NumberFormat(locale, { useGrouping: false });
    const two = new Intl.NumberFormat(locale, { useGrouping: false, minimumIntegerDigits: 2 });
    const [am, pm] = periodLabels(locale);
    return { num, two, periods: [localizeTime(am), localizeTime(pm)] as const };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locale, i18n.language]);

  const hours = useMemo<WheelItem<number>[]>(() => (
    use12
      // 12, 1, 2 … 11 — value is the 12-hour clock face number mod 12.
      ? Array.from({ length: 12 }, (_, i) => ({ value: i, label: localizeDigits(labels.num.format(i === 0 ? 12 : i)) }))
      : Array.from({ length: 24 }, (_, i) => ({ value: i, label: localizeDigits(labels.two.format(i)) }))
  ), [use12, labels]);

  const minutes = useMemo<WheelItem<number>[]>(() =>
    Array.from({ length: 60 }, (_, i) => ({ value: i, label: localizeDigits(labels.two.format(i)) })),
  [labels]);

  const periods = useMemo<WheelItem<number>[]>(() => [
    { value: 0, label: labels.periods[0] },
    { value: 1, label: labels.periods[1] },
  ], [labels]);

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
      <WheelPicker
        items={hours}
        value={use12 ? h % 12 : h}
        onChange={(hour) => onChange(toHHmm(use12 ? hour + period * 12 : hour, m))}
        loop
        itemHeight={itemHeight}
        visibleCount={visibleCount}
        showBand={false}
        align="right"
        accessibilityLabel={t('picker.hour')}
        style={styles.col}
      />
      <View style={[styles.colon, { height: itemHeight, top: half * itemHeight }]} pointerEvents="none">
        <Text style={[styles.colonText, { color: theme.ink }]}>:</Text>
      </View>
      <WheelPicker
        items={minutes}
        value={m}
        onChange={(minute) => onChange(toHHmm(h, minute))}
        loop
        itemHeight={itemHeight}
        visibleCount={visibleCount}
        showBand={false}
        align="left"
        accessibilityLabel={t('picker.minute')}
        style={styles.col}
      />
      {use12 && (
        <WheelPicker
          items={periods}
          value={period}
          onChange={(p) => onChange(toHHmm((h % 12) + p * 12, m))}
          itemHeight={itemHeight}
          visibleCount={visibleCount}
          showBand={false}
          accessibilityLabel={t('picker.period')}
          style={styles.col}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row:       { flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: 12 },
  band:      { position: 'absolute', left: 0, right: 0, borderRadius: 12 },
  col:       { flex: 1 },
  colon:     { width: 14, alignItems: 'center', justifyContent: 'center', marginTop: 0, position: 'relative' },
  colonText: { fontFamily: FONTS.sansMedium, fontSize: 19 },
});
