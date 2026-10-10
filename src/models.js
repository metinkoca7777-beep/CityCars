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
// col: 'keep' = keep the procedural colliders, 'box' | 'cyl' | 'legs' = derive from the model's bounds,
//      'each' = one cylinder per copy, 'none' = no colliders (flat sites you can drive across).
// copies: [x, z, size, rotation, fileIndex] — several instances, optionally of different `files`.
// base: extra procedural parts drawn under/around the model (islands, pedestals...).
export const MODELS = {
  agraFort: { fit: 'max', size: 58, col: 'box', shrink: 0.9 },
  arcTriomphe: { fit: 'width', size: 31, col: 'keep', detail: 'stone', tint: '#efe3c8' },
  bigBen: { fit: 'height', size: 72, col: 'box', shrink: 0.9 },
  blueMosque: { fit: 'max', size: 58, col: 'box', shrink: 0.75, tint: '#cdc6ba', detail: 'stone' },
  brandenburg: { fit: 'width', size: 56, col: 'keep' },
  burjAlArab: { fit: 'height', size: 64, y: 2, col: 'keep', base: 'island' },
  burjKhalifa: { fit: 'height', size: 180, col: 'box', shrink: 0.7 },
  canalHouses: { files: ['canalHouse1', 'canalHouse2', 'canalHouse3'], fit: 'height', copies: [[-18, 0, 17, 0], [0, 0, 19, 0, 1], [18, 0, 18, 0, 2]], col: 'each', shrink: 0.8 },
  christRedeemer: { fit: 'height', size: 19, y: 30, col: 'keep', base: 'corcovado', detail: 'marble' },
  citadelMosque: { fit: 'max', size: 54, col: 'box', shrink: 0.75 },
  colosseum: { fit: 'max', size: 56, col: 'cyl', shrink: 0.92 },
  eiffel: { fit: 'height', size: 98, col: 'legs', tint: '#9c7a5c', glow: '#ffb257' },
  empireState: { fit: 'height', size: 132, col: 'box', shrink: 0.85, glow: '#9fc4ff', detail: 'stone', tint: '#e2dccd' },
  fairyChimneys: { file: 'fairyChimney', fit: 'height', copies: [[-14, -10, 24, 0], [12, -12, 19, 1.2], [-4, 12, 28, 2.3], [17, 14, 16, 4]], col: 'each', shrink: 0.5, tint: '#d8b98e', detail: 'concrete' },
  galataTower: { fit: 'height', size: 52, col: 'cyl', shrink: 0.85 },
  goreme: { fit: 'max', size: 56, col: 'box', shrink: 0.8, tint: '#d9ba8f', detail: 'concrete' },
  hagiaSophia: { fit: 'max', size: 58, col: 'box', shrink: 0.75 },
  loveValley: { file: 'fairyChimney', fit: 'height', copies: [[-16, 0, 34, 0.5], [0, -15, 30, 2], [15, 8, 37, 3.5], [-3, 16, 26, 5]], col: 'each', shrink: 0.45, tint: '#e0c49c', detail: 'concrete' },
  maidensTower: { fit: 'max', size: 14, y: 2.2, col: 'keep', base: 'maidenIsland' },
  maracana: { fit: 'max', size: 60, col: 'none' },
  meijiTorii: { file: 'torii', fit: 'max', size: 21, z: 10, ry: PI / 2, col: 'keep', base: 'meijiShrine' },
  notreDame: { fit: 'max', size: 58, col: 'box', shrink: 0.8 },
  operaHouse: { fit: 'max', size: 60, y: -4, col: 'box', shrink: 0.85 },
  paintedLadies: { fit: 'width', size: 50, col: 'box', shrink: 0.85 },
  panathenaic: { fit: 'max', size: 58, col: 'none' },
  parthenon: { fit: 'max', size: 40, y: 5, col: 'keep', base: 'acropolis', detail: 'marble', tint: '#f3ead8' },
  pyramids: { file: 'pyramid', fit: 'max', size: 128, bright: 1.7, col: 'box', shrink: 0.45 },
  reichstag: { fit: 'max', size: 56, col: 'box', shrink: 0.85 },
  rijksmuseum: { fit: 'max', size: 58, col: 'box', shrink: 0.9 },
  sagrada: { fit: 'max', size: 56, col: 'box', shrink: 0.75 },
  sensoji: { fit: 'height', size: 36, col: 'keep', base: 'kaminarimon' },
  sphinx: { fit: 'max', size: 52, bright: 1.8, col: 'box', shrink: 0.6 },
  statueLiberty: { fit: 'height', size: 46, y: 4, col: 'keep', base: 'libertyFort' },
  stPeters: { fit: 'max', size: 60, col: 'none' },
  tajMahal: { fit: 'max', size: 120, col: 'box', shrink: 0.55, tint: '#f6f2ea', detail: 'marble' },
  tokyoTower: { fit: 'height', size: 100, col: 'legs' },
  towerBridge: { fit: 'max', size: 58, col: 'keep' },
  transamerica: { fit: 'height', size: 100, col: 'box', shrink: 0.7, tint: '#ece8df', detail: 'concrete' },
  tvTower: { fit: 'height', size: 128, col: 'cyl', shrink: 0.35, glow: '#ffd994', detail: 'concrete' },
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
    // Decimated scans ship without normals to save space; smooth normals look far better than flat facets.
    if (!m.geometry.attributes.normal) m.geometry.computeVertexNormals()
    m.castShadow = true
    m.receiveShadow = true
    const mats = Array.isArray(m.material) ? m.material : [m.material]
    const out = mats.map((src) => {
      const mm = src.clone()
      if (tint) mm.color.multiply(tint)
      if (cfg.bright) mm.color.multiplyScalar(cfg.bright)
      if ('metalness' in mm) mm.metalness = Math.min(mm.metalness, 0.3)
      if (cfg.detail && !mm.map) addDetail(mm, cfg.detail)
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
  const files = cfg.files ?? [cfg.file ?? id]
  const gltfs = await Promise.all(files.map(loadModel))
  const group = new THREE.Group()
  const mixers = []
  const copies = cfg.copies ?? [[cfg.x ?? 0, cfg.z ?? 0, cfg.size, cfg.ry ?? 0]]
  for (const [x, z, size, ry, fi] of copies) {
    const { holder, mixer, clips } = fitted(gltfs[fi ?? 0], cfg, size, night)
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

// ---- triplanar surface detail for untextured models (stone blocks / marble / concrete) ----
const detailTextures = {}
function detailTexture(kind) {
  if (detailTextures[kind]) return detailTextures[kind]
  const N = 256
  const c = document.createElement('canvas')
  c.width = c.height = N
  const g = c.getContext('2d')
  const img = g.createImageData(N, N)
  let seed = kind.length * 977
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
  const noise = new Float32Array(N * N).map(() => rnd())
  const smooth = (x, y) => {
    let v = 0
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) v += noise[((y + dy + N) % N) * N + ((x + dx + N) % N)]
    return v / 25
  }
  const rows = kind === 'stone' ? 8 : 4
  const cols = kind === 'stone' ? 4 : 2
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      let v = 0.86 + (smooth(x, y) - 0.5) * 0.35 + (noise[y * N + x] - 0.5) * 0.06
      if (kind === 'marble') v = 0.93 + Math.sin((x + y * 0.6) * 0.05 + smooth(x, y) * 9) * 0.04 + (noise[y * N + x] - 0.5) * 0.03
      const row = Math.floor((y / N) * rows)
      const bx = (x + (row % 2 ? N / cols / 2 : 0)) % (N / cols)
      const by = y % (N / rows)
      if (kind !== 'concrete' && (by < 2 || bx < 2)) v *= kind === 'stone' ? 0.72 : 0.9
      if (kind === 'concrete') v = 0.9 + (smooth(x, y) - 0.5) * 0.2 + (by < 1 ? -0.1 : 0)
      const b = Math.max(0, Math.min(255, v * 255))
      const i = (y * N + x) * 4
      img.data[i] = img.data[i + 1] = img.data[i + 2] = b
      img.data[i + 3] = 255
    }
  }
  g.putImageData(img, 0, 0)
  const tex = new THREE.CanvasTexture(c)
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  tex.anisotropy = 4
  detailTextures[kind] = tex
  return tex
}

function addDetail(mat, kind) {
  const tex = detailTexture(kind)
  const scale = kind === 'stone' ? 0.22 : kind === 'marble' ? 0.12 : 0.08
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.detailMap = { value: tex }
    sh.uniforms.detailScale = { value: scale }
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vDPos;\nvarying vec3 vDNrm;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvDPos = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvDNrm = normalize(mat3(modelMatrix) * objectNormal);')
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform sampler2D detailMap;\nuniform float detailScale;\nvarying vec3 vDPos;\nvarying vec3 vDNrm;')
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
        vec3 bw = pow(abs(normalize(vDNrm)), vec3(4.0));
        bw /= (bw.x + bw.y + bw.z);
        vec3 det = texture2D(detailMap, vDPos.zy * detailScale).rgb * bw.x + texture2D(detailMap, vDPos.xz * detailScale).rgb * bw.y + texture2D(detailMap, vDPos.xy * detailScale).rgb * bw.z;
        diffuseColor.rgb *= det * 1.08;`,
      )
  }
  mat.customProgramCacheKey = () => 'detail-' + kind
  mat.needsUpdate = true
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
  libertyFort(k) {
    k.box(24, 4, 24, '#a49a86')
    k.box(24, 4, 24, '#a49a86', 0, 0, 0, { ry: PI / 4 })
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
