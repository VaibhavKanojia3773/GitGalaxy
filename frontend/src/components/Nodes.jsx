import { useMemo, useRef, useEffect } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import useStore from '../store'

// ── scratch objects (never recreated) ──────────────────────────────────────
const _matrix = new THREE.Matrix4()
const _color  = new THREE.Color()
const _quat   = new THREE.Quaternion()
const _scale  = new THREE.Vector3()
const _pos    = new THREE.Vector3()
const _yAxis  = new THREE.Vector3(0, 1, 0)

const PLANET_GEO = new THREE.SphereGeometry(1, 24, 24)
const MOON_GEO   = new THREE.SphereGeometry(1, 10, 10)

const LANG_BY_EXT = {
  py: 'python', js: 'javascript', jsx: 'javascript',
  ts: 'typescript', tsx: 'typescript', java: 'java',
  go: 'go', cpp: 'cpp', c: 'c', h: 'c', cs: 'csharp',
  rb: 'ruby', rs: 'rust', php: 'php', md: 'markdown',
}

const LANG_COLORS = {
  python:     '#818cf8',
  javascript: '#fbbf24',
  typescript: '#38bdf8',
  java:       '#fb923c',
  go:         '#34d399',
  cpp:        '#2dd4bf',
  c:          '#a3e635',
  csharp:     '#c084fc',
  ruby:       '#f87171',
  rust:       '#fb7185',
  php:        '#a78bfa',
  markdown:   '#64748b',
  unknown:    '#94a3b8',
}

function getLang(file_path) {
  const ext = (file_path.split('.').pop() || '').toLowerCase()
  return LANG_BY_EXT[ext] || 'unknown'
}

function easeOut(t) { return 1 - (1 - t) * (1 - t) }

// ── decorative torus rings on large planets ─────────────────────────────────
function PlanetRings({ filePlanets, expandedFileId }) {
  const ringed = filePlanets.filter(p => p.chunks.length >= 5)
  return ringed.map(p => (
    <mesh key={p.id} position={[p.x, p.y, p.z]} rotation={[Math.PI / 2, 0, 0]}>
      <torusGeometry args={[p.size * 1.9, 0.055, 8, 64]} />
      <meshBasicMaterial
        color={LANG_COLORS[p.lang] || LANG_COLORS.unknown}
        transparent
        opacity={p.file_path === expandedFileId ? 0.55 : 0.18}
        depthWrite={false}
      />
    </mesh>
  ))
}

