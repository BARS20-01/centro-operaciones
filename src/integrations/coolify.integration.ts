import type { DiscoveryResult, NodeInput } from '@/domain/graph'
import type { Status } from '@/types'
import type { Integration } from './types'

interface Project { id: string; name: string }
interface Environment extends Project { projectId: string }
interface Resource extends Project {
  type: 'application' | 'service' | 'database'
  environmentId: string | null
  status: string | null
  url: string | null
  applicationId: string | null
}
interface Deployment {
  id: string
  applicationId: string | null
  status: string | null
  createdAt: string | null
}
export interface CoolifySnapshot {
  checkedAt: string
  projects: Project[]
  environments: Environment[]
  resources: Resource[]
  deployments: Deployment[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

const isString = (value: unknown) => typeof value === 'string'
const isNullableString = (value: unknown) => value === null || isString(value)
const isNamed = (value: unknown) => isRecord(value) && isString(value.id) && isString(value.name)

function isSnapshot(value: unknown): value is CoolifySnapshot {
  if (!isRecord(value) || !isString(value.checkedAt)) return false
  return Array.isArray(value.projects) && value.projects.every(isNamed) &&
    Array.isArray(value.environments) && value.environments.every((item: unknown) =>
      isNamed(item) && isRecord(item) && isString(item.projectId)) &&
    Array.isArray(value.resources) && value.resources.every((item: unknown) =>
      isNamed(item) && isRecord(item) && ['application', 'service', 'database'].includes(String(item.type)) &&
      isNullableString(item.environmentId) && isNullableString(item.status) && isNullableString(item.url) &&
      isNullableString(item.applicationId)) &&
    Array.isArray(value.deployments) && value.deployments.every((item: unknown) =>
      isRecord(item) && isString(item.id) && isNullableString(item.applicationId) &&
      isNullableString(item.status) && isNullableString(item.createdAt))
}

export async function fetchCoolifySnapshot(signal?: AbortSignal, apiPath = '/api'): Promise<CoolifySnapshot> {
  const response = await fetch(`${apiPath}/coolify/discovery`, { signal, headers: { Accept: 'application/json' } })
  if (!response.ok) throw new Error(`Coolify discovery returned ${response.status}`)
  const body: unknown = await response.json()
  if (!isSnapshot(body)) throw new Error('Invalid Coolify discovery response')
  return body
}

function resourceStatus(value: string | null): Status {
  if (!value) return 'warn'
  if (value.includes('unhealthy') || value.includes('failed') || value.includes('error')) return 'critical'
  if (value.startsWith('exited') || value.startsWith('stopped')) return 'offline'
  if (value.startsWith('running') && !value.includes('starting')) return 'ok'
  return 'warn'
}

export function coolifyNodes(snapshot: CoolifySnapshot): NodeInput[] {
  const projects = new Map(snapshot.projects.map((project) => [project.id, project]))
  const environments = new Map(snapshot.environments.map((environment) => [environment.id, environment]))
  const applications = new Map(snapshot.resources.flatMap((resource) =>
    resource.type === 'application' && resource.applicationId ? [[resource.applicationId, resource] as const] : []))
  const activeByApplication = new Map<string, Deployment>()
  for (const deployment of snapshot.deployments) {
    if (!deployment.applicationId) continue
    const previous = activeByApplication.get(deployment.applicationId)
    if (!previous || (deployment.createdAt ?? '') > (previous.createdAt ?? '')) {
      activeByApplication.set(deployment.applicationId, deployment)
    }
  }
  const shared = { origin: 'discovered' as const, source: 'live' as const, sourceSystem: 'coolify' as const }
  const nodes: NodeInput[] = [
    { ...shared, id: 'coolify', name: 'Coolify', kind: 'coolify', layer: 'services', parentId: 'vps-web', status: 'ok', category: 'Coolify' },
    ...snapshot.projects.map((project): NodeInput => ({
      ...shared, id: `coolify-project-${project.id}`, name: project.name, kind: 'generic',
      layer: 'services', parentId: 'coolify', status: 'ok', category: 'Coolify project',
    })),
    ...snapshot.environments.map((environment): NodeInput => ({
      ...shared, id: `coolify-env-${environment.id}`, name: environment.name, kind: 'generic',
      layer: 'services', parentId: `coolify-project-${environment.projectId}`, status: 'ok', category: 'Coolify environment',
    })),
  ]
  for (const resource of snapshot.resources) {
    const environment = resource.environmentId ? environments.get(resource.environmentId) : undefined
    const project = environment ? projects.get(environment.projectId) : undefined
    const deployment = resource.applicationId ? activeByApplication.get(resource.applicationId) : undefined
    const health = resourceStatus(resource.status)
    nodes.push({
      ...shared, id: `coolify-resource-${resource.id}`, name: resource.name, kind: 'generic',
      layer: resource.type === 'application' ? 'applications' : 'services',
      parentId: environment ? `coolify-env-${environment.id}` : 'coolify',
      status: health === 'ok' && deployment?.status?.includes('fail') ? 'warn' : health,
      category: `Coolify ${resource.type}`,
      projectName: project?.name, environmentName: environment?.name,
      currentStatus: resource.status ?? undefined, publicUrl: resource.url ?? undefined,
      deploymentStatus: deployment?.status ?? undefined, deploymentTime: deployment?.createdAt ?? undefined,
    })
  }
  for (const deployment of snapshot.deployments) {
    const app = deployment.applicationId ? applications.get(deployment.applicationId) : undefined
    nodes.push({
      ...shared, id: `coolify-deployment-${deployment.id}`, name: `Deployment ${deployment.id}`,
      kind: 'generic', layer: 'applications',
      parentId: app ? `coolify-resource-${app.id}` : 'coolify',
      status: deployment.status?.includes('fail') ? 'critical' : 'warn',
      category: 'Coolify deployment', currentStatus: deployment.status ?? undefined,
      deploymentTime: deployment.createdAt ?? undefined,
    })
  }
  return nodes
}

export function createCoolifyIntegration(): Integration {
  let known = new Set<string>()
  return {
    id: 'coolify', name: 'Coolify', description: 'Despliegues y recursos', feeds: 'services',
    async ping() {
      try { await fetchCoolifySnapshot(); return true } catch { return false }
    },
    async discover(): Promise<DiscoveryResult> {
      const nodes = coolifyNodes(await fetchCoolifySnapshot())
      const ids = new Set(nodes.map((node) => node.id))
      const removed = [...known].filter((id) => !ids.has(id))
      known = ids
      return { nodes, removed }
    },
  }
}

export const coolifyIntegration = createCoolifyIntegration()
