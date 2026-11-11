import assert from 'node:assert/strict'
import { test } from 'node:test'
import { emptyGraph, mergeDiscovery, type NodeInput } from '../src/domain/graph.js'
import { consistencyCheck, nodeSourceStatus, resolveDockerStatus, simulatedEventVisible, simulationAllowed, type SourceObservation } from '../src/features/diagnostics/sourceManager.js'
import { createDockerIntegration, type DockerTransport } from '../src/integrations/docker.integration.js'
import type { OpsEvent } from '../src/types/index.js'

const root: NodeInput = { id: 'docker', name: 'Docker', kind: 'docker', layer: 'infrastructure',
  status: 'ok', parentId: null, sourceSystem: 'docker', source: 'live' }
const container: NodeInput = { id: 'ctr-one', name: 'one', kind: 'container', layer: 'services',
  status: 'ok', parentId: 'docker', sourceSystem: 'docker', source: 'live' }
const observation: SourceObservation = { reading: { status: 'LIVE', count: 1, lastSync: '2026-11-11T00:00:00Z' },
  discovery: { nodes: [container] }, reason: null, revision: 1 }
const graph = mergeDiscovery(emptyGraph, { nodes: [root, container] }).graph
const simulated: OpsEvent = { id: '1', timestamp: 0, source: 'Docker', sourceSystem: 'docker',
  sourceMode: 'simulated', severity: 'info', category: 'infrastructure', message: 'test' }

test('environment policy fails closed for unknown and production', () => {
  assert.equal(simulationAllowed('LOCAL'), true)
  assert.equal(simulationAllowed('STAGING'), true)
  assert.equal(simulationAllowed('PRODUCTION'), false)
  assert.equal(simulationAllowed('UNKNOWN'), false)
})

test('Docker state reports divergence, mixed sources, fallback, and recovery', () => {
  assert.equal(resolveDockerStatus('LIVE', 'live', 1, 1).status, 'LIVE')
  assert.equal(resolveDockerStatus('LIVE', 'live', 2, 1).status, 'PARTIAL')
  assert.equal(resolveDockerStatus('LIVE', 'simulated', 1, 6).status, 'PARTIAL')
  assert.equal(resolveDockerStatus('OFFLINE', 'simulated', null, 6).status, 'PARTIAL')
  assert.equal(resolveDockerStatus('UNKNOWN', 'live', null, 1).status, 'PARTIAL')
  assert.equal(resolveDockerStatus('LIVE', undefined, 1, null).status, 'PARTIAL')
  assert.equal(resolveDockerStatus('OFFLINE', undefined, null, null).status, 'OFFLINE')
})

test('production Docker fails closed and staging fallback recovers', async (t) => {
  t.mock.method(console, 'warn', () => {})
  let live = false
  let fallbackCalls = 0
  const transport: DockerTransport = { async listContainers() {
    if (!live) throw new Error('offline')
    return []
  } }
  const fallback: DockerTransport = { async listContainers() { fallbackCalls++; return [] } }
  const production = createDockerIntegration({ transport, fallback, allowFallback: false })
  await assert.rejects(production.discover(), /offline/)
  assert.equal(fallbackCalls, 0)
  const staging = createDockerIntegration({ transport, fallback, allowFallback: true, retryAfterMs: 0 })
  await staging.discover()
  assert.equal(staging.source, 'simulated')
  assert.equal(fallbackCalls, 1)
  live = true
  await staging.discover()
  assert.equal(staging.source, 'live')
})

test('consistency check detects mixed, missing, stale and changed inventory', () => {
  assert.equal(consistencyCheck(observation, graph, 'Docker').reading.status, 'LIVE')
  const mixed = mergeDiscovery(graph, { nodes: [{ ...container, source: 'simulated' }] }).graph
  assert.match(consistencyCheck(observation, mixed, 'Docker').reason ?? '', /mezcla/)
  assert.equal(consistencyCheck(observation, mixed, 'Docker').reading.status, 'PARTIAL')
  const missing = mergeDiscovery(emptyGraph, { nodes: [root] }).graph
  assert.equal(consistencyCheck(observation, missing, 'Docker').reading.status, 'PARTIAL')
  const stale = mergeDiscovery(graph, { nodes: [{ ...container, stale: true }] }).graph
  assert.equal(consistencyCheck(observation, stale, 'Docker').reading.status, 'PARTIAL')
  const changed = mergeDiscovery(graph, { nodes: [{ ...container, status: 'warn' }] }).graph
  assert.equal(consistencyCheck(observation, changed, 'Docker').reading.status, 'PARTIAL')
  const withDependency: SourceObservation = { ...observation, discovery: { nodes: [container], dependencies: [{ from: 'ctr-one', to: 'docker' }] } }
  assert.equal(consistencyCheck(withDependency, graph, 'Docker').reading.status, 'PARTIAL')
  const extra = mergeDiscovery(graph, { nodes: [{ ...container, id: 'ctr-two' }] }).graph
  assert.equal(consistencyCheck(observation, extra, 'Docker').reading.status, 'PARTIAL')
  assert.equal(consistencyCheck({ ...observation, discovery: null }, graph, 'Docker').reason, 'No hay inventario LIVE actual para comparar.')
  assert.equal(consistencyCheck({ ...observation, discovery: null }, graph, 'Docker').reading.status, 'PARTIAL')
})

test('simulated integration events are suppressed while unrelated simulation and live events remain', () => {
  assert.equal(simulatedEventVisible(simulated), false)
  assert.equal(simulatedEventVisible({ ...simulated, sourceSystem: undefined, source: 'SGS' }), true)
  assert.equal(simulatedEventVisible({ ...simulated, sourceMode: 'live' }), true)
})

test('nodes use the integration status, independent of the resource health and provenance', () => {
  const readings = { Docker: observation.reading, Coolify: observation.reading, Proxmox: observation.reading }
  assert.equal(nodeSourceStatus({ ...graph.nodes['ctr-one'], status: 'offline' }, readings), 'LIVE')
  assert.equal(nodeSourceStatus({ ...graph.nodes['ctr-one'], source: 'simulated' },
    { ...readings, Docker: { ...observation.reading, status: 'PARTIAL' } }), 'PARTIAL')
  assert.equal(nodeSourceStatus({ ...graph.nodes['ctr-one'], stale: true },
    { ...readings, Docker: { ...observation.reading, status: 'UNKNOWN' } }), 'UNKNOWN')
  assert.equal(nodeSourceStatus({ ...graph.nodes['ctr-one'], sourceSystem: undefined, source: 'simulated' }, readings), 'SIMULATED')
})

test('fallback without live nodes explains simulation instead of reporting a mix', () => {
  const fallback: SourceObservation = {
    reading: { ...observation.reading, status: 'PARTIAL' },
    discovery: { nodes: [{ ...container, source: 'simulated' }] },
    reason: 'Docker LIVE no disponible; inventario SIMULATED de respaldo.', revision: 1, mode: 'simulated',
  }
  assert.equal(consistencyCheck(fallback, graph, 'Docker').reason, fallback.reason)
})
