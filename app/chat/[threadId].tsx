import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  FlatList,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  type ListRenderItem,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { router, useLocalSearchParams } from 'expo-router';
import { useAccent } from '@/hooks/use-accent';
import { useProfiles } from '@/hooks/use-profiles';
import { useThreads } from '@/hooks/use-threads';
import { useChat } from '@/hooks/use-chat';
import { Avatar } from '@/components/atoms/Avatar';
import { Icon } from '@/components/atoms/Icon';
import { EyebrowLabel } from '@/components/atoms/EyebrowLabel';
import { ChatBubble } from '@/components/molecules/ChatBubble';
import { ConversationStateView } from '@/components/molecules/ConversationStateView';
import { ModelUpgradeHint } from '@/components/molecules/ModelUpgradeHint';
import { ChatComposer } from '@/components/organisms/ChatComposer';
import { ChatTimelineRow } from '@/components/organisms/ChatTimelineRow';
import { MessageActionSheet, type MessageAction } from '@/components/organisms/MessageActionSheet';
import { DevToolsSheet } from '@/components/organisms/DevToolsSheet';
import { ScreenLayout } from '@/components/templates/ScreenLayout';
import { FONTS } from '@/constants/themes';
import { buildPersonalizedStarters } from '@/constants/starters';
import type { Message } from '@/utils/database';
import type { MessageFeedback } from '@/types/conversation';
import { buildTimeline, type TimelineRow } from '@/utils/chat-timeline';
import { seedDemoConversation } from '@/utils/conversation-api';
import { getActiveModelInfo } from '@/utils/local-llm';
import { KRISHNA_PROFILE, KRISHNA_STARTERS, isKrishnaProfile } from '@/utils/krishna';
import type { AIMode } from '@/utils/ai';

/** Scroll distance from the latest message before "Latest" appears. */
const JUMP_THRESHOLD = 600;

/**
 * Copy via expo-clipboard. Imported lazily so a dev client built before the
 * dependency was added degrades to a message instead of crashing on launch.
 */
async function copyToClipboard(text: string): Promise<boolean> {
  try {
    const Clipboard = await import('expo-clipboard');
    await Clipboard.setStringAsync(text);
    return true;
  } catch {
    Alert.alert('Copy unavailable', 'Rebuild the app (npx expo run:ios / run:android) to enable the clipboard.');
    return false;
  }
}

