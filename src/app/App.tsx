import { lazy, Suspense } from 'react'
import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import { AppLayout } from '@/layouts/AppLayout'

const DashboardPage = lazy(() => import('@/pages/DashboardPage'))
const SystemDiagnosticsPage = lazy(() => import('@/pages/SystemDiagnosticsPage'))
const NotFoundPage = lazy(() => import('@/pages/NotFoundPage'))

const router = createBrowserRouter([
  {
    path: '/',
    element: <AppLayout />,
    children: [
      { index: true, element: <DashboardPage /> },
      { path: 'diagnostics', element: <SystemDiagnosticsPage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
])

export default function App() {
  return (
    <Suspense fallback={<div className="p-6 text-neon">Inicializando…</div>}>
      <RouterProvider router={router} />
    </Suspense>
  )
}
