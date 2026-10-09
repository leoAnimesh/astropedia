# App privacy answers (Apple) and Data safety (Google Play)

> Draft for the store forms. Keep in step with `docs/privacy.md`. Re-check before every release that adds a network call, SDK or permission. Both forms are the developer's legal declaration; review them yourself before submitting.

## What the app actually does (evidence)

| Area | Behaviour | Where |
|---|---|---|
| Accounts | None. No sign-in, no user id. | No auth code anywhere |
| Storage | Profiles, chats, journal, settings in on-device SQLite + MMKV. | `utils/database.ts`, `utils/storage.ts` |
| AI | On-device model via react-native-executorch. Prompts never leave the phone. | `utils/local-llm.ts`, `utils/agent/**` |
| Network 1 | Model + manifest download from huggingface.co (IP and request headers only). | `utils/model-download.ts` |
| Places | Birth places come from bundled GeoNames data (`assets/places`) with coordinates and time zone; a typed-in place is matched against the same data on the device. No geocoding network call. | `utils/places.ts`, `utils/geocoding.ts`, `hooks/use-profiles.ts` |
| Report this answer | User-initiated only: opens the user's email app (`mailto:` to `SUPPORT_EMAIL`) or the system share sheet with the question, answer, app/model version, language and date. Nothing is sent automatically; the user edits and sends it. Reported answers are marked in MMKV on the device. | `utils/report-answer.ts`, `components/organisms/GuruChat.tsx` |
| Notifications | Local notifications only. No push token requested or sent. Android FCM receive permission is blocked in app.json. | `utils/notifications.ts`, `app.json` |
| Analytics / crash / ads | None. Errors stay in an in-memory log; the user can share them via the share sheet. | `utils/logger.ts` |
| Backups | Export opens the system share sheet; the user chooses the destination. Android auto-backup is off (`allowBackup: false`). | `utils/backup-io.ts` |

## Apple: App Privacy ("nutrition label")

**Data collection: "No, we do not collect data from this app."** → label shows **Data Not Collected**.

Justification against Apple's definition ("collect" = transmit data off the device in a way that lets you or a third party access it for longer than needed to service the request in real time):

- Birth details, chats and journal never leave the device.
- The Hugging Face request carries no user data; it serves a file in real time. IP addresses used only to deliver a request are not "collected" under Apple's definition, provided neither we nor a partner keeps them for other purposes. Hugging Face is a CDN/file host here, not an SDK in the app.
- Birth places are looked up in data bundled with the app; no place name leaves the device.
- "Report this answer" only opens the user's own email app or the share sheet with a draft the user can edit; the app sends nothing. If the user sends the email, it reaches us as ordinary support email, initiated by the user (Apple: user-initiated sharing to a destination of the user's choice; not collected through the app). If you keep reports or reply to them, cover that in the privacy policy (section 7 already describes the report contents).
- Error details are shared only by the user, through the system share sheet, to a destination they choose. Apple treats user-initiated sharing to a destination of the user's choice as not collected by the developer.

Privacy policy URL: required. Host `docs/privacy.md` (for example on GitHub Pages) and enter its URL.

Tracking: **No.** No IDFA, no App Tracking Transparency prompt needed.

Privacy manifest: app-level `PrivacyInfo.xcprivacy` is generated from `app.json` → `ios.privacyManifests` (tracking false, no collected data types; required-reason APIs: UserDefaults CA92.1, file timestamp C617.1/0A2A.1, system boot time 35F9.1, disk space E174.1/85F4.1). Third-party pods ship their own manifests.

## Google Play: Data safety

| Question | Answer | Why |
|---|---|---|
| Does your app collect or share any of the required user data types? | **No** | Nothing is transmitted off the device except the anonymous model download. Reports of AI answers are drafts the user sends from their own email app (see below). |
| Is all of the user data collected by your app encrypted in transit? | Not shown when answering "No". (All requests are HTTPS anyway.) | |
| Do you provide a way for users to request that their data is deleted? | Not shown when answering "No". In-app: Settings → About → Delete all my data. | |

Google's guidance exempts data that is processed only on the device ("on-device access") and data "transferred ephemerally" to service a request in real time. The model download contains no user data. Birth places are matched against bundled data on the device (no place-name look-up any more), so no location question arises. "Report this answer" hands a draft to the user's email app or share sheet; the app itself transmits nothing, so it is not collection by the app.

Other Play Console declarations:
- **Ads:** No ads.
- **App access:** All functionality is available without special access. Note for the reviewer: first launch downloads a ~200 MB model; chats show "Preparing Saga" until it finishes.
- **Government app:** No. **Financial features:** None. **Health:** Not a health app (astrology content mentions health only as a life area; add the disclaimer in the description).
- **Account deletion URL:** Not applicable (no accounts).
- **Target audience:** 18+ recommended (or 13–17 and 18+). Do not include under-13 age groups, so the Families policy does not apply.
- **News app:** No.
- **AI-generated content:** Yes, the app generates text with an on-device AI model. Google Play's AI-Generated Content policy requires an **in-app way to report or flag offensive AI output**: every chat answer has **Report** (under the reply and in its long-press menu). It is user-initiated: it opens the user's email app with a draft to `SUPPORT_EMAIL` (`constants/support.ts`; still a placeholder, set it before release) containing the question, answer and app/model version, or the share sheet when no email app is set up. Nothing is sent automatically. The reported answer is hidden on the device behind "You reported this answer" with a Show button.
