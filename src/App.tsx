import { lazy, Suspense, useEffect } from 'react'
import { createBrowserRouter, Link, RouterProvider, ScrollRestoration, Outlet, useRouteError } from 'react-router-dom'
import { isStaleChunkError, reloadForNewVersion } from '@/core/shared/staleChunk'
import { PublicLayout } from '@/modules/public_site/PublicLayout'
import { HomePage } from '@/modules/public_site/HomePage'
import { LegalPage } from '@/modules/public_site/LegalPage'
import { FaqPage } from '@/modules/public_site/FaqPage'
import { ContactPage } from '@/modules/public_site/ContactPage'
import { InstallPage } from '@/modules/public_site/InstallPage'
import { UpdateBanner } from '@/core/pwa/PwaBanners'
import { SignUpPage } from '@/modules/auth/SignUpPage'
import { SignInPage } from '@/modules/auth/SignInPage'
import { ForgotPasswordPage } from '@/modules/auth/ForgotPasswordPage'
import { ResetPasswordPage } from '@/modules/auth/ResetPasswordPage'
import { AppLayout } from '@/components/AppLayout'
import { Button } from '@/components/Button'
import { RequireAdmin } from '@/modules/admin/RequireAdmin'
import { RequireAuth } from '@/core/auth/RequireAuth'

// Páginas carregadas sob demanda (KI-010): o site público abre sem baixar painel, oficina e admin.
const DashboardPage = lazy(() => import('@/modules/owner/DashboardPage').then((m) => ({ default: m.DashboardPage })))
const RegisterMotorcyclePage = lazy(() => import('@/modules/owner/RegisterMotorcyclePage').then((m) => ({ default: m.RegisterMotorcyclePage })))
const CheckupPage = lazy(() => import('@/modules/owner/CheckupPage').then((m) => ({ default: m.CheckupPage })))
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
const WorkshopShellRoute = lazy(() => import('@/modules/workshop/shared/WorkshopShell').then((m) => ({ default: m.ShellRoute })))
const QuotesPage = lazy(() => import('@/modules/workshop/quotes/QuotesPage').then((m) => ({ default: m.QuotesPage })))
const NewQuotePage = lazy(() => import('@/modules/workshop/quotes/QuotesPage').then((m) => ({ default: m.NewQuotePage })))
const QuotePage = lazy(() => import('@/modules/workshop/quotes/QuotePage').then((m) => ({ default: m.QuotePage })))
const CustomersPage = lazy(() => import('@/modules/workshop/customers/CustomersPage').then((m) => ({ default: m.CustomersPage })))
const NewCustomerPage = lazy(() => import('@/modules/workshop/customers/CustomersPage').then((m) => ({ default: m.NewCustomerPage })))
const VehiclesPage = lazy(() => import('@/modules/workshop/customers/CustomersPage').then((m) => ({ default: m.VehiclesPage })))
const CustomerPage = lazy(() => import('@/modules/workshop/customers/CustomerPage').then((m) => ({ default: m.CustomerPage })))
const CatalogPage = lazy(() => import('@/modules/workshop/service-catalog/CatalogPage').then((m) => ({ default: m.CatalogPage })))
const OrdersPage = lazy(() => import('@/modules/workshop/service-orders/OrdersPage').then((m) => ({ default: m.OrdersPage })))
const NewOrderPage = lazy(() => import('@/modules/workshop/service-orders/OrdersPage').then((m) => ({ default: m.NewOrderPage })))
const OrderPage = lazy(() => import('@/modules/workshop/service-orders/OrderPage').then((m) => ({ default: m.OrderPage })))
const OrderPublicPage = lazy(() => import('@/modules/workshop/service-orders/OrderPublicPage').then((m) => ({ default: m.OrderPublicPage })))
const PartsPage = lazy(() => import('@/modules/workshop/management/PartsPage').then((m) => ({ default: m.PartsPage })))
const AgendaPage = lazy(() => import('@/modules/workshop/management/AgendaPage').then((m) => ({ default: m.AgendaPage })))
const FinancePage = lazy(() => import('@/modules/workshop/management/FinancePage').then((m) => ({ default: m.FinancePage })))
const ReportsPage = lazy(() => import('@/modules/workshop/management/ReportsPage').then((m) => ({ default: m.ReportsPage })))
const RelationshipPage = lazy(() => import('@/modules/workshop/management/RelationshipPage').then((m) => ({ default: m.RelationshipPage })))
const ReviewsPage = lazy(() => import('@/modules/workshop/growth/ReviewsPage').then((m) => ({ default: m.ReviewsPage })))
const CampaignsPage = lazy(() => import('@/modules/workshop/growth/CampaignsPage').then((m) => ({ default: m.CampaignsPage })))
const EsteiraPage = lazy(() => import('@/modules/workshop/flow/EsteiraPage').then((m) => ({ default: m.EsteiraPage })))
const NewEntryPage = lazy(() => import('@/modules/workshop/flow/NewEntryPage').then((m) => ({ default: m.NewEntryPage })))
const CaixaPage = lazy(() => import('@/modules/workshop/flow/CaixaPage').then((m) => ({ default: m.CaixaPage })))
const PistaLayout = lazy(() => import('@/modules/pista/PistaApp').then((m) => ({ default: m.PistaLayout })))
const PistaHomePage = lazy(() => import('@/modules/pista/PistaApp').then((m) => ({ default: m.PistaHomePage })))
const PistaOrderPage = lazy(() => import('@/modules/pista/PistaOrderPage').then((m) => ({ default: m.PistaOrderPage })))
const PistaInstallPage = lazy(() => import('@/modules/pista/PistaInstallPage').then((m) => ({ default: m.PistaInstallPage })))
const SpendingPage = lazy(() => import('@/modules/spending/SpendingPage').then((m) => ({ default: m.SpendingPage })))
const AllSpendingPage = lazy(() => import('@/modules/spending/SpendingPage').then((m) => ({ default: m.AllSpendingPage })))
const AdminReviewsPage = lazy(() => import('@/modules/admin/AdminReviewsPage').then((m) => ({ default: m.AdminReviewsPage })))
const ClaimPage = lazy(() => import('@/modules/customer_link/ClaimPage').then((m) => ({ default: m.ClaimPage })))
const MyRecordsPage = lazy(() => import('@/modules/customer_link/MyRecordsPage').then((m) => ({ default: m.MyRecordsPage })))
const QuoteApprovalPage = lazy(() => import('@/modules/workshop/quote-approval/QuoteApprovalPage').then((m) => ({ default: m.QuoteApprovalPage })))
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
      <UpdateBanner />
    </>
  )
}

