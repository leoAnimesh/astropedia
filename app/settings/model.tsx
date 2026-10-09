'use no memo'; // renders call language helpers (localizeDigits) that the React Compiler would otherwise cache across language switches

import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Linking, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useAccent } from '@/hooks/use-accent';
import { useIndicStyles } from '@/hooks/use-indic-styles';
import { ScreenLayout } from '@/components/templates/ScreenLayout';
import { FeatureHeader } from '@/components/molecules/FeatureHeader';
import { ProgressButton } from '@/components/molecules/ProgressButton';
import { showDialog } from '@/components/overlays';
import { FONTS, RADIUS } from '@/constants/themes';
import { localizeDigits } from '@/utils/i18n';
import { fetchCatalog, getInstallMarker, useModelSetup } from '@/utils/model-download';
import {
  cancelModelSwitch, canStartSwitch, currentSwitch, getDeviceInfo, resetModelSwitch, resumeInterruptedSwitch,
  setModelPickerOpen, switchModel, useModelSwitch, useSwitchResumed, type SwitchResult,
} from '@/utils/model-switch';
import {
  FALLBACK_CATALOG, canCancelSwitch, currentEntryId, displayMB, pickerEntries, switchActive, switchPercent,
  type CatalogEntry, type CatalogLang, type DeviceInfo,
} from '@/utils/model-catalog';

const LANGS: CatalogLang[] = ['en', 'hi', 'bn'];

type Loaded = {
  entries: CatalogEntry[];
  /** Everything the catalog offers (the current model's name comes from here even if hidden). */
  all: CatalogEntry[];
  source: 'manifest' | 'fallback';
  device: DeviceInfo;
  currentId: string | null;
};

function load(): Promise<Loaded> {
  return fetchCatalog().then(({ entries, source }) => {
    const device = getDeviceInfo();
    const currentId = currentEntryId(entries, getInstallMarker());
    return { entries: pickerEntries(entries, device, currentId), all: entries, source, device, currentId };
  });
}

