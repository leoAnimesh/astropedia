import { useEffect, useMemo } from 'react';
import {
  Alert,
  FlatList,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { router, useLocalSearchParams } from 'expo-router';
import { useAccent } from '@/hooks/use-accent';
import { useProfiles } from '@/hooks/use-profiles';
import { useThreads } from '@/hooks/use-threads';
import { useChat } from '@/hooks/use-chat';
import { Avatar } from '@/components/atoms/Avatar';
import { Icon } from '@/components/atoms/Icon';
import { ChatBubble } from '@/components/molecules/ChatBubble';
import { ChatComposer } from '@/components/organisms/ChatComposer';
import { ScreenLayout } from '@/components/templates/ScreenLayout';
import { FONTS } from '@/constants/themes';
import { buildPersonalizedStarters } from '@/constants/starters';
import type { Message } from '@/utils/database';
import { KRISHNA_PROFILE, KRISHNA_STARTERS, isKrishnaProfile } from '@/utils/krishna';
import type { AIMode } from '@/utils/ai';

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

  const { messages, isTyping, status, streamText, sendMessage } = useChat(
    threadObj,
    profile,
    isNew === 'true',
    mode,
    krishnaUserName,
  );

  // Inverted list expects newest-first data — reverse once, memoized
  const reversedMessages = useMemo(() => [...messages].reverse(), [messages]);

  const handleArchive = () => {
    archiveThread(threadId ?? '').then(() => router.back());
  };

  const handleTogglePin = () => {
    if (!threadId) return;
    setPinned(threadId, !isPinned);
  };

  const renderMessage = ({ item }: { item: Message }) => (
    <ChatBubble role={item.role} content={item.content} />
  );

  const isNewEmpty = isNew === 'true' && messages.length === 0;

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
            <Text style={[styles.headerSub, { color: theme.muted }]}>
              {isKrishna ? 'Bhagavad Gita' : 'with Saga'}
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
          {!isNewEmpty && (
            <TouchableOpacity style={styles.archiveBtn} onPress={handleArchive}>
              <Icon name="archive" size={16} color={theme.muted} />
              <Text style={[styles.archiveBtnLabel, { color: theme.muted }]}>Archive</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Messages — inverted so newest is always at the bottom */}
        <FlatList
          inverted
          data={reversedMessages}
          keyExtractor={(m) => m.id}
          renderItem={renderMessage}
          contentContainerStyle={styles.messageList}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          // With inverted, ListHeaderComponent renders at the visual bottom
          ListHeaderComponent={
            isTyping ? (
              <ChatBubble
                role="assistant"
                content=""
                isStreaming
                status={status}
                streamText={streamText || undefined}
                persona={isKrishna ? 'Krishna' : 'Saga'}
              />
            ) : null
          }
          // With inverted, ListFooterComponent renders at the visual TOP.
          // We use it to flag when older messages are no longer part of the
          // model's context — Saga can't remember them on follow-ups.
          ListFooterComponent={
            messages.length > 6 ? (
              <Text style={[styles.contextNote, { color: theme.muted }]}>
                Saga only remembers the last few messages in this thread.
              </Text>
            ) : null
          }
          // Empty state — shown when no messages and not typing
          ListEmptyComponent={
            !isTyping ? (
              isKrishna ? (
                <View style={styles.emptyState}>
                  <Text style={[styles.emptyTitle, { color: theme.ink }]}>
                    {krishnaUserName ? (
                      <>
                        What's on your mind,{' '}
                        <Text style={styles.emptyItalic}>{krishnaUserName}?</Text>
                      </>
                    ) : (
                      <>
                        What's on <Text style={styles.emptyItalic}>your mind?</Text>
                      </>
                    )}
                  </Text>
                  <Text style={[styles.emptySub, { color: theme.muted }]}>
                    Krishna is listening — quietly, like an old friend.
                  </Text>
                </View>
              ) : (
                <View style={styles.emptyState}>
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

        {/* Composer — chips render inside when no messages */}
        <ChatComposer
          onSend={sendMessage}
          disabled={isTyping}
          starters={messages.length === 0 ? starters : undefined}
        />
      </KeyboardAvoidingView>
    </ScreenLayout>
  );
}

const styles = StyleSheet.create({
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
    gap:           8,
    flexGrow:      1,
  },
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
