import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/Button'
import { SelectField, TextAreaField, TextField } from '@/components/Field'
import { Notice } from '@/components/Notice'
import { PageHeader } from '@/components/AppLayout'
import { translateDbError } from '@/core/shared/dbErrors'
import { Card, EmptyState, StatusChip, WorkshopShell } from '../shared/WorkshopShell'
import { formatDateTime } from '../shared/rpc'
import { formatDay } from '../management/api'
import { ContactButton } from '../management/widgets'
import {
  AUDIENCE_LABEL, OPT_OUT_FOOTER, campaignRecipients, campaignText, closeCampaign, listCampaigns, saveCampaign, setMarketingOptOut,
  type Audience, type Campaign,
} from './api'

type Err = { code?: string; message?: string }
const AUDIENCES: Audience[] = ['inactive', 'reminders', 'brand', 'all']

/**
 * Campanhas de relacionamento (PRD 2.1 Fase 5): a oficina escolhe o público e a mensagem; a equipe abre o WhatsApp
 * de cada cliente com o texto pronto. Sem envio em massa; quem pediu para não receber fica de fora.
 */
export function CampaignsPage() {
  return <WorkshopShell>{({ orgId, shop, perms }) => <CampaignsView orgId={orgId} workshopName={shop.business_name} canEdit={perms.manage_quotes} />}</WorkshopShell>
}

function CampaignsView({ orgId, workshopName, canEdit }: { orgId: string; workshopName: string; canEdit: boolean }) {
  const qc = useQueryClient()
  const q = useQuery({ queryKey: ['ws-campaigns', orgId], queryFn: () => listCampaigns(orgId) })
  const [form, setForm] = useState<'new' | Campaign | null>(null)
  const [open, setOpen] = useState<string | null>(null)
  const refresh = () => qc.invalidateQueries({ queryKey: ['ws-campaigns', orgId] })

  return (
    <div>
      <PageHeader title="Campanhas"
        intro="Mensagens de relacionamento para grupos de clientes: quem sumiu, quem tem lembrete aberto, donos de uma marca. Você abre o WhatsApp de cada um com o texto pronto."
        actions={canEdit && form === null && <Button onClick={() => setForm('new')}>Nova campanha</Button>} />
      <div className="mt-4 max-w-3xl"><Notice tone="info">Toda mensagem leva a opção de sair. Se o cliente pedir, marque "Não quer receber": ele some das campanhas, mas continua recebendo avisos do próprio serviço.</Notice></div>
      {form && (
        <Card className="mt-6" title={form === 'new' ? 'Nova campanha' : 'Editar campanha'}>
          <CampaignForm orgId={orgId} workshopName={workshopName} campaign={form === 'new' ? undefined : form}
            onDone={async (id) => { await refresh(); setForm(null); setOpen(id) }} onCancel={() => setForm(null)} />
        </Card>
      )}
      {q.isLoading && <p className="mt-6 text-muted" role="status">Carregando…</p>}
      {q.isError && <div className="mt-6"><Notice tone="error">{translateDbError(q.error as Err)}</Notice></div>}
      {q.data && q.data.length === 0 && !form && (
        <div className="mt-6"><EmptyState title="Nenhuma campanha" action={canEdit && <Button onClick={() => setForm('new')}>Criar a primeira</Button>}>
          Ex.: "Revisão antes das férias" para clientes que não aparecem há 6 meses.
        </EmptyState></div>
      )}
      <div className="mt-6 flex flex-col gap-4">
        {(q.data ?? []).map((c) => (
          <Card key={c.id}
            title={<span className="flex flex-wrap items-center gap-2">{c.name}
              <StatusChip className={c.status === 'active' ? 'border-emerald-300 bg-emerald-50 text-emerald-900' : 'border-rule bg-paper text-muted'}>{c.status === 'active' ? 'Ativa' : 'Encerrada'}</StatusChip></span>}
            actions={<>
              <Button size="sm" variant="secondary" onClick={() => setOpen(open === c.id ? null : c.id)}>{open === c.id ? 'Fechar lista' : 'Ver clientes'}</Button>
              {canEdit && c.status === 'active' && <>
                <Button size="sm" variant="quiet" onClick={() => setForm(c)}>Editar</Button>
                <Button size="sm" variant="quiet" onClick={async () => { await closeCampaign(orgId, c.id); await refresh() }}>Encerrar</Button>
              </>}
            </>}>
            <p className="text-sm text-muted">
              {AUDIENCE_LABEL[c.audience]}{c.audience === 'inactive' ? ` (${c.audience_days} dias)` : ''}{c.audience === 'brand' ? `: ${c.audience_brand}` : ''}
              {' · '}{c.contacted_count ?? 0} de {c.audience_count ?? 0} contatados · criada em {formatDay(c.created_at)}
            </p>
            <p className="mt-2 whitespace-pre-line rounded-doc border border-rule bg-paper/60 p-3 text-sm text-graphite">{c.message}</p>
            {open === c.id && <Recipients orgId={orgId} campaign={c} workshopName={workshopName} canEdit={canEdit} onChanged={refresh} />}
          </Card>
        ))}
      </div>
    </div>
  )
}