export default function ChatScreen() {
  const { theme } = useAccent();
  const { threadId, profileId, isNew } = useLocalSearchParams<{
    threadId: string;
    profileId: string;
    isNew?: string;
  }>();

  const isKrishna = isKrishnaProfile(profileId);
  const mode: AIMode = isKrishna ? 'krishna' : 'saga';

  const { profiles, activeProfile } = useProfiles();
  const profile = isKrishna
    ? KRISHNA_PROFILE
    : (profiles.find((p) => p.id === profileId) ?? null);

  // Deep-link safety: a chat URL can outlive its profile. If the profile
  // list has hydrated and the requested profile isn't there, bounce home
  // instead of rendering a dead-empty chat that no-ops on send.
  useEffect(() => {
    if (isKrishna) return;
    if (profiles.length === 0) return; // still hydrating
    if (!profile) {
      Alert.alert(
        'Conversation unavailable',
        'The profile this chat belonged to has been removed.',
        [{ text: 'OK', onPress: () => router.replace('/') }],
      );
    }
  }, [isKrishna, profiles.length, profile]);

  // For Krishna chat, pass the active profile's first name so Krishna can address them.
  const krishnaUserName = isKrishna && activeProfile?.name
    ? activeProfile.name.split(' ')[0]
    : undefined;

  const starters = useMemo(
    () => {
      if (isKrishna) return KRISHNA_STARTERS;
      return profile ? buildPersonalizedStarters(profile) : [];
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [profile?.id, isKrishna],
  );

  const { threads, archiveThread, setPinned } = useThreads(profileId ?? null);
  const liveThread = threads.find((t) => t.id === threadId);
  const isPinned   = !!liveThread?.pinned;

  const threadObj = useMemo(
    () =>
      threadId
        ? {
            id:                 threadId,
            profileId:          profileId ?? '',
            title:              null,
            archived:           false,
            archivedAt:         null,
            lastMessagePreview: null,
            pinned:             false,
            pinnedAt:           null,
            createdAt:          '',
            updatedAt:          '',
            syncedAt:           null,
          }
        : null,
    [threadId, profileId],
  );

  const {
    messages,
    isTyping,
    status,
    streamText,
    loadState,
    replyTo,
    sendMessage,
    retryMessage,
    deleteMessage,
    setFeedback,
    setReplyTarget,
    reload,
  } = useChat(
    threadObj,
    profile,
    isNew === 'true',
    mode,
    krishnaUserName,
  );

  const persona = isKrishna ? 'Krishna' : 'Saga';

  // Timeline rows (date separators + grouped messages). Inverted list
  // expects newest-first data — build + reverse once, memoized.
  const rows = useMemo(() => buildTimeline(messages).reverse(), [messages]);

  // ── Scrolling ──────────────────────────────────────────────────────────────
  const listRef = useRef<FlatList<TimelineRow>>(null);
  const [showJump, setShowJump] = useState(false);
  const showJumpRef = useRef(false);

  const scrollToLatest = useCallback((animated = true) => {
    listRef.current?.scrollToOffset({ offset: 0, animated });
  }, []);

  // Auto-scroll when the user sends: their own message should always come
  // into view, even if they were reading history. Incoming replies only
  // auto-follow when already near the bottom (maintainVisibleContentPosition).
  const lastMessage = messages[messages.length - 1];
  useEffect(() => {
    if (lastMessage?.role === 'user' && lastMessage.status === 'sending') {
      scrollToLatest();
    }
  }, [lastMessage?.id, lastMessage?.role, lastMessage?.status, scrollToLatest]);

  const onScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const away = e.nativeEvent.contentOffset.y > JUMP_THRESHOLD;
    if (away !== showJumpRef.current) {
      showJumpRef.current = away;
      setShowJump(away);
    }
  }, []);

  // ── Message actions (long-press) ───────────────────────────────────────────
  const [actionTarget, setActionTarget] = useState<Message | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current); }, []);

  const flashToast = useCallback((text: string) => {
    setToast(text);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 1600);
  }, []);

  const onLongPress = useCallback((m: Message) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setActionTarget(m);
  }, []);

  const onRetry = useCallback((id: string) => { retryMessage(id); }, [retryMessage]);
  const onFeedback = useCallback(
    (id: string, fb: MessageFeedback | null) => setFeedback(id, fb),
    [setFeedback],
  );

  const actions = useMemo<MessageAction[]>(() => {
    const m = actionTarget;
    if (!m) return [];
    const list: MessageAction[] = [];
    if (m.role === 'assistant' || m.role === 'human') {
      list.push({ key: 'reply', label: 'Reply', icon: 'reply', onPress: () => setReplyTarget(m) });
    }
    list.push({
      key: 'copy', label: 'Copy', icon: 'copy',
      onPress: () => { copyToClipboard(m.content).then((ok) => ok && flashToast('Copied')); },
    });
    // Human-astrologer notes aren't the user's to delete; a still-sending
    // message can't be deleted until it resolves.
    const deletable = m.role === 'assistant' || (m.role === 'user' && m.status !== 'sending');
    if (deletable) {
      list.push({
        key: 'delete', label: 'Delete', icon: 'trash', destructive: true,
        onPress: () => { deleteMessage(m.id); flashToast('Message deleted'); },
      });
    }
    return list;
  }, [actionTarget, setReplyTarget, deleteMessage, flashToast]);

  const cancelReply = useCallback(() => setReplyTarget(null), [setReplyTarget]);

  // ── Dev tools (dev builds only) ────────────────────────────────────────────
  const [devOpen, setDevOpen] = useState(false);
  const handleSeedDemo = useCallback(async () => {
    if (!profile || isKrishna) return;
    try {
      const t = await seedDemoConversation(profile.id);
      router.push(`/chat/${t.id}?profileId=${profile.id}`);
    } catch (err) {
      Alert.alert('Could not create demo', String(err));
    }
  }, [profile, isKrishna]);

  const handleArchive = () => {
    archiveThread(threadId ?? '').then(() => router.back());
  };

  const handleTogglePin = () => {
    if (!threadId) return;
    setPinned(threadId, !isPinned);
  };

  const renderRow: ListRenderItem<TimelineRow> = useCallback(({ item }) => (
    <ChatTimelineRow
      row={item}
      persona={persona}
      busy={isTyping}
      onLongPress={onLongPress}
      onRetry={onRetry}
      onFeedback={onFeedback}
    />
  ), [persona, isTyping, onLongPress, onRetry, onFeedback]);

  const isNewEmpty = isNew === 'true' && messages.length === 0;
  const modelTurns = useMemo(
    () => messages.filter((m) => m.role === 'user' || m.role === 'assistant').length,
    [messages],
  );

  return (
    <ScreenLayout edges={['top', 'left', 'right']}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
      >
        {/* Header */}
        <View style={[styles.header, { borderBottomColor: theme.hairline }]}>
          <TouchableOpacity onPress={() => router.back()} style={styles.back}>
            <Icon name="back" size={22} color={theme.ink} />
          </TouchableOpacity>
          {isKrishna ? (
            <View style={styles.krishnaBadge}>
              <Icon name="lotus" size={18} color={theme.accent} />
            </View>
          ) : (
            profile && <Avatar name={profile.name} size={32} />
          )}
          <View style={styles.headerText}>
            <Text style={[styles.headerName, { color: theme.ink }]} numberOfLines={1}>
              {isKrishna ? 'Krishna' : (profile?.name ?? 'Chat')}
            </Text>
            <Text style={[styles.headerSub, { color: theme.muted }]} numberOfLines={1}>
              {isKrishna ? 'Bhagavad Gita' : 'with Saga'}
              <ModelUpgradeHint />
            </Text>
          </View>
          {!isNewEmpty && !isKrishna && (
            <TouchableOpacity style={styles.iconBtn} onPress={handleTogglePin} hitSlop={8}>
              <Icon
                name={isPinned ? 'pin-filled' : 'pin'}
                size={16}
                color={isPinned ? theme.accent : theme.muted}
              />
            </TouchableOpacity>
          )}
          {__DEV__ && (
            <TouchableOpacity
              style={styles.iconBtn}
              onPress={() => setDevOpen(true)}
              hitSlop={8}
              accessibilityLabel="Developer tools"
            >
              <Icon name="bug" size={16} color={theme.muted} />
            </TouchableOpacity>
          )}
          {!isNewEmpty && (
            <TouchableOpacity style={styles.archiveBtn} onPress={handleArchive}>
              <Icon name="archive" size={16} color={theme.muted} />
              <Text style={[styles.archiveBtnLabel, { color: theme.muted }]}>Archive</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Messages — inverted so newest is always at the bottom */}
        {loadState === 'loading' ? (
          <ConversationStateView kind="loading" />
        ) : loadState === 'error' ? (
          <ConversationStateView kind="error" onRetry={() => reload(true)} />
        ) : (
          <View style={styles.fill}>
            <FlatList
              ref={listRef}
              inverted
              data={rows}
              keyExtractor={rowKey}
              renderItem={renderRow}
              contentContainerStyle={styles.messageList}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="interactive"
              // Keep the reader's place when items above/below change (deletes,
              // new replies while scrolled up); auto-follow only near the bottom.
              maintainVisibleContentPosition={MVCP}
              onScroll={onScroll}
              scrollEventThrottle={100}
              // Virtualization tuning for long histories.
              initialNumToRender={12}
              maxToRenderPerBatch={8}
              updateCellsBatchingPeriod={40}
              windowSize={11}
              removeClippedSubviews={Platform.OS === 'android'}
              // With inverted, ListHeaderComponent renders at the visual bottom
              ListHeaderComponent={
                isTyping ? (
                  <ChatBubble
                    role="assistant"
                    content=""
                    isStreaming
                    status={status}
                    streamText={streamText || undefined}
                    persona={persona}
                    senderLabel={`${persona} · AI`}
                  />
                ) : null
              }
              // With inverted, ListFooterComponent renders at the visual TOP.
              // We use it to flag when older messages are no longer part of the
              // model's context — Saga can't remember them on follow-ups.
              ListFooterComponent={
                modelTurns > 6 ? (
                  <Text style={[styles.contextNote, { color: theme.muted }]}>
                    {persona} only remembers the last few messages in this thread.
                  </Text>
                ) : null
              }
              // Empty state — shown when no messages and not typing
              ListEmptyComponent={
                !isTyping ? (
                  isKrishna ? (
                    <View style={styles.emptyState}>
                      <EyebrowLabel style={styles.emptyEyebrow}>Start your conversation.</EyebrowLabel>
                      <Text style={[styles.emptyTitle, { color: theme.ink }]}>
                        {krishnaUserName ? (
                          <>
                            What&apos;s on your mind,{' '}
                            <Text style={styles.emptyItalic}>{krishnaUserName}?</Text>
                          </>
                        ) : (
                          <>
                            What&apos;s on <Text style={styles.emptyItalic}>your mind?</Text>
                          </>
                        )}
                      </Text>
                      <Text style={[styles.emptySub, { color: theme.muted }]}>
                        Krishna is listening — quietly, like an old friend.
                      </Text>
                    </View>
                  ) : (
                    <View style={styles.emptyState}>
                      <EyebrowLabel style={styles.emptyEyebrow}>Start your conversation.</EyebrowLabel>
                      <Text style={[styles.emptyTitle, { color: theme.ink }]}>
                        Ask anything about{' '}
                        <Text style={styles.emptyItalic}>
                          {profile?.isYou ? 'yourself' : (profile?.name.split(' ')[0] ?? 'them')}.
                        </Text>
                      </Text>
                      <Text style={[styles.emptySub, { color: theme.muted }]}>
                        Saga reads {profile?.isYou ? 'your' : 'their'} chart and chats like a thoughtful friend.
                      </Text>
                    </View>
                  )
                ) : null
              }
            />
            {showJump ? (
              <Pressable
                onPress={() => scrollToLatest()}
                style={[styles.jump, { backgroundColor: theme.ink }]}
                accessibilityRole="button"
                accessibilityLabel="Jump to latest message"
              >
                <Icon name="arrow-down" size={14} color={theme.bg} />
                <Text style={[styles.jumpText, { color: theme.bg }]}>Latest</Text>
              </Pressable>
            ) : null}
            {toast ? (
              <View pointerEvents="none" style={[styles.toast, { backgroundColor: theme.ink }]}>
                <Text style={[styles.toastText, { color: theme.bg }]}>{toast}</Text>
              </View>
            ) : null}
          </View>
        )}

        {/* Composer — chips render inside when no messages */}
        <ChatComposer
          onSend={sendMessage}
          // Typing stays enabled; only sending waits for the current reply
          // (the on-device model runs one generation at a time).
          disabled={isTyping || loadState !== 'ready'}
          starters={messages.length === 0 && loadState === 'ready' ? starters : undefined}
          replyTo={replyTo}
          onCancelReply={cancelReply}
          focusKey={replyTo?.id ?? null}
          placeholder={isKrishna ? 'Talk to Krishna…' : 'Ask Saga anything…'}
        />
      </KeyboardAvoidingView>

      <MessageActionSheet
        visible={!!actionTarget}
        preview={actionTarget?.content}
        actions={actions}
        onClose={() => setActionTarget(null)}
      />

      {__DEV__ && (
        <DevToolsSheet
          visible={devOpen}
          onClose={() => setDevOpen(false)}
          onReload={() => reload(true)}
          onSeedDemo={!isKrishna && profile ? handleSeedDemo : undefined}
          modelLabel={getActiveModelInfo().def.label}
        />
      )}
    </ScreenLayout>
  );
}

