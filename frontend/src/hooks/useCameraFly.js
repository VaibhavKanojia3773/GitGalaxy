import { useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import useStore from '../store'

export function useCameraFly() {
  const { camera } = useThree()
  const cameraTarget = useStore((s) => s.cameraTarget)
  const targetRef = useRef(null)

  // Update targetRef when store target changes
  if (cameraTarget !== targetRef.current) {
    targetRef.current = cameraTarget
  }

  useFrame(() => {
    if (!targetRef.current) return
    const { x, y, z } = targetRef.current
    camera.position.x += (x - camera.position.x) * 0.05
    camera.position.y += (y - camera.position.y) * 0.05
    camera.position.z += (z - camera.position.z) * 0.05
  })
}
