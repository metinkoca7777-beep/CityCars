// Detailed landmark models (glTF, CC BY 4.0 — see CREDITS.md) that replace the
// procedural stand-ins once loaded. If a file fails to load, the procedural
// version simply stays in place, so the game never breaks.
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js'
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js'
import { Kit } from './landmarks.js'
import { mat, mergeStatic } from './materials.js'

const PI = Math.PI

// fit: which dimension `size` (metres) applies to — 'height', 'width' (x) or 'max' (largest horizontal side).
// col: 'keep' = keep the procedural colliders, 'box' | 'cyl' | 'legs' = derive from the model's bounds.
// base: extra procedural parts drawn under/around the model (islands, pedestals...).
export const MODELS = {
  arcTriomphe: { fit: 'width', size: 31, col: 'keep' },
  bigBen: { fit: 'height', size: 72, col: 'box', shrink: 0.9 },
  burjAlArab: { fit: 'height', size: 64, y: 2, col: 'keep', base: 'island' },
  burjKhalifa: { fit: 'height', size: 180, col: 'box', shrink: 0.7 },
  christRedeemer: { fit: 'height', size: 19, y: 30, col: 'keep', base: 'corcovado' },
  colosseum: { fit: 'max', size: 56, col: 'cyl', shrink: 0.92 },
  eiffel: { fit: 'height', size: 98, col: 'legs', tint: '#9c7a5c', glow: '#ffb257' },
  empireState: { fit: 'height', size: 132, col: 'box', shrink: 0.85, glow: '#9fc4ff' },
  hagiaSophia: { fit: 'max', size: 56, col: 'box', shrink: 0.75, tint: '#ffd9b8' },
  galataTower: { fit: 'height', size: 46, col: 'cyl', shrink: 0.8 },
  maidensTower: { fit: 'max', size: 14, y: 2.2, col: 'keep', base: 'maidenIsland' },
  parthenon: { fit: 'max', size: 40, y: 5, col: 'keep', base: 'acropolis' },
  sensoji: { fit: 'height', size: 36, col: 'keep', base: 'kaminarimon' },
  statueLiberty: { fit: 'height', size: 31, y: 17.2, col: 'keep', base: 'libertyIsland' },
  meijiTorii: { file: 'torii', fit: 'max', size: 21, z: 10, ry: PI / 2, col: 'keep', base: 'meijiShrine' },
  tvTower: { fit: 'height', size: 128, col: 'cyl', shrink: 0.35, glow: '#ffd994' },
  windmills: { file: 'windmill', copies: [[-14, -6, 21, 0.3], [2, -12, 19, -0.2], [16, -4, 17, 0.5]], col: 'keep', base: 'polder' },
}

export const BACKDROP_MODELS = {
  goldenGate: { fit: 'width', size: 460 },
}

const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder)
const cache = new Map()

export function loadModel(name) {
  if (!cache.has(name)) cache.set(name, loader.loadAsync(`./models/${name}.glb`))
  return cache.get(name)
}

// Returns an object scaled to `cfg`, with its base centred on the origin.
function fitted(gltf, cfg, size = cfg.size, night = false) {
  const obj = gltf.animations.length ? cloneSkinned(gltf.scene) : gltf.scene.clone(true)
  obj.updateMatrixWorld(true)
  const box = new THREE.Box3().setFromObject(obj)
  const s = box.getSize(new THREE.Vector3())
  const ref = cfg.fit === 'width' ? s.x : cfg.fit === 'max' ? Math.max(s.x, s.z) : s.y
  const k = size / ref
  const c = box.getCenter(new THREE.Vector3())
  const holder = new THREE.Group()
  obj.position.set(-c.x * k, -box.min.y * k, -c.z * k)
  obj.scale.multiplyScalar(k)
  holder.add(obj)
  const tint = cfg.tint ? new THREE.Color(cfg.tint) : null
  obj.traverse((m) => {
    if (!m.isMesh) return
    m.castShadow = true
    m.receiveShadow = true
    const mats = Array.isArray(m.material) ? m.material : [m.material]
    const out = mats.map((src) => {
      const mm = src.clone()
      if (tint) mm.color.multiply(tint)
      if ('metalness' in mm) mm.metalness = Math.min(mm.metalness, 0.3)
      if (night) {
        mm.emissive = new THREE.Color(cfg.glow ?? '#ffe2b0').multiplyScalar(0.35)
        if (mm.map) mm.emissiveMap = mm.map
      }
      return mm
    })
    m.material = Array.isArray(m.material) ? out : out[0]
  })
  return { holder, mixer: gltf.animations.length ? new THREE.AnimationMixer(obj) : null, clips: gltf.animations }
}

