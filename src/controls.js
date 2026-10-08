// Keyboard, touch and gamepad input merged into one analog state.

export class Controls {
  constructor() {
    this.keys = new Set()
    this.touch = { steer: 0, throttle: 0, brake: 0, nitro: false, horn: false, handbrake: false }
    this.state = { throttle: 0, brake: 0, steer: 0, nitro: false, handbrake: false, horn: false }
    this.handlers = {}
    this.enabled = true
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return
      this.keys.add(e.code)
      if (e.code === 'KeyR') this.emit('reset')
      if (e.code === 'Escape' || e.code === 'KeyP') this.emit('pause')
      if (e.code === 'KeyC') this.emit('camera')
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault()
    })
    window.addEventListener('keyup', (e) => this.keys.delete(e.code))
    window.addEventListener('blur', () => this.keys.clear())
  }

  on(name, fn) {
    this.handlers[name] = fn
  }

  emit(name) {
    if (this.enabled) this.handlers[name]?.()
  }

  // Wire the on-screen touch controls.
  bindTouch(root) {
    const pad = root.querySelector('#steerPad')
    const knob = root.querySelector('#steerKnob')
    let padId = null
    let startX = 0
    const padMove = (x) => {
      const dx = Math.max(-1, Math.min(1, (x - startX) / 55))
      this.touch.steer = Math.abs(dx) < 0.08 ? 0 : dx
      knob.style.transform = `translateX(${dx * 46}px)`
    }
    pad.addEventListener('pointerdown', (e) => {
      padId = e.pointerId
      const r = pad.getBoundingClientRect()
      startX = r.left + r.width / 2
      pad.setPointerCapture(e.pointerId)
      padMove(e.clientX)
      e.preventDefault()
    })
    pad.addEventListener('pointermove', (e) => {
      if (e.pointerId === padId) padMove(e.clientX)
    })
    const padUp = (e) => {
      if (e.pointerId !== padId) return
      padId = null
      this.touch.steer = 0
      knob.style.transform = 'translateX(0)'
    }
    pad.addEventListener('pointerup', padUp)
    pad.addEventListener('pointercancel', padUp)

    const hold = (id, on, off) => {
      const el = root.querySelector(id)
      if (!el) return
      el.addEventListener('pointerdown', (e) => {
        el.setPointerCapture(e.pointerId)
        el.classList.add('down')
        on()
        e.preventDefault()
      })
      const up = () => {
        el.classList.remove('down')
        off()
      }
      el.addEventListener('pointerup', up)
      el.addEventListener('pointercancel', up)
      el.addEventListener('lostpointercapture', up)
    }
    hold('#btnGas', () => (this.touch.throttle = 1), () => (this.touch.throttle = 0))
    hold('#btnBrake', () => (this.touch.brake = 1), () => (this.touch.brake = 0))
    hold('#btnNitro', () => (this.touch.nitro = true), () => (this.touch.nitro = false))
    hold('#btnHorn', () => (this.touch.horn = true), () => (this.touch.horn = false))
    hold('#btnDrift', () => (this.touch.handbrake = true), () => (this.touch.handbrake = false))
  }

  resetTouch() {
    Object.assign(this.touch, { steer: 0, throttle: 0, brake: 0, nitro: false, horn: false, handbrake: false })
  }

  update() {
    const k = this.keys
    const s = this.state
    let steer = 0
    if (k.has('ArrowLeft') || k.has('KeyA') || k.has('KeyQ')) steer -= 1
    if (k.has('ArrowRight') || k.has('KeyD')) steer += 1
    let throttle = k.has('ArrowUp') || k.has('KeyW') || k.has('KeyZ') ? 1 : 0
    let brake = k.has('ArrowDown') || k.has('KeyS') ? 1 : 0
    let nitro = k.has('ShiftLeft') || k.has('ShiftRight')
    let handbrake = k.has('Space')
    let horn = k.has('KeyH')

    const pads = navigator.getGamepads ? navigator.getGamepads() : []
    for (const gp of pads) {
      if (!gp) continue
      const ax = gp.axes[0] ?? 0
      if (Math.abs(ax) > 0.12) steer += ax
      if (gp.buttons[14]?.pressed) steer -= 1
      if (gp.buttons[15]?.pressed) steer += 1
      throttle = Math.max(throttle, gp.buttons[7]?.value ?? 0, gp.buttons[0]?.pressed ? 1 : 0)
      brake = Math.max(brake, gp.buttons[6]?.value ?? 0, gp.buttons[1]?.pressed ? 1 : 0)
      nitro ||= !!gp.buttons[5]?.pressed || !!gp.buttons[2]?.pressed
      handbrake ||= !!gp.buttons[4]?.pressed
      horn ||= !!gp.buttons[3]?.pressed
      if (gp.buttons[9]?.pressed && !this.gpStart) this.emit('pause')
      this.gpStart = gp.buttons[9]?.pressed
    }

    const t = this.touch
    s.steer = Math.max(-1, Math.min(1, steer + t.steer))
    s.throttle = Math.max(throttle, t.throttle)
    s.brake = Math.max(brake, t.brake)
    s.nitro = nitro || t.nitro
    s.handbrake = handbrake || t.handbrake
    s.horn = horn || t.horn
    if (!this.enabled) Object.assign(s, { steer: 0, throttle: 0, brake: 0, nitro: false, handbrake: false, horn: false })
    return s
  }
}