const rowKey = (r: TimelineRow) => r.key;
const MVCP = { minIndexForVisible: 0, autoscrollToTopThreshold: 120 } as const;

const styles = StyleSheet.create({
  fill: { flex: 1 },
  header: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:               10,
    paddingHorizontal: 16,
    paddingVertical:   12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  back:       { padding: 4 },
  headerText: { flex: 1, minWidth: 0 },
  headerName: {
    fontFamily:    FONTS.sansRegular,
    fontSize:      14.5,
    letterSpacing: -0.1,
  },
  headerSub: {
    fontFamily:    FONTS.monoRegular,
    fontSize:      10.5,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  iconBtn: {
    padding:       6,
    marginRight:   4,
    flexShrink:    0,
  },
  archiveBtn: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           4,
    flexShrink:    0,
  },
  archiveBtnLabel: {
    fontFamily:    FONTS.monoRegular,
    fontSize:      11,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  messageList: {
    padding:       16,
    flexGrow:      1,
  },
  jump: {
    position:          'absolute',
    right:             16,
    bottom:            12,
    flexDirection:     'row',
    alignItems:        'center',
    gap:               4,
    paddingHorizontal: 12,
    paddingVertical:   7,
    borderRadius:      999,
  },
  jumpText: {
    fontFamily: FONTS.sansMedium,
    fontSize:   12.5,
  },
  toast: {
    position:          'absolute',
    alignSelf:         'center',
    bottom:            12,
    paddingHorizontal: 14,
    paddingVertical:   8,
    borderRadius:      999,
    opacity:           0.92,
  },
  toastText: {
    fontFamily: FONTS.sansRegular,
    fontSize:   13,
  },
  emptyEyebrow: { marginBottom: 12 },
  contextNote: {
    fontFamily:     FONTS.sansRegular,
    fontSize:       11.5,
    fontStyle:      'italic',
    textAlign:      'center',
    paddingVertical: 12,
    paddingHorizontal: 24,
  },
  emptyState: {
    flex:    1,
    padding: 6,
  },
  emptyTitle: {
    fontFamily:   FONTS.serifRegular,
    fontSize:     28,
    lineHeight:   32,
    marginBottom: 8,
  },
  emptyItalic: { fontFamily: FONTS.serifItalic },
  emptySub: {
    fontFamily: FONTS.sansRegular,
    fontSize:   14,
    lineHeight: 20,
  },
  krishnaBadge: {
    width:           32,
    height:          32,
    borderRadius:    16,
    alignItems:      'center',
    justifyContent:  'center',
    backgroundColor: 'rgba(180, 130, 0, 0.10)',
  },
});
