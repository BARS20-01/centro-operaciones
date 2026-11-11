import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { isWorkspaceId, WORKSPACES } from '../src/workspaces/workspace'
import { incidents, threatEvents, topology, topologyEdges } from '../src/workspaces/shared/mock'
import { forceLayout } from '../src/workspaces/digital-twin/forceLayout'
import { knowledgeLabels, relatedEntities } from '../src/workspaces/ai/knowledge'

test('workspace registry provides a distinct default and rejects unknown values', () => {
  assert.equal(WORKSPACES[0].id, 'operations')
  assert.equal(new Set(WORKSPACES.map(({ id }) => id)).size, 6)
  for (const workspace of WORKSPACES) assert.equal(isWorkspaceId(workspace.id), true)
  assert.equal(isWorkspaceId('invalid'), false)
  assert.equal(isWorkspaceId(null), false)
})

test('force layout is deterministic, bounded and rejects broken edges', () => {
  const first = forceLayout(topology, topologyEdges)
  assert.deepEqual(first, forceLayout(topology, topologyEdges))
  assert.equal(first.length, topology.length)
  assert.ok(first.every(({ x, y }) => Number.isFinite(x) && Number.isFinite(y) && x >= 75 && x <= 725 && y >= 55 && y <= 365))
  assert.throws(() => forceLayout(topology, [['pve', 'missing']]), /Unknown topology edge/)
})

test('knowledge relationships are simulated and reference known entities', () => {
  for (const entity of knowledgeLabels) {
    assert.ok(relatedEntities(entity).length > 0)
    assert.ok(relatedEntities(entity).every((related) => knowledgeLabels.includes(related)))
  }
})

test('mock topology edges point to known entities and sample events are complete', () => {
  const ids = new Set<string>(topology.map(({ id }) => id))
  for (const [from, to] of topologyEdges) {
    assert.ok(ids.has(from))
    assert.ok(ids.has(to))
  }
  assert.ok(threatEvents.every(({ severity, time, source, status, event }) => severity && time && source && status && event))
  assert.equal(new Set(incidents.map(({ id }) => id)).size, incidents.length)
})
