import { useMemo, useRef, useEffect } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import useStore from '../store'

// ── reusable scratch objects (never recreated) ─────────────────────────────
const _matrix = new THREE.Matrix4()
const _color = new THREE.Color()
const _quat = new THREE.Quaternion()
const _scale = new THREE.Vector3()
const _pos = new THREE.Vector3()
const _yAxis = new THREE.Vector3(0, 1, 0)
const SPHERE_GEO = new THREE.SphereGeometry(1, 12, 12)

const BASE_COLORS = {
  function: '#818cf8',
  class:    '#34d399',
  file:     '#94a3b8',
  issue:    '#fb923c',
  pr:       '#4ade80',
}

const ROT_SPEED = {
  func:  0.3,
  class: 0.15,
  file:  0.1,
  issue: 0.5,
  pr:    0.2,
}

function nodeBaseColor(node) {
  if (node.type === 'issue') return BASE_COLORS.issue
  if (node.type === 'pr')    return BASE_COLORS.pr
  return BASE_COLORS[node.chunk_type] || BASE_COLORS.file
}

// ── decorative rings for class nodes ──────────────────────────────────────
function ClassRings({ classNodes }) {
  return classNodes.map((node) => (
    <mesh
      key={node.id}
      position={[node.x, node.y, node.z]}
      rotation={[Math.PI / 2, 0, 0]}
    >
      <torusGeometry args={[Math.max(0.3, Math.min(node.size || 0.8, 1.5)) * 1.8, 0.05, 8, 48]} />
      <meshBasicMaterial
        color="#34d399"
        transparent
        opacity={0.35}
        depthWrite={false}
      />
    </mesh>
  ))
}

// ── decorative orbit rings for file nodes ─────────────────────────────────
function FileOrbitRings({ fileNodes }) {
  const rings = useMemo(() => fileNodes.map((fn) => {
    const r = Math.max(0.3, Math.min(fn.size || 0.8, 1.5)) * 2.5
    const pts = []
    for (let i = 0; i <= 64; i++) {
      const a = (i / 64) * Math.PI * 2
      pts.push(new THREE.Vector3(fn.x + Math.cos(a) * r, fn.y, fn.z + Math.sin(a) * r))
    }
    return { id: fn.id, geo: new THREE.BufferGeometry().setFromPoints(pts) }
  }), [fileNodes])

  return rings.map(({ id, geo }) => (
    <line key={id} geometry={geo}>
      <lineBasicMaterial color="#334155" transparent opacity={0.22} depthWrite={false} />
    </line>
  ))
}

