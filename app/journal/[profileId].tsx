import { useCallback, useEffect, useMemo, useState } from 'react';
import { Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { useAccent } from '@/hooks/use-accent';
import { useProfiles } from '@/hooks/use-profiles';
import { Icon } from '@/components/atoms/Icon';
import { EyebrowLabel } from '@/components/atoms/EyebrowLabel';
import { SwipeRow } from '@/components/molecules/SwipeRow';
import { ScreenLayout } from '@/components/templates/ScreenLayout';
import {
  deleteJournalEntry,
  getJournalEntries,
  upsertJournalEntry,
  type JournalEntry,
} from '@/utils/database';
import { dayContext, journalInsight, MIN_ENTRIES, moodLabel } from '@/utils/journal-insights';
import { getPanchang } from '@/utils/panchang';
import { todayIso } from '@/utils/format';
import { formatDayDate, intlLocale, tNakshatra, tPlanet } from '@/utils/i18n';
import { FONTS, RADIUS } from '@/constants/themes';

/** Mood ids are stored in the database as-is; labels come from `journal:mood.<id>`. */
const MOODS = [
  { id: 'Calm',     dot: '#4F8A60' },
  { id: 'Happy',    dot: '#E0AD5C' },
  { id: 'Focused',  dot: '#4C7FA8' },
  { id: 'Restless', dot: '#B4676A' },
  { id: 'Anxious',  dot: '#C98A4B' },
  { id: 'Drained',  dot: '#7D5FB8' },
] as const;

/** Short month name in the app language. */
function monthShort(month: number): string {
  return new Date(2000, month - 1, 1).toLocaleDateString(intlLocale(), { month: 'short' });
}

function moodDot(mood: string, fallback: string): string {
  return MOODS.find((m) => m.id === mood)?.dot ?? fallback;
}

export default function JournalScreen() {
  const { t, i18n }   = useTranslation('journal');
  const { theme }     = useAccent();
  const { profileId } = useLocalSearchParams<{ profileId: string }>();
  const { profiles }  = useProfiles();
  const profile       = profiles.find((p) => p.id === profileId);

  const today = todayIso();
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [loaded, setLoaded]   = useState(false);
  const [mood, setMood]       = useState<string | null>(null);
  const [text, setText]       = useState('');
  const [saved, setSaved]     = useState<{ mood: string; text: string } | null>(null);
  const [saving, setSaving]   = useState(false);

  const load = useCallback(async () => {
    if (!profileId) return;
    const list = await getJournalEntries(profileId);
    setEntries(list);
    setLoaded(true);
    return list;
  }, [profileId]);

  // Initial load; pre-fill today's entry if there is one.
  useEffect(() => {
    load().then((list) => {
      const t = list?.find((e) => e.date === today);
      if (t) {
        setMood(t.mood);
        setText(t.text);
        setSaved({ mood: t.mood, text: t.text });
      }
    });
  }, [load, today]);

  const birthInfo = profile?.birthDate ? profile : null;

  const todayCtx = useMemo(
    () => (birthInfo ? dayContext(birthInfo, today) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [birthInfo?.birthDate, birthInfo?.birthTime, birthInfo?.birthLng, today],
  );
  const todayNak = useMemo(() => getPanchang(today).nakshatra.name, [today]);

  const earlier = useMemo(
    () =>
      entries
        .filter((e) => e.date !== today)
        .map((e) => ({
          entry: e,
          sub:   birthInfo ? dayContext(birthInfo, e.date)?.subLord ?? null : null,
          nak:   getPanchang(e.date).nakshatra.name,
        })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [entries, today, birthInfo?.birthDate, birthInfo?.birthTime, birthInfo?.birthLng],
  );

  const insight = useMemo(
    () => (birthInfo ? journalInsight(birthInfo, entries) : null),
    // The insight sentence is translated, so recompute on language change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [entries, birthInfo?.birthDate, birthInfo?.birthTime, birthInfo?.birthLng, i18n.language],
  );

  if (!profile) {
    if (profiles.length > 0) router.back();
    return null;
  }

  const dirty   = !!mood && (saved?.mood !== mood || saved?.text !== text.trim());
  const canSave = dirty && !saving;

  const save = async () => {
    if (!mood || !canSave) return;
    setSaving(true);
    try {
      const body = text.trim();
      await upsertJournalEntry(profile.id, today, mood, body);
      setSaved({ mood, text: body });
      setText(body);
      await load();
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    await deleteJournalEntry(id);
    await load();
  };

  const isYou   = profile.isYou;
  const first   = profile.name.split(' ')[0];

  let insightBody: string;
  if (insight) insightBody = insight.sentence;
  else if (!profile.birthDate) insightBody = t('empty.noBirth');
  else if (entries.length < MIN_ENTRIES) insightBody = t('empty.tooFew');
  else insightBody = t('empty.noPattern');

  const saveLabel = saving
    ? t('save.saving')
    : !dirty && saved ? t('save.saved') : saved ? t('save.update') : t('save.save');

  return (
    <ScreenLayout edges={['top', 'left', 'right']}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
      >
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => router.back()}
            style={[styles.back, { borderColor: theme.hairline2 }]}
            accessibilityLabel={t('back')}
          >
            <Icon name="back" size={20} color={theme.ink} />
          </TouchableOpacity>
        </View>

        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
        >
          {/* Today */}
          <View style={styles.section}>
            <EyebrowLabel size={11}>
              {t('eyebrow', { date: formatDayDate(new Date()), nakshatra: tNakshatra(todayNak) })}
              {todayCtx ? ` · ${t('subPeriod', { planet: tPlanet(todayCtx.subLord) })}` : ''}
            </EyebrowLabel>
            <Text style={[styles.title, { color: theme.ink }]}>
              {t(isYou ? 'title.you.before' : 'title.other.before', { name: first })}
              <Text style={[styles.titleItalic, { color: theme.accent }]}>{t('title.em')}</Text>
              {t('title.after')}
            </Text>

            <View style={styles.pills} accessibilityRole="radiogroup">
              {MOODS.map((m) => {
                const on = m.id === mood;
                return (
                  <TouchableOpacity
                    key={m.id}
                    onPress={() => setMood(m.id)}
                    activeOpacity={0.8}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: on }}
                    style={[
                      styles.pill,
                      on
                        ? { backgroundColor: theme.ink, borderColor: theme.ink }
                        : { backgroundColor: theme.surface, borderColor: theme.hairline2 },
                    ]}
                  >
                    <View style={[styles.dot, { backgroundColor: m.dot }]} />
                    <Text style={[styles.pillText, { color: on ? theme.bg : theme.ink }]}>{moodLabel(m.id)}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <TextInput
              value={text}
              onChangeText={setText}
              placeholder={t('placeholder')}
              placeholderTextColor={theme.muted}
              multiline
              textAlignVertical="top"
              style={[
                styles.input,
                { color: theme.ink, backgroundColor: theme.surface, borderColor: theme.hairline },
              ]}
            />

            <TouchableOpacity
              onPress={save}
              disabled={!canSave}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityState={{ disabled: !canSave }}
              style={[
                styles.saveBtn,
                { backgroundColor: canSave ? theme.accent : theme.surface3 },
              ]}
            >
              {!dirty && saved ? <Icon name="check" size={16} color={theme.muted} /> : null}
              <Text style={[styles.saveText, { color: canSave ? theme.accentFg : theme.muted }]}>
                {saveLabel}
              </Text>
            </TouchableOpacity>
            <Text style={[styles.note, { color: theme.muted }]}>{t('privacy')}</Text>
          </View>

          {/* Pattern */}
          {loaded ? (
            <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.hairline }]}>
              <EyebrowLabel size={11}>
                {insight ? t('pattern') : t('patternProgress', { n: entries.length, total: MIN_ENTRIES })}
              </EyebrowLabel>
              <Text style={[insight ? styles.insight : styles.body, { color: insight ? theme.ink : theme.ink2 }]}>
                {insightBody}
              </Text>
            </View>
          ) : null}

          {/* Earlier */}
          {earlier.length > 0 ? (
            <View>
              <EyebrowLabel size={11}>{t('earlier')}</EyebrowLabel>
              <Text style={[styles.hint, { color: theme.faint }]}>{t('swipeHint')}</Text>
              {earlier.map(({ entry, sub, nak }) => {
                const [, mo, dy] = entry.date.split('-').map(Number);
                return (
                  <SwipeRow
                    key={entry.id}
                    actions={[{ label: t('delete'), color: '#B4676A', onAction: () => remove(entry.id) }]}
                  >
                    <View style={[styles.row, { backgroundColor: theme.bg, borderBottomColor: theme.hairline }]}>
                      <View style={styles.rowDate}>
                        <Text style={[styles.rowMon, { color: theme.muted }]}>{monthShort(mo).toUpperCase()}</Text>
                        <Text style={[styles.rowDay, { color: theme.ink }]}>{dy}</Text>
                      </View>
                      <View style={{ flex: 1, gap: 3 }}>
                        <View style={styles.rowMoodLine}>
                          <View style={[styles.dot, { backgroundColor: moodDot(entry.mood, theme.faint) }]} />
                          <Text style={[styles.rowMood, { color: theme.ink }]}>{moodLabel(entry.mood)}</Text>
                        </View>
                        <Text style={[styles.rowMeta, { color: theme.muted }]}>
                          {sub
                            ? t('rowMetaSub', { planet: tPlanet(sub), nakshatra: tNakshatra(nak) })
                            : t('rowMeta', { nakshatra: tNakshatra(nak) })}
                        </Text>
                        {entry.text ? (
                          <Text style={[styles.rowText, { color: theme.ink2 }]} numberOfLines={3}>
                            {entry.text}
                          </Text>
                        ) : null}
                      </View>
                    </View>
                  </SwipeRow>
                );
              })}
            </View>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
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
  section: { gap: 16 },
  title: {
    fontFamily:    FONTS.serifRegular,
    fontSize:      40,
    lineHeight:    44,
    letterSpacing: -0.5,
  },
  titleItalic: { fontFamily: FONTS.serifItalic },
  pills: {
    flexDirection: 'row',
    flexWrap:      'wrap',
    gap:           8,
    marginTop:     4,
  },
  pill: {
    minHeight:         44,
    paddingHorizontal: 16,
    borderRadius:      RADIUS.pill,
    borderWidth:       1,
    flexDirection:     'row',
    alignItems:        'center',
    gap:               8,
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
  pillText: {
    fontFamily: FONTS.sansMedium,
    fontSize:   14.5,
  },
  input: {
    minHeight:         110,
    borderRadius:      RADIUS.card,
    borderWidth:       StyleSheet.hairlineWidth,
    paddingHorizontal: 16,
    paddingTop:        14,
    paddingBottom:     14,
    fontFamily:        FONTS.sansRegular,
    fontSize:          15.5,
    lineHeight:        22,
  },
  saveBtn: {
    minHeight:      52,
    borderRadius:   RADIUS.button,
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'center',
    gap:            8,
  },
  saveText: {
    fontFamily: FONTS.sansMedium,
    fontSize:   15.5,
  },
  note: {
    fontFamily: FONTS.sansRegular,
    fontSize:   12.5,
    textAlign:  'center',
    marginTop:  -4,
  },
  card: {
    borderRadius: RADIUS.card + 4,
    borderWidth:  StyleSheet.hairlineWidth,
    padding:      22,
    gap:          10,
  },
  insight: {
    fontFamily: FONTS.serifRegular,
    fontSize:   22,
    lineHeight: 28,
  },
  body: {
    fontFamily: FONTS.sansRegular,
    fontSize:   15,
    lineHeight: 22,
  },
  hint: {
    fontFamily: FONTS.sansRegular,
    fontSize:   12.5,
    marginTop:  6,
    marginBottom: 4,
  },
  row: {
    flexDirection:     'row',
    gap:               16,
    paddingVertical:   16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowDate: { width: 44, alignItems: 'flex-start' },
  rowMon: {
    fontFamily:    FONTS.monoRegular,
    fontSize:      10.5,
    letterSpacing: 0.9,
  },
  rowDay: {
    fontFamily: FONTS.serifRegular,
    fontSize:   26,
    lineHeight: 30,
  },
  rowMoodLine: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           8,
  },
  rowMood: {
    fontFamily: FONTS.sansMedium,
    fontSize:   15.5,
  },
  rowMeta: {
    fontFamily: FONTS.sansRegular,
    fontSize:   12.5,
  },
  rowText: {
    fontFamily: FONTS.sansRegular,
    fontSize:   14,
    lineHeight: 20,
    marginTop:  2,
  },
});
