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

    const structuralPts = []
    const semanticPts   = []

    for (const edge of graph.edges) {
      const src = nodeMap[edge.source]
      const tgt = nodeMap[edge.target]
      if (!src || !tgt) continue
      const pts = edge.type === 'structural' ? structuralPts : semanticPts
      pts.push(src.x, src.y, src.z, tgt.x, tgt.y, tgt.z)
    }

    const makeGeo = (pts) => {
      const geo = new THREE.BufferGeometry()
      geo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(pts), 3))
      return geo
    }

    let semanticGeo = null
    if (semanticPts.length) {
      const geo = makeGeo(semanticPts)
      // computeLineDistances requires a LineSegments wrapper
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
          <lineBasicMaterial color="#475569" transparent opacity={0.45} />
        </lineSegments>
      )}
      {semanticGeo && (
        <lineSegments geometry={semanticGeo}>
          <lineDashedMaterial
            ref={dashMatRef}
            color="#4f46e5"
            transparent
            opacity={0.35}
            dashSize={1.5}
            gapSize={1.0}
          />
        </lineSegments>
      )}
    </group>
  )
}
