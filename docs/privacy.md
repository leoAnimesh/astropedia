# Astropedia Privacy Policy

> **DRAFT. Review with a lawyer before publishing.** Replace every `[bracketed]` placeholder. Keep this file in step with the in-app summary (`locales/*/about.json` → `privacyDoc`) and the store answers in `store/privacy-answers.md`.

**Effective date:** [date of first public release]
**Developer:** [legal name of the developer or company], [postal address]
**Contact:** [support email]

## The short version

Astropedia is a Vedic astrology app that works on your phone. **We do not collect your personal data.** There is no account, no sign-in, no server that receives what you type, no analytics, no advertising and no tracking. Your birth details, charts, chats and journal stay on your device.

## 1. Information you enter

To draw a birth chart the app asks for a name, date of birth, time of birth and place of birth, for you and for anyone else you add (family, friends). You can also write chat messages, journal entries and save answers.

All of this is stored **only on your device**, in the app's private storage (an on-device SQLite database and settings store). It is never uploaded to us. We have no way to see it.

When you add other people's birth details, please make sure they are happy for you to do so.

## 2. The on-device AI model

Answers in the chat and written readings are produced by an AI model that runs entirely on your phone. Your questions and birth details are processed on the device and are never sent to an AI service.

The model file is downloaded once (about 200 MB, or more for optional larger models) from **Hugging Face** (huggingface.co), and the app checks Hugging Face for model updates. Like any website, Hugging Face receives the technical information needed to deliver a file, such as your IP address and the app's request headers. No personal data, birth details or chat content is included in these requests. Hugging Face's own privacy policy applies to that service: https://huggingface.co/privacy

## 3. Place look-up

Birth places are normally chosen from a list built into the app, with their coordinates, so no look-up is needed. In the rare case that a place has no built-in coordinates, the app sends **only the place name** (for example "Howrah, West Bengal, India") to the **OpenStreetMap Nominatim** service to find its coordinates. No name, date or other detail is sent with it. OpenStreetMap's privacy policy: https://osmfoundation.org/wiki/Privacy_Policy

> Developer note: if `utils/geocoding.ts` is removed before release, delete this section and the matching sentence in the in-app summary.

## 4. Notifications

If you turn on daily readings, transit alerts, festival reminders or Rahu Kaal alerts, the app asks for permission to show notifications. Notifications are scheduled **on the device**; there is no push server and no device token is sent to us.

## 5. Backups you export

"Export backup" creates a file containing your profiles (with birth details), chats, journal and settings, and opens your phone's share sheet. You choose where the file goes (for example Files, Google Drive or a message). Treat it like any private document. We never receive it.

Your phone's own system backup (iCloud Backup on iPhone) may include the app's data, under your Apple account and your control. On Android, the app opts out of Google's automatic app-data backup, so use "Export backup" to move your data to a new phone.

## 6. Errors and diagnostics

The app has no crash reporting or analytics service. If something goes wrong, the app can show you the error details and let you share them yourself through the share sheet. Nothing is sent automatically.

## 7. Data we collect

None. Because we do not collect or receive personal data, we do not sell, share, rent or use it for advertising or profiling.

## 8. Deleting your data

- **In the app:** Settings → About → Delete all my data (or Settings → Your data → Reset all data) deletes every profile, chat, journal entry and setting from the device. The downloaded AI model is kept so it does not need downloading again.
- **Uninstalling** the app deletes everything, including the model.
- Backup files you exported are under your control; delete them where you saved them.

## 9. Children

Astropedia is not directed at children under 13 (or the minimum age in your country) and we do not knowingly collect information from children. Since the app does not collect personal data at all, no child's data reaches us.

## 10. Your rights

Data protection laws such as India's Digital Personal Data Protection Act 2023 and the EU/UK GDPR give you rights to access, correct and erase personal data held about you. Because all your data is on your device and in your control, you can exercise these rights directly in the app (edit or delete profiles, delete all data). If you have a question, contact us at [support email].

## 11. Security

Your data is protected by your device's own security (app sandboxing, device encryption, screen lock). Keep your phone locked and keep exported backup files private.

## 12. Changes to this policy

If we change how the app handles data, we will update this policy and its effective date, and describe significant changes in the app's release notes. If the app ever starts collecting data, we will ask for your consent first where the law requires it.

## 13. Contact

[legal name], [postal address], [support email]

[Grievance officer for India, if required: name, email]
