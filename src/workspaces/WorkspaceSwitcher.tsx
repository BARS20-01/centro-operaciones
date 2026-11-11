import { ChevronDown, Command, Check } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useWorkspace } from './workspace-context'
import { WORKSPACES } from './workspace'

export function WorkspaceSwitcher() {
  const { workspace, setWorkspace } = useWorkspace()
  const navigate = useNavigate()
  const menu = useRef<HTMLDetailsElement>(null)
  const current = WORKSPACES.find((option) => option.id === workspace)!

  useEffect(() => {
    const dismiss = (event: PointerEvent) => {
      if (event.target instanceof Node && !menu.current?.contains(event.target) && menu.current) menu.current.open = false
    }
    document.addEventListener('pointerdown', dismiss)
    return () => document.removeEventListener('pointerdown', dismiss)
  }, [])

  return (
    <details ref={menu} className="workspace-command relative" onKeyDown={(event) => {
      if (event.key === 'Escape' && menu.current?.open) {
        menu.current.open = false
        menu.current.querySelector('summary')?.focus()
      }
    }}>
      <summary className="workspace-command-trigger" aria-label={`Workspace: ${current.name}`}>
        <Command aria-hidden="true" size={15} />
        <span className="workspace-command-label"><small>WORKSPACE</small><strong>{current.name}</strong></span>
        <ChevronDown aria-hidden="true" size={14} className="workspace-command-chevron" />
      </summary>
      <div className="workspace-command-menu" aria-label="Select workspace">
        <div className="workspace-command-heading">OPERATIONAL PERSPECTIVES <span>06</span></div>
        {WORKSPACES.map((option, index) => (
          <button key={option.id} type="button" className="workspace-command-option" aria-current={option.id === workspace ? 'true' : undefined}
            onClick={() => {
              setWorkspace(option.id)
              if (menu.current) menu.current.open = false
              void navigate('/')
              menu.current?.querySelector('summary')?.focus()
            }}>
            <span className="workspace-command-number">0{index + 1}</span><span>{option.name}</span>
            {option.id === workspace && <Check size={14} aria-hidden="true" />}
          </button>
        ))}
        <div className="workspace-command-footer">ONE PLATFORM / MULTIPLE PERSPECTIVES</div>
      </div>
    </details>
  )
}
