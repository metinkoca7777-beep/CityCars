// Persistent progress stored in localStorage (WebView storage on Android).
const KEY = 'citycars-save-v1'

const DEFAULTS = {
  coins: 150,
  unlocked: ['istanbul'],
  cars: ['mini'],
  car: 'mini',
  city: 'istanbul',
  discovered: {}, // cityId -> [landmarkIndex]
  bestRace: {}, // cityId -> seconds
  medals: {}, // cityId -> 'gold' | 'silver' | 'bronze'
  bestCoins: {}, // cityId -> max coins collected in one visit
  settings: { music: 0.6, sfx: 0.85, quality: null, lang: null, vibration: true },
  daily: { last: null, streak: 0 },
  stats: { distance: 0, smashed: 0, coinsTotal: 0, playSeconds: 0 },
  firstRun: true,
}

let data

export function load() {
  try {
    const raw = localStorage.getItem(KEY)
    data = raw ? { ...structuredClone(DEFAULTS), ...JSON.parse(raw) } : structuredClone(DEFAULTS)
    data.settings = { ...DEFAULTS.settings, ...data.settings }
    data.stats = { ...DEFAULTS.stats, ...data.stats }
  } catch {
    data = structuredClone(DEFAULTS)
  }
  return data
}

export function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(data))
  } catch {
    // Storage full or unavailable (private mode) — progress just won't persist.
  }
}

export function get() {
  return data ?? load()
}

export function addCoins(n) {
  const d = get()
  d.coins = Math.max(0, d.coins + n)
  if (n > 0) d.stats.coinsTotal += n
  save()
  return d.coins
}

export function spend(n) {
  const d = get()
  if (d.coins < n) return false
  d.coins -= n
  save()
  return true
}

// Daily reward: returns { amount, streak } when claimable today, else null.
export function dailyAvailable() {
  const d = get()
  const today = new Date().toISOString().slice(0, 10)
  if (d.daily.last === today) return null
  const y = new Date(Date.now() - 86400000).toISOString().slice(0, 10)
  const streak = d.daily.last === y ? Math.min(d.daily.streak + 1, 7) : 1
  return { amount: 50 + streak * 50, streak, today }
}

export function claimDaily(info) {
  const d = get()
  d.daily = { last: info.today, streak: info.streak }
  addCoins(info.amount)
}

export function cityStars(cityId, landmarkCount) {
  const d = get()
  let s = 0
  if ((d.discovered[cityId] ?? []).length >= landmarkCount) s++
  if ((d.bestCoins[cityId] ?? 0) >= 40) s++
  if (d.medals[cityId] === 'gold') s++
  return s
}
