import assert from 'node:assert/strict'
import { once } from 'node:events'
import { test } from 'node:test'
import { createApp } from './app.js'
import { createProxmoxTransport, createSimulatedProxmoxTransport } from './proxmox.js'
import { proxmoxNodes } from '../src/integrations/proxmox.integration.js'
import { emptyGraph, mergeDiscovery } from '../src/domain/graph.js'
import { rootCauses } from '../src/domain/health.js'

const token = 'nexus@pve!reader=fixture-secret'
const entries = [
  { type: 'node', node: 'proxmox', status: 'online', cpu: 0.1, mem: 20, maxmem: 100, uptime: 1000 },
  { type: 'qemu', node: 'proxmox', vmid: 200, name: 'VPS-WEB', status: 'running', cpu: 0.3, mem: 30, maxmem: 100, disk: 40, maxdisk: 100, uptime: 200 },
  { type: 'qemu', node: 'proxmox', vmid: 100, name: 'GLPI', status: 'stopped' },
  { type: 'lxc', node: 'proxmox', vmid: 300, name: 'container', status: 'running' },
  { type: 'storage', node: 'proxmox', storage: 'local', status: 'available', disk: 95, maxdisk: 100 },
]

function fixture(failSnapshots = false): typeof fetch {
  return async (input, init) => {
    assert.equal(new Headers(init?.headers).get('authorization'), `PVEAPIToken=${token}`)
    assert.equal(init?.redirect, 'error')
    const url = new URL(String(input))
    if (url.pathname === '/api2/json/cluster/resources') return Response.json({ data: entries })
    if (url.pathname.endsWith('/snapshot')) {
      if (failSnapshots) return new Response(null, { status: 403 })
      return Response.json({ data: [{ name: 'current' }, { name: 'before-update', snaptime: 123, description: token }] })
    }
    if (url.pathname.endsWith('/content') && url.searchParams.get('content') === 'backup') {
      return Response.json({ data: [{ vmid: 200, size: 100, ctime: 123, volid: token }] })
    }
    return new Response(null, { status: 404 })
  }
}

test('Proxmox transport normalizes resources, snapshots and backups without secrets', async () => {
  const snapshot = await createProxmoxTransport('https://pve.example.test:8006', token, fixture()).discover()
  assert.equal(snapshot.source, 'live')
  assert.equal(snapshot.resources.length, 5)
  assert.equal(snapshot.snapshots.length, 3)
  assert.equal(snapshot.backups.length, 1)
  assert.equal(snapshot.snapshotErrors, 0)
  assert.equal(snapshot.backupErrors, 0)
  assert.ok(!JSON.stringify(snapshot).includes(token))
})

test('Proxmox partial inventories remain explicitly incomplete', async () => {
  const snapshot = await createProxmoxTransport('https://pve.example.test', token, fixture(true)).discover()
  assert.equal(snapshot.snapshots.length, 0)
  assert.equal(snapshot.snapshotErrors, 3)
  assert.equal(snapshot.backups.length, 1)
})

test('unavailable storage is reported as an incomplete backup inventory', async () => {
  const request: typeof fetch = async (input, init) => {
    if (new URL(String(input)).pathname.endsWith('/cluster/resources')) {
      return Response.json({ data: [{ ...entries[0] }, { ...entries[4], status: 'unavailable' }] })
    }
    return fixture()(input, init)
  }
  const snapshot = await createProxmoxTransport('https://pve.example.test', token, request).discover()
  assert.equal(snapshot.backupErrors, 1)
  assert.equal(snapshot.backups.length, 0)
})

test('Proxmox fails closed for invalid configuration and malformed inventory', async () => {
  assert.throws(() => createProxmoxTransport('http://pve.example.test', token), /INVALID_CONFIGURATION/)
  assert.throws(() => createProxmoxTransport('https://pve.example.test', 'invalid'), /INVALID_CONFIGURATION/)
  const invalid: typeof fetch = async () => Response.json({ data: {} })
  await assert.rejects(createProxmoxTransport('https://pve.example.test', token, invalid).discover(), /INVALID_RESPONSE/)
})

test('VM 200 connects the existing core to the real host and root cause propagates', async () => {
  const snapshot = await createProxmoxTransport('https://pve.example.test', token, fixture()).discover()
  const nodes = proxmoxNodes(snapshot)
  const core = nodes.find((node) => node.id === 'vps-web')
  assert.equal(core?.parentId, 'proxmox-node/proxmox')
  assert.equal(snapshot.resources.find((resource) => resource.vmid === 100)?.status, 'stopped')
  assert.equal(nodes.find((node) => node.category === 'Proxmox QEMU 100'), undefined)
  assert.equal(nodes.find((node) => node.category === 'Proxmox storage')?.status, 'critical')
  assert.equal(nodes.find((node) => node.category === 'Proxmox storage')?.diskPercent, 95)
  const node = nodes.find((value) => value.id === 'proxmox-node/proxmox')
  assert.ok(node)
  node.status = 'offline'
  const report = mergeDiscovery(emptyGraph, { nodes: [...nodes,
    { id: 'docker', name: 'Docker', kind: 'docker', layer: 'infrastructure', parentId: 'vps-web', status: 'ok' },
    { id: 'coolify', name: 'Coolify', kind: 'coolify', layer: 'services', parentId: 'vps-web', status: 'ok' },
  ], dependencies: [{ from: 'coolify', to: 'docker' }] })
  assert.equal(report.rejected.length, 0)
  assert.ok(rootCauses(report.graph, 'coolify').some((cause) => cause.id === node.id))
})

