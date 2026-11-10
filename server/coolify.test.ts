import assert from 'node:assert/strict'
import { once } from 'node:events'
import { createServer } from 'node:http'
import { test } from 'node:test'
import { createApp } from './app.js'
import { createCoolifyTransport } from './coolify.js'
import { coolifyNodes } from '../src/integrations/coolify.integration.js'
import { emptyGraph, mergeDiscovery } from '../src/domain/graph.js'

const secret = 'fixture-token-do-not-expose'
const payloads: Record<string, unknown> = {
  '/api/v1/projects': [{ uuid: 'project-1', name: 'Production' }],
  '/api/v1/projects/project-1': {
    uuid: 'project-1',
    environments: [{ id: 12, name: 'production' }],
    private_key: secret,
  },
  '/api/v1/resources': [
    { id: 34, uuid: 'app-1', name: 'Grafana', type: 'application', environment_id: 12, status: 'running:healthy', fqdn: 'https://user:password@grafana.example.test/path?token=secret', password: secret },
    { uuid: 'db-1', name: 'Database', type: 'standalone-postgresql', environment_id: 12, status: 'exited:unhealthy', postgres_password: secret },
  ],
  '/api/v1/deployments': [{ deployment_uuid: 'deploy-1', application_id: '34', status: 'in_progress', created_at: '2026-01-01T00:00:00Z', logs: secret }],
}

function fixtureRequest(calls: string[]): typeof fetch {
  return async (input, init) => {
    const url = new URL(String(input))
    calls.push(url.pathname)
    assert.equal(new Headers(init?.headers).get('authorization'), `Bearer ${secret}`)
    assert.equal(init?.redirect, 'error')
    if (!(url.pathname in payloads)) return new Response('Not found', { status: 404 })
    return Response.json(payloads[url.pathname])
  }
}

test('Coolify transport reads only allowlisted fields and does not expose secrets', async () => {
  const calls: string[] = []
  const transport = createCoolifyTransport('https://coolify.example.test', secret, fixtureRequest(calls))
  const snapshot = await transport.discover()
  assert.deepEqual(calls.sort(), Object.keys(payloads).sort())
  assert.equal(snapshot.resources[0].url, 'https://grafana.example.test')
  assert.equal(snapshot.resources[1].type, 'database')
  assert.equal(snapshot.environments[0].projectId, 'project-1')
  assert.equal(snapshot.deployments[0].applicationId, '34')
  const response = JSON.stringify(snapshot)
  for (const value of [secret, 'password', '?token', 'private_key', 'logs']) assert.ok(!response.includes(value))
})

test('Coolify transport fails closed on malformed or incomplete responses', async () => {
  assert.throws(() => createCoolifyTransport('http://coolify.example.test', secret), /INVALID_CONFIGURATION/)
  assert.throws(() => createCoolifyTransport('http://coolify.example.test', secret, fetch, { allowInsecureHttp: false }), /INVALID_CONFIGURATION/)
  assert.throws(() => createCoolifyTransport('ftp://coolify.example.test', secret, fetch, { allowInsecureHttp: true }), /INVALID_CONFIGURATION/)
  assert.throws(() => createCoolifyTransport('http://user:password@coolify.example.test', secret, fetch, { allowInsecureHttp: true }), /INVALID_CONFIGURATION/)
  assert.throws(() => createCoolifyTransport('https://user:password@example.test', secret), /INVALID_CONFIGURATION/)
  const bad: typeof fetch = async () => Response.json({ unexpected: true })
  await assert.rejects(createCoolifyTransport('https://coolify.example.test', secret, bad).discover(), /INVALID_RESPONSE/)
})

test('HTTP transport requires opt-in and does not follow redirects with credentials', async () => {
  const calls: string[] = []
  const snapshot = await createCoolifyTransport('http://coolify:8080', secret, fixtureRequest(calls), { allowInsecureHttp: true }).discover()
  assert.equal(snapshot.projects[0].name, 'Production')
  assert.deepEqual(calls.sort(), Object.keys(payloads).sort())
  let destinationCalls = 0
  const destination = createServer((_req, res) => { destinationCalls++; res.end() }).listen(0, '127.0.0.1')
  await once(destination, 'listening')
  const destinationAddress = destination.address()
  assert.ok(destinationAddress && typeof destinationAddress !== 'string')
  const redirect = createServer((_req, res) => {
    res.writeHead(302, { Location: `http://127.0.0.1:${destinationAddress.port}/` }).end()
  }).listen(0, '127.0.0.1')
  await once(redirect, 'listening')
  try {
    const address = redirect.address()
    assert.ok(address && typeof address !== 'string')
    await assert.rejects(createCoolifyTransport(`http://127.0.0.1:${address.port}`, secret, fetch, { allowInsecureHttp: true }).discover(), /UPSTREAM_UNREACHABLE/)
    assert.equal(destinationCalls, 0)
  } finally {
    redirect.close()
    destination.close()
    await Promise.all([once(redirect, 'close'), once(destination, 'close')])
  }
})