// ── main component ──────────────────────────────────────────────────────────
export default function Nodes() {
  const graph           = useStore(s => s.graph)
  const highlightedNodes = useStore(s => s.highlightedNodes)
  const selectedNodeId  = useStore(s => s.selectedNodeId)
  const expandedFileId  = useStore(s => s.expandedFileId)
  const setSelectedNode = useStore(s => s.setSelectedNode)
  const setExpandedFile = useStore(s => s.setExpandedFile)
  const setCameraTarget = useStore(s => s.setCameraTarget)

  // ── group nodes into file planets + moons ──────────────────────────────
  const { filePlanets, funcMoons, classMoons, issueNodes, prNodes, filePlanetMap } = useMemo(() => {
    if (!graph?.nodes) return {
      filePlanets: [], funcMoons: [], classMoons: [],
      issueNodes: [], prNodes: [], filePlanetMap: {},
    }

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
      const size = Math.max(1.5, Math.min(4.2, Math.log2(chunks.length + 1) * 1.5))
      const lang = getLang(file_path)
      const repNode = chunks.find(c => c.chunk_type === 'file') || chunks[0]
      return {
        id: `planet::${file_path}`,
        file_path, chunks, x: cx, y: cy, z: cz, size, lang,
        name: file_path.split('/').pop(),
        repNode,
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

  // ── mesh refs ────────────────────────────────────────────────────────────
  const planetMeshRef    = useRef()
  const glowMeshRef      = useRef()
  const funcMoonMeshRef  = useRef()
  const classMoonMeshRef = useRef()
  const issueMeshRef     = useRef()
  const prMeshRef        = useRef()

  // ── rotation accumulators ────────────────────────────────────────────────
  const rotsRef = useRef({ planets: new Float32Array(0), funcs: new Float32Array(0), classes: new Float32Array(0), issues: new Float32Array(0), prs: new Float32Array(0) })
  useEffect(() => {
    rotsRef.current = {
      planets: new Float32Array(filePlanets.length),
      funcs:   new Float32Array(funcMoons.length),
      classes: new Float32Array(classMoons.length),
      issues:  new Float32Array(issueNodes.length),
      prs:     new Float32Array(prNodes.length),
    }
  }, [graph])

  // ── burst progress [0→1] for function/class moons ────────────────────────
  const burstRef = useRef({ funcs: new Float32Array(0), classes: new Float32Array(0) })
  useEffect(() => {
    burstRef.current = {
      funcs:   new Float32Array(funcMoons.length),
      classes: new Float32Array(classMoons.length),
    }
  }, [graph])

  // ── expanded file as ref so useFrame never re-subscribes ─────────────────
  const expandedRef = useRef(expandedFileId)
  useEffect(() => { expandedRef.current = expandedFileId }, [expandedFileId])

  // ── DOM tooltip ──────────────────────────────────────────────────────────
  const tooltipEl = typeof document !== 'undefined' ? document.getElementById('node-tooltip') : null
  function showTooltip(label, sub, cx, cy) {
    if (!tooltipEl) return
    tooltipEl.innerHTML =
      `<span style="font-weight:600;color:#f8fafc">${label}</span>` +
      (sub ? `<br/><span style="color:#94a3b8;font-size:11px">${sub}</span>` : '')
    tooltipEl.style.cssText += `;display:block;left:${cx + 14}px;top:${cy - 32}px`
  }
  function hideTooltip() { if (tooltipEl) tooltipEl.style.display = 'none' }

  // ── unified useFrame ─────────────────────────────────────────────────────
  useFrame(({ clock }, delta) => {
    const t       = clock.elapsedTime
    const rots    = rotsRef.current
    const burst   = burstRef.current
    const expanded = expandedRef.current
    const hn      = highlightedNodes
    const hov     = hoveredRef.current

    // ─ file planets + glow ─
    const pm = planetMeshRef.current
    const gm = glowMeshRef.current
    if (pm && filePlanets.length) {
      for (let i = 0; i < filePlanets.length; i++) {
        const p = filePlanets[i]
        const isExpanded    = p.file_path === expanded
        const isHighlighted = p.chunks.some(c => hn.has(c.id))
        const isHovered     = hov.meshType === 'planet' && hov.instanceId === i
        const fade = (expanded && !isExpanded) ? 0.18 : 1.0

        rots.planets[i] += delta * 0.07
        _quat.setFromAxisAngle(_yAxis, rots.planets[i])
        _pos.set(p.x, p.y, p.z)

        let s = p.size
        if (isExpanded)    s *= 1.3
        else if (isHovered) s *= 1.15
        if (isHighlighted)  s *= 1.2
        _scale.setScalar(s)
        _matrix.compose(_pos, _quat, _scale)
        pm.setMatrixAt(i, _matrix)

        _color.set(LANG_COLORS[p.lang] || LANG_COLORS.unknown)
        if (isHighlighted) { _color.r = Math.min(1, _color.r * 2.2); _color.g = Math.min(1, _color.g * 2.2); _color.b = Math.min(1, _color.b * 2.2) }
        if (fade < 1) _color.multiplyScalar(fade)
        pm.setColorAt(i, _color)

        if (gm) {
          _scale.setScalar(s * 2.9)
          _matrix.compose(_pos, _quat.identity(), _scale)
          gm.setMatrixAt(i, _matrix)
          _color.set(LANG_COLORS[p.lang] || LANG_COLORS.unknown)
          if (fade < 1) _color.multiplyScalar(fade * 0.5)
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
        burst.funcs[i] = show ? Math.min(1, burst.funcs[i] + delta * 4) : Math.max(0, burst.funcs[i] - delta * 4)
        const bt = easeOut(burst.funcs[i])

        const fp = filePlanetMap[moon.file_path]
        _pos.set(
          fp ? fp.x + (moon.x - fp.x) * bt : moon.x * bt,
          fp ? fp.y + (moon.y - fp.y) * bt : moon.y * bt,
          fp ? fp.z + (moon.z - fp.z) * bt : moon.z * bt,
        )
        rots.funcs[i] += delta * 0.4
        _quat.setFromAxisAngle(_yAxis, rots.funcs[i])
        const isHov = hov.meshType === 'func' && hov.instanceId === i
        const isSel = selectedNodeId === moon.id
        _scale.setScalar(0.45 * bt * (isHov ? 1.4 : isSel ? 1.7 : 1))
        _matrix.compose(_pos, _quat, _scale)
        fm.setMatrixAt(i, _matrix)
        _color.set(hn.has(moon.id) ? '#ffffff' : '#818cf8')
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
        burst.classes[i] = show ? Math.min(1, burst.classes[i] + delta * 4) : Math.max(0, burst.classes[i] - delta * 4)
        const bt = easeOut(burst.classes[i])

        const fp = filePlanetMap[moon.file_path]
        _pos.set(
          fp ? fp.x + (moon.x - fp.x) * bt : moon.x * bt,
          fp ? fp.y + (moon.y - fp.y) * bt : moon.y * bt,
          fp ? fp.z + (moon.z - fp.z) * bt : moon.z * bt,
        )
        rots.classes[i] += delta * 0.2
        _quat.setFromAxisAngle(_yAxis, rots.classes[i])
        const isHov = hov.meshType === 'class' && hov.instanceId === i
        const isSel = selectedNodeId === moon.id
        _scale.setScalar(0.55 * bt * (isHov ? 1.4 : isSel ? 1.7 : 1))
        _matrix.compose(_pos, _quat, _scale)
        cm.setMatrixAt(i, _matrix)
        _color.set(hn.has(moon.id) ? '#ffffff' : '#34d399')
        cm.setColorAt(i, _color)
      }
      cm.instanceMatrix.needsUpdate = true
      if (cm.instanceColor) cm.instanceColor.needsUpdate = true
    }

    // ─ issues ─
    const im = issueMeshRef.current
    if (im && issueNodes.length) {
      const fade = expanded ? 0.25 : 1.0
      for (let i = 0; i < issueNodes.length; i++) {
        const n = issueNodes[i]
        rots.issues[i] += delta * 0.55
        const pulse = 1 + Math.sin(t * Math.PI * 2 + i) * 0.12
        _quat.setFromAxisAngle(_yAxis, rots.issues[i])
        _pos.set(n.x, n.y, n.z)
        const isHov = hov.meshType === 'issue' && hov.instanceId === i
        _scale.setScalar(1.35 * pulse * (isHov ? 1.3 : 1) * fade)
        _matrix.compose(_pos, _quat, _scale)
        im.setMatrixAt(i, _matrix)
        _color.set(hn.has(n.id) ? '#ffffff' : '#fb923c')
        if (fade < 1) _color.multiplyScalar(fade)
        im.setColorAt(i, _color)
      }
      im.instanceMatrix.needsUpdate = true
      if (im.instanceColor) im.instanceColor.needsUpdate = true
    }

    // ─ prs ─
    const prm = prMeshRef.current
    if (prm && prNodes.length) {
      const fade = expanded ? 0.25 : 1.0
      for (let i = 0; i < prNodes.length; i++) {
        const n = prNodes[i]
        rots.prs[i] += delta * 0.22
        _quat.setFromAxisAngle(_yAxis, rots.prs[i])
        _pos.set(n.x, n.y, n.z)
        const isHov = hov.meshType === 'pr' && hov.instanceId === i
        _scale.setScalar(1.35 * (isHov ? 1.3 : 1) * fade)
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

  // ── hover ref (declared after useFrame to avoid hoisting issues) ─────────
  const hoveredRef = useRef({ meshType: null, instanceId: -1 })

  if (!graph?.nodes?.length) return null

  // ── event handler factories ──────────────────────────────────────────────
  function makePlanetHandlers() {
    return {
      onPointerMove(e) {
        e.stopPropagation()
        const id = e.instanceId
        if (id == null || id >= filePlanets.length) { hoveredRef.current = { meshType: null, instanceId: -1 }; hideTooltip(); return }
        hoveredRef.current = { meshType: 'planet', instanceId: id }
        const p = filePlanets[id]
        showTooltip(p.name, `${p.lang} · ${p.chunks.length} chunks — click to expand`, e.clientX, e.clientY)
      },
      onPointerOut(e) { e.stopPropagation(); hoveredRef.current = { meshType: null, instanceId: -1 }; hideTooltip() },
      onClick(e) {
        e.stopPropagation()
        const id = e.instanceId
        if (id == null || id >= filePlanets.length) return
        const p = filePlanets[id]
        if (expandedRef.current === p.file_path) {
          setExpandedFile(null)
        } else {
          setExpandedFile(p.file_path)
          setCameraTarget({ x: p.x, y: p.y, z: p.z + 30 })
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
        if (id == null || id >= moons.length) { hoveredRef.current = { meshType: null, instanceId: -1 }; hideTooltip(); return }
        hoveredRef.current = { meshType, instanceId: id }
        const m = moons[id]
        showTooltip(m.name, m.file_path, e.clientX, e.clientY)
      },
      onPointerOut(e) { e.stopPropagation(); hoveredRef.current = { meshType: null, instanceId: -1 }; hideTooltip() },
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
        if (id == null || id >= nodes.length) { hoveredRef.current = { meshType: null, instanceId: -1 }; hideTooltip(); return }
        hoveredRef.current = { meshType, instanceId: id }
        const n = nodes[id]
        showTooltip(n.title || n.name || n.id, `${n.type} #${n.number || ''}`, e.clientX, e.clientY)
      },
      onPointerOut(e) { e.stopPropagation(); hoveredRef.current = { meshType: null, instanceId: -1 }; hideTooltip() },
      onClick(e) {
        e.stopPropagation()
        const id = e.instanceId
        if (id == null || id >= nodes.length) return
        const n = nodes[id]
        setSelectedNode(n)
        setCameraTarget({ x: n.x, y: n.y, z: n.z + 20 })
      },
    }
  }

  return (
    <group>
      {/* planet glow halos */}
      {filePlanets.length > 0 && (
        <instancedMesh ref={glowMeshRef} args={[PLANET_GEO, null, filePlanets.length]} frustumCulled={false} renderOrder={-1}>
          <meshBasicMaterial vertexColors transparent opacity={0.07} depthWrite={false} blending={THREE.AdditiveBlending} />
        </instancedMesh>
      )}

      {/* file planets */}
      {filePlanets.length > 0 && (
        <instancedMesh ref={planetMeshRef} args={[PLANET_GEO, null, filePlanets.length]} frustumCulled={false} {...makePlanetHandlers()}>
          <meshStandardMaterial vertexColors emissive="#ffffff" emissiveIntensity={0.18} roughness={0.3} metalness={0.2} />
        </instancedMesh>
      )}

      {/* function moons */}
      {funcMoons.length > 0 && (
        <instancedMesh ref={funcMoonMeshRef} args={[MOON_GEO, null, funcMoons.length]} frustumCulled={false} {...makeMoonHandlers('func', funcMoons)}>
          <meshStandardMaterial vertexColors emissive="#818cf8" emissiveIntensity={0.5} roughness={0.25} metalness={0.1} />
        </instancedMesh>
      )}

      {/* class moons */}
      {classMoons.length > 0 && (
        <instancedMesh ref={classMoonMeshRef} args={[MOON_GEO, null, classMoons.length]} frustumCulled={false} {...makeMoonHandlers('class', classMoons)}>
          <meshStandardMaterial vertexColors emissive="#34d399" emissiveIntensity={0.5} roughness={0.25} metalness={0.1} />
        </instancedMesh>
      )}

      {/* issues */}
      {issueNodes.length > 0 && (
        <instancedMesh ref={issueMeshRef} args={[MOON_GEO, null, issueNodes.length]} frustumCulled={false} {...makeNodeHandlers('issue', issueNodes)}>
          <meshStandardMaterial vertexColors emissive="#fb923c" emissiveIntensity={0.6} roughness={0.2} metalness={0.1} />
        </instancedMesh>
      )}

      {/* prs */}
      {prNodes.length > 0 && (
        <instancedMesh ref={prMeshRef} args={[MOON_GEO, null, prNodes.length]} frustumCulled={false} {...makeNodeHandlers('pr', prNodes)}>
          <meshStandardMaterial vertexColors emissive="#4ade80" emissiveIntensity={0.5} roughness={0.2} metalness={0.1} />
        </instancedMesh>
      )}

      <PlanetRings filePlanets={filePlanets} expandedFileId={expandedFileId} />
    </group>
  )
}
