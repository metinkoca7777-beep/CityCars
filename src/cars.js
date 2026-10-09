// Toy-style car models (visual) and the player vehicle (physics).
import * as THREE from 'three'
import * as CANNON from 'cannon-es'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { mat, mergeStatic } from './materials.js'
import { clamp, damp } from './utils.js'

// stats: top speed (m/s), engine force, grip (tyre friction), steering angle
export const CARS = [
  { id: 'mini', name: { en: 'Mini Bean', tr: 'Mini Fasulye' }, price: 0, color: '#e63946', style: 'hatch', top: 27, engine: 1050, grip: 3.4, steer: 0.55 },
  { id: 'taxi', name: { en: 'City Taxi', tr: 'Taksi' }, price: 600, color: '#f7c600', style: 'sedan', top: 30, engine: 1150, grip: 3.5, steer: 0.52, sign: true },
  { id: 'bubble', name: { en: 'Bubble', tr: 'Baloncuk' }, price: 900, color: '#2ec4b6', style: 'round', top: 29, engine: 1200, grip: 3.8, steer: 0.58 },
  { id: 'classic', name: { en: 'Retro 70', tr: 'Retro 70' }, price: 1500, color: '#f1f1e6', accent: '#2b6cb0', style: 'sedan', top: 32, engine: 1250, grip: 3.3, steer: 0.5, stripe: true },
  { id: 'jeep', name: { en: 'Safari Jeep', tr: 'Safari Cip' }, price: 2200, color: '#5a7d3a', style: 'jeep', top: 31, engine: 1450, grip: 4.4, steer: 0.5, awd: true },
  { id: 'police', name: { en: 'Police', tr: 'Polis' }, price: 3000, color: '#1d3f8f', accent: '#ffffff', style: 'sedan', top: 36, engine: 1550, grip: 3.9, steer: 0.52, siren: true },
  { id: 'icecream', name: { en: 'Ice Cream Van', tr: 'Dondurma Arabası' }, price: 4000, color: '#ff8fc8', accent: '#ffffff', style: 'van', top: 30, engine: 1500, grip: 3.6, steer: 0.48, icecream: true },
  { id: 'sports', name: { en: 'Rocket GT', tr: 'Roket GT' }, price: 6000, color: '#ff7a1a', style: 'sports', top: 42, engine: 1900, grip: 4.2, steer: 0.5, spoiler: true },
  { id: 'super', name: { en: 'Neon Hyper', tr: 'Neon Hiper' }, price: 10000, color: '#7b2ff7', accent: '#00e5ff', style: 'super', top: 48, engine: 2300, grip: 4.6, steer: 0.48, spoiler: true, glow: true },
  { id: 'bus', name: { en: 'Double Decker', tr: 'Çift Katlı' }, price: -1, color: '#d6221f', style: 'bus', top: 20, engine: 1200, grip: 3, steer: 0.4 },
]

const SHAPES = {
  hatch: { body: [1.8, 0.75, 3.4], cabin: [1.6, 0.65, 1.9], cabinZ: -0.25, wheelR: 0.42, wheelX: 0.86, wheelZ: 1.12, rideY: 0.32 },
  sedan: { body: [1.9, 0.68, 4.2], cabin: [1.66, 0.62, 2.1], cabinZ: -0.2, wheelR: 0.42, wheelX: 0.9, wheelZ: 1.35, rideY: 0.3 },
  round: { body: [1.85, 1.0, 3.3], cabin: [1.55, 0.7, 1.7], cabinZ: -0.15, wheelR: 0.42, wheelX: 0.88, wheelZ: 1.1, rideY: 0.3, radius: 0.48 },
  jeep: { body: [2.0, 0.95, 3.8], cabin: [1.9, 0.8, 1.9], cabinZ: -0.4, wheelR: 0.58, wheelX: 1.0, wheelZ: 1.25, rideY: 0.45 },
  van: { body: [2.0, 1.9, 4.4], cabin: [1.9, 0.01, 0.01], cabinZ: 0, wheelR: 0.45, wheelX: 0.92, wheelZ: 1.45, rideY: 0.3 },
  sports: { body: [1.95, 0.55, 4.4], cabin: [1.5, 0.5, 1.8], cabinZ: -0.3, wheelR: 0.44, wheelX: 0.92, wheelZ: 1.42, rideY: 0.22 },
  super: { body: [2.0, 0.5, 4.5], cabin: [1.45, 0.45, 1.6], cabinZ: -0.1, wheelR: 0.45, wheelX: 0.95, wheelZ: 1.5, rideY: 0.2 },
  bus: { body: [2.5, 3.6, 9.6], cabin: [0.01, 0.01, 0.01], cabinZ: 0, wheelR: 0.6, wheelX: 1.1, wheelZ: 3.4, rideY: 0.35 },
}

