import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

const cache = new Map()

// Cached flat-shaded standard material; shared across the whole game.
export function mat(color, o = {}) {
  const key = `${color}|${o.rough ?? ''}|${o.metal ?? ''}|${o.emissive ?? ''}|${o.ei ?? ''}|${o.opacity ?? ''}|${o.flat ?? ''}|${o.side ?? ''}|${o.night ?? ''}|${o.fog ?? ''}`
  let m = cache.get(key)
  if (!m) {
    m = new THREE.MeshStandardMaterial({
      color,
      roughness: o.rough ?? 0.8,
      metalness: o.metal ?? 0,
      flatShading: o.flat ?? true,
      emissive: o.emissive ?? 0x000000,
      emissiveIntensity: o.ei ?? 1,
      transparent: o.opacity != null,
      opacity: o.opacity ?? 1,
      side: o.side ?? THREE.FrontSide,
      depthWrite: o.opacity == null || o.opacity > 0.7,
      fog: o.fog ?? true,
    })
    // Materials flagged "night" only glow when the city is in night/sunset mode.
    if (o.night) m.userData.nightEmissive = o.ei ?? 1
    cache.set(key, m)
  }
  return m
}

export function applyTimeOfDay(night, scale = 1) {
  for (const m of cache.values()) {
    if (m.userData.nightEmissive != null) m.emissiveIntensity = night ? m.userData.nightEmissive * scale : 0
  }
}

// Box UVs scaled in world units so a repeating window texture keeps a constant size.
// Roof/floor faces are mapped onto a solid corner of the texture.
export function boxUV(geo, w, h, d, tile = 24) {
  const uv = geo.attributes.uv
  for (let f = 0; f < 6; f++) {
    for (let i = 0; i < 4; i++) {
      const idx = f * 4 + i
      let u = uv.getX(idx)
      let v = uv.getY(idx)
      if (f === 2 || f === 3) {
        u = 0.004
        v = 0.004
      } else if (f === 0 || f === 1) {
        u *= d / tile
        v *= h / tile
      } else {
        u *= w / tile
        v *= h / tile
      }
      uv.setXY(idx, u, v)
    }
  }
  return geo
}

