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

function record(value: unknown): JsonRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new CoolifyError('INVALID_RESPONSE')
  return value as JsonRecord
}

function array(value: unknown): unknown[] {
  if (!Array.isArray(value)) throw new CoolifyError('INVALID_RESPONSE')
  return value
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
  options: { allowInsecureHttp?: boolean } = {},
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

  async function get(path: string): Promise<unknown> {
    if (Date.now() < retryAt) throw new CoolifyError('RATE_LIMITED')
    let response: Response
    try {
      response = await request(new URL(path, base), {
        headers: { Accept: 'application/json', Authorization: `Bearer ${apiKey}` },
        redirect: 'error',
        signal: AbortSignal.timeout(15_000),
      })
    } catch {
      throw new CoolifyError('UPSTREAM_UNREACHABLE')
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
      throw new CoolifyError('INVALID_RESPONSE')
    }
  }

  return {
    async discover() {
      const [projectPayload, resourcePayload, deploymentPayload] = await Promise.all([
        get('projects'), get('resources'), get('deployments'),
      ])
      const projects = array(projectPayload).map((value) => {
        const project = record(value)
        return { id: identifier(project.uuid), name: name(project.name) }
      })
      const environments: CoolifyEnvironment[] = []
      // Batches limit load on Coolify and avoid an unbounded request fan-out.
      for (let i = 0; i < projects.length; i += 5) {
        const batch = projects.slice(i, i + 5)
        const details = await Promise.all(batch.map((project) => get(`projects/${encodeURIComponent(project.id)}`)))
        details.forEach((value, index) => {
          for (const entry of array(record(value).environments)) {
            const environment = record(entry)
            environments.push({ id: identifier(environment.id), name: name(environment.name), projectId: batch[index].id })
          }
        })
      }
      const resources = array(resourcePayload).map((value): CoolifyResource => {
        const resource = record(value)
        const rawType = resource.type
        const type = rawType === 'application' || rawType === 'service'
          ? rawType
          : typeof rawType === 'string' && rawType.startsWith('standalone-')
            ? 'database'
            : null
        if (!type) throw new CoolifyError('INVALID_RESPONSE')
        return {
          id: identifier(resource.uuid),
          name: name(resource.name),
          type,
          environmentId: optionalId(resource.environment_id),
          status: status(resource.status),
          url: publicUrl(resource.fqdn),
          applicationId: type === 'application' ? optionalId(resource.id) : null,
        }
      })
      const deployments = array(deploymentPayload).map((value): CoolifyDeployment => {
        const deployment = record(value)
        return {
          id: identifier(deployment.deployment_uuid),
          applicationId: optionalId(deployment.application_id),
          status: status(deployment.status),
          createdAt: timestamp(deployment.created_at),
        }
      })
      return { checkedAt: new Date().toISOString(), projects, environments, resources, deployments }
    },
  }
}
