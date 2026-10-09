import { useEffect } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { GuruChat } from '@/components/organisms/GuruChat';
import { showDialog } from '@/components/overlays';
import { useThreadStore } from '@/stores/thread-store';
import type { Thread } from '@/utils/database';

/**
 * One saved thread by id: past conversations (read-only, "Continue in …")
 * and saved-answer links. A thread that is still a guru's active chat opens
 * as that guru's chat. New chats never start here; see utils/guru-nav.ts.
 */
export default function ThreadScreen() {
  const { t } = useTranslation('chat');
  const { threadId, profileId } = useLocalSearchParams<{ threadId: string; profileId?: string }>();
  const thread = useThreadStore((s): Thread | undefined => {
    const own = profileId ? s.threads[profileId]?.find((x) => x.id === threadId) : undefined;
    return own ?? Object.values(s.threads).flat().find((x) => x.id === threadId);
  });

  useEffect(() => {
    if (thread) return;
    showDialog({
      title:   t('unavailable.title'),
      message: t('unavailable.messageThread'),
      actions: [{ label: t('unavailable.ok'), onPress: () => router.back() }],
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!thread]);

  if (!thread) return null;
  return thread.archived ? (
    <GuruChat key={thread.id} agent={thread.agent} profileId={thread.profileId} threadId={thread.id} />
  ) : (
    <GuruChat
      key={`${thread.agent}:${thread.profileId}`}
      agent={thread.agent}
      profileId={thread.profileId}
      onSwitchProfile={(id) => router.replace({ pathname: '/chat/agent/[agent]', params: { agent: thread.agent, profileId: id } } as never)}
    />
  );
}