const geoCache = new Map()
function rbox(w, h, d, r) {
  const key = `${w}|${h}|${d}|${r}`
  if (!geoCache.has(key)) geoCache.set(key, new RoundedBoxGeometry(w, h, d, 3, r))
  return geoCache.get(key)
}

// Builds a car whose origin sits on the ground under the car centre; +z is the front.
export function buildCarMesh(def, merged = false) {
  const s = SHAPES[def.style] ?? SHAPES.hatch
  const group = new THREE.Group()
  const body = new THREE.Group()
  group.add(body)
  const paint = mat(def.color, { rough: 0.35, metal: 0.25, flat: false })
  const glass = mat('#1b2a3a', { rough: 0.1, metal: 0.6, flat: false })
  const dark = mat('#2a2a2e', { flat: false })
  const [bw, bh, bl] = s.body
  const baseY = s.wheelR + s.rideY
  const add = (geo, m, x, y, z, parent = body) => {
    const mesh = new THREE.Mesh(geo, m)
    mesh.position.set(x, y, z)
    mesh.castShadow = true
    mesh.receiveShadow = true
    parent.add(mesh)
    return mesh
  }
  add(rbox(bw, bh, bl, s.radius ?? 0.22), paint, 0, baseY + bh / 2, 0)
  const [cw, ch, cl] = s.cabin
  if (ch > 0.05) {
    add(rbox(cw, ch, cl, 0.2), glass, 0, baseY + bh + ch / 2 - 0.05, s.cabinZ)
    add(rbox(cw * 0.96, 0.12, cl * 0.9, 0.05), def.accent && def.style !== 'sedan' ? mat(def.accent, { flat: false }) : paint, 0, baseY + bh + ch - 0.04, s.cabinZ)
  }
  // Bumpers
  add(rbox(bw * 0.96, 0.25, 0.3, 0.1), dark, 0, baseY + 0.12, bl / 2)
  add(rbox(bw * 0.96, 0.25, 0.3, 0.1), dark, 0, baseY + 0.12, -bl / 2)
  // Lights
  const head = mat('#fffbe8', { emissive: '#fff6d0', ei: 1.6 })
  const tail = new THREE.MeshStandardMaterial({ color: '#ff2a2a', emissive: '#ff1a1a', emissiveIntensity: 0.6 })
  for (const sx of [-1, 1]) {
    add(new THREE.BoxGeometry(0.42, 0.2, 0.08), head, sx * (bw / 2 - 0.32), baseY + bh * 0.62, bl / 2 + 0.01)
    add(new THREE.BoxGeometry(0.42, 0.18, 0.08), tail, sx * (bw / 2 - 0.32), baseY + bh * 0.62, -bl / 2 - 0.01)
  }
  // Style extras
  if (def.sign) {
    add(new THREE.BoxGeometry(0.8, 0.28, 0.35), mat('#ffffff', { emissive: '#fff3a0', ei: 1.2 }), 0, baseY + bh + ch + 0.12, s.cabinZ)
  }
  if (def.stripe) {
    add(new THREE.BoxGeometry(0.4, 0.02, bl * 1.01), mat(def.accent), 0, baseY + bh + 0.005, 0)
  }
  let siren
  if (def.siren) {
    add(new THREE.BoxGeometry(bw * 1.005, 0.3, 1.6), mat(def.accent), 0, baseY + bh * 0.45, 0.2)
    const red = new THREE.MeshStandardMaterial({ color: '#ff2020', emissive: '#ff0000', emissiveIntensity: 2 })
    const blue = new THREE.MeshStandardMaterial({ color: '#2050ff', emissive: '#0040ff', emissiveIntensity: 2 })
    add(new THREE.BoxGeometry(0.5, 0.2, 0.3), red, -0.3, baseY + bh + ch + 0.08, s.cabinZ)
    add(new THREE.BoxGeometry(0.5, 0.2, 0.3), blue, 0.3, baseY + bh + ch + 0.08, s.cabinZ)
    siren = { red, blue }
  }
  if (def.icecream) {
    add(new THREE.BoxGeometry(bw * 1.005, 0.35, bl * 1.005), mat(def.accent), 0, baseY + 0.55, 0)
    add(new THREE.ConeGeometry(0.45, 1.3, 10).rotateX(Math.PI), mat('#d9a35a'), 0, baseY + bh + 0.65, -0.6)
    add(new THREE.SphereGeometry(0.55, 12, 10), mat('#fff3e8', { flat: false }), 0, baseY + bh + 1.45, -0.6)
    add(new THREE.SphereGeometry(0.42, 12, 10), mat('#ff6fae', { flat: false }), 0, baseY + bh + 1.9, -0.6)
    add(new THREE.SphereGeometry(0.12, 8, 6), mat('#e63946', { flat: false }), 0, baseY + bh + 2.35, -0.6)
    add(new THREE.BoxGeometry(0.05, 0.9, 1.6), glass, bw / 2 + 0.01, baseY + bh * 0.62, 0.2)
    add(new THREE.BoxGeometry(bw * 0.9, 0.7, 0.05), glass, 0, baseY + bh * 0.68, bl / 2 + 0.01)
  }
  if (def.style === 'van' && !def.icecream) add(new THREE.BoxGeometry(bw * 0.9, 0.7, 0.05), glass, 0, baseY + bh * 0.68, bl / 2 + 0.01)
  if (def.spoiler) {
    add(new THREE.BoxGeometry(bw * 0.95, 0.08, 0.5), mat('#1a1a1a'), 0, baseY + bh + 0.42, -bl / 2 + 0.3)
    for (const sx of [-0.6, 0.6]) add(new THREE.BoxGeometry(0.08, 0.36, 0.3), mat('#1a1a1a'), sx, baseY + bh + 0.2, -bl / 2 + 0.3)
  }
  if (def.glow) {
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(bw + 0.8, bl + 0.8), new THREE.MeshBasicMaterial({ color: def.accent, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false }))
    glow.rotation.x = -Math.PI / 2
    glow.position.y = 0.05
    body.add(glow)
    add(new THREE.BoxGeometry(bw * 1.01, 0.06, bl * 0.8), mat(def.accent, { emissive: def.accent, ei: 2 }), 0, baseY + bh * 0.4, 0)
  }
  if (def.style === 'jeep') {
    add(new THREE.CylinderGeometry(0.5, 0.5, 0.3, 14).rotateX(Math.PI / 2), dark, 0, baseY + bh * 0.7, -bl / 2 - 0.2)
    add(new THREE.BoxGeometry(bw * 1.02, 0.1, 0.1), mat('#333'), 0, baseY + bh + 0.85, s.cabinZ + cl / 2)
  }
  if (def.style === 'bus') {
    const win = mat('#20303f', { emissive: '#ffe2a0', ei: 0.6, night: true })
    for (const sx of [-1, 1]) for (const y of [1.2, 2.6]) add(new THREE.BoxGeometry(0.05, 0.75, bl * 0.86), win, sx * (bw / 2 + 0.01), baseY + y, 0.1)
    add(new THREE.BoxGeometry(bw * 0.9, 0.9, 0.05), win, 0, baseY + 2.6, bl / 2 + 0.01)
    add(new THREE.BoxGeometry(bw * 0.9, 0.9, 0.05), win, 0, baseY + 1.2, bl / 2 + 0.01)
  }

  // Wheels
  const wheels = []
  const tyreGeo = new THREE.CylinderGeometry(s.wheelR, s.wheelR, 0.38, 16).rotateZ(Math.PI / 2)
  const hubGeo = new THREE.CylinderGeometry(s.wheelR * 0.55, s.wheelR * 0.55, 0.4, 10).rotateZ(Math.PI / 2)
  const tyreMat = mat('#1d1d20', { rough: 0.9 })
  const hubMat = mat(def.accent ?? '#d9d9d9', { metal: 0.6, rough: 0.3 })
  for (const [sx, sz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
    const w = new THREE.Group()
    const spin = new THREE.Group()
    w.add(spin)
    add(tyreGeo, tyreMat, 0, 0, 0, spin)
    add(hubGeo, hubMat, 0, 0, 0, spin)
    add(new THREE.BoxGeometry(0.42, s.wheelR * 0.25, 0.1), tyreMat, 0, 0, 0, spin)
    w.position.set(sx * s.wheelX, s.wheelR, sz * s.wheelZ)
    group.add(w)
    wheels.push({ group: w, spin })
  }
  let roll = 0
  if (merged) mergeStatic(group, { castShadow: true, receiveShadow: false })
  return {
    group,
    body,
    wheels,
    shape: s,
    tail,
    head,
    siren,
    spinWheels(dist) {
      roll += dist / s.wheelR
      for (const w of wheels) w.spin.rotation.x = roll
    },
  }
}

