'use no memo'; // renders call language helpers (tPlanet, intlLocale, ...) that the React Compiler would otherwise cache across language switches

import { useRef, useState } from 'react';
import { ScrollView, Share, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Trans, useTranslation } from 'react-i18next';
import { useAccent } from '@/hooks/use-accent';
import { Icon } from '@/components/atoms/Icon';
import { EyebrowLabel } from '@/components/atoms/EyebrowLabel';
import { Toggle } from '@/components/atoms/Toggle';
import { ScreenLayout } from '@/components/templates/ScreenLayout';
import { ShareableAnswerCard, type AnswerCardLook } from '@/components/molecules/ShareableAnswerCard';
import { FONTS, RADIUS } from '@/constants/themes';
import { captureAndShare } from '@/utils/share';
import { todayIso } from '@/utils/format';
import { intlLocale } from '@/utils/i18n';
import { useIndicStyles } from '@/hooks/use-indic-styles';

// Labels come from chat:share.<id>.
const LOOK_OPTIONS: AnswerCardLook[] = ['light', 'dark'];

export default function ShareAnswerScreen() {
  const styles = useIndicStyles(baseStyles);
  const { theme } = useAccent();
  const { t, i18n } = useTranslation('chat');
  const indic = i18n.language !== 'en';
  const params = useLocalSearchParams<{
    question?:    string;
    answer?:      string;
    persona?:     string;
    profileName?: string;
  }>();

  const answer      = (params.answer ?? '').trim();
  const question    = (params.question ?? '').trim();
  const persona     = params.persona === 'krishna' ? 'krishna' : 'saga';
  const profileName = params.profileName ?? '';

  const [look, setLook]                 = useState<AnswerCardLook>('light');
  const [hideQuestion, setHideQuestion] = useState(false);
  const cardRef = useRef<View>(null);

  const dateLabel = new Date().toLocaleDateString(intlLocale(), { month: 'short', day: 'numeric', year: 'numeric' });

  const handleShareImage = () => {
    captureAndShare(cardRef.current, `astropedia-answer-${todayIso()}.png`);
  };

  // Plain-text fallback for apps that don't take images.
  const handleShareText = () => {
    const who  = persona === 'krishna' ? t('persona.krishna') : t('persona.saga');
    const head = question && !hideQuestion ? `“${question}”\n\n` : '';
    Share.share({ message: `${head}${answer}\n\n${t('share.signature', { who })}` }).catch(() => {});
  };

  return (
    <ScreenLayout edges={['top', 'bottom', 'left', 'right']}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <EyebrowLabel size={11}>{t('share.eyebrow')}</EyebrowLabel>
          <Text style={[styles.title, indic && styles.titleIndic, { color: theme.ink }]}>
            <Trans t={t} i18nKey="share.title" components={{ em: <Text style={styles.titleItalic} /> }} />
          </Text>
        </View>
        <TouchableOpacity
          onPress={() => router.back()}
          style={[styles.close, { borderColor: theme.hairline2 }]}
          accessibilityLabel={t('share.close')}
        >
          <Icon name="close" size={18} color={theme.ink} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {answer ? (
          <ShareableAnswerCard
            ref={cardRef}
            answer={answer}
            question={hideQuestion ? undefined : question}
            persona={persona}
            profileName={profileName}
            look={look}
            dateLabel={dateLabel}
          />
        ) : (
          <Text style={[styles.empty, { color: theme.muted }]}>{t('share.empty')}</Text>
        )}

        {/* Options */}
        <View style={[styles.options, { backgroundColor: theme.surface, borderColor: theme.hairline }]}>
          <View style={styles.optionRow}>
            <Text style={[styles.optionLabel, { color: theme.ink2 }]}>{t('share.style')}</Text>
            <View style={[styles.segment, { backgroundColor: theme.surface2 }]} accessibilityRole="radiogroup">
              {LOOK_OPTIONS.map((o) => {
                const on = o === look;
                return (
                  <TouchableOpacity
                    key={o}
                    onPress={() => setLook(o)}
                    style={[styles.segBtn, on && { backgroundColor: theme.surface3 }]}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: on }}
                  >
                    <Text style={[styles.segText, { color: on ? theme.ink : theme.muted }]}>{t(`share.${o}`)}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
          {question ? (
            <>
              <View style={[styles.divider, { backgroundColor: theme.hairline }]} />
              <View style={styles.optionRow}>
                <Text style={[styles.optionLabel, { color: theme.ink2 }]}>{t('share.hideQuestion')}</Text>
                <Toggle
                  value={hideQuestion}
                  onValueChange={setHideQuestion}
                  accessibilityLabel={t('share.hideQuestion')}
                />
              </View>
            </>
          ) : null}
        </View>

        {/* Actions */}
        <View style={styles.actions}>
          <TouchableOpacity
            onPress={handleShareText}
            disabled={!answer}
            style={[styles.btn, { borderColor: theme.hairline2, backgroundColor: theme.surface }]}
          >
            <Text style={[styles.btnText, { color: theme.ink }]}>{t('share.shareText')}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={handleShareImage}
            disabled={!answer}
            style={[styles.btn, { borderColor: theme.ink, backgroundColor: theme.ink }]}
          >
            <Icon name="share" size={16} color={theme.bg} />
            <Text style={[styles.btnText, { color: theme.bg }]}>{t('share.shareImage')}</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </ScreenLayout>
  );
}

const baseStyles = StyleSheet.create({
  header: {
    flexDirection:     'row',
    alignItems:        'flex-start',
    gap:               12,
    paddingHorizontal: 20,
    paddingTop:        18,
    paddingBottom:     8,
  },
  title: {
    fontFamily: FONTS.serifRegular,
    fontSize:   30,
    lineHeight: 34,
    marginTop:  6,
  },
  titleIndic:  { lineHeight: 42 },
  titleItalic: { fontFamily: FONTS.serifItalic },
  close: {
    width:          44,
    height:         44,
    borderRadius:   22,
    borderWidth:    StyleSheet.hairlineWidth,
    alignItems:     'center',
    justifyContent: 'center',
  },
  content: {
    padding: 20,
    gap:     16,
  },
  empty: {
    fontFamily: FONTS.sansRegular,
    fontSize:   14,
    textAlign:  'center',
    paddingVertical: 40,
  },
  options: {
    borderRadius: RADIUS.card + 4,
    borderWidth:  StyleSheet.hairlineWidth,
    paddingHorizontal: 16,
    paddingVertical:   10,
  },
  optionRow: {
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'space-between',
    minHeight:      44,
    gap:            12,
  },
  optionLabel: {
    flexShrink: 1,
    fontFamily: FONTS.sansRegular,
    fontSize:   14,
  },
  segment: {
    flexDirection: 'row',
    gap:           4,
    padding:       3,
    borderRadius:  RADIUS.pill,
  },
  segBtn: {
    minHeight:         38,
    paddingHorizontal: 16,
    borderRadius:      RADIUS.pill,
    justifyContent:    'center',
  },
  segText: {
    fontFamily: FONTS.sansRegular,
    fontSize:   13,
  },
  divider: {
    height:         StyleSheet.hairlineWidth,
    marginVertical: 6,
  },
  actions: {
    flexDirection: 'row',
    gap:           10,
  },
  btn: {
    flex:           1,
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'center',
    gap:            8,
    minHeight:      52,
    borderRadius:   RADIUS.button,
    borderWidth:    1,
  },
  btnText: {
    fontFamily: FONTS.sansMedium,
    fontSize:   15,
  },
});