test('Coolify transport respects Retry-After after a rate limit response', async () => {
  let calls = 0
  const limited: typeof fetch = async () => {
    calls++
    return new Response(null, { status: 429, headers: { 'Retry-After': '60' } })
  }
  const transport = createCoolifyTransport('https://coolify.example.test', secret, limited)
  await assert.rejects(transport.discover(), (error: unknown) =>
    error instanceof Error && error.message === 'UPSTREAM_HTTP' && 'upstreamStatus' in error && error.upstreamStatus === 429)
  const initialCalls = calls
  await assert.rejects(transport.discover(), /RATE_LIMITED/)
  assert.equal(calls, initialCalls)
})

test('diagnostic traces report endpoint and status without logging keys, response bodies, or project identifiers', async () => {
  const traces: string[] = []
  const request: typeof fetch = async (input) => {
    const url = new URL(String(input))
    if (url.pathname === '/api/v1/projects/project-1') return new Response(secret, { status: 403 })
    return Response.json(payloads[url.pathname])
  }
  const transport = createCoolifyTransport('http://coolify:8080', secret, request, {
    allowInsecureHttp: true,
    diagnosticLogs: true,
    logger: (message) => traces.push(message),
  })
  await assert.rejects(transport.discover(), /UPSTREAM_HTTP/)
  assert.ok(traces.some((line) => line.includes('GET /api/v1/projects status=200')))
  assert.ok(traces.some((line) => line.includes('GET /api/v1/projects/{uuid} status=403')))
  assert.ok(traces.every((line) => !line.includes(secret) && !line.includes('project-1')))
})

test('diagnostic traces distinguish DNS, connection, timeout, and invalid schema without raw exception text', async () => {
  for (const [code, expected] of [['ENOTFOUND', 'DNS_NOT_FOUND'], ['ECONNREFUSED', 'CONNECTION_REFUSED'], ['ETIMEDOUT', 'CONNECTION_TIMEOUT']] as const) {
    const traces: string[] = []
    const request: typeof fetch = async () => {
      throw new Error(secret, { cause: Object.assign(new Error(secret), { code }) })
    }
    await assert.rejects(createCoolifyTransport('https://coolify.example.test', secret, request, {
      logger: (message) => traces.push(message),
    }).discover(), /UPSTREAM_UNREACHABLE/)
    assert.ok(traces.some((line) => line.includes(`cause=${expected}`) && line.includes('/api/v1/')))
    assert.ok(traces.every((line) => !line.includes(secret)))
  }
  const traces: string[] = []
  const invalid: typeof fetch = async () => Response.json({ secret })
  await assert.rejects(createCoolifyTransport('https://coolify.example.test', secret, invalid, {
    logger: (message) => traces.push(message),
  }).discover(), /INVALID_RESPONSE/)
  assert.ok(traces.some((line) => line.includes('/api/v1/projects result=INVALID_RESPONSE')))
  assert.ok(traces.every((line) => !line.includes(secret)))
})

test('diagnostic traces identify the failed parsing field without recording values', async () => {
  const cases: Array<{ path: string; payload: unknown; field: string; actual: string }> = [
    { path: '/api/v1/projects', payload: [{ uuid: secret, name: null }], field: 'project.name', actual: 'null' },
    { path: '/api/v1/projects/project-1', payload: { environments: [{ id: {}, name: secret }] }, field: 'environment.id', actual: 'object' },
    { path: '/api/v1/resources', payload: [{ uuid: 'app-1', name: secret, type: secret }], field: 'resource.type', actual: 'string' },
    { path: '/api/v1/deployments', payload: [{ deployment_uuid: null, logs: secret }], field: 'deployment.deployment_uuid', actual: 'null' },
    { path: '/api/v1/deployments', payload: { message: secret }, field: 'root', actual: 'object' },
  ]
  for (const { path, payload, field, actual } of cases) {
    const traces: string[] = []
    const request: typeof fetch = async (input) => {
      const pathname = new URL(String(input)).pathname
      return Response.json(pathname === path ? payload : payloads[pathname])
    }
    await assert.rejects(createCoolifyTransport('https://coolify.example.test', secret, request, {
      diagnosticLogs: true,
      logger: (message) => traces.push(message),
    }).discover(), /INVALID_RESPONSE/)
    assert.ok(traces.some((line) => line.includes(`field=${field}`) && line.includes(`actual=${actual}`)))
    assert.ok(traces.some((line) => line.includes('Coolify discovery: result=INVALID_RESPONSE')))
    assert.ok(traces.every((line) => !line.includes(secret) && !line.includes('project-1')))
  }
})

