import { useCallback } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { GuruChat } from '@/components/organisms/GuruChat';
import { useProfiles } from '@/hooks/use-profiles';
import { isAgentId } from '@/utils/database';
import { KRISHNA_PROFILE_ID } from '@/utils/krishna';

/**
 * A guru's chat: /chat/agent/<agent>?profileId=<id>&ask=<question>.
 * Opens the profile's one ongoing chat with that guru (created on the first
 * message). Krishna ignores profileId: one chat for everyone. Without a
 * profileId the active profile is used. Build links with utils/guru-nav.ts.
 */
export default function GuruChatScreen() {
  const params = useLocalSearchParams<{ agent: string; profileId?: string; ask?: string }>();
  const { activeProfile } = useProfiles();
  const agent = isAgentId(params.agent) ? params.agent : 'saga';
  const profileId = agent === 'krishna'
    ? KRISHNA_PROFILE_ID
    : (params.profileId || activeProfile?.id || '');

  const onAskConsumed = useCallback(() => router.setParams({ ask: undefined }), []);
  const onSwitchProfile = useCallback((id: string) => router.setParams({ profileId: id }), []);

  if (!profileId) return null;
  return (
    <GuruChat
      // A new person or guru is a new conversation: fresh state, fresh thread.
      key={`${agent}:${profileId}`}
      agent={agent}
      profileId={profileId}
      ask={params.ask}
      onAskConsumed={onAskConsumed}
      onSwitchProfile={onSwitchProfile}
    />
  );
}
