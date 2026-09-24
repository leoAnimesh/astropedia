# Astropedia — AI Conversation Experience

Astropedia is a local-first Vedic astrology app built with React Native (Expo, TypeScript). Its AI astrologer, **Saga** (plus a reflective **Krishna** mode), runs **entirely on the device** through [`react-native-executorch`](https://github.com/software-mansion/react-native-executorch). No prompt, reply or chart ever leaves the phone, and there is no cloud LLM fallback.

This branch adds the *Next Generation AI Conversation Experience* assessment on top of the existing chat. The chat was not replaced with a mock screen. The timeline, recommendation framework, message actions, feedback, delivery states and loading/error states are all built into the real, persisted, on-device chat.

**Demo video:** _add link here_

### Tech stack

| Area | Choice |
| --- | --- |
| Framework | React Native 0.81 · Expo SDK 54 (dev client, New Architecture) · TypeScript |
| Navigation | `expo-router`, which is built on **React Navigation** (native stack) |
| State | **Zustand** stores + SQLite (`expo-sqlite`) as the source of truth |
| AI | `react-native-executorch` 0.8.4: on-device LLM (Qwen 3 / LFM2.5), on-device embeddings for RAG |
| Tests | `node:test` for the pure logic |

### Contents: the sections the brief asks for

| Required in the brief | Section |
| --- | --- |
| Project structure | [Project structure](#project-structure) |
| Component architecture | [Component architecture](#component-architecture) |
| State management approach | [State management](#state-management) |
| Recommendation rendering strategy | [Recommendation rendering strategy](#recommendation-rendering-strategy) |
| Performance considerations | [Performance considerations](#performance-considerations) |
| Trade-offs made due to time constraints | [Trade-offs and what's left](#trade-offs-and-whats-left) |
| Extras | [Assignment coverage](#assignment-coverage) · [Message schema](#message-schema) · [How the local LLM works](#how-the-local-llm-works) · [Edge cases handled](#edge-cases-handled) |

---

## Quick start

```bash
yarn install
npx expo run:ios        # or: npx expo run:android  (builds the dev client)
yarn start              # Metro, for later sessions
```

* **A native build is required.** On-device inference and SQLite are native modules, so Expo Go won't work. If you already had a dev client installed, rebuild it once: this branch adds `expo-clipboard`. Until you rebuild, Copy shows a friendly "rebuild" message instead of crashing.
* **The first launch downloads a small model** (~0.2 GB) behind a progress overlay, so chat works quickly. The phone's full model (up to ~0.9 GB, depending on its RAM tier; see [Model selection](#model-selection)) then downloads in the background and swaps in when it's ready ([Progressive loading](#progressive-loading)). After that the app works offline.
* Finish onboarding (name, birth details), then open a conversation from the home screen.

#### Troubleshooting on Xcode 27

* **`Can't determine id of Simulator app`:** Xcode 27 no longer ships a separate `Simulator.app`, and Expo CLI (SDK 54) looks it up before launching. Two ways around it:
  * Run `yarn start`, open `ios/astropedia.xcworkspace` in Xcode, pick a simulator and press ⌘R.
  * Run on a real iPhone with `npx expo run:ios --device`.
* **`IPHONEOS_DEPLOYMENT_TARGET is set to 9.0 / 12.4 …` (e.g. RNSVG, SDWebImage):** Xcode 27 only accepts 15.0 and up. The config plugin `plugins/with-min-pod-deployment-target.js` (registered in `app.json`) raises every pod to 15.1 in the Podfile's `post_install`, so the fix survives `expo prebuild`. After pulling this change, run `cd ios && pod install`, or `npx expo prebuild --clean`.
* **Crash at launch: `EXC_BREAKPOINT` in `AppDelegate`, with "scene-based life cycle" in the console.** Apps built with the iOS 27 SDK must adopt the UIScene life cycle. `plugins/with-uiscene-lifecycle.js` adds a `UIApplicationSceneManifest` to Info.plist and moves window creation from the AppDelegate into a `SceneDelegate`, which also forwards deep links and universal links. Run `npx expo prebuild --clean` to apply it.
* **Bundle ID / package:** `com.astropedia` on both platforms.

### Checks

```bash
yarn typecheck   # tsc --noEmit
yarn lint        # expo lint (0 errors)
yarn test        # unit tests for the pure logic (Node's built-in runner, no extra deps)
```

### Demo / screen-recording helpers (dev builds only)

In any Saga chat, tap the **bug icon** in the header to open **Developer tools**:

| Control | What it demonstrates |
| --- | --- |
| **Open demo conversation (mock payload)** | Creates a real thread seeded with the assignment's exact payload (system → user → AI with 4 cards → human astrologer), plus an earlier-day session with a promotion card, a `remedy` card, an **unknown type** (fallback card) and a malformed card (dropped). Replies after that come from the on-device model. |
| **Fail next send** (one-shot) | The next message shows *Sending… → Failed · Network error (simulated) → Retry*. Tap Retry and it goes through. |
| **Fail next conversation load** (one-shot) + **Reload conversation** | *Loading conversation...* → *Unable to load conversation.* → **Retry** → recovers. |
| **Slow conversation load** | Adds ~1.2 s so *Loading conversation...* stays visible. |

The empty state (*Start your conversation.*) appears on any new chat.

---

## Assignment coverage

| Requirement | Where / how |
| --- | --- |
| User, AI, human-astrologer and system message types | `Message.role` = `user \| assistant \| human \| system` (`utils/database.ts`). One renderer per type in `components/organisms/ChatTimelineRow.tsx` |
| Virtualized chat list | Inverted `FlatList` with tuned virtualization (`app/chat/[threadId].tsx`) |
| Auto-scroll to latest | Always on send. Incoming replies auto-follow when you're near the bottom (`maintainVisibleContentPosition.autoscrollToTopThreshold`). A **Latest** pill appears when you've scrolled up |
| Date separators | `buildTimeline()` in `utils/chat-timeline.ts` (Today / Yesterday / `Mon, 22 Sep` / `5 Jan 2025`) |
| Message grouping | Same author, same day, within 5 min → grouped (sender label once, tighter spacing, flat inner corners) |
| Reusable message components | `ChatBubble`, `ReplyQuote`, `DateSeparator`, `SystemEventRow`, `MessageStatusLine`, `FeedbackBar`, `RecommendationCarousel` |
| Recommendation framework (gemstone, tarot, consultation, article, promotion) | Registry in `components/recommendations/`, one file per type, safe fallback for unknown types. Extra `remedy` type added to show extensibility |
| Multiple cards, horizontal scrolling, tap → Alert | `RecommendationCarousel` (snap scrolling). Each type's `onPress` shows an Alert with real content: the gemstone's planet, a random Major Arcana draw, a corpus article excerpt, a mantra. Promotions deep-link to in-app screens |
| Mock payload as initial state | `constants/demo-conversation.ts` (verbatim), normalized by `utils/conversation-normalize.ts`, seeded via dev tools |
| Long-press → Reply / Copy / Delete | `MessageActionSheet`. AI: Reply/Copy/Delete. Human: Reply/Copy. User: Copy/Delete |
| Delete keeps your scroll position | Removed from state and SQLite. `maintainVisibleContentPosition` keeps the viewport anchored |
| Reply preview above composer | `ReplyPreviewBar` in `ChatComposer`. The sent message carries a quoted snapshot, and the quote is also passed to the model as context |
| 👍 / 👎 + dislike reasons | `FeedbackBar`: Inaccurate / Too Generic / Didn't Help / Too Long (multi-select), stored on the message (state + SQLite) |
| Composer: optimistic send, delay, Sending / Sent / Failed / Retry | See [Message delivery states](#message-delivery-states) |
| Loading / empty / network-failure states | `ConversationStateView` + `ListEmptyComponent` |

---

## Message schema

**Incoming payload.** The brief's payload is accepted verbatim, with two optional extensions. `utils/conversation-normalize.ts` validates and repairs it:

```jsonc
{
  "id": "4",
  "type": "human",                      // system | user | ai | human; other types or empty text are dropped
  "text": "I also recommend focusing on your upcoming Jupiter transit.",
  "createdAt": "2026-09-24T10:02:00Z",  // optional; synthesised in order when missing
  "author": "Pandit Sharma",            // optional; display name for human astrologers
  "recommendations": [                  // ai messages only
    { "id": "1", "type": "gemstone", "title": "Blue Sapphire", "subtitle": "Recommended for Saturn",
      "meta": { "planet": "Saturn" } }  // optional, type-specific data
  ]
}
```

**Stored message.** The domain type lives in `types/conversation.ts` and is persisted in SQLite (migration v5). The stored message adds the client-side state the payload doesn't carry:

| Field | Type |
| --- | --- |
| `role` | `'user' \| 'assistant' \| 'human' \| 'system'` |
| `status` / `failureReason` | `'sending' \| 'sent' \| 'failed'` / `model-unavailable \| generation-failed \| empty-reply \| interrupted \| storage \| simulated` |
| `feedback` | `{ rating: 'like' \| 'dislike', reasons: ('inaccurate' \| 'too-generic' \| 'didnt-help' \| 'too-long')[] }` |
| `replyTo` | `{ id, role, author, preview }`, a snapshot so the quote survives deletion of the original |
| `recommendations` | `{ id, type, title, subtitle?, meta? }[]` |

`Recommendation.type` is an open string (`KnownRecommendationType | (string & {})`). Known types resolve through the registry, and anything else renders the fallback card.

## Project structure

```
app/                         expo-router screens
  chat/[threadId].tsx        the conversation screen (timeline, actions, states)
  (app)/ (onboarding)/ …     home, settings, onboarding, profiles, panchang, …
components/
  atoms/                     Icon, Chip, Button, Toggle, …
  molecules/                 ChatBubble, ReplyPreview, TimelineMarkers, FeedbackBar,
                             ConversationStateView, …
  organisms/                 ChatComposer, ChatTimelineRow, RecommendationCarousel,
                             MessageActionSheet, DevToolsSheet, …
  recommendations/
    registry.ts              type → definition registry + fallback
    RecommendationCard.tsx   shared card shell
    definitions/             one self-registering file per type
hooks/use-chat.ts            conversation controller (load, send, retry, delete, feedback, reply)
stores/                      Zustand stores (chat, threads, profiles, settings, dev)
types/conversation.ts        domain types (roles, status, feedback, recommendations)
utils/
  local-llm.ts               model selection + ExecuTorch lifecycle (download, load, unload, hot swap, sampling)
  model-plan.ts              pure: which model to load / download first / upgrade to, retry backoff, disk check
  ai.ts                      prompts, RAG, deterministic answers, streaming bridge
  chat-timeline.ts           pure: rows, date separators, grouping
  recommendation-rules.ts    pure: <recs> protocol, sanitising, keyword fallback
  recommendations.ts         model block parsing → fallback → cards
  conversation-api.ts        "API" boundary over SQLite (latency/failure simulation, demo seed)
  conversation-normalize.ts  pure: payload validation / repair
  database.ts                SQLite schema + migrations (v5 adds conversation fields)
constants/demo-conversation.ts   assignment mock payload
plugins/                     Expo config plugins (pod deployment-target fix for Xcode 27)
tests/                       node:test unit tests for the pure modules
```

## Component architecture

* The components follow **atomic design** (atoms → molecules → organisms → screen), matching the rest of the codebase.
* **The screen composes, rows render.** `ChatScreen` turns messages into timeline rows (`buildTimeline`), renders them with `ChatTimelineRow`, and owns only UI state: which message's action sheet is open, the toast, the jump pill, and the dev sheet.
* **Message renderer registry.** `ChatTimelineRow` maps each `role` to a renderer (`UserMessage`, `AssistantMessage`, `HumanMessage`, `SystemMessage`). Adding a new author type (for example a tool result) means adding one entry. Unknown roles fall back to a system-style row instead of crashing.
* **Presentational molecules** receive data and callbacks only. `ChatBubble` knows nothing about stores; it handles markdown vs plain text, grouping shape, reply quote, the long-press affordance, and the defensive scrubbing of `<think>` and `<recs>` tags while streaming.
* **The streaming reply** is rendered as the list header (the visual bottom of the inverted list), so token updates re-render one component, not the list.

## State management

**Zustand**, which the app already used, plus SQLite as the source of truth.

* `stores/chat-store.ts` is keyed by thread id. It holds `messages`, `isTyping`, the model `status` (`loading-model` / `thinking` / `streaming`), the `streaming` buffer, `loadState` (`loading` / `ready` / `error`) and the `replyTo` target. The actions are small and pure (`appendMessage`, `patchMessage`, `removeMessage`, …). `removeMessage` also clears a reply target that pointed at the deleted message, in the same update.
* `hooks/use-chat.ts` is the controller. It orchestrates store updates, SQLite writes and on-device generation. All callbacks are stable (`useCallback` + `getState()`), so they never close over the message list and never invalidate memoized rows.
* **Optimistic updates.** The message appears instantly; persistence and generation happen after. A **synchronous re-entrancy lock** (a ref plus the store flag, taken before any `await`) makes rapid double taps harmless.
* Persisted per message (migration v5): `status`, `failure_reason`, `recommendations` (JSON), `feedback` (JSON), `reply_to` (JSON snapshot), `author_name`.
* `stores/dev-store.ts` is in-memory only, so a forgotten demo toggle can't survive a relaunch.

### Message delivery states

Astropedia has no chat server: "sending" means handing the prompt to the on-device model. The states map to what actually happens:

| State | Meaning |
| --- | --- |
| **Sending…** | Saved locally; waiting for the model (loading into RAM, or queued) |
| **Sent** | The model accepted the prompt and started generating |
| **Failed · reason → Retry** | `model-unavailable` (still downloading, failed to load, or web) · `generation-failed` · `empty-reply` · `interrupted` (app killed mid-send; fixed up on next load) · `storage` · `simulated` (dev toggle) |

**Retry** re-runs generation for the same message, so no duplicate is created. If the failed message isn't the latest one, it moves to the end so the reply lands next to it. The dev *Fail next send* toggle adds a simulated delay before failing, so every state is visible on camera.

## Recommendation rendering strategy

* **The chat never switches on `recommendation.type`.** Each type registers a definition once:

  ```ts
  registerRecommendation({
    type: 'gemstone', label: 'Gemstone', glyph: '◆', tint: '#3E6FB0', cta: 'Why this stone',
    Card?: CustomCard,            // optional, e.g. tarot ships its own visual
    onPress: (rec, ctx) => { … }, // Alert, deep link, …
  });
  ```

* `RecommendationCarousel` resolves each card through `resolveRecommendation(type)`. **Unknown types get a neutral fallback card**, so a newer payload can never crash or blank an older app build. Malformed cards (no title or no type) are dropped by the normalizer.
* **Adding a type (for example `panchang` or `course`)** takes one file in `components/recommendations/definitions/` and one import line. No schema, list or screen changes. `remedy` was added exactly this way.

**Where cards come from.** They come from the real model, in the same single generation:

1. The Saga system prompt asks the model to end its answer with `<recs>{"items":[…]}</recs>`: 0–3 items from a fixed category list, with 2 short few-shot examples, one of which is deliberately empty.
2. While the reply streams, everything from `<recs` onward is hidden, including a half-typed `<re`.
3. After completion, the block is parsed with ExecuTorch's `fixAndValidateStructuredOutput` (jsonrepair + JSON schema). If that fails, a dependency-free loose parser runs. Then `sanitizeModelRecommendations` enforces the categories, the 3-item cap and de-duplication, and enriches each card (gemstone → planet, article → corpus id, promotion → in-app route).
4. If the block is missing or malformed, a **deterministic keyword → category mapper** runs over the real reply and question, personalized with the profile's current life-period planet. The mapper is always used on the smallest (350M) tier, whose prompt skips the block entirely. It returns nothing for small talk, so cards feel earned.

No second `generate()` call is made. Krishna mode shows no cards on purpose.

## How the local LLM works

1. **Model selection** (`utils/local-llm.ts`, `MODELS` + `SAMPLING`) picks a model by RAM tier, detected once with `expo-device` and overridable in Settings (dev builds).
2. **Progressive download.** On first run the small **LFM2.5 350M** (~200 MB) downloads with the progress overlay (usually while onboarding is still on screen), so chat works as soon as it loads. The device's target model then downloads **in the background**, shown only as a quiet `WITH SAGA · UPGRADING 42%` in the chat header, and is **hot-swapped** in once it's on disk (details in [Progressive loading](#progressive-loading)). On floor-tier phones the 350M model *is* the target, so there's a single download. Later launches load the best model on disk on demand when you open a chat. That keeps the home screen at ~150 MB instead of ~2.9 GB.
3. **Unloading.** The model is freed from RAM on background and after 3 min idle, and reloads in ~2–5 s ("Saga is waking up…"). A reload always picks the best model currently on disk.
4. **Prompt.** Each prompt contains the persona system prompt, the birth-chart context computed on-device, and **RAG** (2 chunks from the bundled astrology or Gita corpus, embedded on-device). History is capped at the last 6 messages, plus the optional `<recs>` instructions. Qwen 3 gets `/no_think`, and `<think>` blocks are stripped from the stream.
5. **Deterministic answers.** Simple chart lookups (sun sign, current period, moon phase…) are answered instantly and never wait for the model.
6. **Cleanup.** Output is post-processed (jargon, repetition loops, artifacts). A degenerate-output detector interrupts runaway generations.

### Model selection

Model selection lives in one table in `utils/local-llm.ts`, so a swap is a one-line change. The library stays on **react-native-executorch 0.8.4**.

| Tier (RAM) | Model | Download | Why |
| --- | --- | --- | --- |
| flagship (≥ 7.5 GB) | Qwen 3 1.7B (quantized) | ~0.9 GB | Strongest multilingual/Hindi and structured-JSON output in the catalogue |
| mid (5.5–7.5 GB) | LFM2.5 1.2B Instruct (quantized) | ~0.74 GB | Primary model (see below) |
| budget (3.5–5.5 GB) | **LFM2.5 1.2B Instruct (quantized)** | ~0.74 GB | Replaces Llama 3.2 1B SpinQuant |
| floor (< 3.5 GB) | LFM2.5 350M (quantized) | ~0.2 GB | Last resort; recommendations use the keyword mapper only |

* **Why LFM2.5 1.2B is the primary model:** it has the best instruction following in its size class (IFEval 86.2), decodes about 2–3× faster than Qwen 3 1.7B, and is a 0.74 GB download.
* **Sampling per family:**

  | Family | temperature | topP | minP | repetitionPenalty | Notes |
  | --- | --- | --- | --- | --- | --- |
  | Qwen 3 | 0.7 | 0.8 | 0 | 1.0 | Published non-thinking settings; lower values caused loops |
  | LFM2.5 | 0.3 | 0.9 | – | 1.05 | |
  | LFM2.5 350M (override) | 0.2 | 0.9 | 0.15 | 1.1 | min-p floor prunes the sub-word tail behind on-device gibberish |

  The same config applies at load time and before every generation.
* **What decides prompting is the *loaded* model, not the desired one.** While the 350M starter stands in, the `<recs>` block is left out of the prompt and cards come from the keyword mapper; Qwen's `/no_think` switch is only added when Qwen is loaded (`getActiveModelInfo()` in `utils/local-llm.ts`).
* **The 350M model gets a "lite" Saga** (`ModelDef.lite`): a short plain-prose system prompt with one example (the full prompt's rule lists and `[placeholder]` templates were echoed back as headlines and `[upch]`-style fragments), a four-line chart summary with no RAG, the last 2 messages of history, and a ~360-character reply budget that ends on a sentence boundary (ExecuTorch has no per-call max-tokens setting). While it stands in, the chat shows "Saga is using a lighter model while the full one downloads".
* **Reply cleanup** (`utils/reply-cleanup.ts`, unit-tested) strips `<think>`/`<recs>`, cuts a tag-shaped gibberish tail back to the last full sentence, drops a Title-Case headline above the answer, translates jargon and trims sentence loops. A reply with nothing usable left fails with a Retry instead of being stored.
* **Why the library wasn't upgraded to 0.9 / 0.10:**
  * those versions need an iOS 17 deployment target
  * the resource-fetcher API changed
  * they require `react-native-worklets` ≥ 0.10 (the app pins 0.5.1 alongside Reanimated 4.1 / Expo 54)

  That is too much risk for this change.
* **Caveats:**
  * Memory figures for LFM2.5 and Qwen 3 on real devices are **not benchmarked** yet.
  * The **LFM 1.0 license needs legal review before commercial use**.

### Progressive loading

The decision logic is pure and unit-tested (`utils/model-plan.ts`, `tests/model-plan.test.ts`): given the target model and what is on disk, it returns what to **load** now, what to download in the **foreground** (overlay), what to fetch in the **background**, and what is **removable**.

| On disk | Target | Result |
| --- | --- | --- |
| nothing | 1.2B or Qwen | overlay downloads 350M → chat works → target downloads in the background |
| nothing | 350M (floor) | overlay downloads 350M, no upgrade |
| 350M | 1.2B or Qwen | load 350M, resume the background download |
| target (+ 350M) | – | load the target; the 350M files are deleted after it loads |
| only models *bigger* than the target (e.g. after a downgrade in Settings) | – | never loaded; treated as "nothing usable" |

How it behaves:

* **One download at a time.** The order is 350M (blocking) → MiniLM embeddings for RAG (small; prefetched so a chat never races the big download) → target model. The background download only fetches files through the resource fetcher and doesn't load them, so **only one LLM is ever in RAM**.
* **Hot swap.** When the target finishes, the swap waits for any in-flight load or generation (**never mid-reply**), deletes the old module, and then loads the new one. A message sent during the swap waits for it, so Saga just "wakes up" a little longer. If the chat model isn't in RAM at that moment, nothing happens; the next load picks the target.
* **What's on disk** is persisted (`models_on_disk` in MMKV, seeded from the old single-model flags) and reconciled at launch with the files the fetcher actually has. That covers downloads from older builds and files removed by the OS.
* **Cleanup.** Once the target has loaded successfully, the 350M files are removed with the fetcher's own `deleteResources` (it only touches its own directory), freeing ~200 MB. Other models on disk, such as one left over from a Settings switch, are left alone.
* **Downloads don't resume after the app is killed.** `react-native-executorch-expo-resource-fetcher` 0.8 downloads each file with `expo-file-system`'s `createDownloadResumable` (background session) into the cache directory, and moves it into place only when it's complete. Pause and resume work only within one app session, because the resume data is never persisted. If the app is **killed**, the next launch restarts that file **from zero**. Files that finished (tokenizers) are skipped, but the model is one large `.pte`, so in practice the upgrade starts over. If the app is only backgrounded, the OS may keep the download going (iOS background `URLSession`); either way the upgrade is restarted or resumed when the app becomes active or on the next launch.
* **Failures are quiet.** A failed or interrupted upgrade keeps chat on the current model and retries with backoff (30 s, 2 min, 8 min, 32 min, then hourly). No error UI is shown; the header hint simply disappears.
* **Low disk.** Before any download, free space is checked against the model size plus 500 MB of headroom. In the background the upgrade pauses and re-checks with the same backoff. For the first (blocking) download, the overlay says how much space is needed.
* **Settings picker during an upgrade** (dev builds). An in-flight download of a model you no longer want is cancelled. If something usable is on disk, chat keeps using it while the new choice downloads in the background, and switches when idle. The blocking overlay appears only when nothing usable is on disk.
* **A model that is on disk but fails to load** (for example, memory pressure) is skipped for the rest of the session, and the next-best model loads instead.

## Performance considerations

* **Virtualization.** Inverted `FlatList` with `initialNumToRender=12`, `maxToRenderPerBatch=8`, `windowSize=11`, and `removeClippedSubviews` on Android. Keys are stable ids (`date-YYYY-M-D` for separators).
* **Memoization.** Rows are `React.memo` with a content-aware comparator. A row re-renders only when its own message object or grouping flags change; `busy` matters only to rows showing Retry. `ChatBubble`, `FeedbackBar`, the carousel and the markers are memoized, and markdown styles are memoized so streaming doesn't remount subtrees.
* **Streaming.** Tokens update only the streaming header bubble, never the list data.
* **Timeline.** Built once per message-list change (O(n)), then reversed for the inverted list.
* **Carousels.** Horizontal lists render all their cards up front (≤ 4) with snap scrolling, so there's no virtualization churn.
* **Lazy loading.** The ExecuTorch package, the clipboard module and the article corpus load lazily, so nothing heavy happens on the home screen.
* **Time to first chat.** On a fresh install, chat is ready after a ~200 MB download instead of 0.7–0.9 GB. The larger model arrives in the background, never more than one download at a time and never more than one LLM in RAM. The swap costs one extra disk load (~2–5 s) at an idle moment. Upgrade progress re-renders only the header hint, at most once per percent.
* **Stale-while-revalidate.** Re-opening a thread shows cached messages instantly and refreshes from SQLite in the background; there's no spinner flash.

## Edge cases handled

* Empty or whitespace-only messages never send. Messages are capped at 2,000 characters, with a counter near the limit.
* **Rapid double-send:** a synchronous lock is taken before any `await`, and the composer keeps the draft if a send is rejected.
* **Sending while the model is generating:** typing stays enabled; Send, starter chips and Retry wait for the reply (the native runner does one generation at a time).
* **Target model still downloading in the background:** chat works on the 350M model (keyword-mapper cards), then swaps when idle. See [Progressive loading](#progressive-loading) for kills, failures, low disk and model switches.
* **Model still downloading, failing to load, or on web:** the message fails with `model-unavailable` and a Retry, instead of posting a fake "error" reply. Deterministic chart answers still work.
* **Empty or truncated model reply:** the message fails with a Retry instead of being dropped silently.
* **App killed mid-send:** on the next load, the stuck "sending" message shows as *Failed · Interrupted* with a Retry.
* **Deleting:**
  * deleting the message you're replying to clears the reply preview
  * deleting the last message updates the thread preview
  * deleting everything shows the empty state
  * a message that is still sending can't be deleted
* **Quoted replies** survive deletion of the original (stored as a snapshot).
* **Recommendations:**
  * `undefined`, a non-array, duplicate ids or entries with no title are all handled
  * unknown types show the fallback card
  * a card handler that throws is caught
  * recommendation derivation can never break a reply
* **Timestamps:** legacy rows use SQLite's `YYYY-MM-DD HH:MM:SS` (which Hermes can't parse); both formats are handled. Unparseable values inherit the previous message's day.
* **Re-sending into a new thread whose messages were all deleted:** thread creation is idempotent.
* **Loading a conversation while a reply is still generating** (you left and came back): the newer in-memory state is kept.
* **Clipboard on an old dev client:** a friendly message instead of a crash.

## Trade-offs and what's left

* **Human astrologer messages appear only in the seeded demo.** The app has no backend, so there are no live humans. The type, renderer, grouping and reply support are complete.
* **Card actions** mostly show Alerts, as the brief allows. Promotions deep-link to real screens (Panchang, Compatibility), and consultations explain that live booking is coming.
* **Scroll position on delete** relies on `maintainVisibleContentPosition`. This is standard for chat lists, but behavior with inverted lists differs slightly between iOS and Android. **FlashList** would be the next step for very long threads; it wasn't added, to avoid a new native dependency mid-assignment.
* **Tapping a reply quote** doesn't yet jump to the original message.
* **Feedback** is stored locally only; there's nowhere to send it yet.
* **Tests** cover the pure logic (timeline, recommendation protocol and parsing, normalization). There are no component or E2E tests, because the project has no Jest/Detox setup and adding one was out of scope.
* **Progressive loading trades answer quality for time-to-first-chat.** The first few conversations on a fresh install use the 350M model, which gives weaker answers and keyword-only cards, until the upgrade lands. Because the fetcher can't resume across app kills, a user who keeps killing the app on a slow connection may stay on 350M for a while. The hot swap and resume paths are covered by unit tests of the planning logic only; they haven't been exercised on a device yet.
* **Birth-city geocoding** still uses OpenStreetMap Nominatim, a network call that is not related to the AI. All AI generation is on-device.
