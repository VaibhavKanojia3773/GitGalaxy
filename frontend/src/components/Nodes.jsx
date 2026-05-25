import { useMemo, useRef, useEffect } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import useStore from '../store'

// ── scratch objects ──────────────────────────────────────────────────────────
const _matrix = new THREE.Matrix4()
const _color  = new THREE.Color()
const _quat   = new THREE.Quaternion()
const _scale  = new THREE.Vector3()
const _pos    = new THREE.Vector3()
const _yAxis  = new THREE.Vector3(0, 1, 0)

const PLANET_GEO = new THREE.SphereGeometry(1, 32, 32)
const MOON_GEO   = new THREE.SphereGeometry(1, 14, 14)

// ── language lookup ──────────────────────────────────────────────────────────
const LANG_BY_EXT = {
  py: 'python', js: 'javascript', jsx: 'javascript',
  ts: 'typescript', tsx: 'typescript', java: 'java',
  go: 'go', cpp: 'cpp', c: 'c', h: 'c', cs: 'csharp',
  rb: 'ruby', rs: 'rust', php: 'php', md: 'markdown',
}
const LANG_COLORS = {
  python: '#818cf8', javascript: '#fbbf24', typescript: '#38bdf8',
  java: '#fb923c', go: '#34d399', cpp: '#2dd4bf', c: '#a3e635',
  csharp: '#c084fc', ruby: '#f87171', rust: '#fb7185', php: '#a78bfa',
  markdown: '#64748b', unknown: '#94a3b8',
}
function getLang(fp) { return LANG_BY_EXT[(fp.split('.').pop() || '').toLowerCase()] || 'unknown' }
function easeOut(t) { return 1 - (1 - t) * (1 - t) }

// ── Planet shader: fresnel atmosphere + subtle noise surface ─────────────────
const PLANET_VERT = /* glsl */`
  attribute vec3 instanceColor;
  uniform float uTime;

  varying vec3 vColor;
  varying vec3 vNormal;
  varying vec3 vViewPos;
  varying vec2 vUv;

  void main() {
    vColor  = instanceColor;
    vUv     = uv;
    vNormal = normalize(normalMatrix * mat3(instanceMatrix) * normal);

    vec4 mvPos = modelViewMatrix * instanceMatrix * vec4(position, 1.0);
    vViewPos   = -mvPos.xyz;
    gl_Position = projectionMatrix * mvPos;
  }
`

const PLANET_FRAG = /* glsl */`
  uniform float uTime;

  varying vec3 vColor;
  varying vec3 vNormal;
  varying vec3 vViewPos;
  varying vec2 vUv;

  // simple hash noise for surface variation
  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }
  float noise(vec2 p) {
    vec2 i = floor(p); vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i+vec2(1,0)), u.x),
               mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), u.x), u.y);
  }

  void main() {
    vec3 N = normalize(vNormal);
    vec3 V = normalize(vViewPos);

    // diffuse
    vec3 L = normalize(vec3(0.6, 0.8, 0.5));
    float diff = max(dot(N, L), 0.0) * 0.75 + 0.25;

    // surface noise bump (procedural latitude/longitude texture)
    float n1 = noise(vUv * 8.0 + uTime * 0.04);
    float n2 = noise(vUv * 16.0 - uTime * 0.02);
    float surface = n1 * 0.55 + n2 * 0.25;

    // fresnel atmosphere rim
    float fresnel = pow(1.0 - max(dot(N, V), 0.0), 2.8);

    vec3 base = vColor * diff;
    // darken surface slightly by noise to simulate terrain
    base *= (0.78 + surface * 0.44);
    // add bright atmosphere glow on rim
    base += vColor * fresnel * 1.8;

    // specular
    vec3 H = normalize(L + V);
    float spec = pow(max(dot(N, H), 0.0), 48.0);
    base += vec3(1.0) * spec * 0.35;

    // slight emissive so bloom picks it up
    base += vColor * 0.12;

    gl_FragColor = vec4(base, 1.0);
  }
`

