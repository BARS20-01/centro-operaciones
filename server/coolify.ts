export interface CoolifyProject {
  id: string
  name: string
}

export interface CoolifyEnvironment {
  id: string
  name: string
  projectId: string
}

export interface CoolifyResource {
  id: string
  name: string
  type: 'application' | 'service' | 'database'
  environmentId: string | null
  status: string | null
  url: string | null
  applicationId: string | null
}

export interface CoolifyDeployment {
  id: string
  applicationId: string | null
  status: string | null
  createdAt: string | null
}

export interface CoolifySnapshot {
  checkedAt: string
  projects: CoolifyProject[]
  environments: CoolifyEnvironment[]
  resources: CoolifyResource[]
  deployments: CoolifyDeployment[]
}

export interface CoolifyTransport {
  discover(): Promise<CoolifySnapshot>
}

export class CoolifyError extends Error {
  constructor(
    public readonly code: 'INVALID_CONFIGURATION' | 'NOT_CONFIGURED' | 'UPSTREAM_HTTP' | 'UPSTREAM_UNREACHABLE' | 'INVALID_RESPONSE' | 'RATE_LIMITED',
    public readonly upstreamStatus?: number,
  ) {
    super(code)
    this.name = 'CoolifyError'
  }
}

type JsonRecord = Record<string, unknown>

type CoolifyEndpoint = '/api/v1/projects' | '/api/v1/projects/{uuid}' | '/api/v1/resources' | '/api/v1/deployments'
type TransportFailure = 'DNS_NOT_FOUND' | 'DNS_TEMPORARY_FAILURE' | 'CONNECTION_REFUSED' | 'CONNECTION_TIMEOUT' |
  'NETWORK_UNREACHABLE' | 'TLS_ERROR' | 'TIMEOUT' | 'FETCH_FAILED'

function transportFailure(error: unknown): TransportFailure {
  if (!(error instanceof Error)) return 'FETCH_FAILED'
  if (error.name === 'TimeoutError' || error.name === 'AbortError') return 'TIMEOUT'
  const cause: unknown = error.cause
  const code = cause && typeof cause === 'object' && 'code' in cause ? cause.code : undefined
  switch (code) {
    case 'ENOTFOUND': return 'DNS_NOT_FOUND'
    case 'EAI_AGAIN': return 'DNS_TEMPORARY_FAILURE'
    case 'ECONNREFUSED': return 'CONNECTION_REFUSED'
    case 'ETIMEDOUT':
    case 'UND_ERR_CONNECT_TIMEOUT': return 'CONNECTION_TIMEOUT'
    case 'ENETUNREACH':
    case 'EHOSTUNREACH': return 'NETWORK_UNREACHABLE'
    case 'CERT_HAS_EXPIRED':
    case 'DEPTH_ZERO_SELF_SIGNED_CERT':
    case 'UNABLE_TO_VERIFY_LEAF_SIGNATURE':
    case 'ERR_TLS_CERT_ALTNAME_INVALID': return 'TLS_ERROR'
    default: return 'FETCH_FAILED'
  }
}

function record(value: unknown): JsonRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new CoolifyError('INVALID_RESPONSE')
  return value as JsonRecord
}

function array(value: unknown): unknown[] {
  if (!Array.isArray(value)) throw new CoolifyError('INVALID_RESPONSE')
  return value
}

function deploymentArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value
  const entries = Object.entries(record(value))
  if (!entries.length || entries.some(([key]) => !/^(0|[1-9]\d*)$/.test(key))) {
    throw new CoolifyError('INVALID_RESPONSE')
  }
  return entries.map(([, deployment]) => deployment)
}

function identifier(value: unknown): string {
  const result = typeof value === 'number' && Number.isSafeInteger(value) ? String(value) : value
  if (typeof result !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(result)) throw new CoolifyError('INVALID_RESPONSE')
  return result
}

function name(value: unknown): string {
  if (typeof value !== 'string' || !value.trim() || value.length > 200) throw new CoolifyError('INVALID_RESPONSE')
  return value.trim()
}

function optionalId(value: unknown): string | null {
  return value == null ? null : identifier(value)
}

