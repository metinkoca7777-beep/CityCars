// Procedural low-poly models of famous landmarks. Every builder draws around a local
// origin (plaza centre, ground at y = 0) and registers simple colliders for physics.
import * as THREE from 'three'
import { mat, facadeMat, boxUV, mergeStatic } from './materials.js'
import { mulberry32 } from './utils.js'

const PI = Math.PI
const UP = new THREE.Vector3(0, 0, 1)

export class Kit {
  constructor() {
    this.group = new THREE.Group()
    this.colliders = []
    this.updates = []
    this.parent = this.group
  }

  m(c, o) {
    return c && c.isMaterial ? c : mat(c, o)
  }

  mesh(geo, c, x = 0, y = 0, z = 0, o = {}) {
    const mesh = new THREE.Mesh(geo, this.m(c, o))
    mesh.position.set(x, y, z)
    if (o.rx) mesh.rotation.x = o.rx
    if (o.ry) mesh.rotation.y = o.ry
    if (o.rz) mesh.rotation.z = o.rz
    if (o.sx || o.sy || o.sz) mesh.scale.set(o.sx ?? 1, o.sy ?? 1, o.sz ?? 1)
    mesh.castShadow = true
    mesh.receiveShadow = true
    ;(o.parent ?? this.parent).add(mesh)
    return mesh
  }

  box(w, h, d, c, x = 0, y = 0, z = 0, o = {}) {
    const geo = new THREE.BoxGeometry(w, h, d)
    if (c && c.isMaterial && c.map) boxUV(geo, w, h, d, o.tile ?? 24)
    return this.mesh(geo, c, x, y + h / 2, z, o)
  }

  cyl(rt, rb, h, c, x = 0, y = 0, z = 0, o = {}) {
    const geo = new THREE.CylinderGeometry(rt, rb, h, o.seg ?? 16, 1, o.open ?? false, o.ts ?? 0, o.tl ?? PI * 2)
    return this.mesh(geo, c, x, y + h / 2, z, o)
  }

  cone(r, h, c, x = 0, y = 0, z = 0, o = {}) {
    return this.cyl(0, r, h, c, x, y, z, o)
  }

  // Square pyramid with axis-aligned base of half-size `hs`.
  pyr(hs, h, c, x = 0, y = 0, z = 0, o = {}) {
    return this.cyl(0, hs * Math.SQRT2, h, c, x, y, z, { seg: 4, ry: PI / 4, ...o })
  }

  dome(r, c, x = 0, y = 0, z = 0, o = {}) {
    const geo = new THREE.SphereGeometry(r, o.seg ?? 20, o.seg2 ?? 10, o.ps ?? 0, o.pl ?? PI * 2, 0, o.tl ?? PI / 2)
    return this.mesh(geo, c, x, y, z, o)
  }

  sphere(r, c, x = 0, y = 0, z = 0, o = {}) {
    const geo = new THREE.SphereGeometry(r, o.seg ?? 16, o.seg2 ?? 10)
    return this.mesh(geo, c, x, y, z, o)
  }

  torus(R, t, c, x = 0, y = 0, z = 0, o = {}) {
    const geo = new THREE.TorusGeometry(R, t, o.rs ?? 6, o.ts ?? 28, o.arc ?? PI * 2)
    return this.mesh(geo, c, x, y, z, o)
  }

  // Ring lying flat (balconies etc.).
  ring(R, t, c, x, y, z, o = {}) {
    return this.torus(R, t, c, x, y, z, { rx: PI / 2, ...o })
  }

  lathe(points, c, x = 0, y = 0, z = 0, o = {}) {
    const geo = new THREE.LatheGeometry(points.map((p) => new THREE.Vector2(p[0], p[1])), o.seg ?? 20)
    return this.mesh(geo, c, x, y, z, o)
  }

  // Square beam from point a to point b.
  beam(a, b, t, c, o = {}) {
    const va = new THREE.Vector3(...a)
    const vb = new THREE.Vector3(...b)
    const dir = vb.clone().sub(va)
    const len = dir.length()
    const geo = new THREE.BoxGeometry(t, o.t2 ?? t, len)
    const mesh = this.mesh(geo, c, (va.x + vb.x) / 2, (va.y + vb.y) / 2, (va.z + vb.z) / 2, o)
    mesh.quaternion.setFromUnitVectors(UP, dir.normalize())
    return mesh
  }

  // Triangular prism (gable roof): width along x, height up, depth along z.
  prism(w, h, d, c, x = 0, y = 0, z = 0, o = {}) {
    const s = new THREE.Shape()
    s.moveTo(-w / 2, 0)
    s.lineTo(w / 2, 0)
    s.lineTo(0, h)
    s.closePath()
    const geo = new THREE.ExtrudeGeometry(s, { depth: d, bevelEnabled: false })
    geo.translate(0, 0, -d / 2)
    return this.mesh(geo, c, x, y, z, o)
  }

  extrude(shape, depth, c, x = 0, y = 0, z = 0, o = {}) {
    const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: o.curve ?? 12 })
    geo.translate(0, 0, -depth / 2)
    return this.mesh(geo, c, x, y, z, o)
  }

  sub(x = 0, y = 0, z = 0, dynamic = false) {
    const g = new THREE.Group()
    g.position.set(x, y, z)
    if (dynamic) g.userData.dynamic = true
    this.parent.add(g)
    return g
  }

  within(group, fn) {
    const prev = this.parent
    this.parent = group
    fn()
    this.parent = prev
  }

  colBox(x, z, w, d, h = 20, ry = 0) {
    this.colliders.push({ type: 'box', x, z, w, d, h, ry })
  }

  colCyl(x, z, r, h = 20) {
    this.colliders.push({ type: 'cyl', x, z, r, h })
  }

  // Elliptical wall of box colliders with an optional gap centred on +z.
  colRing(rx, rz, n, gap = 0, h = 12, thick = 2) {
    for (let i = 0; i < n; i++) {
      const a = (i + 0.5) / n * PI * 2
      const da = Math.abs(Math.atan2(Math.sin(a), Math.cos(a)))
      if (da < gap / 2) continue
      const x = Math.sin(a) * rx
      const z = Math.cos(a) * rz
      const seg = (2 * PI * Math.max(rx, rz)) / n + 1
      this.colliders.push({ type: 'box', x, z, w: seg, d: thick, h, ry: a + PI / 2 })
    }
  }
}

// ---------- shared palette ----------
const C = {
  lead: '#5f6d78',
  gold: mat('#e0b03c', { metal: 0.7, rough: 0.3 }),
  white: '#f2efe8',
  marble: '#efe9dc',
  dark: '#2b2f36',
  glass: mat('#8fc3e0', { metal: 0.5, rough: 0.12, opacity: 0.6, emissive: '#7fd0ff', ei: 0.7, night: true }),
  water: mat('#2a9fc4', { metal: 0.2, rough: 0.12, emissive: '#0b5f86', ei: 0.25 }),
  grass: '#5d9b4a',
  sand: '#d9bf8a',
}

const nightGlow = (color, glow, ei = 0.8) => mat(color, { emissive: glow, ei, night: true })

// ---------- reusable pieces ----------
function minaret(k, x, z, h, body = C.white, cap = C.lead) {
  k.cyl(0.95, 1.2, h, body, x, 0, z, { seg: 12 })
  k.ring(1.45, 0.25, body, x, h * 0.62, z, { ts: 14 })
  k.ring(1.4, 0.22, body, x, h * 0.82, z, { ts: 14 })
  k.cone(1.15, h * 0.24, cap, x, h, z, { seg: 12 })
  k.cyl(0.08, 0.08, 1.4, C.gold, x, h * 1.24, z, { seg: 6 })
}

function mosque(k, o) {
  const { w, d, h, base, domeR, domeColor, minarets = 4, minH = 30 } = o
  k.box(w, h, d, base)
  k.cyl(domeR * 1.02, domeR * 1.06, domeR * 0.35, base, 0, h, 0, { seg: 24 })
  const top = h + domeR * 0.35
  k.dome(domeR, domeColor, 0, top, 0, { sy: 0.8, seg: 24 })
  k.cyl(0.12, 0.12, 2.5, C.gold, 0, top + domeR * 0.8, 0, { seg: 6 })
  k.torus(0.7, 0.12, C.gold, 0, top + domeR * 0.8 + 3, 0, { arc: PI * 1.4, ts: 12 })
  if (o.halfDomes !== false) {
    k.dome(domeR * 0.8, domeColor, 0, h, domeR * 0.55, { ps: 0, pl: PI, sy: 0.8 })
    k.dome(domeR * 0.8, domeColor, 0, h, -domeR * 0.55, { ps: PI, pl: PI, sy: 0.8 })
  }
  if (o.corners !== false) {
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        k.cyl(domeR * 0.32, domeR * 0.34, 1.2, base, sx * w * 0.33, h, sz * d * 0.33)
        k.dome(domeR * 0.32, domeColor, sx * w * 0.33, h + 1.2, sz * d * 0.33, { sy: 0.9 })
      }
    }
  }
  // Arched windows
  for (let i = -2; i <= 2; i++) {
    for (const sz of [-1, 1]) k.box(1.6, 3.2, 0.3, C.dark, i * (w / 6), h * 0.35, sz * (d / 2 + 0.1))
    for (const sx of [-1, 1]) k.box(0.3, 3.2, 1.6, C.dark, sx * (w / 2 + 0.1), h * 0.35, i * (d / 6))
  }
  const mx = w / 2 + 3
  const mz = d / 2 + 3
  const spots = minarets === 2 ? [[-mx, -mz], [mx, -mz]] : [[-mx, -mz], [mx, -mz], [-mx, mz], [mx, mz]]
  if (minarets === 6) spots.push([-mx, -mz - 10], [mx, -mz - 10])
  for (const [x, z] of spots) {
    minaret(k, x, z, minH, o.minColor ?? C.white, o.minCap ?? C.lead)
    k.colCyl(x, z, 1.5, minH)
  }
  k.colBox(0, 0, w + 1, d + 1, h + domeR)
}

