import { Float, Line } from '@react-three/drei'
import { Canvas, useFrame } from '@react-three/fiber'
import { useRef, type ReactNode } from 'react'
import type { Group } from 'three'
import { knowledgeEdges, knowledgeLabels, type KnowledgeEntity } from './knowledge'

const points: [number, number, number][] = [
  [0, 0, 0], [-1.6, 0.9, 0.5], [1.5, 1, -0.5], [-1.8, -0.8, -0.5],
  [1.7, -0.8, 0.4], [0, 1.7, -0.4], [0.2, -1.6, 0.7],
]
function Graph({ selected }: { selected: KnowledgeEntity }) {
  const group = useRef<Group>(null)
  useFrame((_state, delta) => { if (group.current) group.current.rotation.y += Math.min(delta, 0.05) * 0.12 })
  return <Float speed={0.8} rotationIntensity={0.05} floatIntensity={0.2}>
    <group ref={group}>
      {knowledgeEdges.map(([a, b]) => <Line key={`${a}-${b}`} points={[points[a], points[b]]} color={knowledgeLabels[a] === selected || knowledgeLabels[b] === selected ? '#d2bdff' : '#655989'} transparent opacity={0.7} />)}
      {points.map((position, i) => <group key={knowledgeLabels[i]} position={position}>
        <mesh><icosahedronGeometry args={[knowledgeLabels[i] === selected ? 0.27 : 0.16, 1]} />
          <meshStandardMaterial color={knowledgeLabels[i] === selected ? '#ddc8ff' : '#58d8da'} emissive={knowledgeLabels[i] === selected ? '#6d42cf' : '#148c9a'} emissiveIntensity={0.7} />
        </mesh>
        {[0, 1, 2].map((j) => <mesh key={j} position={[Math.cos(j * 2.1) * 0.38, Math.sin(j * 2.1) * 0.38, 0.15]}>
          <sphereGeometry args={[0.035, 6, 6]} /><meshBasicMaterial color="#bba9ff" />
        </mesh>)}
      </group>)}
    </group>
  </Float>
}

export default function KnowledgeGraphScene({ fallback, selected }: { fallback: ReactNode; selected: KnowledgeEntity }) {
  return <Canvas fallback={fallback} dpr={[1, 1.4]} camera={{ position: [0, 0, 6], fov: 42 }} gl={{ antialias: false, powerPreference: 'low-power' }}>
    <ambientLight intensity={1.2} /><pointLight position={[3, 3, 4]} intensity={20} /><Graph selected={selected} />
  </Canvas>
}
