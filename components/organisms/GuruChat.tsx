'use no memo'; // renders call language helpers (tPlanet, intlLocale, ...) that the React Compiler would otherwise cache across language switches

/**
 * One guru chat (constants/gurus.ts): the profile's single ongoing thread with
 * that guru, or a past (archived) thread shown read-only.
 *
 * Used by app/chat/agent/[agent].tsx (the guru's chat; the thread is found in
 * the thread store or created on the first message) and app/chat/[threadId].tsx
 * (past conversations, saved-answer links). Streaming, reply guards, model
 * follow-up chips, save and share work as in the original Saga chat.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FlatList,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Animated, {
  Easing, FadeIn, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming,
} from 'react-native-reanimated';
import { router, useFocusEffect } from 'expo-router';
import { Trans, useTranslation } from 'react-i18next';
import { useAccent } from '@/hooks/use-accent';
import { useProfiles } from '@/hooks/use-profiles';
import { isChatErrorMessage, useChat } from '@/hooks/use-chat';
import { useThreadStore } from '@/stores/thread-store';
import { useSeenStore } from '@/stores/seen-store';
import { Icon } from '@/components/atoms/Icon';
import { EyebrowLabel } from '@/components/atoms/EyebrowLabel';
import { showActionSheet, showDialog } from '@/components/overlays';
import { ChatBubble } from '@/components/molecules/ChatBubble';
import { ChatComposer } from '@/components/organisms/ChatComposer';
import { ProfileSwitcherSheet, type ProfileSwitcherSheetRef } from '@/components/organisms/ProfileSwitcher';
import { ModelSetupPill } from '@/components/molecules/ModelSetupPill';
import { ScreenLayout } from '@/components/templates/ScreenLayout';
import { KeyboardSpacer } from '@/components/keyboard';
import { FONTS, LIGHT_TOKENS, RADIUS } from '@/constants/themes';
import { GURUS, GURU_STARTER_KEYS, type AgentId } from '@/constants/gurus';
import {
  getSavedMessageIds, saveAnswer, unsaveAnswer, updateThread as dbUpdateThread, type Message, type Thread,
} from '@/utils/database';
import { KRISHNA_PROFILE, KRISHNA_PROFILE_ID, getKrishnaStarters } from '@/utils/krishna';
import { replyLanguage, stripMarkdown, suggestFollowUps } from '@/utils/ai';
import { followUpsAvailable, planChipWindows } from '@/utils/agent/pipeline';
import { Storage } from '@/utils/storage';
import i18n, { askLanguage, tAsk, useAppLanguage } from '@/utils/i18n';
import {
  followUpCandidates, followUpKey, followUpVars, mergeFollowUps, pickFollowUps, type FollowUp,
} from '@/utils/follow-ups';
import { guruLocked, nudgeTarget } from '@/utils/guru-context';
import { openGuruChat, replaceWithGuruChat } from '@/utils/guru-nav';
import { useIndicStyles } from '@/hooks/use-indic-styles';
import { isAnswerReported, markAnswerReported, sendAnswerReport } from '@/utils/report-answer';
import { getInstallMarker } from '@/utils/model-download';

// Model-written chips per assistant message id (adapter 'followups' task); MMKV behind it.
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
const TILE_BG = 'rgba(180,130,0,0.10)';
// accentMuted is a light tint in both themes, so text on it stays dark.
const ON_ACCENT_MUTED = LIGHT_TOKENS.ink;

function newThreadId(): string {
  return 't_' + Math.random().toString(36).slice(2, 11);
}

/** The fixed self-harm reply (chat:safety.crisis) in any app language. */
function isCrisisReply(m: Pick<Message, 'role' | 'content'>): boolean {
  if (m.role !== 'assistant') return false;
  return (['en', 'hi', 'bn'] as const).some((lng) =>
    i18n.t('chat:safety.crisis', { lng, postProcess: [] }) === m.content || i18n.t('chat:safety.crisis', { lng }) === m.content);
}

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
      style={skeletonStyles.row}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
    >
      {[96, 132, 84].map((w, i) => (
        <Animated.View key={i} style={[skeletonStyles.pill, { width: w, backgroundColor: color }, animated]} />
      ))}
    </View>
  );
}
const skeletonStyles = StyleSheet.create({
  row:  { flexDirection: 'row', gap: 8, height: CHIP_ROW_HEIGHT, alignItems: 'center' },
  pill: { height: CHIP_ROW_HEIGHT, borderRadius: 999 },
});