function latticeTower(k, levels, hw, colorFn, legT = (y) => 1, braceFrom = 0) {
  for (let i = 0; i < levels.length - 1; i++) {
    const y0 = levels[i]
    const y1 = levels[i + 1]
    const a = hw(y0)
    const b = hw(y1)
    const c = colorFn(i)
    const cs = [[1, 1], [1, -1], [-1, -1], [-1, 1]]
    for (const [sx, sz] of cs) k.beam([sx * a, y0, sz * a], [sx * b, y1, sz * b], legT(y0), c)
    for (let j = 0; j < 4; j++) {
      const [ax, az] = cs[j]
      const [bx, bz] = cs[(j + 1) % 4]
      k.beam([ax * b, y1, az * b], [bx * b, y1, bz * b], 0.35, c)
      if (y0 >= braceFrom) {
        k.beam([ax * a, y0, az * a], [bx * b, y1, bz * b], 0.28, c)
        k.beam([bx * a, y0, bz * a], [ax * b, y1, az * b], 0.28, c)
      }
    }
  }
}

function suspensionBridge(k, color, span = 220, towerH = 70, deckY = 18) {
  const half = span / 2
  for (const tx of [-half / 2, half / 2]) {
    for (const z of [-7, 7]) k.box(3, towerH, 3, color, tx, 0, z)
    for (const y of [deckY + 8, towerH * 0.6, towerH - 3]) k.box(3, 3, 14, color, tx, y, 0)
  }
  k.box(span * 1.4, 2, 14, '#55606a', 0, deckY, 0)
  for (const z of [-7, 7]) {
    const pts = []
    for (let i = 0; i <= 20; i++) {
      const x = -half / 2 + (i / 20) * half
      const tt = (x / (half / 2)) ** 2
      pts.push([x, deckY + 3 + (towerH - deckY - 3) * tt, z])
    }
    for (let i = 0; i < pts.length - 1; i++) k.beam(pts[i], pts[i + 1], 0.6, color)
    for (let i = 1; i < pts.length - 1; i += 1) k.beam([pts[i][0], deckY + 1, z], pts[i], 0.15, color)
    k.beam([-half / 2, towerH, z], [-half * 0.7, deckY + 1, z], 0.6, color)
    k.beam([half / 2, towerH, z], [half * 0.7, deckY + 1, z], 0.6, color)
  }
}

function onion(k, r, h, c, x, y, z) {
  const pts = [[0, 0], [r * 0.8, 0], [r, h * 0.18], [r * 1.05, h * 0.36], [r * 0.85, h * 0.58], [r * 0.5, h * 0.78], [r * 0.18, h * 0.93], [0, h]]
  k.lathe(pts, c, x, y, z, { seg: 20 })
}

