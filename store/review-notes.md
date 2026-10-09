# Notes for App Review / Play review

> Draft. Paste into App Store Connect → App Review Information → Notes, and Play Console → App access.

Astropedia is a private, on-device Vedic astrology app in English, Hindi and Bengali.

- **No login is needed.** On first launch pick a language, then enter any birth date, time and place (for example 15 August 1990, 10:30, Kolkata, West Bengal, India).
- **Internet on first launch:** the app downloads its on-device AI model (about 200 MB) from Hugging Face. Please allow a minute on Wi-Fi. Charts, panchang, dasha, matching and festivals work immediately; the chat shows "Preparing Saga" until the model is ready. After that the app works fully offline.
- **On-device AI:** answers are generated on the device by Astropedia Saga, a model fine-tuned from Google's Gemma 3 270M (Gemma Terms of Use shown in Settings → About). Users can optionally switch to Qwen3 or Llama 3.2 ("Built with Llama"; licence shown before download). No prompts or personal data are sent to any server.
- **Safety:** the app routes self-harm, diagnosis and medicine, court-case and gambling questions to fixed safe answers and shows the Tele-MANAS helpline (14416) and 112. The "for reflection, not advice" disclaimer is shown in Settings and in full in Settings → About.
- **What makes it different (guideline 4.3):** all calculations use the app's own astronomy code (Lahiri ayanamsa, Meeus/Schlyter ephemeris checked against JPL Horizons); an AI model trained for Vedic astrology runs on the device; full Hindi and Bengali support; no account, no ads, no analytics.
- **Notifications** are optional and scheduled locally (daily reading, transits, festivals, Rahu Kaal).
- **Encryption:** the app uses only the operating system's standard HTTPS (`ITSAppUsesNonExemptEncryption = false`).
