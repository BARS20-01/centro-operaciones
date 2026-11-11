import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { classifySource, matchesSource } from '../src/domain/sourceClassification.js'
import { emptyGraph, mergeDiscovery, type NodeInput } from '../src/domain/graph.js'
import { buildView } from '../src/features/topology/view.js'
import { computeOperationsLayout, NODE_SIZE } from '../src/features/topology/layout.js'

const nodes: NodeInput[] = [
  { id: 'proxmox', name: 'Proxmox', kind: 'proxmox', layer: 'infrastructure', parentId: null, status: 'ok', source: 'simulated' },
  { id: 'vps-web', name: 'Core', kind: 'vps', layer: 'infrastructure', parentId: 'proxmox', status: 'ok', source: 'simulated' },
  { id: 'docker', name: 'Docker', kind: 'docker', layer: 'infrastructure', parentId: 'vps-web', status: 'ok', source: 'live' },
  { id: 'app', name: 'App', kind: 'generic', layer: 'applications', parentId: 'docker', status: 'offline', source: 'live' },
  { id: 'unknown', name: 'Unknown', kind: 'generic', layer: 'services', parentId: 'vps-web', status: 'ok' },
]

test('classification separates simulated, live, offline and unknown', () => {
  assert.equal(classifySource({ source: 'live', status: 'ok' }), 'LIVE')
  assert.equal(classifySource({ source: 'live', status: 'offline' }), 'OFFLINE')
  assert.equal(classifySource({ source: 'live', status: 'ok', stale: true }), 'OFFLINE')
  assert.equal(classifySource({ source: 'simulated', status: 'offline', stale: true }), 'SIMULATED')
  assert.equal(classifySource({ status: 'ok' }), 'UNKNOWN')
  assert.equal(matchesSource({ source: 'live' }, 'live'), true)
  assert.equal(matchesSource({}, 'simulated'), false)
  assert.equal(matchesSource({}, 'all'), true)
})

test('source filters contract hidden hosts and include offline live nodes without pinning simulated core', () => {
  const graph = mergeDiscovery(emptyGraph, { nodes }).graph
  const layers = new Set(['infrastructure', 'services', 'applications', 'labs'] as const)
  const live = buildView(graph.topology, new Set(), layers, (id) => matchesSource(graph.nodes[id], 'live'))
  assert.deepEqual(live.order, ['docker', 'app'])
  assert.deepEqual(live.roots, ['docker'])
  assert.equal(live.parent.get('app'), 'docker')
  const layout = computeOperationsLayout(live, new Map(), () => NODE_SIZE)
  assert.deepEqual([...layout.boxes.keys()], ['app', 'docker'])
  const simulated = buildView(graph.topology, new Set(), layers, (id) => matchesSource(graph.nodes[id], 'simulated'))
  assert.deepEqual(simulated.order, ['proxmox', 'vps-web'])
  const all = buildView(graph.topology, new Set(), layers)
  assert.equal(all.order.length, nodes.length)
})

test('a live update replaces an explicitly shared seed identity without losing its children', () => {
  const graph = mergeDiscovery(emptyGraph, { nodes }).graph
  const liveHost: NodeInput = { ...nodes[0], source: 'live', sourceSystem: 'proxmox', origin: 'discovered' }
  const merged = mergeDiscovery(graph, { nodes: [liveHost] }).graph
  assert.equal(merged.nodes.proxmox.source, 'live')
  assert.equal(merged.nodes['vps-web'].parentId, 'proxmox')
  assert.equal(Object.values(merged.nodes).filter((node) => node.id === 'proxmox').length, 1)
  assert.equal(mergeDiscovery(merged, { nodes: [liveHost] }).graph, merged)
})
