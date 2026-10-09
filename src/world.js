// Builds a playable city: roads, blocks, buildings, landmarks, props, coins, traffic, sky and sea.
import * as THREE from 'three'
import * as CANNON from 'cannon-es'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { Sky } from 'three/examples/jsm/objects/Sky.js'
import { GRID } from './cities.js'
import { buildLandmark, buildBalloons, Kit } from './landmarks.js'
import { buildModelLandmark, buildModelBackdrop } from './models.js'
import { mat, facadeMat, boxUV, mergeStatic, applyTimeOfDay, groundTexture } from './materials.js'
import { mulberry32, hashString, pick } from './utils.js'
import { buildCarMesh, CARS } from './cars.js'

export const ROAD = 14
export const BLOCK = 60
export const CELL = ROAD + BLOCK
export const HALF = (GRID * CELL) / 2
const CURB = 0.15
const LANE = 3.4

export const roadLine = (i) => -HALF + i * CELL
export const blockCenter = (c) => -HALF + c * CELL + CELL / 2

const shadowCenter = new THREE.Vector3()

export class World {
  constructor(city, scene, physics, quality, renderer) {
    this.renderer = renderer
    this.city = city
    this.scene = scene
    this.physics = physics
    this.quality = quality
    this.root = new THREE.Group()
    scene.add(this.root)
    this.rng = mulberry32(hashString(city.id))
    this.night = city.time === 'night'
    this.updaters = []
    this.props = []
    this.landmarks = []
    this.coins = []
    this.bodies = []
    this.traffic = []
    this.time = 0
    this.treeSpots = []

    this.layout()
    this.buildSky()
    this.buildGround()
    this.buildRoads()
    this.buildLandmarks()
    this.buildBlocks()
    this.buildStreetFurniture()
    this.buildBoundary()
    this.buildBackdrops()
    this.buildProps()
    this.buildCoins()
    this.buildCheckpoints()
    this.buildTraffic()
    applyTimeOfDay(this.night || city.time === 'sunset', this.night ? 0.8 : 1)
  }

  // ---------- layout ----------
  layout() {
    const occupied = new Map()
    this.plazas = []
    for (const def of this.city.landmarks) {
      const [cx, cz] = def.cell
      const size = def.size ?? 1
      const x = size === 2 ? roadLine(cx + 1) : blockCenter(cx)
      const z = size === 2 ? roadLine(cz + 1) : blockCenter(cz)
      const half = size === 2 ? CELL - ROAD / 2 : BLOCK / 2
      const plaza = { def, x, z, half, size }
      this.plazas.push(plaza)
      for (let i = 0; i < size; i++) for (let j = 0; j < size; j++) occupied.set(`${cx + i},${cz + j}`, plaza)
    }
    this.occupied = occupied
    // Road segments between grid nodes; drop those swallowed by 2x2 plazas.
    const removed = new Set()
    for (const p of this.plazas) {
      if (p.size !== 2) continue
      const [cx, cz] = p.def.cell
      removed.add(`v${cx + 1},${cz}`)
      removed.add(`v${cx + 1},${cz + 1}`)
      removed.add(`h${cx},${cz + 1}`)
      removed.add(`h${cx + 1},${cz + 1}`)
    }
    this.segments = []
    const nodes = new Map()
    const node = (i, j) => {
      const key = `${i},${j}`
      if (!nodes.has(key)) nodes.set(key, { i, j, x: roadLine(i), z: roadLine(j), links: [] })
      return nodes.get(key)
    }
    for (let j = 0; j <= GRID; j++) {
      for (let i = 0; i < GRID; i++) {
        if (removed.has(`h${i},${j}`)) continue
        const a = node(i, j)
        const b = node(i + 1, j)
        a.links.push(b)
        b.links.push(a)
        this.segments.push({ a, b, horiz: true })
      }
    }
    for (let i = 0; i <= GRID; i++) {
      for (let j = 0; j < GRID; j++) {
        if (removed.has(`v${i},${j}`)) continue
        const a = node(i, j)
        const b = node(i, j + 1)
        a.links.push(b)
        b.links.push(a)
        this.segments.push({ a, b, horiz: false })
      }
    }
    this.nodes = [...nodes.values()].filter((n) => n.links.length > 0)
    const c = Math.floor(GRID / 2)
    this.spawn = { x: roadLine(c) + LANE, z: roadLine(c) + 10, heading: 0 }
  }

  addBody(body) {
    // cannon-es only refreshes a body's bounding box when it moves; static bodies positioned
    // after construction keep a stale box at the origin, which breaks raycasts (ramps) and
    // broadphase collisions (buildings). Refresh it explicitly.
    body.aabbNeedsUpdate = true
    body.updateAABB()
    this.physics.addBody(body)
    this.bodies.push(body)
    return body
  }

  staticBox(x, y, z, w, h, d, ry = 0, rx = 0) {
    const body = new CANNON.Body({ mass: 0, shape: new CANNON.Box(new CANNON.Vec3(w / 2, h / 2, d / 2)) })
    body.position.set(x, y + h / 2, z)
    if (ry || rx) body.quaternion.setFromEuler(rx, ry, 0)
    return this.addBody(body)
  }

  staticCyl(x, z, r, h) {
    const body = new CANNON.Body({ mass: 0, shape: new CANNON.Cylinder(r, r, h, 10) })
    body.position.set(x, h / 2, z)
    return this.addBody(body)
  }

