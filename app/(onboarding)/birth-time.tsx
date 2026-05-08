import { useState } from 'react';
import { Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { router } from 'expo-router';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useAccent } from '@/hooks/use-accent';
import { Icon } from '@/components/atoms/Icon';
import { Button } from '@/components/atoms/Button';
import { ScreenLayout } from '@/components/templates/ScreenLayout';
import { EyebrowLabel } from '@/components/atoms/EyebrowLabel';
import { FONTS, RADIUS } from '@/constants/themes';
import OnboardingStore from './_store';

function parseStoredTime(stored: string): Date | null {
  if (!stored) return null;
  const [h, m] = stored.split(':').map(Number);
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d;
}

export default function BirthTimeScreen() {
  const { theme } = useAccent();

  const [time, setTime] = useState<Date | null>(
    parseStoredTime(OnboardingStore.birthTime),
  );

  const handleContinue = () => {
    if (!time) return;
    const hh = String(time.getHours()).padStart(2, '0');
    const mm = String(time.getMinutes()).padStart(2, '0');
    OnboardingStore.birthTime = `${hh}:${mm}`;
    router.push('/(onboarding)/birth-place');
  };

  const timeLabel = time
    ? time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : null;

  return (
    <ScreenLayout edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} hitSlop={8}>
          <Icon name="back" size={22} color={theme.ink} />
        </TouchableOpacity>
        <Text style={[styles.step, { color: theme.muted }]}>03 / 04 — Time</Text>
      </View>

      <View style={styles.content}>
        <Text style={[styles.display, { color: theme.ink }]}>
          What time did{'\n'}
          <Text style={styles.italic}>you arrive?</Text>
        </Text>

        <Text style={[styles.hint, { color: theme.ink2 }]}>
          Birth time gives us your Rising sign and precise house placements — the most personal part of your chart.
        </Text>

        <EyebrowLabel style={styles.fieldLabel}>Time of birth</EyebrowLabel>

        <View style={[styles.pickerCard, { backgroundColor: theme.surface2 }]}>
          <DateTimePicker
            value={time ?? new Date(0, 0, 0, 12, 0)}
            mode="time"
            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
            onChange={(_, t) => t && setTime(t)}
            style={styles.picker}
            themeVariant={theme.bg === '#faf9f6' ? 'light' : 'dark'}
          />
        </View>

        {timeLabel && (
          <View style={[styles.preview, { backgroundColor: theme.surface2 }]}>
            <Text style={[styles.previewLabel, { color: theme.muted }]}>Selected time</Text>
            <Text style={[styles.previewValue, { color: theme.ink }]}>{timeLabel}</Text>
          </View>
        )}
      </View>

      <View style={styles.footer}>
        <Button
          label="Continue"
          variant="accent"
          fullWidth
          disabled={!time}
          onPress={handleContinue}
        />
      </View>
    </ScreenLayout>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection:     'row',
    alignItems:        'center',
    justifyContent:    'space-between',
    paddingHorizontal: 24,
    paddingTop:        20,
    paddingBottom:     8,
  },
  backBtn: { padding: 4 },
  step: {
    fontFamily:    FONTS.monoRegular,
    fontSize:      11,
    letterSpacing: 0.9,
    textTransform: 'uppercase',
  },
  content: {
    flex:       1,
    padding:    32,
    paddingTop: 20,
  },
  display: {
    fontFamily:   FONTS.serifRegular,
    fontSize:     40,
    lineHeight:   44,
    marginBottom: 16,
  },
  italic: { fontFamily: FONTS.serifItalic },
  hint: {
    fontFamily:   FONTS.sansRegular,
    fontSize:     14.5,
    lineHeight:   22,
    marginBottom: 32,
  },
  fieldLabel:  { marginBottom: 12 },
  pickerCard: {
    borderRadius: RADIUS.card,
    overflow:     'hidden',
    marginBottom: 20,
    alignItems:   'flex-start',
    padding:      8,
  },
  picker:  { alignSelf: 'flex-start' },
  preview: {
    borderRadius: RADIUS.card,
    padding:      16,
    gap:          4,
  },
  previewLabel: {
    fontFamily:    FONTS.monoRegular,
    fontSize:      10,
    letterSpacing: 0.9,
    textTransform: 'uppercase',
  },
  previewValue: {
    fontFamily: FONTS.serifItalic,
    fontSize:   22,
  },
  footer: {
    padding:    32,
    paddingTop: 12,
  },
});