function chhatri(k, x, y, z, s, col = C.marble) {
  for (const [dx, dz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) k.cyl(0.18 * s, 0.18 * s, 2.2 * s, col, x + dx * s, y, z + dz * s, { seg: 6 })
  k.cyl(1.6 * s, 1.6 * s, 0.35 * s, col, x, y + 2.2 * s, z, { seg: 12 })
  onion(k, 1.2 * s, 2.2 * s, col, x, y + 2.55 * s, z)
}

function windmill(k, x, z, s = 1, body = '#6b4a3a') {
  k.cyl(2.2 * s, 3.4 * s, 10 * s, body, x, 0, z, { seg: 8 })
  k.ring(3.3 * s, 0.25 * s, '#3b2b22', x, 4 * s, z, { ts: 8 })
  k.cone(2.7 * s, 3.4 * s, '#41493f', x, 10 * s, z, { seg: 8 })
  k.box(1 * s, 2 * s, 0.3, '#e9e1cf', x, 0, z + 3.3 * s)
  const hub = k.sub(x, 10.6 * s, z + 2.4 * s, true)
  k.within(hub, () => {
    k.cyl(0.5 * s, 0.5 * s, 1 * s, '#2c2420', 0, -0.5 * s, 0, { rx: PI / 2 })
    for (let i = 0; i < 4; i++) {
      const arm = k.sub(0, 0, 0.4 * s)
      arm.rotation.z = (i * PI) / 2
      k.within(arm, () => {
        k.box(0.3 * s, 9 * s, 0.25 * s, '#5a3e2e', 0, 0.5 * s, 0)
        k.box(1.6 * s, 7 * s, 0.1 * s, i % 2 ? '#f4efe4' : '#c94b3b', 0.95 * s, 2.5 * s, 0.05)
      })
    }
  })
  k.updates.push((t) => {
    hub.rotation.z = -t * 0.9
  })
  k.colCyl(x, z, 3.4 * s, 12 * s)
}

// ---------- landmarks ----------
export const LANDMARKS = {
  hagiaSophia(k) {
    mosque(k, { w: 30, d: 26, h: 11, base: '#c98d6a', domeR: 10, domeColor: '#7f8a93', minarets: 4, minH: 30, minColor: '#e6d6bf' })
    for (const sx of [-1, 1]) k.box(3, 14, 22, '#b9805f', sx * 16.5, 0, 0)
  },

  blueMosque(k) {
    mosque(k, { w: 28, d: 26, h: 9, base: '#d8d5cc', domeR: 9, domeColor: '#6d8597', minarets: 6, minH: 34 })
    k.box(32, 3, 0.8, '#cfcac0', 0, 0, -24.5)
    for (const sx of [-1, 1]) k.box(0.8, 3, 10, '#cfcac0', sx * 15.6, 0, -19.5)
  },

  galataTower(k) {
    const stone = '#c9b48f'
    k.cyl(5.6, 6, 3, '#a8977a', 0, 0, 0, { seg: 20 })
    k.cyl(4.3, 4.6, 25, stone, 0, 3, 0, { seg: 20 })
    for (let r = 0; r < 4; r++) {
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * PI * 2 + r * 0.4
        k.box(0.8, 1.6, 0.3, C.dark, Math.sin(a) * 4.45, 7 + r * 4.6, Math.cos(a) * 4.45, { ry: a })
      }
    }
    k.ring(5.1, 0.35, '#efe6d6', 0, 28.2, 0, { ts: 24 })
    k.cyl(4.1, 4.1, 4, '#efe6d6', 0, 28, 0, { seg: 20 })
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * PI * 2
      k.box(1, 2.2, 0.3, nightGlow('#2b2f36', '#ffcf73', 1.4), Math.sin(a) * 4.15, 28.8, Math.cos(a) * 4.15, { ry: a })
    }
    k.cone(4.8, 10, '#4d5f6e', 0, 32, 0, { seg: 20 })
    k.cyl(0.1, 0.1, 2, C.gold, 0, 42, 0, { seg: 6 })
    k.colCyl(0, 0, 6, 40)
  },

  maidensTower(k) {
    k.cyl(17, 17, 0.25, C.water, 0, 0.02, 0, { seg: 32 })
    k.cyl(7, 8.5, 2.2, '#8c8273', 0, 0, 0, { seg: 10 })
    k.box(11, 4, 9, '#efe8dc', 0, 2.2, 0)
    k.box(4.5, 11, 4.5, '#f4efe6', 2.5, 2.2, -1)
    k.cyl(2.5, 2.5, 4, '#f4efe6', 2.5, 13.2, -1, { seg: 8 })
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * PI * 2
      k.box(0.6, 1.4, 0.2, nightGlow(C.dark, '#ffd27a', 1.6), 2.5 + Math.sin(a) * 2.55, 14.4, -1 + Math.cos(a) * 2.55, { ry: a })
    }
    k.cone(2.9, 4.5, '#53626e', 2.5, 17.2, -1, { seg: 8 })
    k.cyl(0.08, 0.08, 1.6, C.gold, 2.5, 21.7, -1, { seg: 6 })
    k.cyl(0.8, 0.8, 5, '#f4efe6', -4, 6.2, 2.5, { seg: 8 })
    k.cone(1, 1.5, '#53626e', -4, 11.2, 2.5, { seg: 8 })
    k.colCyl(0, 0, 17, 6)
  },

  loveValley(k) {
    LANDMARKS.fairyChimneys(k, 77, 1.5)
  },

  fairyChimneys(k, seed = 42, tall = 1) {
    const rng = mulberry32(seed)
    for (let i = 0; i < 14; i++) {
      const a = rng() * PI * 2
      const d = 4 + rng() * 20
      const x = Math.sin(a) * d
      const z = Math.cos(a) * d
      const r = (2 + rng() * 2.6) / Math.sqrt(tall)
      const h = (9 + rng() * 14) * tall
      k.cyl(r * 0.32, r, h, '#e5cda6', x, 0, z, { seg: 9 })
      k.cyl(r * 0.22, r * 0.62, h * 0.16, '#6f5a4c', x, h * 0.96, z, { seg: 9 })
      if (rng() < 0.6) {
        for (let w = 0; w < 3; w++) {
          const wa = rng() * PI * 2
          const wy = 2 + rng() * h * 0.45
          const rr = r - (r - r * 0.32) * (wy / h) + 0.05
          k.box(0.7, 1.1, 0.3, nightGlow('#3a2b22', '#ffb45e', 1.2), x + Math.sin(wa) * rr, wy, z + Math.cos(wa) * rr, { ry: wa })
        }
      }
      k.colCyl(x, z, r * 0.9, h)
    }
  },

  uchisar(k) {
    const rock = '#dcc4a0'
    k.cyl(18, 24, 10, rock, 0, 0, 0, { seg: 11 })
    k.cyl(11, 16, 13, '#d4b993', 0, 10, 0, { seg: 10 })
    k.cyl(5, 9, 10, rock, 0, 23, 0, { seg: 9 })
    const rng = mulberry32(7)
    for (let i = 0; i < 60; i++) {
      const tier = rng()
      let y, r
      if (tier < 0.45) { y = 1 + rng() * 8; r = 24 - (y / 10) * 6 } else if (tier < 0.85) { y = 11 + rng() * 11; r = 16 - ((y - 10) / 13) * 5 } else { y = 24 + rng() * 8; r = 9 - ((y - 23) / 10) * 4 }
      const a = rng() * PI * 2
      k.box(1, 1.5, 0.4, nightGlow('#3e2f25', '#ffb65c', 1.1), Math.sin(a) * (r + 0.05), y, Math.cos(a) * (r + 0.05), { ry: a })
    }
    k.cyl(0.12, 0.12, 7, '#dddddd', 0, 33, 0, { seg: 6 })
    k.box(4, 2.6, 0.1, '#e30a17', 2, 37, 0)
    k.torus(0.62, 0.17, '#ffffff', 1.4, 38.3, 0.08, { arc: PI * 1.5, ts: 12, rz: PI * 0.25 })
    k.colCyl(0, 0, 23, 20)
  },

  goreme(k) {
    const rng = mulberry32(99)
    for (const [x, z, s] of [[-12, -6, 9], [6, -12, 11], [14, 8, 8], [-6, 12, 7]]) {
      k.mesh(new THREE.DodecahedronGeometry(s, 0), '#d9bf98', x, s * 0.55, z, { sy: 1.2 })
      for (let i = 0; i < 5; i++) {
        const a = rng() * PI * 2
        k.box(1.4, 2.4, 0.5, nightGlow('#3a2a20', '#ffc06a', 1), x + Math.sin(a) * s * 0.92, 0.5 + rng() * s * 0.6, z + Math.cos(a) * s * 0.92, { ry: a })
      }
      k.colCyl(x, z, s * 0.95, 14)
    }
    k.box(6, 4, 0.6, '#c9ad85', 0, 0, 0)
    k.box(2, 3, 0.7, '#3a2a20', 0, 0, 0)
  },

  eiffel(k) {
    const iron = nightGlow('#6e5440', '#ffb257', 0.22)
    const hw = (y) => 1.2 + 14.8 * Math.pow((88 - y) / 88, 2.2)
    latticeTower(k, [0, 7, 14, 20, 27, 34, 42, 52, 62, 72, 80, 88], hw, () => iron, (y) => (y < 20 ? 2 : y < 42 ? 1.3 : 0.8), 14)
    k.box(2 * hw(20) + 3, 1.6, 2 * hw(20) + 3, iron, 0, 19.4, 0)
    k.box(2 * hw(42) + 2, 1.2, 2 * hw(42) + 2, iron, 0, 41.4, 0)
    k.box(3.4, 3, 3.4, iron, 0, 86, 0)
    k.cyl(0.25, 0.5, 9, iron, 0, 89, 0, { seg: 6 })
    for (const [x, z, ry] of [[0, 14.3, 0], [0, -14.3, 0], [14.3, 0, PI / 2], [-14.3, 0, PI / 2]]) k.torus(10.5, 0.55, iron, x, 3.5, z, { arc: PI, ry, ts: 18 })
    k.cyl(0.4, 0.4, 0.6, mat('#fff4c2', { emissive: '#fff1b0', ei: 2.5, night: true }), 0, 98, 0, { seg: 8 })
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.colCyl(sx * 14, sz * 14, 3, 20)
  },

  arcTriomphe(k) {
    const stone = '#e6dbc2'
    for (const sx of [-1, 1]) {
      k.box(9.5, 22, 15, stone, sx * 10.25, 0, 0)
      k.box(0.4, 7, 5, '#cbbf9f', sx * 10.25 + sx * 4.9, 4, 0)
      k.box(5, 7, 0.4, '#cbbf9f', sx * 10.25, 4, 7.6)
      k.box(5, 7, 0.4, '#cbbf9f', sx * 10.25, 4, -7.6)
      k.box(2.4, 8, 15.6, C.dark, sx * 10.25, 0, 0, { sx: 1 })
    }
    k.box(30, 2, 16, '#d8ccb0', 0, 22, 0)
    k.box(30, 7, 15, stone, 0, 24, 0)
    k.box(31, 1.2, 16, '#d8ccb0', 0, 31, 0)
    k.torus(5.5, 0.6, stone, 0, 16, 7.4, { arc: PI, ts: 14 })
    k.torus(5.5, 0.6, stone, 0, 16, -7.4, { arc: PI, ts: 14 })
    k.box(22, 0.3, 22, mat('#ff3b30', { emissive: '#ff5a3c', ei: 0.4 }), 0, 0, 0)
    for (const sx of [-1, 1]) k.colBox(sx * 10.25, 0, 9.5, 15, 30)
  },

  louvre(k) {
    const palace = '#e2d4b6'
    const roof = '#55606a'
    k.box(54, 12, 9, palace, 0, 0, -21)
    k.prism(9, 5, 54, roof, 0, 12, -21, { ry: PI / 2 })
    for (const sx of [-1, 1]) {
      k.box(9, 12, 30, palace, sx * 22.5, 0, -2)
      k.prism(9, 5, 30, roof, sx * 22.5, 12, -2)
      for (let i = 0; i < 6; i++) k.box(0.3, 4, 1.6, C.dark, sx * (18 - 0.1), 3, -14 + i * 5)
    }
    for (let i = -5; i <= 5; i++) k.box(1.6, 4, 0.3, C.dark, i * 4.6, 3, -16.4)
    k.pyr(8, 11, C.glass, 0, 0, 4)
    k.pyr(2.4, 3.4, C.glass, -12, 0, 6)
    k.pyr(2.4, 3.4, C.glass, 12, 0, 6)
    for (const sx of [-1, 1]) k.box(9, 0.4, 7, C.water, sx * 8, 0, 14)
    k.colBox(0, -21, 54, 9, 18)
    for (const sx of [-1, 1]) k.colBox(sx * 22.5, -2, 9, 30, 18)
    k.colCyl(0, 4, 7.5, 12)
  },

  notreDame(k) {
    const stone = '#cdbfa2'
    k.box(14, 16, 32, stone, 0, 0, 4)
    k.prism(14, 8, 32, '#5d6872', 0, 16, 4)
    k.box(18, 21, 5, stone, 0, 0, -13.5)
    for (const sx of [-1, 1]) k.box(6.5, 31, 6.5, stone, sx * 5.75, 0, -13.5)
    k.cyl(3.2, 3.2, 0.6, nightGlow('#52418f', '#a77bff', 1.4), 0, 13, -16.2, { rx: PI / 2, seg: 18 })
    for (let i = -1; i <= 1; i++) k.box(2.6, 6, 0.4, C.dark, i * 4.6, 0, -16.1)
    k.cyl(0.3, 1.4, 22, '#5d6872', 0, 22, 9, { seg: 8 })
    for (const sx of [-1, 1]) for (let i = 0; i < 5; i++) k.beam([sx * 7, 13, -6 + i * 6], [sx * 12, 2, -6 + i * 6], 0.8, stone)
    k.colBox(0, 2, 22, 40, 30)
  },

  bigBen(k) {
    const stone = '#d2b98c'
    const tx = 13
    k.box(8, 36, 8, stone, tx, 0, 0)
    for (let i = 0; i < 9; i++) for (const sx of [-1, 1]) k.box(0.5, 2.6, 0.2, C.dark, tx + sx * 1.8, 4 + i * 3.6, 4.05)
    k.box(9.4, 9, 9.4, stone, tx, 36, 0)
    const face = mat('#fff9e8', { emissive: '#fff2c4', ei: 1.3, night: true })
    for (const [dx, dz, ry] of [[0, 4.75, 0], [0, -4.75, 0], [4.75, 0, PI / 2], [-4.75, 0, PI / 2]]) {
      k.cyl(3.4, 3.4, 0.3, face, tx + dx, 40.5, dz, { rx: PI / 2, rz: ry, seg: 24 })
      k.box(0.3, 2.6, 0.2, C.dark, tx + dx * 1.04, 40.6, dz * 1.04, { ry })
      k.box(1.9, 0.3, 0.2, C.dark, tx + dx * 1.04 + (ry ? 0 : 0.8), 40.5, dz * 1.04 + (ry ? 0.8 : 0), { ry })
    }
    k.box(7, 5, 7, stone, tx, 45, 0)
    k.pyr(3.9, 15, '#3c4a52', tx, 50, 0)
    k.cyl(0.1, 0.25, 3, C.gold, tx, 65, 0, { seg: 6 })
    k.box(28, 14, 12, stone, -6, 0, 6)
    k.prism(12, 4, 28, '#4c5a63', -6, 14, 6, { ry: PI / 2 })
    for (let i = 0; i < 8; i++) k.pyr(0.5, 4, stone, -19 + i * 3.7, 14, 0)
    k.box(9, 26, 9, stone, -21, 0, -6)
    k.pyr(4.5, 6, '#3c4a52', -21, 26, -6)
    k.colBox(tx, 0, 9.4, 9.4, 50)
    k.colBox(-6, 6, 28, 12, 18)
    k.colBox(-21, -6, 9, 9, 30)
  },

  londonEye(k) {
    const steel = '#e8edf2'
    const hubY = 26
    for (const sx of [-1, 1]) k.beam([sx * 12, 0, -9], [0, hubY, -1.5], 1.2, steel)
    k.box(16, 1, 6, '#9aa4ad', 0, 0, 6)
    const wheel = k.sub(0, hubY, 0, true)
    const caps = []
    k.within(wheel, () => {
      k.torus(22, 0.45, steel, 0, 0, 0, { ts: 48 })
      k.torus(21, 0.25, steel, 0, 0, 0, { ts: 48 })
      k.cyl(1.6, 1.6, 3, '#9aa4ad', 0, -1.5, 0, { rx: PI / 2 })
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * PI * 2
        k.beam([0, 0, 0], [Math.cos(a) * 22, Math.sin(a) * 22, 0], 0.12, steel)
      }
      for (let i = 0; i < 24; i++) {
        const a = (i / 24) * PI * 2
        const cap = k.sub(Math.cos(a) * 22.6, Math.sin(a) * 22.6, 0)
        k.within(cap, () => {
          k.mesh(new THREE.CapsuleGeometry(0.9, 1.6, 4, 8), mat('#bfe3ff', { metal: 0.3, rough: 0.2, emissive: '#7fc8ff', ei: 1, night: true }), 0, -0.6, 0, { rz: PI / 2 })
        })
        caps.push(cap)
      }
    })
    k.updates.push((t) => {
      wheel.rotation.z = t * 0.06
      for (const c of caps) c.rotation.z = -wheel.rotation.z
    })
    for (const sx of [-1, 1]) k.colBox(sx * 12, -9, 2.5, 2.5, 6)
    k.colBox(0, 6, 16, 6, 2)
  },

  towerBridge(k) {
    const stone = '#cfc09e'
    const blue = '#6ea6da'
    for (const sx of [-1, 1]) {
      const x = sx * 13
      k.box(9, 30, 9, stone, x, 0, 0)
      k.box(4, 10, 9.4, C.dark, x, 0, 0)
      for (const dx of [-1, 1]) for (const dz of [-1, 1]) {
        k.cyl(1.1, 1.1, 8, stone, x + dx * 4, 30, dz * 4, { seg: 8 })
        k.cone(1.4, 4, '#4b5a66', x + dx * 4, 38, dz * 4, { seg: 8 })
      }
      k.pyr(3.5, 9, '#4b5a66', x, 30, 0)
      k.beam([x + sx * 4.5, 24, 3.5], [sx * 32, 3, 3.5], 0.9, blue)
      k.beam([x + sx * 4.5, 24, -3.5], [sx * 32, 3, -3.5], 0.9, blue)
      k.colBox(x, 0, 9, 9, 40)
    }
    for (const z of [-2.5, 2.5]) k.box(17, 2.6, 3, blue, 0, 26, z)
    for (const z of [-14, 14]) k.box(60, 0.15, 10, C.water, 0, 0, z)
  },

  statueLiberty(k) {
    const fort = '#a49a86'
    const copper = mat('#6fb3a0', { rough: 0.6, emissive: '#a7ffe6', ei: 0.25, night: true })
    k.box(24, 4, 24, fort)
    k.box(24, 4, 24, fort, 0, 0, 0, { ry: PI / 4 })
    k.box(10, 12, 10, '#b5ab98', 0, 4, 0)
    k.box(11.5, 1.2, 11.5, '#c2b8a4', 0, 16, 0)
    k.cyl(2.2, 3.2, 12, copper, 0, 17.2, 0, { seg: 10 })
    k.cyl(1.6, 2.2, 4, copper, 0, 29.2, 0, { seg: 10 })
    k.sphere(1.4, copper, 0, 34.6, 0, { seg: 10 })
    for (let i = 0; i < 7; i++) {
      const a = -PI / 2 + (i / 6) * PI
      k.beam([Math.sin(a) * 1.2, 35.4, Math.cos(a) * 1.2], [Math.sin(a) * 3, 36.6, Math.cos(a) * 3], 0.25, copper)
    }
    k.beam([1.4, 31.5, 0], [3.4, 39, 0.4], 0.9, copper)
    k.cyl(0.4, 0.7, 1.4, C.gold, 3.5, 39, 0.4, { seg: 8 })
    k.cone(0.7, 1.8, mat('#ffb02e', { emissive: '#ff9b1a', ei: 2.2 }), 3.5, 40.4, 0.4, { seg: 8 })
    k.box(1.6, 2.4, 0.5, copper, -2.1, 29.5, 0.9, { rz: 0.2 })
    k.colBox(0, 0, 24, 24, 20)
  },

  empireState(k) {
    const f = facadeMat('#c8c1b0', 'classic')
    const tiers = [[28, 40, 22], [24, 30, 18], [18, 22, 14], [13, 14, 10], [9, 8, 7]]
    let y = 0
    for (const [w, h, d] of tiers) {
      k.box(w, h, d, f, 0, y, 0)
      y += h
    }
    const crown = mat('#e6e6f2', { emissive: '#7fb2ff', ei: 1.4, night: true })
    k.cyl(3.4, 4.2, 6, crown, 0, y, 0, { seg: 8 })
    k.cyl(1, 2.4, 6, crown, 0, y + 6, 0, { seg: 8 })
    k.cyl(0.2, 0.7, 16, '#c9c9c9', 0, y + 12, 0, { seg: 6 })
    k.colBox(0, 0, 28, 22, 60)
  },

  timesSquare(k) {
    const texts = [['CITY CARS', '#ff2d6f'], ['WORLD TOUR', '#2de1ff'], ['BROADWAY', '#ffd22d'], ['PIZZA 24/7', '#ff7a1a'], ['NEON NIGHTS', '#b14dff'], ['SALE 50%', '#24ff7a'], ['DRIVE!', '#ff3d3d'], ['NEW YORK', '#3d7bff']]
    let n = 0
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const h = 46 + ((sx + 2) * (sz + 3)) % 4 * 6
        const x = sx * 19
        const z = sz * 19
        k.box(13, h, 13, facadeMat('#6f7480', 'modern'), x, 0, z)
        for (const lvl of [0, 1]) {
          const [txt, col] = texts[n++ % texts.length]
          const mtx = billboardMat(txt, col)
          const y = 12 + lvl * 14
          k.mesh(new THREE.PlaneGeometry(11, 7.5), mtx, x - sx * 6.6, y, z, { ry: sx > 0 ? -PI / 2 : PI / 2 })
          const [t2, c2] = texts[n++ % texts.length]
          k.mesh(new THREE.PlaneGeometry(11, 7.5), billboardMat(t2, c2), x, y + 3, z - sz * 6.6, { ry: sz > 0 ? PI : 0 })
        }
        k.colBox(x, z, 13, 13, h)
      }
    }
    for (let i = 0; i < 6; i++) k.box(8, 0.5 + i * 0.5, 1.5, mat('#ff2e3e', { emissive: '#ff1a2e', ei: 0.9, opacity: 0.9 }), 0, 0, -3 + i * 1.5)
    k.colBox(0, 1, 8, 9, 3)
  },

  colosseum(k) {
    const trav = '#d8c7a3'
    const sq = 0.8
    const outer = new THREE.CylinderGeometry(24, 24, 22, 48, 1, true, 0, PI * 1.45)
    k.mesh(outer, mat(trav, { side: THREE.DoubleSide }), 0, 11, 0, { sz: sq })
    const low = new THREE.CylinderGeometry(24, 24, 13, 20, 1, true, PI * 1.45, PI * 0.55)
    k.mesh(low, mat(trav, { side: THREE.DoubleSide }), 0, 6.5, 0, { sz: sq })
    k.mesh(new THREE.CylinderGeometry(19, 12, 14, 40, 1, true), mat('#c4b28e', { side: THREE.DoubleSide }), 0, 7, 0, { sz: sq })
    k.cyl(12, 12, 0.6, '#c9a46a', 0, 0, 0, { seg: 32, sz: sq })
    for (let tier = 0; tier < 3; tier++) {
      for (let i = 0; i < 40; i++) {
        const a = (i / 40) * PI * 2
        const full = a < PI * 1.45
        if (!full && tier > 0) continue
        k.box(2, 3.6, 0.5, '#5a4d3c', Math.sin(a) * 24.05, 1.6 + tier * 6.6, Math.cos(a) * 24.05 * sq, { ry: Math.atan2(Math.sin(a) * sq, Math.cos(a)) })
      }
    }
    k.colRing(24, 24 * sq, 28, 0, 22, 3)
  },

  stPeters(k) {
    const stone = '#e8dec8'
    k.box(36, 18, 8, stone, 0, 0, -8)
    for (let i = 0; i < 8; i++) k.cyl(0.9, 1, 16, '#f2ebdb', -12.6 + i * 3.6, 0, -12.6, { seg: 10 })
    k.prism(14, 5, 3, stone, 0, 18, -11)
    for (let i = 0; i < 11; i++) k.cyl(0.35, 0.35, 2, '#f2ebdb', -16 + i * 3.2, 18, -9, { seg: 6 })
    k.box(20, 18, 16, stone, 0, 0, 4)
    k.cyl(8, 8, 8, stone, 0, 18, 4, { seg: 24 })
    k.dome(8.4, '#a8bcbd', 0, 26, 4, { sy: 1.25, seg: 24 })
    k.cyl(1.4, 1.4, 4, stone, 0, 36.4, 4, { seg: 8 })
    k.cone(1.6, 2.6, '#a8bcbd', 0, 40.4, 4, { seg: 8 })
    k.box(0.25, 2.2, 0.25, C.gold, 0, 43, 4)
    k.box(1.2, 0.25, 0.25, C.gold, 0, 44.4, 4)
    k.cyl(0.6, 1, 14, '#d9cdb2', 0, 0, -22, { seg: 4, ry: PI / 4 })
    for (const sx of [-1, 1]) for (let i = 0; i < 8; i++) {
      const a = (i / 7) * PI * 0.55 + 0.25
      k.cyl(0.55, 0.55, 6, '#f2ebdb', sx * Math.cos(a) * 15, 0, -18 - Math.sin(a) * 7, { seg: 8 })
    }
    k.colBox(0, -1, 36, 22, 30)
    k.colCyl(0, -22, 1.5, 14)
  },

  trevi(k) {
    const stone = '#ebe3d1'
    k.box(40, 20, 8, stone, 0, 0, -14)
    for (let i = 0; i < 6; i++) k.cyl(0.9, 1, 15, '#f4eee2', -15 + i * 6, 2, -9.6, { seg: 10 })
    k.box(9, 14, 1, '#b9ad94', 0, 2, -9.8)
    k.sphere(1.2, '#ffffff', 0, 11, -8.5)
    k.cyl(1.2, 1.6, 5, '#ffffff', 0, 4.8, -8.5, { seg: 8 })
    k.box(41, 3, 9, '#ddd3bd', 0, 20, -14)
    // Palazzo Poli: windows on every side so the block reads as a palace, not a box.
    const win = '#5d5546'
    const frame = '#f6f0e3'
    for (let fl = 0; fl < 3; fl++) {
      const y = 3.2 + fl * 5.6
      for (let i = 0; i < 12; i++) {
        const x = -18 + i * 3.27
        if (Math.abs(x) < 6) continue
        k.box(1.9, 2.8, 0.3, frame, x, y - 0.2, -9.85)
        k.box(1.4, 2.3, 0.4, win, x, y, -9.8)
        k.box(1.9, 2.8, 0.3, frame, x, y - 0.2, -18.15)
        k.box(1.4, 2.3, 0.4, win, x, y, -18.2)
      }
      for (let i = 0; i < 2; i++) for (const sx of [-1, 1]) {
        k.box(0.3, 2.8, 1.9, frame, sx * 20.15, y - 0.2, -16 + i * 4)
        k.box(0.4, 2.3, 1.4, win, sx * 20.2, y, -16 + i * 4)
      }
    }
    k.box(42, 0.6, 9.6, '#d2c7ae', 0, 1.4, -14)
    k.box(42, 0.6, 9.6, '#d2c7ae', 0, 7.6, -14)
    // Triumphal-arch centrepiece and the attic statues.
    k.box(16, 23, 2, '#f1ebdd', 0, 0, -9.2)
    k.box(6.5, 11, 1, '#a99c82', 0, 3, -8.3)
    k.box(18, 2.5, 2.4, '#e7dfcd', 0, 23, -9.2)
    for (let i = 0; i < 4; i++) k.cyl(0.45, 0.45, 2.6, '#f8f4ea', -6 + i * 4, 25.5, -9.2, { seg: 8 })
    k.box(6, 3, 1.4, '#e7dfcd', 0, 25.5, -9.2)
    for (const sx of [-1, 1]) {
      k.cyl(0.9, 1.1, 4, '#f8f4ea', sx * 5.5, 5, -7.9, { seg: 8 })
      k.sphere(0.8, '#f8f4ea', sx * 5.5, 9.6, -7.9)
      k.mesh(new THREE.DodecahedronGeometry(1.4), '#f3eee3', sx * 4.5, 1.5, -3)
      k.cyl(0.5, 0.7, 2.6, '#f3eee3', sx * 4.5, 2.4, -2.2, { seg: 6 })
    }
    k.sphere(1.6, '#f3eee3', 0, 1.6, -4.5)
    const rng = mulberry32(5)
    for (let i = 0; i < 12; i++) k.mesh(new THREE.DodecahedronGeometry(1.5 + rng() * 1.5), '#d6ceb9', -12 + rng() * 24, 0.6, -7.5 + rng() * 2)
    k.cyl(14.5, 14.5, 0.8, '#d7cdb6', 0, 0, -6, { ts: -PI / 2, tl: PI, seg: 24 })
    k.cyl(13.5, 13.5, 0.9, mat('#47d4e4', { metal: 0.25, rough: 0.08, emissive: '#1fb6d4', ei: 0.45 }), 0, 0.05, -6, { ts: -PI / 2, tl: PI, seg: 24 })
    k.colBox(0, -14, 40, 8, 22)
    k.colCyl(0, -6, 14, 2)
  },

  parthenon(k) {
    const rock = '#bba98a'
    k.cyl(22, 25, 5, rock, 0, 0, 0, { seg: 9 })
    const m = C.marble
    k.box(20, 1.2, 38, '#e2dccd', 0, 5, 0)
    k.box(18.6, 1, 36.6, '#e8e2d4', 0, 6.2, 0)
    for (let i = 0; i < 8; i++) for (const sz of [-1, 1]) k.cyl(0.75, 0.85, 9, m, -8 + (i * 16) / 7, 7.2, sz * 17, { seg: 10 })
    for (let i = 1; i < 16; i++) for (const sx of [-1, 1]) k.cyl(0.75, 0.85, 9, m, sx * 8, 7.2, -17 + (i * 34) / 16, { seg: 10 })
    k.box(18.8, 2, 36.8, '#e6dfcf', 0, 16.2, 0)
    for (const sz of [-1, 1]) k.prism(18.8, 3.2, 1.4, '#e6dfcf', 0, 18.2, sz * 17.7)
    k.box(9, 6, 20, '#d9d0bd', 0, 7.2, 0)
    k.colCyl(0, 0, 24, 20)
  },

  templeZeus(k) {
    k.box(30, 1, 16, '#ddd5c4')
    const m = '#efe8da'
    for (let i = 0; i < 7; i++) for (const z of [-4, 4]) {
      if (i === 5 && z === 4) continue
      k.cyl(1, 1.1, 17, m, -12 + i * 4, 1, z, { seg: 12 })
      k.box(2.6, 1, 2.6, m, -12 + i * 4, 18, z)
    }
    k.box(10, 1.6, 2.6, m, -10, 19, -4)
    for (let i = 0; i < 6; i++) k.cyl(1.05, 1.05, 2.3, m, 4 + i * 2.35, 1.05, 10, { rz: PI / 2, seg: 12 })
    k.colBox(0, 0, 30, 16, 20)
    k.colBox(9.5, 10, 14, 2.4, 2)
  },

  panathenaic(k) {
    const m = '#f1ece1'
    k.box(16, 0.2, 40, '#c98a5a', 0, 0, 2)
    for (let r = 0; r < 5; r++) {
      const h = 1 + r * 1.2
      for (const sx of [-1, 1]) k.box(2.5, h, 40, m, sx * (9.3 + r * 2.5), 0, 4)
      for (let i = 0; i <= 10; i++) {
        const a = (i / 10) * PI
        const R = 9.3 + r * 2.5
        k.box(R * 0.33, h, 2.5, m, Math.cos(a) * R, 0, -16 - Math.sin(a) * R, { ry: -a + PI / 2 })
      }
    }
    for (const sx of [-1, 1]) k.colBox(sx * 15, 4, 12, 40, 6)
    for (let i = 0; i <= 10; i++) {
      const a = (i / 10) * PI
      k.colBox(Math.cos(a) * 15, -16 - Math.sin(a) * 15, 6, 12, 6, -a + PI / 2)
    }
  },

  tokyoTower(k) {
    const red = nightGlow('#e5432e', '#ff7a2e', 0.9)
    const wht = nightGlow('#f4f1ea', '#ffc88a', 0.6)
    const hw = (y) => 0.6 + 11.4 * Math.pow((90 - y) / 90, 1.9)
    latticeTower(k, [0, 8, 16, 24, 32, 40, 48, 56, 64, 72, 80, 90], hw, (i) => (i % 2 ? wht : red), (y) => (y < 30 ? 1.4 : 0.8), 0)
    k.box(2 * hw(32) + 3, 4.5, 2 * hw(32) + 3, mat('#d8dde3', { emissive: '#bfe1ff', ei: 0.9, night: true }), 0, 32, 0)
    k.box(2 * hw(64) + 2, 2.5, 2 * hw(64) + 2, mat('#d8dde3', { emissive: '#bfe1ff', ei: 0.9, night: true }), 0, 64, 0)
    k.cyl(0.2, 0.6, 14, red, 0, 90, 0, { seg: 6 })
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.colCyl(sx * 11, sz * 11, 2.5, 20)
  },

  sensoji(k) {
    const red = '#b8392a'
    const roof = '#3b4744'
    k.box(15, 1.5, 15, '#9a9488')
    let y = 1.5
    for (let i = 0; i < 5; i++) {
      const s = 8.5 - i * 1.15
      k.box(s, 3.6, s, red, 0, y, 0)
      k.cyl(s * 0.42, (s + 5) * 0.72, 1.5, roof, 0, y + 3.6, 0, { seg: 4, ry: PI / 4 })
      y += 5.1
    }
    k.cyl(0.25, 0.25, 9, C.gold, 0, y, 0, { seg: 6 })
    for (let i = 0; i < 7; i++) k.ring(0.7, 0.12, C.gold, 0, y + 1.5 + i * 0.9, 0, { ts: 10 })
    // Kaminarimon-style gate with the big lantern
    for (const sx of [-1, 1]) k.box(1.2, 8, 1.2, red, sx * 5, 0, 18)
    k.box(14, 1.4, 4, roof, 0, 8, 18)
    k.prism(14, 2.4, 4.4, roof, 0, 9.4, 18, { ry: PI / 2, sx: 1 })
    k.cyl(1.8, 1.8, 3.4, mat('#d22d22', { emissive: '#ff3a24', ei: 1.1, night: true }), 0, 3.6, 18, { seg: 14 })
    k.cyl(1.9, 1.9, 0.4, C.dark, 0, 3.4, 18, { seg: 14 })
    k.colBox(0, 0, 15, 15, 30)
    for (const sx of [-1, 1]) k.colBox(sx * 5, 18, 1.4, 1.4, 8)
  },

  meijiTorii(k) {
    const red = '#d6362c'
    for (const sx of [-1, 1]) k.cyl(0.9, 1, 14, red, sx * 7, 0, 10, { seg: 12 })
    k.box(18, 1, 1.4, red, 0, 10.6, 10)
    k.box(21, 1.2, 2, '#1d1d1f', 0, 13.6, 10)
    for (const sx of [-1, 1]) k.box(2.4, 0.8, 2, '#1d1d1f', sx * 10.6, 14.1, 10, { rz: sx * 0.2 })
    k.box(16, 5, 10, '#8a5a3a', 0, 1, -12)
    k.box(18, 1, 12, '#cfc6b4', 0, 0, -12)
    k.prism(22, 6, 14, '#3f6b5a', 0, 6, -12, { ry: PI / 2 })
    for (const sx of [-1, 1]) k.colCyl(sx * 7, 10, 1.1, 14)
    k.colBox(0, -12, 18, 12, 10)
  },

  burjKhalifa(k) {
    const f = facadeMat('#b4cadb', 'modern')
    for (let i = 0; i < 12; i++) {
      for (let lobe = 0; lobe < 3; lobe++) {
        if (i > 8 + lobe) continue
        const a = lobe * ((PI * 2) / 3) + i * 0.08
        const L = 20 * (1 - i / 14)
        const x = Math.sin(a) * L * 0.5
        const z = Math.cos(a) * L * 0.5
        k.box(6, 12, L, f, x, i * 12, z, { ry: a })
      }
    }
    k.cyl(3, 6, 140, mat('#a7bfcf', { metal: 0.4, rough: 0.3, emissive: '#9fd0ff', ei: 0.35, night: true }), 0, 0, 0, { seg: 6 })
    k.cyl(0.15, 1.6, 40, '#c7d4dd', 0, 140, 0, { seg: 6 })
    k.cyl(0.25, 0.25, 0.5, mat('#ff2020', { emissive: '#ff2020', ei: 3 }), 0, 180, 0, { seg: 6 })
    k.colCyl(0, 0, 13, 60)
  },

  burjAlArab(k) {
    k.cyl(22, 22, 0.25, C.water, 0, 0.02, 0, { seg: 32 })
    k.cyl(13, 15, 2, '#e6d3a8', 0, 0, 0, { seg: 16 })
    const s = new THREE.Shape()
    s.moveTo(-11, 0)
    s.quadraticCurveTo(-12, 40, 2, 62)
    s.lineTo(4, 62)
    s.lineTo(4, 0)
    s.closePath()
    k.extrude(s, 14, mat('#f4f6f8', { emissive: '#9ed4ff', ei: 0.7, night: true }), 0, 2, 0, { curve: 16 })
    for (const z of [-7.2, 7.2]) k.beam([6, 2, z], [4.5, 66, 0], 0.9, '#ffffff')
    k.beam([6, 2, 0], [5, 60, 0], 1.2, '#e6e6e6')
    k.cyl(4.2, 4.2, 0.5, '#d0d4d8', -8, 46, 0, { seg: 20 })
    k.colCyl(0, 0, 22, 10)
  },

  dubaiFrame(k) {
    const gold = mat('#d4a943', { metal: 0.65, rough: 0.28, emissive: '#ffcc55', ei: 0.4, night: true })
    for (const sx of [-1, 1]) {
      k.box(7, 56, 6, gold, sx * 12.5, 0, 0)
      k.box(5.2, 54, 6.2, C.glass, sx * 12.5, 1, 0)
      k.colBox(sx * 12.5, 0, 7, 6, 56)
    }
    k.box(32, 6, 6, gold, 0, 56, 0)
    k.box(30, 4, 6.2, C.glass, 0, 57, 0)
  },

  pyramids(k) {
    const sand = '#d8b878'
    k.pyr(22, 36, sand, -24, 0, -24)
    k.pyr(21, 34, '#d3b072', 24, 0, 14)
    k.pyr(5, 8, '#efe1bd', 24, 26, 14)
    k.pyr(11, 17, '#cfa96c', 36, 0, -34)
    for (let i = 0; i < 3; i++) k.pyr(4, 6, '#cba468', -44 + i * 10, 0, 18)
    k.colBox(-24, -24, 44, 44, 36)
    k.colBox(24, 14, 42, 42, 34)
    k.colBox(36, -34, 22, 22, 17)
    for (let i = 0; i < 3; i++) k.colBox(-44 + i * 10, 18, 8, 8, 6)
  },

  sphinx(k) {
    const c = '#d1ae73'
    k.box(7, 5, 18, c, 0, 0, -2)
    k.box(7.6, 6, 6, c, 0, 0, -9)
    for (const sx of [-1, 1]) k.box(2, 1.6, 8, c, sx * 2.4, 0, 10)
    k.box(4.2, 5, 4.2, '#c99f62', 0, 5, 7)
    k.box(6.4, 4.2, 3, '#d7b878', 0, 5.8, 5.6)
    for (let i = 0; i < 4; i++) k.box(6.5, 0.4, 3.1, '#3a6aa0', 0, 6.2 + i * 1, 5.6)
    k.box(1, 1.2, 0.6, '#b8915a', 0, 6.8, 9.3)
    k.colBox(0, 0, 8, 26, 10)
  },

  citadelMosque(k) {
    mosque(k, { w: 26, d: 26, h: 12, base: '#e4d8c1', domeR: 9, domeColor: '#8b9094', minarets: 2, minH: 44, halfDomes: true })
  },

  christRedeemer(k) {
    k.cyl(6, 24, 26, '#4f7a3a', 0, 0, 0, { seg: 9 })
    k.cyl(4.5, 6.5, 4, '#7b7468', 0, 26, 0, { seg: 8 })
    const st = mat('#ece8de', { emissive: '#dff1ff', ei: 0.8, night: true })
    k.box(3, 4, 3, '#cfc8b8', 0, 30, 0)
    k.cyl(1.3, 2.1, 9, st, 0, 34, 0, { seg: 8 })
    k.box(3.2, 3.6, 1.8, st, 0, 43, 0)
    k.box(20, 1.3, 1.3, st, 0, 45.2, 0)
    k.sphere(1.1, st, 0, 47.7, 0, { seg: 10 })
    k.colCyl(0, 0, 24, 30)
  },

  maracana(k) {
    const sq = 0.78
    const gap = 0.5
    const wall = mat('#dfe3e8', { side: THREE.DoubleSide })
    k.mesh(new THREE.CylinderGeometry(26, 26, 12, 40, 1, true, gap / 2, PI * 2 - gap), wall, 0, 6, 0, { sz: sq })
    k.mesh(new THREE.CylinderGeometry(25, 16, 9, 40, 1, true, gap / 2, PI * 2 - gap), mat('#2f7fd0', { side: THREE.DoubleSide }), 0, 5, 0, { sz: sq })
    const roof = new THREE.RingGeometry(18, 27, 40, 1, gap / 2 - PI / 2, PI * 2 - gap)
    k.mesh(roof, mat('#ffffff', { side: THREE.DoubleSide, opacity: 0.85 }), 0, 12, 0, { rx: -PI / 2, sz: 1, sy: sq })
    k.box(26, 0.15, 17, '#3f9e45', 0, 0, 0)
    k.box(0.3, 0.17, 17, '#ffffff', 0, 0, 0)
    k.ring(3, 0.12, '#ffffff', 0, 0.2, 0, { ts: 20 })
    for (const sx of [-1, 1]) k.box(0.3, 2.4, 6, '#ffffff', sx * 12.5, 0, 0)
    k.colRing(26, 26 * sq, 36, gap + 0.35, 12, 2)
  },

  selaron(k) {
    const cols = ['#e63b2e', '#f2c21b', '#2e9e48', '#1f6fd1', '#ffffff']
    k.box(30, 14, 5, '#e8e1d4', 0, 0, -12)
    for (let i = 0; i < 12; i++) k.box(10, (i + 1) * 0.8, 1.6, cols[i % 4], 0, 0, 8 - i * 1.6)
    const rng = mulberry32(3)
    for (const sx of [-1, 1]) {
      k.box(2, 11, 20, '#e8e1d4', sx * 6, 0, -1)
      for (let i = 0; i < 30; i++) k.box(0.2, 0.9, 0.9, cols[Math.floor(rng() * 5)], sx * 4.95, 1 + rng() * 9, -10 + rng() * 18)
    }
    k.colBox(0, -2, 14, 22, 12)
  },

  operaHouse(k) {
    k.box(46, 4, 32, '#c9b38f')
    const tile = mat('#f7f5ee', { side: THREE.DoubleSide, rough: 0.5, emissive: '#fff2d6', ei: 0.35, night: true })
    const shells = [[-10, -6, 16], [-10, 3, 13], [-10, 11, 9], [9, -4, 13], [9, 4, 10], [9, 10, 7], [0, -13, 7]]
    for (const [x, z, r] of shells) {
      k.dome(r, tile, x, 4, z, { ps: -PI * 0.12, pl: PI * 0.5, tl: PI / 2, seg: 16, seg2: 8, ry: PI * 0.75, sx: 0.6 })
      k.dome(r * 0.92, tile, x, 4, z - 0.4, { ps: -PI * 0.12, pl: PI * 0.5, tl: PI / 2, seg: 16, seg2: 8, ry: -PI * 0.25 + PI, sx: 0.6, rz: 0 })
    }
    for (let i = 0; i < 10; i++) k.box(44 - i * 0.6, 0.4, 1, '#d8c4a0', 0, 0, 16 + i * 0.5)
    k.colBox(0, 0, 46, 32, 20)
  },

  harbourBridge(k) {
    const steel = '#8c98a3'
    for (const sx of [-1, 1]) {
      k.box(6, 22, 9, '#c6b796', sx * 27, 0, 0)
      k.colBox(sx * 27, 0, 6, 9, 22)
    }
    for (const z of [-4, 4]) {
      const top = []
      const bot = []
      for (let i = 0; i <= 16; i++) {
        const x = -24 + (i / 16) * 48
        const tt = 1 - (x / 24) ** 2
        top.push([x, 8 + tt * 26, z])
        bot.push([x, 4 + tt * 22, z])
      }
      for (let i = 0; i < 16; i++) {
        k.beam(top[i], top[i + 1], 1.2, steel)
        k.beam(bot[i], bot[i + 1], 1, steel)
        k.beam(bot[i], top[i + 1], 0.4, steel)
        if (bot[i][1] > 13) k.beam([bot[i][0], 13, z], bot[i], 0.25, steel)
      }
    }
    k.box(56, 1.2, 10, '#59636b', 0, 12, 0)
    k.box(0.6, 3, 0.6, mat('#ffffff', { emissive: '#ffffff', ei: 1.5, night: true }), 0, 34, 0)
  },

  sydneyTower(k) {
    k.box(16, 10, 16, facadeMat('#9aa6ad', 'modern'))
    k.cyl(2.2, 2.6, 62, '#d7dde2', 0, 10, 0, { seg: 12 })
    for (const [x, z] of [[-6, -6], [6, -6], [6, 6], [-6, 6]]) k.beam([x, 10, z], [0, 60, 0], 0.12, '#bfc6cc')
    k.cyl(6.5, 5.5, 8, mat('#d6a83a', { metal: 0.6, rough: 0.3, emissive: '#ffcf5a', ei: 0.8, night: true }), 0, 62, 0, { seg: 20 })
    k.cyl(4.5, 6.5, 2.4, '#e2e6ea', 0, 70, 0, { seg: 20 })
    k.cyl(0.2, 0.7, 18, '#d7dde2', 0, 72, 0, { seg: 6 })
    k.colBox(0, 0, 16, 16, 12)
  },

  sagrada(k) {
    const stone = '#c8a77e'
    k.box(24, 22, 36, stone, 0, 0, 0)
    k.prism(24, 9, 36, '#b89468', 0, 22, 0)
    const tipCols = ['#e8c547', '#d9473a', '#f2efe6', '#5a9e4a']
    for (const sz of [-1, 1]) {
      for (let i = 0; i < 4; i++) {
        const x = -7.5 + i * 5
        const h = i === 1 || i === 2 ? 52 : 44
        k.cyl(0.8, 2.6, h, stone, x, 0, sz * 19, { seg: 8 })
        for (let r = 1; r < 6; r++) k.ring(2.6 - (r / 6) * 1.6, 0.25, '#b08c62', x, (r / 6) * h * 0.8, sz * 19, { ts: 8 })
        k.sphere(1.3, tipCols[i], x, h + 0.8, sz * 19, { seg: 8 })
      }
    }
    k.cyl(1.4, 5, 70, '#d2b38a', 0, 20, 0, { seg: 10 })
    k.box(0.5, 4, 0.5, '#ffffff', 0, 90, 0)
    k.box(3, 0.5, 0.5, '#ffffff', 0, 92, 0)
    k.cyl(1, 3.5, 50, '#d2b38a', 0, 20, -9, { seg: 8 })
    k.sphere(1.6, mat('#ffffff', { emissive: '#e8f2ff', ei: 2, night: true }), 0, 71, -9)
    k.colBox(0, 0, 26, 42, 40)
  },

  columbus(k) {
    k.cyl(7, 8, 4, '#a39a8b', 0, 0, 0, { seg: 8 })
    k.cyl(4.5, 5, 5, '#8f8478', 0, 4, 0, { seg: 8 })
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * PI * 2 + PI / 4
      k.box(1.6, 2, 4, '#55473b', Math.sin(a) * 6.3, 4, Math.cos(a) * 6.3, { ry: a })
    }
    k.cyl(1.3, 1.7, 32, '#8a7f72', 0, 9, 0, { seg: 12 })
    k.cyl(2.2, 1.5, 2, C.gold, 0, 41, 0, { seg: 10 })
    k.sphere(2.2, C.gold, 0, 44.5, 0, { seg: 12 })
    k.cyl(0.6, 0.8, 4, '#3e4b45', 0, 46.6, 0, { seg: 8 })
    k.sphere(0.6, '#3e4b45', 0, 51, 0)
    k.beam([0, 49.6, 0], [3, 50.5, 0.4], 0.35, '#3e4b45')
    k.colCyl(0, 0, 8, 20)
  },

  parkGuell(k) {
    const mosaic = ['#2e9be0', '#e8c547', '#e05a3a', '#4bb34f', '#ffffff']
    for (const [x, z, roofC] of [[-12, -10, '#7a4a32'], [12, -10, '#ffffff']]) {
      k.box(7, 7, 7, '#d9b88f', x, 0, z)
      k.dome(5, roofC, x, 7, z, { sy: 1.4 })
      k.cyl(0.5, 0.9, 6, '#ffffff', x, 12, z, { seg: 8 })
      k.sphere(0.7, '#2e9be0', x, 18.4, z)
      k.colBox(x, z, 8, 8, 14)
    }
    for (let i = 0; i < 40; i++) {
      const x = -20 + i
      const z = 10 + Math.sin(i * 0.5) * 2.5
      k.box(1.05, 1.4, 1.2, mosaic[i % mosaic.length], x, 0, z)
      k.colBox(x, z, 1.05, 1.2, 1.4)
    }
    k.box(2, 1.6, 5, '#3fa05a', 0, 0, 0)
    k.box(1.4, 1.2, 1.8, '#e8c547', 0, 0.8, 3)
    k.box(0.5, 0.5, 0.5, '#e05a3a', 0, 1.8, 3.5)
  },

  tajMahal(k) {
    const m = mat('#f6f2ea', { emissive: '#ffe1c9', ei: 0.35, night: true })
    const pz = -26
    k.box(52, 3, 50, '#e9e3d6', 0, 0, pz)
    k.cyl(15, 15, 22, m, 0, 3, pz, { seg: 8, ry: PI / 8 })
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * PI * 2
      k.box(7, 13, 0.4, '#d8cbb4', Math.sin(a) * 14.05, 5, pz + Math.cos(a) * 14.05, { ry: a })
      k.box(5, 10, 0.5, '#4b4a4f', Math.sin(a) * 14.1, 5, pz + Math.cos(a) * 14.1, { ry: a })
    }
    k.cyl(8.5, 8.5, 5, m, 0, 25, pz, { seg: 16 })
    onion(k, 9.5, 20, m, 0, 30, pz)
    k.cyl(0.15, 0.3, 4, C.gold, 0, 50, pz, { seg: 6 })
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      chhatri(k, sx * 9, 25, pz + sz * 9, 1.3, m)
      const x = sx * 23
      const z = pz + sz * 22
      k.cyl(1.3, 1.8, 30, m, x, 3, z, { seg: 10 })
      k.ring(2, 0.3, m, x, 13, z, { ts: 12 })
      k.ring(1.8, 0.3, m, x, 23, z, { ts: 12 })
      chhatri(k, x, 33, z, 0.9, m)
    }
    k.box(6, 0.4, 46, mat('#3ab4d8', { metal: 0.2, rough: 0.06, emissive: '#1a87b0', ei: 0.35 }), 0, 0, 25)
    k.box(9, 0.3, 48, '#e9e3d6', 0, 0, 25)
    for (const sx of [-1, 1]) {
      k.box(12, 0.2, 48, C.grass, sx * 12, 0, 25)
      for (let i = 0; i < 8; i++) {
        k.cone(1.4, 6, '#2f5f3a', sx * 6.5, 0, 4 + i * 6, { seg: 6 })
        k.colCyl(sx * 6.5, 4 + i * 6, 1, 6)
      }
    }
    k.colBox(0, pz, 52, 50, 50)
    k.colBox(0, 25, 7, 46, 1)
  },

  agraFort(k) {
    const red = '#a8473a'
    for (const sx of [-1, 1]) {
      k.box(18, 12, 6, red, sx * 19, 0, 0)
      for (let i = 0; i < 6; i++) k.box(1.6, 1.6, 6.2, '#93392e', sx * (11 + i * 3.2), 12, 0)
      k.cyl(3.8, 4.4, 17, red, sx * 7, 0, 0, { seg: 8 })
      chhatri(k, sx * 7, 17, 0, 1.6, C.marble)
      k.colBox(sx * 19, 0, 18, 6, 12)
      k.colCyl(sx * 7, 0, 4.4, 17)
    }
    k.box(6, 4, 6, red, 0, 11, 0)
    k.torus(3, 0.5, '#93392e', 0, 9, 3, { arc: PI, ts: 12 })
    k.torus(3, 0.5, '#93392e', 0, 9, -3, { arc: PI, ts: 12 })
  },

  transamerica(k) {
    const w = mat('#efeeea', { emissive: '#ffffff', ei: 0.15, night: true })
    k.pyr(9, 82, w)
    for (const sx of [-1, 1]) k.box(3.4, 62, 7, w, sx * 6.5, 0, 0, { rz: -sx * 0.06 })
    k.cyl(0, 1.2, 22, '#e0e0de', 0, 76, 0, { seg: 4, ry: PI / 4 })
    k.cyl(0.4, 0.4, 0.8, mat('#ff2a2a', { emissive: '#ff2a2a', ei: 3 }), 0, 98, 0, { seg: 6 })
    k.colBox(0, 0, 20, 18, 60)
  },

  paintedLadies(k) {
    const cols = ['#f2b6c6', '#a8d8e8', '#f6e3a1', '#b8e0b0', '#d9c3f0', '#f7c59f']
    const trims = ['#ffffff', '#4d6b8a', '#8a4d6b']
    for (let i = 0; i < 6; i++) {
      const x = -18 + i * 7.2
      k.box(6.6, 11, 10, cols[i], x, 0, -12)
      k.prism(6.8, 4.5, 10.2, '#5a4e5c', x, 11, -12)
      k.box(3, 7, 1.6, trims[i % 3], x - 1, 1.5, -6.4)
      for (let r = 0; r < 2; r++) k.box(1.6, 2.2, 0.3, nightGlow(C.dark, '#ffd78a', 1.2), x - 1, 3 + r * 3.4, -5.55)
      k.box(1.4, 2.8, 0.3, '#3b2d2a', x + 2, 0, -6.95)
    }
    k.colBox(0, -12, 46, 10, 16)
    for (let i = 0; i < 4; i++) {
      const x = -15 + i * 10
      k.cyl(0.4, 0.5, 3, '#6b4a30', x, 0, 10)
      k.sphere(2.4, '#4f9a45', x, 4.4, 10, { seg: 8 })
      k.colCyl(x, 10, 0.6, 4)
    }
  },

  coitTower(k) {
    k.cyl(14, 20, 6, '#5f9a4a', 0, 0, 0, { seg: 12 })
    k.cyl(3.6, 3.6, 28, '#f1ece0', 0, 6, 0, { seg: 16 })
    k.cyl(4, 4, 3, '#f7f3ea', 0, 34, 0, { seg: 16 })
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * PI * 2
      k.box(1, 2, 0.3, nightGlow(C.dark, '#ffe2a0', 1.6), Math.sin(a) * 4.05, 34.4, Math.cos(a) * 4.05, { ry: a })
    }
    k.colCyl(0, 0, 20, 30)
  },

  brandenburg(k) {
    const s = '#d5c7a4'
    const xs = [-17.5, -10.5, -3.5, 3.5, 10.5, 17.5]
    for (const x of xs) {
      for (const z of [-3.5, 3.5]) k.cyl(0.8, 0.95, 14, s, x, 0, z, { seg: 12 })
      k.box(1.8, 14, 6, '#cdbf9c', x, 0, 0)
      k.colBox(x, 0, 2, 9, 14)
    }
    k.box(39, 3, 10, s, 0, 14, 0)
    k.box(16, 4, 8, s, 0, 17, 0)
    const cu = '#5e9a83'
    k.box(3, 1.6, 2, cu, 0, 21, 0)
    for (let i = 0; i < 4; i++) {
      const x = -2.4 + i * 1.6
      k.box(0.8, 1.6, 3, cu, x, 21, 2.2)
      k.box(0.6, 1, 0.9, cu, x, 22.4, 3.6)
    }
    k.cyl(0.3, 0.4, 2, cu, 0, 22.6, -0.4, { seg: 6 })
    k.beam([0, 22.8, -0.4], [0.2, 26.8, 0], 0.15, cu)
    for (const sx of [-1, 1]) {
      k.box(6, 10, 10, s, sx * 23, 0, -1)
      k.prism(6, 2.4, 10.4, s, sx * 23, 10, -1)
      k.colBox(sx * 23, -1, 6, 10, 10)
    }
  },

  tvTower(k) {
    k.cyl(11, 13, 6, '#c5c9cc', 0, 0, 0, { seg: 8 })
    k.cyl(2.4, 4.4, 94, '#e9eaea', 0, 6, 0, { seg: 14 })
    k.sphere(8, mat('#b9c2c9', { metal: 0.7, rough: 0.28 }), 0, 100, 0, { seg: 20, seg2: 14 })
    k.cyl(8.12, 8.12, 1.8, mat('#2a3540', { emissive: '#ffd994', ei: 1.4, night: true }), 0, 97.6, 0, { seg: 24 })
    for (let i = 0; i < 6; i++) k.cyl(0.9 - i * 0.1, 1 - i * 0.1, 5, i % 2 ? '#ffffff' : '#d23a2e', 0, 107 + i * 5, 0, { seg: 8 })
    k.cyl(0.4, 0.4, 0.6, mat('#ff2a2a', { emissive: '#ff2a2a', ei: 3 }), 0, 137, 0, { seg: 6 })
    k.colCyl(0, 0, 13, 20)
  },

  reichstag(k) {
    const s = '#bdb29a'
    k.box(42, 15, 28, s)
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      k.box(8, 19, 8, s, sx * 19, 0, sz * 12)
      k.colBox(sx * 19, sz * 12, 8, 8, 19)
    }
    for (let i = 0; i < 6; i++) k.cyl(0.8, 0.9, 12, '#d6cdb6', -7.5 + i * 3, 1, 14.6, { seg: 10 })
    k.prism(18, 3.6, 2, s, 0, 13, 14.6)
    k.dome(7.5, C.glass, 0, 15, 0, { seg: 20 })
    for (let r = 1; r < 4; r++) k.ring(7.5 * Math.cos((r / 4) * (PI / 2)), 0.12, '#cfd6da', 0, 15 + 7.5 * Math.sin((r / 4) * (PI / 2)), 0, { ts: 24 })
    k.cyl(0.1, 0.1, 4, '#cccccc', -19, 19, 12, { seg: 6 })
    k.box(2.4, 0.5, 0.1, '#111111', -17.8, 22.1, 12)
    k.box(2.4, 0.5, 0.1, '#dd0000', -17.8, 21.6, 12)
    k.box(2.4, 0.5, 0.1, '#ffcc00', -17.8, 21.1, 12)
    k.colBox(0, 0, 42, 28, 20)
  },

  windmills(k) {
    k.box(60, 0.15, 7, C.water, 0, 0, 10)
    windmill(k, -14, -6, 1.15)
    windmill(k, 2, -12, 1, '#4c6b4a')
    windmill(k, 16, -4, 0.9, '#7a5a3a')
    for (const [x, z] of [[-4, 0], [8, 2]]) {
      k.box(5, 4, 6, '#3e6b4f', x, 0, z)
      k.prism(5.4, 3, 6.4, '#a33a2a', x, 4, z, { ry: 0 })
      k.colBox(x, z, 5, 6, 6)
    }
  },

  canalHouses(k) {
    const bricks = ['#6b3a2e', '#3e2a26', '#8b5a3c', '#2d3a3f', '#a8643f', '#4a5a3a', '#7a2e2a']
    for (let i = 0; i < 7; i++) {
      const x = -21 + i * 6
      const h = 13 + ((i * 7) % 4) * 1.5
      k.box(5.6, h, 9, bricks[i], x, 0, -12)
      k.box(4.2, 1.6, 1, bricks[i], x, h, -7.9)
      k.box(2.8, 1.4, 1, bricks[i], x, h + 1.6, -7.9)
      k.box(1.4, 1.2, 1, bricks[i], x, h + 3, -7.9)
      k.prism(5.6, 3, 8, '#3a3a3a', x, h, -12.5)
      for (let r = 0; r < 4; r++) for (const dx of [-1.3, 1.3]) k.box(1.3, 1.9, 0.25, nightGlow('#f5f1e8', '#ffd890', 0.9), x + dx, 1.6 + r * 3, -7.45)
    }
    k.colBox(0, -12, 42, 9, 18)
    k.box(56, 0.2, 9, C.water, 0, 0, 4)
    k.torus(4.6, 0.8, '#7b6a5c', 0, -2.4, 4, { arc: PI, ry: PI / 2, ts: 12 })
    k.box(4, 0.6, 9.6, '#8a786a', 0, 2.1, 4)
  },

  rijksmuseum(k) {
    const brick = '#9a4a3a'
    const slate = '#3d4650'
    for (const sx of [-1, 1]) {
      k.box(19, 16, 18, brick, sx * 13.5, 0, 0)
      k.prism(18, 6, 19, slate, sx * 13.5, 16, 0, { ry: PI / 2 })
      k.box(6, 27, 6, brick, sx * 6.5, 0, 6)
      k.pyr(3.2, 9, slate, sx * 6.5, 27, 6)
      for (let i = 0; i < 4; i++) k.box(2, 3.2, 0.3, nightGlow('#2f2a26', '#ffd890', 1), sx * (8 + i * 4.2), 8, 9.1)
      k.colBox(sx * 13.5, 0, 19, 18, 16)
    }
    k.box(8, 10, 18, brick, 0, 6, 0)
    k.prism(8, 4, 18, slate, 0, 16, 0)
    k.torus(4, 0.4, '#c9b48f', 0, 6, 9.1, { arc: PI, ts: 12 })
  },
}