test('deployment parsing accepts numeric-keyed Coolify collections and reports stage counts', async () => {
  const traces: string[] = []
  const request: typeof fetch = async (input) => {
    const pathname = new URL(String(input)).pathname
    const result = pathname === '/api/v1/deployments'
      ? { '1': { deployment_uuid: 'deploy-2', application_id: 34 }, '0': { deployment_uuid: 'deploy-1', application_id: 34 } }
      : payloads[pathname]
    return Response.json(result)
  }
  const snapshot = await createCoolifyTransport('https://coolify.example.test', secret, request, {
    diagnosticLogs: true,
    logger: (message) => traces.push(message),
  }).discover()
  assert.deepEqual(snapshot.deployments.map((deployment) => deployment.id).sort(), ['deploy-1', 'deploy-2'])
  for (const stage of ['projects count=1', 'environments count=1', 'resources count=2', 'deployments count=2']) {
    assert.ok(traces.some((line) => line.includes(`stage=${stage}`)))
  }
  assert.ok(traces.some((line) => line.includes('Coolify discovery: result=SUCCESS')))
  assert.ok(traces.every((line) => !line.includes(secret) && !line.includes('project-1') && !line.includes('deploy-1')))
})

test('Coolify nodes merge under projects and environments without altering Docker', async () => {
  const snapshot = await createCoolifyTransport('https://coolify.example.test', secret, fixtureRequest([])).discover()
  const base = mergeDiscovery(emptyGraph, { nodes: [
    { id: 'vps-web', name: 'Core', kind: 'vps', layer: 'infrastructure', status: 'ok', parentId: null },
    { id: 'docker', name: 'Docker', kind: 'docker', layer: 'infrastructure', status: 'ok', parentId: 'vps-web' },
  ] }).graph
  const nodes = coolifyNodes(snapshot)
  const merged = mergeDiscovery(base, { nodes })
  assert.equal(merged.rejected.length, 0)
  assert.equal(merged.graph.nodes['coolify-resource-app-1'].parentId, 'coolify-env-12')
  assert.equal(merged.graph.nodes['coolify-resource-app-1'].projectName, 'Production')
  assert.equal(merged.graph.nodes['coolify-resource-app-1'].deploymentStatus, 'in_progress')
  assert.equal(merged.graph.nodes['coolify-deployment-deploy-1'].parentId, 'coolify-resource-app-1')
  assert.equal(merged.graph.nodes['coolify-resource-db-1'].status, 'critical')
  assert.equal(merged.graph.nodes.docker, base.nodes.docker)
  assert.equal(mergeDiscovery(merged.graph, { nodes: coolifyNodes(snapshot) }).graph, merged.graph)
  const updatedNodes = coolifyNodes({ ...snapshot, resources: snapshot.resources.map((resource) =>
    resource.id === 'app-1' ? { ...resource, status: 'exited' } : resource) })
  const updated = mergeDiscovery(merged.graph, { nodes: updatedNodes }).graph
  assert.equal(updated.nodes['coolify-resource-app-1'].status, 'offline')
  assert.equal(updated.topology, merged.graph.topology)
  const removed = mergeDiscovery(merged.graph, { removed: ['coolify-project-project-1'] }).graph
  assert.equal(removed.nodes['coolify-resource-app-1'], undefined)
  assert.equal(removed.nodes.docker, base.nodes.docker)
})

