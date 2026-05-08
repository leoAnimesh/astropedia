import { useEffect, useSyncExternalStore } from 'react';
import { Platform } from 'react-native';
import {
  getLLMState,
  subscribeToLLMState,
  initLocalLLM,
  type LLMState,
} from '@/utils/local-llm';

export function useLocalLLM(): {
  state: LLMState;
  download: () => void;
} {
  const state = useSyncExternalStore(subscribeToLLMState, getLLMState, getLLMState);

  const download = () => {
    if (Platform.OS === 'web') return;
    initLocalLLM().catch(() => {/* error already stored in state */});
  };

  return { state, download };
}

// Auto-starts download when the component mounts (used in _layout.tsx)
export function useAutoDownloadLLM() {
  const { state, download } = useLocalLLM();

  useEffect(() => {
    if (Platform.OS === 'web') return;
    if (state.status === 'idle') {
      download();
    }
  }, []);

  return state;
}
