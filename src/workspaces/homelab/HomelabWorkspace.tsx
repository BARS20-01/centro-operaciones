import { Activity, Boxes, Database, HardDrive, Server, ShieldCheck } from 'lucide-react'
import { WorkspaceShell } from '../shared/WorkspaceUI'

const systems = [
  { icon: Server, label: 'Proxmox Cluster', value: '01', detail: 'Example node' },
  { icon: Boxes, label: 'VM Fleet', value: '02', detail: 'Example virtual machines' },
  { icon: Activity, label: 'Container Fleet', value: '12', detail: 'Example containers' },
  { icon: HardDrive, label: 'Storage', value: '71%', detail: 'Example utilization' },
  { icon: Database, label: 'Backups', value: '04', detail: 'Example restore points' },
  { icon: ShieldCheck, label: 'Health', value: 'NOMINAL', detail: 'Example status' },
] as const

export default function HomelabWorkspace() {
  return <WorkspaceShell variant="homelab" eyebrow="Homelab / mission control" title="Infrastructure Flight Deck" description="Escenario de misión simulado. No representa el estado real de Proxmox ni de sus cargas.">
    <div className="homelab-deck">
      <div className="homelab-console">
        <div className="homelab-caption"><span>MISSION SYSTEMS</span><span>SIM / 01</span></div>
        {systems.slice(0, 3).map(({ icon: Icon, label, value, detail }) => <div className="homelab-system" key={label}>
          <Icon aria-hidden="true" size={18} /><div><strong>{label}</strong><small>{detail}</small></div><b>{value}</b>
        </div>)}
      </div>
      <div className="homelab-viewport">
        <div className="homelab-caption"><span>FLEET OVERVIEW</span><span>SIMULATED SIGNAL</span></div>
        <div className="homelab-orbit" aria-hidden="true"><div className="homelab-orbit-ring" /><div className="homelab-orbit-ring ring-two" /><div className="homelab-core"><Server size={32} /><span>PROXMOX</span></div><i className="orbit-marker marker-one" /><i className="orbit-marker marker-two" /><i className="orbit-marker marker-three" /></div>
        <div className="homelab-legend"><span>01 / CLUSTER</span><span>02 / VM FLEET</span><span>03 / SERVICES</span></div>
      </div>
      <div className="homelab-console">
        <div className="homelab-caption"><span>FLIGHT TELEMETRY</span><span>SIM / 02</span></div>
        {systems.slice(3).map(({ icon: Icon, label, value, detail }) => <div className="homelab-system" key={label}>
          <Icon aria-hidden="true" size={18} /><div><strong>{label}</strong><small>{detail}</small></div><b>{value}</b>
        </div>)}
      </div>
    </div>
    <div className="homelab-ticker"><span>MISSION CONTROL</span><span>CLUSTER / VM / CONTAINERS / STORAGE / BACKUPS</span><span>ALL READINGS ARE EXAMPLES</span></div>
  </WorkspaceShell>
}
