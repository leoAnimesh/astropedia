import { StyleSheet, View, type ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useAccent } from '@/hooks/use-accent';

type Props = {
  children: React.ReactNode;
  style?: ViewStyle;
  edges?: ('top' | 'bottom' | 'left' | 'right')[];
};

export function ScreenLayout({ children, style, edges = ['top', 'bottom', 'left', 'right'] }: Props) {
  const { theme, isDark } = useAccent();
  return (
    <SafeAreaView
      edges={edges}
      style={[styles.fill, { backgroundColor: theme.bg }, style]}
    >
      <StatusBar style={isDark ? 'light' : 'dark'} />
      {children}
    </SafeAreaView>
  );
}

// Non-safe-area wrapper for screens that manage their own safe area
export function ScreenContainer({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  const { theme } = useAccent();
  return (
    <View style={[styles.fill, { backgroundColor: theme.bg }, style]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
});
