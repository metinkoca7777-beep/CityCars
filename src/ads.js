// AdMob integration (Android via Capacitor).
//
// Ad unit ids belong to the CityCars app in AdMob (publisher pub-4357371903036713).
// The matching APPLICATION_ID is set in android/app/src/main/AndroidManifest.xml.
//
// On the web there is no AdMob: banners/interstitials are no-ops and rewarded ads are
// reported as unavailable, so web players can't farm free coins without watching an ad.
import { Capacitor } from '@capacitor/core'

export const AD_IDS = {
  banner: 'ca-app-pub-4357371903036713/6981825759',
  interstitial: 'ca-app-pub-4357371903036713/8594201036',
  // "Rewarded interstitial" unit (Ödüllü Geçiş). Shown only when the player taps a
  // "watch ad" button, which satisfies AdMob's opt-in requirement for this format.
  rewarded: 'ca-app-pub-4357371903036713/1350135832',
}
// Real ads. To test on your own phone without risking the account, add the device
// under AdMob → Settings → Test devices (or temporarily set this to true).
const TESTING = false
// Minimum time between two interstitials, and the grace period after app start.
const INTERSTITIAL_GAP_MS = 150000
const FIRST_INTERSTITIAL_MS = 90000

const native = Capacitor.isNativePlatform()
// Watch-ad buttons are only offered where AdMob exists (the Android app).
export const adsSupported = native
let AdMob = null
let mod = null
let ready = false
let lastInterstitial = Date.now() - INTERSTITIAL_GAP_MS + FIRST_INTERSTITIAL_MS
let bannerShown = false
let interstitialLoaded = false
let rewardedLoaded = false
let loadingInterstitial = false
let loadingRewarded = false
let interstitialRetry = 0
let rewardedRetry = 0
// Full-screen ad state: the game mutes its audio while an ad covers the screen.
let onFullscreen = () => {}
export function setFullscreenHandler(fn) {
  onFullscreen = fn
}
// Pending rewarded show: resolved from the plugin's events (the native show() call
// itself only resolves when a reward is earned, never when the ad is closed early).
let pendingReward = null

export async function initAds() {
  if (!native) return
  try {
    mod = await import('@capacitor-community/admob')
    AdMob = mod.AdMob
    await AdMob.initialize({ initializeForTesting: TESTING })
    // GDPR / UMP consent (required in the EEA + UK).
    try {
      const info = await AdMob.requestConsentInfo()
      if (info.isConsentFormAvailable && info.status === mod.AdmobConsentStatus.REQUIRED) {
        await AdMob.showConsentForm()
      }
    } catch (e) {
      console.warn('Consent flow failed', e)
    }
    listen()
    ready = true
    preloadInterstitial()
    preloadRewarded()
  } catch (e) {
    console.warn('AdMob init failed', e)
  }
}

function listen() {
  const IE = mod.InterstitialAdPluginEvents
  const RE = mod.RewardInterstitialAdPluginEvents
  AdMob.addListener(IE.Loaded, () => {
    interstitialLoaded = true
    loadingInterstitial = false
    interstitialRetry = 0
  })
  AdMob.addListener(IE.FailedToLoad, () => {
    interstitialLoaded = false
    loadingInterstitial = false
    retryLater('interstitial')
  })
  AdMob.addListener(IE.Showed, () => onFullscreen(true))
  AdMob.addListener(IE.Dismissed, () => {
    onFullscreen(false)
    preloadInterstitial()
  })
  AdMob.addListener(IE.FailedToShow, () => {
    onFullscreen(false)
    preloadInterstitial()
  })

  AdMob.addListener(RE.Loaded, () => {
    rewardedLoaded = true
    loadingRewarded = false
    rewardedRetry = 0
  })
  AdMob.addListener(RE.FailedToLoad, () => {
    rewardedLoaded = false
    loadingRewarded = false
    retryLater('rewarded')
  })
  AdMob.addListener(RE.Showed, () => onFullscreen(true))
  AdMob.addListener(RE.Rewarded, () => {
    if (pendingReward) pendingReward.earned = true
  })
  AdMob.addListener(RE.Dismissed, () => {
    onFullscreen(false)
    finishReward()
    preloadRewarded()
  })
  AdMob.addListener(RE.FailedToShow, () => {
    onFullscreen(false)
    finishReward()
    preloadRewarded()
  })
}

