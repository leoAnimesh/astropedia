import { StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useAccent } from '@/hooks/use-accent';
import { Button } from '@/components/atoms/Button';
import { ScreenLayout } from '@/components/templates/ScreenLayout';
import { FONTS } from '@/constants/themes';

export default function WelcomeScreen() {
  const { theme } = useAccent();
  return (
    <ScreenLayout>
      <View style={[styles.horizon, { backgroundColor: theme.accentMuted }]} />
      <View style={styles.content}>
        <View style={styles.top}>
          <Text style={[styles.eyebrow, { color: theme.muted }]}>Astropedia</Text>
          <Text style={[styles.display, { color: theme.ink }]}>
            The stars,{'\n'}
            <Text style={styles.italic}>annotated.</Text>
          </Text>
          <Text style={[styles.body, { color: theme.ink2 }]}>
            A friendly, grounded astrology companion. Build a profile for yourself or anyone you love — then ask anything.
          </Text>
        </View>
        <View style={styles.actions}>
          <Button
            label="Begin"
            variant="accent"
            fullWidth
            onPress={() => router.push('/(onboarding)/name')}
          />
        </View>
      </View>
    </ScreenLayout>
  );
}

const styles = StyleSheet.create({
  horizon: {
    position: 'absolute',
    bottom:   0,
    left:     0,
    right:    0,
    height:   '45%',
    opacity:  0.5,
  },
  content: {
    flex:    1,
    padding: 32,
    paddingTop: 90,
    justifyContent: 'space-between',
  },
  top: {
    flex: 1,
  },
  eyebrow: {
    fontFamily:    FONTS.monoRegular,
    fontSize:      11,
    letterSpacing: 0.9,
    textTransform: 'uppercase',
    marginBottom:  18,
  },
  display: {
    fontFamily: FONTS.serifRegular,
    fontSize:   60,
    lineHeight: 60,
  },
  italic: {
    fontFamily: FONTS.serifItalic,
  },
  body: {
    fontFamily:  FONTS.sansRegular,
    fontSize:    16.5,
    lineHeight:  25,
    marginTop:   28,
    maxWidth:    320,
  },
  actions: {
    gap: 10,
  },
});