function CampaignForm({ orgId, workshopName, campaign, onDone, onCancel }: {
  orgId: string; workshopName: string; campaign?: Campaign; onDone: (id: string) => Promise<void>; onCancel: () => void
}) {
  const [v, setV] = useState({
    name: campaign?.name ?? '', audience: campaign?.audience ?? ('inactive' as Audience), days: String(campaign?.audience_days ?? 180),
    brand: campaign?.audience_brand ?? '', message: campaign?.message ?? 'Olá, {nome}! Aqui é da {oficina}. Faz um tempo que {moto} não passa por aqui. Que tal uma revisão? Respondendo esta mensagem a gente já marca um horário.',
  })
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  async function submit(e: FormEvent) {
    e.preventDefault()
    if (v.name.trim().length < 2) return setError('Dê um nome à campanha.')
    if (v.message.trim().length < 10) return setError('Escreva a mensagem.')
    if (v.audience === 'brand' && v.brand.trim().length < 2) return setError('Informe a marca.')
    if (v.audience === 'inactive' && (!/^\d+$/.test(v.days) || Number(v.days) < 30 || Number(v.days) > 1095)) return setError('Tempo sem voltar entre 30 e 1095 dias.')
    setBusy(true)
    setError(null)
    try {
      const id = await saveCampaign(orgId, campaign?.id ?? null, { name: v.name.trim(), audience: v.audience, audience_days: Number(v.days), audience_brand: v.brand.trim(), message: v.message.trim() })
      await onDone(id)
    } catch (err) {
      setError(translateDbError(err as Err))
    } finally {
      setBusy(false)
    }
  }
  return (
    <form onSubmit={submit} noValidate className="grid gap-4 lg:grid-cols-2">
      <div className="flex flex-col gap-4">
        <TextField label="Nome da campanha" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} placeholder="Revisão antes das férias" />
        <SelectField label="Para quem" value={v.audience} options={AUDIENCES} optionLabel={(o) => AUDIENCE_LABEL[o as Audience]} onChange={(e) => setV({ ...v, audience: e.target.value as Audience })} />
        {v.audience === 'inactive' && <TextField label="Sem voltar há (dias)" value={v.days} onChange={(e) => setV({ ...v, days: e.target.value })} inputMode="numeric" />}
        {v.audience === 'brand' && <TextField label="Marca da moto" value={v.brand} onChange={(e) => setV({ ...v, brand: e.target.value })} placeholder="Honda" />}
        <TextAreaField label="Mensagem" value={v.message} onChange={(e) => setV({ ...v, message: e.target.value })} rows={5} maxLength={1000}
          hint="Use {nome}, {oficina} e {moto}; o sistema troca por cada cliente." />
      </div>
      <div>
        <p className="text-sm font-semibold text-graphite">Como fica</p>
        <p className="mt-1.5 whitespace-pre-line rounded-doc border border-rule bg-paper/60 p-3 text-sm text-graphite">
          {campaignText(v.message, { customerName: 'Maria Souza', workshopName, vehicle: 'Honda CG 160' })}
        </p>
        <p className="mt-1 text-xs text-muted">"{OPT_OUT_FOOTER}" entra sempre no fim.</p>
      </div>
      {error && <div className="lg:col-span-2"><Notice tone="error">{error}</Notice></div>}
      <div className="flex gap-2 lg:col-span-2">
        <Button type="submit" size="sm" loading={busy}>Salvar campanha</Button>
        <Button type="button" size="sm" variant="secondary" onClick={onCancel}>Cancelar</Button>
      </div>
    </form>
  )
}

function Recipients({ orgId, campaign, workshopName, canEdit, onChanged }: { orgId: string; campaign: Campaign; workshopName: string; canEdit: boolean; onChanged: () => Promise<unknown> }) {
  const qc = useQueryClient()
  const key = ['ws-campaign-recipients', orgId, campaign.id]
  const q = useQuery({ queryKey: key, queryFn: () => campaignRecipients(orgId, campaign.id) })
  const refresh = () => Promise.all([qc.invalidateQueries({ queryKey: key }), onChanged()])
  const [error, setError] = useState<string | null>(null)
  if (q.isLoading) return <p className="mt-3 text-sm text-muted" role="status">Carregando clientes…</p>
  if (q.isError || !q.data) return <div className="mt-3"><Notice tone="error">{translateDbError(q.error as Err)}</Notice></div>
  const list = q.data.recipients
  return (
    <div className="mt-4 border-t border-rule pt-3">
      <p className="text-xs text-muted">{list.length} cliente{list.length === 1 ? '' : 's'} com WhatsApp{q.data.opted_out > 0 ? ` · ${q.data.opted_out} pediram para não receber e ficaram de fora` : ''}.</p>
      {error && <div className="mt-2"><Notice tone="error">{error}</Notice></div>}
      {list.length === 0 ? <p className="mt-2 text-sm text-muted">Ninguém neste público agora.</p> : (
        <ul className="mt-2 divide-y divide-rule/70 text-sm">
          {list.map((r) => (
            <li key={r.customer_id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span className="min-w-0">
                <Link to={`/oficina/${orgId}/clientes/${r.customer_id}`} className="font-semibold text-ink underline underline-offset-4">{r.customer_name}</Link>
                {r.vehicle_label ? <span className="text-muted"> · {r.vehicle_label}</span> : null}
                <span className="block text-xs text-muted">{r.contacted_at ? `contatado em ${formatDateTime(r.contacted_at)}` : r.last_visit ? `última visita ${formatDay(r.last_visit)}` : ''}</span>
              </span>
              {canEdit && campaign.status === 'active' && (
                <span className="flex flex-wrap items-center gap-1">
                  <ContactButton orgId={orgId} customerId={r.customer_id} customerName={r.customer_name} whatsapp={r.whatsapp} workshopName={workshopName}
                    reason="campaign" reference={campaign.id} label={r.contacted_at ? 'Enviar de novo' : 'WhatsApp'} onLogged={refresh}
                    text={campaignText(campaign.message, { customerName: r.customer_name, workshopName, vehicle: r.vehicle_label })} />
                  <Button size="sm" variant="quiet" onClick={async () => {
                    setError(null)
                    try { await setMarketingOptOut(orgId, r.customer_id, true); await refresh() } catch (err) { setError(translateDbError(err as Err)) }
                  }}>Não quer receber</Button>
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