function finishReward() {
  if (!pendingReward) return
  const p = pendingReward
  pendingReward = null
  // The reward callback can arrive just after the dismiss callback on some devices.
  setTimeout(() => p.resolve(p.earned), 250)
}

// Exponential backoff after a failed load (no fill, offline...): 15 s, 30 s, 60 s… max 5 min.
function retryLater(kind) {
  const n = kind === 'interstitial' ? ++interstitialRetry : ++rewardedRetry
  const delay = Math.min(15000 * 2 ** (n - 1), 300000)
  setTimeout(() => (kind === 'interstitial' ? preloadInterstitial() : preloadRewarded()), delay)
}

async function preloadInterstitial() {
  if (!ready || interstitialLoaded || loadingInterstitial) return
  loadingInterstitial = true
  interstitialLoaded = false
  try {
    await AdMob.prepareInterstitial({ adId: AD_IDS.interstitial, isTesting: TESTING })
    interstitialLoaded = true
  } catch {
    // FailedToLoad listener schedules the retry.
  }
  loadingInterstitial = false
}

async function preloadRewarded() {
  if (!ready || rewardedLoaded || loadingRewarded) return
  loadingRewarded = true
  rewardedLoaded = false
  try {
    await AdMob.prepareRewardInterstitialAd({ adId: AD_IDS.rewarded, isTesting: TESTING })
    rewardedLoaded = true
  } catch {
    // FailedToLoad listener schedules the retry.
  }
  loadingRewarded = false
}

export async function showBanner() {
  if (!ready || bannerShown) return
  bannerShown = true
  try {
    await AdMob.showBanner({ adId: AD_IDS.banner, adSize: mod.BannerAdSize.ADAPTIVE_BANNER, position: mod.BannerAdPosition.BOTTOM_CENTER, margin: 0, isTesting: TESTING })
  } catch {
    bannerShown = false
  }
}

export async function hideBanner() {
  if (!ready || !bannerShown) return
  bannerShown = false
  try {
    await AdMob.removeBanner()
  } catch {}
}

// Interstitials are rate-limited so they never feel spammy. Resolves once the ad has
// been requested (or skipped); the game is muted via the full-screen handler meanwhile.
export async function maybeInterstitial() {
  if (!ready) return false
  if (Date.now() - lastInterstitial < INTERSTITIAL_GAP_MS) return false
  if (!interstitialLoaded) {
    preloadInterstitial()
    return false
  }
  interstitialLoaded = false
  lastInterstitial = Date.now()
  try {
    await AdMob.showInterstitial()
    return true
  } catch {
    preloadInterstitial()
    return false
  }
}

// Resolves true only when the player watched long enough to earn the reward,
// false when the ad was closed early, failed, or isn't loaded yet.
export async function showRewarded() {
  if (!native || !ready) return false
  if (!rewardedLoaded) {
    preloadRewarded()
    return false
  }
  if (pendingReward) return false
  rewardedLoaded = false
  const result = new Promise((resolve) => {
    pendingReward = { earned: false, resolve }
  })
  // Safety net: never leave the game waiting forever if no callback arrives.
  const timeout = new Promise((resolve) => setTimeout(() => resolve('timeout'), 120000))
  AdMob.showRewardInterstitialAd().catch(() => {
    onFullscreen(false)
    finishReward()
    preloadRewarded()
  })
  const r = await Promise.race([result, timeout])
  if (r === 'timeout') {
    const earned = pendingReward?.earned ?? false
    pendingReward = null
    onFullscreen(false)
    preloadRewarded()
    return earned
  }
  return r
}

// True when a rewarded ad can be shown right now (used to enable "watch ad" buttons).
export function adsAvailable() {
  return native && ready && rewardedLoaded
}