/** Erro inesperado numa tela: versão nova publicada (recarrega sozinho) ou falha real (mensagem amigável). */
export function RouteErrorPage() {
  const error = useRouteError()
  const stale = isStaleChunkError(error)
  useEffect(() => {
    if (stale) reloadForNewVersion()
  }, [stale])
  return (
    <div className="mx-auto max-w-xl px-5 py-20" role="alert">
      <h1 className="heading text-3xl text-ink">{stale ? 'Atualizando o Moto Passaporte…' : 'Algo deu errado nesta tela'}</h1>
      <p className="mt-3 text-muted">
        {stale
          ? 'Publicamos uma versão nova. Se a página não recarregar sozinha, toque no botão abaixo.'
          : 'Tente recarregar a página. Se continuar, fale com o suporte pela página de contato.'}
      </p>
      <div className="mt-6 flex flex-wrap gap-4">
        <Button onClick={() => window.location.reload()}>Recarregar</Button>
        <Link to="/" className="self-center font-semibold text-ink underline underline-offset-4">Ir para o início</Link>
      </div>
    </div>
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
    errorElement: <RouteErrorPage />,
    children: [
      {
        // App da Pista (ADR-057): PWA do mecânico, com manifesto e login próprios.
        path: '/pista',
        element: <Suspense fallback={<p className="p-6 text-muted" role="status">Carregando…</p>}><PistaLayout /></Suspense>,
        children: [
          { index: true, element: <Suspense fallback={null}><PistaHomePage /></Suspense> },
          { path: 'os/:orderId', element: <Suspense fallback={null}><PistaOrderPage /></Suspense> },
          { path: ':code', element: <Suspense fallback={null}><PistaHomePage /></Suspense> },
        ],
      },
      {
        element: <PublicLayout />,
        children: [
          { path: '/', element: <HomePage /> },
          { path: '/perguntas-frequentes', element: <FaqPage /> },
          { path: '/contato', element: <ContactPage /> },
          { path: '/instalar', element: <InstallPage /> },
          { path: '/criar-conta', element: <SignUpPage /> },
          { path: '/entrar', element: <SignInPage /> },
          { path: '/recuperar-senha', element: <ForgotPasswordPage /> },
          { path: '/redefinir-senha', element: <ResetPasswordPage /> },
          { path: '/termos', element: <LegalPage kind="terms" /> },
          { path: '/privacidade', element: <LegalPage kind="privacy" /> },
          { path: '/p/:publicId', element: <PublicPassportPage /> },
          { path: '/c/:token', element: <SharedPassportPage /> },
          { path: '/oficinas/:slug', element: <PublicWorkshopPage /> },
          { path: '/orcamento/:token', element: <QuoteApprovalPage /> },
          { path: '/os/:token', element: <OrderPublicPage /> },
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
          { path: '/painel/atendimentos', element: <MyRecordsPage /> },
          { path: '/painel/vincular/:kind/:token', element: <ClaimPage /> },
          { path: '/painel/conta', element: <AccountPage /> },
          { path: '/painel/plano/recibo/:id', element: <ReceiptPage /> },
          { path: '/painel/motos/:id', element: <MotorcyclePage /> },
          { path: '/painel/motos/:id/checkup', element: <CheckupPage /> },
          { path: '/painel/motos/:id/historico', element: <TimelinePage /> },
          { path: '/painel/motos/:id/relatorio', element: <ReportPage /> },
          { path: '/painel/motos/:id/gastos', element: <SpendingPage /> },
          { path: '/painel/gastos', element: <AllSpendingPage /> },
          { path: '/painel/motos/:id/historico/novo', element: <RecordFormPage /> },
          { path: '/painel/motos/:id/diario', element: <DiaryPage /> },
          { path: '/painel/motos-anteriores/:id', element: <PreviousDiaryPage /> },
          { path: '/painel/motos/:id/diario/novo', element: <DiaryFormPage /> },
          { path: '/painel/motos/:id/diario/:entryId/editar', element: <DiaryFormPage /> },
          { path: '/oficina', element: <WorkshopIndexPage /> },
          { path: '/oficina/nova', element: <CreateWorkshopPage /> },
          { path: '/oficina/:orgId', element: <EsteiraPage /> },
          { path: '/oficina/:orgId/resultados', element: <WorkshopDashboardPage /> },
          { path: '/oficina/:orgId/caixa', element: <CaixaPage /> },
          { path: '/oficina/:orgId/entrada/nova', element: <NewEntryPage /> },
          { path: '/oficina/:orgId/perfil', element: <WorkshopShellRoute><WorkshopProfilePage /></WorkshopShellRoute> },
          { path: '/oficina/:orgId/equipe', element: <WorkshopShellRoute><TeamPage /></WorkshopShellRoute> },
          { path: '/oficina/:orgId/pista', element: <WorkshopShellRoute><PistaInstallPage /></WorkshopShellRoute> },
          { path: '/oficina/:orgId/orcamentos', element: <QuotesPage /> },
          { path: '/oficina/:orgId/orcamentos/novo', element: <NewQuotePage /> },
          { path: '/oficina/:orgId/orcamentos/:quoteId', element: <QuotePage /> },
          { path: '/oficina/:orgId/clientes', element: <CustomersPage /> },
          { path: '/oficina/:orgId/clientes/novo', element: <NewCustomerPage /> },
          { path: '/oficina/:orgId/clientes/:customerId', element: <CustomerPage /> },
          { path: '/oficina/:orgId/motos', element: <VehiclesPage /> },
          { path: '/oficina/:orgId/servicos', element: <CatalogPage /> },
          { path: '/oficina/:orgId/os', element: <OrdersPage /> },
          { path: '/oficina/:orgId/os/nova', element: <NewOrderPage /> },
          { path: '/oficina/:orgId/os/:orderId', element: <OrderPage /> },
          { path: '/oficina/:orgId/pecas', element: <PartsPage /> },
          { path: '/oficina/:orgId/agenda', element: <AgendaPage /> },
          { path: '/oficina/:orgId/financeiro', element: <FinancePage /> },
          { path: '/oficina/:orgId/relatorios', element: <ReportsPage /> },
          { path: '/oficina/:orgId/relacionamento', element: <RelationshipPage /> },
          { path: '/oficina/:orgId/avaliacoes', element: <ReviewsPage /> },
          { path: '/oficina/:orgId/campanhas', element: <CampaignsPage /> },
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
            path: '/admin/avaliacoes',
            element: (
              <RequireAdmin>
                <AdminReviewsPage />
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
