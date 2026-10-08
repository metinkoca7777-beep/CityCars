// AdMob integration (Android via Capacitor). On the web every call is a harmless no-op
// so the game can be played and tested in a browser.
//
// Ad unit ids belong to the CityCars app in AdMob (publisher pub-4357371903036713).
// The matching APPLICATION_ID is set in android/app/src/main/AndroidManifest.xml.
import { Capacitor } from '@capacitor/core'

export const AD_IDS = {
  banner: 'ca-app-pub-4357371903036713/6981825759',
  interstitial: 'ca-app-pub-4357371903036713/8594201036',
  // "Rewarded interstitial" unit (Ödüllü Geçiş). Shown only when the player taps a
  // "watch ad" button, which satisfies AdMob's opt-in requirement for this format.
  rewarded: 'ca-app-pub-4357371903036713/1350135832',
}
// 'interstitial' = rewarded interstitial unit, 'video' = classic rewarded unit.
const REWARD_FORMAT = 'interstitial'
// Real ads. To test on your own phone without risking the account, add the device
// under AdMob → Settings → Test devices (or temporarily set this to true).
const TESTING = false

const native = Capacitor.isNativePlatform()
let AdMob = null
let mod = null
let ready = false
let lastInterstitial = Date.now()
let bannerShown = false

export async function initAds() {
  if (!native) return
  try {
    mod = await import('@capacitor-community/admob')
    AdMob = mod.AdMob
    await AdMob.initialize({ initializeForTesting: TESTING })
    // GDPR / UMP consent (required in the EEA + UK).
    const info = await AdMob.requestConsentInfo()
    if (info.isConsentFormAvailable && info.status === mod.AdmobConsentStatus.REQUIRED) {
      await AdMob.showConsentForm()
    }
    ready = true
    preloadInterstitial()
    preloadRewarded()
  } catch (e) {
    console.warn('AdMob init failed', e)
  }
}

async function preloadInterstitial() {
  try {
    await AdMob.prepareInterstitial({ adId: AD_IDS.interstitial, isTesting: TESTING })
  } catch {}
}

async function preloadRewarded() {
  try {
    if (REWARD_FORMAT === 'interstitial') await AdMob.prepareRewardInterstitialAd({ adId: AD_IDS.rewarded, isTesting: TESTING })
    else await AdMob.prepareRewardVideoAd({ adId: AD_IDS.rewarded, isTesting: TESTING })
  } catch {}
}

export async function showBanner() {
  if (!ready || bannerShown) return
  try {
    await AdMob.showBanner({ adId: AD_IDS.banner, adSize: mod.BannerAdSize.ADAPTIVE_BANNER, position: mod.BannerAdPosition.BOTTOM_CENTER, margin: 0, isTesting: TESTING })
    bannerShown = true
  } catch {}
}

export async function hideBanner() {
  if (!ready || !bannerShown) return
  try {
    await AdMob.removeBanner()
  } catch {}
  bannerShown = false
}

// Interstitials are rate-limited so they never feel spammy (min 3 minutes apart).
export async function maybeInterstitial() {
  if (!ready) return
  if (Date.now() - lastInterstitial < 180000) return
  try {
    await AdMob.showInterstitial()
    lastInterstitial = Date.now()
  } catch {}
  preloadInterstitial()
}

// Resolves true when the player earned the reward.
export async function showRewarded() {
  if (!native) {
    // Web build: simulate a short "ad" so the flow can be tested.
    await new Promise((r) => setTimeout(r, 600))
    return true
  }
  if (!ready) return false
  try {
    const reward = REWARD_FORMAT === 'interstitial' ? await AdMob.showRewardInterstitialAd() : await AdMob.showRewardVideoAd()
    preloadRewarded()
    return !!reward
  } catch {
    preloadRewarded()
    return false
  }
}

export function adsAvailable() {
  return native ? ready : true
}