// Builds the replacement for a landmark. Resolves to { group, update } or null.
export async function buildModelLandmark(id, night) {
  const cfg = MODELS[id]
  if (!cfg) return null
  const gltf = await loadModel(cfg.file ?? id)
  const group = new THREE.Group()
  const mixers = []
  const copies = cfg.copies ?? [[cfg.x ?? 0, cfg.z ?? 0, cfg.size, cfg.ry ?? 0]]
  for (const [x, z, size, ry] of copies) {
    const { holder, mixer, clips } = fitted(gltf, cfg, size, night)
    holder.position.set(x, cfg.y ?? 0, z)
    holder.rotation.y = ry ?? 0
    group.add(holder)
    if (mixer) {
      for (const clip of clips) mixer.clipAction(clip).play()
      mixers.push(mixer)
    }
  }
  if (cfg.base && BASES[cfg.base]) {
    const k = new Kit()
    BASES[cfg.base](k)
    mergeStatic(k.group)
    group.add(k.group)
  }
  const update = mixers.length ? (t, dt) => mixers.forEach((m) => m.update(dt)) : null
  return { group, update, cfg }
}

export async function buildModelBackdrop(id) {
  const cfg = BACKDROP_MODELS[id]
  if (!cfg) return null
  const gltf = await loadModel(id)
  const { holder } = fitted(gltf, cfg)
  return holder
}

const water = () => mat('#2a9fc4', { metal: 0.2, rough: 0.12, emissive: '#0b5f86', ei: 0.25 })

// Procedural ground pieces that go with some of the models.
const BASES = {
  island(k) {
    k.cyl(22, 22, 0.25, water(), 0, 0.02, 0, { seg: 32 })
    k.cyl(13, 15, 2, '#e6d3a8', 0, 0, 0, { seg: 16 })
  },
  maidenIsland(k) {
    k.cyl(17, 17, 0.25, water(), 0, 0.02, 0, { seg: 32 })
    k.cyl(7.5, 9, 2.2, '#8c8273', 0, 0, 0, { seg: 10 })
  },
  corcovado(k) {
    k.cyl(6, 24, 26, '#4f7a3a', 0, 0, 0, { seg: 9 })
    k.cyl(4.5, 6.5, 4, '#7b7468', 0, 26, 0, { seg: 8 })
  },
  acropolis(k) {
    k.cyl(22, 25, 5, '#bba98a', 0, 0, 0, { seg: 9 })
  },
  libertyIsland(k) {
    k.box(24, 4, 24, '#a49a86')
    k.box(24, 4, 24, '#a49a86', 0, 0, 0, { ry: PI / 4 })
    k.box(10, 12, 10, '#b5ab98', 0, 4, 0)
    k.box(11.5, 1.2, 11.5, '#c2b8a4', 0, 16, 0)
  },
  kaminarimon(k) {
    const red = '#b8392a'
    const roof = '#3b4744'
    for (const sx of [-1, 1]) k.box(1.2, 8, 1.2, red, sx * 5, 0, 18)
    k.box(14, 1.4, 4, roof, 0, 8, 18)
    k.prism(14, 2.4, 4.4, roof, 0, 9.4, 18, { ry: PI / 2 })
    k.cyl(1.8, 1.8, 3.4, mat('#d22d22', { emissive: '#ff3a24', ei: 1.1, night: true }), 0, 3.6, 18, { seg: 14 })
  },
  meijiShrine(k) {
    k.box(16, 5, 10, '#8a5a3a', 0, 1, -12)
    k.box(18, 1, 12, '#cfc6b4', 0, 0, -12)
    k.prism(22, 6, 14, '#3f6b5a', 0, 6, -12, { ry: PI / 2 })
  },
  polder(k) {
    k.box(60, 0.15, 7, water(), 0, 0, 10)
    for (const [x, z] of [[-4, 0], [8, 2]]) {
      k.box(5, 4, 6, '#3e6b4f', x, 0, z)
      k.prism(5.4, 3, 6.4, '#a33a2a', x, 4, z)
    }
  },
}
