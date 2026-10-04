import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActionSheetIOS,
  Alert,
  FlatList,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Trans, useTranslation } from 'react-i18next';
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
import { getSavedMessageIds, saveAnswer, unsaveAnswer, type Message } from '@/utils/database';
import { KRISHNA_PROFILE, getKrishnaStarters, isKrishnaProfile } from '@/utils/krishna';
import { stripMarkdown, type AIMode } from '@/utils/ai';
import { tAsk } from '@/utils/i18n';

/**
 * Quick follow-ups offered under Saga's latest reply. The chip shows
 * chat:followUps.<key>; tAsk() sends it in the language the model speaks.
 */
const FOLLOW_UPS = ['when', 'do', 'know'];

export default function ChatScreen() {
  const { theme } = useAccent();
  const { t, i18n } = useTranslation('chat');
  const indic = i18n.language !== 'en';
  const { threadId, profileId, isNew, ask } = useLocalSearchParams<{
    threadId: string;
    profileId: string;
    isNew?: string;
    /** A question to send as soon as a new chat opens (home chips, life-phase screen). */
    ask?: string;
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
        t('unavailable.title'),
        t('unavailable.message'),
        [{ text: t('unavailable.ok'), onPress: () => router.replace('/') }],
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isKrishna, profiles.length, profile]);

  // For Krishna chat, pass the active profile's first name so Krishna can address them.
  const krishnaUserName = isKrishna && activeProfile?.name
    ? activeProfile.name.split(' ')[0]
    : undefined;

  const starters = useMemo(
    () => {
      if (isKrishna) return getKrishnaStarters();
      return profile ? buildPersonalizedStarters(profile) : [];
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [profile?.id, isKrishna, i18n.language],
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

  // Send the question this chat was opened with, once, as soon as the
  // profile is available.
  const askedRef = useRef(false);
  useEffect(() => {
    if (askedRef.current || !ask || isNew !== 'true' || !profile || messages.length > 0) return;
    askedRef.current = true;
    sendMessage(ask);
  }, [ask, isNew, profile, messages.length, sendMessage]);

  // Inverted list expects newest-first data — reverse once, memoized
  const reversedMessages = useMemo(() => [...messages].reverse(), [messages]);

  // ─── Saved answers ─────────────────────────────────────────────────────────
  // Refreshed on focus so un-saving from the Saved screen shows up here.
  const [savedIds, setSavedIds] = useState<Set<string>>(() => new Set());
  useFocusEffect(
    useCallback(() => {
      getSavedMessageIds().then(setSavedIds).catch(() => {});
    }, []),
  );

  // The user message an assistant reply answers — the nearest one before it.
  const questionFor = useCallback(
    (messageId: string): string => {
      const idx = messages.findIndex((m) => m.id === messageId);
      for (let i = idx - 1; i >= 0; i--) {
        if (messages[i].role === 'user') return messages[i].content;
      }
      return '';
    },
    [messages],
  );

  const toggleSave = useCallback(
    async (msg: Message) => {
      const wasSaved = savedIds.has(msg.id);
      // Optimistic flip; the DB write is cheap and local.
      setSavedIds((prev) => {
        const next = new Set(prev);
        if (wasSaved) next.delete(msg.id); else next.add(msg.id);
        return next;
      });
      try {
        if (wasSaved) {
          await unsaveAnswer(msg.id);
        } else {
          await saveAnswer({
            messageId: msg.id,
            threadId:  threadId ?? null,
            profileId: profileId ?? '',
            persona:   mode,
            question:  questionFor(msg.id),
            answer:    msg.content,
          });
        }
      } catch {
        getSavedMessageIds().then(setSavedIds).catch(() => {});
      }
    },
    [savedIds, threadId, profileId, mode, questionFor],
  );

  const shareAnswer = useCallback(
    (msg: Message) => {
      router.push({
        pathname: '/share-answer',
        params: {
          question:    questionFor(msg.id),
          answer:      stripMarkdown(msg.content),
          persona:     mode,
          profileName: isKrishna ? (activeProfile?.name ?? '') : (profile?.name ?? ''),
        },
      });
    },
    [questionFor, mode, isKrishna, activeProfile?.name, profile?.name],
  );

  // Long-press menu — native action sheet on iOS; Android uses the inline row.
  const openAnswerMenu = useCallback(
    (msg: Message) => {
      if (Platform.OS !== 'ios') return;
      const saved = savedIds.has(msg.id);
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options:           [saved ? t('menu.remove') : t('menu.save'), t('menu.share'), t('menu.cancel')],
          cancelButtonIndex: 2,
        },
        (i) => {
          if (i === 0) toggleSave(msg);
          else if (i === 1) shareAnswer(msg);
        },
      );
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [savedIds, toggleSave, shareAnswer, i18n.language],
  );

  const handleArchive = () => {
    archiveThread(threadId ?? '').then(() => router.back());
  };

  const handleTogglePin = () => {
    if (!threadId) return;
    setPinned(threadId, !isPinned);
  };

  const renderMessage = ({ item }: { item: Message }) =>
    item.role === 'assistant' ? (
      <ChatBubble
        role="assistant"
        content={item.content}
        actions={{
          saved:        savedIds.has(item.id),
          onToggleSave: () => toggleSave(item),
          onShare:      () => shareAnswer(item),
        }}
        onLongPress={Platform.OS === 'ios' ? () => openAnswerMenu(item) : undefined}
      />
    ) : (
      <ChatBubble role={item.role} content={item.content} />
    );

  // Follow-up chips sit under Saga's latest reply once it has finished.
  const lastMessage   = messages[messages.length - 1];
  const showFollowUps = !isKrishna && !isTyping && lastMessage?.role === 'assistant';

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
          <TouchableOpacity onPress={() => router.back()} style={styles.back} accessibilityLabel={t('header.back')}>
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
              {isKrishna ? t('persona.krishna') : (profile?.name ?? t('header.fallback'))}
            </Text>
            <Text style={[styles.headerSub, { color: theme.muted }]}>
              {isKrishna ? t('header.krishnaSub') : t('header.sagaSub')}
            </Text>
          </View>
          {!isNewEmpty && !isKrishna && (
            <TouchableOpacity
              style={styles.iconBtn}
              onPress={handleTogglePin}
              hitSlop={8}
              accessibilityLabel={isPinned ? t('header.unpin') : t('header.pin')}
            >
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
              <Text style={[styles.archiveBtnLabel, { color: theme.muted }]}>{t('header.archive')}</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Messages — inverted so newest is always at the bottom */}
        <FlatList
          inverted
          data={reversedMessages}
          keyExtractor={(m) => m.id}
          renderItem={renderMessage}
          extraData={savedIds}
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
                persona={isKrishna ? t('persona.krishna') : t('persona.saga')}
              />
            ) : showFollowUps ? (
              <View style={styles.followUps}>
                {FOLLOW_UPS.map((key) => (
                  <TouchableOpacity
                    key={key}
                    onPress={() => sendMessage(tAsk(`chat:followUps.${key}`))}
                    style={[styles.followUp, { backgroundColor: theme.surface, borderColor: theme.hairline2 }]}
                    accessibilityRole="button"
                  >
                    <Text style={[styles.followUpText, { color: theme.ink }]}>{t(`followUps.${key}`)}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            ) : null
          }
          // With inverted, ListFooterComponent renders at the visual TOP.
          // We use it to flag when older messages are no longer part of the
          // model's context — Saga can't remember them on follow-ups.
          ListFooterComponent={
            messages.length > 6 ? (
              <Text style={[styles.contextNote, { color: theme.muted }]}>
                {t('contextNote')}
              </Text>
            ) : null
          }
          // Empty state — shown when no messages and not typing
          ListEmptyComponent={
            !isTyping ? (
              isKrishna ? (
                <View style={styles.emptyState}>
                  <Text style={[styles.emptyTitle, indic && styles.emptyTitleIndic, { color: theme.ink }]}>
                    <Trans
                      t={t}
                      i18nKey={krishnaUserName ? 'empty.krishnaNamed' : 'empty.krishna'}
                      values={{ name: krishnaUserName }}
                      components={{ em: <Text style={styles.emptyItalic} /> }}
                    />
                  </Text>
                  <Text style={[styles.emptySub, { color: theme.muted }]}>
                    {t('empty.krishnaSub')}
                  </Text>
                </View>
              ) : (
                <View style={styles.emptyState}>
                  <Text style={[styles.emptyTitle, indic && styles.emptyTitleIndic, { color: theme.ink }]}>
                    <Trans
                      t={t}
                      i18nKey={profile?.isYou ? 'empty.sagaSelf' : profile ? 'empty.sagaOther' : 'empty.sagaUnknown'}
                      values={{ name: profile?.name.split(' ')[0] ?? '' }}
                      components={{ em: <Text style={styles.emptyItalic} /> }}
                    />
                  </Text>
                  <Text style={[styles.emptySub, { color: theme.muted }]}>
                    {profile?.isYou ? t('empty.sagaSubSelf') : t('empty.sagaSubOther')}
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
  followUps: {
    flexDirection: 'row',
    flexWrap:      'wrap',
    gap:           8,
    marginTop:     4,
  },
  followUp: {
    minHeight:         40,
    paddingHorizontal: 14,
    borderRadius:      999,
    borderWidth:       StyleSheet.hairlineWidth,
    justifyContent:    'center',
  },
  followUpText: {
    fontFamily: FONTS.sansRegular,
    fontSize:   13.5,
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
  emptyTitleIndic: { lineHeight: 40 },
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
