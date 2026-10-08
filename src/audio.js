// Fully synthesized audio: engine, tyres, horn, impacts, pickups, ambience and
// generative per-city music. No audio files needed (keeps the APK tiny).

const SCALES = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  hicaz: [0, 1, 4, 5, 7, 8, 10],
  doubleHarm: [0, 1, 4, 5, 7, 8, 11],
  harmMinor: [0, 2, 3, 5, 7, 8, 11],
  japIn: [0, 1, 5, 7, 8],
  majPent: [0, 2, 4, 7, 9],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  mixo: [0, 2, 4, 5, 7, 9, 10],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
}

// Drum patterns: one char per step. Letters map to drum voices.
// K kick, S snare, h hat, C clap, D dum, t tek, U surdo, m tamborim, R ride, T taiko, g tabla low, n tabla high, '.' rest
const STYLES = {
  turkish: { scale: 'hicaz', root: 62, meter: 4, lead: 'pluck', drums: ['D..tD.t.D..tt.t.'], drone: true, swing: 0 },
  french: { scale: 'major', root: 65, meter: 3, lead: 'accordion', drums: ['K...h...h...'], chords: [0, 4, 3, 4], oompah: true },
  british: { scale: 'major', root: 67, meter: 4, lead: 'brass', drums: ['K.h.S.h.K.h.S.hh'], chords: [0, 3, 4, 0] },
  jazz: { scale: 'dorian', root: 60, meter: 4, lead: 'piano', drums: ['R..RR..RR..RR..R'], chords: [0, 3, 6, 2], walking: true, swing: 0.33 },
  italian: { scale: 'major', root: 64, meter: 3, lead: 'mandolin', drums: ['K..h..S..h..'], chords: [0, 4, 0, 4] },
  greek: { scale: 'harmMinor', root: 64, meter: 4, lead: 'mandolin', drums: ['K.h.S.h.K.h.S.h.'], chords: [0, 3, 4, 0] },
  japanese: { scale: 'japIn', root: 64, meter: 4, lead: 'koto', drums: ['T.......t...T.t.'], drone: true },
  arabic: { scale: 'hicaz', root: 62, meter: 4, lead: 'pluck', drums: ['D.t..tD.D.t..t..'], drone: true },
  egypt: { scale: 'doubleHarm', root: 62, meter: 4, lead: 'ney', drums: ['D.t..tD.D.t..t..'], drone: true },
  samba: { scale: 'major', root: 67, meter: 4, lead: 'marimba', drums: ['U.mmU.m.U.mmUmm.', 'U.mmU.m.U.mmUmmm'], chords: [0, 3, 1, 4] },
  aussie: { scale: 'majPent', root: 62, meter: 4, lead: 'marimba', drums: ['K..C..K.K..C..h.'], drone: true, didge: true },
  spanish: { scale: 'phrygian', root: 64, meter: 4, lead: 'guitar', drums: ['C..C..C.C.C.C...'], chords: [0, 6, 5, 1] },
  indian: { scale: 'doubleHarm', root: 61, meter: 4, lead: 'sitar', drums: ['g.n.gn.ng.n.gnnn'], drone: true },
  california: { scale: 'mixo', root: 64, meter: 4, lead: 'surf', drums: ['K.h.S.h.KKh.S.h.'], chords: [0, 6, 3, 0] },
  techno: { scale: 'minor', root: 57, meter: 4, lead: 'synth', drums: ['K.h.K.h.K.h.K.hh', 'K.h.KSh.K.h.KShh'], chords: [0, 5, 3, 4], arp: true },
  dutch: { scale: 'major', root: 65, meter: 4, lead: 'organ', drums: ['K.h.K.h.K.h.K.h.'], chords: [0, 4, 0, 3], oompah: true },
}

const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12)

