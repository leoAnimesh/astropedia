import { useMemo } from 'react';
import {
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

export default function ChatScreen() {
  const { theme } = useAccent();
  const { threadId, profileId, isNew } = useLocalSearchParams<{
    threadId: string;
    profileId: string;
    isNew?: string;
  }>();

  const { profiles } = useProfiles();
  const profile = profiles.find((p) => p.id === profileId) ?? null;

  const starters = useMemo(
    () => (profile ? buildPersonalizedStarters(profile) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [profile?.id],
  );

  const { archiveThread } = useThreads(profileId ?? null);

  const threadObj = useMemo(
    () =>
      threadId
        ? {
            id:         threadId,
            profileId:  profileId ?? '',
            title:      null,
            archived:   false,
            archivedAt: null,
            createdAt:  '',
            updatedAt:  '',
            syncedAt:   null,
          }
        : null,
    [threadId, profileId],
  );

  const { messages, isTyping, streamText, sendMessage } = useChat(
    threadObj,
    profile,
    isNew === 'true',
  );

  // Inverted list expects newest-first data — reverse once, memoized
  const reversedMessages = useMemo(() => [...messages].reverse(), [messages]);

  const handleArchive = () => {
    archiveThread(threadId ?? '').then(() => router.back());
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
          {profile && <Avatar name={profile.name} size={32} />}
          <View style={styles.headerText}>
            <Text style={[styles.headerName, { color: theme.ink }]} numberOfLines={1}>
              {profile?.name ?? 'Chat'}
            </Text>
            <Text style={[styles.headerSub, { color: theme.muted }]}>with Saga</Text>
          </View>
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
                streamText={streamText || undefined}
              />
            ) : null
          }
          // Empty state — shown when no messages and not typing
          ListEmptyComponent={
            !isTyping ? (
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
});