export default function ModelPickerScreen() {
  const { theme } = useAccent();
  const styles = useIndicStyles(baseStyles);
  const { t, i18n } = useTranslation('settings');
  const lang = (LANGS.includes(i18n.language as CatalogLang) ? i18n.language : 'en') as CatalogLang;
  const [data, setData] = useState<Loaded | null>(null);
  const [err, setErr] = useState<{ id: string; failure: string } | null>(null);
  const mounted = useRef(true);
  const dataRef = useRef<Loaded | null>(null);
  useEffect(() => { dataRef.current = data; }, [data]);

  const phase    = useModelSwitch((s) => s.phase);
  const received = useModelSwitch((s) => s.received);
  const total    = useModelSwitch((s) => s.total);
  const retrying = useModelSwitch((s) => s.retrying);
  const targetId = useModelSwitch((s) => s.targetId);
  const resumed  = useSwitchResumed((s) => s.resumed);
  const setupPhase = useModelSetup((s) => s.phase);

  useEffect(() => {
    mounted.current = true;
    load().then((d) => { if (mounted.current) setData(d); }).catch(() => {
      if (!mounted.current) return;
      const device = getDeviceInfo();
      const currentId = currentEntryId(FALLBACK_CATALOG, getInstallMarker());
      setData({ entries: pickerEntries(FALLBACK_CATALOG, device, currentId), all: FALLBACK_CATALOG, source: 'fallback', device, currentId });
    });
    return () => { mounted.current = false; };
  }, []);

  const active = switchActive({ phase });
  const setupBusy = setupPhase === 'checking' || setupPhase === 'downloading' || setupPhase === 'verifying';
  const nameOf = (id: string | null) => data?.all.find((e) => e.id === id)?.name ?? null;
  const currentName = nameOf(data?.currentId ?? null) ?? t('modelPicker.thisModel');
  const describe = (e: CatalogEntry) =>
    (e.descriptionKey && i18n.exists(`settings:modelPicker.desc.${e.descriptionKey}`))
      ? t(`modelPicker.desc.${e.descriptionKey}`)
      : e.description[lang];
  const mb = (bytes: number) => localizeDigits(String(displayMB(bytes)));

  /** Wait for a switch (started here, at launch, or resumed) and report how it ended. */
  const follow = async (id: string, name: () => string, running: Promise<SwitchResult>) => {
    const res = await running;
    if (res.ok) {
      await new Promise((r) => setTimeout(r, 700)); // let "Done" show on the button
      if (mounted.current) router.back();
      await showDialog({ title: t('modelPicker.doneTitle'), message: t('modelPicker.doneMessage', { name: name() }) });
    } else if (res.failure !== 'cancelled' && mounted.current) {
      setErr({ id, failure: res.failure });
    }
    resetModelSwitch();
    if (!res.ok && mounted.current) load().then((d) => { if (mounted.current) setData(d); }).catch(() => {});
  };

  const runSwitch = (entry: CatalogEntry) => {
    setErr(null);
    return follow(entry.id, () => entry.name, switchModel(entry));
  };

  // Reopening the picker: follow a switch that is running (e.g. resumed at
  // launch), or continue one a kill or a lost connection interrupted.
  useEffect(() => {
    setModelPickerOpen(true);
    const live = currentSwitch() ?? resumeInterruptedSwitch();
    if (live) {
      const id = useModelSwitch.getState().targetId ?? '';
      follow(id, () => dataRef.current?.all.find((e) => e.id === id)?.name ?? id, live);
    } else if (!switchActive(useModelSwitch.getState())) {
      resetModelSwitch(); // a finished switch nobody dismissed
    }
    return () => setModelPickerOpen(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const confirm = (entry: CatalogEntry) => {
    if (!canStartSwitch()) {
      showDialog({ title: t('modelPicker.failedTitle'), message: setupBusy ? t('modelPicker.setupBusy') : t('modelPicker.failed.busy') });
      return;
    }
    const lines = [
      t('modelPicker.confirmDownload', { mb: mb(entry.sizeBytes), current: currentName }),
      t('modelPicker.confirmChats'),
      t('modelPicker.confirmRegen'),
      t('modelPicker.confirmKept'),
      entry.adapter === 'instruct' ? t('modelPicker.confirmGeneric', { name: entry.name }) : null,
      entry.license.notice ?? null,
    ].filter(Boolean);
    showDialog({
      title: t('modelPicker.confirmTitle', { name: entry.name }),
      message: lines.join('\n\n'),
      actions: [
        { label: t('modelPicker.cancel'), style: 'cancel' },
        { label: t('modelPicker.confirm'), style: 'destructive', onPress: () => { runSwitch(entry); } },
      ],
    });
  };

  const pct = switchPercent({ phase, received, total });
  const busyPhase = active || phase === 'done';
  const buttonLabel = (() => {
    if (phase === 'downloading') {
      return retrying ? t('modelPicker.progress.retrying') : t('modelPicker.progress.btnDownloading', {
        pct, done: Math.min(displayMB(received), displayMB(total)), total: displayMB(total),
      });
    }
    if (phase === 'verifying') return t('modelPicker.progress.btnVerifying');
    if (phase === 'installing' || phase === 'clearing') return t(`modelPicker.progress.${phase}`);
    if (phase === 'done') return t('modelPicker.progress.btnDone');
    return '';
  })();

  const ramUnknown = data?.device.totalMemoryBytes == null;

  return (
    <ScreenLayout edges={['top', 'left', 'right']}>
      <FeatureHeader title={t('modelPicker.title')} subtitle={t('modelPicker.eyebrow')} backLabel={t('back')} />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={[styles.intro, { color: theme.ink2 }]}>{t('modelPicker.intro')}</Text>

        {!data ? (
          <View style={styles.loading}>
            <ActivityIndicator color={theme.muted} />
            <Text style={[styles.note, { color: theme.muted }]}>{t('modelPicker.loading')}</Text>
          </View>
        ) : (
          data.entries.map((e) => {
            const isCurrent = e.id === data.currentId;
            const isTarget = busyPhase && e.id === targetId;
            const failure = err && err.id === e.id && !busyPhase ? err.failure : null;
            return (
              <View
                key={e.id}
                style={[
                  styles.card,
                  { backgroundColor: theme.surface, borderColor: isCurrent ? theme.ink2 : theme.hairline },
                ]}
              >
                <View style={styles.titleRow}>
                  <Text style={[styles.name, { color: theme.ink }]} accessibilityRole="header">{e.name}</Text>
                  {e.recommended && (
                    <Text style={[styles.badge, { backgroundColor: theme.accentMuted, color: theme.ink2 }]}>{t('modelPicker.recommended')}</Text>
                  )}
                  {isCurrent && (
                    <Text style={[styles.badge, { backgroundColor: theme.surface2, color: theme.ink2 }]}>{t('modelPicker.current')}</Text>
                  )}
                </View>
                <Text style={[styles.desc, { color: theme.ink2 }]}>{describe(e)}</Text>

                <Text style={[styles.meta, { color: theme.muted }]}>
                  {[
                    isCurrent ? t('modelPicker.sizeInstalled', { mb: mb(e.sizeBytes) }) : t('modelPicker.size', { mb: mb(e.sizeBytes) }),
                    t('modelPicker.ram', { gb: localizeDigits(String(Math.round(e.minRamMB / 1024))) }),
                  ].join(' · ')}
                </Text>

                <View style={styles.langRow} accessible accessibilityLabel={`${t('modelPicker.languages')}: ${LANGS.filter((l) => e.languages[l]).map((l) => `${t(`modelPicker.lang.${l}`)} ${t(`modelPicker.quality.${e.languages[l]}`)}`).join(', ')}`}>
                  {LANGS.filter((l) => e.languages[l]).map((l) => (
                    <View key={l} style={[styles.langChip, { borderColor: theme.hairline2 }]}>
                      <Text style={[styles.langText, { color: theme.ink }]}>{t(`modelPicker.lang.${l}`)}</Text>
                      <Text style={[styles.langQuality, { color: theme.muted }]}>{t(`modelPicker.quality.${e.languages[l]}`)}</Text>
                    </View>
                  ))}
                </View>

                <TouchableOpacity
                  onPress={() => { Linking.openURL(e.license.url).catch(() => {}); }}
                  accessibilityRole="link"
                  accessibilityHint={t('modelPicker.licenceHint')}
                  style={styles.licence}
                >
                  <Text style={[styles.licenceText, { color: theme.accent }]}>{t('modelPicker.licence', { name: e.license.name })}</Text>
                </TouchableOpacity>
                {e.license.notice ? <Text style={[styles.notice, { color: theme.muted }]}>{e.license.notice}</Text> : null}

                {!isCurrent && Platform.OS !== 'web' && (
                  <>
                    <ProgressButton
                      label={failure ? t('modelPicker.retry') : t('modelPicker.select')}
                      variant={e.recommended ? 'primary' : 'ghost'}
                      onPress={() => (failure ? runSwitch(e) : confirm(e))}
                      disabled={busyPhase || setupBusy}
                      progress={isTarget ? pct : null}
                      progressLabel={buttonLabel}
                      style={styles.selectBtn}
                    />
                    {failure ? (
                      <Text style={[styles.errorText, { color: theme.ink }]} accessibilityLiveRegion="polite" accessibilityRole="alert">
                        {t(`modelPicker.failed.${failure}`)}
                      </Text>
                    ) : null}
                    {isTarget && (
                      <View style={styles.progressFoot}>
                        <Text style={[styles.note, styles.footNote, { color: theme.muted }]}>
                          {resumed ? t('modelPicker.progressResumed') : t('modelPicker.progressNote')}
                        </Text>
                        {canCancelSwitch({ phase }) && (
                          <TouchableOpacity onPress={cancelModelSwitch} accessibilityRole="button" style={styles.cancelLink}>
                            <Text style={[styles.cancelText, { color: theme.accent }]}>{t('modelPicker.cancel')}</Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    )}
                  </>
                )}
              </View>
            );
          })
        )}

        {data && (
          <>
            <Text style={[styles.footnote, { color: theme.muted }]}>
              {ramUnknown ? t('modelPicker.hiddenNoteRamUnknown') : t('modelPicker.hiddenNote')}
            </Text>
            {data.source === 'fallback' && (
              <Text style={[styles.footnote, { color: theme.muted }]}>{t('modelPicker.builtInList')}</Text>
            )}
          </>
        )}
        <View style={{ height: 40 }} />
      </ScrollView>
    </ScreenLayout>
  );
}

const baseStyles = StyleSheet.create({
  content: { paddingHorizontal: 22, paddingTop: 16, gap: 14 },
  intro: { fontFamily: FONTS.sansRegular, fontSize: 14, lineHeight: 20 },
  loading: { alignItems: 'center', gap: 8, paddingVertical: 32 },
  errorText: { fontFamily: FONTS.sansRegular, fontSize: 12.5, lineHeight: 18 },
  progressFoot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  footNote: { flex: 1 },
  cancelLink: { minHeight: 44, minWidth: 44, justifyContent: 'center', alignItems: 'flex-end' },
  cancelText: { fontFamily: FONTS.sansMedium, fontSize: 13.5 },
  card: {
    borderRadius: RADIUS.card,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 18,
    gap: 8,
  },
  titleRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
  name: { fontFamily: FONTS.sansMedium, fontSize: 16, letterSpacing: -0.1 },
  badge: {
    fontFamily: FONTS.monoRegular,
    fontSize: 9.5,
    letterSpacing: 0.6,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: RADIUS.pill,
    overflow: 'hidden',
  },
  desc: { fontFamily: FONTS.sansRegular, fontSize: 13.5, lineHeight: 19 },
  meta: { fontFamily: FONTS.sansRegular, fontSize: 12 },
  langRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  langChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: RADIUS.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  langText: { fontFamily: FONTS.sansRegular, fontSize: 12 },
  langQuality: { fontFamily: FONTS.sansRegular, fontSize: 11.5 },
  licence: { alignSelf: 'flex-start', minHeight: 32, justifyContent: 'center' },
  licenceText: { fontFamily: FONTS.sansRegular, fontSize: 12.5 },
  notice: { fontFamily: FONTS.sansRegular, fontSize: 11, lineHeight: 15 },
  note: { fontFamily: FONTS.sansRegular, fontSize: 12, lineHeight: 17 },
  selectBtn: { marginTop: 6, alignSelf: 'stretch' },
  footnote: { fontFamily: FONTS.sansRegular, fontSize: 12, lineHeight: 17, marginHorizontal: 4 },
});