function status(value: unknown): string | null {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9:_-]{1,64}$/.test(value)) return null
  return value.toLowerCase()
}

function publicUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null
  try {
    const url = new URL(value.split(',')[0].trim())
    if (!['http:', 'https:'].includes(url.protocol)) return null
    return url.origin
  } catch {
    return null
  }
}

function timestamp(value: unknown): string | null {
  return typeof value === 'string' && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : null
}

export function createCoolifyTransport(
  baseUrl: string,
  apiKey: string,
  request: typeof fetch = fetch,
  options: { allowInsecureHttp?: boolean; diagnosticLogs?: boolean; logger?: (message: string) => void } = {},
): CoolifyTransport {
  let base: URL
  try {
    base = new URL(baseUrl)
  } catch {
    throw new CoolifyError('INVALID_CONFIGURATION')
  }
  const allowedProtocol = base.protocol === 'https:' || (base.protocol === 'http:' && options.allowInsecureHttp === true)
  if (!allowedProtocol || base.username || base.password || base.search || base.hash) {
    throw new CoolifyError('INVALID_CONFIGURATION')
  }
  if (!apiKey || /[\r\n]/.test(apiKey)) throw new CoolifyError('INVALID_CONFIGURATION')
  base.pathname = `${base.pathname.replace(/\/+$/, '')}/api/v1/`
  let retryAt = 0
  const log = options.logger ?? ((message: string) => console.error(message))

  function parse<T>(
    endpoint: CoolifyEndpoint,
    field: string,
    value: unknown,
    expected: string,
    read: (input: unknown) => T,
    index?: number,
  ): T {
    try {
      return read(value)
    } catch (error) {
      if (error instanceof CoolifyError && error.code === 'INVALID_RESPONSE') {
        const actual = value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value
        log(`Coolify response: GET ${endpoint} result=INVALID_RESPONSE field=${field} expected=${expected} actual=${actual}${index === undefined ? '' : ` index=${index}`}`)
      }
      throw error
    }
  }

  function parsed(endpoint: CoolifyEndpoint, stage: string, count: number) {
    if (options.diagnosticLogs) log(`Coolify parse: GET ${endpoint} stage=${stage} count=${count}`)
  }

  async function get(path: string, endpoint: CoolifyEndpoint): Promise<unknown> {
    if (Date.now() < retryAt) {
      log(`Coolify request: GET ${endpoint} result=RATE_LIMITED`)
      throw new CoolifyError('RATE_LIMITED')
    }
    const started = Date.now()
    let response: Response
    try {
      response = await request(new URL(path, base), {
        headers: { Accept: 'application/json', Authorization: `Bearer ${apiKey}` },
        redirect: 'error',
        signal: AbortSignal.timeout(15_000),
      })
    } catch (error) {
      log(`Coolify request: GET ${endpoint} result=UPSTREAM_UNREACHABLE cause=${transportFailure(error)} elapsed_ms=${Date.now() - started}`)
      throw new CoolifyError('UPSTREAM_UNREACHABLE')
    }
    if (!response.ok || options.diagnosticLogs) {
      log(`Coolify request: GET ${endpoint} status=${response.status} elapsed_ms=${Date.now() - started}`)
    }
    if (response.status === 429) {
      const seconds = Number(response.headers.get('retry-after'))
      const delay = Number.isFinite(seconds) && seconds > 0 ? Math.min(seconds * 1000, 15 * 60_000) : 60_000
      retryAt = Math.max(retryAt, Date.now() + delay)
    }
    if (!response.ok) throw new CoolifyError('UPSTREAM_HTTP', response.status)
    try {
      return await response.json()
    } catch {
      log(`Coolify request: GET ${endpoint} result=INVALID_JSON`)
      throw new CoolifyError('INVALID_RESPONSE')
    }
  }

  return {
    async discover() {
      const started = Date.now()
      if (options.diagnosticLogs) log('Coolify discovery: result=STARTED')
      try {
        const [projectPayload, resourcePayload, deploymentPayload] = await Promise.all([
          get('projects', '/api/v1/projects'),
          get('resources', '/api/v1/resources'),
          get('deployments', '/api/v1/deployments'),
        ])
        const projectsEndpoint = '/api/v1/projects'
        const projects = parse(projectsEndpoint, 'root', projectPayload, 'array', array).map((value, index) => {
          const project = parse(projectsEndpoint, 'project', value, 'object', record, index)
          return {
            id: parse(projectsEndpoint, 'project.uuid', project.uuid, 'identifier', identifier, index),
            name: parse(projectsEndpoint, 'project.name', project.name, 'nonempty_name', name, index),
          }
        })
        parsed(projectsEndpoint, 'projects', projects.length)
        const environments: CoolifyEnvironment[] = []
        // Batches limit load on Coolify and avoid an unbounded request fan-out.
        for (let i = 0; i < projects.length; i += 5) {
          const batch = projects.slice(i, i + 5)
          const details = await Promise.all(batch.map((project) => get(`projects/${encodeURIComponent(project.id)}`, '/api/v1/projects/{uuid}')))
          const endpoint = '/api/v1/projects/{uuid}'
          details.forEach((value, index) => {
            const project = parse(endpoint, 'project', value, 'object', record, index)
            const entries = parse(endpoint, 'project.environments', project.environments, 'array', array, index)
            entries.forEach((entry, environmentIndex) => {
              const environment = parse(endpoint, 'environment', entry, 'object', record, environmentIndex)
              environments.push({
                id: parse(endpoint, 'environment.id', environment.id, 'identifier', identifier, environmentIndex),
                name: parse(endpoint, 'environment.name', environment.name, 'nonempty_name', name, environmentIndex),
                projectId: batch[index].id,
              })
            })
          })
        }
        parsed('/api/v1/projects/{uuid}', 'environments', environments.length)
        const resourcesEndpoint = '/api/v1/resources'
        const resources = parse(resourcesEndpoint, 'root', resourcePayload, 'array', array).map((value, index): CoolifyResource => {
          const resource = parse(resourcesEndpoint, 'resource', value, 'object', record, index)
          const type = parse(resourcesEndpoint, 'resource.type', resource.type, 'application_service_or_standalone_database', (rawType) => {
            if (rawType === 'application' || rawType === 'service') return rawType
            if (typeof rawType === 'string' && rawType.startsWith('standalone-')) return 'database'
            throw new CoolifyError('INVALID_RESPONSE')
          }, index)
          return {
            id: parse(resourcesEndpoint, 'resource.uuid', resource.uuid, 'identifier', identifier, index),
            name: parse(resourcesEndpoint, 'resource.name', resource.name, 'nonempty_name', name, index),
            type,
            environmentId: parse(resourcesEndpoint, 'resource.environment_id', resource.environment_id, 'optional_identifier', optionalId, index),
            status: status(resource.status),
            url: publicUrl(resource.fqdn),
            applicationId: type === 'application' ? parse(resourcesEndpoint, 'resource.id', resource.id, 'optional_identifier', optionalId, index) : null,
          }
        })
        parsed(resourcesEndpoint, 'resources', resources.length)
        const deploymentsEndpoint = '/api/v1/deployments'
        const deployments = parse(deploymentsEndpoint, 'root', deploymentPayload, 'array_or_numeric_keyed_object', deploymentArray).map((value, index): CoolifyDeployment => {
          const deployment = parse(deploymentsEndpoint, 'deployment', value, 'object', record, index)
          return {
            id: parse(deploymentsEndpoint, 'deployment.deployment_uuid', deployment.deployment_uuid, 'identifier', identifier, index),
            applicationId: parse(deploymentsEndpoint, 'deployment.application_id', deployment.application_id, 'optional_identifier', optionalId, index),
            status: status(deployment.status),
            createdAt: timestamp(deployment.created_at),
          }
        })
        parsed(deploymentsEndpoint, 'deployments', deployments.length)
        if (options.diagnosticLogs) log(`Coolify discovery: result=SUCCESS elapsed_ms=${Date.now() - started}`)
        return { checkedAt: new Date().toISOString(), projects, environments, resources, deployments }
      } catch (error) {
        const result = error instanceof CoolifyError ? error.code : 'UNEXPECTED_ERROR'
        log(`Coolify discovery: result=${result} elapsed_ms=${Date.now() - started}`)
        throw error
      }
    },
  }
}
