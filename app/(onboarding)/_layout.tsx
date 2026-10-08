import { Stack } from 'expo-router';

// The language picker is the entry point of the group. Without this, the group's
// first route is the first <Stack.Screen> declared below (expo-router puts
// declared screens ahead of the rest), so entering the group without an explicit
// child — first launch, or the guard flip after "Reset all data" — opened the
// notifications step instead of the language picker.
export const unstable_settings = {
  initialRouteName: 'index',
};

export default function OnboardingLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
      <Stack.Screen name="index" />
      {/* Profile is already saved by this point — no swiping back into birth-place. */}
      <Stack.Screen name="notifications" options={{ gestureEnabled: false }} />
    </Stack>
  );
}
