import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { router } from 'expo-router';
import { useAccent } from '@/hooks/use-accent';
import { useProfiles } from '@/hooks/use-profiles';
import { useSettingsStore } from '@/stores/settings-store';
import { ScreenLayout } from '@/components/templates/ScreenLayout';
import { EyebrowLabel } from '@/components/atoms/EyebrowLabel';
import { Toggle } from '@/components/atoms/Toggle';
import { Avatar } from '@/components/atoms/Avatar';
import { Icon } from '@/components/atoms/Icon';
import { FONTS, RADIUS, ACCENT_THEMES, ACCENT_LABEL, type AccentKey } from '@/constants/themes';
import { clearAllData } from '@/utils/database';
import { Storage } from '@/utils/storage';

const ACCENT_KEYS: AccentKey[] = ['amber', 'sage', 'lilac', 'blush', 'ink'];

export default function SettingsScreen() {
  const { theme, accentKey, setAccentKey, isDark } = useAccent();
  const { profiles } = useProfiles();
  const setDark = useSettingsStore((s) => s.setDarkModeOverride);
  const darkOverride = useSettingsStore((s) => s.darkModeOverride);

  const handleReset = () => {
    Alert.alert(
      'Reset all data',
      'This will delete all profiles, chats, and settings. Cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: async () => {
            await clearAllData();
            Storage.clear();
            router.replace('/(onboarding)');
          },
        },
      ],
    );
  };

  return (
    <ScreenLayout edges={['top', 'left', 'right']}>
      <View style={[styles.header, { borderBottomColor: theme.hairline }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.back}>
          <Icon name="back" size={22} color={theme.ink} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: theme.ink }]}>
          <Text style={styles.titleItalic}>Settings</Text>
        </Text>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        {/* Appearance */}
        <EyebrowLabel style={styles.sectionLabel}>Appearance</EyebrowLabel>
        <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.hairline }]}>
          <Text style={[styles.cardLabel, { color: theme.ink2 }]}>Accent color</Text>
          <View style={styles.swatchRow}>
            {ACCENT_KEYS.map((key) => {
              const isActive = key === accentKey;
              return (
                <TouchableOpacity
                  key={key}
                  style={[
                    styles.swatch,
                    {
                      backgroundColor: ACCENT_THEMES[key].accent,
                      borderWidth:     isActive ? 2 : 1,
                      borderColor:     isActive ? theme.ink : theme.hairline2,
                    },
                  ]}
                  onPress={() => setAccentKey(key)}
                  accessibilityLabel={ACCENT_LABEL[key]}
                >
                  {isActive && (
                    <Text style={styles.swatchCheck}>✓</Text>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>

          <View style={[styles.divider, { backgroundColor: theme.hairline }]} />

          <Toggle
            value={isDark}
            onValueChange={(v) => setDark(v ? 'dark' : 'light')}
            label="Dark mode"
            sublabel="Easier on the eyes after dusk."
          />
        </View>

        {/* Conversations */}
        <EyebrowLabel style={[styles.sectionLabel, { marginTop: 24 }]}>Conversations</EyebrowLabel>
        <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.hairline }]}>
          <TouchableOpacity
            style={styles.cardRow}
            onPress={() => router.push('/archived')}
          >
            <View style={[styles.rowIcon, { backgroundColor: theme.surface2 }]}>
              <Icon name="archive" size={16} color={theme.ink2} />
            </View>
            <Text style={[styles.rowLabel, { color: theme.ink }]}>Archived chats</Text>
            <Icon name="chevron" size={14} color={theme.faint} />
          </TouchableOpacity>
        </View>

        {/* Profiles */}
        <EyebrowLabel style={[styles.sectionLabel, { marginTop: 24 }]}>Profiles</EyebrowLabel>
        <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.hairline }]}>
          {profiles.map((p, i) => (
            <View
              key={p.id}
              style={[
                styles.profileRow,
                i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.hairline },
              ]}
            >
              <Avatar name={p.name} size={34} />
              <Text style={[styles.rowLabel, { flex: 1, color: theme.ink }]}>
                {p.name}
                {p.isYou && (
                  <Text style={[styles.youText, { color: theme.muted }]}> · you</Text>
                )}
              </Text>
            </View>
          ))}
        </View>

        {/* About */}
        <EyebrowLabel style={[styles.sectionLabel, { marginTop: 24 }]}>About</EyebrowLabel>
        <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.hairline }]}>
          <View style={styles.aboutRow}>
            <Text style={[styles.aboutLabel, { color: theme.muted }]}>Saga</Text>
            <Text style={[styles.aboutValue, { color: theme.ink }]}>Friendly best-friend astrologer</Text>
          </View>
          <View style={[styles.aboutRow, { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.hairline }]}>
            <Text style={[styles.aboutLabel, { color: theme.muted }]}>Privacy</Text>
            <Text style={[styles.aboutValue, { color: theme.ink }]}>Charts stay on your device</Text>
          </View>
          <View style={[styles.aboutRow, { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.hairline }]}>
            <Text style={[styles.aboutLabel, { color: theme.muted }]}>Version</Text>
            <Text style={[styles.aboutValue, { color: theme.ink }]}>1.0.0</Text>
          </View>
        </View>

        <TouchableOpacity onPress={handleReset} style={styles.resetBtn}>
          <Text style={styles.resetText}>Reset all data</Text>
        </TouchableOpacity>

        <View style={{ height: 40 }} />
      </ScrollView>
    </ScreenLayout>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:               10,
    paddingHorizontal: 20,
    paddingVertical:   16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  back:  { padding: 4 },
  title: {
    fontFamily: FONTS.serifRegular,
    fontSize:   36,
  },
  titleItalic: {
    fontFamily: FONTS.serifItalic,
  },
  scroll: { flex: 1 },
  content: {
    padding: 26,
  },
  sectionLabel: {
    marginBottom: 10,
  },
  card: {
    borderRadius: RADIUS.card,
    borderWidth:  StyleSheet.hairlineWidth,
    padding:      18,
    overflow:     'hidden',
  },
  cardLabel: {
    fontFamily:   FONTS.sansRegular,
    fontSize:     14,
    marginBottom: 14,
  },
  swatchRow: {
    flexDirection: 'row',
    gap:           10,
    marginBottom:  22,
  },
  swatch: {
    flex:         1,
    aspectRatio:  1,
    borderRadius: 12,
    alignItems:   'center',
    justifyContent: 'center',
  },
  swatchCheck: {
    color:     '#ffffff',
    fontSize:  14,
    fontWeight: '700',
  },
  divider: {
    height:       1,
    marginBottom: 18,
  },
  cardRow: {
    flexDirection:  'row',
    alignItems:     'center',
    gap:            12,
    paddingVertical: 4,
  },
  rowIcon: {
    width:          32,
    height:         32,
    borderRadius:   8,
    alignItems:     'center',
    justifyContent: 'center',
  },
  rowLabel: {
    flex:          1,
    fontFamily:    FONTS.sansRegular,
    fontSize:      14.5,
    letterSpacing: -0.1,
  },
  profileRow: {
    flexDirection:  'row',
    alignItems:     'center',
    gap:            12,
    paddingVertical: 10,
  },
  youText: {
    fontFamily: FONTS.sansRegular,
    fontSize:   12,
  },
  aboutRow: {
    flexDirection:  'row',
    alignItems:     'flex-start',
    gap:            12,
    paddingVertical: 10,
  },
  aboutLabel: {
    fontFamily:    FONTS.monoRegular,
    fontSize:      10.5,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    width:         64,
    marginTop:     2,
  },
  aboutValue: {
    flex:       1,
    fontFamily: FONTS.sansRegular,
    fontSize:   14,
  },
  resetBtn: {
    marginTop:     24,
    paddingVertical: 10,
  },
  resetText: {
    fontFamily: FONTS.sansRegular,
    fontSize:   14,
    color:      '#C44',
  },
});
