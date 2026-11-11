import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './app/App'
import { ThemeProvider } from './features/theme/ThemeProvider'
import { WorkspaceProvider } from './workspaces/WorkspaceProvider'
import './styles/index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <WorkspaceProvider><App /></WorkspaceProvider>
    </ThemeProvider>
  </StrictMode>,
)
