import { Pressable, StyleSheet, View, type ColorValue } from 'react-native';
import { Tabs } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useTranslation } from 'react-i18next';
import { Icon, type IconName } from '@/components/atoms/Icon';
import { useAccent } from '@/hooks/use-accent';
import { useGuruChats } from '@/hooks/use-guru-chats';
import { useProfileStore } from '@/stores/profile-store';
import { FONTS } from '@/constants/themes';

/**
 * The four tabs: Home · Reports · Chat · Settings. Every other screen is a root stack
 * screen (app/_layout.tsx), so it pushes over the tabs and hides the bar.
 */
export default function TabsLayout() {
  const { theme } = useAccent();
  const { t } = useTranslation('home');
  const activeId = useProfileStore((s) => s.activeProfileId);
  const { anyUnread } = useGuruChats(activeId);

  const icon = (name: IconName, dot = false) =>
    function TabIcon({ color }: { color: ColorValue }) {
      return (
        <View>
          <Icon name={name} size={23} color={color as string} />
          {dot && <View style={[styles.dot, { backgroundColor: theme.accent, borderColor: theme.surface }]} />}
        </View>
      );
    };

  return (
    <Tabs
      // A soft tap on iOS, like components/haptic-tab.tsx (whose pressable
      // comes from a different react-navigation copy than expo-router's tabs).
      screenListeners={{
        tabPress: () => {
          if (process.env.EXPO_OS === 'ios') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        },
      }}
      screenOptions={{
        headerShown:             false,
        tabBarActiveTintColor:   theme.accent,
        tabBarInactiveTintColor: theme.muted,
        tabBarStyle: {
          backgroundColor: theme.surface,
          borderTopColor:  theme.hairline,
          borderTopWidth:  StyleSheet.hairlineWidth,
          elevation:       0,
        },
        tabBarLabelStyle: styles.label,
        // No Android ripple on the tab buttons. Plain RN Pressable (not the
        // react-navigation PlatformPressable) so there's no opacity flash either.
        tabBarButton: ({ children, style, onPress, onLongPress, accessibilityState, accessibilityLabel, testID, href: _href, ...rest }) => (
          <Pressable
            {...(rest as object)}
            onPress={onPress}
            onLongPress={onLongPress}
            accessibilityRole="button"
            accessibilityState={accessibilityState}
            accessibilityLabel={accessibilityLabel}
            testID={testID}
            android_ripple={{ color: 'transparent', borderless: false }}
            style={style}
          >
            {children}
          </Pressable>
        ),
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: t('tabs.home'), tabBarIcon: icon('home'), tabBarAccessibilityLabel: t('tabs.home') }}
      />
      <Tabs.Screen
        name="reports"
        options={{ title: t('tabs.reports'), tabBarIcon: icon('report'), tabBarAccessibilityLabel: t('tabs.reports') }}
      />
      <Tabs.Screen
        name="chat"
        options={{
          title: t('tabs.chat'),
          tabBarIcon: icon('chat', anyUnread),
          tabBarAccessibilityLabel: anyUnread ? t('tabs.chatUnread') : t('tabs.chat'),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{ title: t('tabs.settings'), tabBarIcon: icon('settings'), tabBarAccessibilityLabel: t('tabs.settings') }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  label: {
    fontFamily: FONTS.sansMedium,
    fontSize:   11,
  },
  dot: {
    position:     'absolute',
    top:          -2,
    right:        -4,
    width:        10,
    height:       10,
    borderRadius: 5,
    borderWidth:  2,
  },
});
