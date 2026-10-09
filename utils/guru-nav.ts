/**
 * Opening guru chats. Every "Ask …" link in the app goes through here, so a
 * question always lands in the profile's one ongoing chat with that guru
 * (app/chat/agent/[agent].tsx resolves or lazily creates the thread).
 *
 *   openGuruChat('saga', profile.id, question)   // "Ask Saga about this"
 *   openGuruChat('krishna')                      // Krishna: one chat for everyone
 */
import { router, type Href } from 'expo-router';
import type { AgentId } from '@/constants/gurus';

export function guruChatHref(agent: AgentId, profileId?: string | null, ask?: string): Href {
  const params: Record<string, string> = { agent };
  if (agent !== 'krishna' && profileId) params.profileId = profileId;
  if (ask) params.ask = ask;
  return { pathname: '/chat/agent/[agent]', params } as unknown as Href;
}

/** Push the guru's chat for `profileId` (ignored for Krishna), optionally sending `ask`. */
export function openGuruChat(agent: AgentId, profileId?: string | null, ask?: string): void {
  router.push(guruChatHref(agent, profileId, ask));
}

/** Same, replacing the current screen (past conversation → "Continue in …", nudge chips). */
export function replaceWithGuruChat(agent: AgentId, profileId?: string | null, ask?: string): void {
  router.replace(guruChatHref(agent, profileId, ask));
}
