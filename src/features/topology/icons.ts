import type { ComponentType } from 'react'
import {
  Box,
  Circle,
  Container,
  Cpu,
  Database,
  FlaskConical,
  Gauge,
  HeartPulse,
  MonitorPlay,
  Rocket,
  Server,
  ClipboardList,
  Tv,
  type LucideProps,
} from 'lucide-react'
import type { NodeKind } from '@/types'

export const kindIcons: Record<NodeKind, ComponentType<LucideProps>> = {
  vps: Cpu,
  proxmox: Server,
  docker: Container,
  container: Box,
  coolify: Rocket,
  grafana: Gauge,
  uptime: HeartPulse,
  postgres: Database,
  sgs: ClipboardList,
  wallboard: MonitorPlay,
  labscreen: Tv,
  lab: FlaskConical,
  generic: Circle,
}
