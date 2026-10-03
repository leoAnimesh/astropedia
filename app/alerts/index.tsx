import { useMemo, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useAccent } from '@/hooks/use-accent';
import { useProfiles } from '@/hooks/use-profiles';
import { Icon } from '@/components/atoms/Icon';
import { EyebrowLabel } from '@/components/atoms/EyebrowLabel';
import { Toggle } from '@/components/atoms/Toggle';
import { ScreenLayout } from '@/components/templates/ScreenLayout';
import { FONTS, RADIUS } from '@/constants/themes';
import { Storage } from '@/utils/storage';
import { localDateIso } from '@/utils/format';
import { intlLocale } from '@/utils/i18n';
import { explainTransit, getUpcomingAlerts } from '@/utils/transits';
import {
  cancelTransitAlerts,
  ensureNotificationPermission,
  scheduleTransitAlerts,
} from '@/utils/notifications';

const fmt = (d: Date, opts: Intl.DateTimeFormatOptions) => d.toLocaleDateString(intlLocale(), opts);

export default function AlertsScreen() {
  const { t, i18n }       = useTranslation('alerts');
  const { theme }         = useAccent();
  const { activeProfile } = useProfiles();
  const [alertsOn, setAlertsOn] = useState<boolean>(Storage.getTransitAlerts());

  const today = localDateIso(new Date());
  const items = useMemo(
    () => getUpcomingAlerts(activeProfile).map((a) => ({ alert: a, info: explainTransit(a, activeProfile) })),
    // Recompute per day, when the birth details change, and on language change
    // (explanations are translated).
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [today, activeProfile?.birthDate, activeProfile?.birthTime, activeProfile?.birthLng, i18n.language],
  );
  const thisYear = new Date().getFullYear();

  // Same flow as the Transit alerts toggle in Settings.
  const handleToggle = async (next: boolean) => {
    if (next) {
      const ok = await ensureNotificationPermission();
      if (!ok) {
        Alert.alert(t('permission.title'), t('permission.body'));
        return;
      }
      Storage.setTransitAlerts(true);
      setAlertsOn(true);
      scheduleTransitAlerts(activeProfile).catch(() => {});
    } else {
      Storage.setTransitAlerts(false);
      setAlertsOn(false);
      cancelTransitAlerts().catch(() => {});
    }
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
          <EyebrowLabel size={11}>{t('eyebrow')}</EyebrowLabel>
          <Text style={[styles.title, { color: theme.ink }]}>
            {t('title.before')}
            <Text style={[styles.titleItalic, { color: theme.accent }]}>{t('title.em')}</Text>
          </Text>
          <Text style={[styles.lead, { color: theme.ink2 }]}>{t('lead')}</Text>
        </View>

        <View>
          <EyebrowLabel size={11}>{t('comingUp')}</EyebrowLabel>
          {items.length === 0 ? (
            <Text style={[styles.empty, { color: theme.muted }]}>{t('empty')}</Text>
          ) : (
            items.map(({ alert, info }) => {
              const d = alert.date;
              return (
                <TouchableOpacity
                  key={alert.id}
                  onPress={() => router.push(`/alerts/${alert.id}`)}
                  style={[styles.row, { borderBottomColor: theme.hairline }]}
                  accessibilityRole="button"
                  accessibilityLabel={`${info.title}, ${fmt(d, { day: 'numeric', month: 'long', year: 'numeric' })}`}
                >
                  <View style={[styles.tile, { backgroundColor: theme.surface, borderColor: theme.hairline }]}>
                    <Text style={[styles.tileMonth, { color: alert.kind === 'phase' ? theme.accent : theme.muted }]}>
                      {fmt(d, { month: 'short' })}
                    </Text>
                    <Text style={[styles.tileDay, { color: theme.ink }]}>{fmt(d, { day: 'numeric' })}</Text>
                    {d.getFullYear() !== thisYear && (
                      <Text style={[styles.tileYear, { color: theme.muted }]}>{fmt(d, { year: 'numeric' })}</Text>
                    )}
                  </View>
                  <View style={styles.rowText}>
                    <Text style={[styles.rowTitle, { color: theme.ink }]}>{info.title}</Text>
                    <Text style={[styles.rowSub, { color: theme.ink2 }]} numberOfLines={2}>{info.lines[0]}</Text>
                  </View>
                  <Icon name="chevron" size={16} color={theme.faint} />
                </TouchableOpacity>
              );
            })
          )}
        </View>

        <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.hairline }]}>
          <Toggle
            value={alertsOn}
            onValueChange={handleToggle}
            label={t('toggle.label')}
            sublabel={t('toggle.sublabel')}
          />
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
    gap:               40,
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
  empty: {
    fontFamily: FONTS.sansRegular,
    fontSize:   15,
    lineHeight: 22,
    paddingTop: 16,
  },
  row: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:               16,
    paddingVertical:   16,
    minHeight:         76,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  tile: {
    width:          58,
    paddingVertical: 8,
    borderRadius:   14,
    borderWidth:    StyleSheet.hairlineWidth,
    alignItems:     'center',
  },
  tileMonth: {
    fontFamily:    FONTS.monoRegular,
    fontSize:      10,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  tileDay: {
    fontFamily: FONTS.serifRegular,
    fontSize:   26,
    lineHeight: 30,
  },
  tileYear: {
    fontFamily: FONTS.monoRegular,
    fontSize:   9.5,
  },
  rowText: { flex: 1 },
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
  card: {
    borderRadius:      RADIUS.card + 4,
    borderWidth:       StyleSheet.hairlineWidth,
    paddingHorizontal: 20,
    paddingVertical:   14,
  },
});
