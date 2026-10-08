// AdMob integration (Android via Capacitor). On the web every call is a harmless no-op
// so the game can be played and tested in a browser.
//
// BEFORE PUBLISHING: replace the TEST ids below with your own ad unit ids from
// https://apps.admob.com and set the APPLICATION_ID in android/app/src/main/AndroidManifest.xml.
import { Capacitor } from '@capacitor/core'

export const AD_IDS = {
  // Google's official test units — safe to use during development.
  banner: 'ca-app-pub-3940256099942544/9214589741',
  interstitial: 'ca-app-pub-3940256099942544/1033173712',
  rewarded: 'ca-app-pub-3940256099942544/5224354917',
}
// Flip to false once the real ad unit ids are in place.
const TESTING = true

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
    await AdMob.prepareRewardVideoAd({ adId: AD_IDS.rewarded, isTesting: TESTING })
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
    const reward = await AdMob.showRewardVideoAd()
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
