import { createBrowserRouter, Link, RouterProvider, ScrollRestoration, Outlet } from 'react-router-dom'
import { PublicLayout } from '@/modules/public_site/PublicLayout'
import { HomePage } from '@/modules/public_site/HomePage'
import { LegalPage } from '@/modules/public_site/LegalPage'
import { SignUpPage } from '@/modules/auth/SignUpPage'
import { SignInPage } from '@/modules/auth/SignInPage'
import { ForgotPasswordPage } from '@/modules/auth/ForgotPasswordPage'
import { ResetPasswordPage } from '@/modules/auth/ResetPasswordPage'
import { OwnerLayout } from '@/modules/owner/OwnerLayout'
import { DashboardPage } from '@/modules/owner/DashboardPage'
import { RegisterMotorcyclePage } from '@/modules/owner/RegisterMotorcyclePage'
import { MotorcyclePage } from '@/modules/owner/MotorcyclePage'
import { PublicPassportPage } from '@/modules/sharing/PublicPassportPage'
import { RequireAuth } from '@/core/auth/RequireAuth'

function Root() {
  return (
    <>
      <ScrollRestoration />
      <Outlet />
    </>
  )
}

function NotFoundPage() {
  return (
    <div className="mx-auto max-w-xl px-5 py-20">
      <h1 className="heading text-3xl text-ink">Página não encontrada</h1>
      <p className="mt-3 text-muted">O endereço pode estar errado ou a página foi removida.</p>
      <Link to="/" className="mt-6 inline-block font-semibold text-ink underline underline-offset-4">Ir para o início</Link>
    </div>
  )
}

export const routes = [
  {
    element: <Root />,
    children: [
      {
        element: <PublicLayout />,
        children: [
          { path: '/', element: <HomePage /> },
          { path: '/criar-conta', element: <SignUpPage /> },
          { path: '/entrar', element: <SignInPage /> },
          { path: '/recuperar-senha', element: <ForgotPasswordPage /> },
          { path: '/redefinir-senha', element: <ResetPasswordPage /> },
          { path: '/termos', element: <LegalPage kind="terms" /> },
          { path: '/privacidade', element: <LegalPage kind="privacy" /> },
          { path: '/p/:publicId', element: <PublicPassportPage /> },
          { path: '*', element: <NotFoundPage /> },
        ],
      },
      {
        path: '/painel',
        element: (
          <RequireAuth>
            <OwnerLayout />
          </RequireAuth>
        ),
        children: [
          { index: true, element: <DashboardPage /> },
          { path: 'motos/nova', element: <RegisterMotorcyclePage /> },
          { path: 'motos/:id', element: <MotorcyclePage /> },
        ],
      },
    ],
  },
]

const router = createBrowserRouter(routes)

export function App() {
  return <RouterProvider router={router} />
}
