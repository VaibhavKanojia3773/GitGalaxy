import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import useStore from '../store'

export default function Edges() {
  const graph   = useStore((s) => s.graph)
  const nodeMap = useStore((s) => s.nodeMap)

  const { structuralGeo, semanticGeo } = useMemo(() => {
    if (!graph?.edges || !nodeMap) {
      return { structuralGeo: null, semanticGeo: null }
    }

    // Build file-planet centroid map from chunk nodes
    const byFile = {}
    for (const node of (graph.nodes || [])) {
      if (node.type !== 'code') continue
      ;(byFile[node.file_path] ??= []).push(node)
    }
    // top-50 by chunk count (same cap as Nodes.jsx)
    const sorted = Object.entries(byFile).sort((a, b) => b[1].length - a[1].length).slice(0, 50)
    const fileCentroid = {}
    for (const [fp, chunks] of sorted) {
      fileCentroid[fp] = {
        x: chunks.reduce((s, c) => s + c.x, 0) / chunks.length,
        y: chunks.reduce((s, c) => s + c.y, 0) / chunks.length,
        z: chunks.reduce((s, c) => s + c.z, 0) / chunks.length,
      }
    }

    const structEdgeSet = new Set()
    const semanticEdgeSet = new Set()
    const structuralPts = []
    const semanticPts   = []

    for (const edge of graph.edges) {
      const src = nodeMap[edge.source]
      const tgt = nodeMap[edge.target]
      if (!src || !tgt) continue

      // issues and prs have direct positions, only aggregate code nodes
      if (src.type === 'code' && tgt.type === 'code') {
        const sfp = src.file_path
        const tfp = tgt.file_path
        if (!sfp || !tfp || sfp === tfp) continue  // skip intra-file edges
        const sc = fileCentroid[sfp]
        const tc = fileCentroid[tfp]
        if (!sc || !tc) continue

        const key = [sfp, tfp].sort().join('||')
        if (edge.type === 'structural') {
          if (!structEdgeSet.has(key)) {
            structEdgeSet.add(key)
            structuralPts.push(sc.x, sc.y, sc.z, tc.x, tc.y, tc.z)
          }
        } else {
          if (!semanticEdgeSet.has(key)) {
            semanticEdgeSet.add(key)
            semanticPts.push(sc.x, sc.y, sc.z, tc.x, tc.y, tc.z)
          }
        }
      } else {
        // issue/pr nodes still use direct positions
        const pts = edge.type === 'structural' ? structuralPts : semanticPts
        pts.push(src.x, src.y, src.z, tgt.x, tgt.y, tgt.z)
      }
    }

    const makeGeo = (pts) => {
      const geo = new THREE.BufferGeometry()
      geo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(pts), 3))
      return geo
    }

    let semanticGeo = null
    if (semanticPts.length) {
      const geo = makeGeo(semanticPts)
      const tmp = new THREE.LineSegments(geo)
      tmp.computeLineDistances()
      semanticGeo = geo
    }

    return {
      structuralGeo: structuralPts.length ? makeGeo(structuralPts) : null,
      semanticGeo,
    }
  }, [graph, nodeMap])

  const dashMatRef = useRef()
  useFrame(({ clock }) => {
    if (dashMatRef.current) {
      dashMatRef.current.dashOffset = -clock.elapsedTime * 0.4
    }
  })

  if (!structuralGeo && !semanticGeo) return null

  return (
    <group>
      {structuralGeo && (
        <lineSegments geometry={structuralGeo}>
          <lineBasicMaterial color="#334155" transparent opacity={0.3} />
        </lineSegments>
      )}
      {semanticGeo && (
        <lineSegments geometry={semanticGeo}>
          <lineDashedMaterial
            ref={dashMatRef}
            color="#4f46e5"
            transparent
            opacity={0.25}
            dashSize={1.5}
            gapSize={1.0}
          />
        </lineSegments>
      )}
    </group>
  )
}
