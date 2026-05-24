import { useRef, useMemo, useEffect } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
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
    if (dist < 0.1) { lerpRef.current = false; return }
    camera.position.x += dx * 0.06
    camera.position.y += dy * 0.06
    camera.position.z += dz * 0.06
  })

  return null
}

function GalaxyParticles({ count = 8000 }) {
  const meshRef = useRef()
  useFrame((_, delta) => {
    if (meshRef.current) meshRef.current.rotation.y += delta * 0.018
  })

  const geo = useMemo(() => {
    const positions = new Float32Array(count * 3)
    const colors    = new Float32Array(count * 3)
    const color     = new THREE.Color()

    for (let i = 0; i < count; i++) {
      const arm       = Math.floor(Math.random() * 3)
      const angle     = (arm / 3) * Math.PI * 2 + Math.random() * 0.8
      const radius    = Math.pow(Math.random(), 0.5) * 180 + 5
      const spinAngle = radius * 0.25
      const spread    = (1 / radius) * 12

      positions[i * 3]     = Math.cos(angle + spinAngle) * radius + (Math.random() - 0.5) * spread
      positions[i * 3 + 1] = (Math.random() - 0.5) * 6
      positions[i * 3 + 2] = Math.sin(angle + spinAngle) * radius + (Math.random() - 0.5) * spread

      const t = radius / 180
      color.setHSL(0.67 - t * 0.1, 0.6, 0.4 + (1 - t) * 0.4)
      color.toArray(colors, i * 3)
    }

    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    g.setAttribute('color',    new THREE.Float32BufferAttribute(colors, 3))
    return g
  }, [count])

  return (
    <points ref={meshRef} geometry={geo}>
      <pointsMaterial
        size={0.35}
        vertexColors
        transparent
        opacity={0.6}
        sizeAttenuation
        depthWrite={false}
      />
    </points>
  )
}

function GalaxyCore() {
  return (
    <mesh>
      <sphereGeometry args={[10, 16, 16]} />
      <meshBasicMaterial
        color="#c8b4ff"
        transparent
        opacity={0.06}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </mesh>
  )
}

export default function Scene() {
  const clearSelection = useStore((s) => s.clearSelection)
  const setExpandedFile = useStore((s) => s.setExpandedFile)

  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') setExpandedFile(null) }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [setExpandedFile])

  return (
    <Canvas
      camera={{ position: [0, 0, 80], fov: 60 }}
      style={{ width: '100vw', height: '100vh' }}
      onPointerMissed={clearSelection}
      onCreated={({ scene }) => {
        scene.background = new THREE.Color('#030712')
        scene.fog = new THREE.FogExp2('#030712', 0.002)
      }}
    >
      <ambientLight intensity={0.3} />
      <pointLight position={[100, 100, 100]} intensity={1} />
      <GalaxyParticles />
      <GalaxyCore />
      <Nodes />
      <Edges />
      <OrbitControls enableDamping dampingFactor={0.05} />
      <CameraController />
    </Canvas>
  )
}
