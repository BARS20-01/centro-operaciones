import { dockerIntegration } from './docker.integration'
import { coolifyIntegration } from './coolify.integration'
import type { Integration, IntegrationId } from './types'

const placeholder = (
  id: IntegrationId,
  name: string,
  description: string,
  feeds: Integration['feeds'],
): Integration => ({
  id,
  name,
  description,
  feeds,
  // TODO: replace with a real adapter once the backend exists.
  ping: () => Promise.resolve(false),
})

export const integrations: Record<IntegrationId, Integration> = {
  proxmox: placeholder('proxmox', 'Proxmox VE', 'Hipervisor y VMs', 'infrastructure'),
  docker: dockerIntegration,
  coolify: coolifyIntegration,
  sgs: placeholder('sgs', 'SGS', 'Sistema de gestión', 'applications'),
  wallboard: placeholder('wallboard', 'Wallboard', 'Pantallas de visualización', 'applications'),
  labscreen: placeholder('labscreen', 'LabScreen', 'Pantallas de laboratorio', 'labs'),
}

export const integrationList = Object.values(integrations)
