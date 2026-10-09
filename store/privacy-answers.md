# App privacy answers (Apple) and Data safety (Google Play)

> Draft for the store forms. Keep in step with `docs/privacy.md`. Re-check before every release that adds a network call, SDK or permission. Both forms are the developer's legal declaration; review them yourself before submitting.

## What the app actually does (evidence)

| Area | Behaviour | Where |
|---|---|---|
| Accounts | None. No sign-in, no user id. | No auth code anywhere |
| Storage | Profiles, chats, journal, settings in on-device SQLite + MMKV. | `utils/database.ts`, `utils/storage.ts` |
| AI | On-device model via react-native-executorch. Prompts never leave the phone. | `utils/local-llm.ts`, `utils/agent/**` |
| Network 1 | Model + manifest download from huggingface.co (IP and request headers only). | `utils/model-download.ts` |
| Network 2 | Rare fallback: place name only to nominatim.openstreetmap.org when a birth place lacks coordinates. | `utils/geocoding.ts`, `hooks/use-profiles.ts` |
| Notifications | Local notifications only. No push token requested or sent. Android FCM receive permission is blocked in app.json. | `utils/notifications.ts`, `app.json` |
| Analytics / crash / ads | None. Errors stay in an in-memory log; the user can share them via the share sheet. | `utils/logger.ts` |
| Backups | Export opens the system share sheet; the user chooses the destination. Android auto-backup is off (`allowBackup: false`). | `utils/backup-io.ts` |

## Apple: App Privacy ("nutrition label")

**Data collection: "No, we do not collect data from this app."** → label shows **Data Not Collected**.

Justification against Apple's definition ("collect" = transmit data off the device in a way that lets you or a third party access it for longer than needed to service the request in real time):

- Birth details, chats and journal never leave the device.
- The Hugging Face request carries no user data; it serves a file in real time. IP addresses used only to deliver a request are not "collected" under Apple's definition, provided neither we nor a partner keeps them for other purposes. Hugging Face is a CDN/file host here, not an SDK in the app.
- The Nominatim look-up sends a place name only, in real time, with no identifier. It is not linked to the user. **Safest:** remove the fallback before release (the city pickers always supply coordinates); otherwise this answer still holds, but mention it in the review notes.
- Error details are shared only by the user, through the system share sheet, to a destination they choose. Apple treats user-initiated sharing to a destination of the user's choice as not collected by the developer.

Privacy policy URL: required. Host `docs/privacy.md` (for example on GitHub Pages) and enter its URL.

Tracking: **No.** No IDFA, no App Tracking Transparency prompt needed.

Privacy manifest: app-level `PrivacyInfo.xcprivacy` is generated from `app.json` → `ios.privacyManifests` (tracking false, no collected data types; required-reason APIs: UserDefaults CA92.1, file timestamp C617.1/0A2A.1, system boot time 35F9.1, disk space E174.1/85F4.1). Third-party pods ship their own manifests.

## Google Play: Data safety

| Question | Answer | Why |
|---|---|---|
| Does your app collect or share any of the required user data types? | **No** | Nothing is transmitted off the device except the anonymous model download and the optional place-name look-up (see below). |
| Is all of the user data collected by your app encrypted in transit? | Not shown when answering "No". (All requests are HTTPS anyway.) | |
| Do you provide a way for users to request that their data is deleted? | Not shown when answering "No". In-app: Settings → About → Delete all my data. | |

Google's guidance exempts data that is processed only on the device ("on-device access") and data "transferred ephemerally" to service a request in real time. The model download contains no user data. If the Nominatim fallback stays, it is the place name only, ephemeral, and not linked to the user; Google lets you leave this undeclared as ephemeral processing, but the conservative option is to declare **Location → Approximate location: Collected, not shared, processed ephemerally, optional, purpose: App functionality**. Removing the fallback removes the question entirely.

Other Play Console declarations:
- **Ads:** No ads.
- **App access:** All functionality is available without special access. Note for the reviewer: first launch downloads a ~200 MB model; chats show "Preparing Saga" until it finishes.
- **Government app:** No. **Financial features:** None. **Health:** Not a health app (astrology content mentions health only as a life area; add the disclaimer in the description).
- **Account deletion URL:** Not applicable (no accounts).
- **Target audience:** 18+ recommended (or 13–17 and 18+). Do not include under-13 age groups, so the Families policy does not apply.
- **News app:** No.
- **AI-generated content:** Yes, the app generates text with an on-device AI model. Google Play's AI-Generated Content policy requires an **in-app way to report or flag offensive AI output**. See launch blockers.
