import { createBrowserRouter, Link, RouterProvider, ScrollRestoration, Outlet } from 'react-router-dom'
import { PublicLayout } from '@/modules/public_site/PublicLayout'
import { HomePage } from '@/modules/public_site/HomePage'
import { LegalPage } from '@/modules/public_site/LegalPage'
import { FaqPage } from '@/modules/public_site/FaqPage'
import { ContactPage } from '@/modules/public_site/ContactPage'
import { SignUpPage } from '@/modules/auth/SignUpPage'
import { SignInPage } from '@/modules/auth/SignInPage'
import { ForgotPasswordPage } from '@/modules/auth/ForgotPasswordPage'
import { ResetPasswordPage } from '@/modules/auth/ResetPasswordPage'
import { AppLayout } from '@/components/AppLayout'
import { DashboardPage } from '@/modules/owner/DashboardPage'
import { RegisterMotorcyclePage } from '@/modules/owner/RegisterMotorcyclePage'
import { MotorcyclePage } from '@/modules/owner/MotorcyclePage'
import { TimelinePage } from '@/modules/maintenance/TimelinePage'
import { RecordFormPage } from '@/modules/maintenance/RecordFormPage'
import { DiaryPage } from '@/modules/diary/DiaryPage'
import { DiaryFormPage } from '@/modules/diary/DiaryFormPage'
import { PublicPassportPage } from '@/modules/sharing/PublicPassportPage'
import { SharedPassportPage } from '@/modules/sharing/SharedPassportPage'
import { WorkshopIndexPage } from '@/modules/workshop/WorkshopIndexPage'
import { CreateWorkshopPage } from '@/modules/workshop/CreateWorkshopPage'
import { WorkshopDashboardPage } from '@/modules/workshop/WorkshopDashboardPage'
import { WorkshopProfilePage } from '@/modules/workshop/WorkshopProfilePage'
import { TeamPage } from '@/modules/workshop/TeamPage'
import { WorkshopMotoPage, WorkshopServiceFormPage } from '@/modules/workshop_service/WorkshopMotoPage'
import { PreviousDiaryPage } from '@/modules/transfers/PreviousDiaryPage'
import { InvitePage } from '@/modules/workshop/InvitePage'
import { PublicWorkshopPage } from '@/modules/workshop/PublicWorkshopPage'
import { RequireAdmin } from '@/modules/admin/RequireAdmin'
import { AdminDashboardPage } from '@/modules/admin/AdminDashboardPage'
import { AdminPlansPage } from '@/modules/admin/AdminPlansPage'
import { AdminPaymentsPage } from '@/modules/admin/AdminPaymentsPage'
import { AdminSubscriptionsPage } from '@/modules/admin/AdminSubscriptionsPage'
import { MyPlanPage } from '@/modules/plans/MyPlanPage'
import { ReceiptPage } from '@/modules/plans/ReceiptPage'
import { ReportPage } from '@/modules/reports/ReportPage'
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
          { path: '/perguntas-frequentes', element: <FaqPage /> },
          { path: '/contato', element: <ContactPage /> },
          { path: '/criar-conta', element: <SignUpPage /> },
          { path: '/entrar', element: <SignInPage /> },
          { path: '/recuperar-senha', element: <ForgotPasswordPage /> },
          { path: '/redefinir-senha', element: <ResetPasswordPage /> },
          { path: '/termos', element: <LegalPage kind="terms" /> },
          { path: '/privacidade', element: <LegalPage kind="privacy" /> },
          { path: '/p/:publicId', element: <PublicPassportPage /> },
          { path: '/c/:token', element: <SharedPassportPage /> },
          { path: '/oficinas/:slug', element: <PublicWorkshopPage /> },
          { path: '*', element: <NotFoundPage /> },
        ],
      },
      {
        element: (
          <RequireAuth>
            <AppLayout />
          </RequireAuth>
        ),
        children: [
          { path: '/painel', element: <DashboardPage /> },
          { path: '/painel/motos/nova', element: <RegisterMotorcyclePage /> },
          { path: '/painel/plano', element: <MyPlanPage /> },
          { path: '/painel/plano/recibo/:id', element: <ReceiptPage /> },
          { path: '/painel/motos/:id', element: <MotorcyclePage /> },
          { path: '/painel/motos/:id/historico', element: <TimelinePage /> },
          { path: '/painel/motos/:id/relatorio', element: <ReportPage /> },
          { path: '/painel/motos/:id/historico/novo', element: <RecordFormPage /> },
          { path: '/painel/motos/:id/diario', element: <DiaryPage /> },
          { path: '/painel/motos-anteriores/:id', element: <PreviousDiaryPage /> },
          { path: '/painel/motos/:id/diario/novo', element: <DiaryFormPage /> },
          { path: '/painel/motos/:id/diario/:entryId/editar', element: <DiaryFormPage /> },
          { path: '/oficina', element: <WorkshopIndexPage /> },
          { path: '/oficina/nova', element: <CreateWorkshopPage /> },
          { path: '/oficina/:orgId', element: <WorkshopDashboardPage /> },
          { path: '/oficina/:orgId/perfil', element: <WorkshopProfilePage /> },
          { path: '/oficina/:orgId/equipe', element: <TeamPage /> },
          { path: '/oficina/:orgId/motos/:motoId', element: <WorkshopMotoPage /> },
          { path: '/oficina/:orgId/motos/:motoId/servico', element: <WorkshopServiceFormPage /> },
          { path: '/convite/:token', element: <InvitePage /> },
          {
            path: '/admin',
            element: (
              <RequireAdmin>
                <AdminDashboardPage />
              </RequireAdmin>
            ),
          },
          {
            path: '/admin/planos',
            element: (
              <RequireAdmin>
                <AdminPlansPage />
              </RequireAdmin>
            ),
          },
          {
            path: '/admin/pagamentos',
            element: (
              <RequireAdmin>
                <AdminPaymentsPage />
              </RequireAdmin>
            ),
          },
          {
            path: '/admin/assinaturas',
            element: (
              <RequireAdmin>
                <AdminSubscriptionsPage />
              </RequireAdmin>
            ),
          },
        ],
      },
    ],
  },
]

const router = createBrowserRouter(routes)

export function App() {
  return <RouterProvider router={router} />
}
