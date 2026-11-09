import assert from 'node:assert/strict'
import { once } from 'node:events'
import { test } from 'node:test'
import { createApp } from './app.js'
import { listContainers, type DockerCommand } from './docker.js'

const id = 'a'.repeat(64)
const stoppedId = 'b'.repeat(64)
const fixture: DockerCommand = async (args) => {
  switch (args[0]) {
    case 'ps':
      return [
        JSON.stringify({ ID: id, Names: 'grafana', Image: 'grafana/grafana:latest', State: 'running' }),
        JSON.stringify({ ID: stoppedId, Names: 'uptime-kuma', Image: 'uptime-kuma', State: 'exited' }),
      ].join('\n')
    case 'inspect':
      return JSON.stringify([
        {
          Id: id,
          State: { StartedAt: '2026-01-01T10:00:00Z' },
          Config: {
            Labels: {
              'com.docker.compose.service': 'grafana',
              'com.docker.compose.depends_on': 'uptime-kuma:service_started:false',
            },
          },
          HostConfig: { Links: [] },
          NetworkSettings: {
            Ports: { '3000/tcp': [{ HostIp: '127.0.0.1', HostPort: '3000' }] },
            Networks: { nexus: {} },
          },
        },
        {
          Id: stoppedId,
          State: { StartedAt: '2026-01-01T09:00:00Z' },
          Config: { Labels: { 'com.docker.compose.service': 'uptime-kuma' } },
          HostConfig: { Links: [] },
          NetworkSettings: { Ports: { '3001/tcp': null }, Networks: { nexus: {} } },
        },
      ])
    case 'stats':
      assert.deepEqual(args.slice(-1), [id])
      return JSON.stringify({ ID: id, CPUPerc: '12.5%', MemUsage: '1.5MiB / 2GB' })
    default:
      throw new Error('Unexpected command')
  }
}

test('normalizes running and stopped containers with Docker metrics', async () => {
  const containers = await listContainers(fixture)
  assert.equal(containers[0].id, id)
  assert.equal(containers[0].name, 'grafana')
  assert.equal(containers[0].state, 'running')
  assert.equal(containers[0].status, 'running')
  assert.deepEqual(containers[0].ports, ['127.0.0.1:3000 → 3000/tcp'])
  assert.deepEqual(containers[0].networks, ['nexus'])
  assert.deepEqual(containers[0].dependsOn, ['uptime-kuma'])
  assert.deepEqual(containers[1].ports, ['3001/tcp'])
  assert.equal(containers[0].cpuPercent, 12.5)
  assert.equal(containers[0].cpu, 12.5)
  assert.equal(containers[0].memoryPercent, 0.1)
  assert.deepEqual(containers[0].ram, { bytes: 1.5 * 1024 ** 2, limitBytes: 2 * 1000 ** 3, percent: 0.1 })
  assert.ok(containers[0].uptime >= 0)
  assert.equal(containers[1].state, 'exited')
  assert.equal(containers[1].cpuPercent, 0)
  assert.equal(containers[1].uptime, 0)
})

test('returns an empty list without invoking stats or inspect', async () => {
  let count = 0
  assert.deepEqual(await listContainers(async () => { count++; return '' }), [])
  assert.equal(count, 1)
})

test('rejects missing metrics instead of reporting a false healthy reading', async () => {
  await assert.rejects(listContainers(async (args) => args[0] === 'stats' ? '' : fixture(args)), /Missing Docker stats/)
})

test('container and stats endpoints return normalized data and 503 on Docker failure', async () => {
  const run: DockerCommand = async (args) => {
    if (args[0] === 'ps' && fail) throw new Error('Docker unavailable')
    return fixture(args)
  }
  let fail = false
  const server = createApp(run).listen(0, '127.0.0.1')
  await once(server, 'listening')
  try {
    const address = server.address()
    assert.ok(address && typeof address !== 'string')
    const url = `http://127.0.0.1:${address.port}/api/docker/containers`
    const response = await fetch(url)
    assert.equal(response.status, 200)
    assert.equal(response.headers.get('cache-control'), 'no-store')
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff')
    const body = await response.json() as { name: string }[]
    assert.equal(body[0].name, 'grafana')
    const statsResponse = await fetch(`http://127.0.0.1:${address.port}/api/docker/stats`)
    assert.equal(statsResponse.status, 200)
    const stats = await statsResponse.json() as { name: string; cpu: number; memory: number; memoryPercent: number }[]
    assert.deepEqual(stats.map((reading) => reading.name), ['grafana'])
    assert.equal(stats[0].cpu, 12.5)
    assert.equal(stats[0].memoryPercent, 0.1)
    fail = true
    await new Promise((resolve) => setTimeout(resolve, 10))
    const failed = await fetch(url)
    assert.equal(failed.status, 503)
    assert.deepEqual(await failed.json(), { error: 'Docker telemetry unavailable' })
    const unknown = await fetch(`http://127.0.0.1:${address.port}/api/docker/exec`)
    assert.equal(unknown.status, 404)
  } finally {
    server.close()
    await once(server, 'close')
  }
})
