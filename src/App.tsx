import { lazy } from 'react'
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
import { RequireAdmin } from '@/modules/admin/RequireAdmin'
import { RequireAuth } from '@/core/auth/RequireAuth'

// Páginas carregadas sob demanda (KI-010): o site público abre sem baixar painel, oficina e admin.
const DashboardPage = lazy(() => import('@/modules/owner/DashboardPage').then((m) => ({ default: m.DashboardPage })))
const RegisterMotorcyclePage = lazy(() => import('@/modules/owner/RegisterMotorcyclePage').then((m) => ({ default: m.RegisterMotorcyclePage })))
const MotorcyclePage = lazy(() => import('@/modules/owner/MotorcyclePage').then((m) => ({ default: m.MotorcyclePage })))
const TimelinePage = lazy(() => import('@/modules/maintenance/TimelinePage').then((m) => ({ default: m.TimelinePage })))
const RecordFormPage = lazy(() => import('@/modules/maintenance/RecordFormPage').then((m) => ({ default: m.RecordFormPage })))
const DiaryPage = lazy(() => import('@/modules/diary/DiaryPage').then((m) => ({ default: m.DiaryPage })))
const DiaryFormPage = lazy(() => import('@/modules/diary/DiaryFormPage').then((m) => ({ default: m.DiaryFormPage })))
const PublicPassportPage = lazy(() => import('@/modules/sharing/PublicPassportPage').then((m) => ({ default: m.PublicPassportPage })))
const SharedPassportPage = lazy(() => import('@/modules/sharing/SharedPassportPage').then((m) => ({ default: m.SharedPassportPage })))
const WorkshopIndexPage = lazy(() => import('@/modules/workshop/WorkshopIndexPage').then((m) => ({ default: m.WorkshopIndexPage })))
const CreateWorkshopPage = lazy(() => import('@/modules/workshop/CreateWorkshopPage').then((m) => ({ default: m.CreateWorkshopPage })))
const WorkshopDashboardPage = lazy(() => import('@/modules/workshop/WorkshopDashboardPage').then((m) => ({ default: m.WorkshopDashboardPage })))
const WorkshopProfilePage = lazy(() => import('@/modules/workshop/WorkshopProfilePage').then((m) => ({ default: m.WorkshopProfilePage })))
const TeamPage = lazy(() => import('@/modules/workshop/TeamPage').then((m) => ({ default: m.TeamPage })))
const WorkshopMotoPage = lazy(() => import('@/modules/workshop_service/WorkshopMotoPage').then((m) => ({ default: m.WorkshopMotoPage })))
const WorkshopServiceFormPage = lazy(() => import('@/modules/workshop_service/WorkshopMotoPage').then((m) => ({ default: m.WorkshopServiceFormPage })))
const PreviousDiaryPage = lazy(() => import('@/modules/transfers/PreviousDiaryPage').then((m) => ({ default: m.PreviousDiaryPage })))
const InvitePage = lazy(() => import('@/modules/workshop/InvitePage').then((m) => ({ default: m.InvitePage })))
const PublicWorkshopPage = lazy(() => import('@/modules/workshop/PublicWorkshopPage').then((m) => ({ default: m.PublicWorkshopPage })))
const AdminDashboardPage = lazy(() => import('@/modules/admin/AdminDashboardPage').then((m) => ({ default: m.AdminDashboardPage })))
const AdminPlansPage = lazy(() => import('@/modules/admin/AdminPlansPage').then((m) => ({ default: m.AdminPlansPage })))
const AdminPaymentsPage = lazy(() => import('@/modules/admin/AdminPaymentsPage').then((m) => ({ default: m.AdminPaymentsPage })))
const AdminSubscriptionsPage = lazy(() => import('@/modules/admin/AdminSubscriptionsPage').then((m) => ({ default: m.AdminSubscriptionsPage })))
const AdminUsersPage = lazy(() => import('@/modules/admin/AdminUsersPage').then((m) => ({ default: m.AdminUsersPage })))
const AdminSettingsPage = lazy(() => import('@/modules/admin/AdminSettingsPage').then((m) => ({ default: m.AdminSettingsPage })))
const AdminAuditPage = lazy(() => import('@/modules/admin/AdminAuditPage').then((m) => ({ default: m.AdminAuditPage })))
const AdminClaimsPage = lazy(() => import('@/modules/admin/AdminClaimsPage').then((m) => ({ default: m.AdminClaimsPage })))
const AdminStoragePage = lazy(() => import('@/modules/admin/AdminStoragePage').then((m) => ({ default: m.AdminStoragePage })))
const AccountPage = lazy(() => import('@/modules/account/AccountPage').then((m) => ({ default: m.AccountPage })))
const AdminPrivacyPage = lazy(() => import('@/modules/admin/AdminPrivacyPage').then((m) => ({ default: m.AdminPrivacyPage })))
const NotificationsPage = lazy(() => import('@/modules/notifications/NotificationsPage').then((m) => ({ default: m.NotificationsPage })))
const AdminWorkshopsPage = lazy(() => import('@/modules/admin/AdminWorkshopsPage').then((m) => ({ default: m.AdminWorkshopsPage })))
const MyPlanPage = lazy(() => import('@/modules/plans/MyPlanPage').then((m) => ({ default: m.MyPlanPage })))
const ReceiptPage = lazy(() => import('@/modules/plans/ReceiptPage').then((m) => ({ default: m.ReceiptPage })))
const ReportPage = lazy(() => import('@/modules/reports/ReportPage').then((m) => ({ default: m.ReportPage })))

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
          { path: '/painel/notificacoes', element: <NotificationsPage /> },
          { path: '/painel/conta', element: <AccountPage /> },
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
          {
            path: '/admin/usuarios',
            element: (
              <RequireAdmin>
                <AdminUsersPage />
              </RequireAdmin>
            ),
          },
          {
            path: '/admin/oficinas',
            element: (
              <RequireAdmin>
                <AdminWorkshopsPage />
              </RequireAdmin>
            ),
          },
          {
            path: '/admin/configuracoes',
            element: (
              <RequireAdmin>
                <AdminSettingsPage />
              </RequireAdmin>
            ),
          },
          {
            path: '/admin/auditoria',
            element: (
              <RequireAdmin>
                <AdminAuditPage />
              </RequireAdmin>
            ),
          },
          {
            path: '/admin/privacidade',
            element: (
              <RequireAdmin>
                <AdminPrivacyPage />
              </RequireAdmin>
            ),
          },
          {
            path: '/admin/verificacoes',
            element: (
              <RequireAdmin>
                <AdminClaimsPage />
              </RequireAdmin>
            ),
          },
          {
            path: '/admin/armazenamento',
            element: (
              <RequireAdmin>
                <AdminStoragePage />
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
