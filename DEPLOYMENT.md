# iOS App Store Deployment — Step-by-Step

This guide takes you from "code in repo" to "app in App Store Connect, awaiting review." Estimated time: **2–3 hours first time** plus Apple's 1–3 day review wait.

You've already done:
- [x] Apple Developer account ($99/yr active)
- [x] Xcode installed on your Mac
- [x] Apple ID added to Xcode under Settings → Accounts

You'll need to do, in order:

---

## Step 1: Install dependencies on your Mac (one terminal command)

Open Terminal, then:

```bash
cd "/Users/azariabin-nun/Desktop/Claude CoWork projects /Personal workout site "
npm install
```

This downloads Capacitor, RevenueCat, and all native plugins. Takes ~2 minutes.

---

## Step 2: Generate the iOS project

```bash
npx cap add ios
```

Creates a folder `ios/App/` with an Xcode project inside. Adds CocoaPods dependencies for all installed plugins.

```bash
npx cap sync ios
```

Copies your web assets (index.html + everything else) into the iOS bundle and links the native plugins.

---

## Step 3: Add the Info.plist permission strings

The generated `ios/App/App/Info.plist` won't include the camera/mic/photo usage descriptions. Without them, Apple rejects the build.

Open `ios/App/App/Info.plist` in any text editor. Find the closing `</dict>` near the bottom. Right before it, paste the contents of `ios-extras/Info.plist.additions.xml` from this repo.

---

## Step 4: Open in Xcode

```bash
npx cap open ios
```

This launches Xcode with the project loaded.

---

## Step 5: Configure signing in Xcode

In Xcode:

1. Click the blue **App** icon in the left sidebar (top of file tree).
2. Center pane → **Signing & Capabilities** tab.
3. Check **Automatically manage signing**.
4. Choose your **Team** from the dropdown (your Apple Developer account).
5. The **Bundle Identifier** should already be `com.obsidiandist.workout` from `capacitor.config.json`. If Xcode complains it's already taken, change it (e.g. `com.obsidiandist.workoutapp`) and update `capacitor.config.json` to match.
6. Click **+ Capability** at the top of that pane and add **In-App Purchase**.
7. Click **+ Capability** again and add **Push Notifications** (optional, but Apple looks favorably on it).

---

## Step 6: Set up RevenueCat (the IAP middleman)

1. Go to https://app.revenuecat.com, sign in with Apple/Google or email.
2. Create a new **Project** called "Workout."
3. Inside the project, **Add app** → pick **iOS** → enter Bundle ID `com.obsidiandist.workout`.
4. RevenueCat will give you a **Public API Key** that starts with `appl_`. Copy it.
5. Open `index.html` in this repo, find the line:
   ```js
   const REVENUECAT_IOS_KEY = "PASTE_YOUR_REVENUECAT_IOS_KEY_HERE";
   ```
   Replace the placeholder with your key. Save the file.
6. Run `npx cap sync ios` again to push the updated index.html into the iOS bundle.

---

## Step 7: Create the subscription products in App Store Connect

1. Go to https://appstoreconnect.apple.com → **Apps**.
2. Click **+** → **New App**:
   - Platform: iOS
   - Name: **Workout** (or whatever you want; can include your brand)
   - Primary Language: English (U.S.)
   - Bundle ID: `com.obsidiandist.workout` (must match exactly)
   - SKU: `workout` (internal identifier, anything works)
3. After creation, click the app → **Subscriptions** → **+** to create a Subscription Group called "Workout Pro Access."
4. Inside the group, **Create Subscription** for each tier:

| Reference Name | Product ID | Price | Duration | Free Trial |
|---|---|---|---|---|
| Workout Pro Monthly | `workout_pro_monthly` | $39.99 | 1 Month (auto-renew) | 14-day free trial |
| Workout Pro Yearly | `workout_pro_yearly` | $383.88 | 1 Year (auto-renew) | 14-day free trial — displayed as $31.99/mo billed annually |
| Workout Pro Lifetime | `workout_pro_lifetime` | $999.99 | One-time (non-consumable IAP) | No trial |

