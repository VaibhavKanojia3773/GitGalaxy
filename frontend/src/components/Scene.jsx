import { useRef } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { OrbitControls, Stars } from '@react-three/drei'
import * as THREE from 'three'
import useStore from '../store'
import Nodes from './Nodes'
import Edges from './Edges'

function CameraController() {
  const { camera } = useThree()
  const cameraTarget = useStore((s) => s.cameraTarget)
  const targetRef = useRef(null)
  const lerpRef = useRef(false)

  if (cameraTarget && cameraTarget !== targetRef.current) {
    targetRef.current = cameraTarget
    lerpRef.current = true
  }

  useFrame(() => {
    if (!lerpRef.current || !targetRef.current) return
    const { x, y, z } = targetRef.current
    const dx = x - camera.position.x
    const dy = y - camera.position.y
    const dz = z - camera.position.z
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz)
    if (dist < 0.1) {
      lerpRef.current = false
      return
    }
    camera.position.x += dx * 0.06
    camera.position.y += dy * 0.06
    camera.position.z += dz * 0.06
  })

  return null
}

function SceneBackground() {
  useFrame(({ scene }) => {
    scene.background = new THREE.Color('#030712')
  })
  return null
}

export default function Scene() {
  const clearSelection = useStore((s) => s.clearSelection)

  return (
    <Canvas
      camera={{ position: [0, 0, 80], fov: 60 }}
      style={{ width: '100vw', height: '100vh' }}
      onPointerMissed={clearSelection}
    >
      <SceneBackground />
      <ambientLight intensity={0.3} />
      <pointLight position={[100, 100, 100]} intensity={1} />
      <Stars radius={300} depth={60} count={3000} factor={4} saturation={0} fade />
      <Nodes />
      <Edges />
      <OrbitControls enableDamping dampingFactor={0.05} />
      <CameraController />
    </Canvas>
  )
}
