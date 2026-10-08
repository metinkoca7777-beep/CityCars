import './style.css'
import '@fontsource/fredoka/latin-500.css'
import '@fontsource/fredoka/latin-700.css'
import '@fontsource/fredoka/latin-ext-500.css'
import '@fontsource/fredoka/latin-ext-700.css'
import * as THREE from 'three'
import * as CANNON from 'cannon-es'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'
import { Capacitor } from '@capacitor/core'
import { CITIES, cityById } from './cities.js'
import { World, HALF, ROAD, BLOCK, CELL, roadLine, blockCenter } from './world.js'
import { GRID } from './cities.js'
import { PlayerCar, CARS } from './cars.js'
import { AudioEngine } from './audio.js'
import { Particles, SkidMarks } from './effects.js'
import { Controls } from './controls.js'
import * as Save from './save.js'
import * as Ads from './ads.js'
import { t, tl, setLanguage, detectLanguage, LANGUAGES, getLanguage } from './i18n.js'
import { isMobile, clamp, damp, formatTime } from './utils.js'
import { MODEL_CREDITS } from './credits.js'

const $ = (s) => document.querySelector(s)
const PRIVACY_URL = 'https://metinkoca7777-beep.github.io/citycars/privacy.html'
const DISCOVER_REWARD = 100
const ALL_DISCOVERED_BONUS = 250
const FREE_COINS = 150
const MEDAL_REWARD = { gold: 300, silver: 150, bronze: 80, none: 30 }