type Props = {
  agent: AgentId;
  /** Profile the chat is about ('__krishna__' for Krishna). */
  profileId: string;
  /** Show this thread instead of the guru's active one (read-only when archived). */
  threadId?: string;
  /** A question to send once the chat is ready (Home, alerts, "Ask Saga" links). */
  ask?: string;
  /** Called after `ask` was sent, so the route can drop it from its params. */
  onAskConsumed?: () => void;
  /** Switch the chat to another person (the "About <name> ▾" header). */
  onSwitchProfile?: (profileId: string) => void;
};

export function GuruChat({ agent, profileId, threadId: fixedThreadId, ask, onAskConsumed, onSwitchProfile }: Props) {
  const styles = useIndicStyles(baseStyles);
  const { theme } = useAccent();
  const { t, i18n: inst } = useTranslation('chat');
  const indic = inst.language !== 'en';
  const appLang = useAppLanguage();
  const switcherRef = useRef<ProfileSwitcherSheetRef>(null);

  const guru = GURUS[agent] ?? GURUS.saga;
  const isKrishna = guru.mode === 'krishna';
  const guruName = t(`gurus.${agent}.name`);

  const { profiles, activeProfile, setActiveProfile } = useProfiles();
  const profile = isKrishna ? KRISHNA_PROFILE : (profiles.find((p) => p.id === profileId) ?? null);
  const firstName = profile && !isKrishna ? profile.name.split(' ')[0] : '';
  // Krishna addresses the person using the app.
  const krishnaUserName = isKrishna && activeProfile?.name ? activeProfile.name.split(' ')[0] : undefined;

  // Deep-link safety: a chat URL can outlive its profile.
  useEffect(() => {
    if (isKrishna || profiles.length === 0 || profile) return;
    showDialog({
      title:   t('unavailable.title'),
      message: t('unavailable.message'),
      actions: [{ label: t('unavailable.ok'), onPress: () => router.replace('/') }],
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isKrishna, profiles.length, profile]);

  // ─── Which thread ──────────────────────────────────────────────────────────
  // The guru's active thread from the store (hydrated at launch), else a temp
  // id that useChat persists on the first message (lazily, as before). "Start
  // over" archives the active thread and takes a fresh temp id.
  const threadPid = isKrishna ? KRISHNA_PROFILE_ID : profileId;
  const storeThreads = useThreadStore((s) => s.threads[threadPid]);
  const fixed = fixedThreadId ? storeThreads?.find((x) => x.id === fixedThreadId) : undefined;
  const active = storeThreads?.find((x) => !x.archived && x.agent === agent);
  const [tempId, setTempId] = useState(newThreadId);
  const threadId = fixedThreadId ?? active?.id ?? tempId;
  const readOnly = !!fixed?.archived;
  const isNew = !fixedThreadId && !active;
  const live: Thread | undefined = fixed ?? active;
  const locked = !isKrishna && guruLocked(agent, profile?.birthDate);

  const threadObj = useMemo<Thread>(
    () => ({
      id:                 threadId,
      profileId:          threadPid,
      agent,
      title:              null,
      archived:           false,
      archivedAt:         null,
      lastMessagePreview: null,
      pinned:             false,
      pinnedAt:           null,
      createdAt:          '',
      updatedAt:          '',
      syncedAt:           null,
    }),
    [threadId, threadPid, agent],
  );

  const { messages, isTyping, status, streamText, sendMessage, loaded } = useChat(
    threadObj, profile, isNew, guru.mode, krishnaUserName, agent,
  );

  // Seen: the Chat tab's unread dot clears once the latest reply was on screen.
  const preview = live?.lastMessagePreview ?? null;
  useEffect(() => {
    if (live && preview) useSeenStore.getState().markSeen(live.id, preview);
  }, [live, preview]);

  // Send the question this chat was opened with, once, after the thread's
  // messages have loaded (so it lands after them).
  const askedRef = useRef(false);
  useEffect(() => {
    if (askedRef.current || !ask || !profile || !loaded || readOnly || locked || isTyping) return;
    askedRef.current = true;
    sendMessage(ask);
    onAskConsumed?.();
  }, [ask, profile, loaded, readOnly, locked, isTyping, sendMessage, onAskConsumed]);

  const reversedMessages = useMemo(() => [...messages].reverse(), [messages]);

  // ─── Saved answers ─────────────────────────────────────────────────────────
  const [savedIds, setSavedIds] = useState<Set<string>>(() => new Set());
  useFocusEffect(
    useCallback(() => {
      getSavedMessageIds().then(setSavedIds).catch(() => {});
    }, []),
  );

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
            threadId,
            profileId: threadPid,
            persona:   agent,
            question:  questionFor(msg.id),
            answer:    msg.content,
          });
        }
      } catch {
        getSavedMessageIds().then(setSavedIds).catch(() => {});
      }
    },
    [savedIds, threadId, threadPid, agent, questionFor],
  );

  const shareAnswer = useCallback(
    (msg: Message) => {
      router.push({
        pathname: '/share-answer',
        params: {
          question:    questionFor(msg.id),
          answer:      stripMarkdown(msg.content),
          persona:     guru.mode,
          profileName: isKrishna ? (activeProfile?.name ?? '') : (profile?.name ?? ''),
        },
      });
    },
    [questionFor, guru.mode, isKrishna, activeProfile?.name, profile?.name],
  );

  // ─── Reported answers (Report this answer; utils/report-answer.ts) ────────
  // Reported replies are hidden behind a notice; `revealed` holds the ones
  // the user chose to show again this session.
  const [reportVersion, setReportVersion] = useState(0);
  const [revealed, setRevealed] = useState<Set<string>>(() => new Set());

  const reportAnswer = useCallback(
    (msg: Message) => {
      showDialog({
        title:   t('report.title'),
        message: t('report.message'),
        actions: [
          { label: t('report.cancel'), style: 'cancel' },
          {
            label: t('report.confirm'),
            onPress: async () => {
              const opened = await sendAnswerReport({
                question: questionFor(msg.id),
                answer:   stripMarkdown(msg.content),
                guide:    guruName,
                model:    getInstallMarker()?.version ?? null,
              });
              if (!opened) return;
              markAnswerReported(msg.id);
              setRevealed((prev) => {
                if (!prev.has(msg.id)) return prev;
                const next = new Set(prev);
                next.delete(msg.id);
                return next;
              });
              setReportVersion((v) => v + 1);
            },
          },
        ],
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [questionFor, guruName, inst.language],
  );

  const openAnswerMenu = useCallback(
    (msg: Message) => {
      const saved = savedIds.has(msg.id);
      const reported = isAnswerReported(msg.id);
      showActionSheet({
        options: [
          { label: saved ? t('menu.remove') : t('menu.save'), icon: saved ? 'bookmark-filled' : 'bookmark', onPress: () => toggleSave(msg) },
          { label: t('menu.share'), icon: 'share', onPress: () => shareAnswer(msg) },
          ...(reported ? [] : [{ label: t('menu.report'), icon: 'flag' as const, onPress: () => reportAnswer(msg) }]),
        ],
        cancelLabel: t('menu.cancel'),
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [savedIds, toggleSave, shareAnswer, reportAnswer, inst.language, reportVersion],
  );

  // ─── ⋯ menu: Start over, Share this chat ───────────────────────────────────
  const startOver = () => {
    showDialog({
      title:   t('guruMenu.startOverTitle'),
      message: t('guruMenu.startOverMessage', { guru: guruName }),
      actions: [
        { label: t('guruMenu.cancel'), style: 'cancel' },
        {
          label: t('guruMenu.startOverConfirm'),
          onPress: async () => {
            if (active) {
              const now = new Date().toISOString();
              await dbUpdateThread(active.id, { archived: true, archivedAt: now });
              useThreadStore.getState().updateThread(active.id, threadPid, { archived: true, archivedAt: now });
            }
            setTempId(newThreadId());
          },
        },
      ],
    });
  };

  const shareChat = () => {
    const lines = messages
      .filter((m) => !isChatErrorMessage(m) && !(m.role === 'assistant' && isAnswerReported(m.id)))
      .map((m) => `${m.role === 'user' ? t('guruMenu.you') : guruName}: ${stripMarkdown(m.content)}`);
    if (lines.length === 0) return;
    Share.share({ message: `${lines.join('\n\n')}\n\n— ${t('guruMenu.signature')}` }).catch(() => {});
  };

  const openMenu = () => {
    showActionSheet({
      options: [
        { label: t('guruMenu.startOver'), icon: 'restart', onPress: startOver },
        { label: t('guruMenu.share'), icon: 'share', onPress: shareChat },
      ],
      cancelLabel: t('guruMenu.cancel'),
    });
  };

  // Rows re-render when saves, reports or revealed answers change.
  const listExtra = useMemo(() => ({ savedIds, reportVersion, revealed }), [savedIds, reportVersion, revealed]);

  // ─── Rows ──────────────────────────────────────────────────────────────────
  const renderMessage = ({ item }: { item: Message }) => {
    if (isCrisisReply(item)) {
      return (
        <View
          style={[styles.note, styles.crisis, { borderColor: theme.hairline2, backgroundColor: theme.surface }]}
          accessibilityRole="text"
        >
          <Icon name="phone" size={16} color={theme.accent} />
          <Text style={[styles.noteText, styles.crisisText, { color: theme.ink }]}>{item.content}</Text>
        </View>
      );
    }
    if (item.role === 'assistant' && isChatErrorMessage(item)) {
      return <ChatBubble role="assistant" content={item.content} />;
    }
    if (item.role === 'assistant') {
      const reported = isAnswerReported(item.id);
      if (reported && !revealed.has(item.id)) {
        return (
          <ChatBubble
            role="assistant"
            content=""
            hiddenAsReported={{ onShow: () => setRevealed((prev) => new Set(prev).add(item.id)) }}
          />
        );
      }
      return (
        <ChatBubble
          role="assistant"
          content={item.content}
          actions={{
            saved:        savedIds.has(item.id),
            onToggleSave: () => toggleSave(item),
            onShare:      () => shareAnswer(item),
            onReport:     () => reportAnswer(item),
            reported,
          }}
          onLongPress={() => openAnswerMenu(item)}
        />
      );
    }
    return <ChatBubble role={item.role} content={item.content} />;
  };

  // ─── Follow-up chips and the off-topic nudge ───────────────────────────────
  const lastMessage   = messages[messages.length - 1];
  const showFollowUps = !readOnly && !isKrishna && !isTyping && lastMessage?.role === 'assistant'
    && !isChatErrorMessage(lastMessage) && !isCrisisReply(lastMessage);
  const lastQuestion = useMemo(
    () => [...messages].reverse().find((m) => m.role === 'user')?.content ?? '',
    [messages],
  );
  const nudge = showFollowUps ? nudgeTarget(agent, lastQuestion) : null;

  const followUps = useMemo(() => {
    if (!showFollowUps || !lastMessage) return [];
    const askLang = askLanguage();
    const asked = messages.filter((m) => m.role === 'user').map((m) => m.content);
    const label = (c: FollowUp) => t(followUpKey(c), followUpVars(c, appLang));
    const send  = (c: FollowUp) => tAsk(`chat:${followUpKey(c)}`, followUpVars(c, askLang));
    const question = asked[asked.length - 1] ?? '';
    const history = messages.slice(0, -2).filter((m) => !isChatErrorMessage(m))
      .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }));
    // Chip dates come from the same timing engine as the reply.
    const windows = profile && question ? planChipWindows(profile, question, history, replyLanguage(question), agent) : [];
    const candidates = followUpCandidates({ reply: lastMessage.content, question, windows });
    return pickFollowUps(candidates, asked, (c) => [label(c), send(c)])
      .map((c) => ({ id: followUpKey(c), label: label(c), ask: send(c) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showFollowUps, lastMessage?.id, lastMessage?.content, messages.length, appLang]);

  // Model-written chips (the active adapter's 'followups' task): see the notes in the original Saga
  // chat — a same-height skeleton while the model writes them, rule-based
  // chips on timeout or too few valid ones, cached per message id.
  const [settledId, setSettledId] = useState<string | null>(null);
  const typingSeen = useRef(false);
  if (isTyping) typingSeen.current = true;
  const waitedIds = useRef(new Set<string>());
  const lastId = lastMessage?.id ?? null;
  const modelEligible = showFollowUps && lastMessage?.modelTier === 'executorch' && followUpsAvailable();
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
      cancelled = true;
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

  // ─── Welcome (empty chat) ──────────────────────────────────────────────────
  const starters = useMemo(() => {
    if (isKrishna) return getKrishnaStarters().map((s) => ({ id: s.id, label: s.label, prompt: s.prompt }));
    const who = profile?.isYou === false ? 'other' : 'you';
    return GURU_STARTER_KEYS.map((k) => ({
      id:     k,
      label:  t(`gurus.${agent}.starters.${who}.${k}`, { name: firstName }),
      prompt: tAsk(`chat:gurus.${agent}.starters.${who}.${k}`, { name: firstName }),
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agent, isKrishna, profile?.id, profile?.isYou, firstName, inst.language]);

  const welcomeText = isKrishna
    ? (krishnaUserName ? t('gurus.krishna.welcome.you', { name: krishnaUserName }) : t('gurus.krishna.welcome.anon'))
    : t(`gurus.${agent}.welcome.${profile?.isYou === false ? 'other' : 'you'}`, { name: firstName });

  const showWelcome = loaded && messages.length === 0 && !isTyping && !readOnly;

  const welcome = (
    <ScrollView
      style={styles.flex}
      contentContainerStyle={styles.welcome}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.hero}>
        <View style={[styles.heroIcon, { backgroundColor: TILE_BG }]}>
          <Icon name={guru.icon} size={26} color={theme.accent} />
        </View>
        <Text style={[styles.heroTitle, indic && styles.heroTitleIndic, { color: theme.ink }]} accessibilityRole="header">
          <Trans t={t} i18nKey={`gurus.${agent}.title`} components={{ em: <Text style={styles.italic} /> }} />
        </Text>
        <Text style={[styles.heroLine, { color: theme.muted }]}>{t(`gurus.${agent}.line`)}</Text>
      </View>

      {locked ? (
        <View style={[styles.note, { borderColor: theme.hairline2 }]} accessibilityRole="text">
          <Icon name="heart" size={16} color={theme.ink2} />
          <View style={styles.flex}>
            <Text style={[styles.noteTitle, { color: theme.ink }]}>{t('minor.title')}</Text>
            <Text style={[styles.noteText, { color: theme.ink2 }]}>{t('minor.body', { name: firstName })}</Text>
          </View>
        </View>
      ) : (
        <>
          <View style={[styles.welcomeBubble, { backgroundColor: theme.surface2 }]}>
            <Text style={[styles.welcomeText, { color: theme.ink }]}>{welcomeText}</Text>
          </View>

          {guru.wellbeingNote && (
            <View style={[styles.note, { borderColor: theme.hairline2 }]} accessibilityRole="text">
              <Icon name="phone" size={16} color={theme.ink2} />
              <Text style={[styles.noteText, styles.flex, { color: theme.ink2 }]}>
                <Trans t={t} i18nKey="wellbeingNote" components={{ b: <Text style={[styles.bold, { color: theme.ink }]} /> }} />
              </Text>
            </View>
          )}
        </>
      )}

      <View style={styles.starters}>
        <EyebrowLabel size={11}>{locked ? t('minor.tryInstead') : t('tryAsking')}</EyebrowLabel>
        {locked
          ? (['family', 'study'] as const).map((g) => (
              <TouchableOpacity
                key={g}
                onPress={() => replaceWithGuruChat(g, profileId)}
                style={[styles.starter, styles.starterRow, { backgroundColor: theme.surface, borderColor: theme.hairline2 }]}
                accessibilityRole="button"
              >
                <Icon name={GURUS[g].icon} size={15} color={theme.accent} />
                <Text style={[styles.starterText, { color: theme.ink }]}>{t(`gurus.${g}.ask`)}</Text>
                <Icon name="chevron" size={13} color={theme.ink2} />
              </TouchableOpacity>
            ))
          : starters.map((s) => (
              <TouchableOpacity
                key={s.id}
                onPress={() => sendMessage(s.prompt)}
                style={[styles.starter, { backgroundColor: theme.surface, borderColor: theme.hairline2 }]}
                accessibilityRole="button"
              >
                <Text style={[styles.starterText, { color: theme.ink }]}>{s.label}</Text>
              </TouchableOpacity>
            ))}
      </View>
    </ScrollView>
  );

  // ─── Header ────────────────────────────────────────────────────────────────
  const canSwitch = !isKrishna && !readOnly && !!onSwitchProfile && profiles.length > 1;
  const subtitle = isKrishna
    ? t('header.krishnaSub')
    : readOnly
      ? t('past.readOnly', { name: firstName })
      : t('header.about', { name: firstName });

  return (
    <ScreenLayout edges={['top', 'left', 'right']}>
      <View style={styles.flex}>
        <View style={[styles.header, { borderBottomColor: theme.hairline }]}>
          <TouchableOpacity onPress={() => router.back()} style={styles.headerBtn} accessibilityRole="button" accessibilityLabel={t('header.back')}>
            <Icon name="back" size={22} color={theme.ink} />
          </TouchableOpacity>
          <View style={[styles.headerIcon, { backgroundColor: TILE_BG }]}>
            <Icon name={guru.icon} size={17} color={theme.accent} />
          </View>
          <TouchableOpacity
            style={styles.headerText}
            disabled={!canSwitch}
            onPress={() => switcherRef.current?.present()}
            accessibilityRole={canSwitch ? 'button' : 'header'}
            accessibilityLabel={canSwitch ? t('header.aboutA11y', { guru: guruName, name: firstName }) : `${guruName}, ${subtitle}`}
          >
            <Text style={[styles.headerName, { color: theme.ink }]} numberOfLines={1}>{guruName}</Text>
            <View style={styles.headerSubRow}>
              <Text style={[styles.headerSub, indic && styles.noTracking, { color: theme.muted }]} numberOfLines={1}>{subtitle}</Text>
              {canSwitch && <Icon name="chevron-down" size={11} color={theme.muted} />}
            </View>
          </TouchableOpacity>
          {!readOnly && !locked && (
            <TouchableOpacity
              onPress={openMenu}
              style={styles.headerBtn}
              disabled={isTyping}
              accessibilityRole="button"
              accessibilityLabel={t('guruMenu.a11y')}
            >
              <Icon name="more" size={20} color={isTyping ? theme.faint : theme.ink2} />
            </TouchableOpacity>
          )}
        </View>

        {!readOnly && <ModelSetupPill style={styles.setupPill} />}

        {!loaded ? (
          <View style={styles.flex} />
        ) : showWelcome || (locked && messages.length === 0) ? (
          welcome
        ) : (
          <FlatList
            inverted
            data={reversedMessages}
            keyExtractor={(m) => m.id}
            renderItem={renderMessage}
            extraData={listExtra}
            contentContainerStyle={styles.messageList}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            // Inverted: the header renders at the visual bottom.
            ListHeaderComponent={
              isTyping ? (
                <ChatBubble
                  role="assistant"
                  content=""
                  isStreaming
                  status={status}
                  streamText={streamText || undefined}
                  persona={guruName}
                />
              ) : showFollowUps ? (
                <View>
                  {nudge && (
                    <TouchableOpacity
                      onPress={() => openGuruChat(nudge, profileId, lastQuestion)}
                      style={[styles.nudge, { borderColor: theme.accent, backgroundColor: theme.accentMuted }]}
                      accessibilityRole="button"
                      accessibilityLabel={t('nudgeA11y', { guru: t(`gurus.${nudge}.name`) })}
                    >
                      <Icon name={GURUS[nudge].icon} size={15} color={ON_ACCENT_MUTED} />
                      <Text style={[styles.nudgeText, { color: ON_ACCENT_MUTED }]}>{t(`gurus.${nudge}.ask`)}</Text>
                      <Icon name="chevron" size={13} color={ON_ACCENT_MUTED} />
                    </TouchableOpacity>
                  )}
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
                </View>
              ) : null
            }
            // Inverted: the footer renders at the visual top.
            ListFooterComponent={
              messages.length > 6 ? (
                <Text style={[styles.contextNote, { color: theme.muted }]}>
                  {t('contextNoteGuru', { guru: guruName })}
                </Text>
              ) : null
            }
          />
        )}

        {readOnly ? (
          <View style={[styles.continueBar, { borderTopColor: theme.hairline }]}>
            <TouchableOpacity
              onPress={() => replaceWithGuruChat(agent, profileId)}
              style={[styles.continueBtn, { backgroundColor: theme.ink }]}
              accessibilityRole="button"
            >
              <Text style={[styles.continueText, { color: theme.bg }]}>{t('past.continue', { guru: guruName })}</Text>
            </TouchableOpacity>
          </View>
        ) : locked ? null : (
          <>
            <ChatComposer
              onSend={sendMessage}
              disabled={isTyping || !loaded}
              placeholder={t('composer.guruPlaceholder', { guru: guruName })}
            />
            <KeyboardSpacer />
          </>
        )}
      </View>

      {canSwitch && (
        <ProfileSwitcherSheet
          ref={switcherRef}
          profiles={profiles}
          activeProfileId={profileId}
          onSelect={(p) => {
            setActiveProfile(p.id);
            if (p.id !== profileId) onSwitchProfile?.(p.id);
          }}
          onCreateNew={() => router.push('/profile/new')}
        />
      )}
    </ScreenLayout>
  );
}

const baseStyles = StyleSheet.create({
  flex: { flex: 1 },
  italic: { fontFamily: FONTS.serifItalic },
  bold: { fontFamily: FONTS.sansSemiBold },
  setupPill: { marginTop: 8, marginBottom: 2 },
  header: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:               6,
    paddingLeft:       10,
    paddingRight:      12,
    paddingVertical:   10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerBtn: {
    width:          44,
    height:         44,
    alignItems:     'center',
    justifyContent: 'center',
  },
  headerIcon: {
    width:          34,
    height:         34,
    borderRadius:   17,
    alignItems:     'center',
    justifyContent: 'center',
  },
  headerText: {
    flex:              1,
    minWidth:          0,
    paddingHorizontal: 6,
    paddingVertical:   4,
    gap:               1,
  },
  headerName: {
    fontFamily:    FONTS.sansMedium,
    fontSize:      14.5,
    letterSpacing: -0.1,
  },
  headerSubRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  headerSub: {
    flexShrink:    1,
    fontFamily:    FONTS.monoRegular,
    fontSize:      10.5,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  noTracking: { letterSpacing: 0 },

  welcome: {
    paddingHorizontal: 16,
    paddingTop:        28,
    paddingBottom:     20,
    gap:               16,
  },
  hero: {
    alignItems:        'center',
    gap:               8,
    paddingHorizontal: 10,
    paddingTop:        8,
    paddingBottom:     10,
  },
  heroIcon: {
    width:          56,
    height:         56,
    borderRadius:   28,
    alignItems:     'center',
    justifyContent: 'center',
  },
  heroTitle: {
    marginTop:  4,
    fontFamily: FONTS.serifRegular,
    fontSize:   28,
    lineHeight: 32,
    textAlign:  'center',
  },
  heroTitleIndic: { lineHeight: 42 },
  heroLine: {
    fontFamily: FONTS.sansRegular,
    fontSize:   14,
    lineHeight: 20,
    textAlign:  'center',
  },
  welcomeBubble: {
    alignSelf:               'flex-start',
    maxWidth:                '84%',
    paddingHorizontal:       16,
    paddingVertical:         12,
    borderTopLeftRadius:     18,
    borderTopRightRadius:    18,
    borderBottomRightRadius: 18,
    borderBottomLeftRadius:  5,
  },
  welcomeText: {
    fontFamily:    FONTS.sansRegular,
    fontSize:      15.5,
    lineHeight:    24,
    letterSpacing: -0.1,
  },
  note: {
    flexDirection:     'row',
    alignItems:        'flex-start',
    gap:               10,
    paddingHorizontal: 14,
    paddingVertical:   12,
    borderRadius:      RADIUS.medium,
    borderWidth:       1,
  },
  noteTitle: {
    fontFamily:   FONTS.sansMedium,
    fontSize:     14,
    lineHeight:   20,
    marginBottom: 2,
  },
  noteText: {
    fontFamily: FONTS.sansRegular,
    fontSize:   12.5,
    lineHeight: 18,
  },
  crisis: {
    alignSelf: 'stretch',
    marginVertical: 4,
  },
  crisisText: {
    flex:       1,
    fontSize:   15,
    lineHeight: 23,
  },
  starters: {
    marginTop:  6,
    gap:        8,
    alignItems: 'flex-start',
  },
  starter: {
    minHeight:         40,
    paddingHorizontal: 14,
    paddingVertical:   8,
    borderRadius:      RADIUS.pill,
    borderWidth:       1,
    justifyContent:    'center',
  },
  starterRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  starterText: {
    fontFamily: FONTS.sansRegular,
    fontSize:   13.5,
    lineHeight: 18,
  },

  messageList: {
    padding:  16,
    gap:      8,
    flexGrow: 1,
  },
  nudge: {
    alignSelf:         'flex-start',
    flexDirection:     'row',
    alignItems:        'center',
    gap:               8,
    minHeight:         40,
    marginTop:         4,
    marginBottom:      8,
    marginLeft:        2,
    paddingHorizontal: 14,
    borderRadius:      RADIUS.pill,
    borderWidth:       1,
  },
  nudgeText: {
    fontFamily: FONTS.sansRegular,
    fontSize:   13.5,
  },
  followUpsBox: {
    height:    CHIP_ROW_HEIGHT,
    marginTop: 4,
  },
  followUpsScroll: { marginHorizontal: -16 },
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
    fontFamily:        FONTS.sansRegular,
    fontSize:          11.5,
    fontStyle:         'italic',
    textAlign:         'center',
    paddingVertical:   12,
    paddingHorizontal: 24,
  },
  continueBar: {
    paddingHorizontal: 16,
    paddingTop:        10,
    paddingBottom:     24,
    borderTopWidth:    StyleSheet.hairlineWidth,
  },
  continueBtn: {
    height:         52,
    borderRadius:   RADIUS.pill,
    alignItems:     'center',
    justifyContent: 'center',
  },
  continueText: {
    fontFamily: FONTS.sansMedium,
    fontSize:   15.5,
  },
});
