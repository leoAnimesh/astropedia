'use no memo'; // renders call language helpers (localizeDigits) that the React Compiler would otherwise cache across language switches

import { Linking, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { router } from 'expo-router';
import Constants from 'expo-constants';
import { useTranslation } from 'react-i18next';
import { useAccent } from '@/hooks/use-accent';
import { useIndicStyles } from '@/hooks/use-indic-styles';
import { ScreenLayout } from '@/components/templates/ScreenLayout';
import { FeatureHeader } from '@/components/molecules/FeatureHeader';
import { EyebrowLabel } from '@/components/atoms/EyebrowLabel';
import { Icon, type IconName } from '@/components/atoms/Icon';
import { showDialog } from '@/components/overlays';
import { overlayPalette } from '@/components/overlays/palette';
import { FONTS, RADIUS } from '@/constants/themes';
import { localizeDigits } from '@/utils/i18n';
import { clearAllData } from '@/utils/database';
import { Storage } from '@/utils/storage';
import { deleteBackupFiles } from '@/utils/backup-io';
import { useOnboardingStore } from '@/stores/onboarding-store';
import { getInstallMarker, getModelInfo, useModelSetup } from '@/utils/model-download';
import { FALLBACK_CATALOG, currentEntryId } from '@/utils/model-catalog';

/** "astro-gemma-v21" → "v2.1"; other ids are shown as they are. */
function modelVersionLabel(version: string | null): string {
  const m = /^astro-gemma-v(\d)(\d*)$/.exec(version ?? '');
  return m ? `v${m[1]}${m[2] ? '.' + m[2] : ''}` : version ?? '';
}

function buildNumber(): string {
  const cfg = Constants.expoConfig;
  const n = Platform.OS === 'ios' ? cfg?.ios?.buildNumber : cfg?.android?.versionCode;
  return n != null ? String(n) : '–';
}

/**
 * Settings → About: version, the installed on-device model and its licence,
 * the disclaimer and crisis helplines, the privacy summary, legal pages and
 * "delete all my data".
 */
export default function AboutScreen() {
  const { theme, isDark } = useAccent();
  const styles = useIndicStyles(baseStyles);
  const { t } = useTranslation('about');
  const danger = overlayPalette(theme, isDark).destructive;
  const setOnboardingDone = useOnboardingStore((s) => s.setDone);
  const modelPhase = useModelSetup((s) => s.phase);

  const marker = getInstallMarker();
  const info = getModelInfo();
  const entry = FALLBACK_CATALOG.find((e) => e.id === currentEntryId(FALLBACK_CATALOG, marker));
  const installed = modelPhase === 'ready' && marker != null;
  const isSaga = !entry || entry.adapter === 'gemma21';
  const modelName = entry?.name ?? 'Astropedia Saga';
  const licence = entry?.license ?? FALLBACK_CATALOG.find((e) => e.adapter === 'gemma21')?.license;

  const version = Constants.expoConfig?.version ?? '';
  const divider = <View style={[styles.divider, { backgroundColor: theme.hairline }]} />;

  const infoRow = (label: string, value: string) => (
    <View style={styles.infoRow} accessible accessibilityLabel={`${label}, ${value}`}>
      <Text style={[styles.rowLabel, { color: theme.muted }]}>{label}</Text>
      <Text style={[styles.rowValue, { color: theme.ink }]} numberOfLines={2}>{value}</Text>
    </View>
  );

  const navRow = (icon: IconName, label: string, onPress: () => void, sub?: string, color?: string) => (
    <TouchableOpacity style={styles.navRow} onPress={onPress} accessibilityRole="button" accessibilityLabel={label} accessibilityHint={sub}>
      <View style={[styles.rowIcon, { backgroundColor: theme.surface2 }]}>
        <Icon name={icon} size={16} color={color ?? theme.ink2} />
      </View>
      <View style={styles.flex}>
        <Text style={[styles.navLabel, { color: color ?? theme.ink }]}>{label}</Text>
        {sub ? <Text style={[styles.navSub, { color: theme.muted }]}>{sub}</Text> : null}
      </View>
      {color ? null : <Icon name="chevron" size={14} color={theme.faint} />}
    </TouchableOpacity>
  );

  const call = (number: string) => {
    Linking.openURL(`tel:${number}`).catch(() => {});
  };

  const handleDelete = () => {
    showDialog({
      title: t('data.title'),
      message: t('data.message'),
      actions: [
        { label: t('data.cancel'), style: 'cancel' },
        {
          label: t('data.confirm'),
          style: 'destructive',
          onPress: async () => {
            await clearAllData();
            Storage.clear();
            deleteBackupFiles();
            // Flipping the store swaps the root layout's guards to onboarding.
            setOnboardingDone(false);
          },
        },
      ],
    });
  };

  return (
    <ScreenLayout edges={['top', 'left', 'right']}>
      <FeatureHeader title={t('title')} />
      <ScrollView style={styles.flex} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          <Text style={[styles.appName, { color: theme.ink }]} accessibilityRole="header">Astropedia</Text>
          <Text style={[styles.tagline, { color: theme.ink2 }]}>{t('tagline')}</Text>
          <Text style={[styles.version, { color: theme.muted }]}>
            {localizeDigits(t('version', { version, build: buildNumber() }))}
          </Text>
        </View>

        {/* On-device model */}
        <EyebrowLabel style={[styles.sectionLabel, styles.sectionGap]}>{t('sections.model')}</EyebrowLabel>
        <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.hairline }]}>
          {infoRow(t('model.name'), installed ? modelName : t('model.notInstalled'))}
          {installed ? (
            <>
              {divider}
              {infoRow(t('model.version'), isSaga ? modelVersionLabel(info.version) : info.version ?? '')}
              {divider}
              {infoRow(t('model.size'), localizeDigits(t('model.sizeValue', { mb: Math.round(info.bytes / 1_000_000) })))}
            </>
          ) : null}
          {licence ? (
            <>
              {divider}
              <TouchableOpacity
                style={styles.infoRow}
                onPress={() => { Linking.openURL(licence.url).catch(() => {}); }}
                accessibilityRole="link"
                accessibilityLabel={`${t('model.licence')}, ${licence.name}`}
              >
                <Text style={[styles.rowLabel, { color: theme.muted }]}>{t('model.licence')}</Text>
                <Text style={[styles.rowValue, styles.link, { color: theme.accent }]}>{licence.name}</Text>
              </TouchableOpacity>
            </>
          ) : null}
          {isSaga ? (
            <Text style={[styles.notice, { color: theme.muted }]}>{t('model.gemmaNotice')}</Text>
          ) : entry?.license.notice ? (
            <Text style={[styles.notice, { color: theme.muted }]}>{entry.license.notice}</Text>
          ) : null}
        </View>

        {/* Disclaimer */}
        <EyebrowLabel style={[styles.sectionLabel, styles.sectionGap]}>{t('sections.disclaimer')}</EyebrowLabel>
        <View style={[styles.card, styles.textCard, { backgroundColor: theme.surface, borderColor: theme.hairline }]}>
          <Text style={[styles.body, { color: theme.ink }]}>{t('disclaimer.body')}</Text>
          <Text style={[styles.body, { color: theme.ink2 }]}>{t('disclaimer.ai')}</Text>
        </View>

        {/* Helplines */}
        <EyebrowLabel style={[styles.sectionLabel, styles.sectionGap]}>{t('sections.help')}</EyebrowLabel>
        <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.hairline }]}>
          <Text style={[styles.body, styles.helpBody, { color: theme.ink }]}>{t('help.body')}</Text>
          {divider}
          {navRow('phone', t('help.teleManas'), () => call('14416'), t('help.teleManasSub'))}
          {divider}
          {navRow('phone', t('help.emergency'), () => call('112'), t('help.emergencySub'))}
        </View>

        {/* Privacy */}
        <EyebrowLabel style={[styles.sectionLabel, styles.sectionGap]}>{t('sections.privacy')}</EyebrowLabel>
        <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.hairline }]}>
          <View style={styles.points}>
            {(t('privacy.points', { returnObjects: true }) as string[]).map((p) => (
              <View key={p} style={styles.point}>
                <Text style={[styles.bullet, { color: theme.accent }]}>•</Text>
                <Text style={[styles.body, styles.flex, { color: theme.ink }]}>{p}</Text>
              </View>
            ))}
          </View>
          {divider}
          {navRow('lock', t('privacy.policy'), () => router.push('/legal/privacy'))}
        </View>

        {/* Legal */}
        <EyebrowLabel style={[styles.sectionLabel, styles.sectionGap]}>{t('sections.legal')}</EyebrowLabel>
        <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.hairline }]}>
          {navRow('report', t('legal.terms'), () => router.push('/legal/terms'))}
          {divider}
          {navRow('book', t('legal.licences'), () => router.push('/legal/licenses'), t('legal.licencesSub'))}
        </View>

        {/* Data deletion */}
        <EyebrowLabel style={[styles.sectionLabel, styles.sectionGap]}>{t('sections.data')}</EyebrowLabel>
        <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.hairline }]}>
          {navRow('trash', t('data.delete'), handleDelete, t('data.deleteSub'), danger)}
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </ScreenLayout>
  );
}