// Building facade texture: walls are white (tinted by vertex colors), windows dark.
// The emissive map lights a random subset of windows at night.
export function makeWindowTextures(seed = 1, style = 'modern') {
  const size = 512
  const cells = 8
  const c = document.createElement('canvas')
  c.width = c.height = size
  const g = c.getContext('2d')
  const e = document.createElement('canvas')
  e.width = e.height = size
  const ge = e.getContext('2d')
  ge.fillStyle = '#000000'
  ge.fillRect(0, 0, size, size)
  let s = seed
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647)
  // Plaster / concrete base with subtle grain (white so vertex colours tint it)
  const img = g.createImageData(size, size)
  for (let i = 0; i < size * size; i++) {
    const v = 236 + (rnd() - 0.5) * 22
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v
    img.data[i * 4 + 3] = 255
  }
  g.putImageData(img, 0, 0)
  const cell = size / cells
  const glass = style === 'modern'
  const sky = (x, y, h) => {
    const grd = g.createLinearGradient(x, y, x, y + h)
    grd.addColorStop(0, glass ? '#9cc3e4' : '#8fb2d0')
    grd.addColorStop(0.55, glass ? '#5f86a8' : '#4a6178')
    grd.addColorStop(1, glass ? '#3b5670' : '#2c3a48')
    return grd
  }
  if (glass) {
    // Curtain wall: continuous glass bands, slim mullions, spandrel strips
    for (let y = 0; y < cells; y++) {
      const py = y * cell
      g.fillStyle = sky(0, py, cell * 0.78)
      g.fillRect(0, py + cell * 0.18, size, cell * 0.78)
      g.fillStyle = 'rgba(210,220,228,1)'
      g.fillRect(0, py, size, cell * 0.18)
      g.fillStyle = 'rgba(255,255,255,0.18)'
      g.fillRect(0, py + cell * 0.2, size, 3)
      for (let x = 0; x <= cells * 2; x++) {
        g.fillStyle = '#c9d2da'
        g.fillRect(x * (cell / 2) - 1.5, py + cell * 0.18, 3, cell * 0.78)
      }
      for (let x = 0; x < cells * 2; x++) {
        if (rnd() < 0.3) {
          ge.fillStyle = `hsl(${40 + rnd() * 15}, 90%, ${55 + rnd() * 20}%)`
          ge.fillRect(x * (cell / 2) + 2, py + cell * 0.2, cell / 2 - 4, cell * 0.74)
        }
      }
    }
  } else {
    for (let y = 0; y < cells; y++) {
      for (let x = 0; x < cells; x++) {
        const px = x * cell
        const py = y * cell
        const ww = cell * 0.46
        const wh = cell * 0.6
        const wx = px + (cell - ww) / 2
        const wy = py + cell * 0.16
        // cornice line between floors
        g.fillStyle = 'rgba(0,0,0,0.06)'
        g.fillRect(px, py + cell - 3, cell, 3)
        // frame, glass, mullions, sill, shutters
        g.fillStyle = '#f7f5f0'
        g.fillRect(wx - 4, wy - 4, ww + 8, wh + 8)
        g.fillStyle = sky(wx, wy, wh)
        g.fillRect(wx, wy, ww, wh)
        g.fillStyle = '#f2efe8'
        g.fillRect(wx + ww / 2 - 1.5, wy, 3, wh)
        g.fillRect(wx, wy + wh * 0.38, ww, 3)
        g.fillStyle = 'rgba(255,255,255,0.25)'
        g.fillRect(wx + 3, wy + 3, ww * 0.35, wh * 0.25)
        g.fillStyle = '#d9d4ca'
        g.fillRect(wx - 7, wy + wh + 3, ww + 14, 6)
        g.fillStyle = 'rgba(0,0,0,0.18)'
        g.fillRect(wx - 7, wy + wh + 9, ww + 14, 3)
        if (seed % 2 === 1 && rnd() < 0.35) {
          g.fillStyle = rnd() < 0.5 ? '#5b7a5a' : '#8a5a3a'
          g.fillRect(wx - 4 - ww * 0.32, wy - 2, ww * 0.3, wh + 4)
          g.fillRect(wx + ww + 4 + 2, wy - 2, ww * 0.3, wh + 4)
        }
        if (rnd() < 0.4) {
          ge.fillStyle = `hsl(${38 + rnd() * 12}, 100%, ${55 + rnd() * 20}%)`
          ge.fillRect(wx, wy, ww, wh)
        }
      }
    }
  }
  const map = new THREE.CanvasTexture(c)
  map.wrapS = map.wrapT = THREE.RepeatWrapping
  map.colorSpace = THREE.SRGBColorSpace
  map.anisotropy = 8
  const emissiveMap = new THREE.CanvasTexture(e)
  emissiveMap.wrapS = emissiveMap.wrapT = THREE.RepeatWrapping
  emissiveMap.colorSpace = THREE.SRGBColorSpace
  return { map, emissiveMap }
}