test('core is not linked to VM 200 on an unconfirmed node; active VM 100 is visible', async () => {
  const snapshot = await createProxmoxTransport('https://pve.example.test', token, fixture()).discover()
  const modified = {
    ...snapshot,
    resources: snapshot.resources.map((item) => item.vmid === 200 ? { ...item, node: 'other' } :
      item.vmid === 100 ? { ...item, status: 'running' } : item),
  }
  const nodes = proxmoxNodes(modified)
  assert.equal(nodes.some((node) => node.id === 'vps-web'), false)
  assert.equal(nodes.find((node) => node.category === 'Proxmox QEMU 100')?.status, 'ok')
})

test('Proxmox API shares concurrent requests and sanitizes errors', async () => {
  let count = 0
  const snapshot = await createProxmoxTransport('https://pve.example.test', token, fixture()).discover()
  const app = createApp(undefined, undefined, {
    async discover() { count++; return snapshot },
    async health() { return { source: 'live', checkedAt: snapshot.checkedAt } },
  })
  const server = app.listen(0, '127.0.0.1')
  await once(server, 'listening')
  try {
    const address = server.address()
    assert.ok(address && typeof address !== 'string')
    const responses = await Promise.all([fetch(`http://127.0.0.1:${address.port}/api/proxmox/discovery`), fetch(`http://127.0.0.1:${address.port}/api/proxmox/discovery`)])
    assert.equal(count, 1)
    for (const response of responses) {
      assert.equal(response.status, 200)
      assert.ok(!(await response.text()).includes(token))
    }
    const health = await fetch(`http://127.0.0.1:${address.port}/api/proxmox/health`)
    assert.deepEqual(await health.json(), { status: 'OK', source: 'live', checkedAt: snapshot.checkedAt })
  } finally { server.close(); await once(server, 'close') }
  const failure = createApp(undefined, undefined, {
    async discover() { throw new Error(token) },
    async health() { throw new Error(token) },
  }).listen(0, '127.0.0.1')
  await once(failure, 'listening')
  try {
    const address = failure.address()
    assert.ok(address && typeof address !== 'string')
    const response = await fetch(`http://127.0.0.1:${address.port}/api/proxmox/discovery`)
    assert.equal(response.status, 503)
    assert.ok(!(await response.text()).includes(token))
    const health = await fetch(`http://127.0.0.1:${address.port}/api/proxmox/health`)
    assert.equal(health.status, 503)
    assert.ok(!(await health.text()).includes(token))
  } finally { failure.close(); await once(failure, 'close') }
})

test('health checks upstream independently and simulation cannot be mistaken for live data', async () => {
  const transport = createProxmoxTransport('https://pve.example.test', token, fixture())
  assert.equal((await transport.health()).source, 'live')
  const simulated = createSimulatedProxmoxTransport()
  assert.equal((await simulated.health()).source, 'simulated')
  const snapshot = await simulated.discover()
  assert.equal(snapshot.source, 'simulated')
  assert.deepEqual(snapshot.resources, [])
  assert.deepEqual(proxmoxNodes(snapshot), [])
})

test('simulated mode is explicit at the API boundary and does not expose live inventory', async () => {
  const previous = process.env.PROXMOX_MODE
  process.env.PROXMOX_MODE = 'simulated'
  const app = createApp()
  if (previous === undefined) delete process.env.PROXMOX_MODE
  else process.env.PROXMOX_MODE = previous
  const server = app.listen(0, '127.0.0.1')
  await once(server, 'listening')
  try {
    const address = server.address()
    assert.ok(address && typeof address !== 'string')
    const health = await fetch(`http://127.0.0.1:${address.port}/api/proxmox/health`)
    const discovery = await fetch(`http://127.0.0.1:${address.port}/api/proxmox/discovery`)
    assert.equal((await health.json()).source, 'simulated')
    const payload = await discovery.json()
    assert.equal(payload.source, 'simulated')
    assert.deepEqual(payload.resources, [])
  } finally { server.close(); await once(server, 'close') }
})

test('diagnostic logs include phases and failures without token or payload values', async () => {
  const traces: string[] = []
  await createProxmoxTransport('https://pve.example.test', token, fixture(), {
    diagnosticLogs: true, logger: (message) => traces.push(message),
  }).discover()
  for (const phase of ['Proxmox request:', 'Proxmox response:', 'Proxmox parse:', 'Proxmox discovery:']) {
    assert.ok(traces.some((line) => line.startsWith(phase)))
  }
  assert.ok(traces.some((line) => line.includes('result=SUCCESS')))
  assert.ok(traces.every((line) => !line.includes(token) && !line.includes('VPS-WEB') && !line.includes('before-update')))
  const failures: string[] = []
  const bad: typeof fetch = async () => new Response(token, { status: 403 })
  await assert.rejects(createProxmoxTransport('https://pve.example.test', token, bad, {
    logger: (message) => failures.push(message),
  }).discover(), /UPSTREAM_HTTP/)
  assert.ok(failures.some((line) => line.includes('status=403')))
  assert.ok(failures.some((line) => line.includes('result=UPSTREAM_HTTP')))
  assert.ok(failures.every((line) => !line.includes(token)))
})
