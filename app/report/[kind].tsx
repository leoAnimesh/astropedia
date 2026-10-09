'use no memo'; // renders call language helpers (tPlanet, intlLocale, ...) that the React Compiler would otherwise cache across language switches

import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View,
  type LayoutChangeEvent, type NativeScrollEvent, type NativeSyntheticEvent,
} from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { router, useLocalSearchParams, type Href } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useAccent } from '@/hooks/use-accent';
import { useProfiles } from '@/hooks/use-profiles';
import { useIndicStyles } from '@/hooks/use-indic-styles';
import { useCompatReport, useReport } from '@/hooks/use-report';
import { ScreenLayout } from '@/components/templates/ScreenLayout';
import { FeatureHeader } from '@/components/molecules/FeatureHeader';
import { EyebrowLabel } from '@/components/atoms/EyebrowLabel';
import { Icon, type IconName } from '@/components/atoms/Icon';
import { EmText, ReportSummaryCard } from '@/components/organisms/ReportSummaryCard';
import { showDialog } from '@/components/overlays';
import { FONTS, RADIUS } from '@/constants/themes';
import type { AgentId } from '@/constants/gurus';
import { saveReportProgress } from '@/utils/database';
import { askLanguage, formatMonthYear, localizeDigits, tAsk } from '@/utils/i18n';
import { dmy } from '@/utils/reports/build';
import { guruLocked } from '@/utils/guru-context';
import { openGuruChat } from '@/utils/guru-nav';
import { captureAndShare } from '@/utils/share';
import { shareReportPdf } from '@/utils/reports/pdf-io';
import {
  partnerAllowed,
  progressOf,
  REPORT_KINDS,
  type AnyReportKind,
  type Chapter,
  type CompatMode,
  type ReportKind,
} from '@/utils/reports';

const TILE_BG = 'rgba(180,130,0,0.10)';
const KIND_ICON: Record<AnyReportKind, IconName> = {
  life: 'sun', career: 'briefcase', love: 'heart', health: 'sprout', study: 'study', family: 'house', compat: 'match',
};
const KIND_GURU: Record<ReportKind, AgentId> = {
  life: 'saga', career: 'career', love: 'love', health: 'health', study: 'study', family: 'family',
};

