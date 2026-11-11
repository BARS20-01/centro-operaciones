import { Float, Line, OrbitControls } from '@react-three/drei'
import { Canvas, useFrame } from '@react-three/fiber'
import { useMemo, useRef, type ReactNode } from 'react'
import type { Group } from 'three'

function Core() {
  const group = useRef<Group>(null)
  const core = useRef<Group>(null)
  const shell = useRef<Group>(null)
  const orbit = useRef<Group>(null)
  const points = useMemo(() => Array.from({ length: 28 }, (_, i): [number, number, number] => {
    const angle = i * 2.4
    const z = 1 - (i / 27) * 2
    const radius = Math.sqrt(1 - z * z) * 2
    return [Math.cos(angle) * radius, z * 2, Math.sin(angle) * radius]
  }), [])
  const stars = useMemo(() => new Float32Array(Array.from({ length: 240 }, (_, i) => {
    const n = Math.floor(i / 3)
    const angle = n * 2.4
    const z = 1 - n / 79 * 2
    const radius = 2.5 + (n % 5) * 0.18
    return i % 3 === 0 ? Math.cos(angle) * Math.sqrt(1 - z * z) * radius : i % 3 === 1 ? z * radius : Math.sin(angle) * Math.sqrt(1 - z * z) * radius
  })), [])
  useFrame((state, delta) => {
    if (group.current) group.current.rotation.y += Math.min(delta, 0.05) * 0.15
    if (core.current) core.current.scale.setScalar(1 + Math.sin(state.clock.elapsedTime * 1.2) * 0.025)
    if (shell.current) shell.current.rotation.z -= Math.min(delta, 0.05) * 0.12
    if (orbit.current) orbit.current.rotation.y -= Math.min(delta, 0.05) * 0.25
  })
  return (
    <Float speed={1} rotationIntensity={0.15} floatIntensity={0.35}>
      <group ref={group}>
        <group ref={core}><mesh>
          <icosahedronGeometry args={[1.05, 2]} />
          <meshStandardMaterial color="#241b5b" emissive="#6638be" emissiveIntensity={0.4} metalness={0.55} roughness={0.25} />
        </mesh></group>
        <mesh scale={1.04}>
          <icosahedronGeometry args={[1.05, 2]} />
          <meshBasicMaterial color="#6ee7f9" wireframe transparent opacity={0.35} />
        </mesh>
        <group ref={shell}><mesh scale={1.35}>
          <sphereGeometry args={[1.05, 16, 12]} />
          <meshBasicMaterial color="#526be8" wireframe transparent opacity={0.1} />
        </mesh>
        {[0, 1, 2].map((i) => <mesh key={i} rotation={[Math.PI / 2 + i * 0.55, i * 0.8, 0]}>
          <torusGeometry args={[1.75 + i * 0.13, 0.008, 6, 96]} />
          <meshBasicMaterial color={i === 1 ? '#a979ff' : '#50d7f0'} transparent opacity={0.48} />
        </mesh>)}</group>
        {points.map((point, index) => (
          <group key={index}>
            <mesh position={point}><sphereGeometry args={[0.035, 8, 8]} /><meshBasicMaterial color="#67e8f9" /></mesh>
            {index % 2 === 0 && <Line points={[point, points[(index + 7) % points.length]]} color="#6f6af5" transparent opacity={0.25} lineWidth={1} />}
          </group>
        ))}
        <group ref={orbit}>{[0, 1, 2, 3].map((i) => <mesh key={i} position={[Math.cos(i * Math.PI / 2) * 2.25, Math.sin(i * 2) * 0.6, Math.sin(i * Math.PI / 2) * 2.25]}>
          <octahedronGeometry args={[0.07]} /><meshBasicMaterial color={i === 0 ? '#ff8baf' : '#9feaff'} />
        </mesh>)}</group>
        <points><bufferGeometry><bufferAttribute attach="attributes-position" args={[stars, 3]} /></bufferGeometry><pointsMaterial color="#8dcfff" size={0.025} transparent opacity={0.7} sizeAttenuation /></points>
      </group>
    </Float>
  )
}

export default function ThreatCoreScene({ fallback }: { fallback: ReactNode }) {
  return (
    <Canvas fallback={fallback} dpr={[1, 1.4]} camera={{ position: [0, 0, 6], fov: 40 }} gl={{ antialias: false, powerPreference: 'low-power' }}>
      <ambientLight intensity={0.8} /><pointLight position={[3, 3, 4]} color="#67e8f9" intensity={30} />
      <Core />
      <OrbitControls enablePan={false} enableZoom={false} />
    </Canvas>
  )
}