// ---------------- player vehicle ----------------
const downforceV = new CANNON.Vec3()

export class PlayerCar {
  constructor(def, scene, physics) {
    this.def = def
    this.scene = scene
    this.physics = physics
    this.visual = buildCarMesh(def)
    const s = this.visual.shape
    this.shape = s
    const [bw, bh, bl] = s.body
    const halfH = Math.min(bh, 1.2) / 2 + 0.15
    const chassis = new CANNON.Body({ mass: def.style === 'bus' ? 400 : 150, linearDamping: 0.04, angularDamping: 0.45 })
    chassis.addShape(new CANNON.Box(new CANNON.Vec3(bw / 2, halfH, bl / 2)), new CANNON.Vec3(0, 0.15, 0))
    chassis.allowSleep = false
    this.chassis = chassis
    this.connY = -0.1
    this.restLen = 0.32
    // Distance from ground to chassis centre at rest; used to align the visual body.
    this.visualOffset = s.wheelR + 0.22 - this.connY
    const vehicle = new CANNON.RaycastVehicle({ chassisBody: chassis, indexRightAxis: 0, indexUpAxis: 1, indexForwardAxis: 2 })
    const opt = {
      radius: s.wheelR,
      directionLocal: new CANNON.Vec3(0, -1, 0),
      suspensionStiffness: 42,
      suspensionRestLength: this.restLen,
      frictionSlip: def.grip,
      dampingRelaxation: 2.6,
      dampingCompression: 4.4,
      maxSuspensionForce: 1e5,
      rollInfluence: 0.03,
      axleLocal: new CANNON.Vec3(-1, 0, 0),
      chassisConnectionPointLocal: new CANNON.Vec3(),
      maxSuspensionTravel: 0.3,
      customSlidingRotationalSpeed: -30,
      useCustomSlidingRotationalSpeed: true,
    }
    for (const [sx, sz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
      opt.chassisConnectionPointLocal.set(sx * s.wheelX, this.connY, sz * s.wheelZ)
      vehicle.addWheel(opt)
    }
    vehicle.addToWorld(physics)
    this.vehicle = vehicle
    scene.add(this.visual.group)
    for (const w of this.visual.wheels) scene.add(w.group)
    this.visual.body.position.y = -this.visualOffset
    this.steer = 0
    this.nitro = 1
    this.nitroActive = false
    this.speed = 0
    this.flipTime = 0
    this.input = { throttle: 0, brake: 0, steer: 0, nitro: false, handbrake: false }
    this.skidding = [false, false, false, false]
    this.braking = false
    this.headlights = null
  }

  addHeadlights() {
    const light = new THREE.SpotLight('#fff1d0', 60, 70, 0.6, 0.5, 1.2)
    light.position.set(0, 1.2 - this.visualOffset, this.shape.body[2] / 2)
    light.target.position.set(0, -2, 30)
    this.visual.group.add(light, light.target)
    this.headlights = light
  }

  reset(x, z, heading) {
    const c = this.chassis
    c.position.set(x, this.visualOffset + 0.6, z)
    c.quaternion.setFromEuler(0, heading, 0)
    c.velocity.set(0, 0, 0)
    c.angularVelocity.set(0, 0, 0)
    this.steer = 0
    this.flipTime = 0
  }

  get position() {
    return this.chassis.position
  }

  get heading() {
    const q = this.chassis.quaternion
    const fx = 2 * (q.x * q.z + q.w * q.y)
    const fz = 1 - 2 * (q.x * q.x + q.y * q.y)
    return Math.atan2(fx, fz)
  }

  update(dt) {
    const def = this.def
    const v = this.vehicle
    const inp = this.input
    const speed = v.currentVehicleSpeedKmHour / 3.6
    this.speed = speed
    const top = def.top * (this.nitroActive ? 1.25 : 1)

    // Nitro
    this.nitroActive = inp.nitro && this.nitro > 0.02 && inp.throttle > 0
    if (this.nitroActive) this.nitro = Math.max(0, this.nitro - dt * 0.32)
    else this.nitro = Math.min(1, this.nitro + dt * 0.07)

    let engine = 0
    let brake = 0
    if (inp.throttle > 0) {
      if (speed < -1) brake = 8 * inp.throttle
      else engine = speed < top ? -inp.throttle * def.engine * (this.nitroActive ? 1.8 : 1) * (1 - Math.max(0, speed / top) * 0.35) : 0
    }
    if (inp.brake > 0) {
      if (speed > 1) brake = 9 * inp.brake
      else engine = speed > -10 ? inp.brake * def.engine * 0.7 : 0
    }
    if (inp.throttle === 0 && inp.brake === 0) brake = 0.35
    this.braking = inp.brake > 0 && speed > 1
    const drive = def.awd ? [0, 1, 2, 3] : [2, 3]
    for (let i = 0; i < 4; i++) {
      v.applyEngineForce(drive.includes(i) ? (def.awd ? engine / 2 : engine) : 0, i)
      v.setBrake(brake, i)
    }
    if (inp.handbrake) {
      v.setBrake(6, 2)
      v.setBrake(6, 3)
    }
    const rearGrip = inp.handbrake ? def.grip * 0.45 : def.grip
    v.wheelInfos[2].frictionSlip = v.wheelInfos[3].frictionSlip = rearGrip

    // Steering: less lock at speed, smooth return.
    const spdF = clamp(Math.abs(speed) / def.top, 0, 1)
    const target = -inp.steer * def.steer * (1 - spdF * 0.6)
    this.steer = damp(this.steer, target, inp.steer === 0 ? 10 : 7, dt)
    v.setSteeringValue(this.steer, 0)
    v.setSteeringValue(this.steer, 1)

    // Downforce + air stabilisation
    const c = this.chassis
    const grounded = v.wheelInfos.some((w) => w.isInContact)
    this.grounded = grounded
    // Applied before every physics sub-step by applyForces() (cannon clears forces after each step).
    this.downforce = grounded ? -Math.min(speed * speed, 1600) * 1.2 : 0
    if (!grounded) {
      c.angularVelocity.x *= 1 - dt * 1.5
      c.angularVelocity.z *= 1 - dt * 1.5
    }
    // Auto-recover when flipped
    const q = c.quaternion
    const upY = 1 - 2 * (q.x * q.x + q.z * q.z)
    if (upY < 0.35 && Math.abs(speed) < 3) this.flipTime += dt
    else this.flipTime = 0
    this.flipped = this.flipTime > 1.6

    for (let i = 0; i < 4; i++) this.skidding[i] = v.wheelInfos[i].isInContact && v.wheelInfos[i].skidInfo < 0.6 && Math.abs(speed) > 4
    if (inp.handbrake && Math.abs(speed) > 6) this.skidding[2] = this.skidding[3] = v.wheelInfos[2].isInContact
  }

  applyForces() {
    if (this.downforce) this.chassis.applyForce(downforceV.set(0, this.downforce, 0))
  }

  // Called after the physics step to sync visuals.
  sync(t) {
    const g = this.visual.group
    g.position.copy(this.chassis.position)
    g.quaternion.copy(this.chassis.quaternion)
    const v = this.vehicle
    // updateWheelTransform() clears isInContact as a side effect; keep the physics result.
    const contact = v.wheelInfos.map((w) => w.isInContact)
    for (let i = 0; i < 4; i++) {
      v.updateWheelTransform(i)
      v.wheelInfos[i].isInContact = contact[i]
      const tr = v.wheelInfos[i].worldTransform
      const w = this.visual.wheels[i]
      w.group.position.copy(tr.position)
      w.group.quaternion.copy(tr.quaternion)
    }
    this.visual.tail.emissiveIntensity = this.braking ? 3 : 0.6
    if (this.visual.siren) {
      const on = Math.floor(t * 6) % 2 === 0
      this.visual.siren.red.emissiveIntensity = on ? 3 : 0.2
      this.visual.siren.blue.emissiveIntensity = on ? 0.2 : 3
    }
  }

  // World position of exhaust / rear wheels for effects.
  rearPoint(side, out) {
    const s = this.shape
    out.set(side * s.wheelX, -this.visualOffset + 0.05, -s.wheelZ)
    return this.visual.group.localToWorld(out)
  }

  exhaustPoint(out) {
    out.set(0.45, -this.visualOffset + this.shape.wheelR + 0.3, -this.shape.body[2] / 2 - 0.2)
    return this.visual.group.localToWorld(out)
  }

  dispose() {
    this.vehicle.removeFromWorld(this.physics)
    this.scene.remove(this.visual.group)
    for (const w of this.visual.wheels) this.scene.remove(w.group)
  }
}
