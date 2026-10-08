'use no memo'; // renders call language helpers (tPlanet, intlLocale, ...) that the React Compiler would otherwise cache across language switches

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FlatList,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Animated, {
  Easing, FadeIn, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming,
} from 'react-native-reanimated';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Trans, useTranslation } from 'react-i18next';
import { useAccent } from '@/hooks/use-accent';
import { useProfiles } from '@/hooks/use-profiles';
import { useThreads } from '@/hooks/use-threads';
import { isChatErrorMessage, useChat } from '@/hooks/use-chat';
import { Avatar } from '@/components/atoms/Avatar';
import { Icon } from '@/components/atoms/Icon';
import { showActionSheet, showDialog } from '@/components/overlays';
import { ChatBubble } from '@/components/molecules/ChatBubble';
import { ChatComposer } from '@/components/organisms/ChatComposer';
import { ModelSetupPill } from '@/components/molecules/ModelSetupPill';
import { ScreenLayout } from '@/components/templates/ScreenLayout';
import { KeyboardSpacer } from '@/components/keyboard';
import { FONTS } from '@/constants/themes';
import { buildPersonalizedStarters } from '@/constants/starters';
import { getSavedMessageIds, saveAnswer, unsaveAnswer, type Message } from '@/utils/database';
import { KRISHNA_PROFILE, getKrishnaStarters, isKrishnaProfile } from '@/utils/krishna';
import { replyLanguage, stripMarkdown, suggestFollowUps, type AIMode } from '@/utils/ai';
import { MODEL_FOLLOWUPS, isLLMReady } from '@/utils/local-llm';
import { Storage } from '@/utils/storage';
import { askLanguage, tAsk, useAppLanguage } from '@/utils/i18n';
import {
  followUpCandidates, followUpKey, followUpVars, mergeFollowUps, pickFollowUps, MODEL_FOLLOWUPS_MIN, type FollowUp,
} from '@/utils/follow-ups';
import { useIndicStyles } from '@/hooks/use-indic-styles';

// Model-written chips per assistant message id (MODEL_FOLLOWUPS); MMKV behind it.
const modelChipCache = new Map<string, string[]>();
function cachedModelChips(messageId: string): string[] | null {
  const hit = modelChipCache.get(messageId);
  if (hit) return hit;
  const stored = Storage.getFollowUps(messageId);
  if (stored) modelChipCache.set(messageId, stored);
  return stored;
}

// Chip row height (chips, skeleton pills and the reserved space all share it).
const CHIP_ROW_HEIGHT = 40;
// Longest we wait quietly for the model's chips before showing the rule-based ones.
const MODEL_CHIPS_TIMEOUT_MS = 8000;

/** Same-height stand-in for the chip row while the model writes the chips: soft pulsing pills. */
function ChipSkeleton({ color }: { color: string }) {
  const pulse = useSharedValue(0.35);
  useEffect(() => {
    pulse.value = withRepeat(
      withSequence(
        withTiming(0.9, { duration: 800, easing: Easing.inOut(Easing.quad) }),
        withTiming(0.35, { duration: 800, easing: Easing.inOut(Easing.quad) }),
      ),
      -1,
    );
  }, [pulse]);
  const animated = useAnimatedStyle(() => ({ opacity: pulse.value }));
  return (
    <View
      style={styles_skeleton.row}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
    >
      {[96, 132, 84].map((w, i) => (
        <Animated.View key={i} style={[styles_skeleton.pill, { width: w, backgroundColor: color }, animated]} />
      ))}
    </View>
  );
}
const styles_skeleton = StyleSheet.create({
  row:  { flexDirection: 'row', gap: 8, height: CHIP_ROW_HEIGHT, alignItems: 'center' },
  pill: { height: CHIP_ROW_HEIGHT, borderRadius: 999 },
});

