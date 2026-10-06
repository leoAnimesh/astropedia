import { Stack } from 'expo-router';

export default function OnboardingLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
      {/* Profile is already saved by this point — no swiping back into birth-place. */}
      <Stack.Screen name="notifications" options={{ gestureEnabled: false }} />
    </Stack>
  );
}
