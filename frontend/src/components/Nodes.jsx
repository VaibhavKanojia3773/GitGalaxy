import { useMemo, useRef, useCallback, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import * as THREE from 'three'
import useStore from '../store'

const NODE_COLORS = {
  function: '#818cf8',
  class: '#34d399',
  file: '#94a3b8',
  issue: '#fb923c',
  pr: '#4ade80',
}

function getColor(node) {
  if (node.type === 'issue') return NODE_COLORS.issue
  if (node.type === 'pr') return NODE_COLORS.pr
  return NODE_COLORS[node.chunk_type] || NODE_COLORS.file
}

function NodeMesh({ node, isHighlighted, isSelected }) {
  const meshRef = useRef()
  const [hovered, setHovered] = useState(false)
  const setSelectedNode = useStore((s) => s.setSelectedNode)
  const setCameraTarget = useStore((s) => s.setCameraTarget)

  const color = getColor(node)
  const baseSize = Math.max(0.3, Math.min(node.size || 0.8, 1.5))
  const isIssue = node.type === 'issue'

  useFrame((state) => {
    if (!meshRef.current) return
    let scale = hovered ? 1.3 : 1.0
    if (isSelected) scale = 1.5
    if (isIssue) {
      scale *= 1 + Math.sin(state.clock.elapsedTime * Math.PI * 2) * 0.1
    }
    meshRef.current.scale.setScalar(scale)
  })

  const handleClick = useCallback((e) => {
    e.stopPropagation()
    setSelectedNode(node)
    setCameraTarget({ x: node.x, y: node.y, z: node.z + 20 })
  }, [node, setSelectedNode, setCameraTarget])

  return (
    <group position={[node.x, node.y, node.z]}>
      {isHighlighted && (
        <mesh>
          <sphereGeometry args={[baseSize * 1.6, 12, 12]} />
          <meshBasicMaterial color="white" transparent opacity={0.15} />
        </mesh>
      )}
      <mesh
        ref={meshRef}
        onClick={handleClick}
        onPointerOver={(e) => { e.stopPropagation(); setHovered(true) }}
        onPointerOut={() => setHovered(false)}
      >
        <sphereGeometry args={[baseSize, 16, 16]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={hovered ? 0.6 : 0.2}
          roughness={0.4}
          metalness={0.1}
        />
      </mesh>
      {hovered && (
        <Html distanceFactor={40} style={{ pointerEvents: 'none' }}>
          <div className="bg-gray-900 border border-gray-700 rounded px-2 py-1 text-xs text-white whitespace-nowrap shadow-lg">
            <div className="font-medium">{node.name}</div>
            <div className="text-gray-400">{node.file_path || node.type}</div>
          </div>
        </Html>
      )}
    </group>
  )
}

export default function Nodes() {
  const graph = useStore((s) => s.graph)
  const highlightedNodes = useStore((s) => s.highlightedNodes)
  const selectedNode = useStore((s) => s.selectedNode)

  const nodes = useMemo(() => graph?.nodes || [], [graph])

  if (!nodes.length) return null

  return (
    <group>
      {nodes.map((node) => (
        <NodeMesh
          key={node.id}
          node={node}
          isHighlighted={highlightedNodes.has(node.id)}
          isSelected={selectedNode?.id === node.id}
        />
      ))}
    </group>
  )
}