For each, fill in:
- **Reference Name** (only you see this)
- **Subscription Display Name** (what users see, e.g. "Pro Monthly")
- **Price** (Apple's tier closest to your target)
- **Localization** (description: "Full access to all Workout features.")
- **Introductory Offer** → 14 days free, "Pay as you go" with $0 → free trial

Save and submit each subscription for review (Apple reviews them alongside the app).

---

## Step 8: Link products to RevenueCat

Back in RevenueCat:

1. **Products** → **+ New** → enter each App Store product ID:
   - `workout_pro_monthly` (subscription)
   - `workout_pro_yearly` (subscription)
   - `workout_pro_lifetime` (non-consumable IAP — add as a separate Product, not Subscription)
2. **Entitlements** → **+ New** → name it `pro`. Attach both products to this entitlement.
3. **Offerings** → **+ New** → call it `default`. Add two packages:
   - **Monthly** → links to `workout_pro_monthly`
   - **Annual** → links to `workout_pro_yearly`
   - **Lifetime** → links to `workout_pro_lifetime` (RevenueCat package type: `LIFETIME`)

Mark the offering as **Current**.

---

## Step 9: Generate Offer Codes (your self-comp + future promotions)

In App Store Connect → your app → **Subscriptions** → click any subscription → **Offer Codes** at the bottom → **+ Generate Codes**.

For your personal free use:
- Name: `FOUNDER-LEV`
- Amount of free time: 1 month
- Eligibility: New subscribers
- Number of codes: 1
- Expiration: 2 years out

Apple will generate the redeemable code. Save it.

You can also generate codes for friends/promotions (max 1M codes/quarter).

To redeem in your app: open the app → paywall → "Redeem code" → Apple's native sheet pops up → paste your code → done. You'll stay subscribed indefinitely as long as you re-redeem when the comp period ends. Or generate a 1-year code and re-redeem yearly.

---

## Step 10: Add the Supabase deep-link redirect URL

In Supabase dashboard → **Authentication** → **URL Configuration**:

Under **Redirect URLs**, add: `workout://callback`

Save. This lets the magic-link / password-reset emails redirect back into the native app via the custom URL scheme.

---

## Step 11: Build & upload to App Store Connect

In Xcode:

1. At the top, change the target dropdown from a simulator to **Any iOS Device (arm64)**.
2. Menu bar → **Product** → **Archive**. Takes 1-3 minutes.
3. When the Organizer window opens with your archive listed, click **Distribute App**.
4. Choose **App Store Connect** → **Upload** → keep defaults → click through to the end.
5. Xcode uploads to App Store Connect. Takes ~5 minutes.

---

## Step 12: Configure App Store Connect listing

In App Store Connect → your app → **App Information**:

1. **Privacy Policy URL**: `https://obsdis.github.io/personal-workout-site/PRIVACY_POLICY.md` (or paste it onto a normal HTML page if you prefer)
2. **Support URL**: `https://obsdis.github.io/personal-workout-site/`
3. **Category**: Health & Fitness
4. **Content Rights**: declare you have the rights to all content

Then **Privacy** section:
- Data Used to Track You: **None**
- Data Linked to You: **Identifiers** (Email), **Health & Fitness** (Workout data, body weight, measurements), **Photos** (progress photos), **Purchases** (Apple)
- Data Not Linked to You: usually nothing

Then **App Privacy** label → fill in the form using the same answers.

---

## Step 13: Add screenshots + description

App Store Connect → your app → **(version)** → Scroll to **App Previews and Screenshots**.

Required sizes for iPhone:
- 6.7" (iPhone 15 Pro Max): 1290 × 2796 — pick this size first, Apple will scale down for smaller phones if you don't provide other sizes (but providing them is recommended)
- 6.5" (iPhone 11 Pro Max): 1242 × 2688
- 5.5" (iPhone 8 Plus): 1242 × 2208

To generate: in Xcode → Window → Devices and Simulators → pick a simulator → run the app → Cmd+S to save screenshots from each device size.

Fill in:
- App Name: Workout
- Subtitle: AI workout & nutrition tracker
- Description (4000 chars max): write something about your features
- Keywords (100 chars): "fitness, workout, gym, nutrition, macros, calories, AI, coach, tracker, progress"
- Promotional Text (170 chars): "Track workouts, scan food, get AI coaching."

---

## Step 14: Submit for review

In App Store Connect → your app → **(version)** → top right **Add for Review** → answer the routing questions:

- Export Compliance: **No** encryption (or **Yes** if you store data encrypted — Supabase TLS counts as "uses standard encryption" but is exempt)
- Content Rights: confirm
- Advertising Identifier: **No** (we don't use IDFA)
- Sign in info for review: provide your `binnunazaria@gmail.com` test account + password so Apple reviewers can log in

Click **Submit for Review**.

---

## Step 15: Wait

Apple reviews in 24-72 hours typically. They'll either approve and you can release, or send a list of issues. Common issues:

- **"Guideline 4.2 — Minimum Functionality"**: app is too web-like. Fix by adding more native features (already addressed with Capacitor Camera, Push, etc.)
- **"Guideline 3.1.1 — In-App Purchase"**: trying to direct users to external payment. Make sure no buttons or text inside the app mention external payment.
- **"Privacy Strings Missing"**: did you skip Step 3? Add the Info.plist additions.

If rejected, fix the issues, increment the build number in Xcode (`General` tab → `Build` field, change 1 → 2), Archive again, upload again, resubmit.

---

## What happens after approval

You can manually release or set auto-release. Once live, users can install from the App Store. Your subscription flow is fully active.

To push updates: change code in this repo, run `npx cap sync ios && npx cap open ios`, increment build number, Archive, upload, submit.

---

## Costs summary

- Apple Developer: $99/yr (paid)
- Supabase free tier covers you until ~500 active users
- RevenueCat: free under $2.5K MRR
- Apple takes 30% of paid subscriptions (15% in year 2 of a sub, and 15% always if you're enrolled in the **Apple Small Business Program** — sign up at https://developer.apple.com/app-store/small-business-program — applies if you earn <$1M/yr from the App Store)

Your effective cost per sub:
- $39.99 × 0.85 (Small Business 15% take) = $33.99/mo net
- $383.88 × 0.85 = $326.30/yr net
- $999.99 × 0.85 = $849.99 net per lifetime sale
- Apply for the Apple Small Business Program early — keeps Apple's cut at 15% until you cross $1M/yr.