// ── main Nodes component ───────────────────────────────────────────────────
export default function Nodes() {
  const graph           = useStore((s) => s.graph)
  const highlightedNodes = useStore((s) => s.highlightedNodes)
  const selectedNodeId  = useStore((s) => s.selectedNodeId)
  const setSelectedNode = useStore((s) => s.setSelectedNode)
  const setCameraTarget = useStore((s) => s.setCameraTarget)

  // split nodes into typed groups once per graph change
  const { funcNodes, classNodes, fileNodes, issueNodes, prNodes } = useMemo(() => {
    const nodes = graph?.nodes || []
    const funcNodes = [], classNodes = [], fileNodes = [], issueNodes = [], prNodes = []
    for (const node of nodes) {
      if (node.type === 'issue') issueNodes.push(node)
      else if (node.type === 'pr') prNodes.push(node)
      else if (node.chunk_type === 'class') classNodes.push(node)
      else if (node.chunk_type === 'function') funcNodes.push(node)
      else fileNodes.push(node)
    }
    return { funcNodes, classNodes, fileNodes, issueNodes, prNodes }
  }, [graph])

  const funcMeshRef  = useRef()
  const classMeshRef = useRef()
  const fileMeshRef  = useRef()
  const issueMeshRef = useRef()
  const prMeshRef    = useRef()

  // per-instance rotation angle accumulators (reset on graph change)
  const rotsRef = useRef({ func: new Float32Array(0), class: new Float32Array(0), file: new Float32Array(0), issue: new Float32Array(0), pr: new Float32Array(0) })
  useEffect(() => {
    rotsRef.current = {
      func:  new Float32Array(funcNodes.length),
      class: new Float32Array(classNodes.length),
      file:  new Float32Array(fileNodes.length),
      issue: new Float32Array(issueNodes.length),
      pr:    new Float32Array(prNodes.length),
    }
  }, [graph])

  // hovered instance (ref — no re-render on change)
  const hoveredRef = useRef({ meshType: null, instanceId: -1 })

  // DOM tooltip (zero React overhead)
  const tooltipEl = typeof document !== 'undefined' ? document.getElementById('node-tooltip') : null

  function showTooltip(node, clientX, clientY) {
    if (!tooltipEl) return
    const label = node.name || node.title || node.id
    const sub   = node.file_path || node.type
    tooltipEl.innerHTML =
      `<span style="font-weight:600;color:#f8fafc">${label}</span>` +
      `<br/><span style="color:#94a3b8;font-size:11px">${sub}</span>`
    tooltipEl.style.display = 'block'
    tooltipEl.style.left    = `${clientX + 14}px`
    tooltipEl.style.top     = `${clientY - 32}px`
  }

  function hideTooltip() {
    if (tooltipEl) tooltipEl.style.display = 'none'
  }

  // single useFrame handles all five meshes
  useFrame(({ clock }, delta) => {
    const t    = clock.elapsedTime
    const rots = rotsRef.current
    const hn   = highlightedNodes

    function updateMesh(mesh, nodes, rotKey, rotSpeed) {
      if (!mesh || !nodes.length) return
      const rot = rots[rotKey]
      const hov = hoveredRef.current

      for (let i = 0; i < nodes.length; i++) {
        const node = nodes[i]
        const isSelected    = node.id === selectedNodeId
        const isHighlighted = hn.has(node.id)
        const isHovered     = hov.meshType === rotKey && hov.instanceId === i

        // accumulate rotation
        if (i < rot.length) rot[i] += delta * rotSpeed
        _quat.setFromAxisAngle(_yAxis, i < rot.length ? rot[i] : 0)

        let s = Math.max(0.3, Math.min(node.size || 0.8, 1.5))
        if (isSelected)         s *= 1.6
        else if (isHovered)     s *= 1.3
        else if (isHighlighted) s *= 1.15

        // issues pulse
        if (rotKey === 'issue') s *= 1 + Math.sin(t * Math.PI * 2) * 0.12

        _pos.set(node.x, node.y, node.z)
        _scale.setScalar(s)
        _matrix.compose(_pos, _quat, _scale)
        mesh.setMatrixAt(i, _matrix)

        _color.set(nodeBaseColor(node))
        if (isSelected)         { _color.set('#ffffff') }
        else if (isHighlighted) { _color.r = Math.min(1, _color.r * 1.8); _color.g = Math.min(1, _color.g * 1.8); _color.b = Math.min(1, _color.b * 1.8) }
        else if (isHovered)     { _color.r = Math.min(1, _color.r * 1.4); _color.g = Math.min(1, _color.g * 1.4); _color.b = Math.min(1, _color.b * 1.4) }
        mesh.setColorAt(i, _color)
      }
      mesh.instanceMatrix.needsUpdate = true
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    }

    updateMesh(funcMeshRef.current,  funcNodes,  'func',  ROT_SPEED.func)
    updateMesh(classMeshRef.current, classNodes, 'class', ROT_SPEED.class)
    updateMesh(fileMeshRef.current,  fileNodes,  'file',  ROT_SPEED.file)
    updateMesh(issueMeshRef.current, issueNodes, 'issue', ROT_SPEED.issue)
    updateMesh(prMeshRef.current,    prNodes,    'pr',    ROT_SPEED.pr)
  })

  if (!graph?.nodes?.length) return null

  function makeHandlers(meshType, nodes) {
    return {
      onPointerMove(e) {
        e.stopPropagation()
        const id = e.instanceId
        if (id == null || id < 0 || id >= nodes.length) {
          hoveredRef.current = { meshType: null, instanceId: -1 }
          hideTooltip()
          return
        }
        hoveredRef.current = { meshType, instanceId: id }
        showTooltip(nodes[id], e.clientX, e.clientY)
      },
      onPointerOut(e) {
        e.stopPropagation()
        hoveredRef.current = { meshType: null, instanceId: -1 }
        hideTooltip()
      },
      onClick(e) {
        e.stopPropagation()
        const id = e.instanceId
        if (id == null || id < 0 || id >= nodes.length) return
        const node = nodes[id]
        setSelectedNode(node)
        setCameraTarget({ x: node.x, y: node.y, z: node.z + 20 })
      },
    }
  }

  return (
    <group>
      {funcNodes.length > 0 && (
        <instancedMesh
          ref={funcMeshRef}
          args={[SPHERE_GEO, null, funcNodes.length]}
          frustumCulled={false}
          {...makeHandlers('func', funcNodes)}
        >
          <meshStandardMaterial vertexColors emissive="#818cf8" emissiveIntensity={0.2} roughness={0.4} metalness={0.1} />
        </instancedMesh>
      )}

      {classNodes.length > 0 && (
        <instancedMesh
          ref={classMeshRef}
          args={[SPHERE_GEO, null, classNodes.length]}
          frustumCulled={false}
          {...makeHandlers('class', classNodes)}
        >
          <meshStandardMaterial vertexColors emissive="#34d399" emissiveIntensity={0.2} roughness={0.4} metalness={0.1} />
        </instancedMesh>
      )}

      {fileNodes.length > 0 && (
        <instancedMesh
          ref={fileMeshRef}
          args={[SPHERE_GEO, null, fileNodes.length]}
          frustumCulled={false}
          {...makeHandlers('file', fileNodes)}
        >
          <meshStandardMaterial vertexColors emissive="#94a3b8" emissiveIntensity={0.15} roughness={0.4} metalness={0.1} />
        </instancedMesh>
      )}

      {issueNodes.length > 0 && (
        <instancedMesh
          ref={issueMeshRef}
          args={[SPHERE_GEO, null, issueNodes.length]}
          frustumCulled={false}
          {...makeHandlers('issue', issueNodes)}
        >
          <meshStandardMaterial vertexColors emissive="#fb923c" emissiveIntensity={0.3} roughness={0.3} metalness={0.1} />
        </instancedMesh>
      )}

      {prNodes.length > 0 && (
        <instancedMesh
          ref={prMeshRef}
          args={[SPHERE_GEO, null, prNodes.length]}
          frustumCulled={false}
          {...makeHandlers('pr', prNodes)}
        >
          <meshStandardMaterial vertexColors emissive="#4ade80" emissiveIntensity={0.2} roughness={0.4} metalness={0.1} />
        </instancedMesh>
      )}

      <ClassRings classNodes={classNodes} />
      <FileOrbitRings fileNodes={fileNodes} />
    </group>
  )
}