// Decorative far-away scenery (no colliders, not visited).
export const BACKDROPS = {
  bosphorusBridge(k) { suspensionBridge(k, '#d9dee3', 260, 64, 20) },
  goldenGate(k) { suspensionBridge(k, '#c0362c', 260, 76, 22) },
  fuji(k) {
    k.cone(260, 210, mat('#5c7290', { fog: false }), 0, 0, 0, { seg: 28 })
    k.cone(92, 74, mat('#f4f7fb', { fog: false }), 0, 136, 0, { seg: 28 })
  },
  sugarloaf(k) {
    k.sphere(60, mat('#4f6e45', { fog: false }), 0, 30, 0, { sy: 2.1, seg: 14, seg2: 10 })
    k.sphere(40, mat('#55764a', { fog: false }), 110, 10, 30, { sy: 1.5, seg: 12, seg2: 8 })
  },
  desertDunes(k) {
    for (let i = 0; i < 6; i++) k.sphere(120 + i * 15, mat('#d9b880', { fog: false }), (i - 3) * 200, -60, (i % 2) * 60, { sy: 0.35, seg: 12, seg2: 6 })
  },
  hills(k) {
    for (let i = 0; i < 5; i++) k.sphere(160, mat('#6f8f5e', { fog: false }), (i - 2) * 280, -90, (i % 2) * 80, { sy: 0.5, seg: 12, seg2: 6 })
  },
  mountains(k) {
    for (let i = 0; i < 9; i++) k.cone(200 + (i % 3) * 60, 90 + (i % 2) * 70 + (i % 3) * 20, mat('#8796ab', { fog: false }), (i - 4) * 240, 0, (i % 2) * 120, { seg: 7 })
  },
  harbourSkyline(k) {
    for (let i = 0; i < 18; i++) k.box(30, 40 + ((i * 37) % 70), 30, mat('#a9b8c8', { fog: false, emissive: '#ffe0a0', ei: 0.35, night: true }), (i - 9) * 40, 0, (i % 3) * 30)
  },
}