export default function ChatScreen() {
  const styles = useIndicStyles(baseStyles);
  const { theme } = useAccent();
  const { t, i18n } = useTranslation('chat');
  const indic = i18n.language !== 'en';
  const appLang = useAppLanguage();
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
      showDialog({
        title:   t('unavailable.title'),
        message: t('unavailable.message'),
        actions: [{ label: t('unavailable.ok'), onPress: () => router.replace('/') }],
      });
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

  // Long-press menu — same JS action sheet on iOS and Android.
  const openAnswerMenu = useCallback(
    (msg: Message) => {
      const saved = savedIds.has(msg.id);
      showActionSheet({
        options: [
          {
            label:   saved ? t('menu.remove') : t('menu.save'),
            icon:    saved ? 'bookmark-filled' : 'bookmark',
            onPress: () => toggleSave(msg),
          },
          { label: t('menu.share'), icon: 'share', onPress: () => shareAnswer(msg) },
        ],
        cancelLabel: t('menu.cancel'),
      });
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
    item.role === 'assistant' && isChatErrorMessage(item) ? (
      // Error bubbles: nothing to save or share.
      <ChatBubble role="assistant" content={item.content} />
    ) : item.role === 'assistant' ? (
      <ChatBubble
        role="assistant"
        content={item.content}
        actions={{
          saved:        savedIds.has(item.id),
          onToggleSave: () => toggleSave(item),
          onShare:      () => shareAnswer(item),
        }}
        onLongPress={() => openAnswerMenu(item)}
      />
    ) : (
      <ChatBubble role={item.role} content={item.content} />
    );

  // Follow-up chips sit under Saga's latest reply once it has finished.
  const lastMessage   = messages[messages.length - 1];
  const showFollowUps = !isKrishna && !isTyping && lastMessage?.role === 'assistant' && !isChatErrorMessage(lastMessage);

  // Chosen from what the reply said (utils/follow-ups.ts). The chip shows the
  // app language; tAsk() sends it in the language the model speaks.
  const followUps = useMemo(() => {
    if (!showFollowUps || !lastMessage) return [];
    const askLang = askLanguage();
    const asked = messages.filter((m) => m.role === 'user').map((m) => m.content);
    const label = (c: FollowUp) => t(followUpKey(c), followUpVars(c, appLang));
    const send  = (c: FollowUp) => tAsk(`chat:${followUpKey(c)}`, followUpVars(c, askLang));
    const candidates = followUpCandidates({ reply: lastMessage.content, question: asked[asked.length - 1] });
    return pickFollowUps(candidates, asked, (c) => [label(c), send(c)])
      .map((c) => ({ id: followUpKey(c), label: label(c), ask: send(c) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showFollowUps, lastMessage?.id, lastMessage?.content, messages.length, appLang]);

  // ─── Model-written chips (MODEL_FOLLOWUPS, v2.1 model) ────────────────────
  // Only model-written chips are shown. For a reply that just finished on this
  // screen, the row is a same-height skeleton while the model writes them (after
  // the title, in the model queue), then they fade in (opacity only). If the
  // model gives fewer than MODEL_FOLLOWUPS_MIN valid chips, errors, isn't loaded,
  // or takes over MODEL_CHIPS_TIMEOUT_MS, the rule-based chips fade in instead.
  // Cached chips (per message id, MMKV) show at once with no skeleton or fade;
  // so do older replies without a cache, and canned replies (greetings,
  // declines), which get the rule-based chips directly. Sending a message
  // cancels the run. Flag off: the rule-based row, as before.
  const [settledId, setSettledId] = useState<string | null>(null); // wait over for this message id
  const typingSeen = useRef(false); // a reply finished while this screen was open
  if (isTyping) typingSeen.current = true;
  const waitedIds = useRef(new Set<string>()); // ids that showed the skeleton: their row fades in
  const lastId = lastMessage?.id ?? null;
  const modelEligible = MODEL_FOLLOWUPS && showFollowUps && lastMessage?.modelTier === 'executorch' && isLLMReady();
  const cachedChips = modelEligible && lastId ? cachedModelChips(lastId) : null;
  const waiting = modelEligible && typingSeen.current && !!lastId && cachedChips === null && settledId !== lastId;
  if (waiting && lastId) waitedIds.current.add(lastId);

  useEffect(() => {
    if (!waiting || !lastMessage) return;
    const id = lastMessage.id;
    let cancelled = false;
    const history = messages.slice(0, -1).filter((m) => !isChatErrorMessage(m))
      .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }));
    const question = [...history].reverse().find((m) => m.role === 'user')?.content ?? '';
    const timer = setTimeout(() => {
      if (cancelled) return;
      cancelled = true; // stops the run; the late result would only shift the row
      setSettledId(id);
    }, MODEL_CHIPS_TIMEOUT_MS);
    suggestFollowUps(profile, history, lastMessage.content, replyLanguage(question), { isCancelled: () => cancelled })
      .then((chips) => {
        if (cancelled) return;
        clearTimeout(timer);
        modelChipCache.set(id, chips);
        Storage.setFollowUps(id, chips);
        setSettledId(id);
      })
      .catch(() => { if (!cancelled) { clearTimeout(timer); setSettledId(id); } });
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [waiting, lastId]);

  const shownFollowUps = mergeFollowUps(followUps, cachedChips, appLang);
  const fadeInRow = !!lastId && waitedIds.current.has(lastId);

  const isNewEmpty = isNew === 'true' && messages.length === 0;

  return (
    <ScreenLayout edges={['top', 'left', 'right']}>
      <View style={{ flex: 1 }}>
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
          {!isNewEmpty && !isKrishna && (
            <TouchableOpacity style={styles.archiveBtn} onPress={handleArchive}>
              <Icon name="archive" size={16} color={theme.muted} />
              <Text style={[styles.archiveBtnLabel, { color: theme.muted }]}>{t('header.archive')}</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Saga's model still downloading: progress, or Retry after a failure. */}
        <ModelSetupPill style={styles.setupPill} />

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
              <View style={styles.followUpsBox}>
                {waiting ? (
                  <ChipSkeleton color={theme.hairline2} />
                ) : (
                  <Animated.View key={lastId} entering={fadeInRow ? FadeIn.duration(220) : undefined}>
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      keyboardShouldPersistTaps="handled"
                      style={styles.followUpsScroll}
                      contentContainerStyle={styles.followUps}
                    >
                      {shownFollowUps.map((chip) => (
                        <TouchableOpacity
                          key={chip.id}
                          onPress={() => sendMessage(chip.ask)}
                          style={[styles.followUp, { backgroundColor: theme.surface, borderColor: theme.hairline2 }]}
                          accessibilityRole="button"
                        >
                          <Text numberOfLines={1} style={[styles.followUpText, { color: theme.ink }]}>{chip.label}</Text>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  </Animated.View>
                )}
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
        {/* Room for the keyboard (app or phone) below the composer. */}
        <KeyboardSpacer />
      </View>
    </ScreenLayout>
  );
}

const baseStyles = StyleSheet.create({
  setupPill: { marginTop: 8, marginBottom: 2 },
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
  // One swipeable row, edge to edge (like the home screen): a fixed height, so
  // the skeleton, the model chips and the fallback chips never move the list.
  followUpsBox: {
    height:    CHIP_ROW_HEIGHT,
    marginTop: 4,
  },
  followUpsScroll: {
    marginHorizontal: -16,   // bleed past the list padding
  },
  followUps: {
    flexDirection:     'row',
    gap:               8,
    paddingHorizontal: 16,
  },
  followUp: {
    height:            CHIP_ROW_HEIGHT,
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