export default function ReportScreen() {
  const styles = useIndicStyles(baseStyles);
  const { theme } = useAccent();
  const { t, i18n } = useTranslation('reports');
  const latin = i18n.language === 'en';
  const params = useLocalSearchParams<{ kind: string; profileId?: string; b?: string; mode?: string; ch?: string }>();
  const { profiles, activeProfile } = useProfiles();
  const isCompat = params.kind === 'compat';
  const kind = (isCompat ? 'compat' : REPORT_KINDS.includes(params.kind as ReportKind) ? params.kind : 'life') as AnyReportKind;
  const profile = profiles.find((p) => p.id === params.profileId) ?? activeProfile ?? null;
  const other = isCompat ? profiles.find((p) => p.id === params.b) ?? null : null;
  const mode: CompatMode = params.mode === 'friend' || params.mode === 'family' ? params.mode : 'partner';

  const single = useReport((isCompat ? 'life' : kind) as ReportKind, isCompat ? null : profile);
  const pair = useCompatReport(isCompat ? profile : null, isCompat ? other : null, mode);
  const { report, loading, rowId } = isCompat ? pair : single;
  const locked = !isCompat && single.locked;

  const first = profile?.name.split(' ')[0] ?? '';
  const otherFirst = other?.name.split(' ')[0] ?? '';

  // ─── Scroll, chips and reading progress ───────────────────────────────────
  const scrollRef = useRef<ScrollView>(null);
  const chipsRef = useRef<ScrollView>(null);
  const offsets = useRef<number[]>([]);
  const chipX = useRef<number[]>([]);
  const viewH = useRef(0);
  const contentH = useRef(0);
  const maxProgress = useRef(0);
  const savedProgress = useRef(-1);
  const [active, setActive] = useState(-1);
  const [openWhy, setOpenWhy] = useState<Set<string>>(new Set());
  const shareRef = useRef<View>(null);
  const [pdfBusy, setPdfBusy] = useState(false);

  const count = report?.chapters.length ?? 0;
  const kindCol = isCompat ? 'compat' : kind;

  const save = (force = false) => {
    if (!rowId || !profile) return;
    const p = maxProgress.current;
    if (!force && p < savedProgress.current + 0.03) return;
    savedProgress.current = p;
    saveReportProgress(rowId, profile.id, kindCol, p).catch(() => {});
  };

  const scrollToChapter = (i: number) => {
    const y = offsets.current[i];
    if (y != null) scrollRef.current?.scrollTo({ y: Math.max(0, y - 10), animated: true });
  };

  // Opening a report counts as viewing it; the furthest point read is kept on leave.
  useEffect(() => {
    if (!report) return;
    savedProgress.current = -1;
    save(true);
    return () => save(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [report, rowId]);

  // Jump to a chapter asked for by the link (compatibility chapter list).
  useEffect(() => {
    if (!report || !params.ch) return;
    const idx = report.chapters.findIndex((c) => c.id === params.ch);
    if (idx < 0) return;
    const timer = setTimeout(() => scrollToChapter(idx), 350);
    return () => clearTimeout(timer);
  }, [report, params.ch]);

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const y = e.nativeEvent.contentOffset.y;
    viewH.current = e.nativeEvent.layoutMeasurement.height;
    contentH.current = e.nativeEvent.contentSize.height;
    const offs = offsets.current;
    if (!count || offs.length < count) return;
    const probe = y + viewH.current * 0.35;
    let i = -1;
    for (let k = 0; k < count; k++) if (offs[k] <= probe) i = k;
    let progress = 0;
    if (y + viewH.current >= contentH.current - 24) progress = 1;
    else if (i >= 0) {
      const end = i + 1 < count ? offs[i + 1] : contentH.current;
      progress = progressOf(i, (probe - offs[i]) / Math.max(1, end - offs[i]), count);
    }
    if (progress > maxProgress.current) {
      maxProgress.current = progress;
      save();
    }
    if (i !== active) {
      setActive(i);
      if (i >= 0 && chipX.current[i] != null) chipsRef.current?.scrollTo({ x: Math.max(0, chipX.current[i] - 22), animated: true });
    }
  };

  const onChapterLayout = (i: number) => (e: LayoutChangeEvent) => {
    offsets.current[i] = e.nativeEvent.layout.y;
  };

  // ─── Actions ──────────────────────────────────────────────────────────────
  const shareSummary = () => captureAndShare(shareRef.current, `astropedia-${kindCol}-${first}`.toLowerCase());

  const savePdf = async () => {
    if (!report || pdfBusy) return;
    setPdfBusy(true);
    const name = isCompat ? `${first} + ${otherFirst}` : first;
    const res = await shareReportPdf(report, {
      heading: t('pdf.title', { report: report.title, name }),
      subheading: isCompat ? report.summary.eyebrow : t('detail.fromChart', { name: first }),
      inOneLine: t('detail.inOneLine'),
      why: t('detail.why'),
      helpsNote: t('detail.helpsNote'),
      made: t('pdf.made', { date: dmy(new Date()) }),
      approx: report.approximate ? t('detail.approx') : '',
      ofPoints: t('pair.ofPoints'),
      scoreNote: t('pair.scoreNote'),
      marsCheck: t('pair.marsCheck'),
    }, theme.accent);
    setPdfBusy(false);
    if (res === 'unavailable') showDialog({ title: t('detail.savePdf'), message: t('detail.pdfUnavailable') });
    else if (res === 'failed') showDialog({ title: t('detail.savePdf'), message: t('detail.pdfFailed') });
  };

  // The matching guru, with two starter questions in the language the model speaks.
  const agent: AgentId = isCompat
    ? mode === 'partner' && profile && other && partnerAllowed(profile, other) ? 'love' : mode === 'family' ? 'family' : 'saga'
    : KIND_GURU[kind as ReportKind];
  const stretchEnd = (() => {
    const tm = report?.chapters.find((c) => c.type === 'timing');
    const end = tm && tm.type === 'timing' ? tm.items[0]?.end : null;
    // Fallback: a year after the report was written (keeps render pure).
    return end ? new Date(end) : new Date(new Date(report?.generatedAt ?? 0).getTime() + 365 * 86400000);
  })();
  const questions = (() => {
    if (!profile) return [];
    const lng = askLanguage();
    if (isCompat) {
      return ['q1', 'q2'].map((q) => tAsk(`reports:e.ask.compat.${mode}.${q}`, { a: first, b: otherFirst }));
    }
    const who = profile.isYou ? 'you' : 'other';
    return ['q1', 'q2'].map((q) => tAsk(`reports:e.ask.${kind}.${who}.${q}`, { name: first, date: formatMonthYear(stretchEnd, lng) }));
  })();
  const ask = (q?: string) => profile && openGuruChat(agent, profile.id, q);

  // ─── Render ───────────────────────────────────────────────────────────────
  const title = isCompat ? t('kind.compat.title') : t(`kind.${kind}.title`);
  const subtitle = isCompat
    ? (report?.summary.eyebrow ?? t('pair.subtitle'))
    : t('detail.fromChart', { name: first });

  if (!profile || (isCompat && !other)) {
    return (
      <ScreenLayout edges={['top', 'left', 'right']}>
        <FeatureHeader title={title} />
        <View style={styles.content}><Text style={[styles.body, { color: theme.ink }]}>{t('detail.notReady')}</Text></View>
      </ScreenLayout>
    );
  }

  if (locked) {
    return (
      <ScreenLayout edges={['top', 'left', 'right']}>
        <FeatureHeader title={title} subtitle={subtitle} />
        <View style={styles.content}>
          <View style={[styles.card, styles.lockedCard, { backgroundColor: theme.surface, borderColor: theme.hairline }]}>
            <View style={[styles.icon40, { backgroundColor: TILE_BG }]}><Icon name="lock" size={20} color={theme.accent} /></View>
            <Text style={[styles.h2, { color: theme.ink }]}>{t('detail.lockedTitle')}</Text>
            <Text style={[styles.body, { color: theme.ink2 }]}>{t('detail.lockedBody')}</Text>
            <View style={styles.row8}>
              {(['family', 'study'] as const).map((k) => (
                <TouchableOpacity key={k} onPress={() => router.replace(`/report/${k}?profileId=${profile.id}` as Href)}
                  style={[styles.outlinePill, { borderColor: theme.hairline2, backgroundColor: theme.surface }]} accessibilityRole="button">
                  <Text style={[styles.outlineText, { color: theme.ink }]}>{t(`kind.${k}.title`)}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </View>
      </ScreenLayout>
    );
  }

  if (!profile.birthDate || (!report && !loading)) {
    return (
      <ScreenLayout edges={['top', 'left', 'right']}>
        <FeatureHeader title={title} subtitle={subtitle} />
        <View style={styles.content}><Text style={[styles.body, { color: theme.ink }]}>{t('detail.notReady')}</Text></View>
      </ScreenLayout>
    );
  }

  return (
    <ScreenLayout edges={['top', 'left', 'right']}>
      <FeatureHeader
        title={title}
        subtitle={subtitle}
        right={report ? { icon: 'share', onPress: shareSummary, label: t('detail.share') } : undefined}
      />

      {report && (
        <View style={[styles.chipsBar, { borderBottomColor: theme.hairline, backgroundColor: theme.bg }]}>
          <ScrollView
            ref={chipsRef}
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.noGrow}
            contentContainerStyle={styles.chips}
            accessibilityLabel={t('detail.chapters')}
          >
            {report.chapters.map((c, i) => {
              const on = i === Math.max(0, active);
              return (
                <TouchableOpacity
                  key={c.id}
                  onLayout={(e) => { chipX.current[i] = e.nativeEvent.layout.x; }}
                  onPress={() => scrollToChapter(i)}
                  style={[styles.chip, { borderColor: on ? theme.ink : theme.hairline2, backgroundColor: on ? theme.ink : theme.surface }]}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  accessibilityLabel={t('detail.chapterA11y', { n: i + 1, title: c.title })}
                >
                  <Text style={[styles.chipN, { color: on ? theme.bg : theme.ink }]}>{localizeDigits(String(i + 1).padStart(2, '0'))}</Text>
                  <Text style={[styles.chipLabel, { color: on ? theme.bg : theme.ink }]}>{c.chip}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      )}

      {!report ? (
        <View style={styles.loading}><ActivityIndicator color={theme.muted} /><Text style={[styles.note, { color: theme.muted }]}>{t('tab.loading')}</Text></View>
      ) : (
        <ScrollView
          ref={scrollRef}
          style={styles.scroll}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          onScroll={onScroll}
          scrollEventThrottle={64}
          onLayout={(e) => { viewH.current = e.nativeEvent.layout.height; }}
        >
          {report.topNote && (
            <View style={[styles.notice, { backgroundColor: theme.surface2 }]}>
              <Icon name="sprout" size={16} color={theme.accent} />
              <Text style={[styles.noticeText, { color: theme.ink2 }]}>{report.topNote}</Text>
            </View>
          )}
          {report.approximate && (
            <View style={[styles.notice, { backgroundColor: theme.surface2 }]}>
              <Icon name="clock" size={16} color={theme.muted} />
              <Text style={[styles.noticeText, { color: theme.ink2 }]}>{t('detail.approx')}</Text>
            </View>
          )}

          <ReportSummaryCard report={report} />

          {report.chapters.map((c, i) => (
            <View key={c.id} onLayout={onChapterLayout(i)} style={styles.chapter} accessibilityLabel={c.title}>
              <View style={styles.chHead}>
                <Text style={[styles.chN, { color: theme.accent }]}>{localizeDigits(String(i + 1).padStart(2, '0'))}</Text>
                <Text style={[styles.h2, { color: theme.ink }]} accessibilityRole="header">{c.title}</Text>
              </View>
              <ChapterBody
                c={c}
                open={openWhy.has(c.id)}
                onToggle={() => setOpenWhy((s) => { const n = new Set(s); if (n.has(c.id)) n.delete(c.id); else n.add(c.id); return n; })}
                showDasha={!isCompat}
                onDasha={() => router.push(`/dasha/${profile.id}` as Href)}
                latin={latin}
              />
            </View>
          ))}

          {/* Ask the guru */}
          <Pressable
            onPress={() => ask()}
            style={({ pressed }) => [styles.askCard, { backgroundColor: theme.surface, borderColor: theme.hairline2, opacity: pressed ? 0.85 : 1 }]}
            accessibilityRole="button"
            accessibilityLabel={`${t(`detail.askTitle.${agent}`)}. ${t('detail.askSub', { name: isCompat ? `${first} + ${otherFirst}` : first })}`}
          >
            <View style={styles.askHead}>
              <View style={[styles.icon40, { backgroundColor: TILE_BG }]}>
                <Icon name={KIND_ICON[kind]} size={20} color={theme.accent} />
              </View>
              <View style={styles.flex}>
                <Text style={[styles.askTitle, { color: theme.ink }]}>{t(`detail.askTitle.${agent}`)}</Text>
                <Text style={[styles.askSub, { color: theme.ink2 }]}>{t('detail.askSub', { name: isCompat ? `${first} + ${otherFirst}` : first })}</Text>
              </View>
              <Icon name="chevron" size={16} color={theme.accent} />
            </View>
            <View style={styles.askChips}>
              {questions.map((q) => (
                <TouchableOpacity key={q} onPress={() => ask(q)} style={[styles.askChip, { backgroundColor: theme.surface2 }]} accessibilityRole="button">
                  <Text style={[styles.askChipText, { color: theme.ink }]}>{q}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </Pressable>

          {/* Keep this report */}
          <View style={styles.keepRow}>
            <TouchableOpacity onPress={shareSummary} style={[styles.keepBtn, { borderColor: theme.hairline2, backgroundColor: theme.surface }]} accessibilityRole="button">
              <Icon name="share" size={17} color={theme.ink} />
              <Text style={[styles.keepText, { color: theme.ink }]}>{t('detail.shareSummary')}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={savePdf} disabled={pdfBusy} style={[styles.keepBtn, { borderColor: theme.accent, backgroundColor: theme.accent }]} accessibilityRole="button" accessibilityState={{ busy: pdfBusy }}>
              {pdfBusy ? <ActivityIndicator size="small" color={theme.accentFg} /> : <Icon name="pdf" size={17} color={theme.accentFg} />}
              <Text style={[styles.keepText, { color: theme.accentFg }]}>{pdfBusy ? t('detail.pdfBusy') : t('detail.savePdf')}</Text>
            </TouchableOpacity>
          </View>

          {/* Read next */}
          {!isCompat && (
            <View style={styles.readNext}>
              <EyebrowLabel size={11}>{t('detail.readNext')}</EyebrowLabel>
              <View style={styles.row10}>
                <TouchableOpacity onPress={() => router.push(`/forecast/${profile.id}` as Href)} style={[styles.nextCard, { backgroundColor: theme.surface, borderColor: theme.hairline }]} accessibilityRole="button">
                  <Text style={[styles.nextTitle, { color: theme.ink }]}>{t('kind.year.title')}</Text>
                  <Text style={[styles.nextSub, { color: theme.ink2 }]}>{`${formatMonthYear(new Date())} – ${formatMonthYear(new Date(new Date().getFullYear(), new Date().getMonth() + 11, 1))}`}</Text>
                </TouchableOpacity>
                {(() => {
                  const at = REPORT_KINDS.indexOf(kind as ReportKind);
                  const next = [...REPORT_KINDS.slice(at + 1), ...REPORT_KINDS.slice(0, at)]
                    .find((k) => !(k === 'love' && guruLocked('love', profile.birthDate))) ?? 'life';
                  return (
                    <TouchableOpacity onPress={() => router.replace(`/report/${next}?profileId=${profile.id}` as Href)} style={[styles.nextCard, { backgroundColor: theme.surface, borderColor: theme.hairline }]} accessibilityRole="button">
                      <Text style={[styles.nextTitle, { color: theme.ink }]}>{t(`kind.${next}.title`)}</Text>
                      <Text style={[styles.nextSub, { color: theme.ink2 }]} numberOfLines={1}>{t(`kind.${next}.sub`)}</Text>
                    </TouchableOpacity>
                  );
                })()}
              </View>
            </View>
          )}

          <Text style={[styles.footnote, { color: theme.muted }]}>{report.disclaimer}</Text>
        </ScrollView>
      )}

      {/* Offscreen copy of the summary for the shared image. */}
      {report && (
        <View style={styles.offscreen} pointerEvents="none">
          <View style={[styles.shareFrame, { backgroundColor: theme.bg }]} ref={shareRef} collapsable={false}>
            <Text style={[styles.shareTitle, { color: theme.ink }]}>{isCompat ? report.summary.eyebrow : `${title} · ${first}`}</Text>
            <ReportSummaryCard report={report} branded />
          </View>
        </View>
      )}
    </ScreenLayout>
  );
}

// ─── One chapter ─────────────────────────────────────────────────────────────

function ChapterBody({ c, open, onToggle, showDasha, onDasha, latin }: {
  c: Chapter; open: boolean; onToggle: () => void; showDasha: boolean; onDasha: () => void; latin: boolean;
}) {
  const styles = useIndicStyles(baseStyles);
  const { theme } = useAccent();
  const { t } = useTranslation('reports');

  if (c.type === 'helps') {
    return (
      <>
        <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.hairline }]}>
          {c.items.map((h, i) => (
            <View key={h.t} style={[styles.helpRow, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.hairline }]}>
              <View style={[styles.tick, { backgroundColor: TILE_BG }]}><Icon name="check" size={12} color={theme.accent} /></View>
              <View style={styles.flex}>
                <Text style={[styles.helpT, { color: theme.ink }]}>{h.t}</Text>
                <Text style={[styles.helpS, { color: theme.ink2 }]}>{h.s}</Text>
              </View>
            </View>
          ))}
        </View>
        <Text style={[styles.note, { color: theme.muted }]}>{t('detail.helpsNote')}</Text>
      </>
    );
  }

  const why = (
    <>
      <TouchableOpacity onPress={onToggle} style={styles.whyBtn} accessibilityRole="button" accessibilityState={{ expanded: open }}>
        <View style={open ? styles.flip : undefined}><Icon name="chevron-down" size={12} color={theme.muted} /></View>
        <Text style={[styles.whyLabel, { color: theme.muted }]}>{t('detail.why')}</Text>
      </TouchableOpacity>
      {open && (
        <Animated.View entering={FadeIn.duration(160)} style={[styles.whyBox, { backgroundColor: theme.surface2 }]}>
          <Text style={[styles.whyText, { color: theme.ink2 }]}>{c.why}</Text>
        </Animated.View>
      )}
    </>
  );

  if (c.type === 'timing') {
    return (
      <>
        <EmText text={c.body} style={[styles.body, { color: theme.ink }]} />
        <View>
          {c.items.map((it, i) => {
            const dot = it.state === 'now' ? 14 : 10;
            return (
              <View key={`${it.start}-${i}`} style={styles.tlRow}>
                <View style={styles.tlRail}>
                  <View style={{
                    marginTop: 5, width: dot, height: dot, borderRadius: dot / 2, borderWidth: 2,
                    backgroundColor: it.state === 'now' ? theme.accent : theme.bg,
                    borderColor: it.state === 'later' ? theme.faint : theme.accent,
                  }} />
                  <View style={[styles.tlLine, { backgroundColor: i === c.items.length - 1 ? 'transparent' : theme.hairline2 }]} />
                </View>
                <View style={styles.tlBody}>
                  <View style={styles.tlMeta}>
                    <Text style={[styles.tlDate, { color: it.state === 'now' ? theme.accent : theme.muted }, latin && styles.upper]}>{it.date}</Text>
                    <View style={[styles.tag, { borderColor: theme.hairline2 }]}>
                      <Text style={[styles.tagText, { color: theme.muted }, latin && styles.upper]}>{it.tag}</Text>
                    </View>
                  </View>
                  <Text style={[styles.tlTitle, { color: theme.ink }]}>{it.title}</Text>
                  <Text style={[styles.tlSub, { color: theme.ink2 }]}>{it.sub}</Text>
                </View>
              </View>
            );
          })}
        </View>
        {showDasha && (
          <TouchableOpacity onPress={onDasha} style={[styles.outlinePill, { borderColor: theme.hairline2, backgroundColor: theme.surface }]} accessibilityRole="button">
            <Text style={[styles.outlineText, { color: theme.ink }]}>{t('detail.seeAllChapters')}</Text>
            <Icon name="chevron" size={12} color={theme.ink} />
          </TouchableOpacity>
        )}
        {why}
      </>
    );
  }

  return (
    <>
      <EmText text={c.body} style={[styles.body, { color: theme.ink }]} />
      {c.items.length > 0 && (
        <View style={styles.list}>
          {c.items.map((it) => (
            <View key={it} style={styles.li}>
              <View style={[styles.bullet, { backgroundColor: c.tone === 'watch' ? theme.faint : theme.accent }]} />
              <Text style={[styles.liText, { color: theme.ink2 }]}>{it}</Text>
            </View>
          ))}
        </View>
      )}
      {why}
    </>
  );
}

const baseStyles = StyleSheet.create({
  scroll: { flex: 1 },
  content: { paddingHorizontal: 22, paddingTop: 18, paddingBottom: 40, gap: 26 },
  flex: { flex: 1 },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 },
  card: { borderRadius: RADIUS.card, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  lockedCard: { padding: 18, gap: 10 },
  row8: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  row10: { flexDirection: 'row', gap: 10 },
  icon40: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },

  chipsBar: { borderBottomWidth: StyleSheet.hairlineWidth },
  noGrow: { flexGrow: 0 },
  chips: { gap: 8, paddingHorizontal: 22, paddingVertical: 12 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 36, paddingHorizontal: 14, borderRadius: RADIUS.pill, borderWidth: 1 },
  chipN: { fontFamily: FONTS.monoRegular, fontSize: 10.5, lineHeight: 14, opacity: 0.7 },
  chipLabel: { fontFamily: FONTS.sansMedium, fontSize: 13, lineHeight: 17 },

  notice: { flexDirection: 'row', gap: 10, padding: 14, borderRadius: RADIUS.medium },
  noticeText: { flex: 1, fontFamily: FONTS.sansRegular, fontSize: 12.5, lineHeight: 18 },

  chapter: { gap: 10 },
  chHead: { flexDirection: 'row', alignItems: 'baseline', gap: 10 },
  chN: { fontFamily: FONTS.monoRegular, fontSize: 11, lineHeight: 14, letterSpacing: 0.9 },
  h2: { flex: 1, fontFamily: FONTS.serifItalic, fontSize: 26, lineHeight: 30 },
  body: { fontFamily: FONTS.sansRegular, fontSize: 15, lineHeight: 23 },
  list: { gap: 8 },
  li: { flexDirection: 'row', gap: 10 },
  bullet: { marginTop: 8, width: 6, height: 6, borderRadius: 3 },
  liText: { flex: 1, fontFamily: FONTS.sansRegular, fontSize: 14.5, lineHeight: 21 },
  whyBtn: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 36, paddingHorizontal: 2 },
  flip: { transform: [{ rotate: '180deg' }] },
  whyLabel: { fontFamily: FONTS.sansRegular, fontSize: 12.5, lineHeight: 17 },
  whyBox: { paddingVertical: 12, paddingHorizontal: 14, borderRadius: RADIUS.medium },
  whyText: { fontFamily: FONTS.sansRegular, fontSize: 12.5, lineHeight: 18 },

  tlRow: { flexDirection: 'row', gap: 14 },
  tlRail: { width: 16, alignItems: 'center' },
  tlLine: { flex: 1, width: 2 },
  tlBody: { flex: 1, minWidth: 0, gap: 3, paddingBottom: 18 },
  tlMeta: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  tlDate: { fontFamily: FONTS.monoRegular, fontSize: 11, lineHeight: 15, letterSpacing: 0.4 },
  upper: { textTransform: 'uppercase' },
  tag: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: RADIUS.pill, borderWidth: 1 },
  tagText: { fontFamily: FONTS.monoRegular, fontSize: 9.5, lineHeight: 12, letterSpacing: 0.8 },
  tlTitle: { fontFamily: FONTS.sansMedium, fontSize: 15, lineHeight: 20 },
  tlSub: { fontFamily: FONTS.sansRegular, fontSize: 13.5, lineHeight: 19 },
  outlinePill: {
    alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6,
    minHeight: 40, paddingHorizontal: 14, borderRadius: RADIUS.pill, borderWidth: 1,
  },
  outlineText: { fontFamily: FONTS.sansRegular, fontSize: 13, lineHeight: 18 },

  helpRow: { flexDirection: 'row', gap: 12, paddingVertical: 13, paddingHorizontal: 16 },
  tick: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  helpT: { fontFamily: FONTS.sansMedium, fontSize: 14.5, lineHeight: 20 },
  helpS: { fontFamily: FONTS.sansRegular, fontSize: 13, lineHeight: 18 },
  note: { fontFamily: FONTS.sansRegular, fontSize: 12, lineHeight: 17 },

  askCard: { gap: 12, padding: 16, borderRadius: 22, borderWidth: 1 },
  askHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  askTitle: { fontFamily: FONTS.serifItalic, fontSize: 20, lineHeight: 23 },
  askSub: { fontFamily: FONTS.sansRegular, fontSize: 12.5, lineHeight: 17 },
  askChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  askChip: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: RADIUS.pill },
  askChipText: { fontFamily: FONTS.sansRegular, fontSize: 13, lineHeight: 18 },

  keepRow: { flexDirection: 'row', gap: 10 },
  keepBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    minHeight: 48, paddingHorizontal: 12, borderRadius: RADIUS.pill, borderWidth: 1,
  },
  keepText: { fontFamily: FONTS.sansMedium, fontSize: 14, lineHeight: 18 },

  readNext: { gap: 10 },
  nextCard: { flex: 1, gap: 3, padding: 14, borderRadius: RADIUS.card, borderWidth: StyleSheet.hairlineWidth },
  nextTitle: { fontFamily: FONTS.serifItalic, fontSize: 18, lineHeight: 21 },
  nextSub: { fontFamily: FONTS.sansRegular, fontSize: 11.5, lineHeight: 15 },

  footnote: { marginHorizontal: 4, fontFamily: FONTS.sansRegular, fontSize: 12, lineHeight: 17 },

  offscreen: { position: 'absolute', left: -10000, top: 0, width: 390 },
  shareFrame: { padding: 22, gap: 12 },
  shareTitle: { fontFamily: FONTS.serifItalic, fontSize: 22, lineHeight: 26 },
});
