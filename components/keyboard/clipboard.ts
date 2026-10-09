/**
 * Copy / paste for the app keyboard's edit menu, through React Native's own
 * clipboard module (still built into RN on iOS and Android — no extra
 * native dependency; expo-clipboard isn't installed). Accessed through the
 * TurboModule registry rather than the deprecated `Clipboard` export, and
 * every call is guarded so a build without it just hides Copy / Paste.
 */
import { TurboModuleRegistry, type TurboModule } from 'react-native';

interface ClipboardSpec extends TurboModule {
  getString: () => Promise<string>;
  setString: (content: string) => void;
}

let mod: ClipboardSpec | null | undefined;

function native(): ClipboardSpec | null {
  if (mod === undefined) {
    try {
      mod = TurboModuleRegistry.get<ClipboardSpec>('Clipboard');
    } catch {
      mod = null;
    }
  }
  return mod;
}

export const clipboardAvailable = (): boolean => native() !== null;

export function copyText(text: string): boolean {
  try {
    native()?.setString(text);
    return !!native();
  } catch {
    return false;
  }
}

export async function readText(): Promise<string> {
  try {
    return (await native()?.getString()) ?? '';
  } catch {
    return '';
  }
}
