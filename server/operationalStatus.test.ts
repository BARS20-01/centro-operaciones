import assert from 'node:assert/strict'
import { test } from 'node:test'
import { checkOperationalSource, dockerStatus, operationalEnvironment, proxmoxStatus, summarizeOperationalStatus } from '../src/features/diagnostics/operationalStatus.js'

const sync = '2026-11-11T15:30:00.000Z'

test('Docker status distinguishes full, partial and unavailable diagnostics', () => {
  assert.equal(dockerStatus({ dockerVersion: '29', containersFound: 0, discoveryStatus: 'OK', lastDiscovery: sync }), 'LIVE')
  assert.equal(dockerStatus({ dockerVersion: '29', containersFound: null, discoveryStatus: 'ERROR', lastDiscovery: sync }), 'PARTIAL')
  assert.equal(dockerStatus({ dockerVersion: null, containersFound: 3, discoveryStatus: 'OK', lastDiscovery: sync }), 'PARTIAL')
  assert.equal(dockerStatus({ dockerVersion: null, containersFound: null, discoveryStatus: 'ERROR', lastDiscovery: null }), 'OFFLINE')
})

test('Proxmox distinguishes real, incomplete and simulated inventories', () => {
  assert.equal(proxmoxStatus({ source: 'live', snapshotErrors: 0, backupErrors: 0 }), 'LIVE')
  assert.equal(proxmoxStatus({ source: 'live', snapshotErrors: 1, backupErrors: 0 }), 'PARTIAL')
  assert.equal(proxmoxStatus({ source: 'live', snapshotErrors: 0, backupErrors: 1 }), 'PARTIAL')
  assert.equal(proxmoxStatus({ source: 'simulated', snapshotErrors: 0, backupErrors: 0 }), 'SIMULATED')
})

test('operational checks fail visibly without treating invalid responses as live', async (t) => {
  t.mock.method(console, 'warn', () => {})
  t.mock.method(globalThis, 'fetch', async (input) => {
    const url = String(input)
    if (url.includes('coolify')) return new Response(null, { status: 503 })
    if (url.includes('proxmox')) return Response.json({ source: 'live' })
    return Response.json({ dockerVersion: null, containersFound: null, discoveryStatus: 'ERROR', lastDiscovery: null })
  })
  const signal = new AbortController().signal
  assert.deepEqual(await checkOperationalSource('Docker', signal), { status: 'OFFLINE', count: null, lastSync: null })
  assert.deepEqual(await checkOperationalSource('Coolify', signal), { status: 'OFFLINE', count: null, lastSync: null })
  assert.deepEqual(await checkOperationalSource('Proxmox', signal), { status: 'UNKNOWN', count: null, lastSync: null })
})

test('inconsistent Docker diagnostics do not imply an offline engine', async (t) => {
  t.mock.method(console, 'warn', () => {})
  t.mock.method(globalThis, 'fetch', async () => Response.json({
    dockerVersion: null, containersFound: null, discoveryStatus: 'OK', lastDiscovery: null,
  }))
  assert.deepEqual(await checkOperationalSource('Docker', new AbortController().signal), { status: 'UNKNOWN', count: null, lastSync: null })
})

test('summary counts reflect the response and never invent a simulated Proxmox inventory', async (t) => {
  const resource = (id: string, type: string) => ({
    id, type, name: id, node: 'proxmox', vmid: 100, status: 'running',
    cpu: null, memory: null, maxMemory: null, disk: null, maxDisk: null, uptime: null,
  })
  let simulated = false
  t.mock.method(globalThis, 'fetch', async (input) => {
    const url = String(input)
    if (url.includes('diagnostics')) return Response.json({ dockerVersion: '29', containersFound: 0, discoveryStatus: 'OK', lastDiscovery: sync })
    if (url.includes('coolify')) return Response.json({ checkedAt: sync, projects: [{ id: '1', name: 'one' }, { id: '2', name: 'two' }, { id: '1', name: 'one' }], environments: [], resources: [], deployments: [] })
    return Response.json({
      source: simulated ? 'simulated' : 'live', checkedAt: sync,
      resources: [resource('qemu/100', 'qemu'), resource('qemu/100', 'qemu'), resource('lxc/101', 'lxc'), resource('node/proxmox', 'node')],
      snapshots: [], backups: [], snapshotErrors: 1, backupErrors: 0,
    })
  })
  const signal = new AbortController().signal
  assert.deepEqual(await checkOperationalSource('Docker', signal), { status: 'LIVE', count: 0, lastSync: sync })
  assert.deepEqual(await checkOperationalSource('Coolify', signal), { status: 'LIVE', count: 2, lastSync: sync })
  assert.deepEqual(await checkOperationalSource('Proxmox', signal), { status: 'PARTIAL', count: 1, lastSync: sync })
  simulated = true
  assert.deepEqual(await checkOperationalSource('Proxmox', signal), { status: 'SIMULATED', count: null, lastSync: null })
})

test('environment is explicit for deployments and local by default in development', (t) => {
  t.mock.method(console, 'warn', () => {})
  assert.equal(operationalEnvironment(undefined, true), 'LOCAL')
  assert.equal(operationalEnvironment(undefined, false), 'UNKNOWN')
  assert.equal(operationalEnvironment('STAGING', false), 'STAGING')
  assert.equal(operationalEnvironment('PRODUCTION', false), 'PRODUCTION')
  assert.equal(operationalEnvironment('LOCAL', false), 'LOCAL')
  assert.equal(operationalEnvironment('production', false), 'UNKNOWN')
})

test('compact operational summary never hides failures or simulation', () => {
  const live = { status: 'LIVE' as const, count: 1, lastSync: sync }
  const readings = { Docker: live, Coolify: live, Proxmox: live }
  assert.equal(summarizeOperationalStatus(readings), 'LIVE')
  assert.equal(summarizeOperationalStatus({ ...readings, Docker: { status: 'SIMULATED', count: 6, lastSync: sync } }), 'SIMULATED')
  assert.equal(summarizeOperationalStatus({ ...readings, Docker: { status: 'OFFLINE', count: null, lastSync: sync } }), 'PARTIAL')
  assert.equal(summarizeOperationalStatus({ ...readings, Coolify: { status: 'UNKNOWN', count: null, lastSync: null } }), 'UNKNOWN')
  assert.equal(summarizeOperationalStatus({ ...readings, Proxmox: { status: 'PARTIAL', count: 1, lastSync: sync } }), 'PARTIAL')
})