// ── Moon shader: simpler glow ─────────────────────────────────────────────────
const MOON_VERT = /* glsl */`
  attribute vec3 instanceColor;
  varying vec3 vColor;
  varying vec3 vNormal;
  varying vec3 vViewPos;
  void main() {
    vColor  = instanceColor;
    vNormal = normalize(normalMatrix * mat3(instanceMatrix) * normal);
    vec4 mvPos = modelViewMatrix * instanceMatrix * vec4(position, 1.0);
    vViewPos = -mvPos.xyz;
    gl_Position = projectionMatrix * mvPos;
  }
`
const MOON_FRAG = /* glsl */`
  varying vec3 vColor;
  varying vec3 vNormal;
  varying vec3 vViewPos;
  void main() {
    vec3 N = normalize(vNormal);
    vec3 V = normalize(vViewPos);
    float fresnel = pow(1.0 - max(dot(N, V), 0.0), 2.5);
    vec3 L = normalize(vec3(0.6, 0.8, 0.5));
    float diff = max(dot(N, L), 0.0) * 0.7 + 0.3;
    vec3 col = vColor * diff;
    col += vColor * fresnel * 2.2;
    col += vColor * 0.25;  // emissive for bloom
    gl_FragColor = vec4(col, 1.0);
  }
`

// ── Glow halo material (additive sprites) ────────────────────────────────────
const GLOW_FRAG = /* glsl */`
  attribute vec3 instanceColor;
  varying vec3 vColor;
  varying vec2 vUv;
  attribute vec3 instanceColor2; // unused alias trick
  void main() {}
`

// ── Planet decorative rings ──────────────────────────────────────────────────
function PlanetRings({ filePlanets, expandedFileId }) {
  return filePlanets.filter(p => p.chunks.length >= 5).map(p => {
    const isExp = p.file_path === expandedFileId
    return (
      <group key={p.id} position={[p.x, p.y, p.z]} rotation={[Math.PI * 0.38, 0.2, 0]}>
        {/* inner ring */}
        <mesh>
          <torusGeometry args={[p.size * 1.7, 0.045, 6, 80]} />
          <meshBasicMaterial
            color={LANG_COLORS[p.lang] || LANG_COLORS.unknown}
            transparent opacity={isExp ? 0.7 : 0.2} depthWrite={false}
            blending={THREE.AdditiveBlending}
          />
        </mesh>
        {/* outer faint ring */}
        {p.chunks.length >= 8 && (
          <mesh>
            <torusGeometry args={[p.size * 2.4, 0.025, 6, 80]} />
            <meshBasicMaterial
              color={LANG_COLORS[p.lang] || LANG_COLORS.unknown}
              transparent opacity={isExp ? 0.4 : 0.1} depthWrite={false}
              blending={THREE.AdditiveBlending}
            />
          </mesh>
        )}
      </group>
    )
  })
}