const baseStyles = StyleSheet.create({
  flex: { flex: 1 },
  content: { paddingHorizontal: 22, paddingTop: 18 },
  hero: { alignItems: 'center', paddingTop: 8, paddingBottom: 4, gap: 4 },
  appName: { fontFamily: FONTS.serifItalic, fontSize: 38, lineHeight: 44 },
  tagline: { fontFamily: FONTS.sansRegular, fontSize: 14.5, lineHeight: 20, textAlign: 'center' },
  version: { fontFamily: FONTS.monoRegular, fontSize: 11.5, lineHeight: 16, marginTop: 4 },
  sectionLabel: { marginBottom: 10 },
  sectionGap: { marginTop: 24 },
  card: {
    borderRadius: RADIUS.card,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 18,
    paddingVertical: 6,
    overflow: 'hidden',
  },
  textCard: { paddingVertical: 16, gap: 10 },
  divider: { height: StyleSheet.hairlineWidth, alignSelf: 'stretch' },
  infoRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 16, minHeight: 48 },
  rowLabel: { fontFamily: FONTS.sansRegular, fontSize: 13.5 },
  rowValue: { fontFamily: FONTS.sansRegular, fontSize: 14, flexShrink: 1, textAlign: 'right' },
  link: { textDecorationLine: 'underline' },
  notice: { fontFamily: FONTS.sansRegular, fontSize: 11.5, lineHeight: 16, paddingTop: 4, paddingBottom: 12 },
  body: { fontFamily: FONTS.sansRegular, fontSize: 14, lineHeight: 21 },
  helpBody: { paddingVertical: 12 },
  navRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56 },
  rowIcon: { width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  navLabel: { fontFamily: FONTS.sansRegular, fontSize: 14.5, letterSpacing: -0.1 },
  navSub: { fontFamily: FONTS.sansRegular, fontSize: 12, marginTop: 1 },
  points: { paddingVertical: 12, gap: 8 },
  point: { flexDirection: 'row', gap: 10 },
  bullet: { fontFamily: FONTS.sansRegular, fontSize: 14, lineHeight: 21 },
});
