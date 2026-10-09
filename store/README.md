# Store submission drafts

Everything here is a **draft** for the developer to review. Nothing in this folder ships in the app.

| File | What it is |
|---|---|
| `listing.en.md`, `listing.hi.md`, `listing.bn.md` | App Store name, subtitle, keywords, promotional text, description, What's New; Google Play name and short description |
| `check-limits.mjs` | `node store/check-limits.mjs` checks every field against the store limits |
| `privacy-answers.md` | Apple App Privacy ("Data Not Collected") and Google Data safety answers, with the evidence |
| `age-rating.md` | Apple and IARC questionnaire answers |
| `review-notes.md` | Notes for the reviewers (first-launch download, on-device AI, guideline 4.3) |
| `screenshots.md` | Shot list, demo data and captions in en/hi/bn |
| `../docs/privacy.md`, `../docs/terms.md` | Privacy policy and terms to host (draft; review with a lawyer) |

## Release config (in the repo)

- `app.json`: name "Astropedia", version 1.0.0, iOS buildNumber 1, Android versionCode 1. Bump both for every store upload (`appVersionSource: local` in `eas.json`).
- Bundle id / package: `com.astropedia`. Check it is free in App Store Connect and Play Console before the first upload; it can never change afterwards.
- iPhone only (`supportsTablet: false`): adding iPad later is allowed, removing it after release is not.
- `eas.json`: `development` (debug, internal), `development-simulator`, `preview` (release, internal APK / ad hoc), `production` (store AAB / IPA). Run `eas init` once to link the project; no submit credentials are stored.

## Before the first submission (developer only)

1. Apple Developer Program and Google Play Console accounts (Play: a new personal account must run a closed test with 12+ testers for 14 days before production access).
2. Upload key / signing: let EAS manage credentials (`eas credentials`) or create an upload keystore and enrol in Play App Signing. The local Android release build is signed with the debug key and must not be uploaded.
3. Host `docs/privacy.md` and `docs/terms.md`, then set `FULL_TEXT_URL` in `app/legal/[doc].tsx` and the privacy policy URL in both consoles.
4. Fill the placeholders (legal name, address, support email) in the policy and terms; legal review.
5. Screenshots per `screenshots.md`, Play feature graphic, 512 px Play icon.
6. Resolve the launch blockers listed in the release PR description (licensing of `country-state-city`, Gita translation text, iCloud backup exclusion for model files, Play AI-content reporting).
