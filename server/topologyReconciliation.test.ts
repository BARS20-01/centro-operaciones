import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { applyNodeChanges, type Node } from '@xyflow/react'
import { reconcileNodes } from '../src/features/topology/reconcileNodes'

test('discovery and metric updates preserve React Flow measurements for existing nodes', () => {
  const original: Node[] = [
    { id: 'host', position: { x: 0, y: 0 }, data: { status: 'ok' } },
    { id: 'guest', position: { x: 0, y: 100 }, data: {} },
  ]
  const measured = applyNodeChanges([
    { id: 'host', type: 'dimensions', dimensions: { width: 176, height: 48 } },
    { id: 'guest', type: 'dimensions', dimensions: { width: 176, height: 48 } },
  ], original)
  const updated: Node[] = [
    { id: 'host', position: { x: 10, y: 0 }, data: { status: 'warn' } },
    { id: 'guest', position: { x: 10, y: 100 }, data: {} },
  ]
  const result = reconcileNodes(updated, measured)
  assert.deepEqual(result.map((node) => node.measured), [{ width: 176, height: 48 }, { width: 176, height: 48 }])
  assert.deepEqual(result[0].position, { x: 10, y: 0 })
  assert.equal(result[0].data.status, 'warn')
  assert.equal(updated[0].measured, undefined)
})

test('reconciliation removes absent nodes and does not transfer measurements to new nodes', () => {
  const current: Node[] = [{ id: 'old', position: { x: 0, y: 0 }, data: {}, measured: { width: 176, height: 48 } }]
  const next: Node[] = [{ id: 'new', position: { x: 0, y: 0 }, data: {} }]
  assert.deepEqual(reconcileNodes(next, current), next)
})