export class AudioEngine {
  constructor() {
    this.ctx = null
    this.musicVol = 0.5
    this.sfxVol = 0.8
    this.style = null
    this.enabled = true
  }

  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume()
      return
    }
    const AC = window.AudioContext || window.webkitAudioContext
    if (!AC) return
    const ctx = new AC()
    this.ctx = ctx
    const comp = ctx.createDynamicsCompressor()
    comp.threshold.value = -14
    comp.ratio.value = 4
    comp.connect(ctx.destination)
    this.master = ctx.createGain()
    this.master.connect(comp)
    this.musicBus = ctx.createGain()
    this.sfxBus = ctx.createGain()
    this.musicBus.connect(this.master)
    this.sfxBus.connect(this.master)
    // Simple feedback delay as a "space" reverb for music.
    this.delay = ctx.createDelay(1)
    this.delay.delayTime.value = 0.28
    const fb = ctx.createGain()
    fb.gain.value = 0.28
    const dl = ctx.createBiquadFilter()
    dl.type = 'lowpass'
    dl.frequency.value = 2400
    this.delay.connect(dl)
    dl.connect(fb)
    fb.connect(this.delay)
    dl.connect(this.musicBus)
    this.musicIn = ctx.createGain()
    this.musicIn.connect(this.musicBus)
    this.musicIn.connect(this.delay)
    this.setVolumes(this.musicVol, this.sfxVol)

    const len = ctx.sampleRate * 2
    const buf = ctx.createBuffer(1, len, ctx.sampleRate)
    const d = buf.getChannelData(0)
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1
    this.noiseBuf = buf
    const bbuf = ctx.createBuffer(1, len, ctx.sampleRate)
    const bd = bbuf.getChannelData(0)
    let last = 0
    for (let i = 0; i < len; i++) {
      last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02
      bd[i] = last * 3.5
    }
    this.brownBuf = bbuf
    this.buildEngine()
    this.buildAmbience()
    document.addEventListener('visibilitychange', () => {
      if (!this.ctx) return
      if (document.hidden) this.ctx.suspend()
      else if (this.enabled) this.ctx.resume()
    })
  }

  setVolumes(music, sfx) {
    this.musicVol = music
    this.sfxVol = sfx
    if (!this.ctx) return
    const t = this.ctx.currentTime
    this.musicBus.gain.setTargetAtTime(music * 0.55, t, 0.05)
    this.sfxBus.gain.setTargetAtTime(sfx, t, 0.05)
  }

  pause(p) {
    if (!this.ctx) return
    this.enabled = !p
    if (p) this.ctx.suspend()
    else this.ctx.resume()
  }

  noise(brown = false) {
    const src = this.ctx.createBufferSource()
    src.buffer = brown ? this.brownBuf : this.noiseBuf
    src.loop = true
    return src
  }

  // ---------- engine / tyres / nitro ----------
  buildEngine() {
    const ctx = this.ctx
    this.engGain = ctx.createGain()
    this.engGain.gain.value = 0
    this.engFilter = ctx.createBiquadFilter()
    this.engFilter.type = 'lowpass'
    this.engFilter.frequency.value = 600
    this.engFilter.Q.value = 2
    this.osc1 = ctx.createOscillator()
    this.osc1.type = 'sawtooth'
    this.osc2 = ctx.createOscillator()
    this.osc2.type = 'square'
    const g2 = ctx.createGain()
    g2.gain.value = 0.5
    this.osc1.connect(this.engFilter)
    this.osc2.connect(g2)
    g2.connect(this.engFilter)
    this.engFilter.connect(this.engGain)
    this.engGain.connect(this.sfxBus)
    this.osc1.start()
    this.osc2.start()

    const sk = this.noise()
    const bp = ctx.createBiquadFilter()
    bp.type = 'bandpass'
    bp.frequency.value = 1100
    bp.Q.value = 2.5
    this.skidGain = ctx.createGain()
    this.skidGain.gain.value = 0
    sk.connect(bp)
    bp.connect(this.skidGain)
    this.skidGain.connect(this.sfxBus)
    sk.start()

    const nz = this.noise()
    const hp = ctx.createBiquadFilter()
    hp.type = 'bandpass'
    hp.frequency.value = 700
    hp.Q.value = 0.7
    this.nitroGain = ctx.createGain()
    this.nitroGain.gain.value = 0
    nz.connect(hp)
    hp.connect(this.nitroGain)
    this.nitroGain.connect(this.sfxBus)
    nz.start()

    const wind = this.noise(true)
    const lp = ctx.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.value = 500
    this.windGain = ctx.createGain()
    this.windGain.gain.value = 0
    wind.connect(lp)
    lp.connect(this.windGain)
    this.windGain.connect(this.sfxBus)
    wind.start()
    this.gear = 1
  }

  updateEngine(speed, top, throttle, nitro, skid, running = true) {
    if (!this.ctx) return
    const t = this.ctx.currentTime
    const s = Math.min(Math.abs(speed) / top, 1.2)
    const gears = 5
    const gearPos = s * gears
    const frac = gearPos - Math.floor(gearPos)
    const rpm = Math.floor(gearPos) === 0 ? 0.2 + frac * 0.8 : 0.42 + frac * 0.58
    const f = 38 + rpm * 95 + (nitro ? 18 : 0)
    this.osc1.frequency.setTargetAtTime(f, t, 0.04)
    this.osc2.frequency.setTargetAtTime(f * 0.5, t, 0.04)
    this.engFilter.frequency.setTargetAtTime(300 + rpm * (throttle > 0 ? 2200 : 900), t, 0.05)
    this.engGain.gain.setTargetAtTime(running ? 0.09 + throttle * 0.08 + rpm * 0.04 : 0, t, 0.08)
    this.skidGain.gain.setTargetAtTime(running ? Math.min(skid, 1) * 0.22 : 0, t, 0.05)
    this.nitroGain.gain.setTargetAtTime(running && nitro ? 0.28 : 0, t, 0.08)
    this.windGain.gain.setTargetAtTime(running ? s * s * 0.25 : 0, t, 0.2)
  }

  // ---------- one-shots ----------
  env(gainNode, t, a, peak, dec) {
    gainNode.gain.setValueAtTime(0.0001, t)
    gainNode.gain.exponentialRampToValueAtTime(peak, t + a)
    gainNode.gain.exponentialRampToValueAtTime(0.0001, t + a + dec)
  }

  tone(freq, dur, type = 'sine', vol = 0.3, delay = 0, out = this.sfxBus, slideTo) {
    if (!this.ctx) return
    const ctx = this.ctx
    const t = ctx.currentTime + delay
    const o = ctx.createOscillator()
    o.type = type
    o.frequency.setValueAtTime(freq, t)
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur)
    const g = ctx.createGain()
    this.env(g, t, 0.005, vol, dur)
    o.connect(g)
    g.connect(out)
    o.start(t)
    o.stop(t + dur + 0.05)
  }

  noiseHit(dur, freq, vol, delay = 0, type = 'lowpass', q = 1, out = this.sfxBus) {
    if (!this.ctx) return
    const ctx = this.ctx
    const t = ctx.currentTime + delay
    const src = ctx.createBufferSource()
    src.buffer = this.noiseBuf
    src.playbackRate.value = 0.8 + Math.random() * 0.4
    const f = ctx.createBiquadFilter()
    f.type = type
    f.frequency.value = freq
    f.Q.value = q
    const g = ctx.createGain()
    this.env(g, t, 0.003, vol, dur)
    src.connect(f)
    f.connect(g)
    g.connect(out)
    src.start(t, Math.random())
    src.stop(t + dur + 0.05)
  }

  coin() {
    this.tone(988, 0.08, 'square', 0.08)
    this.tone(1319, 0.3, 'square', 0.08, 0.07)
  }

  crash(intensity = 1) {
    const v = Math.min(1, intensity)
    this.noiseHit(0.25 + v * 0.3, 900 + v * 1500, 0.25 + v * 0.35)
    this.tone(90, 0.25, 'sine', 0.4 * v, 0, this.sfxBus, 40)
    if (v > 0.5) this.noiseHit(0.4, 5000, 0.08 * v, 0.03, 'highpass')
  }

  thump(v = 0.5) {
    this.tone(160 + Math.random() * 80, 0.12, 'triangle', 0.25 * v, 0, this.sfxBus, 70)
    this.noiseHit(0.08, 1800, 0.12 * v, 0, 'bandpass', 2)
  }

  hornStart() {
    if (!this.ctx || this.hornNodes) return
    const ctx = this.ctx
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, ctx.currentTime)
    g.gain.exponentialRampToValueAtTime(0.12, ctx.currentTime + 0.02)
    const f = ctx.createBiquadFilter()
    f.type = 'lowpass'
    f.frequency.value = 2000
    const os = [370, 466].map((fr) => {
      const o = ctx.createOscillator()
      o.type = 'square'
      o.frequency.value = fr
      o.connect(f)
      o.start()
      return o
    })
    f.connect(g)
    g.connect(this.sfxBus)
    this.hornNodes = { g, os }
  }

  hornStop() {
    if (!this.hornNodes) return
    const { g, os } = this.hornNodes
    const t = this.ctx.currentTime
    g.gain.setTargetAtTime(0.0001, t, 0.03)
    os.forEach((o) => o.stop(t + 0.2))
    this.hornNodes = null
  }

  discover() {
    const notes = [72, 76, 79, 84, 88]
    notes.forEach((n, i) => this.tone(mtof(n), 0.5, 'triangle', 0.13, i * 0.09))
    notes.forEach((n, i) => this.tone(mtof(n + 12), 0.3, 'sine', 0.05, 0.45 + i * 0.05))
    this.noiseHit(0.8, 8000, 0.05, 0.4, 'highpass')
  }

  checkpoint() {
    this.tone(880, 0.12, 'triangle', 0.15)
    this.tone(1320, 0.25, 'triangle', 0.15, 0.1)
  }

  countdown(final) {
    this.tone(final ? 880 : 440, final ? 0.6 : 0.25, 'square', 0.1)
  }

  finish() {
    const seq = [67, 72, 76, 79, 76, 79, 84]
    seq.forEach((n, i) => this.tone(mtof(n), i === seq.length - 1 ? 0.9 : 0.16, 'square', 0.08, i * 0.13))
    seq.forEach((n, i) => this.tone(mtof(n - 12), 0.2, 'triangle', 0.1, i * 0.13))
  }

  click() {
    this.tone(660, 0.05, 'triangle', 0.1)
  }

  buy() {
    ;[64, 67, 72, 76].forEach((n, i) => this.tone(mtof(n), 0.2, 'triangle', 0.12, i * 0.06))
  }

  error() {
    this.tone(220, 0.15, 'square', 0.08)
    this.tone(180, 0.25, 'square', 0.08, 0.12)
  }

  // ---------- ambience ----------
  buildAmbience() {
    const ctx = this.ctx
    const src = this.noise(true)
    const f = ctx.createBiquadFilter()
    f.type = 'lowpass'
    f.frequency.value = 350
    this.ambGain = ctx.createGain()
    this.ambGain.gain.value = 0
    src.connect(f)
    f.connect(this.ambGain)
    this.ambGain.connect(this.sfxBus)
    src.start()
    this.nextChirp = 0
  }

  setAmbience(city) {
    this.ambCity = city
    if (!this.ctx) return
    this.ambGain.gain.setTargetAtTime(city ? 0.09 : 0, this.ctx.currentTime, 0.5)
  }

  tickAmbience() {
    if (!this.ctx || !this.ambCity) return
    const t = this.ctx.currentTime
    if (t < this.nextChirp) return
    const city = this.ambCity
    this.nextChirp = t + 1.5 + Math.random() * 4
    if (city.time === 'night') {
      for (let i = 0; i < 3; i++) this.tone(4200 + Math.random() * 300, 0.04, 'sine', 0.015, i * 0.09)
    } else if (city.sea && Math.random() < 0.5) {
      // Seagull: falling then rising squeal
      this.tone(1500, 0.18, 'sawtooth', 0.02, 0, this.sfxBus, 900)
      this.tone(1300, 0.22, 'sawtooth', 0.018, 0.22, this.sfxBus, 1700)
    } else {
      const base = 2500 + Math.random() * 1500
      for (let i = 0; i < 2 + Math.floor(Math.random() * 3); i++) this.tone(base, 0.07, 'sine', 0.02, i * 0.11, this.sfxBus, base * 1.3)
    }
  }

  // ---------- generative music ----------
  playMusic(styleName, tempo) {
    if (!this.ctx) return
    const style = STYLES[styleName] ?? STYLES.british
    this.stopMusic()
    this.style = { ...style, tempo: tempo ?? 110 }
    this.scale = SCALES[style.scale]
    this.step = 0
    this.bar = 0
    this.nextTime = this.ctx.currentTime + 0.2
    this.makeMotifs()
    this.timer = setInterval(() => this.schedule(), 30)
  }

  stopMusic() {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
  }

  makeMotifs() {
    const steps = this.style.meter * 4
    const mk = () => {
      const notes = []
      let deg = 4 + Math.floor(Math.random() * 3)
      for (let b = 0; b < 2; b++) {
        for (let s = 0; s < steps; s += 2) {
          const strong = s % 4 === 0
          const play = strong ? Math.random() < 0.85 : Math.random() < 0.45
          if (!play) { notes.push(null); continue }
          deg += Math.round((Math.random() - 0.5) * 3.2)
          deg = Math.max(0, Math.min(this.scale.length * 2, deg))
          const len = strong && Math.random() < 0.35 ? 4 : 2
          notes.push({ deg, len })
        }
      }
      return notes
    }
    this.motifs = [mk(), mk()]
  }

  degToMidi(deg, octave = 0) {
    const sc = this.scale
    const o = Math.floor(deg / sc.length)
    const i = ((deg % sc.length) + sc.length) % sc.length
    return this.style.root + sc[i] + 12 * (o + octave)
  }

  schedule() {
    const ctx = this.ctx
    const st = this.style
    const stepDur = 60 / st.tempo / 4
    while (this.nextTime < ctx.currentTime + 0.12) {
      const steps = st.meter * 4
      const s = this.step % steps
      let t = this.nextTime
      if (st.swing && s % 2 === 1) t += stepDur * st.swing
      this.playStep(t, s, steps, stepDur)
      this.step++
      if (this.step % steps === 0) {
        this.bar++
        if (this.bar % 16 === 0) this.makeMotifs()
      }
      this.nextTime += stepDur
    }
  }

  playStep(t, s, steps, stepDur) {
    const st = this.style
    const out = this.musicIn
    // Drums
    const pats = st.drums
    const pat = pats[this.bar % pats.length]
    const ch = pat[s % pat.length]
    if (ch && ch !== '.') this.drum(ch, t, out)
    // Harmony
    const chordDeg = st.chords ? st.chords[Math.floor(this.bar / 2) % st.chords.length] : 0
    const beat = stepDur * 4
    if (s === 0) {
      if (st.drone) {
        this.voice(t, mtof(st.root - 24), beat * st.meter, 'drone', 0.09, out)
        this.voice(t, mtof(st.root - 17), beat * st.meter, 'drone', 0.05, out)
      }
      if (st.didge) this.voice(t, mtof(st.root - 26), beat * st.meter, 'didge', 0.12, out)
    }
    if (st.chords) {
      const root = this.degToMidi(chordDeg, -2)
      if (st.oompah) {
        if (s === 0) this.voice(t, mtof(root), beat * 0.9, 'bass', 0.16, out)
        else if (s % 4 === 0) [2, 4].forEach((d) => this.voice(t, mtof(this.degToMidi(chordDeg + d, -1)), beat * 0.5, 'pad', 0.05, out))
      } else if (st.walking) {
        if (s % 4 === 0) this.voice(t, mtof(this.degToMidi(chordDeg + [0, 2, 4, 5][s / 4], -2)), beat * 0.9, 'bass', 0.16, out)
      } else if (st.arp) {
        if (s % 2 === 0) this.voice(t, mtof(this.degToMidi(chordDeg + [0, 2, 4, 7][(s / 2) % 4], -1)), stepDur * 1.6, 'synth', 0.05, out)
        if (s % 4 === 0) this.voice(t, mtof(root), beat * 0.4, 'bass', 0.14, out)
      } else {
        if (s === 0 || s === steps / 2 + 2) this.voice(t, mtof(root), beat * 1.2, 'bass', 0.15, out)
        if (s === 0) [0, 2, 4].forEach((d) => this.voice(t, mtof(this.degToMidi(chordDeg + d, -1)), beat * st.meter, 'pad', 0.025, out))
      }
    }
    // Melody: phrase structure A A B A
    if (s % 2 === 0) {
      const phrase = [0, 0, 1, 0][Math.floor(this.bar / 2) % 4]
      const motif = this.motifs[phrase]
      const idx = (this.bar % 2) * (steps / 2) + s / 2
      const n = motif[idx]
      if (n) {
        const midi = this.degToMidi(n.deg + (st.chords ? 0 : 0), 0)
        this.voice(t, mtof(midi), stepDur * n.len, st.lead, 0.1, out)
      }
    }
  }

  voice(t, freq, dur, inst, vol, out) {
    const ctx = this.ctx
    const g = ctx.createGain()
    const f = ctx.createBiquadFilter()
    f.type = 'lowpass'
    const oscs = []
    const add = (type, mult = 1, detune = 0, gain = 1) => {
      const o = ctx.createOscillator()
      o.type = type
      o.frequency.value = freq * mult
      o.detune.value = detune
      if (gain !== 1) {
        const og = ctx.createGain()
        og.gain.value = gain
        o.connect(og)
        og.connect(f)
      } else o.connect(f)
      oscs.push(o)
      return o
    }
    let attack = 0.005
    let decay = dur
    let sustain = false
    let fFreq = 3000
    let vib = 0
    switch (inst) {
      case 'pluck':
      case 'guitar':
        add('sawtooth', 1, 0, 0.5)
        add('triangle', 1, 4)
        fFreq = 2400
        decay = Math.max(0.35, dur * 1.2)
        f.frequency.setValueAtTime(fFreq, t)
        f.frequency.exponentialRampToValueAtTime(500, t + decay)
        break
      case 'mandolin':
        add('sawtooth', 1, 0, 0.6)
        add('triangle', 2, 0, 0.3)
        fFreq = 3200
        decay = Math.max(0.25, dur)
        vib = 0
        break
      case 'accordion':
        add('sawtooth', 1, -8, 0.6)
        add('sawtooth', 1, 8, 0.6)
        add('square', 0.5, 0, 0.3)
        attack = 0.04
        sustain = true
        fFreq = 1800
        vib = 6
        break
      case 'brass':
        add('sawtooth', 1, 0, 0.7)
        add('square', 1, 5, 0.3)
        attack = 0.03
        sustain = true
        fFreq = 1600
        break
      case 'piano':
        add('triangle', 1)
        add('sine', 2, 0, 0.3)
        decay = Math.max(0.6, dur * 1.5)
        fFreq = 3500
        break
      case 'koto':
        add('triangle', 1)
        add('sawtooth', 1, 0, 0.15)
        decay = Math.max(0.6, dur * 1.6)
        fFreq = 2600
        break
      case 'marimba':
        add('sine', 1)
        add('sine', 4, 0, 0.12)
        decay = 0.35
        break
      case 'ney':
        add('sine', 1)
        add('triangle', 2, 0, 0.15)
        attack = 0.08
        sustain = true
        vib = 5
        fFreq = 2000
        break
      case 'sitar':
        add('sawtooth', 1, 0, 0.6)
        add('sawtooth', 2, 3, 0.2)
        f.type = 'bandpass'
        f.Q.value = 6
        decay = Math.max(0.6, dur * 1.4)
        f.frequency.setValueAtTime(freq * 3, t)
        f.frequency.exponentialRampToValueAtTime(freq * 6, t + 0.2)
        fFreq = 0
        break
      case 'surf':
        add('square', 1, 0, 0.5)
        add('sawtooth', 1, 7, 0.4)
        decay = Math.max(0.3, dur)
        fFreq = 2200
        break
      case 'synth':
        add('sawtooth', 1, -6)
        add('sawtooth', 1, 6)
        f.Q.value = 6
        decay = Math.max(0.2, dur)
        f.frequency.setValueAtTime(2600, t)
        f.frequency.exponentialRampToValueAtTime(400, t + decay)
        fFreq = 0
        break
      case 'organ':
        add('square', 1, 0, 0.4)
        add('sine', 2, 0, 0.6)
        add('sine', 0.5, 0, 0.4)
        sustain = true
        fFreq = 2400
        break
      case 'bass':
        add('triangle', 1)
        add('sine', 0.5, 0, 0.6)
        decay = dur
        fFreq = 600
        break
      case 'pad':
        add('triangle', 1, -5)
        add('sine', 1, 5)
        attack = 0.15
        sustain = true
        fFreq = 1400
        break
      case 'drone':
        add('sawtooth', 1, 0, 0.5)
        add('sine', 1)
        attack = 0.4
        sustain = true
        fFreq = 500
        break
      case 'didge':
        add('sawtooth', 1)
        f.Q.value = 8
        attack = 0.3
        sustain = true
        f.frequency.setValueAtTime(200, t)
        for (let i = 0; i < dur * 2; i++) f.frequency.linearRampToValueAtTime(i % 2 ? 180 : 520, t + i * 0.5 + 0.25)
        fFreq = 0
        break
      default:
        add('triangle', 1)
    }
    if (fFreq) f.frequency.value = fFreq
    if (vib) {
      const lfo = ctx.createOscillator()
      lfo.frequency.value = vib
      const lg = ctx.createGain()
      lg.gain.value = 8
      lfo.connect(lg)
      oscs.forEach((o) => lg.connect(o.detune))
      lfo.start(t)
      lfo.stop(t + dur + 0.6)
    }
    f.connect(g)
    g.connect(out)
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(vol, t + attack)
    let end
    if (sustain) {
      g.gain.setValueAtTime(vol, t + Math.max(attack, dur - 0.05))
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.25)
      end = t + dur + 0.3
    } else {
      g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay)
      end = t + attack + decay + 0.05
    }
    oscs.forEach((o) => {
      o.start(t)
      o.stop(end)
    })
  }

  drum(ch, t, out) {
    const ctx = this.ctx
    const osc = (f0, f1, dur, vol, type = 'sine') => {
      const o = ctx.createOscillator()
      o.type = type
      o.frequency.setValueAtTime(f0, t)
      o.frequency.exponentialRampToValueAtTime(f1, t + dur)
      const g = ctx.createGain()
      g.gain.setValueAtTime(vol, t)
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
      o.connect(g)
      g.connect(out)
      o.start(t)
      o.stop(t + dur + 0.02)
    }
    const nz = (dur, freq, vol, type = 'highpass', q = 1) => {
      const src = ctx.createBufferSource()
      src.buffer = this.noiseBuf
      const f = ctx.createBiquadFilter()
      f.type = type
      f.frequency.value = freq
      f.Q.value = q
      const g = ctx.createGain()
      g.gain.setValueAtTime(vol, t)
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
      src.connect(f)
      f.connect(g)
      g.connect(out)
      src.start(t, Math.random())
      src.stop(t + dur + 0.02)
    }
    switch (ch) {
      case 'K': osc(140, 45, 0.28, 0.5); break
      case 'S': nz(0.14, 1500, 0.18); osc(200, 140, 0.08, 0.12, 'triangle'); break
      case 'h': nz(0.035, 7500, 0.06); break
      case 'C': nz(0.02, 1300, 0.15, 'bandpass', 2); nz(0.12, 1200, 0.12, 'bandpass', 2); break
      case 'D': osc(120, 70, 0.25, 0.35); nz(0.05, 900, 0.05, 'bandpass'); break
      case 't': nz(0.05, 3200, 0.1, 'bandpass', 3); osc(700, 500, 0.05, 0.05, 'triangle'); break
      case 'U': osc(80, 55, 0.45, 0.4); break
      case 'm': nz(0.03, 4500, 0.07, 'bandpass', 2); break
      case 'R': nz(0.25, 6000, 0.04); break
      case 'T': osc(90, 48, 0.6, 0.5); nz(0.2, 400, 0.08, 'lowpass'); break
      case 'g': osc(220, 140, 0.35, 0.25); break
      case 'n': osc(820, 760, 0.14, 0.1, 'triangle'); break
    }
  }
}