class Game {
  constructor() {
    this.save = Save.load()
    const st = this.save.settings
    setLanguage(st.lang ?? detectLanguage())
    this.mobile = isMobile()
    this.quality = st.quality ?? (this.mobile ? 'medium' : 'high')
    this.mode = 'loading'
    this.t = 0
    this.camMode = 0
    this.shake = 0
    this.runCoins = 0
    this.lastCrash = 0
    this.race = null
    this.menuAngle = 0

    this.initRenderer()
    this.physics = new CANNON.World({ gravity: new CANNON.Vec3(0, -14, 0) })
    this.physics.broadphase = new CANNON.SAPBroadphase(this.physics)
    this.physics.allowSleep = true
    this.physics.defaultContactMaterial.friction = 0.25
    this.physics.defaultContactMaterial.restitution = 0.15

    this.audio = new AudioEngine()
    this.audio.setVolumes(st.music, st.sfx)
    this.controls = new Controls()
    this.controls.bindTouch($('#touch'))
    this.controls.on('reset', () => this.mode === 'play' && this.resetCar())
    this.controls.on('pause', () => (this.mode === 'play' ? this.pause() : this.mode === 'pause' ? this.resume() : null))
    this.controls.on('camera', () => this.cycleCamera())

    this.smoke = new Particles(this.scene, 1600, false)
    this.sparks = new Particles(this.scene, 1600, true)
    this.pendingBooms = []
    this.makeExplosionFx()
    this.skids = new SkidMarks(this.scene)
    this.arrow = this.makeArrow()

    $('#btnPause').onclick = () => this.pause()
    $('#btnCam').onclick = () => this.cycleCamera()
    $('#btnRace').onclick = () => (this.race ? this.cancelRace() : this.startRace())
    $('#discoverCard').onclick = () => $('#discoverCard').classList.add('hidden')
    if (this.mobile) $('#touch').classList.remove('hidden')
    else {
      $('#keysHint').classList.remove('hidden')
      $('#keysHint').textContent = t('keysHint')
    }

    // Unlock audio on the first interaction (browser autoplay rules).
    const unlock = () => {
      this.audio.init()
      if (this.city) {
        this.audio.playMusic(this.city.music.style, this.city.music.tempo)
        this.audio.setAmbience(this.city)
      }
      window.removeEventListener('pointerdown', unlock)
      window.removeEventListener('keydown', unlock)
    }
    window.addEventListener('pointerdown', unlock)
    window.addEventListener('keydown', unlock)
    window.addEventListener('resize', () => this.resize())
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.mode === 'play') this.pause()
    })
    this.setupNative()
    this.clock = new THREE.Clock()
    this.loop = this.loop.bind(this)
  }

  async start() {
    await this.loadCity(this.save.city)
    $('#loading').classList.add('fade')
    setTimeout(() => $('#loading').classList.add('hidden'), 600)
    this.showTitle()
    requestAnimationFrame(this.loop)
    Ads.initAds().then(() => this.mode === 'menu' && Ads.showBanner())
  }

  // ---------------- setup ----------------
  initRenderer() {
    const canvas = $('#game')
    const r = new THREE.WebGLRenderer({ canvas, antialias: this.quality !== 'low', powerPreference: 'high-performance' })
    r.outputColorSpace = THREE.SRGBColorSpace
    r.toneMapping = THREE.AgXToneMapping
    r.toneMappingExposure = 1.15
    r.shadowMap.enabled = this.quality !== 'low'
    r.shadowMap.type = THREE.PCFSoftShadowMap
    this.renderer = r
    this.scene = new THREE.Scene()
    this.camera = new THREE.PerspectiveCamera(60, 1, 0.3, 2400)
    this.camera.position.set(0, 20, 30)
    this.composer = new EffectComposer(r)
    this.composer.addPass(new RenderPass(this.scene, this.camera))
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.6, 0.45, 0.82)
    this.composer.addPass(this.bloom)
    this.composer.addPass(new OutputPass())
    this.resize()
  }

  applyQuality() {
    const q = this.quality
    const pr = Math.min(window.devicePixelRatio || 1, q === 'high' ? 2 : q === 'medium' ? 1.5 : 1)
    this.renderer.setPixelRatio(pr)
    this.renderer.shadowMap.enabled = q !== 'low'
    this.useBloom = q !== 'low'
    this.resize()
  }

  resize() {
    const w = window.innerWidth
    const h = window.innerHeight
    const q = this.quality
    const pr = Math.min(window.devicePixelRatio || 1, q === 'high' ? 2 : q === 'medium' ? 1.5 : 1)
    this.renderer.setPixelRatio(pr)
    this.renderer.setSize(w, h, false)
    this.composer.setPixelRatio(pr)
    this.composer.setSize(w, h)
    this.bloom.resolution.set(w / 2, h / 2)
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
    this.smoke?.resize(h * pr)
    this.sparks?.resize(h * pr)
    this.useBloom = q !== 'low'
  }

  async setupNative() {
    if (!Capacitor.isNativePlatform()) return
    try {
      const { StatusBar } = await import('@capacitor/status-bar')
      await StatusBar.hide()
    } catch {}
    try {
      const { App } = await import('@capacitor/app')
      App.addListener('backButton', () => {
        if (this.mode === 'play') this.pause()
        else if (this.mode === 'pause') this.resume()
        else if (this.screen && this.screen !== 'title') this.showTitle()
        else App.exitApp()
      })
      App.addListener('pause', () => this.mode === 'play' && this.pause())
    } catch {}
    try {
      this.haptics = (await import('@capacitor/haptics')).Haptics
    } catch {}
  }

  vibrate(strong = false) {
    if (!this.save.settings.vibration) return
    try {
      if (this.haptics) this.haptics.impact({ style: strong ? 'HEAVY' : 'LIGHT' })
      else navigator.vibrate?.(strong ? 60 : 20)
    } catch {}
  }

  makeArrow() {
    const g = new THREE.Group()
    const s = new THREE.Shape()
    s.moveTo(0, 1.4)
    s.lineTo(1, 0)
    s.lineTo(0.38, 0)
    s.lineTo(0.38, -1)
    s.lineTo(-0.38, -1)
    s.lineTo(-0.38, 0)
    s.lineTo(-1, 0)
    s.closePath()
    const geo = new THREE.ExtrudeGeometry(s, { depth: 0.3, bevelEnabled: false })
    geo.translate(0, 0, -0.15)
    geo.rotateX(-Math.PI / 2)
    const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: '#ffd84a', emissive: '#ffae00', emissiveIntensity: 0.9, transparent: true, opacity: 0.92 }))
    m.rotation.y = Math.PI
    m.rotation.x = 0.35
    m.scale.setScalar(0.7)
    g.add(m)
    g.visible = false
    this.scene.add(g)
    return g
  }

  // ---------------- city / car ----------------
  async loadCity(id) {
    $('#loading').classList.remove('hidden', 'fade')
    $('#loadingText').textContent = t('loading')
    await new Promise((r) => setTimeout(r, 30))
    if (this.world) this.world.dispose()
    if (this.car) this.car.dispose()
    this.cancelRace(true)
    this.city = this.applyLighting(cityById(id))
    this.save.city = this.city.id
    Save.save()
    this.world = new World(this.city, this.scene, this.physics, this.quality, this.renderer)
    const found = this.save.discovered[this.city.id] ?? []
    this.world.landmarks.forEach((lm, i) => (lm.discovered = found.includes(i)))
    this.spawnCar()
    this.skids.clear()
    this.runCoins = 0
    this.bloom.strength = this.city.time === 'night' ? 0.7 : this.city.time === 'sunset' ? 0.45 : 0.15
    this.bloom.threshold = this.city.time === 'night' ? 0.82 : 0.95
    this.renderer.toneMappingExposure = this.city.time === 'night' ? 1.2 : this.city.time === 'day' ? 0.55 : 1.1
    this.drawMinimapBase()
    if (this.audio.ctx) {
      this.audio.playMusic(this.city.music.style, this.city.music.tempo)
      this.audio.setAmbience(this.city)
    }
    this.camHeading = 0
    this.camera.position.set(this.car.position.x, 12, this.car.position.z - 20)
    $('#loading').classList.add('fade')
    setTimeout(() => $('#loading').classList.add('hidden'), 500)
  }

  // 'day' (default): every city in bright, realistic midday light. 'mood': each city's own
  // sunset/night atmosphere.
  applyLighting(base) {
    if ((this.save.settings.lighting ?? 'day') === 'mood') return base
    const [x, , z] = base.sunPos
    const desert = base.style === 'desert' || base.style === 'rural'
    return {
      ...base,
      time: 'day',
      sky: ['#3b82d6', '#d4e5f3'],
      fog: desert ? '#e9e0cf' : '#d3e1ec',
      sun: '#fff5e6',
      sunPos: [x || 0.4, 1.35, z || 0.5],
    }
  }

  spawnCar() {
    if (this.car) this.car.dispose()
    const def = CARS.find((c) => c.id === this.save.car) ?? CARS[0]
    this.car = new PlayerCar(def, this.scene, this.physics)
    if (this.city.time === 'night') this.car.addHeadlights()
    const sp = this.world.spawn
    this.car.reset(sp.x, sp.z, sp.heading)
    this.propByBody = new Map(this.world.props.map((p) => [p.body.id, p]))
    this.car.chassis.addEventListener('collide', (e) => this.onCollide(e))
  }

  resetCar() {
    // Put the car back on the nearest road, facing along it.
    const p = this.car.position
    let best = null
    for (const s of this.world.segments) {
      const ax = s.a.x, az = s.a.z, bx = s.b.x, bz = s.b.z
      const len2 = (bx - ax) ** 2 + (bz - az) ** 2
      const u = clamp(((p.x - ax) * (bx - ax) + (p.z - az) * (bz - az)) / len2, 0.15, 0.85)
      const x = ax + (bx - ax) * u
      const z = az + (bz - az) * u
      const d = (x - p.x) ** 2 + (z - p.z) ** 2
      if (!best || d < best.d) best = { d, x, z, s }
    }
    const h = this.car.heading
    let heading = best.s.horiz ? Math.PI / 2 : 0
    if (Math.cos(heading - h) < 0) heading += Math.PI
    this.car.reset(best.x, best.z, heading)
    this.snapCamera()
  }

  onCollide(e) {
    const other = e.body
    const impact = Math.abs(e.contact.getImpactVelocityAlongNormal())
    const prop = this.propByBody.get(other.id)
    const c = e.contact
    const pt = c.bi === this.car.chassis ? c.bi.position.vadd(c.ri) : c.bj.position.vadd(c.rj)
    if (prop) {
      if (prop.kind === 'barrel') {
        if (impact > 1.5 && !prop.gone) this.pendingBooms.push({ prop })
        return
      }
      if (!prop.hit && impact > 1) {
        prop.hit = true
        this.save.stats.smashed++
        this.addCoins(2, false)
        this.audio.thump(Math.min(1, impact / 8))
        this.sparks.burst(pt.x, pt.y + 0.5, pt.z, 10, ['#ffd166', '#ffffff'], 5, { size: 0.35, life: 0.6 })
      } else if (impact > 2) this.audio.thump(Math.min(1, impact / 12))
      return
    }
    if (other === this.world.groundBody) return
    if (impact > 3 && this.t - this.lastCrash > 0.25) {
      this.lastCrash = this.t
      const k = Math.min(1, impact / 16)
      this.audio.crash(k)
      this.shake = Math.max(this.shake, 0.25 + k * 0.6)
      this.sparks.burst(pt.x, pt.y, pt.z, 10 + Math.round(k * 24), ['#ffb703', '#fb5607', '#ffffff'], 6 + k * 6, { size: 0.3, life: 0.7, gravity: 14 })
      if (k > 0.35) this.vibrate(k > 0.7)
      // Really hard hits go off with a (harmless) fireball.
      if (impact > 12) this.pendingBooms.push({ x: pt.x, y: pt.y + 0.5, z: pt.z, power: 0.4, push: false })
    }
  }

  // ---------------- explosions ----------------
  makeExplosionFx() {
    const ringMat = new THREE.MeshBasicMaterial({ color: '#ffb347', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })
    this.shockRings = []
    for (let i = 0; i < 4; i++) {
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.85, 1, 48), ringMat.clone())
      ring.rotation.x = -Math.PI / 2
      ring.visible = false
      this.scene.add(ring)
      this.shockRings.push({ mesh: ring, t: 1 })
    }
    this.flash = new THREE.PointLight('#ffa040', 0, 60, 1.6)
    this.scene.add(this.flash)
  }

  processBooms() {
    const list = this.pendingBooms
    if (!list.length) return
    this.pendingBooms = []
    for (const b of list) {
      if (b.prop) {
        if (b.prop.gone) continue
        const p = b.prop.body.position
        const at = { x: p.x, y: p.y, z: p.z }
        this.world.removeProp(b.prop)
        this.explode(at.x, at.y, at.z, 1, true)
        this.addCoins(5, true)
        this.toast('💥 BOOM! +5')
      } else this.explode(b.x, b.y, b.z, b.power, b.push)
    }
  }

  explode(x, y, z, power = 1, push = true) {
    const P = power
    this.audio.explosion(P)
    this.shake = Math.max(this.shake, 0.6 + P * 1.1)
    this.vibrate(true)
    // Fireball: opaque orange/red billows with a small additive hot core
    const fire = ['#ffd166', '#ff9f1c', '#fb5607', '#e63900', '#b81d00']
    for (let i = 0; i < 34 * P; i++) {
      const a = Math.random() * Math.PI * 2
      const e = Math.random() * 1.1
      const sp = (3 + Math.random() * 6) * P
      this.smoke.emit(x, y + 0.6, z, Math.cos(a) * Math.cos(e) * sp, Math.sin(e) * sp + 2.5, Math.sin(a) * Math.cos(e) * sp, fire[i % fire.length], (1.8 + Math.random() * 1.6) * Math.max(P, 0.5), 0.5 + Math.random() * 0.4, { drag: 3, gravity: -4, grow: 4.5, alpha: 0.95 })
    }
    for (let i = 0; i < 10 * P; i++) {
      this.sparks.emit(x, y + 0.8, z, (Math.random() - 0.5) * 6, 2 + Math.random() * 3, (Math.random() - 0.5) * 6, '#ffb347', 1.4 * Math.max(P, 0.5), 0.35, { drag: 4, grow: 3 })
    }
    // Rolling black smoke column
    for (let i = 0; i < 40 * P; i++) {
      const a = Math.random() * Math.PI * 2
      const sp = Math.random() * 4 * P
      const g = 40 + Math.random() * 40
      this.smoke.emit(x + Math.cos(a), y + 1 + Math.random() * 2, z + Math.sin(a), Math.cos(a) * sp, 2 + Math.random() * 3, Math.sin(a) * sp, `rgb(${g},${g},${g})`, 2.5 + Math.random() * 2, 2.2 + Math.random() * 1.6, { grow: 4, drag: 1.2, gravity: -0.6, alpha: 0.7 })
    }
    // Sparks and debris
    this.sparks.burst(x, y + 0.5, z, Math.round(36 * P), ['#ffb703', '#ff7b00', '#ffe066'], 16 * P, { size: 0.25, life: 1.2, gravity: 16, up: 0.7, drag: 0.3 })
    this.smoke.burst(x, y + 0.5, z, Math.round(24 * P), ['#3b2a20', '#5a5a5a', '#8b1e1e'], 12 * P, { size: 0.5, life: 2, gravity: 18, up: 0.8, drag: 0.2 })
    // Shockwave ring + light flash
    const ring = this.shockRings.find((r) => r.t >= 1) ?? this.shockRings[0]
    ring.t = 0
    ring.max = 10 + 14 * P
    ring.mesh.position.set(x, 0.25, z)
    ring.mesh.visible = true
    this.flash.position.set(x, y + 3, z)
    this.flash.intensity = 500 * P
    if (!push) return
    // Blast impulse on everything nearby (including the player's car)
    const R = 13
    for (const body of this.physics.bodies) {
      if (body.mass <= 0) continue
      const dx = body.position.x - x
      const dy = body.position.y - y
      const dz = body.position.z - z
      const d = Math.hypot(dx, dy, dz)
      if (d > R || d < 1e-3) continue
      const f = (1 - d / R) * 13 * P
      const n = 1 / Math.max(d, 0.5)
      body.wakeUp()
      const imp = new CANNON.Vec3(dx * n * f, (0.9 + dy * n * 0.3) * f, dz * n * f).scale(body.mass)
      body.applyImpulse(imp)
      if (body === this.car.chassis) body.angularVelocity.set((Math.random() - 0.5) * 3, (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 3)
    }
    // Chain reaction
    for (const p of this.world.props) {
      if (p.kind !== 'barrel' || p.gone) continue
      const d = Math.hypot(p.body.position.x - x, p.body.position.z - z)
      if (d < 7.5) setTimeout(() => this.pendingBooms.push({ prop: p }), 120 + d * 40)
    }
  }

  updateExplosionFx(dt) {
    for (const r of this.shockRings) {
      if (r.t >= 1) continue
      r.t = Math.min(1, r.t + dt * 2.2)
      const s = 1 + r.t * r.max
      r.mesh.scale.set(s, s, s)
      r.mesh.material.opacity = (1 - r.t) * 0.6
      if (r.t >= 1) r.mesh.visible = false
    }
    if (this.flash.intensity > 0) this.flash.intensity = Math.max(0, this.flash.intensity - dt * 2500)
  }

  // ---------------- main loop ----------------
  loop() {
    requestAnimationFrame(this.loop)
    const dt = Math.min(this.clock.getDelta(), 1 / 20)
    this.t += dt
    const input = this.controls.update()
    const car = this.car
    const playing = this.mode === 'play'
    const frozen = this.mode === 'pause' || this.mode === 'loading'

    if (car && !frozen) {
      const locked = !playing || (this.race && !this.race.started)
      car.input = locked ? { throttle: 0, brake: 0, steer: 0, nitro: false, handbrake: true } : input
      car.update(dt)
      this.physics.step(1 / 60, dt, 4)
      this.processBooms()
      car.sync(this.t)
      if (car.flipped || car.position.y < -5) this.resetCar()
      this.world.update(this.t, dt, car.position)
      this.updateEffects(dt)
      if (playing) this.updateGameplay(dt, input)
    }
    this.updateExplosionFx(frozen ? 0 : dt)
    this.smoke.update(frozen ? 0 : dt)
    this.sparks.update(frozen ? 0 : dt)
    if (car) this.updateCamera(dt)
    if (this.audio.ctx && car) {
      const run = playing && !frozen
      this.audio.updateEngine(car.speed, car.def.top, run ? input.throttle : 0, run && car.nitroActive, run ? this.skidAmount : 0, this.mode !== 'pause' && this.mode !== 'loading')
      if (run && input.horn) this.audio.hornStart()
      else this.audio.hornStop()
      this.audio.tickAmbience()
    }
    if (playing) this.updateHUD()
    if (this.useBloom && this.city?.time !== 'day') this.composer.render()
    else this.renderer.render(this.scene, this.camera)
  }

  updateEffects(dt) {
    const car = this.car
    const v = car.vehicle
    let skid = 0
    for (let i = 0; i < 4; i++) {
      const w = v.wheelInfos[i]
      const sk = car.skidding[i]
      if (sk) skid += 0.35
      if (w.isInContact) this.skids.add(i, w.raycastResult.hitPointWorld, sk)
      else this.skids.add(i, null, false)
      if (sk && i >= 2 && Math.random() < 0.6) {
        const p = w.raycastResult.hitPointWorld
        this.smoke.emit(p.x, p.y + 0.3, p.z, (Math.random() - 0.5) * 1.5, 1 + Math.random(), (Math.random() - 0.5) * 1.5, this.city.style === 'desert' || this.city.style === 'rural' ? '#e2c99a' : '#d8d8d8', 1.2, 1.1, { grow: 3, drag: 1.5, alpha: 0.45 })
      }
    }
    this.skidAmount = skid
    const ex = car.exhaustPoint(tmpV)
    const q = car.chassis.quaternion
    const back = new CANNON.Vec3(0, 0, -1)
    q.vmult(back, back)
    if (car.nitroActive) {
      for (let k = 0; k < 3; k++) {
        this.sparks.emit(ex.x, ex.y, ex.z, back.x * 10 + (Math.random() - 0.5) * 2, back.y * 10 + Math.random(), back.z * 10 + (Math.random() - 0.5) * 2, k % 2 ? '#3ad0ff' : '#ff8a00', 0.7, 0.25, { drag: 2 })
      }
    } else if (Math.random() < 0.15) {
      this.smoke.emit(ex.x, ex.y, ex.z, back.x * 1.5, 0.6, back.z * 1.5, '#9a9a9a', 0.35, 0.8, { grow: 1.2, alpha: 0.25 })
    }
  }

  updateGameplay(dt, input) {
    const car = this.car
    const p = car.position
    const w = this.world
    this.save.stats.distance += Math.abs(car.speed) * dt
    this.save.stats.playSeconds += dt
    // Coins
    for (const c of w.coins) {
      if (c.taken) continue
      const dx = c.x - p.x
      const dz = c.z - p.z
      if (dx * dx + dz * dz < 6.5 && Math.abs(c.y - p.y) < 3.5) {
        c.taken = true
        w.coinsLeft--
        this.runCoins++
        this.addCoins(1, true)
        this.audio.coin()
        this.sparks.burst(c.x, c.y, c.z, 8, ['#ffd166', '#fff3b0'], 4, { size: 0.35, life: 0.5, gravity: 2, up: 0.8 })
        const best = this.save.bestCoins[this.city.id] ?? 0
        if (this.runCoins > best) this.save.bestCoins[this.city.id] = this.runCoins
      }
    }
    // Landmarks
    w.landmarks.forEach((lm, i) => {
      if (lm.discovered) return
      if (Math.abs(p.x - lm.x) < lm.half + 8 && Math.abs(p.z - lm.z) < lm.half + 8) this.discover(lm, i)
    })
    // Race
    if (this.race) this.updateRace(dt)
    // Guidance arrow
    let target = null
    if (this.race && this.race.started) target = w.checkpoints[this.race.i]
    else {
      let best = Infinity
      for (const lm of w.landmarks) {
        if (lm.discovered) continue
        const d = Math.hypot(lm.x - p.x, lm.z - p.z)
        if (d < best) {
          best = d
          target = lm
        }
      }
      this.nearest = target ? { lm: target, d: best } : null
    }
    if (target) {
      this.arrow.visible = true
      this.arrow.position.set(p.x, p.y + 3 + Math.sin(this.t * 3) * 0.15, p.z)
      this.arrow.rotation.y = Math.atan2(target.x - p.x, target.z - p.z)
    } else this.arrow.visible = false
    if (this.t - (this.lastSave ?? 0) > 5) {
      this.lastSave = this.t
      Save.save()
    }
    $('#nitroVignette').classList.toggle('on', car.nitroActive)
  }

  discover(lm, index) {
    lm.discovered = true
    const list = (this.save.discovered[this.city.id] ??= [])
    if (!list.includes(index)) list.push(index)
    this.addCoins(DISCOVER_REWARD, false)
    this.audio.discover()
    this.vibrate(true)
    $('#dcTitle').textContent = t('discovered')
    $('#dcName').textContent = tl(lm.def.name)
    $('#dcFact').textContent = tl(lm.def.fact)
    $('#dcReward').textContent = `+${DISCOVER_REWARD}`
    const card = $('#discoverCard')
    card.classList.add('hidden')
    void card.offsetWidth
    card.classList.remove('hidden')
    clearTimeout(this.cardTimer)
    this.cardTimer = setTimeout(() => card.classList.add('hidden'), 7000)
    const p = this.car.position
    this.smoke.burst(p.x, p.y + 2, p.z, 80, ['#ff006e', '#ffbe0b', '#3a86ff', '#8338ec', '#06d6a0', '#ffffff'], 10, { size: 0.45, life: 2.2, gravity: 6, up: 1, drag: 0.8 })
    const top = lm.beacon.userData.baseY
    for (let k = 0; k < 4; k++) {
      setTimeout(() => {
        const cols = [['#ff006e', '#ffbe0b'], ['#3a86ff', '#ffffff'], ['#06d6a0', '#ffbe0b'], ['#8338ec', '#ff006e']][k]
        this.sparks.burst(lm.x + (Math.random() - 0.5) * 20, top + Math.random() * 10, lm.z + (Math.random() - 0.5) * 20, 70, cols, 16, { size: 1.2, life: 1.6, gravity: 4, up: 0.2, drag: 1.2 })
        this.audio.noiseHit(0.5, 600, 0.12, 0, 'lowpass')
      }, 300 + k * 350)
    }
    if (this.world.landmarks.every((l) => l.discovered)) {
      setTimeout(() => {
        this.toast(t('allDiscovered', { city: tl(this.city.name) }) + ` +${ALL_DISCOVERED_BONUS}`)
        this.addCoins(ALL_DISCOVERED_BONUS, false)
        this.audio.finish()
      }, 2500)
    }
    Save.save()
  }

  addCoins(n, small) {
    Save.addCoins(n)
    const pill = $('#hudCoins')
    pill.classList.remove('bump')
    void pill.offsetWidth
    pill.classList.add('bump')
    if (!small && n > 2) this.toast(`+${n} 🪙`)
  }

  // ---------------- race ----------------
  startRace() {
    if (this.mode !== 'play') return
    const w = this.world
    const sp = w.spawn
    this.car.reset(sp.x, sp.z, sp.heading)
    this.snapCamera()
    this.race = { i: 0, time: 0, started: false }
    w.ringGroup.visible = true
    w.checkpoints.forEach((cp, k) => (cp.mesh.visible = k === 0))
    $('#raceTimer').classList.remove('hidden')
    $('#raceCp').classList.remove('hidden')
    $('#btnRace').textContent = '✖'
    this.toast(t('raceInfo'))
    const cd = $('#countdown')
    let n = 3
    const step = () => {
      if (!this.race) return
      cd.classList.remove('hidden', 'pop')
      void cd.offsetWidth
      cd.classList.add('pop')
      if (n > 0) {
        cd.textContent = n
        this.audio.countdown(false)
        n--
        this.raceTimer = setTimeout(step, 800)
      } else {
        cd.textContent = t('go')
        this.audio.countdown(true)
        this.race.started = true
        this.raceTimer = setTimeout(() => cd.classList.add('hidden'), 700)
      }
    }
    step()
  }

  cancelRace(silent) {
    clearTimeout(this.raceTimer)
    this.race = null
    if (this.world?.ringGroup) this.world.ringGroup.visible = false
    $('#raceTimer').classList.add('hidden')
    $('#raceCp').classList.add('hidden')
    $('#countdown').classList.add('hidden')
    $('#btnRace').textContent = '🏁'
  }

  updateRace(dt) {
    const r = this.race
    if (!r.started) return
    r.time += dt
    const cps = this.world.checkpoints
    const cp = cps[r.i]
    const p = this.car.position
    if (Math.hypot(cp.x - p.x, cp.z - p.z) < 8) {
      cp.mesh.visible = false
      this.sparks.burst(cp.x, 6, cp.z, 40, ['#36e0ff', '#ffffff'], 10, { size: 0.6, life: 0.8, gravity: 3 })
      r.i++
      if (r.i >= cps.length) return this.finishRace()
      this.audio.checkpoint()
      cps[r.i].mesh.visible = true
    }
    $('#raceTimer').textContent = formatTime(r.time)
    $('#raceCp').textContent = t('checkpoint', { a: r.i + 1, b: cps.length })
  }

  finishRace() {
    const time = this.race.time
    const len = this.world.raceLength
    const medal = time <= len / 15 ? 'gold' : time <= len / 12 ? 'silver' : time <= len / 9 ? 'bronze' : 'none'
    const id = this.city.id
    const prevBest = this.save.bestRace[id]
    if (!prevBest || time < prevBest) this.save.bestRace[id] = time
    const rank = { none: 0, bronze: 1, silver: 2, gold: 3 }
    if (rank[medal] > rank[this.save.medals[id] ?? 'none']) this.save.medals[id] = medal
    const reward = MEDAL_REWARD[medal]
    this.addCoins(reward, true)
    Save.save()
    this.audio.finish()
    this.cancelRace(true)
    this.smoke.burst(this.car.position.x, this.car.position.y + 2, this.car.position.z, 120, ['#ff006e', '#ffbe0b', '#3a86ff', '#06d6a0'], 12, { size: 0.5, life: 2.4, gravity: 6, up: 1 })
    this.mode = 'pause'
    this.showRaceResult({ time, medal, reward, best: this.save.bestRace[id] })
  }

  // ---------------- camera ----------------
  // Jump the chase camera straight behind the car (after teleports/resets).
  snapCamera() {
    const p = this.car.position
    const ch = (this.camHeading = this.car.heading)
    const [dist, height] = [[10.5, 4.6], [6.5, 2.8], [26, 20]][this.camMode]
    this.camera.position.set(p.x - Math.sin(ch) * dist, Math.max(p.y + height, 1.4), p.z - Math.cos(ch) * dist)
    this.camera.lookAt(p.x + Math.sin(ch) * 4, p.y + 1.2, p.z + Math.cos(ch) * 4)
  }

  cycleCamera() {
    this.camMode = (this.camMode + 1) % 3
  }

  updateCamera(dt) {
    const car = this.car
    const p = car.position
    const cam = this.camera
    if (this.mode === 'menu' || this.mode === 'loading') {
      this.menuAngle += dt * 0.1
      let fx, fy, fz, r, h
      if (this.screen === 'garage' || !this.world.landmarks.length) {
        fx = p.x; fy = p.y + 0.6; fz = p.z; r = 9; h = 3.2
      } else {
        // Cinematic tour: slowly orbit each landmark in turn.
        const lms = this.world.landmarks
        const idx = Math.floor(this.menuAngle / 1.2) % lms.length
        const lm = lms[idx]
        const top = lm.beacon.userData.baseY - 8
        fx = lm.x; fz = lm.z; fy = top * 0.45
        r = lm.half * 1.2 + top * 0.5 + 16
        h = Math.max(top * 0.55 + 10, 34, this.city.heights[1] * 0.9 + 12)
        if (idx !== this.menuIdx) {
          this.menuIdx = idx
          const a = this.menuAngle * 2.2
          cam.position.set(fx + Math.sin(a) * r, h, fz + Math.cos(a) * r)
          this.menuLook = new THREE.Vector3(fx, fy, fz)
        }
      }
      const a = this.menuAngle * (this.screen === 'garage' ? 1.2 : 2.2)
      const tx = fx + Math.sin(a) * r
      const tz = fz + Math.cos(a) * r
      cam.position.x = damp(cam.position.x, tx, 2, dt)
      cam.position.y = damp(cam.position.y, (this.screen === 'garage' ? p.y : 0) + h, 2, dt)
      cam.position.z = damp(cam.position.z, tz, 2, dt)
      this.menuLook = this.menuLook ?? new THREE.Vector3(fx, fy, fz)
      this.menuLook.x = damp(this.menuLook.x, fx, 3, dt)
      this.menuLook.y = damp(this.menuLook.y, fy, 3, dt)
      this.menuLook.z = damp(this.menuLook.z, fz, 3, dt)
      cam.lookAt(this.menuLook)
      cam.fov = damp(cam.fov, 55, 3, dt)
      cam.updateProjectionMatrix()
      return
    }
    const h = car.heading
    let dh = h - (this.camHeading ?? h)
    dh = Math.atan2(Math.sin(dh), Math.cos(dh))
    const reversing = car.speed < -2
    if (!reversing) this.camHeading = (this.camHeading ?? h) + dh * Math.min(1, dt * 4)
    const ch = this.camHeading
    const [dist, height] = [[10.5, 4.6], [6.5, 2.8], [26, 20]][this.camMode]
    const tx = p.x - Math.sin(ch) * dist
    const tz = p.z - Math.cos(ch) * dist
    const ty = Math.max(p.y + height, 1.4)
    const k = this.camMode === 2 ? 4 : 7
    cam.position.x = damp(cam.position.x, tx, k, dt)
    cam.position.y = damp(cam.position.y, ty, k, dt)
    cam.position.z = damp(cam.position.z, tz, k, dt)
    if (this.shake > 0) {
      cam.position.x += (Math.random() - 0.5) * this.shake
      cam.position.y += (Math.random() - 0.5) * this.shake
      this.shake = Math.max(0, this.shake - dt * 2.5)
    }
    cam.lookAt(p.x + Math.sin(ch) * 4, p.y + 1.2, p.z + Math.cos(ch) * 4)
    const fov = 60 + Math.min(Math.abs(car.speed), 45) * 0.32 + (car.nitroActive ? 9 : 0)
    cam.fov = damp(cam.fov, fov, 4, dt)
    cam.updateProjectionMatrix()
  }

  // ---------------- HUD ----------------
  updateHUD() {
    const car = this.car
    $('#speedVal').textContent = Math.round(Math.abs(car.speed) * 3.6)
    $('#speedUnit').textContent = t('speed')
    $('#nitroFill').style.transform = `scaleX(${car.nitro})`
    $('#coinCount').textContent = this.save.coins
    const lms = this.world.landmarks
    $('#lmCount').textContent = `${lms.filter((l) => l.discovered).length}/${lms.length}`
    const near = this.nearest
    $('#hudNearby').textContent = near && !this.race ? `${t('nearby', { name: tl(near.lm.def.name) })} · ${Math.round(near.d)} m` : ''
    this.drawMinimap()
  }

  drawMinimapBase() {
    const size = 512
    const c = document.createElement('canvas')
    c.width = c.height = size
    const g = c.getContext('2d')
    const ext = HALF + 60
    const s = size / (ext * 2)
    const X = (x) => (x + ext) * s
    g.fillStyle = this.city.ground
    g.fillRect(0, 0, size, size)
    if (this.city.sea) {
      g.fillStyle = this.city.seaColor
      const edge = HALF + ROAD / 2 + 26
      if (this.city.sea === 'north') g.fillRect(0, 0, size, X(-edge))
      else g.fillRect(0, X(edge), size, size)
    }
    g.fillStyle = '#3c3f47'
    g.fillRect(X(-HALF - ROAD / 2), X(-HALF - ROAD / 2), (GRID * CELL + ROAD) * s, (GRID * CELL + ROAD) * s)
    g.fillStyle = '#a9a294'
    for (let cx = 0; cx < GRID; cx++) for (let cz = 0; cz < GRID; cz++) g.fillRect(X(blockCenter(cx) - BLOCK / 2), X(blockCenter(cz) - BLOCK / 2), BLOCK * s, BLOCK * s)
    g.fillStyle = '#e9c46a'
    for (const lm of this.world.landmarks) g.fillRect(X(lm.x - lm.half), X(lm.z - lm.half), lm.half * 2 * s, lm.half * 2 * s)
    this.mmBase = c
    this.mmExt = ext
  }

  drawMinimap() {
    const cv = $('#minimap')
    const g = cv.getContext('2d')
    const W = cv.width
    const p = this.car.position
    const h = this.car.heading
    const scale = W / 300
    const cos = Math.cos(h)
    const sin = Math.sin(h)
    g.setTransform(1, 0, 0, 1, 0, 0)
    g.clearRect(0, 0, W, W)
    g.save()
    g.beginPath()
    g.arc(W / 2, W / 2, W / 2, 0, Math.PI * 2)
    g.clip()
    const a = -cos * scale
    const c = sin * scale
    const b = -sin * scale
    const d = -cos * scale
    g.setTransform(a, b, c, d, W / 2 - (a * p.x + c * p.z), W / 2 - (b * p.x + d * p.z))
    const ext = this.mmExt
    g.drawImage(this.mmBase, -ext, -ext, ext * 2, ext * 2)
    g.setTransform(1, 0, 0, 1, 0, 0)
    const toMap = (x, z) => {
      const dx = x - p.x
      const dz = z - p.z
      return [W / 2 + (a * dx + c * dz), W / 2 + (b * dx + d * dz)]
    }
    const clampR = ([x, y]) => {
      const dx = x - W / 2
      const dy = y - W / 2
      const r = Math.hypot(dx, dy)
      const max = W / 2 - 10
      return r > max ? [W / 2 + (dx / r) * max, W / 2 + (dy / r) * max] : [x, y]
    }
    for (const lm of this.world.landmarks) {
      const [x, y] = clampR(toMap(lm.x, lm.z))
      g.fillStyle = lm.discovered ? '#2ec27e' : '#ffd166'
      g.strokeStyle = '#1a1205'
      g.lineWidth = 2
      g.beginPath()
      g.arc(x, y, 7, 0, Math.PI * 2)
      g.fill()
      g.stroke()
    }
    if (this.race && this.race.started) {
      const cp = this.world.checkpoints[this.race.i]
      const [x, y] = clampR(toMap(cp.x, cp.z))
      g.fillStyle = '#36e0ff'
      g.beginPath()
      g.arc(x, y, 8, 0, Math.PI * 2)
      g.fill()
    }
    g.restore()
    g.fillStyle = '#ff3b30'
    g.strokeStyle = '#fff'
    g.lineWidth = 2
    g.beginPath()
    g.moveTo(W / 2, W / 2 - 11)
    g.lineTo(W / 2 + 8, W / 2 + 9)
    g.lineTo(W / 2, W / 2 + 4)
    g.lineTo(W / 2 - 8, W / 2 + 9)
    g.closePath()
    g.fill()
    g.stroke()
  }

  toast(msg) {
    const el = document.createElement('div')
    el.className = 'toast'
    el.textContent = msg
    $('#toasts').appendChild(el)
    setTimeout(() => el.remove(), 2500)
  }

  // ---------------- flow ----------------
  play() {
    this.mode = 'play'
    this.screen = null
    $('#menu').classList.add('hidden')
    $('#hud').classList.remove('hidden')
    this.controls.enabled = true
    this.controls.resetTouch()
    Ads.hideBanner()
    if (this.save.firstRun) {
      this.save.firstRun = false
      Save.save()
    }
    this.toast(t('welcome', { city: tl(this.city.name) }))
  }

  pause() {
    if (this.mode !== 'play') return
    this.mode = 'pause'
    this.controls.resetTouch()
    this.audio.hornStop()
    Save.save()
    this.showPause()
  }

  resume() {
    this.mode = 'play'
    $('#menu').classList.add('hidden')
    this.controls.resetTouch()
  }

  toMenu(screenFn) {
    this.cancelRace(true)
    this.mode = 'menu'
    $('#hud').classList.add('hidden')
    this.arrow.visible = false
    Save.save()
    Ads.maybeInterstitial().then(() => Ads.showBanner())
    screenFn.call(this)
  }

  // ---------------- menu screens ----------------
  setMenu(html, dim = false) {
    const m = $('#menu')
    m.innerHTML = html
    m.classList.remove('hidden')
    m.classList.toggle('dim', dim)
    m.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => this.audio.click()))
    return m
  }

  coinsBadge() {
    return `<div class="coins-badge"><span class="coin-ico"></span>${this.save.coins}</div>`
  }

  showTitle() {
    this.mode = 'menu'
    this.screen = 'title'
    $('#hud').classList.add('hidden')
    const flags = CITIES.map((c) => c.flag).filter((f, i, a) => a.indexOf(f) === i).join('')
    const m = this.setMenu(`
      <div class="title-top">${this.coinsBadge()}</div>
      <div class="screen title-screen">
        <div class="logo-title">CityCars</div>
        <div class="logo-sub">${t('worldTour')}</div>
        <div class="tagline">${t('tagline')}</div>
        <div class="title-flags">${flags}</div>
        <div class="title-buttons">
          <button class="btn play" id="mPlay">▶ ${t('play')}</button>
        </div>
        <div class="title-buttons">
          <button class="btn secondary" id="mCities">🌍 ${t('chooseCity')}</button>
          <button class="btn secondary" id="mGarage">🚗 ${t('garage')}</button>
          <button class="btn ghost" id="mSettings">⚙️ ${t('settings')}</button>
        </div>
      </div>`)
    m.querySelector('#mPlay').onclick = () => this.play()
    m.querySelector('#mCities').onclick = () => this.showCities()
    m.querySelector('#mGarage').onclick = () => this.showGarage()
    m.querySelector('#mSettings').onclick = () => this.showSettings()
    const daily = Save.dailyAvailable()
    if (daily) setTimeout(() => this.screen === 'title' && this.showDaily(daily), 700)
  }

  showDaily(info) {
    const m = this.setMenu(`
      <div class="screen panel modal">
        <div class="big">🎁</div>
        <h2>${t('dailyTitle')}</h2>
        <div class="muted">${t('dailyText', { d: info.streak })}</div>
        <div class="coins-badge" style="font-size:26px"><span class="coin-ico"></span>+${info.amount}</div>
        <div class="row"><button class="btn green" id="dClaim">${t('claim')}</button></div>
      </div>`, true)
    m.querySelector('#dClaim').onclick = () => {
      Save.claimDaily(info)
      this.audio.buy()
      this.showTitle()
    }
  }

  showCities() {
    this.screen = 'cities'
    const cards = CITIES.map((c) => {
      const unlocked = this.save.unlocked.includes(c.id)
      const stars = Save.cityStars(c.id, c.landmarks.length)
      const found = (this.save.discovered[c.id] ?? []).length
      const starHtml = [0, 1, 2].map((i) => (i < stars ? '★' : '<span class="off">★</span>')).join('')
      return `<button class="card ${unlocked ? '' : 'locked'} ${this.city.id === c.id ? 'current' : ''}" data-id="${c.id}">
        <div class="bg" style="background:linear-gradient(160deg, ${c.sky[0]}, ${c.sky[1]})"></div>
        <div class="flag">${c.flag}</div>
        <div class="cname">${tl(c.name)}</div>
        <div class="meta">📍 ${found}/${c.landmarks.length} ${t('landmarks')}</div>
        <div class="stars">${starHtml}</div>
        ${unlocked ? '' : `<div class="lock">🔒 <span class="coin-ico"></span>${c.price}</div>`}
      </button>`
    }).join('')
    const m = this.setMenu(`
      <div class="screen">
        <div class="screen-head">
          <button class="btn ghost small" id="cBack">← ${t('back')}</button>
          <h2>${t('chooseCity')}</h2>
          <button class="btn green small" id="cFree">🎬 ${t('freeCoins', { n: FREE_COINS })}</button>
          ${this.coinsBadge()}
        </div>
        <div class="grid">${cards}</div>
      </div>`, true)
    m.querySelector('#cBack').onclick = () => this.showTitle()
    m.querySelector('#cFree').onclick = () => this.watchForCoins(() => this.showCities())
    m.querySelectorAll('.card').forEach((el) => {
      el.onclick = async () => {
        const c = cityById(el.dataset.id)
        if (!this.save.unlocked.includes(c.id)) {
          if (Save.spend(c.price)) {
            this.save.unlocked.push(c.id)
            Save.save()
            this.audio.buy()
            this.toast(t('unlocked', { city: tl(c.name) }))
          } else {
            this.audio.error()
            this.toast(t('notEnough'))
            return
          }
        }
        if (c.id !== this.city.id) await this.loadCity(c.id)
        this.showCityIntro()
      }
    })
  }

  showCityIntro() {
    const c = this.city
    const id = c.id
    const lmCount = c.landmarks.length
    const found = (this.save.discovered[id] ?? []).length
    const best = this.save.bestRace[id]
    const medal = this.save.medals[id]
    const check = (ok) => (ok ? '✅' : '⬜')
    const m = this.setMenu(`
      <div class="screen panel modal">
        <div class="big">${c.flag}</div>
        <h2>${tl(c.name)}</h2>
        <div class="missions">
          <b>${t('missions')}</b>
          <div>${check(found >= lmCount)} ${t('mLandmarks')} (${found}/${lmCount})</div>
          <div>${check((this.save.bestCoins[id] ?? 0) >= 40)} ${t('mCoins', { n: 40 })} (${this.save.bestCoins[id] ?? 0})</div>
          <div>${check(medal === 'gold')} ${t('mRace')} ${best ? `(${t('best')}: ${formatTime(best)})` : ''}</div>
        </div>
        <div class="row">
          <button class="btn ghost" id="iBack">← ${t('cityMenu')}</button>
          <button class="btn play" id="iPlay">▶ ${t('play')}</button>
        </div>
      </div>`, true)
    m.querySelector('#iBack').onclick = () => this.showCities()
    m.querySelector('#iPlay').onclick = () => this.play()
  }

  showGarage() {
    this.screen = 'garage'
    const max = { top: 48, engine: 2300, grip: 4.6 }
    const cards = CARS.filter((c) => c.price >= 0).map((c) => {
      const owned = this.save.cars.includes(c.id)
      const sel = this.save.car === c.id
      const bar = (v) => `<div class="bar"><i style="width:${Math.round(v * 100)}%"></i></div>`
      return `<button class="card car-card ${sel ? 'current' : ''}" data-id="${c.id}">
        <div class="swatch" style="background:linear-gradient(135deg, ${c.color}, ${c.accent ?? c.color})">🚗</div>
        <div class="cname">${tl(c.name)}</div>
        <div class="stat">${t('speedStat')} ${bar(c.top / max.top)}</div>
        <div class="stat">${t('accelStat')} ${bar(c.engine / max.engine)}</div>
        <div class="stat">${t('gripStat')} ${bar(c.grip / max.grip)}</div>
        <div class="meta">${sel ? '✔ ' + t('selected') : owned ? t('owned') : `<span class="coin-ico" style="display:inline-block;width:14px;height:14px;vertical-align:-2px"></span> ${c.price}`}</div>
      </button>`
    }).join('')
    const m = this.setMenu(`
      <div class="screen">
        <div class="screen-head">
          <button class="btn ghost small" id="gBack">← ${t('back')}</button>
          <h2>${t('garage')}</h2>
          <button class="btn green small" id="gFree">🎬 ${t('freeCoins', { n: FREE_COINS })}</button>
          ${this.coinsBadge()}
        </div>
        <div class="grid" style="margin-top:auto;max-height:46vh">${cards}</div>
      </div>`)
    m.querySelector('#gBack').onclick = () => this.showTitle()
    m.querySelector('#gFree').onclick = () => this.watchForCoins(() => this.showGarage())
    m.querySelectorAll('.card').forEach((el) => {
      el.onclick = () => {
        const c = CARS.find((x) => x.id === el.dataset.id)
        if (!this.save.cars.includes(c.id)) {
          if (!Save.spend(c.price)) {
            this.audio.error()
            this.toast(t('notEnough'))
            return
          }
          this.save.cars.push(c.id)
          this.audio.buy()
        }
        this.save.car = c.id
        Save.save()
        const pos = this.car.position.clone()
        const h = this.car.heading
        this.spawnCar()
        this.car.reset(pos.x, pos.z, h)
        this.showGarage()
      }
    })
  }

  async watchForCoins(after) {
    const ok = await Ads.showRewarded()
    if (ok) {
      this.addCoins(FREE_COINS, true)
      this.audio.buy()
      this.toast(`+${FREE_COINS} 🪙`)
    } else this.toast(t('adUnavailable'))
    after()
  }

  showSettings(from = 'title') {
    this.screen = 'settings'
    const st = this.save.settings
    const seg = (name, opts, cur) => `<div class="seg" data-name="${name}">${opts.map(([v, label]) => `<button data-v="${v}" class="${String(cur) === String(v) ? 'on' : ''}">${label}</button>`).join('')}</div>`
    const m = this.setMenu(`
      <div class="screen">
        <div class="screen-head">
          <button class="btn ghost small" id="sBack">← ${t('back')}</button>
          <h2>${t('settings')}</h2>
        </div>
        <div class="panel settings">
          <div class="setting"><label>🎵 ${t('music')}</label><input type="range" min="0" max="1" step="0.05" value="${st.music}" id="sMusic"></div>
          <div class="setting"><label>🔊 ${t('sfx')}</label><input type="range" min="0" max="1" step="0.05" value="${st.sfx}" id="sSfx"></div>
          <div class="setting"><label>✨ ${t('quality')}</label>${seg('quality', [['low', t('low')], ['medium', t('medium')], ['high', t('high')]], this.quality)}</div>
          <div class="setting"><label>☀️ ${t('lighting')}</label>${seg('lighting', [['day', t('lightDay')], ['mood', t('lightMood')]], st.lighting ?? 'day')}</div>
          <div class="setting"><label>📳 ${t('vibration')}</label>${seg('vibration', [[true, t('on')], [false, t('off')]], st.vibration)}</div>
          <div class="setting"><label>🌐 ${t('language')}</label>${seg('lang', LANGUAGES, getLanguage())}</div>
          <div class="setting"><label>🔒 ${t('privacy')}</label><a href="${PRIVACY_URL}" target="_blank" rel="noopener">${PRIVACY_URL.replace('https://', '')}</a></div>
          <div class="setting"><label>📜 ${t('credits')}</label><button class="btn ghost small" id="sCredits">${t('credits')}</button></div>
        </div>
      </div>`, true)
    m.querySelector('#sBack').onclick = () => (from === 'pause' ? this.showPause() : this.showTitle())
    m.querySelector('#sCredits').onclick = () => this.showCredits(from)
    m.querySelector('#sMusic').oninput = (e) => {
      st.music = +e.target.value
      this.audio.setVolumes(st.music, st.sfx)
      Save.save()
    }
    m.querySelector('#sSfx').oninput = (e) => {
      st.sfx = +e.target.value
      this.audio.setVolumes(st.music, st.sfx)
      Save.save()
    }
    m.querySelectorAll('.seg button').forEach((b) => {
      b.onclick = () => {
        const name = b.parentElement.dataset.name
        const v = b.dataset.v
        if (name === 'quality') {
          st.quality = v
          if (v !== this.quality) {
            this.quality = v
            this.applyQuality()
            this.loadCity(this.city.id)
          }
        } else if (name === 'lighting') {
          if ((st.lighting ?? 'day') !== v) {
            st.lighting = v
            Save.save()
            this.loadCity(this.city.id)
          }
        } else if (name === 'vibration') st.vibration = v === 'true'
        else if (name === 'lang') {
          st.lang = v
          setLanguage(v)
          $('#keysHint').textContent = t('keysHint')
        }
        Save.save()
        this.showSettings(from)
      }
    })
  }

  showCredits(from) {
    const rows = MODEL_CREDITS.map((c) => `<div>“${c.title}” — ${c.author} · <a href="${c.url}" target="_blank" rel="noopener">Sketchfab</a></div>`).join('')
    const m = this.setMenu(`
      <div class="screen">
        <div class="screen-head">
          <button class="btn ghost small" id="crBack">← ${t('back')}</button>
          <h2>📜 ${t('credits')}</h2>
        </div>
        <div class="panel credits">
          <p>3D models licensed under <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener">CC BY 4.0</a> (optimised for mobile):</p>
          ${rows}
          <p>three.js · cannon-es · Capacitor · Fredoka (OFL). Everything else — cities, cars, sounds and music — is generated by the game.</p>
        </div>
      </div>`, true)
    m.querySelector('#crBack').onclick = () => this.showSettings(from)
  }

  showPause() {
    this.screen = 'pause'
    const m = this.setMenu(`
      <div class="screen panel modal">
        <h2>⏸ ${t('paused')}</h2>
        <div class="row" style="flex-direction:column;width:100%">
          <button class="btn green" id="pResume">▶ ${t('resume')}</button>
          <button class="btn secondary" id="pRace">🏁 ${this.race ? t('cancelRace') : t('startRace')}</button>
          <button class="btn ghost" id="pReset">↺ ${t('reset')}</button>
          <button class="btn ghost" id="pSettings">⚙️ ${t('settings')}</button>
          <button class="btn ghost" id="pCities">🌍 ${t('cityMenu')}</button>
          <button class="btn ghost" id="pMenu">🏠 ${t('menu')}</button>
        </div>
      </div>`, true)
    m.querySelector('#pResume').onclick = () => this.resume()
    m.querySelector('#pRace').onclick = () => {
      this.resume()
      if (this.race) this.cancelRace()
      else this.startRace()
    }
    m.querySelector('#pReset').onclick = () => {
      this.resume()
      this.resetCar()
    }
    m.querySelector('#pSettings').onclick = () => this.showSettings('pause')
    m.querySelector('#pCities').onclick = () => this.toMenu(this.showCities)
    m.querySelector('#pMenu').onclick = () => this.toMenu(this.showTitle)
  }

  showRaceResult({ time, medal, reward, best }) {
    const icon = { gold: '🥇', silver: '🥈', bronze: '🥉', none: '🏁' }[medal]
    const label = { gold: t('gold'), silver: t('silver'), bronze: t('bronze'), none: t('noMedal') }[medal]
    const m = this.setMenu(`
      <div class="screen panel modal">
        <div class="big">${icon}</div>
        <h2>${t('finished')} ${label}</h2>
        <div>${t('time')}: <b>${formatTime(time)}</b> · ${t('best')}: <b>${formatTime(best)}</b></div>
        <div class="coins-badge" style="font-size:24px"><span class="coin-ico"></span>+${reward}</div>
        <div class="row">
          <button class="btn green" id="rDouble">🎬 ${t('doubleReward')}</button>
          <button class="btn" id="rContinue">${t('continue')}</button>
        </div>
      </div>`, true)
    m.querySelector('#rDouble').onclick = async (e) => {
      e.target.disabled = true
      const ok = await Ads.showRewarded()
      if (ok) {
        this.addCoins(reward, true)
        this.audio.buy()
        this.toast(`+${reward} 🪙`)
      } else this.toast(t('adUnavailable'))
      this.resume()
    }
    m.querySelector('#rContinue').onclick = () => this.resume()
  }
}

const tmpV = new THREE.Vector3()

const game = new Game()
window.__game = game
game.start()
