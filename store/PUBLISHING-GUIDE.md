# CityCars — Google Play quick publishing guide (English)

Everything needed is ready. Only the clicks inside your own Play Console account are left.

## What you upload

| File | Where |
|---|---|
| `CityCars-1.0.0.aab` (signed, versionCode 1, versionName 1.0.0, package `com.kolomp.citycars`) | Test and release → your track → Create new release |
| `store/icon-512.png` | Main store listing → App icon |
| `store/feature-graphic-1024x500.png` | Main store listing → Feature graphic |
| `store/screenshots/en/01…08-*.png` | Phone screenshots (upload 8). Use the same files for 7" and 10" tablets |
| `store/listings/<locale>.md` | Name, short and full description for en-US, tr-TR, es-ES, de-DE, fr-FR, pt-BR |
| `store/listings/release-notes-all.txt` | Paste into "Release notes" — it covers all 6 languages at once |

Keep the upload key (`citycars-upload.jks` + its password file) safe. Every future update must be signed with it.

## Fastest path — about 30 minutes of clicks

### 1. Create the app (2 min)
Play Console → **Create app**
- App name: `CityCars: World Tour Driving`
- Default language: **English (United States) – en-US**
- App or game: **Game** · Free or paid: **Free**
- Accept the declarations → **Create app**

### 2. Main store listing (5 min)
Grow users → Store presence → **Main store listing**
- Paste name / short / full description from `store/listings/en-US.md`
- Upload the icon, feature graphic and 8 screenshots
- **Manage translations → Add your own translations**: tr-TR, es-ES, de-DE, fr-FR, pt-BR, then paste each `store/listings/<locale>.md`. (Optional: also add es-419 and pt-PT with the es-ES / pt-BR texts.)

### 3. Store settings (1 min)
- Category: **Game → Racing** (alternative: Casual)
- Tags: Driving, Open world, Casual, Racing, Simulation
- Contact email: metin@kolomp.com · Website: `https://citycars-xi.vercel.app`

### 4. App content (10 min) — Policy and programs → App content
| Section | Answer |
|---|---|
| Privacy policy | `https://citycars-xi.vercel.app/privacy.html` |
| Ads | **Yes, my app contains ads** |
| App access | **All functionality is available without special access** |
| Target audience | **13–15, 16–17, 18+** (do **not** pick under 13 — that triggers the Families policy and limits ad networks) |
| Content rating (IARC) | Category **Game**. Violence: only *cartoon/fantasy, mild* (toy cars crash into objects, barrels explode; no people hurt, no blood). Everything else: **No** → expected **PEGI 3 / ESRB Everyone** |
| Data safety | Collects data: **Yes** (AdMob SDK). Types: **Device or other IDs** (Advertising ID), **Approximate location**, **App interactions**, **Crash logs / Diagnostics**. For each: shared **Yes**; purposes **Advertising or marketing, Analytics, Fraud prevention**; encrypted in transit **Yes**; deletion request **No** (the game keeps no server data) |
| Advertising ID | **Yes** — used for advertising |
| Government / news / COVID-19 / financial / health | **No / None** |

### 5. Upload the AAB
**A) New personal developer account (most common).** Google requires a closed test with **at least 12 testers for 14 days** before production:
1. Test and release → **Testing → Closed testing → Create track** (e.g. "Beta")
2. Countries: select all · Testers: create an email list with ≥ 12 Gmail addresses (friends/family), save
3. **Create new release** → accept **Play App Signing** → upload `CityCars-1.0.0.aab`
4. Release name `1.0.0 (1)` · Release notes: paste `store/listings/release-notes-all.txt`
5. **Next → Save → Send for review** (first review usually takes 1–7 days)
6. Share the opt-in link with the testers; they must install and keep the app for 14 days
7. After 14 days: Dashboard → **Apply for production** → answer the short questionnaire → promote the same release to **Production**

**B) Organisation account, or personal account created before Nov 2023:** skip the closed test — Test and release → **Production → Create new release** → upload the AAB → Send for review.

### 6. After it goes live
- AdMob → Apps → CityCars → **Link to Google Play**
- AdMob → **app-ads.txt** → "Check for updates" (the site already serves `https://citycars-xi.vercel.app/app-ads.txt`)
- New AdMob apps usually show few or no real ads until the app is live and reviewed — that is normal.

## Avoiding rejections
- Privacy policy URL must open publicly (it does).
- Data safety answers must match the AdMob SDK (the table above does).
- Do not mention other games/brands in the listing (e.g. never use "Bruno Simon").
- Don't promise features the game doesn't have; the listing texts here describe only what exists.
- Check the **Pre-launch report** after upload; it runs the app on real devices automatically.

## Next updates
Each new AAB needs a higher versionCode (2, 3, …) and the same upload key.