const bbCache = new Map()
function billboardMat(text, color) {
  const key = text + color
  if (bbCache.has(key)) return bbCache.get(key)
  const c = document.createElement('canvas')
  c.width = 256
  c.height = 172
  const g = c.getContext('2d')
  const grd = g.createLinearGradient(0, 0, 256, 172)
  grd.addColorStop(0, '#05010f')
  grd.addColorStop(1, '#1a0630')
  g.fillStyle = grd
  g.fillRect(0, 0, 256, 172)
  g.strokeStyle = color
  g.lineWidth = 8
  g.strokeRect(8, 8, 240, 156)
  g.fillStyle = color
  g.font = 'bold 34px system-ui, sans-serif'
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.shadowColor = color
  g.shadowBlur = 16
  g.fillText(text, 128, 86)
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  const m = new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: 0xffffff, emissiveIntensity: 1.1, roughness: 0.6 })
  bbCache.set(key, m)
  return m
}

// Hot-air balloons drifting over Cappadocia.
export function buildBalloons(count, area, seed = 11) {
  const k = new Kit()
  const rng = mulberry32(seed)
  const cols = ['#e63946', '#f4a261', '#2a9d8f', '#e9c46a', '#8338ec', '#ff006e', '#3a86ff', '#06d6a0']
  const items = []
  for (let i = 0; i < count; i++) {
    const g = k.sub((rng() - 0.5) * area, 40 + rng() * 70, (rng() - 0.5) * area, true)
    k.within(g, () => {
      const c = cols[i % cols.length]
      const c2 = cols[(i + 3) % cols.length]
      k.sphere(6, c, 0, 8, 0, { sy: 1.15, seg: 14, seg2: 10 })
      k.ring(5.6, 0.7, c2, 0, 9, 0, { ts: 18 })
      k.cone(3.2, 4, c, 0, 1.8, 0, { seg: 12, rx: PI })
      k.box(1.6, 1.2, 1.6, '#7a5230', 0, -1.4, 0)
      k.cone(0.45, 1, mat('#ffb347', { emissive: '#ff8c1a', ei: 2.5 }), 0, -0.2, 0, { seg: 6 })
    })
    items.push({ g, phase: rng() * 10, base: g.position.y, vx: (rng() - 0.5) * 1.2, vz: (rng() - 0.5) * 1.2 })
  }
  const update = (t, dt) => {
    for (const b of items) {
      b.g.position.y = b.base + Math.sin(t * 0.3 + b.phase) * 4
      b.g.position.x += b.vx * dt
      b.g.position.z += b.vz * dt
      if (Math.abs(b.g.position.x) > area * 0.7) b.vx *= -1
      if (Math.abs(b.g.position.z) > area * 0.7) b.vz *= -1
    }
  }
  return { group: k.group, update }
}

export function buildLandmark(type) {
  const k = new Kit()
  const fn = LANDMARKS[type] ?? BACKDROPS[type]
  fn(k)
  mergeStatic(k.group)
  return { group: k.group, colliders: k.colliders, update: k.updates.length ? (t, dt) => k.updates.forEach((u) => u(t, dt)) : null }
}
