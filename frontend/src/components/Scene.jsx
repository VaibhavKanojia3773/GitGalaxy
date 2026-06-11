import { useRef, useMemo, useEffect } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { EffectComposer, Bloom } from '@react-three/postprocessing'
import * as THREE from 'three'
import useStore from '../store'
import Nodes from './Nodes'
import Edges from './Edges'

// ── Camera fly controller ─────────────────────────────────────────────────────
// Lerps both camera position AND the OrbitControls target so the view turns to
// face the destination node. A manual drag cancels the flight.
function CameraController() {
  const { camera, controls } = useThree()
  const cameraTarget = useStore((s) => s.cameraTarget)

  const seenRef    = useRef(null)
  const flyingRef  = useRef(false)
  const desiredPos = useRef(new THREE.Vector3())
  const desiredLook = useRef(new THREE.Vector3())
  const hasLookRef = useRef(false)

  if (cameraTarget && cameraTarget !== seenRef.current) {
    seenRef.current = cameraTarget
    flyingRef.current = true
    desiredPos.current.set(cameraTarget.x, cameraTarget.y, cameraTarget.z)
    hasLookRef.current = !!cameraTarget.lookAt
    if (cameraTarget.lookAt) {
      desiredLook.current.set(cameraTarget.lookAt.x, cameraTarget.lookAt.y, cameraTarget.lookAt.z)
    }
  }

  useEffect(() => {
    if (!controls) return
    const onUserDrag = () => { flyingRef.current = false }
    controls.addEventListener('start', onUserDrag)
    return () => controls.removeEventListener('start', onUserDrag)
  }, [controls])

  useFrame(() => {
    if (!flyingRef.current) return
    camera.position.lerp(desiredPos.current, 0.06)
    if (controls && hasLookRef.current) {
      controls.target.lerp(desiredLook.current, 0.08)
      controls.update()
    }
    if (camera.position.distanceTo(desiredPos.current) < 0.15) flyingRef.current = false
  })
  return null
}

// ── Galaxy spiral particle disc with twinkling ───────────────────────────────
function GalaxyParticles({ count = 12000 }) {
  const meshRef   = useRef()
  const alphaRef  = useRef(null)

  const { geo, alphas } = useMemo(() => {
    const positions = new Float32Array(count * 3)
    const colors    = new Float32Array(count * 3)
    const alphas    = new Float32Array(count)          // per-particle twinkle phase
    const color     = new THREE.Color()

    for (let i = 0; i < count; i++) {
      const arm       = Math.floor(Math.random() * 3)
      const angle     = (arm / 3) * Math.PI * 2 + Math.random() * 0.9
      const radius    = Math.pow(Math.random(), 0.45) * 200 + 3
      const spinAngle = radius * 0.27
      const spread    = (1 / radius) * 14

      positions[i * 3]     = Math.cos(angle + spinAngle) * radius + (Math.random() - 0.5) * spread
      positions[i * 3 + 1] = (Math.random() - 0.5) * 8
      positions[i * 3 + 2] = Math.sin(angle + spinAngle) * radius + (Math.random() - 0.5) * spread

      const t = radius / 200
      color.setHSL(0.67 - t * 0.12, 0.7, 0.45 + (1 - t) * 0.4)
      color.toArray(colors, i * 3)

      alphas[i] = Math.random() * Math.PI * 2   // random phase offset for twinkling
    }

    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    g.setAttribute('color',    new THREE.Float32BufferAttribute(colors, 3))
    // opacity handled via pointsMaterial — we'll modulate size instead
    return { geo: g, alphas }
  }, [count])

  alphaRef.current = alphas

  useFrame(({ clock }, delta) => {
    if (!meshRef.current) return
    meshRef.current.rotation.y += delta * 0.016
  })

  return (
    <points ref={meshRef} geometry={geo}>
      <pointsMaterial
        size={0.28}
        vertexColors
        transparent
        opacity={0.65}
        sizeAttenuation
        depthWrite={false}
      />
    </points>
  )
}

// ── Galaxy core — layered glow ────────────────────────────────────────────────
function GalaxyCore() {
  const coreRef = useRef()
  const haloRef = useRef()

  useFrame(({ clock }) => {
    const t = clock.elapsedTime
    if (coreRef.current) {
      const s = 1 + Math.sin(t * 0.7) * 0.06
      coreRef.current.scale.setScalar(s)
    }
    if (haloRef.current) {
      haloRef.current.material.opacity = 0.04 + Math.sin(t * 0.4) * 0.015
    }
  })

  return (
    <group>
      {/* inner bright core */}
      <mesh ref={coreRef}>
        <sphereGeometry args={[5, 16, 16]} />
        <meshBasicMaterial
          color="#e8d5ff"
          transparent
          opacity={0.35}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>
      {/* wide outer halo */}
      <mesh ref={haloRef}>
        <sphereGeometry args={[28, 16, 16]} />
        <meshBasicMaterial
          color="#7c3aed"
          transparent
          opacity={0.04}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>
      {/* bright point at center */}
      <mesh>
        <sphereGeometry args={[1.2, 8, 8]} />
        <meshBasicMaterial
          color="#ffffff"
          transparent
          opacity={0.9}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>
    </group>
  )
}

// ── Nebula colour wash ────────────────────────────────────────────────────────
function Nebula() {
  const meshes = useMemo(() => {
    return [
      { pos: [60, 10, -80],  color: '#1e1b4b', scale: 120, opacity: 0.18 },
      { pos: [-90, -5, 40],  color: '#0f172a', scale: 100, opacity: 0.20 },
      { pos: [20, 30, 100],  color: '#312e81', scale: 90,  opacity: 0.14 },
      { pos: [-50, 15, -60], color: '#1e3a5f', scale: 80,  opacity: 0.16 },
    ]
  }, [])

  return (
    <group>
      {meshes.map((m, i) => (
        <mesh key={i} position={m.pos}>
          <sphereGeometry args={[m.scale, 8, 8]} />
          <meshBasicMaterial
            color={m.color}
            transparent
            opacity={m.opacity}
            depthWrite={false}
            side={THREE.BackSide}
            blending={THREE.AdditiveBlending}
          />
        </mesh>
      ))}
    </group>
  )
}

// ── Scene root ────────────────────────────────────────────────────────────────
export default function Scene() {
  const clearSelection  = useStore((s) => s.clearSelection)
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
      gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.1 }}
      onPointerMissed={clearSelection}
      onCreated={({ scene }) => {
        scene.background = new THREE.Color('#020617')
        scene.fog = new THREE.FogExp2('#020617', 0.0015)
      }}
    >
      <ambientLight intensity={0.25} />
      <pointLight position={[0, 0, 0]}   intensity={3.5} color="#c4b5fd" distance={300} decay={1.5} />
      <pointLight position={[80, 40, 0]} intensity={0.8} color="#38bdf8" distance={200} decay={2} />

      <Nebula />
      <GalaxyParticles />
      <GalaxyCore />
      <Nodes />
      <Edges />

      <OrbitControls makeDefault enableDamping dampingFactor={0.05} />
      <CameraController />

      <EffectComposer>
        <Bloom
          intensity={1.4}
          luminanceThreshold={0.1}
          luminanceSmoothing={0.85}
          mipmapBlur
        />
      </EffectComposer>
    </Canvas>
  )
}
