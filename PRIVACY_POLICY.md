# Privacy Policy — Workout

_Last updated: April 30, 2026_

This Privacy Policy describes how the **Workout** application ("the App") collects, uses, and protects your information. The App is operated by Obsidian Distribution ("we", "us").

## Data we collect

When you create an account and use the App, we collect:

- **Account data**: your email address, used to identify your account and send magic-link sign-in emails.
- **Workout data**: exercises, sets, reps, weights, and other entries you log.
- **Body metrics**: body weight entries, body measurements (waist, chest, biceps, thighs, calves), and progress photos you upload.
- **Nutrition data**: food entries (name, brand, macros, barcode, optional photo) and meal plans you create.
- **AI usage data**: messages you send to the optional AI chat assistant. These messages are sent to Groq and/or HuggingFace for processing only when you initiate a chat; we do not store the message content beyond your conversation history within the App.
- **Subscription data**: subscription status, transaction history, and renewal dates managed by Apple (via In-App Purchase) and RevenueCat (subscription analytics).

We do NOT collect:
- Your location
- Your contacts
- Browsing history outside the App
- Any third-party tracking IDs (no IDFA, no fingerprinting)

## How we use your data

- Provide the App's features (storing your workouts, displaying your history, etc.)
- Process your subscription
- Improve the App's AI assistant by reviewing aggregated, anonymized usage patterns

We do not sell your data to third parties.

## Where your data is stored

- **Supabase** (PostgreSQL, hosted in the United States): all account, workout, nutrition, and measurement data. Data is protected by Row-Level Security so only you can access your own rows.
- **Supabase Storage**: your progress photos. Stored in a private bucket, signed URLs expire after 1 hour.
- **Apple StoreKit / App Store Connect**: your subscription transaction history (handled entirely by Apple per their terms).
- **RevenueCat** (subscription management): subscription status and webhook events. RevenueCat does not see your workout or health data.
- **Groq / HuggingFace**: text and image content you submit to the AI assistant. Each provider's privacy policy applies. We send only what you explicitly send.

## Third-party APIs the App calls

- **OpenFoodFacts** (open public database): barcode and food name lookups. Anonymous; no personal data sent.
- **Groq** (LLM API, optional): when you use the AI chat assistant.
- **HuggingFace** (LLM API, fallback): when Groq is unavailable.
- **YouTube** (external links): the App opens YouTube search links when you tap an exercise name.

## Your rights

You may at any time:
- Delete your account by emailing lev@obsidiandist.com. We will permanently delete all your data within 30 days.
- Export your data by emailing the same address. We will provide a JSON export within 14 days.
- Cancel your subscription via your Apple ID account settings.

## Children

The App is not intended for users under 13. We do not knowingly collect data from children.

## Changes to this policy

We may update this policy occasionally. The "Last updated" date above will reflect changes. Material changes will be announced inside the App.

## Contact

For privacy questions: **lev@obsidiandist.com**