  // ---------- sky & lights ----------
  buildSky() {
    const city = this.city
    const top = new THREE.Color(city.sky[0])
    const bottom = new THREE.Color(city.sky[1])
    const sunDir = new THREE.Vector3(...city.sunPos).normalize()
    this.sunDir = sunDir
    if (city.time === 'day') {
      // Physically based atmosphere (Preetham) + image-based lighting from it.
      const sky = new Sky()
      sky.scale.setScalar(4000)
      const u = sky.material.uniforms
      u.turbidity.value = 3.2
      u.rayleigh.value = 1.1
      u.mieCoefficient.value = 0.004
      u.mieDirectionalG.value = 0.82
      u.sunPosition.value.copy(sunDir)
      sky.frustumCulled = false
      sky.material.fog = false
      this.root.add(sky)
      this.sky = sky
      if (this.renderer) {
        const pmrem = new THREE.PMREMGenerator(this.renderer)
        const envScene = new THREE.Scene()
        const envSky = new Sky()
        envSky.scale.setScalar(900)
        for (const k of Object.keys(u)) envSky.material.uniforms[k].value = u[k].value
        envScene.add(envSky)
        this.envMap = pmrem.fromScene(envScene, 0.02, 0.1, 2000).texture
        pmrem.dispose()
        this.scene.environment = this.envMap
        this.scene.environmentIntensity = 0.25
      }
    } else {
      const skyMat = new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
        uniforms: { top: { value: top }, bottom: { value: bottom }, sunDir: { value: sunDir }, sunColor: { value: new THREE.Color(city.sun) }, night: { value: this.night ? 1 : 0 } },
        vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_Position.z = gl_Position.w; }`,
        fragmentShader: `uniform vec3 top; uniform vec3 bottom; uniform vec3 sunDir; uniform vec3 sunColor; uniform float night; varying vec3 vDir;
          void main(){ float h = clamp(vDir.y*1.4+0.15,0.0,1.0); vec3 c = mix(bottom, top, pow(h,0.8));
            float s = max(dot(normalize(vDir), sunDir),0.0);
            c += sunColor * (pow(s, 600.0)*1.6 + pow(s, 12.0)*0.25*(1.0-night));
            gl_FragColor = vec4(c,1.0); }`,
      })
      const sky = new THREE.Mesh(new THREE.SphereGeometry(1800, 32, 16), skyMat)
      sky.renderOrder = -1
      sky.frustumCulled = false
      this.root.add(sky)
      this.sky = sky
    }

    if (this.night) {
      const n = 900
      const pos = new Float32Array(n * 3)
      for (let i = 0; i < n; i++) {
        const v = new THREE.Vector3(this.rng() - 0.5, this.rng() * 0.8 + 0.08, this.rng() - 0.5).normalize().multiplyScalar(1600)
        pos.set([v.x, v.y, v.z], i * 3)
      }
      const g = new THREE.BufferGeometry()
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
      const stars = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xffffff, size: 2.2, sizeAttenuation: false, fog: false, transparent: true, opacity: 0.85 }))
      stars.frustumCulled = false
      this.root.add(stars)
      this.stars = stars
    } else {
      this.buildClouds()
    }

    const day = city.time === 'day'
    this.scene.fog = new THREE.Fog(city.fog, day ? 260 : this.night ? 120 : 160, this.quality === 'low' ? 620 : day ? 1100 : 760)
    this.scene.background = bottom.clone()

    const hemiSky = this.night ? '#7d8fd6' : city.sky[0]
    const hemi = new THREE.HemisphereLight(hemiSky, this.night ? '#3a3550' : city.ground, this.night ? 1.25 : city.time === 'sunset' ? 1.15 : 0.6)
    this.root.add(hemi)
    const sun = new THREE.DirectionalLight(city.sun, this.night ? 0.9 : city.time === 'sunset' ? 1.9 : 3)
    sun.position.copy(sunDir).multiplyScalar(120)
    sun.castShadow = this.quality !== 'low'
    const sm = this.quality === 'high' ? 2048 : 1024
    sun.shadow.mapSize.set(sm, sm)
    const sc = sun.shadow.camera
    sc.left = sc.bottom = -70
    sc.right = sc.top = 70
    // The shadow camera follows the car; snapping it to whole shadow-map texels (in light
    // space) keeps shadow edges from crawling and shimmering while driving.
    this.shadowTexel = 140 / sm
    this.lightRot = new THREE.Matrix4().lookAt(sunDir, new THREE.Vector3(), new THREE.Vector3(0, 1, 0))
    this.lightRotInv = this.lightRot.clone().invert()
    sc.near = 1
    sc.far = 400
    sun.shadow.bias = -0.0006
    sun.shadow.normalBias = 0.6
    this.root.add(sun)
    this.root.add(sun.target)
    this.sun = sun
  }

  buildClouds() {
    const cm = this.city.time === 'day'
      ? new THREE.MeshBasicMaterial({ color: '#ffffff', fog: false, toneMapped: false, transparent: true, opacity: 0.92 })
      : mat(this.city.time === 'sunset' ? '#ffd9c4' : '#ffffff', { fog: false, rough: 1, emissive: this.city.time === 'sunset' ? '#ffb08a' : '#d8e6f5', ei: 0.35 })
    const puffs = []
    this.clouds = []
    for (let i = 0; i < 16; i++) {
      const a = this.rng() * Math.PI * 2
      const d = 300 + this.rng() * 900
      const cloud = { x: Math.cos(a) * d, y: 160 + this.rng() * 120, z: Math.sin(a) * d, puffs: [] }
      const n = 4 + Math.floor(this.rng() * 4)
      for (let j = 0; j < n; j++) {
        const sc = 14 + this.rng() * 16
        cloud.puffs.push({ dx: j * 16 - n * 8, dy: this.rng() * 6, dz: (this.rng() - 0.5) * 16, s: sc })
        puffs.push(1)
      }
      this.clouds.push(cloud)
    }
    this.cloudMesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), cm, puffs.length)
    this.cloudMesh.frustumCulled = false
    this.root.add(this.cloudMesh)
    this.updateClouds(0)
  }

  updateClouds(dt) {
    const m = new THREE.Matrix4()
    const q = new THREE.Quaternion()
    const p = new THREE.Vector3()
    const sc = new THREE.Vector3()
    let i = 0
    for (const c of this.clouds) {
      c.x = ((c.x + dt * 4 + 1500) % 3000) - 1500
      for (const pf of c.puffs) {
        p.set(c.x + pf.dx, c.y + pf.dy, c.z + pf.dz)
        sc.set(pf.s, pf.s * 0.6, pf.s)
        m.compose(p, q, sc)
        this.cloudMesh.setMatrixAt(i++, m)
      }
    }
    this.cloudMesh.instanceMatrix.needsUpdate = true
  }

  // ---------- ground ----------
  buildGround() {
    const city = this.city
    const groundMat = new THREE.MeshStandardMaterial({ color: city.ground, roughness: 1 })
    const gTex = groundTexture('noise').clone()
    gTex.needsUpdate = true
    gTex.repeat.set(500, 500)
    groundMat.map = gTex
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(4000, 4000), groundMat)
    ground.rotation.x = -Math.PI / 2
    ground.position.y = -0.05
    ground.receiveShadow = true
    this.root.add(ground)
    const aTex = groundTexture('asphalt').clone()
    aTex.needsUpdate = true
    aTex.repeat.set((GRID * CELL + ROAD) / 7, (GRID * CELL + ROAD) / 7)
    const asphalt = new THREE.Mesh(new THREE.PlaneGeometry(GRID * CELL + ROAD, GRID * CELL + ROAD), new THREE.MeshStandardMaterial({ map: aTex, color: this.night ? '#8a8f99' : '#ffffff', roughness: 0.92 }))
    asphalt.rotation.x = -Math.PI / 2
    asphalt.position.y = 0
    asphalt.receiveShadow = true
    this.root.add(asphalt)
    const body = new CANNON.Body({ mass: 0, shape: new CANNON.Box(new CANNON.Vec3(2000, 1, 2000)) })
    body.position.set(0, -1, 0)
    this.addBody(body)
    this.groundBody = body

    if (city.sea) {
      const tex = makeWaterTexture()
      const water = new THREE.Mesh(
        new THREE.PlaneGeometry(4000, 1600),
        new THREE.MeshStandardMaterial({ color: city.seaColor, map: tex, roughness: 0.18, metalness: 0.15, emissive: city.seaColor, emissiveIntensity: this.night ? 0.25 : 0.1 }),
      )
      tex.repeat.set(60, 24)
      water.rotation.x = -Math.PI / 2
      const edge = HALF + ROAD / 2 + 26
      water.position.set(0, 0.02, city.sea === 'north' ? -edge - 800 : edge + 800)
      water.receiveShadow = true
      this.root.add(water)
      this.water = water
      this.updaters.push((t) => {
        tex.offset.x = t * 0.01
        tex.offset.y = Math.sin(t * 0.3) * 0.02
      })
      const beach = new THREE.Mesh(new THREE.PlaneGeometry(4000, 26), mat(city.beach ? '#efd9a6' : '#9c9488', { rough: 1 }))
      beach.rotation.x = -Math.PI / 2
      beach.position.set(0, 0.01, city.sea === 'north' ? -edge + 13 : edge - 13)
      beach.receiveShadow = true
      this.root.add(beach)
    }
  }

  // ---------- roads ----------
  buildRoads() {
    const dashGeo = []
    const crossGeo = []
    const white = mat('#f4f1e6', { emissive: '#ffffff', ei: 0.15 })
    const yellow = mat('#f2c53d', { emissive: '#f2c53d', ei: 0.2 })
    for (const s of this.segments) {
      const x1 = s.a.x
      const z1 = s.a.z
      const x2 = s.b.x
      const z2 = s.b.z
      const len = Math.hypot(x2 - x1, z2 - z1) - ROAD - 4
      const n = Math.floor(len / 6)
      for (let k = 0; k < n; k++) {
        const t = (ROAD / 2 + 2 + k * 6 + 1.5) / (len + ROAD + 4)
        const g = new THREE.BoxGeometry(s.horiz ? 3 : 0.3, 0.02, s.horiz ? 0.3 : 3)
        g.translate(x1 + (x2 - x1) * t, 0.03, z1 + (z2 - z1) * t)
        dashGeo.push(g)
      }
    }
    for (const nd of this.nodes) {
      for (const nb of nd.links) {
        const dx = Math.sign(nb.x - nd.x)
        const dz = Math.sign(nb.z - nd.z)
        for (let k = -2; k <= 2; k++) {
          const off = ROAD / 2 + 1.5
          const g = new THREE.BoxGeometry(dx ? 2.2 : 1.1, 0.02, dx ? 1.1 : 2.2)
          g.translate(nd.x + dx * off + (dz ? k * 2.2 : 0), 0.03, nd.z + dz * off + (dx ? k * 2.2 : 0))
          crossGeo.push(g)
        }
      }
    }
    if (dashGeo.length) this.root.add(new THREE.Mesh(mergeGeometries(dashGeo), yellow))
    if (crossGeo.length) this.root.add(new THREE.Mesh(mergeGeometries(crossGeo), white))
  }

  // ---------- landmarks ----------
  buildLandmarks() {
    const sandy = this.city.style === 'desert' || this.city.style === 'rural'
    const paving = makePavingTexture(sandy ? '#dcc8a0' : '#d6cfc2', sandy ? '#c9b083' : '#bdb4a5')
    const bedGeos = []
    const flowerCols = ['#ff4d6d', '#ffd166', '#ffffff', '#c77dff', '#ff8fab']
    for (const p of this.plazas) {
      const tex = paving.clone()
      tex.needsUpdate = true
      tex.repeat.set(p.half / 4, p.half / 4)
      const plazaMat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 })
      const base = new THREE.Mesh(new THREE.BoxGeometry(p.half * 2, CURB, p.half * 2), plazaMat)
      base.position.set(p.x, CURB / 2, p.z)
      base.receiveShadow = true
      this.root.add(base)
      const lm = buildLandmark(p.def.id)
      lm.group.position.set(p.x, CURB, p.z)
      lm.group.rotation.y = p.def.ry ?? 0
      this.root.add(lm.group)
      const firstBody = this.bodies.length
      const cos = Math.cos(p.def.ry ?? 0)
      const sin = Math.sin(p.def.ry ?? 0)
      for (const c of lm.colliders) {
        const wx = p.x + c.x * cos + c.z * sin
        const wz = p.z - c.x * sin + c.z * cos
        if (c.type === 'box') this.staticBox(wx, 0, wz, c.w, c.h, c.d, (c.ry ?? 0) + (p.def.ry ?? 0))
        else this.staticCyl(wx, wz, c.r, c.h)
      }
      if (lm.update) this.updaters.push(lm.update)
      // Flower beds + trees in free plaza corners
      const blocked = (x, z) => lm.colliders.some((c) => {
        const lx = (x - p.x) * cos - (z - p.z) * sin
        const lz = (x - p.x) * sin + (z - p.z) * cos
        if (c.type === 'cyl') return Math.hypot(lx - c.x, lz - c.z) < c.r + 4
        const ca = Math.cos(c.ry ?? 0)
        const sa = Math.sin(c.ry ?? 0)
        const bx = (lx - c.x) * ca - (lz - c.z) * sa
        const bz = (lx - c.x) * sa + (lz - c.z) * ca
        return Math.abs(bx) < c.w / 2 + 4 && Math.abs(bz) < c.d / 2 + 4
      })
      for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
        const x = p.x + sx * (p.half - 5)
        const z = p.z + sz * (p.half - 5)
        if (blocked(x, z)) continue
        const bed = new THREE.CylinderGeometry(3.2, 3.4, 0.5, 14)
        bed.translate(x, CURB + 0.25, z)
        bedGeos.push([bed, '#4f9a45'])
        const rim = new THREE.CylinderGeometry(3.5, 3.5, 0.35, 14, 1, true)
        rim.translate(x, CURB + 0.17, z)
        bedGeos.push([rim, '#e8e2d4'])
        for (let f = 0; f < 14; f++) {
          const a = this.rng() * Math.PI * 2
          const r = 1.4 + this.rng() * 1.6
          const fl = new THREE.IcosahedronGeometry(0.28, 0)
          fl.translate(x + Math.cos(a) * r, CURB + 0.65, z + Math.sin(a) * r)
          bedGeos.push([fl, flowerCols[f % flowerCols.length]])
        }
        this.treeSpots.push([x, z])
        this.staticCyl(x, z, 1, 1.2)
      }
      // Floating "discover" beacon above the landmark
      const beacon = new THREE.Mesh(new THREE.OctahedronGeometry(2.2, 0), new THREE.MeshStandardMaterial({ color: '#ffd84a', emissive: '#ffb800', emissiveIntensity: 1.2, roughness: 0.3 }))
      beacon.position.set(p.x, 0, p.z)
      beacon.userData.baseY = this.landmarkHeight(lm.group) + 8
      this.root.add(beacon)
      if (this.night && this.quality !== 'low') {
        // Warm floodlight so monuments stand out at night.
        const flood = new THREE.PointLight('#ffd9a0', 160, 90, 1.4)
        flood.position.set(p.x + p.half * 0.8, 16, p.z + p.half * 0.8)
        this.root.add(flood)
      }
      const entry = { def: p.def, x: p.x, z: p.z, half: p.half, group: lm.group, beacon, discovered: false, bodies: this.bodies.slice(firstBody), update: lm.update }
      this.landmarks.push(entry)
      this.upgradeLandmark(entry)
    }
    if (bedGeos.length) {
      const beds = new THREE.Mesh(mergeColored(bedGeos), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, flatShading: true }))
      beds.receiveShadow = true
      this.root.add(beds)
    }
    if (this.city.balloons) {
      const b = buildBalloons(16, GRID * CELL * 1.2)
      this.root.add(b.group)
      this.updaters.push(b.update)
    }
  }

  // Swap the procedural landmark for its detailed glTF model once it has loaded.
  async upgradeLandmark(lm) {
    let res
    try {
      res = await buildModelLandmark(lm.def.id, this.night)
    } catch (e) {
      console.warn('model failed', lm.def.id, e)
      return
    }
    if (!res || this.disposed) return
    const { group, update, cfg } = res
    group.position.copy(lm.group.position)
    group.rotation.y = lm.group.rotation.y
    this.root.remove(lm.group)
    lm.group.traverse((o) => o.geometry?.dispose())
    this.root.add(group)
    lm.group = group
    if (lm.update) this.updaters.splice(this.updaters.indexOf(lm.update), 1)
    if (update) this.updaters.push(update)
    group.updateMatrixWorld(true)
    if (cfg.col !== 'keep') {
      for (const b of lm.bodies) {
        this.physics.removeBody(b)
        this.bodies.splice(this.bodies.indexOf(b), 1)
      }
      const box = new THREE.Box3().setFromObject(group.children[0])
      const size = box.getSize(new THREE.Vector3())
      const c = box.getCenter(new THREE.Vector3())
      const k = cfg.shrink ?? 0.9
      const h = Math.min(size.y, 60)
      if (cfg.col === 'box') this.staticBox(c.x, 0, c.z, size.x * k, h, size.z * k)
      else if (cfg.col === 'cyl') this.staticCyl(c.x, c.z, (Math.max(size.x, size.z) / 2) * k, h)
      else if (cfg.col === 'legs') {
        const r = size.x * 0.07
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) this.staticCyl(c.x + sx * (size.x / 2 - r * 1.6), c.z + sz * (size.z / 2 - r * 1.6), r, 20)
      }
    }
    lm.beacon.userData.baseY = this.landmarkHeight(group) + 8
  }

  landmarkHeight(group) {
    const box = new THREE.Box3().setFromObject(group)
    return Math.min(box.max.y, 120)
  }

  // ---------- city blocks ----------
  buildBlocks() {
    const city = this.city
    const rng = this.rng
    const swTex = groundTexture('slab').clone()
    swTex.needsUpdate = true
    swTex.repeat.set(15, 15)
    const sidewalk = new THREE.MeshStandardMaterial({ map: swTex, color: this.night ? '#b5b0a8' : '#ffffff', roughness: 0.9 })
    const grTex = groundTexture(city.style === 'desert' || city.style === 'rural' ? 'sand' : 'grass').clone()
    grTex.needsUpdate = true
    grTex.repeat.set(12, 12)
    const grassMat = new THREE.MeshStandardMaterial({ map: grTex, roughness: 1 })
    const blockGeos = []
    const grassGeos = []
    const bGeos = []
    const roofGeos = []
    const neonGeos = new Map()
    const detailGeos = []
    const color = new THREE.Color()
    const parks = []
    const tex = city.style === 'modern' ? 'modern' : 'classic'

    const addColored = (geo, list, col) => {
      color.set(col)
      const n = geo.attributes.position.count
      const arr = new Float32Array(n * 3)
      for (let i = 0; i < n; i++) arr.set([color.r, color.g, color.b], i * 3)
      geo.setAttribute('color', new THREE.BufferAttribute(arr, 3))
      list.push(geo)
    }

    // Pick one "playground" block for jumps and smashing (closest free block to centre).
    let playground = null
    const free = []
    for (let cx = 0; cx < GRID; cx++) for (let cz = 0; cz < GRID; cz++) if (!this.occupied.has(`${cx},${cz}`)) free.push([cx, cz])
    free.sort((a, b) => Math.hypot(blockCenter(a[0]), blockCenter(a[1])) - Math.hypot(blockCenter(b[0]), blockCenter(b[1])))
    playground = free.find(([cx, cz]) => !(cx === 2 && cz === 2) && !(cx === 3 && cz === 3)) ?? free[0]
    this.playground = { x: blockCenter(playground[0]), z: blockCenter(playground[1]) }

    for (const [cx, cz] of free) {
      const bx = blockCenter(cx)
      const bz = blockCenter(cz)
      const g = new THREE.BoxGeometry(BLOCK, CURB, BLOCK)
      g.translate(bx, CURB / 2, bz)
      blockGeos.push(g)
      const isPlay = cx === playground[0] && cz === playground[1]
      const isPark = !isPlay && rng() < (city.style === 'rural' ? 0.35 : 0.14)
      if (isPlay || isPark) {
        const gg = new THREE.BoxGeometry(BLOCK - 6, 0.06, BLOCK - 6)
        gg.translate(bx, CURB + 0.03, bz)
        grassGeos.push(gg)
        if (isPark) parks.push({ x: bx, z: bz })
        continue
      }
      const lots = city.style === 'rural' ? 2 : 3
      const lot = (BLOCK - 6) / lots
      for (let i = 0; i < lots; i++) {
        for (let j = 0; j < lots; j++) {
          if (lots === 3 && i === 1 && j === 1 && rng() < 0.6) continue
          if (city.style === 'rural' && rng() < 0.3) continue
          const lx = bx - (BLOCK - 6) / 2 + lot * (i + 0.5)
          const lz = bz - (BLOCK - 6) / 2 + lot * (j + 0.5)
          const w = lot * (0.72 + rng() * 0.22)
          const d = lot * (0.72 + rng() * 0.22)
          const [hmin, hmax] = city.heights
          const distC = Math.hypot(lx, lz) / HALF
          let h = hmin + (hmax - hmin) * Math.pow(rng(), 1.6) * (city.style === 'modern' ? 1.3 - distC * 0.5 : 1)
          h = Math.max(4, Math.round(h / 3) * 3)
          const geo = new THREE.BoxGeometry(w, h, d)
          boxUV(geo, w, h, d, 24)
          geo.translate(lx, CURB + h / 2, lz)
          addColored(geo, bGeos, pick(rng, city.palette))
          this.staticBox(lx, 0, lz, w, h + CURB, d)
          // Roof styles
          if (city.style === 'european' || city.style === 'latin') {
            const along = w > d
            const s = new THREE.Shape()
            const rw = along ? d : w
            s.moveTo(-rw / 2 - 0.4, 0)
            s.lineTo(rw / 2 + 0.4, 0)
            s.lineTo(0, rw * 0.32)
            s.closePath()
            const rg = new THREE.ExtrudeGeometry(s, { depth: along ? w : d, bevelEnabled: false })
            rg.translate(0, 0, -(along ? w : d) / 2)
            if (along) rg.rotateY(Math.PI / 2)
            rg.translate(lx, CURB + h, lz)
            const rc = new THREE.Color(city.roof).offsetHSL(0, 0, (rng() - 0.5) * 0.08)
            addColored(rg.index ? rg.toNonIndexed() : rg, roofGeos, rc)
          } else if (city.style === 'oriental' && rng() < 0.18) {
            const dg = new THREE.SphereGeometry(Math.min(w, d) * 0.3, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2).toNonIndexed()
            dg.translate(lx, CURB + h, lz)
            addColored(dg, roofGeos, rng() < 0.5 ? '#8fa2ad' : '#e8e2d4')
          } else if (city.style === 'modern' || city.style === 'desert') {
            const ac = new THREE.BoxGeometry(w * 0.3, 2, d * 0.3)
            ac.translate(lx + (rng() - 0.5) * w * 0.3, CURB + h + 1, lz + (rng() - 0.5) * d * 0.3)
            detailGeos.push(ac.toNonIndexed())
          }
          if (city.neon && rng() < 0.55) {
            const hue = pick(rng, ['#ff2d95', '#2de1ff', '#ffd22d', '#7a5cff', '#2dff8a'])
            const sideX = rng() < 0.5
            const sg = new THREE.BoxGeometry(sideX ? 0.3 : 2.2, Math.min(h * 0.6, 14), sideX ? 2.2 : 0.3)
            sg.translate(lx + (sideX ? w / 2 + 0.2 : 0), CURB + h * 0.35 + 3, lz + (sideX ? 0 : d / 2 + 0.2))
            if (!neonGeos.has(hue)) neonGeos.set(hue, [])
            neonGeos.get(hue).push(sg)
          }
        }
      }
    }
    const add = (geos, material, shadow = true) => {
      if (!geos.length) return
      const mesh = new THREE.Mesh(mergeGeometries(geos), material)
      mesh.castShadow = shadow
      mesh.receiveShadow = true
      this.root.add(mesh)
      return mesh
    }
    add(blockGeos, sidewalk, false)
    add(grassGeos, grassMat, false)
    add(bGeos, facadeMat(0xffffff, tex, true))
    add(roofGeos, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, flatShading: true }))
    add(detailGeos, mat('#9aa1a8'))
    for (const [hue, geos] of neonGeos) add(geos, mat(hue, { emissive: hue, ei: 2.2 }), false)
    this.parks = parks
    for (const p of parks) this.buildPark(p.x, p.z)
    this.buildPlayground(this.playground.x, this.playground.z)
  }

  buildPark(x, z) {
    const k = new Kit()
    const rng = this.rng
    k.cyl(4, 4.4, 0.8, '#bfb6a6', 0, 0, 0, { seg: 16 })
    k.cyl(3.5, 3.5, 0.5, mat('#4fc3e6', { emissive: '#1ea0d0', ei: 0.4, rough: 0.1 }), 0, 0.5, 0, { seg: 16 })
    k.cyl(0.4, 0.6, 2.4, '#d8d0c0', 0, 0.8, 0, { seg: 8 })
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + 0.4
      k.box(3, 0.5, 1, '#8a5a3a', Math.cos(a) * 9, 0.5, Math.sin(a) * 9, { ry: -a })
    }
    mergeStatic(k.group)
    k.group.position.set(x, CURB, z)
    this.root.add(k.group)
    this.staticCyl(x, z, 4.4, 1.5)
    for (let i = 0; i < 9; i++) {
      const a = rng() * Math.PI * 2
      const d = 12 + rng() * 14
      this.treeSpots.push([x + Math.cos(a) * d, z + Math.sin(a) * d])
    }
  }

  // Wedge-shaped jump ramp whose low edge sits flush on the ground; it rises
  // towards heading `ry` (0 = +z). Returns the world position of the lip.
  addRamp(x, z, ry, { w = 7, L = 11, H = 2.6, y = 0 } = {}) {
    const hw = w / 2
    const V = [[-hw, 0, 0], [hw, 0, 0], [hw, 0, L], [-hw, 0, L], [hw, H, L], [-hw, H, L]]
    const faces = [[0, 1, 2, 3], [2, 4, 5, 3], [0, 5, 4, 1], [1, 4, 2], [0, 3, 5]]
    const shape = new CANNON.ConvexPolyhedron({ vertices: V.map((v) => new CANNON.Vec3(...v)), faces })
    const body = new CANNON.Body({ mass: 0, shape })
    body.position.set(x, y, z)
    body.quaternion.setFromEuler(0, ry, 0)
    this.addBody(body)
    // Visual: slope with chevrons + painted sides
    const pos = []
    const uv = []
    const tri = (a, b, c, ua = [0, 0], ub = [0, 0], uc = [0, 0]) => {
      pos.push(...V[a], ...V[b], ...V[c])
      uv.push(...ua, ...ub, ...uc)
    }
    tri(0, 5, 4, [0, 0], [0, 1], [1, 1])
    tri(0, 4, 1, [0, 0], [1, 1], [1, 0])
    tri(3, 2, 4)
    tri(3, 4, 5)
    tri(1, 4, 2)
    tri(0, 3, 5)
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
    geo.computeVertexNormals()
    const mesh = new THREE.Mesh(geo, rampMaterial())
    mesh.castShadow = mesh.receiveShadow = true
    mesh.position.set(x, y, z)
    mesh.rotation.y = ry
    this.root.add(mesh)
    return { x: x + Math.sin(ry) * L, y: y + H, z: z + Math.cos(ry) * L, dx: Math.sin(ry), dz: Math.cos(ry), bx: x, bz: z, ry }
  }

  buildPlayground(x, z) {
    // Ramps sit on the block edge so you can hit them at full speed straight off the road
    // and fly into the playground (crates, bowling pins, barrels).
    this.ramps = []
    this.ramps.push(this.addRamp(x, z - BLOCK / 2 + 0.5, 0, { y: CURB }))
    this.ramps.push(this.addRamp(x + BLOCK / 2 - 0.5, z + 18, -Math.PI / 2, { y: CURB, H: 2.2 }))
    // Stunt ramps in the middle of a few outer roads (traffic avoids those segments).
    const outer = this.segments.filter((sg) => (sg.horiz ? sg.a.j === 0 || sg.a.j === GRID : sg.a.i === 0 || sg.a.i === GRID))
    const picks = [outer[1], outer[Math.floor(outer.length / 2) + 2], outer[outer.length - 3]].filter(Boolean)
    for (const sg of picks) {
      sg.blocked = true
      const ry = Math.atan2(sg.b.x - sg.a.x, sg.b.z - sg.a.z)
      const mx = (sg.a.x + sg.b.x) / 2 - Math.sin(ry) * 8
      const mz = (sg.a.z + sg.b.z) / 2 - Math.cos(ry) * 8
      this.ramps.push(this.addRamp(mx, mz, ry, { w: 9, L: 12, H: 3 }))
    }
  }

  // ---------- trees, lamps ----------
  buildStreetFurniture() {
    const city = this.city
    const rng = this.rng
    this.treeSpots = this.treeSpots ?? []
    const lampSpots = []
    for (const s of this.segments) {
      const len = Math.hypot(s.b.x - s.a.x, s.b.z - s.a.z)
      const dirx = (s.b.x - s.a.x) / len
      const dirz = (s.b.z - s.a.z) / len
      for (let d = ROAD / 2 + 8; d < len - ROAD / 2 - 6; d += 15) {
        for (const side of [-1, 1]) {
          const ox = -dirz * side * (ROAD / 2 + 1.6)
          const oz = dirx * side * (ROAD / 2 + 1.6)
          const px = s.a.x + dirx * d + ox
          const pz = s.a.z + dirz * d + oz
          if (this.isInPlaza(px, pz, 1)) continue
          if ((this.ramps ?? []).some((r) => Math.hypot(px - (r.bx + r.x) / 2, pz - (r.bz + r.z) / 2) < 10)) continue
          if (Math.abs(px) > HALF + 1 || Math.abs(pz) > HALF + 1) continue
          if ((Math.round(d / 15) + (side > 0 ? 1 : 0)) % 2 === 0) lampSpots.push([px, pz, Math.atan2(-ox, -oz)])
          else if (rng() < 0.75) this.treeSpots.push([px, pz])
        }
      }
    }
    this.buildTrees(this.treeSpots)
    this.buildLamps(lampSpots)
    this.buildOuterRing()
  }

  isInPlaza(x, z, margin = 0) {
    for (const p of this.plazas) if (Math.abs(x - p.x) < p.half + margin && Math.abs(z - p.z) < p.half + margin) return true
    return false
  }

  buildTrees(spots, collide = true, root = this.root) {
    const type = this.city.trees
    const n = spots.length
    if (!n) return
    const trunkGeo = new THREE.CylinderGeometry(0.25, 0.4, 1, 6)
    trunkGeo.translate(0, 0.5, 0)
    let crownGeo
    let crownColor = '#4f9a45'
    let trunkH = 3
    let crownScale = [3, 3, 3]
    let crownY = 4.5
    if (type === 'palm') {
      const parts = []
      for (let i = 0; i < 7; i++) {
        const leaf = new THREE.BoxGeometry(0.9, 0.12, 4)
        leaf.translate(0, 0, 2)
        leaf.rotateX(0.35)
        leaf.rotateY((i / 7) * Math.PI * 2)
        parts.push(leaf)
      }
      crownGeo = mergeGeometries(parts)
      crownColor = '#3f9a3a'
      trunkH = 8
      crownScale = [1.2, 1.2, 1.2]
      crownY = 8
    } else if (type === 'cypress') {
      crownGeo = new THREE.ConeGeometry(1, 1, 7)
      crownGeo.translate(0, 0.5, 0)
      crownColor = '#2f5f3a'
      trunkH = 1.5
      crownScale = [1.4, 9, 1.4]
      crownY = 1.2
    } else if (type === 'poplar') {
      crownGeo = new THREE.IcosahedronGeometry(1, 0)
      crownColor = '#a5b94a'
      trunkH = 2
      crownScale = [1.6, 4.5, 1.6]
      crownY = 6
    } else if (type === 'pine') {
      crownGeo = new THREE.IcosahedronGeometry(1, 0)
      crownColor = '#3f6b3a'
      trunkH = 7
      crownScale = [4.2, 1.5, 4.2]
      crownY = 8
    } else {
      crownGeo = new THREE.IcosahedronGeometry(1, 0)
      if (type === 'sakura') crownColor = '#f6a8c8'
      if (type === 'olive') crownColor = '#8a9a6a'
    }
    const trunk = new THREE.InstancedMesh(trunkGeo, mat('#6b4a33'), n)
    const crown = new THREE.InstancedMesh(crownGeo, mat(crownColor, { emissive: type === 'sakura' ? '#ff7ab0' : '#000000', ei: type === 'sakura' ? 0.25 : 1 }), n)
    const m = new THREE.Matrix4()
    const q = new THREE.Quaternion()
    const s = new THREE.Vector3()
    const p = new THREE.Vector3()
    const e = new THREE.Euler()
    spots.forEach(([x, z], i) => {
      const k = 0.8 + this.rng() * 0.45
      p.set(x, CURB, z)
      s.set(k, trunkH * k, k)
      q.identity()
      m.compose(p, q, s)
      trunk.setMatrixAt(i, m)
      p.set(x, CURB + crownY * k, z)
      s.set(crownScale[0] * k, crownScale[1] * k, crownScale[2] * k)
      q.setFromEuler(e.set(0, this.rng() * Math.PI * 2, 0))
      m.compose(p, q, s)
      crown.setMatrixAt(i, m)
      if (collide) this.staticCyl(x, z, 0.45, 4)
    })
    trunk.castShadow = crown.castShadow = true
    crown.receiveShadow = true
    root.add(trunk, crown)
  }

  buildLamps(spots) {
    const n = spots.length
    if (!n) return
    const poleGeo = new THREE.CylinderGeometry(0.12, 0.16, 6, 6)
    poleGeo.translate(0, 3, 0)
    const armGeo = new THREE.BoxGeometry(0.15, 0.15, 1.6)
    armGeo.translate(0, 6, 0.7)
    const pole = new THREE.InstancedMesh(mergeGeometries([poleGeo, armGeo]), mat('#3a3f45', { metal: 0.4 }), n)
    const headGeo = new THREE.BoxGeometry(0.6, 0.25, 0.9)
    headGeo.translate(0, 5.85, 1.4)
    const head = new THREE.InstancedMesh(headGeo, mat('#fff4d0', { emissive: '#ffd890', ei: 2.4, night: true }), n)
    const m = new THREE.Matrix4()
    const q = new THREE.Quaternion()
    spots.forEach(([x, z, ry], i) => {
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), ry)
      m.compose(new THREE.Vector3(x, CURB, z), q, new THREE.Vector3(1, 1, 1))
      pole.setMatrixAt(i, m)
      head.setMatrixAt(i, m)
    })
    pole.castShadow = true
    this.root.add(pole, head)
    // Light pools under lamps at night (cheap fake lighting via additive decals).
    if (this.night || this.city.time === 'sunset') {
      const pool = new THREE.InstancedMesh(new THREE.CircleGeometry(4.5, 16), new THREE.MeshBasicMaterial({ map: radialTexture(), color: '#ffcf80', transparent: true, opacity: this.night ? 0.55 : 0.25, blending: THREE.AdditiveBlending, depthWrite: false }), n)
      spots.forEach(([x, z, ry], i) => {
        q.setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0))
        m.compose(new THREE.Vector3(x + Math.sin(ry) * 1.4, CURB + 0.04, z + Math.cos(ry) * 1.4), q, new THREE.Vector3(1, 1, 1))
        pool.setMatrixAt(i, m)
      })
      this.root.add(pool)
    }
  }

  // Non-collidable skyline/trees outside the driveable area.
  buildOuterRing() {
    const city = this.city
    const rng = this.rng
    const geos = []
    const color = new THREE.Color()
    const edge = HALF + ROAD / 2 + 26
    const trees = []
    for (let i = 0; i < 160; i++) {
      const side = Math.floor(rng() * 4)
      const t = (rng() - 0.5) * (edge * 2 + 160)
      const d = edge + 14 + rng() * 110
      let x, z
      if (side === 0) { x = t; z = -d } else if (side === 1) { x = t; z = d } else if (side === 2) { x = -d; z = t } else { x = d; z = t }
      if ((city.sea === 'north' && z < -edge) || (city.sea === 'south' && z > edge)) continue
      if (city.style === 'rural' || rng() < 0.3) {
        trees.push([x, z])
        continue
      }
      const w = 10 + rng() * 14
      const h = city.heights[0] + rng() * (city.heights[1] - city.heights[0]) * 1.1
      const g = new THREE.BoxGeometry(w, h, w)
      boxUV(g, w, h, w, 24)
      g.translate(x, h / 2, z)
      color.set(pick(rng, city.palette))
      const arr = new Float32Array(g.attributes.position.count * 3)
      for (let k = 0; k < g.attributes.position.count; k++) arr.set([color.r, color.g, color.b], k * 3)
      g.setAttribute('color', new THREE.BufferAttribute(arr, 3))
      geos.push(g)
    }
    if (geos.length) {
      const mesh = new THREE.Mesh(mergeGeometries(geos), facadeMat(0xffffff, city.style === 'modern' ? 'modern' : 'classic', true))
      this.root.add(mesh)
    }
    this.buildTrees(trees, false)
  }

  buildBoundary() {
    const e = HALF + ROAD / 2 + 24
    const h = 10
    this.staticBox(0, 0, -e - 1, e * 2 + 4, h, 2)
    this.staticBox(0, 0, e + 1, e * 2 + 4, h, 2)
    this.staticBox(-e - 1, 0, 0, 2, h, e * 2 + 4)
    this.staticBox(e + 1, 0, 0, 2, h, e * 2 + 4)
    // Visible low barrier with reflective stripes
    const geos = []
    for (const [x, z, w, d] of [[0, -e, e * 2, 0.6], [0, e, e * 2, 0.6], [-e, 0, 0.6, e * 2], [e, 0, 0.6, e * 2]]) {
      const g = new THREE.BoxGeometry(w, 1, d)
      g.translate(x, 0.5, z)
      geos.push(g)
    }
    const barrier = new THREE.Mesh(mergeGeometries(geos), mat('#e8e8e8', { emissive: '#ff6a3d', ei: 0.3 }))
    this.root.add(barrier)
  }

  buildBackdrops() {
    for (const b of this.city.backdrops ?? []) {
      buildModelBackdrop(b.type).then((model) => {
        if (!model || this.disposed) return
        model.position.set(...b.pos)
        model.rotation.y = b.ry ?? 0
        model.traverse((o) => (o.castShadow = false))
        const old = this.backdropGroups?.[b.type]
        if (old) this.root.remove(old)
        this.root.add(model)
      }).catch(() => {})
      const lm = buildLandmark(b.type)
      lm.group.position.set(...b.pos)
      lm.group.rotation.y = b.ry ?? 0
      lm.group.traverse((o) => {
        o.castShadow = false
      })
      this.root.add(lm.group)
      ;(this.backdropGroups ??= {})[b.type] = lm.group
    }
  }

  // ---------- props (physics toys) ----------
  buildProps() {
    const rng = this.rng
    const { x: px, z: pz } = this.playground
    const kinds = {}
    const kind = (name, geo, shape, mass) => (kinds[name] = { geo, shape, mass, items: [] })
    const pin = new THREE.LatheGeometry([[0, 0], [0.35, 0], [0.42, 0.4], [0.3, 1.1], [0.18, 1.45], [0.26, 1.75], [0.18, 2.05], [0, 2.1]].map((p) => new THREE.Vector2(p[0], p[1])), 12)
    pin.translate(0, -1.05, 0)
    const stripe = new THREE.CylinderGeometry(0.31, 0.31, 0.18, 12)
    stripe.translate(0, -0.6, 0)
    kind('pin', mergeColored([[pin, '#ffffff'], [stripe, '#e63946']]), () => new CANNON.Cylinder(0.3, 0.38, 2.1, 8), 2)
    const crate = new THREE.BoxGeometry(1.6, 1.6, 1.6)
    const band = new THREE.BoxGeometry(1.64, 0.25, 1.64)
    kind('crate', mergeColored([[crate, '#c88b4a'], [band, '#8a5a2a']]), () => new CANNON.Box(new CANNON.Vec3(0.8, 0.8, 0.8)), 4)
    const cone = new THREE.ConeGeometry(0.45, 1.2, 10)
    const base = new THREE.BoxGeometry(0.9, 0.1, 0.9)
    base.translate(0, -0.6, 0)
    const ring = new THREE.CylinderGeometry(0.27, 0.33, 0.2, 10)
    kind('cone', mergeColored([[cone, '#ff6a1a'], [base, '#222222'], [ring, '#ffffff']]), () => new CANNON.Cylinder(0.1, 0.45, 1.2, 8), 1)
    const ball = new THREE.SphereGeometry(1.6, 16, 12)
    const b1 = new THREE.SphereGeometry(1.62, 16, 12, 0, Math.PI / 2)
    const b2 = new THREE.SphereGeometry(1.62, 16, 12, Math.PI, Math.PI / 2)
    kind('ball', mergeColored([[ball, '#ffffff'], [b1, '#2a9df4'], [b2, '#ff3b30']]), () => new CANNON.Sphere(1.6), 3)
    // Explosive barrels (red with a hazard stripe)
    const barrel = new THREE.CylinderGeometry(0.55, 0.55, 1.4, 14)
    const band1 = new THREE.CylinderGeometry(0.57, 0.57, 0.2, 14)
    band1.translate(0, 0.3, 0)
    const band2 = new THREE.CylinderGeometry(0.57, 0.57, 0.12, 14)
    band2.translate(0, -0.35, 0)
    const lid = new THREE.CylinderGeometry(0.45, 0.45, 0.06, 14)
    lid.translate(0, 0.72, 0)
    kind('barrel', mergeColored([[barrel, '#d62828'], [band1, '#ffd23f'], [band2, '#222222'], [lid, '#7a1010']]), () => new CANNON.Cylinder(0.55, 0.55, 1.4, 10), 3)

    for (let row = 0; row < 4; row++) for (let i = 0; i <= row; i++) kinds.pin.items.push([px + 10 + (i - row / 2) * 1.6, CURB + 1.06, pz + 6 + row * 1.5])
    for (let layer = 0; layer < 4; layer++) for (let i = 0; i < 4 - layer; i++) kinds.crate.items.push([px - 12 + (i + layer / 2) * 1.65, CURB + 0.8 + layer * 1.62, pz - 2])
    kinds.ball.items.push([px + 4, CURB + 1.7, pz - 8])
    for (const [dx, dz] of [[-14, 8], [-12.6, 8.8], [-13.4, 9.9], [14, -14], [15.2, -13.2], [6, 20]]) kinds.barrel.items.push([px + dx, CURB + 0.71, pz + dz])
    // Barrel clusters on street corners around the city
    const corners = [...this.nodes].sort(() => rng() - 0.5)
    let placed = 0
    for (const nd of corners) {
      if (placed >= 9) break
      const sx = rng() < 0.5 ? -1 : 1
      const sz = rng() < 0.5 ? -1 : 1
      const x = nd.x + sx * (ROAD / 2 + 2.2)
      const z = nd.z + sz * (ROAD / 2 + 2.2)
      if (Math.abs(x) > HALF || Math.abs(z) > HALF || this.isInPlaza(x, z, 2)) continue
      if (Math.hypot(x - this.spawn.x, z - this.spawn.z) < 25) continue
      kinds.barrel.items.push([x, CURB + 0.71, z], [x + sx * 1.25, CURB + 0.71, z + sz * 0.3])
      placed++
    }
    for (let i = 0; i < 26; i++) {
      const sg = pick(rng, this.segments)
      const t = 0.3 + rng() * 0.4
      const x = sg.a.x + (sg.b.x - sg.a.x) * t + (sg.horiz ? 0 : (rng() - 0.5) * 6)
      const z = sg.a.z + (sg.b.z - sg.a.z) * t + (sg.horiz ? (rng() - 0.5) * 6 : 0)
      if (Math.hypot(x - this.spawn.x, z - this.spawn.z) < 20) continue
      kinds.cone.items.push([x, 0.62, z])
    }
    const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, flatShading: true })
    this.propMeshes = []
    for (const [name, k] of Object.entries(kinds)) {
      const mesh = new THREE.InstancedMesh(k.geo, material, k.items.length)
      mesh.castShadow = true
      mesh.receiveShadow = true
      mesh.frustumCulled = false
      this.root.add(mesh)
      this.propMeshes.push(mesh)
      k.items.forEach(([x, y, z], i) => {
        const body = new CANNON.Body({ mass: k.mass, shape: k.shape(), linearDamping: 0.2, angularDamping: 0.3 })
        body.position.set(x, y, z)
        body.allowSleep = true
        body.sleepSpeedLimit = 0.3
        body.sleepTimeLimit = 0.5
        this.addBody(body)
        this.props.push({ mesh, index: i, body, kind: name, hit: false, home: [x, y, z] })
      })
    }
    this.syncProps(true)
  }

  // Remove a prop (exploded barrel) and bring it back later.
  removeProp(p, respawn = 25) {
    if (p.gone) return
    p.gone = true
    p.hidden = false
    this.physics.removeBody(p.body)
    setTimeout(() => {
      if (this.disposed) return
      p.body.position.set(...p.home)
      p.body.quaternion.set(0, 0, 0, 1)
      p.body.velocity.set(0, 0, 0)
      p.body.angularVelocity.set(0, 0, 0)
      this.physics.addBody(p.body)
      p.gone = false
      p.hit = false
      this.syncProps(true)
    }, respawn * 1000)
  }

  syncProps(force = false) {
    const m = new THREE.Matrix4()
    const one = new THREE.Vector3(1, 1, 1)
    const dirty = new Set()
    const zero = new THREE.Vector3()
    for (const p of this.props) {
      if (p.gone) {
        if (!p.hidden) {
          m.compose(p.body.position, p.body.quaternion, zero)
          p.mesh.setMatrixAt(p.index, m)
          dirty.add(p.mesh)
          p.hidden = true
        }
        continue
      }
      if (!force && p.body.sleepState === CANNON.Body.SLEEPING) continue
      m.compose(p.body.position, p.body.quaternion, one)
      p.mesh.setMatrixAt(p.index, m)
      dirty.add(p.mesh)
    }
    for (const mesh of dirty) mesh.instanceMatrix.needsUpdate = true
  }

  // ---------- coins ----------
  buildCoins() {
    const rng = this.rng
    const spots = []
    for (const s of this.segments) {
      if (rng() < 0.45 || s.blocked) continue
      const lane = (rng() < 0.5 ? -1 : 1) * LANE
      for (const t of [0.3, 0.5, 0.7]) {
        const x = s.a.x + (s.b.x - s.a.x) * t + (s.horiz ? 0 : lane)
        const z = s.a.z + (s.b.z - s.a.z) * t + (s.horiz ? lane : 0)
        spots.push([x, 1.2, z])
      }
    }
    // Bonus coins along the flight path after every ramp
    for (const r of this.ramps ?? []) {
      for (let i = 0; i < 6; i++) {
        const d = 3 + i * 3.2
        spots.push([r.x + r.dx * d, r.y + 1.6 + Math.sin((i / 5) * Math.PI) * 2.6, r.z + r.dz * d])
      }
    }
    const geo = new THREE.CylinderGeometry(0.75, 0.75, 0.18, 18)
    geo.rotateX(Math.PI / 2)
    const coinMat = new THREE.MeshStandardMaterial({ color: '#ffcc33', metalness: 0.8, roughness: 0.25, emissive: '#ffaa00', emissiveIntensity: 0.55 })
    const mesh = new THREE.InstancedMesh(geo, coinMat, spots.length)
    mesh.castShadow = true
    this.root.add(mesh)
    this.coinMesh = mesh
    this.coins = spots.map(([x, y, z]) => ({ x, y, z, taken: false }))
    this.coinsLeft = this.coins.length
    this.updateCoins(0)
  }

  updateCoins(t) {
    const m = new THREE.Matrix4()
    const q = new THREE.Quaternion()
    const one = new THREE.Vector3(1, 1, 1)
    const zero = new THREE.Vector3(0, 0, 0)
    const p = new THREE.Vector3()
    const up = new THREE.Vector3(0, 1, 0)
    this.coins.forEach((c, i) => {
      q.setFromAxisAngle(up, t * 2.5 + i * 0.3)
      p.set(c.x, c.y + Math.sin(t * 3 + i) * 0.2, c.z)
      m.compose(p, q, c.taken ? zero : one)
      this.coinMesh.setMatrixAt(i, m)
    })
    this.coinMesh.instanceMatrix.needsUpdate = true
  }

  // ---------- race checkpoints ----------
  buildCheckpoints() {
    const pts = []
    for (const lm of this.landmarks) {
      const cands = [
        [lm.x, lm.z - lm.half - ROAD / 2],
        [lm.x, lm.z + lm.half + ROAD / 2],
        [lm.x - lm.half - ROAD / 2, lm.z],
        [lm.x + lm.half + ROAD / 2, lm.z],
      ].filter(([x, z]) => Math.abs(x) <= HALF + 0.1 && Math.abs(z) <= HALF + 0.1)
      cands.sort((a, b) => Math.hypot(a[0], a[1]) - Math.hypot(b[0], b[1]))
      const [x, z] = cands[0]
      const horizRoad = Math.abs(z - Math.round((z + HALF) / CELL) * CELL + HALF) < 0.5
      pts.push({ x, z, ry: horizRoad ? Math.PI / 2 : 0, landmark: lm })
    }
    // Greedy nearest-neighbour tour from spawn, back to start.
    const order = []
    let cur = { x: this.spawn.x, z: this.spawn.z }
    const left = [...pts]
    while (left.length) {
      left.sort((a, b) => Math.hypot(a.x - cur.x, a.z - cur.z) - Math.hypot(b.x - cur.x, b.z - cur.z))
      cur = left.shift()
      order.push(cur)
    }
    order.push({ x: this.spawn.x - LANE, z: this.spawn.z, ry: 0, finish: true })
    let len = 0
    let prev = this.spawn
    for (const p of order) {
      len += Math.abs(p.x - prev.x) + Math.abs(p.z - prev.z)
      prev = p
    }
    this.raceLength = len
    this.checkpoints = order
    const ringMat = new THREE.MeshStandardMaterial({ color: '#36e0ff', emissive: '#00c8ff', emissiveIntensity: 1.6, transparent: true, opacity: 0.85 })
    const finishMat = new THREE.MeshStandardMaterial({ color: '#ffe14a', emissive: '#ffcc00', emissiveIntensity: 1.6, transparent: true, opacity: 0.85 })
    this.ringGroup = new THREE.Group()
    this.ringGroup.visible = false
    for (const cp of order) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(6.2, 0.45, 8, 32), cp.finish ? finishMat : ringMat)
      ring.position.set(cp.x, 6.4, cp.z)
      ring.rotation.y = cp.ry
      ring.visible = false
      cp.mesh = ring
      this.ringGroup.add(ring)
    }
    this.root.add(this.ringGroup)
  }

  // ---------- traffic ----------
  buildTraffic() {
    const rng = this.rng
    const count = this.quality === 'low' ? 4 : this.quality === 'medium' ? 8 : 11
    const palette = this.city.parked ?? ['#e63946', '#f1faee', '#457b9d', '#2a9d8f', '#e9c46a', '#8d99ae', '#111111', '#f4a261']
    for (let i = 0; i < count; i++) {
      const seg = this.segments[Math.floor(rng() * this.segments.length)]
      if (seg.blocked) continue
      const from = rng() < 0.5 ? seg.a : seg.b
      const to = from === seg.a ? seg.b : seg.a
      if (Math.hypot(from.x - this.spawn.x, from.z - this.spawn.z) < 30) continue
      const color = palette.length === 1 ? (rng() < 0.6 ? palette[0] : pick(rng, ['#f1faee', '#457b9d', '#2a2a2a'])) : pick(rng, palette)
      const model = this.city.parked && color === palette[0] ? (this.city.id === 'london' ? 'bus' : 'taxi') : pick(rng, ['mini', 'classic', 'jeep', 'bubble'])
      const def = CARS.find((c) => c.id === model) ?? CARS[0]
      const mesh = buildCarMesh({ ...def, color: model === 'bus' || model === 'taxi' ? def.color : color }, true)
      this.root.add(mesh.group)
      const dims = model === 'bus' ? [1.3, 1.6, 5] : [1, 0.8, 2]
      const body = new CANNON.Body({ mass: 0, type: CANNON.Body.KINEMATIC, shape: new CANNON.Box(new CANNON.Vec3(...dims)) })
      this.addBody(body)
      const car = { mesh, body, from, to, t: rng(), speed: 0, maxSpeed: 7 + rng() * 4, heading: 0, len: model === 'bus' ? 10 : 4, pos: new THREE.Vector3() }
      this.lanePoint(from, to, car.t, car.pos)
      car.heading = Math.atan2(to.x - from.x, to.z - from.z)
      this.traffic.push(car)
    }
  }

  segmentBlocked(a, b) {
    if (!this.blockedKeys) this.blockedKeys = new Set(this.segments.filter((s) => s.blocked).flatMap((s) => [`${s.a.i},${s.a.j}-${s.b.i},${s.b.j}`, `${s.b.i},${s.b.j}-${s.a.i},${s.a.j}`]))
    return this.blockedKeys.has(`${a.i},${a.j}-${b.i},${b.j}`)
  }

  lanePoint(from, to, t, out) {
    const dx = Math.sign(to.x - from.x)
    const dz = Math.sign(to.z - from.z)
    // Drive on the right: right-hand normal of (dx,dz) is (-dz, dx)
    const ox = -dz * LANE
    const oz = dx * LANE
    out.set(from.x + (to.x - from.x) * t + ox, 0, from.z + (to.z - from.z) * t + oz)
    return out
  }

  updateTraffic(dt, playerPos) {
    const tmp = new THREE.Vector3()
    for (const car of this.traffic) {
      const segLen = Math.hypot(car.to.x - car.from.x, car.to.z - car.from.z)
      this.lanePoint(car.from, car.to, car.t, tmp)
      const dirx = Math.sign(car.to.x - car.from.x)
      const dirz = Math.sign(car.to.z - car.from.z)
      // Brake for the player or other traffic ahead
      let blocked = false
      const ahead = (px, pz, range) => {
        const rx = px - tmp.x
        const rz = pz - tmp.z
        const along = rx * dirx + rz * dirz
        const side = Math.abs(rx * -dirz + rz * dirx)
        return along > 0 && along < range && side < 2.6
      }
      if (playerPos && ahead(playerPos.x, playerPos.z, 9 + car.len / 2)) blocked = true
      if (!blocked) {
        for (const o of this.traffic) {
          if (o === car) continue
          if (ahead(o.body.position.x, o.body.position.z, 6 + car.len)) { blocked = true; break }
        }
      }
      const target = blocked ? 0 : car.maxSpeed
      car.speed += Math.sign(target - car.speed) * Math.min(Math.abs(target - car.speed), (blocked ? 18 : 5) * dt)
      car.t += (car.speed * dt) / segLen
      if (car.t >= 1) {
        const opts = car.to.links.filter((n) => n !== car.from && !this.segmentBlocked(car.to, n))
        const next = opts.length ? opts[Math.floor(this.rng() * opts.length)] : car.from
        car.from = car.to
        car.to = next
        car.t = Math.min(0.12, ROAD / 2 / CELL)
      }
      this.lanePoint(car.from, car.to, car.t, tmp)
      // Glide towards the lane target so corners are smooth instead of snapping.
      const b = car.body
      const dx = tmp.x - car.pos.x
      const dz = tmp.z - car.pos.z
      const dist = Math.hypot(dx, dz)
      const step = Math.min(dist, (car.speed * 1.5 + 0.5) * dt)
      if (dist > 1e-4) {
        car.pos.x += (dx / dist) * step
        car.pos.z += (dz / dist) * step
        if (step > 0.01) {
          let dh = Math.atan2(dx, dz) - car.heading
          dh = Math.atan2(Math.sin(dh), Math.cos(dh))
          car.heading += dh * Math.min(1, dt * 8)
        }
      }
      if (dt > 0) b.velocity.set((car.pos.x - b.position.x) / dt, 0, (car.pos.z - b.position.z) / dt)
      b.position.set(car.pos.x, car.len > 5 ? 1.7 : 0.9, car.pos.z)
      b.quaternion.setFromEuler(0, car.heading, 0)
      car.mesh.group.position.set(car.pos.x, 0, car.pos.z)
      car.mesh.group.rotation.y = car.heading
    }
  }

  update(t, dt, playerPos) {
    this.time = t
    for (const u of this.updaters) u(t, dt)
    this.updateCoins(t)
    this.syncProps()
    for (const lm of this.landmarks) {
      lm.beacon.visible = !lm.discovered
      if (!lm.discovered) {
        lm.beacon.position.y = lm.beacon.userData.baseY + Math.sin(t * 2) * 1.2
        lm.beacon.rotation.y = t * 1.5
      }
    }
    if (this.cloudMesh) this.updateClouds(dt)
    for (const cp of this.checkpoints) if (cp.mesh.visible) cp.mesh.rotation.z = t * 0.8
    this.updateTraffic(dt, playerPos)
    if (playerPos) {
      const c = shadowCenter.set(playerPos.x, 0, playerPos.z).applyMatrix4(this.lightRotInv)
      const s = this.shadowTexel
      c.x = Math.round(c.x / s) * s
      c.y = Math.round(c.y / s) * s
      c.applyMatrix4(this.lightRot)
      this.sun.target.position.copy(c)
      this.sun.position.copy(this.sunDir).multiplyScalar(120).add(c)
      this.sky.position.set(playerPos.x, this.sky.isMesh && this.sky.material.uniforms?.turbidity ? 0 : 0, playerPos.z)
      if (this.stars) this.stars.position.set(playerPos.x, 0, playerPos.z)
    }
  }

  dispose() {
    this.disposed = true
    if (this.envMap) {
      this.envMap.dispose()
      this.scene.environment = null
    }
    for (const b of this.bodies) this.physics.removeBody(b)
    this.scene.remove(this.root)
    this.root.traverse((o) => {
      if (o.geometry) o.geometry.dispose()
    })
    this.scene.fog = null
  }
}

// Merge [geometry, color] pairs into one vertex-coloured geometry.
function mergeColored(parts) {
  const c = new THREE.Color()
  const geos = parts.map(([g, col]) => {
    const geo = g.index ? g.toNonIndexed() : g
    c.set(col)
    const n = geo.attributes.position.count
    const arr = new Float32Array(n * 3)
    for (let i = 0; i < n; i++) arr.set([c.r, c.g, c.b], i * 3)
    geo.setAttribute('color', new THREE.BufferAttribute(arr, 3))
    for (const k of Object.keys(geo.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(k)) geo.deleteAttribute(k)
    return geo
  })
  return mergeGeometries(geos)
}

function makePavingTexture(c1, c2) {
  const c = document.createElement('canvas')
  c.width = c.height = 128
  const g = c.getContext('2d')
  g.fillStyle = c2
  g.fillRect(0, 0, 128, 128)
  const base = new THREE.Color(c1)
  for (let y = 0; y < 4; y++) {
    for (let x = 0; x < 4; x++) {
      const k = (Math.random() - 0.5) * 0.06
      g.fillStyle = '#' + base.clone().offsetHSL(0, 0, k).getHexString()
      const off = y % 2 ? 16 : 0
      g.fillRect(((x * 32 + off) % 128) + 1.5, y * 32 + 1.5, 29, 29)
      if (off) g.fillRect(-16 + 1.5, y * 32 + 1.5, 29, 29)
    }
  }
  const tex = new THREE.CanvasTexture(c)
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 4
  return tex
}

function makeWaterTexture() {
  const c = document.createElement('canvas')
  c.width = c.height = 128
  const g = c.getContext('2d')
  g.fillStyle = '#ffffff'
  g.fillRect(0, 0, 128, 128)
  for (let i = 0; i < 70; i++) {
    g.fillStyle = `rgba(${150 + Math.random() * 60},${200 + Math.random() * 40},255,${0.25 + Math.random() * 0.4})`
    const x = Math.random() * 128
    const y = Math.random() * 128
    g.beginPath()
    g.ellipse(x, y, 6 + Math.random() * 10, 1 + Math.random() * 1.5, 0, 0, Math.PI * 2)
    g.fill()
  }
  const tex = new THREE.CanvasTexture(c)
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

let rampMat
function rampMaterial() {
  if (rampMat) return rampMat
  const c = document.createElement('canvas')
  c.width = 128
  c.height = 256
  const g = c.getContext('2d')
  g.fillStyle = '#ff7a1a'
  g.fillRect(0, 0, 128, 256)
  g.fillStyle = '#ffffff'
  for (let i = 0; i < 4; i++) {
    const y = 230 - i * 62
    g.beginPath()
    g.moveTo(14, y)
    g.lineTo(64, y - 34)
    g.lineTo(114, y)
    g.lineTo(114, y - 16)
    g.lineTo(64, y - 50)
    g.lineTo(14, y - 16)
    g.closePath()
    g.fill()
  }
  g.fillStyle = '#1d1d1d'
  g.fillRect(0, 0, 8, 256)
  g.fillRect(120, 0, 8, 256)
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  rampMat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6, emissive: '#ff5a00', emissiveIntensity: 0.15 })
  return rampMat
}

let radialTex
export function radialTexture() {
  if (radialTex) return radialTex
  const c = document.createElement('canvas')
  c.width = c.height = 64
  const g = c.getContext('2d')
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32)
  grd.addColorStop(0, 'rgba(255,255,255,1)')
  grd.addColorStop(0.4, 'rgba(255,255,255,0.5)')
  grd.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = grd
  g.fillRect(0, 0, 64, 64)
  radialTex = new THREE.CanvasTexture(c)
  return radialTex
}