// Tileable ground textures (asphalt, paving slabs, grass).
const groundCache = {}
export function groundTexture(kind) {
  if (groundCache[kind]) return groundCache[kind]
  const N = 256
  const c = document.createElement('canvas')
  c.width = c.height = N
  const g = c.getContext('2d')
  const img = g.createImageData(N, N)
  let s = kind.length * 131
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647)
  const base = { asphalt: [70, 72, 76], slab: [196, 190, 178], grass: [92, 138, 64], sand: [214, 190, 140], noise: [225, 225, 225] }[kind]
  for (let i = 0; i < N * N; i++) {
    const n = (rnd() - 0.5) * (kind === 'asphalt' ? 34 : kind === 'grass' ? 40 : 18)
    const k = kind === 'grass' ? 1 + (rnd() - 0.5) * 0.25 : 1
    img.data[i * 4] = base[0] * k + n
    img.data[i * 4 + 1] = base[1] * k + n
    img.data[i * 4 + 2] = base[2] * k + n * (kind === 'grass' ? 0.4 : 1)
    img.data[i * 4 + 3] = 255
  }
  g.putImageData(img, 0, 0)
  if (kind === 'slab') {
    g.strokeStyle = 'rgba(90,85,78,0.45)'
    g.lineWidth = 2
    for (let i = 0; i <= 4; i++) {
      g.beginPath(); g.moveTo(i * 64, 0); g.lineTo(i * 64, N); g.stroke()
      g.beginPath(); g.moveTo(0, i * 64); g.lineTo(N, i * 64); g.stroke()
    }
  }
  if (kind === 'asphalt') {
    for (let i = 0; i < 6; i++) {
      g.strokeStyle = 'rgba(30,30,32,0.35)'
      g.lineWidth = 1 + rnd() * 2
      g.beginPath()
      let x = rnd() * N
      let y = rnd() * N
      g.moveTo(x, y)
      for (let k = 0; k < 6; k++) g.lineTo((x += (rnd() - 0.5) * 40), (y += (rnd() - 0.5) * 40))
      g.stroke()
    }
  }
  const tex = new THREE.CanvasTexture(c)
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 8
  groundCache[kind] = tex
  return tex
}

const facadeTextures = {}
const facadeCache = new Map()

// Building facade material with procedural windows that light up at night.
export function facadeMat(color = 0xffffff, style = 'classic', vertexColors = false) {
  const key = `${color}|${style}|${vertexColors}`
  let m = facadeCache.get(key)
  if (!m) {
    if (!facadeTextures[style]) facadeTextures[style] = makeWindowTextures(style === 'modern' ? 7 : 13, style)
    const { map, emissiveMap } = facadeTextures[style]
    m = new THREE.MeshStandardMaterial({
      color,
      map,
      emissiveMap,
      emissive: 0xffffff,
      emissiveIntensity: 0,
      roughness: style === 'modern' ? 0.22 : 0.85,
      metalness: style === 'modern' ? 0.35 : 0,
      vertexColors,
      flatShading: true,
    })
    m.userData.nightEmissive = 0.75
    cache.set('facade|' + key, m)
    facadeCache.set(key, m)
  }
  return m
}

// Merge every static mesh under `root` into one mesh per material (huge draw-call saving).
// Subtrees flagged with userData.dynamic are left untouched.
export function mergeStatic(root, { castShadow = true, receiveShadow = true } = {}) {
  root.updateMatrixWorld(true)
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert()
  const buckets = new Map()
  const toRemove = []
  const visit = (obj) => {
    for (const child of obj.children) {
      if (child.userData.dynamic) continue
      if (child.isMesh && !child.isInstancedMesh) {
        let g = child.geometry.index ? child.geometry.toNonIndexed() : child.geometry.clone()
        g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, child.matrixWorld))
        for (const name of Object.keys(g.attributes)) {
          if (name !== 'position' && name !== 'normal' && name !== 'uv' && name !== 'color') g.deleteAttribute(name)
        }
        if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2))
        if (!g.attributes.normal) g.computeVertexNormals()
        const hasColor = !!g.attributes.color
        const key = child.material.uuid + (hasColor ? 'c' : '')
        if (!buckets.has(key)) buckets.set(key, { material: child.material, geos: [] })
        buckets.get(key).geos.push(g)
        toRemove.push(child)
      }
      visit(child)
    }
  }
  visit(root)
  for (const m of toRemove) m.parent.remove(m)
  for (const { material, geos } of buckets.values()) {
    const merged = mergeGeometries(geos, false)
    if (!merged) continue
    const mesh = new THREE.Mesh(merged, material)
    mesh.castShadow = castShadow && !material.transparent
    mesh.receiveShadow = receiveShadow
    root.add(mesh)
  }
  return root
}