test('Coolify endpoint returns sanitized inventory and shares concurrent discovery', async () => {
  let count = 0
  const transport = createCoolifyTransport('https://coolify.example.test', secret, fixtureRequest([]))
  const server = createApp(undefined, { async discover() { count++; return transport.discover() } }).listen(0, '127.0.0.1')
  await once(server, 'listening')
  try {
    const address = server.address()
    assert.ok(address && typeof address !== 'string')
    const url = `http://127.0.0.1:${address.port}/api/coolify/discovery`
    const responses = await Promise.all([fetch(url), fetch(url)])
    assert.equal(count, 1)
    for (const response of responses) {
      assert.equal(response.status, 200)
      assert.equal(response.headers.get('cache-control'), 'no-store')
      assert.ok(!(await response.text()).includes(secret))
    }
  } finally {
    server.close()
    await once(server, 'close')
  }
})

test('Coolify endpoint returns 503 rather than simulated success on failure', async () => {
  const server = createApp(undefined, { async discover() { throw new Error(secret) } }).listen(0, '127.0.0.1')
  await once(server, 'listening')
  try {
    const address = server.address()
    assert.ok(address && typeof address !== 'string')
    const response = await fetch(`http://127.0.0.1:${address.port}/api/coolify/discovery`)
    assert.equal(response.status, 503)
    assert.ok(!(await response.text()).includes(secret))
  } finally {
    server.close()
    await once(server, 'close')
  }
})

test('configured HTTP Coolify URL is rejected while the route remains registered', async () => {
  const previousUrl = process.env.COOLIFY_URL
  const previousKey = process.env.COOLIFY_API_KEY
  const previousAllow = process.env.COOLIFY_ALLOW_INSECURE_HTTP
  process.env.COOLIFY_URL = 'http://coolify:8080'
  process.env.COOLIFY_API_KEY = secret
  process.env.COOLIFY_ALLOW_INSECURE_HTTP = 'false'
  const app = createApp()
  if (previousUrl === undefined) delete process.env.COOLIFY_URL
  else process.env.COOLIFY_URL = previousUrl
  if (previousKey === undefined) delete process.env.COOLIFY_API_KEY
  else process.env.COOLIFY_API_KEY = previousKey
  if (previousAllow === undefined) delete process.env.COOLIFY_ALLOW_INSECURE_HTTP
  else process.env.COOLIFY_ALLOW_INSECURE_HTTP = previousAllow
  const server = app.listen(0, '127.0.0.1')
  await once(server, 'listening')
  try {
    const address = server.address()
    assert.ok(address && typeof address !== 'string')
    const response = await fetch(`http://127.0.0.1:${address.port}/api/coolify/discovery`)
    assert.equal(response.status, 503)
    assert.ok(!(await response.text()).includes(secret))
  } finally {
    server.close()
    await once(server, 'close')
  }
})

test('backend opt-in enables discovery through HTTP without exposing the key', async () => {
  const upstream = createServer((req, res) => {
    if (req.headers.authorization !== `Bearer ${secret}`) {
      res.writeHead(401).end()
      return
    }
    const result = payloads[req.url ?? '']
    if (!result) {
      res.writeHead(404).end()
      return
    }
    res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(result))
  }).listen(0, '127.0.0.1')
  await once(upstream, 'listening')
  const address = upstream.address()
  assert.ok(address && typeof address !== 'string')
  const previousUrl = process.env.COOLIFY_URL
  const previousKey = process.env.COOLIFY_API_KEY
  const previousAllow = process.env.COOLIFY_ALLOW_INSECURE_HTTP
  process.env.COOLIFY_URL = `http://127.0.0.1:${address.port}`
  process.env.COOLIFY_API_KEY = secret
  process.env.COOLIFY_ALLOW_INSECURE_HTTP = 'true'
  const app = createApp()
  if (previousUrl === undefined) delete process.env.COOLIFY_URL
  else process.env.COOLIFY_URL = previousUrl
  if (previousKey === undefined) delete process.env.COOLIFY_API_KEY
  else process.env.COOLIFY_API_KEY = previousKey
  if (previousAllow === undefined) delete process.env.COOLIFY_ALLOW_INSECURE_HTTP
  else process.env.COOLIFY_ALLOW_INSECURE_HTTP = previousAllow
  const server = app.listen(0, '127.0.0.1')
  await once(server, 'listening')
  try {
    const backendAddress = server.address()
    assert.ok(backendAddress && typeof backendAddress !== 'string')
    const response = await fetch(`http://127.0.0.1:${backendAddress.port}/api/coolify/discovery`)
    assert.equal(response.status, 200)
    const body = await response.text()
    assert.equal(JSON.parse(body).projects[0].name, 'Production')
    assert.ok(!body.includes(secret))
  } finally {
    server.close()
    upstream.close()
    await Promise.all([once(server, 'close'), once(upstream, 'close')])
  }
})
