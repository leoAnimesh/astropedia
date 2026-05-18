/**
 * Capture a React Native view as a PNG and hand it to the OS share sheet.
 *
 * Used by the horoscope / reading-pack share buttons. The view to capture
 * must be in the render tree (visible or hidden via opacity/position) and
 * have `collapsable={false}` on Android so the view isn't dropped.
 */

import type { View } from 'react-native';

export async function captureAndShare(
  ref:      View | null,
  fileName: string,
): Promise<void> {
  if (!ref) return;
  try {
    const { captureRef } = await import('react-native-view-shot');
    const Sharing        = await import('expo-sharing');

    const uri = await captureRef(ref, {
      format:  'png',
      quality: 1,
      result:  'tmpfile',
      fileName,
    } as any);

    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(uri, { mimeType: 'image/png' });
    }
  } catch (e) {
    console.warn('[share] capture failed', e);
  }
}
