import { useRef, useMemo, useEffect } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { OrbitControls, Trail } from '@react-three/drei'
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

// ── Star field — two depth shells of point stars, no galaxy disc ──────────────
function StarField() {
  const nearRef = useRef()

  const { nearGeo, farGeo } = useMemo(() => {
    const color = new THREE.Color()

    function makeShell(count, rMin, rMax, warmRatio) {
      const positions = new Float32Array(count * 3)
      const colors    = new Float32Array(count * 3)
      for (let i = 0; i < count; i++) {
        // uniform direction on a sphere, random radius within shell
        const u = Math.random() * 2 - 1
        const theta = Math.random() * Math.PI * 2
        const s = Math.sqrt(1 - u * u)
        const r = rMin + Math.random() * (rMax - rMin)
        positions[i * 3]     = s * Math.cos(theta) * r
        positions[i * 3 + 1] = u * r
        positions[i * 3 + 2] = s * Math.sin(theta) * r

        const roll = Math.random()
        if (roll < warmRatio)      color.setHSL(0.08, 0.55, 0.78)  // warm orange-white
        else if (roll < warmRatio + 0.18) color.setHSL(0.6, 0.45, 0.82) // blue-white
        else                       color.setHSL(0.0, 0.0, 0.72 + Math.random() * 0.28) // white
        color.toArray(colors, i * 3)
      }
      const g = new THREE.BufferGeometry()
      g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
      g.setAttribute('color',    new THREE.Float32BufferAttribute(colors, 3))
      return g
    }

    return {
      nearGeo: makeShell(2600, 160, 420, 0.1),
      farGeo:  makeShell(4500, 420, 900, 0.06),
    }
  }, [])

  useFrame((_, delta) => {
    if (nearRef.current) nearRef.current.rotation.y += delta * 0.004
  })

  return (
    <group>
      <points ref={nearRef} geometry={nearGeo}>
        <pointsMaterial size={0.9} vertexColors transparent opacity={0.9} sizeAttenuation depthWrite={false} />
      </points>
      <points geometry={farGeo}>
        <pointsMaterial size={0.55} vertexColors transparent opacity={0.55} sizeAttenuation depthWrite={false} />
      </points>
    </group>
  )
}

// ── Shooting stars — a meteor streaks across the sky every ~15–25 s ──────────
function ShootingStars() {
  const headRef  = useRef()
  const stateRef = useRef({
    active: false,
    t: 0,
    duration: 1.3,
    nextIn: 4 + Math.random() * 6, // first one arrives quickly
    from: new THREE.Vector3(),
    velo: new THREE.Vector3(),
  })

  useFrame((_, delta) => {
    const st = stateRef.current
    const head = headRef.current
    if (!head) return

    if (!st.active) {
      st.nextIn -= delta
      if (st.nextIn <= 0) {
        // spawn: random point high on the sky shell, streak mostly sideways/down
        const theta = Math.random() * Math.PI * 2
        const y = 60 + Math.random() * 90
        const r = 220 + Math.random() * 80
        st.from.set(Math.cos(theta) * r, y, Math.sin(theta) * r)
        st.velo.set(
          (Math.random() - 0.5) * 2,
          -(0.35 + Math.random() * 0.4),
          (Math.random() - 0.5) * 2,
        ).normalize().multiplyScalar(170 + Math.random() * 70)
        st.t = 0
        st.duration = 1.1 + Math.random() * 0.5
        st.active = true
        head.position.copy(st.from)
      }
      return
    }

    st.t += delta
    if (st.t >= st.duration) {
      st.active = false
      st.nextIn = 14 + Math.random() * 10 // ~15–25 s between meteors
      head.scale.setScalar(0.001)
      return
    }
    head.position.copy(st.from).addScaledVector(st.velo, st.t)
    // fade in fast, fade out at the end
    const k = Math.min(st.t * 6, 1) * (1 - Math.pow(st.t / st.duration, 3))
    head.scale.setScalar(Math.max(k, 0.001))
  })

  return (
    <Trail width={2.4} length={7} color="#cdddff" attenuation={(t) => t * t} decay={1.2}>
      <mesh ref={headRef} scale={0.001}>
        <sphereGeometry args={[0.5, 8, 8]} />
        <meshBasicMaterial color="#ffffff" transparent opacity={0.95} depthWrite={false} blending={THREE.AdditiveBlending} />
      </mesh>
    </Trail>
  )
}

// ── Scene root ────────────────────────────────────────────────────────────────
export default function Scene() {
  const clearSelection  = useStore((s) => s.clearSelection)
  const setExpandedFile = useStore((s) => s.setExpandedFile)
  const repoStatus      = useStore((s) => s.repoStatus)

  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') setExpandedFile(null) }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [setExpandedFile])

  return (
    <Canvas
      camera={{ position: [0, 18, 85], fov: 58 }}
      style={{ width: '100vw', height: '100vh' }}
      gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.05 }}
      onPointerMissed={clearSelection}
      onCreated={({ scene }) => {
        scene.background = new THREE.Color('#02040c')
        scene.fog = new THREE.FogExp2('#02040c', 0.0009)
      }}
    >
      {/* distant warm "sun" light — no visible body */}
      <ambientLight intensity={0.3} />
      <directionalLight position={[120, 160, 100]} intensity={1.2} color="#fff4e0" />

      <StarField />
      <ShootingStars />
      <Nodes />
      <Edges />

      <OrbitControls
        makeDefault
        enableDamping
        dampingFactor={0.05}
        autoRotate={repoStatus !== 'ready'}
        autoRotateSpeed={0.4}
      />
      <CameraController />

      <EffectComposer>
        <Bloom
          intensity={1.1}
          luminanceThreshold={0.12}
          luminanceSmoothing={0.85}
          mipmapBlur
        />
      </EffectComposer>
    </Canvas>
  )
}
