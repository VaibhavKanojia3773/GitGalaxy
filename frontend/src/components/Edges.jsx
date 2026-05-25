import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import useStore from '../store'

const _v   = new THREE.Vector3()
const _col = new THREE.Color()
const _mat = new THREE.Matrix4()
const _q   = new THREE.Quaternion()
const _s   = new THREE.Vector3()
const DOT_GEO = new THREE.SphereGeometry(0.18, 6, 6)

// Build a curved arc path between two 3D points using a CatmullRomCurve3
// The arc bows outward by `bow` fraction of the distance
function makeArcPoints(ax, ay, az, bx, by, bz, segments = 12) {
  const mx = (ax + bx) / 2
  const my = (ay + by) / 2
  const mz = (az + bz) / 2
  const dist = Math.sqrt((bx - ax) ** 2 + (by - ay) ** 2 + (bz - az) ** 2)
  const bow = dist * 0.18   // 18% bow
  // perpendicular offset: use world Y with a tilt
  const mid = new THREE.Vector3(mx, my + bow, mz + bow * 0.3)
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(ax, ay, az),
    mid,
    new THREE.Vector3(bx, by, bz),
  ])
  return curve.getPoints(segments)
}

// Convert arc points to flat Float32Array for BufferGeometry LineStrip
function arcToBuffer(pts) {
  const arr = new Float32Array(pts.length * 3)
  for (let i = 0; i < pts.length; i++) {
    arr[i * 3]     = pts[i].x
    arr[i * 3 + 1] = pts[i].y
    arr[i * 3 + 2] = pts[i].z
  }
  return arr
}

export default function Edges() {
  const graph   = useStore((s) => s.graph)
  const nodeMap = useStore((s) => s.nodeMap)

  const { structuralArcs, semanticArcs, flowData } = useMemo(() => {
    if (!graph?.edges || !nodeMap) return { structuralArcs: null, semanticArcs: null, flowData: [] }

    // build file centroid map (same cap as Nodes.jsx — top 50 by chunk count)
    const byFile = {}
    for (const node of (graph.nodes || [])) {
      if (node.type !== 'code') continue
      ;(byFile[node.file_path] ??= []).push(node)
    }
    const sorted = Object.entries(byFile)
      .sort((a, b) => b[1].length - a[1].length)
      .slice(0, 50)
    const centroid = {}
    for (const [fp, chunks] of sorted) {
      centroid[fp] = {
        x: chunks.reduce((s, c) => s + c.x, 0) / chunks.length,
        y: chunks.reduce((s, c) => s + c.y, 0) / chunks.length,
        z: chunks.reduce((s, c) => s + c.z, 0) / chunks.length,
      }
    }

    const structEdgeSet = new Set()
    const semanticEdgeSet = new Set()

    // collect arc point arrays for LineStrip rendering
    const structPtArrays = []
    const semanticPtArrays = []

    // flow data for animated dots: [{points: THREE.Vector3[], t: float}]
    const flowData = []

    for (const edge of graph.edges) {
      const src = nodeMap[edge.source]
      const tgt = nodeMap[edge.target]
      if (!src || !tgt) continue

      if (src.type === 'code' && tgt.type === 'code') {
        const sfp = src.file_path, tfp = tgt.file_path
        if (!sfp || !tfp || sfp === tfp) continue
        const sc = centroid[sfp], tc = centroid[tfp]
        if (!sc || !tc) continue

        const key = [sfp, tfp].sort().join('||')
        if (edge.type === 'structural') {
          if (!structEdgeSet.has(key)) {
            structEdgeSet.add(key)
            const pts = makeArcPoints(sc.x, sc.y, sc.z, tc.x, tc.y, tc.z, 14)
            structPtArrays.push(pts)
            // add flow animation entry — initial t offset randomised
            flowData.push({ curve: new THREE.CatmullRomCurve3(pts), t: Math.random() })
          }
        } else {
          if (!semanticEdgeSet.has(key)) {
            semanticEdgeSet.add(key)
            const pts = makeArcPoints(sc.x, sc.y, sc.z, tc.x, tc.y, tc.z, 10)
            semanticPtArrays.push(pts)
          }
        }
      }
    }

    // build merged BufferGeometry for all structural arcs (LineStrip per arc)
    const makeArcGeo = (ptArrays) => {
      if (!ptArrays.length) return null
      // Each arc: n points = n segments.
      // We build one merged geometry with all arcs connected by degenerate lines
      const positions = []
      for (const pts of ptArrays) {
        for (const p of pts) { positions.push(p.x, p.y, p.z) }
        // degenerate — repeat last point to create gap
        const last = pts[pts.length - 1]
        positions.push(last.x, last.y, last.z)
      }
      const geo = new THREE.BufferGeometry()
      geo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(positions), 3))
      return geo
    }

    return {
      structuralArcs: makeArcGeo(structPtArrays),
      semanticArcs: makeArcGeo(semanticPtArrays),
      flowData,
    }
  }, [graph, nodeMap])

  // ── animated flow dots along structural arcs ───────────────────────────────
  const dotMeshRef  = useRef()
  const flowRef     = useRef(flowData)
  flowRef.current   = flowData

  const dotCount = Math.min(flowData.length, 80)  // cap at 80 dots for perf

  useFrame(({ clock }, delta) => {
    const dots = dotMeshRef.current
    if (!dots || !flowRef.current.length) return

    for (let i = 0; i < dotCount; i++) {
      const fd = flowRef.current[i]
      if (!fd) continue

      fd.t = (fd.t + delta * 0.22) % 1.0
      const pt = fd.curve.getPoint(fd.t)
      _v.copy(pt)
      _q.identity()
      _s.setScalar(0.18 + Math.sin(fd.t * Math.PI) * 0.14)  // swell in middle
      _mat.compose(_v, _q, _s)
      dots.setMatrixAt(i, _mat)

      // colour: white-blue tint flowing
      const hue = 0.62 + Math.sin(fd.t * Math.PI * 2) * 0.04
      _col.setHSL(hue, 0.9, 0.75)
      dots.setColorAt(i, _col)
    }
    dots.instanceMatrix.needsUpdate = true
    if (dots.instanceColor) dots.instanceColor.needsUpdate = true
  })

  if (!structuralArcs && !semanticArcs) return null

  return (
    <group>
      {/* structural arcs — pale blue-slate */}
      {structuralArcs && (
        <line geometry={structuralArcs}>
          <lineBasicMaterial color="#3b4f6e" transparent opacity={0.35} />
        </line>
      )}

      {/* semantic arcs — indigo dashed (animated via dashOffset) */}
      {semanticArcs && <SemanticArcs geo={semanticArcs} />}

      {/* animated flow dots along structural arcs */}
      {dotCount > 0 && (
        <instancedMesh ref={dotMeshRef} args={[DOT_GEO, null, dotCount]} frustumCulled={false}>
          <meshBasicMaterial vertexColors transparent opacity={0.85} depthWrite={false} blending={THREE.AdditiveBlending} />
        </instancedMesh>
      )}
    </group>
  )
}

// separate component to hold dashOffset ref cleanly
function SemanticArcs({ geo }) {
  const matRef = useRef()
  useFrame(({ clock }) => {
    if (matRef.current) matRef.current.dashOffset = -clock.elapsedTime * 0.35
  })
  return (
    <lineSegments geometry={geo}>
      <lineDashedMaterial
        ref={matRef}
        color="#6366f1"
        transparent
        opacity={0.22}
        dashSize={2}
        gapSize={1.2}
      />
    </lineSegments>
  )
}