// ── Atmosphere shell (shown when planet is expanded) ─────────────────────────
function AtmosphereShells({ filePlanets, expandedFileId }) {
  const planet = filePlanets.find(p => p.file_path === expandedFileId)
  if (!planet) return null
  const col = LANG_COLORS[planet.lang] || LANG_COLORS.unknown
  return (
    <group position={[planet.x, planet.y, planet.z]}>
      <mesh>
        <sphereGeometry args={[planet.size * 1.55, 24, 24]} />
        <meshBasicMaterial
          color={col} transparent opacity={0.07}
          side={THREE.BackSide} depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>
      <mesh>
        <sphereGeometry args={[planet.size * 1.85, 24, 24]} />
        <meshBasicMaterial
          color={col} transparent opacity={0.03}
          side={THREE.BackSide} depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>
    </group>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
export default function Nodes() {
  const graph            = useStore(s => s.graph)
  const highlightedNodes = useStore(s => s.highlightedNodes)
  const selectedNodeId   = useStore(s => s.selectedNodeId)
  const expandedFileId   = useStore(s => s.expandedFileId)
  const setSelectedNode  = useStore(s => s.setSelectedNode)
  const setExpandedFile  = useStore(s => s.setExpandedFile)
  const setCameraTarget  = useStore(s => s.setCameraTarget)

  // ── data grouping ──────────────────────────────────────────────────────────
  const { filePlanets, funcMoons, classMoons, issueNodes, prNodes, filePlanetMap } = useMemo(() => {
    if (!graph?.nodes) return { filePlanets: [], funcMoons: [], classMoons: [], issueNodes: [], prNodes: [], filePlanetMap: {} }
    const byFile = {}
    const issueNodes = [], prNodes = []
    for (const node of graph.nodes) {
      if (node.type === 'issue') { issueNodes.push(node); continue }
      if (node.type === 'pr')    { prNodes.push(node);   continue }
      if (node.type !== 'code')  continue
      ;(byFile[node.file_path] ??= []).push(node)
    }
    const allPlanets = Object.entries(byFile).map(([file_path, chunks]) => {
      const cx = chunks.reduce((s, c) => s + c.x, 0) / chunks.length
      const cy = chunks.reduce((s, c) => s + c.y, 0) / chunks.length
      const cz = chunks.reduce((s, c) => s + c.z, 0) / chunks.length
      const size = Math.max(1.5, Math.min(4.5, Math.log2(chunks.length + 1) * 1.6))
      const lang = getLang(file_path)
      return {
        id: `planet::${file_path}`, file_path, chunks,
        x: cx, y: cy, z: cz, size, lang,
        name: file_path.split('/').pop(),
        repNode: chunks.find(c => c.chunk_type === 'file') || chunks[0],
      }
    })
    allPlanets.sort((a, b) => b.chunks.length - a.chunks.length)
    const filePlanets = allPlanets.slice(0, 50)
    const filePlanetMap = Object.fromEntries(filePlanets.map(p => [p.file_path, p]))
    const allowed = new Set(filePlanets.map(p => p.file_path))
    const funcMoons = [], classMoons = []
    for (const node of graph.nodes) {
      if (node.type !== 'code' || !allowed.has(node.file_path)) continue
      if (node.chunk_type === 'function') funcMoons.push(node)
      else if (node.chunk_type === 'class') classMoons.push(node)
    }
    return { filePlanets, funcMoons, classMoons, issueNodes, prNodes, filePlanetMap }
  }, [graph])

  // ── shader uniforms ────────────────────────────────────────────────────────
  const planetUniforms = useMemo(() => ({ uTime: { value: 0 } }), [])
  const moonUniforms   = useMemo(() => ({}), [])

  // ── mesh refs ──────────────────────────────────────────────────────────────
  const planetMeshRef    = useRef()
  const glowMeshRef      = useRef()
  const funcMoonMeshRef  = useRef()
  const classMoonMeshRef = useRef()
  const issueMeshRef     = useRef()
  const prMeshRef        = useRef()

  // ── rotation + burst accumulators ─────────────────────────────────────────
  const rotsRef  = useRef({ planets: new Float32Array(0), funcs: new Float32Array(0), classes: new Float32Array(0), issues: new Float32Array(0), prs: new Float32Array(0) })
  const burstRef = useRef({ funcs: new Float32Array(0), classes: new Float32Array(0) })

  useEffect(() => {
    rotsRef.current = {
      planets: new Float32Array(filePlanets.length),
      funcs:   new Float32Array(funcMoons.length),
      classes: new Float32Array(classMoons.length),
      issues:  new Float32Array(issueNodes.length),
      prs:     new Float32Array(prNodes.length),
    }
    burstRef.current = {
      funcs:   new Float32Array(funcMoons.length),
      classes: new Float32Array(classMoons.length),
    }
  }, [graph])

  const expandedRef = useRef(expandedFileId)
  useEffect(() => { expandedRef.current = expandedFileId }, [expandedFileId])

  // ── DOM tooltip ────────────────────────────────────────────────────────────
  const tooltipEl = typeof document !== 'undefined' ? document.getElementById('node-tooltip') : null
  const showTip = (label, sub, cx, cy) => {
    if (!tooltipEl) return
    tooltipEl.innerHTML =
      `<span style="font-weight:600;color:#f8fafc">${label}</span>` +
      (sub ? `<br/><span style="color:#94a3b8;font-size:11px">${sub}</span>` : '')
    tooltipEl.style.cssText += `;display:block;left:${cx + 14}px;top:${cy - 32}px`
  }
  const hideTip = () => { if (tooltipEl) tooltipEl.style.display = 'none' }

  const hoveredRef = useRef({ meshType: null, instanceId: -1 })

  // ── unified useFrame ───────────────────────────────────────────────────────
  useFrame(({ clock }, delta) => {
    const t        = clock.elapsedTime
    const rots     = rotsRef.current
    const burst    = burstRef.current
    const expanded = expandedRef.current
    const hn       = highlightedNodes
    const hov      = hoveredRef.current

    // update shader time
    planetUniforms.uTime.value = t

    // ─ file planets ─
    const pm = planetMeshRef.current
    const gm = glowMeshRef.current
    if (pm && filePlanets.length) {
      for (let i = 0; i < filePlanets.length; i++) {
        const p           = filePlanets[i]
        const isExpanded  = p.file_path === expanded
        const isHighlight = p.chunks.some(c => hn.has(c.id))
        const isHovered   = hov.meshType === 'planet' && hov.instanceId === i
        const fade        = (expanded && !isExpanded) ? 0.15 : 1.0

        rots.planets[i] += delta * 0.06
        _quat.setFromAxisAngle(_yAxis, rots.planets[i])
        _pos.set(p.x, p.y, p.z)

        let s = p.size
        if (isExpanded)    s *= 1.35
        else if (isHovered) s *= 1.2
        if (isHighlight)    s *= 1.2
        _scale.setScalar(s)
        _matrix.compose(_pos, _quat, _scale)
        pm.setMatrixAt(i, _matrix)

        _color.set(LANG_COLORS[p.lang] || LANG_COLORS.unknown)
        if (isHighlight) { _color.r = Math.min(1, _color.r * 2.5); _color.g = Math.min(1, _color.g * 2.5); _color.b = Math.min(1, _color.b * 2.5) }
        if (fade < 1) _color.multiplyScalar(fade)
        pm.setColorAt(i, _color)

        if (gm) {
          // glow halo: 2.8x planet size, pulsing when expanded
          const gs = s * (isExpanded ? 2.8 + Math.sin(t * 2) * 0.15 : 2.8)
          _scale.setScalar(gs)
          _matrix.compose(_pos, _quat.identity(), _scale)
          gm.setMatrixAt(i, _matrix)
          _color.set(LANG_COLORS[p.lang] || LANG_COLORS.unknown)
          const glowFade = fade < 1 ? fade * 0.4 : (isExpanded ? 0.14 : 0.06)
          _color.multiplyScalar(glowFade)
          gm.setColorAt(i, _color)
        }
      }
      pm.instanceMatrix.needsUpdate = true
      if (pm.instanceColor) pm.instanceColor.needsUpdate = true
      if (gm) { gm.instanceMatrix.needsUpdate = true; if (gm.instanceColor) gm.instanceColor.needsUpdate = true }
    }

    // ─ function moons ─
    const fm = funcMoonMeshRef.current
    if (fm && funcMoons.length) {
      for (let i = 0; i < funcMoons.length; i++) {
        const moon = funcMoons[i]
        const show = moon.file_path === expanded
        burst.funcs[i] = show ? Math.min(1, burst.funcs[i] + delta * 3.5) : Math.max(0, burst.funcs[i] - delta * 3.5)
        const bt = easeOut(burst.funcs[i])
        const fp = filePlanetMap[moon.file_path]
        _pos.set(
          fp ? fp.x + (moon.x - fp.x) * bt : moon.x * bt,
          fp ? fp.y + (moon.y - fp.y) * bt : moon.y * bt,
          fp ? fp.z + (moon.z - fp.z) * bt : moon.z * bt,
        )
        rots.funcs[i] += delta * 0.38
        _quat.setFromAxisAngle(_yAxis, rots.funcs[i])
        const isHov = hov.meshType === 'func' && hov.instanceId === i
        const isSel = selectedNodeId === moon.id
        _scale.setScalar(0.45 * bt * (isHov ? 1.5 : isSel ? 1.8 : 1))
        _matrix.compose(_pos, _quat, _scale)
        fm.setMatrixAt(i, _matrix)
        _color.set(hn.has(moon.id) ? '#ffffff' : '#a5b4fc')
        fm.setColorAt(i, _color)
      }
      fm.instanceMatrix.needsUpdate = true
      if (fm.instanceColor) fm.instanceColor.needsUpdate = true
    }

    // ─ class moons ─
    const cm = classMoonMeshRef.current
    if (cm && classMoons.length) {
      for (let i = 0; i < classMoons.length; i++) {
        const moon = classMoons[i]
        const show = moon.file_path === expanded
        burst.classes[i] = show ? Math.min(1, burst.classes[i] + delta * 3.5) : Math.max(0, burst.classes[i] - delta * 3.5)
        const bt = easeOut(burst.classes[i])
        const fp = filePlanetMap[moon.file_path]
        _pos.set(
          fp ? fp.x + (moon.x - fp.x) * bt : moon.x * bt,
          fp ? fp.y + (moon.y - fp.y) * bt : moon.y * bt,
          fp ? fp.z + (moon.z - fp.z) * bt : moon.z * bt,
        )
        rots.classes[i] += delta * 0.18
        _quat.setFromAxisAngle(_yAxis, rots.classes[i])
        const isHov = hov.meshType === 'class' && hov.instanceId === i
        const isSel = selectedNodeId === moon.id
        _scale.setScalar(0.58 * bt * (isHov ? 1.5 : isSel ? 1.8 : 1))
        _matrix.compose(_pos, _quat, _scale)
        cm.setMatrixAt(i, _matrix)
        _color.set(hn.has(moon.id) ? '#ffffff' : '#6ee7b7')
        cm.setColorAt(i, _color)
      }
      cm.instanceMatrix.needsUpdate = true
      if (cm.instanceColor) cm.instanceColor.needsUpdate = true
    }

    // ─ issues ─
    const im = issueMeshRef.current
    if (im && issueNodes.length) {
      const fade = expanded ? 0.2 : 1.0
      for (let i = 0; i < issueNodes.length; i++) {
        const n = issueNodes[i]
        rots.issues[i] += delta * 0.5
        const pulse = 1 + Math.sin(t * Math.PI * 1.8 + i * 1.3) * 0.14
        _quat.setFromAxisAngle(_yAxis, rots.issues[i])
        _pos.set(n.x, n.y, n.z)
        const isHov = hov.meshType === 'issue' && hov.instanceId === i
        _scale.setScalar(1.3 * pulse * (isHov ? 1.35 : 1) * fade)
        _matrix.compose(_pos, _quat, _scale)
        im.setMatrixAt(i, _matrix)
        _color.set(hn.has(n.id) ? '#ffffff' : '#fbbf24')
        if (fade < 1) _color.multiplyScalar(fade)
        im.setColorAt(i, _color)
      }
      im.instanceMatrix.needsUpdate = true
      if (im.instanceColor) im.instanceColor.needsUpdate = true
    }

    // ─ prs ─
    const prm = prMeshRef.current
    if (prm && prNodes.length) {
      const fade = expanded ? 0.2 : 1.0
      for (let i = 0; i < prNodes.length; i++) {
        const n = prNodes[i]
        rots.prs[i] += delta * 0.2
        _quat.setFromAxisAngle(_yAxis, rots.prs[i])
        _pos.set(n.x, n.y, n.z)
        const isHov = hov.meshType === 'pr' && hov.instanceId === i
        _scale.setScalar(1.3 * (isHov ? 1.35 : 1) * fade)
        _matrix.compose(_pos, _quat, _scale)
        prm.setMatrixAt(i, _matrix)
        _color.set(hn.has(n.id) ? '#ffffff' : '#4ade80')
        if (fade < 1) _color.multiplyScalar(fade)
        prm.setColorAt(i, _color)
      }
      prm.instanceMatrix.needsUpdate = true
      if (prm.instanceColor) prm.instanceColor.needsUpdate = true
    }
  })

  if (!graph?.nodes?.length) return null

  // ── event handlers ─────────────────────────────────────────────────────────
  function makePlanetHandlers() {
    return {
      onPointerMove(e) {
        e.stopPropagation()
        const id = e.instanceId
        if (id == null || id >= filePlanets.length) { hoveredRef.current = { meshType: null, instanceId: -1 }; hideTip(); return }
        hoveredRef.current = { meshType: 'planet', instanceId: id }
        const p = filePlanets[id]
        showTip(p.name, `${p.lang} · ${p.chunks.length} chunks — click to expand`, e.clientX, e.clientY)
      },
      onPointerOut(e) { e.stopPropagation(); hoveredRef.current = { meshType: null, instanceId: -1 }; hideTip() },
      onClick(e) {
        e.stopPropagation()
        const id = e.instanceId
        if (id == null || id >= filePlanets.length) return
        const p = filePlanets[id]
        if (expandedRef.current === p.file_path) {
          setExpandedFile(null)
        } else {
          setExpandedFile(p.file_path)
          setCameraTarget({ x: p.x, y: p.y, z: p.z + 32 })
        }
        setSelectedNode(p.repNode)
      },
    }
  }

  function makeMoonHandlers(meshType, moons) {
    return {
      onPointerMove(e) {
        e.stopPropagation()
        const id = e.instanceId
        if (id == null || id >= moons.length) { hoveredRef.current = { meshType: null, instanceId: -1 }; hideTip(); return }
        hoveredRef.current = { meshType, instanceId: id }
        const m = moons[id]
        showTip(m.name, m.file_path, e.clientX, e.clientY)
      },
      onPointerOut(e) { e.stopPropagation(); hoveredRef.current = { meshType: null, instanceId: -1 }; hideTip() },
      onClick(e) {
        e.stopPropagation()
        const id = e.instanceId
        if (id == null || id >= moons.length) return
        const m = moons[id]
        setSelectedNode(m)
        setCameraTarget({ x: m.x, y: m.y, z: m.z + 15 })
      },
    }
  }

  function makeNodeHandlers(meshType, nodes) {
    return {
      onPointerMove(e) {
        e.stopPropagation()
        const id = e.instanceId
        if (id == null || id >= nodes.length) { hoveredRef.current = { meshType: null, instanceId: -1 }; hideTip(); return }
        hoveredRef.current = { meshType, instanceId: id }
        const n = nodes[id]
        showTip(n.title || n.name || n.id, `${n.type} #${n.number || ''}`, e.clientX, e.clientY)
      },
      onPointerOut(e) { e.stopPropagation(); hoveredRef.current = { meshType: null, instanceId: -1 }; hideTip() },
      onClick(e) {
        e.stopPropagation()
        const id = e.instanceId
        if (id == null || id >= nodes.length) return
        setSelectedNode(nodes[id])
        setCameraTarget({ x: nodes[id].x, y: nodes[id].y, z: nodes[id].z + 20 })
      },
    }
  }

  return (
    <group>
      {/* glow halos — additive blending, rendered before planets */}
      {filePlanets.length > 0 && (
        <instancedMesh ref={glowMeshRef} args={[PLANET_GEO, null, filePlanets.length]} frustumCulled={false} renderOrder={-1}>
          <meshBasicMaterial vertexColors transparent opacity={0.06} depthWrite={false} blending={THREE.AdditiveBlending} />
        </instancedMesh>
      )}

      {/* file planets — custom fresnel shader */}
      {filePlanets.length > 0 && (
        <instancedMesh ref={planetMeshRef} args={[PLANET_GEO, null, filePlanets.length]} frustumCulled={false} {...makePlanetHandlers()}>
          <shaderMaterial
            vertexShader={PLANET_VERT}
            fragmentShader={PLANET_FRAG}
            uniforms={planetUniforms}
          />
        </instancedMesh>
      )}

      {/* function moons */}
      {funcMoons.length > 0 && (
        <instancedMesh ref={funcMoonMeshRef} args={[MOON_GEO, null, funcMoons.length]} frustumCulled={false} {...makeMoonHandlers('func', funcMoons)}>
          <shaderMaterial vertexShader={MOON_VERT} fragmentShader={MOON_FRAG} uniforms={moonUniforms} />
        </instancedMesh>
      )}

      {/* class moons */}
      {classMoons.length > 0 && (
        <instancedMesh ref={classMoonMeshRef} args={[MOON_GEO, null, classMoons.length]} frustumCulled={false} {...makeMoonHandlers('class', classMoons)}>
          <shaderMaterial vertexShader={MOON_VERT} fragmentShader={MOON_FRAG} uniforms={moonUniforms} />
        </instancedMesh>
      )}

      {/* issue nodes */}
      {issueNodes.length > 0 && (
        <instancedMesh ref={issueMeshRef} args={[MOON_GEO, null, issueNodes.length]} frustumCulled={false} {...makeNodeHandlers('issue', issueNodes)}>
          <shaderMaterial vertexShader={MOON_VERT} fragmentShader={MOON_FRAG} uniforms={moonUniforms} />
        </instancedMesh>
      )}

      {/* pr nodes */}
      {prNodes.length > 0 && (
        <instancedMesh ref={prMeshRef} args={[MOON_GEO, null, prNodes.length]} frustumCulled={false} {...makeNodeHandlers('pr', prNodes)}>
          <shaderMaterial vertexShader={MOON_VERT} fragmentShader={MOON_FRAG} uniforms={moonUniforms} />
        </instancedMesh>
      )}

      <PlanetRings filePlanets={filePlanets} expandedFileId={expandedFileId} />
      <AtmosphereShells filePlanets={filePlanets} expandedFileId={expandedFileId} />
    </group>
  )
}
