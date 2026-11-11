export const threatEvents = [
  { severity: 'HIGH', time: '09:42:18', source: '198.51.100.24', status: 'Blocked', event: 'SSH brute force' },
  { severity: 'MEDIUM', time: '09:38:05', source: '203.0.113.17', status: 'Investigating', event: 'Port scan detected' },
  { severity: 'HIGH', time: '09:21:43', source: 'Identity service', status: 'Open', event: 'Login anomaly' },
  { severity: 'LOW', time: '09:12:09', source: 'Threat intelligence', status: 'Correlated', event: 'Indicator matched' },
  { severity: 'MEDIUM', time: '08:57:30', source: '192.0.2.61', status: 'Blocked', event: 'Suspicious requests' },
] as const

export const incidents = [
  { id: 'INC-2026-001', name: 'SSH Brute Force', severity: 'HIGH', status: 'Investigating', asset: 'VPS-WEB' },
  { id: 'INC-2026-002', name: 'Port Scan Activity', severity: 'MEDIUM', status: 'Open', asset: 'Edge gateway' },
  { id: 'INC-2026-003', name: 'Abnormal Authentication', severity: 'HIGH', status: 'Open', asset: 'Identity service' },
] as const

export const topology = [
  { id: 'pve', label: 'Proxmox Node', x: 400, y: 35, category: 'Infrastructure' },
  { id: 'vm', label: 'VM · VPS-WEB', x: 400, y: 120, category: 'Virtual machine' },
  { id: 'storage', label: 'Storage', x: 125, y: 120, category: 'Storage' },
  { id: 'network', label: 'Network', x: 675, y: 120, category: 'Network' },
  { id: 'docker', label: 'Docker', x: 250, y: 205, category: 'Container runtime' },
  { id: 'coolify', label: 'Coolify', x: 550, y: 205, category: 'Platform' },
  { id: 'app', label: 'Applications', x: 300, y: 290, category: 'Applications' },
  { id: 'db', label: 'Database', x: 530, y: 290, category: 'Data service' },
  { id: 'lab', label: 'Laboratories', x: 675, y: 290, category: 'Laboratory' },
] as const
export const topologyEdges = [['pve', 'vm'], ['pve', 'storage'], ['pve', 'network'], ['vm', 'docker'], ['vm', 'coolify'], ['docker', 'app'], ['coolify', 'app'], ['docker', 'db'], ['network', 'lab'], ['app', 'lab']] as const
