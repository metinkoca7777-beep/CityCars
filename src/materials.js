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
  const size = 256
  const cells = 8
  const c = document.createElement('canvas')
  c.width = c.height = size
  const g = c.getContext('2d')
  const e = document.createElement('canvas')
  e.width = e.height = size
  const ge = e.getContext('2d')
  g.fillStyle = '#ffffff'
  g.fillRect(0, 0, size, size)
  ge.fillStyle = '#000000'
  ge.fillRect(0, 0, size, size)
  let s = seed
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647)
  const cell = size / cells
  const glass = style === 'modern'
  for (let y = 0; y < cells; y++) {
    for (let x = 0; x < cells; x++) {
      const px = x * cell
      const py = y * cell
      const mw = glass ? 0.12 : 0.28
      const mh = glass ? 0.14 : 0.22
      const wx = px + cell * mw
      const wy = py + cell * mh
      const ww = cell * (1 - mw * 2)
      const wh = cell * (1 - mh * 2)
      g.fillStyle = glass ? `hsl(205, 30%, ${28 + rnd() * 18}%)` : `hsl(215, 25%, ${22 + rnd() * 14}%)`
      g.fillRect(wx, wy, ww, wh)
      if (!glass) {
        g.fillStyle = 'rgba(255,255,255,0.35)'
        g.fillRect(wx, wy + wh - 3, ww, 3)
      }
      if (rnd() < 0.42) {
        const warm = rnd()
        ge.fillStyle = warm < 0.7 ? `hsl(${38 + rnd() * 12}, 100%, ${55 + rnd() * 20}%)` : `hsl(${190 + rnd() * 30}, 80%, 70%)`
        ge.fillRect(wx, wy, ww, wh)
      }
    }
  }
  const map = new THREE.CanvasTexture(c)
  map.wrapS = map.wrapT = THREE.RepeatWrapping
  map.colorSpace = THREE.SRGBColorSpace
  map.anisotropy = 4
  const emissiveMap = new THREE.CanvasTexture(e)
  emissiveMap.wrapS = emissiveMap.wrapT = THREE.RepeatWrapping
  emissiveMap.colorSpace = THREE.SRGBColorSpace
  return { map, emissiveMap }
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
      roughness: style === 'modern' ? 0.4 : 0.85,
      metalness: style === 'modern' ? 0.25 : 0,
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
