// Particles (smoke, dust, sparks, confetti, nitro flames) and tyre skid marks.
import * as THREE from 'three'

export class Particles {
  constructor(scene, max = 1500, additive = false) {
    this.max = max
    this.count = 0
    this.pos = new Float32Array(max * 3)
    this.col = new Float32Array(max * 3)
    this.size = new Float32Array(max)
    this.alpha = new Float32Array(max)
    this.vel = new Float32Array(max * 3)
    this.life = new Float32Array(max)
    this.maxLife = new Float32Array(max)
    this.grav = new Float32Array(max)
    this.grow = new Float32Array(max)
    this.drag = new Float32Array(max)
    this.a0 = new Float32Array(max)
    this.cursor = 0
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage))
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage))
    g.setAttribute('size', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage))
    g.setAttribute('alpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage))
    this.geo = g
    const m = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      uniforms: { scale: { value: window.innerHeight * 0.5 } },
      vertexShader: `attribute float size; attribute float alpha; attribute vec3 color; varying float vA; varying vec3 vC; uniform float scale;
        void main(){ vA = alpha; vC = color; vec4 mv = modelViewMatrix * vec4(position,1.0); gl_PointSize = size * scale / -mv.z; gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `varying float vA; varying vec3 vC; void main(){ vec2 c = gl_PointCoord - 0.5; float d = length(c); if (d > 0.5) discard; float a = smoothstep(0.5, 0.15, d) * vA; gl_FragColor = vec4(vC, a); }`,
    })
    this.material = m
    this.points = new THREE.Points(g, m)
    this.points.frustumCulled = false
    scene.add(this.points)
  }

  resize(h) {
    this.material.uniforms.scale.value = h * 0.5
  }

  emit(x, y, z, vx, vy, vz, color, size, life, { gravity = 0, grow = 0, drag = 0, alpha = 1 } = {}) {
    const i = this.cursor
    this.cursor = (this.cursor + 1) % this.max
    this.pos[i * 3] = x
    this.pos[i * 3 + 1] = y
    this.pos[i * 3 + 2] = z
    this.vel[i * 3] = vx
    this.vel[i * 3 + 1] = vy
    this.vel[i * 3 + 2] = vz
    const c = tmpColor.set(color)
    this.col[i * 3] = c.r
    this.col[i * 3 + 1] = c.g
    this.col[i * 3 + 2] = c.b
    this.size[i] = size
    this.life[i] = life
    this.maxLife[i] = life
    this.grav[i] = gravity
    this.grow[i] = grow
    this.drag[i] = drag
    this.a0[i] = alpha
    this.alpha[i] = alpha
  }

  burst(x, y, z, n, colors, speed = 8, opts = {}) {
    for (let k = 0; k < n; k++) {
      const a = Math.random() * Math.PI * 2
      const up = opts.up ?? 0.6
      const s = speed * (0.4 + Math.random() * 0.6)
      this.emit(
        x, y, z,
        Math.cos(a) * s * (1 - up * 0.5), s * up + Math.random() * s * 0.5, Math.sin(a) * s * (1 - up * 0.5),
        colors[k % colors.length],
        (opts.size ?? 0.5) * (0.6 + Math.random() * 0.8),
        (opts.life ?? 1.2) * (0.6 + Math.random() * 0.6),
        { gravity: opts.gravity ?? 12, drag: opts.drag ?? 0.5, grow: opts.grow ?? 0, alpha: 1 },
      )
    }
  }

  update(dt) {
    const n = this.max
    for (let i = 0; i < n; i++) {
      if (this.life[i] <= 0) {
        if (this.alpha[i] !== 0) this.alpha[i] = 0
        continue
      }
      this.life[i] -= dt
      const k = 1 - this.drag[i] * dt
      this.vel[i * 3] *= k
      this.vel[i * 3 + 1] = this.vel[i * 3 + 1] * k - this.grav[i] * dt
      this.vel[i * 3 + 2] *= k
      this.pos[i * 3] += this.vel[i * 3] * dt
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt
      if (this.pos[i * 3 + 1] < 0.05 && this.grav[i] > 0) {
        this.pos[i * 3 + 1] = 0.05
        this.vel[i * 3 + 1] *= -0.3
        this.vel[i * 3] *= 0.7
        this.vel[i * 3 + 2] *= 0.7
      }
      this.size[i] += this.grow[i] * dt
      const t = this.life[i] / this.maxLife[i]
      this.alpha[i] = this.a0[i] * Math.min(1, t * 2.5)
    }
    this.geo.attributes.position.needsUpdate = true
    this.geo.attributes.alpha.needsUpdate = true
    this.geo.attributes.size.needsUpdate = true
    this.geo.attributes.color.needsUpdate = true
  }

  dispose() {
    this.points.parent?.remove(this.points)
    this.geo.dispose()
    this.material.dispose()
  }
}

const tmpColor = new THREE.Color()

export class SkidMarks {
  constructor(scene, max = 800) {
    this.max = max
    this.cursor = 0
    this.positions = new Float32Array(max * 4 * 3)
    const idx = []
    for (let i = 0; i < max; i++) {
      const b = i * 4
      idx.push(b, b + 2, b + 1, b + 1, b + 2, b + 3)
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(this.positions, 3).setUsage(THREE.DynamicDrawUsage))
    g.setIndex(idx)
    this.geo = g
    this.mesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: '#111111', transparent: true, opacity: 0.45, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }))
    this.mesh.frustumCulled = false
    this.mesh.renderOrder = 1
    scene.add(this.mesh)
    this.last = [null, null, null, null]
  }

  add(wheel, p, skidding, width = 0.32) {
    if (!skidding) {
      this.last[wheel] = null
      return
    }
    const prev = this.last[wheel]
    const cur = { x: p.x, z: p.z, y: Math.max(p.y, 0) + 0.04 }
    if (prev) {
      const dx = cur.x - prev.x
      const dz = cur.z - prev.z
      const len = Math.hypot(dx, dz)
      if (len < 0.25) return
      if (len < 4) {
        const nx = (-dz / len) * width
        const nz = (dx / len) * width
        const i = this.cursor
        this.cursor = (this.cursor + 1) % this.max
        const a = this.positions
        a.set([prev.x + nx, prev.y, prev.z + nz, prev.x - nx, prev.y, prev.z - nz, cur.x + nx, cur.y, cur.z + nz, cur.x - nx, cur.y, cur.z - nz], i * 12)
        this.geo.attributes.position.needsUpdate = true
      }
    }
    this.last[wheel] = cur
  }

  clear() {
    this.positions.fill(0)
    this.geo.attributes.position.needsUpdate = true
    this.last = [null, null, null, null]
  }

  dispose() {
    this.mesh.parent?.remove(this.mesh)
    this.geo.dispose()
  }
}
