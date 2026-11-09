import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/Button'
import { Notice } from '@/components/Notice'
import { translateDbError } from '@/core/shared/dbErrors'
import { downloadQrPng, qrSvg } from '@/modules/sharing/qr'
import { rpc } from '@/modules/workshop/shared/rpc'
import { Card, WorkshopShell } from '@/modules/workshop/shared/WorkshopShell'
import { fetchPistaContext, pistaUrl } from './api'

/** Painel da oficina → App da Pista: link para instalar, compartilhar e regras (ADR-057). */
export function PistaInstallPage() {
  return <WorkshopShell>{({ orgId, shop }) => <Content orgId={orgId} name={shop.business_name} responsible={shop.role === 'responsible'} />}</WorkshopShell>
}

function Content({ orgId, name, responsible }: { orgId: string; name: string; responsible: boolean }) {
  const ctx = useQuery({ queryKey: ['pista-context-panel'], queryFn: fetchPistaContext })
  const code = ctx.data?.find((s) => s.organization_id === orgId)?.code
  const url = pistaUrl(code)
  const message = `App da Pista da ${name} (Moto Passaporte): abra no celular e instale na tela de início. Entre com o apelido e a senha que o responsável criou para você. Código da oficina: ${code ?? ''}\n${url}`
  const [svg, setSvg] = useState('')
  const [copied, setCopied] = useState(false)
  useEffect(() => { void qrSvg(url).then(setSvg) }, [url])
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function'

  async function copy() {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2500)
    } catch {
      window.prompt('Copie o link:', url)
    }
  }

  return (
    <div className="space-y-5">
      <header>
        <p className="text-sm font-semibold uppercase tracking-wider text-muted">Oficina</p>
        <h1 className="heading text-3xl text-ink">App da Pista</h1>
        <p className="mt-2 max-w-2xl text-graphite">
          O app do mecânico: fotos, notas, áudio, itens feitos e checklist direto na moto, mesmo sem internet.
          O mecânico entra com o apelido e a senha que você cria em Equipe → “Novo mecânico”. Essa conta só abre o App da Pista.
        </p>
      </header>

      <div className="grid gap-5 lg:grid-cols-[1fr_auto]">
        <Card title="Link para instalar">
          <p className="break-all rounded-doc border border-rule bg-paper px-3 py-2 font-mono text-lg text-ink">{url}</p>
          {code && <p className="mt-2 text-graphite">Código da oficina: <strong className="font-mono text-lg tracking-widest text-ink">{code}</strong> (o mecânico só digita se abrir o app sem o link).</p>}
          <div className="mt-4 flex flex-wrap gap-2">
            <a href={`https://wa.me/?text=${encodeURIComponent(message)}`} target="_blank" rel="noopener noreferrer"
              className="inline-flex h-11 items-center rounded-doc bg-[#1f7a4d] px-4 font-semibold text-white">Enviar pelo WhatsApp</a>
            {canShare && (
              <Button variant="secondary" onClick={() => { void navigator.share({ title: 'App da Pista', text: message, url }).catch(() => {}) }}>
                Compartilhar…
              </Button>
            )}
            <Button variant="secondary" onClick={() => void copy()}>{copied ? 'Link copiado ✓' : 'Copiar link'}</Button>
            <Button variant="secondary" onClick={() => void downloadQrPng(url, `app-da-pista-${name}`)}>Baixar QR code</Button>
            <a href={code ? `/pista/${code}` : '/pista'} target="_blank" rel="noopener" className="inline-flex h-11 items-center px-2 font-semibold text-ink underline underline-offset-4">Abrir aqui</a>
          </div>
          <ol className="mt-5 list-decimal space-y-1.5 pl-5 text-graphite">
            <li>O mecânico abre o link no celular dele (ou aponta a câmera para o QR code).</li>
            <li><strong>Android (Chrome):</strong> toque em “Instalar app” ou no menu ⋮ → “Instalar app”.</li>
            <li><strong>iPhone (Safari):</strong> toque em Compartilhar → “Adicionar à Tela de Início”.</li>
            <li>O ícone laranja “Pista” aparece na tela de início. É só entrar com o apelido e a senha.</li>
          </ol>
        </Card>
        <Card title="QR code">
          <div className="mx-auto w-56" aria-label="QR code do App da Pista" role="img" dangerouslySetInnerHTML={{ __html: svg }} />
          <p className="mt-2 text-center text-sm text-muted">Imprima e cole na bancada.</p>
        </Card>
      </div>

      <Rules orgId={orgId} responsible={responsible} />
    </div>
  )
}

function Rules({ orgId, responsible }: { orgId: string; responsible: boolean }) {
  const qc = useQueryClient()
  const ctx = useQuery({ queryKey: ['pista-context-panel'], queryFn: fetchPistaContext })
  const shop = ctx.data?.find((s) => s.organization_id === orgId)
  const save = useMutation({
    mutationFn: (v: { unassigned: boolean; ready: boolean }) =>
      rpc('workshop_set_pista_settings', { p_org: orgId, p_allow_unassigned: v.unassigned, p_allow_ready: v.ready }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['pista-context-panel'] }),
  })
  if (!shop) return null
  const toggle = (label: string, hint: string, value: boolean, next: { unassigned: boolean; ready: boolean }) => (
    <label className="flex items-start gap-3 py-2">
      <input type="checkbox" checked={value} disabled={!responsible || save.isPending} onChange={() => save.mutate(next)} className="mt-1 h-5 w-5" />
      <span><span className="font-semibold text-ink">{label}</span><span className="block text-sm text-muted">{hint}</span></span>
    </label>
  )
  return (
    <Card title="Regras da pista">
      {toggle('Mecânico pode pegar OS sem mecânico', 'Ele vê as OS sem dono na aba “Sem mecânico” e pode pegar.', shop.allow_unassigned,
        { unassigned: !shop.allow_unassigned, ready: shop.allow_ready })}
      {toggle('Mecânico pode marcar “Pronto”', 'Com km de saída. A conclusão e a entrega continuam no painel.', shop.allow_ready,
        { unassigned: shop.allow_unassigned, ready: !shop.allow_ready })}
      {!responsible && <p className="text-sm text-muted">Só o responsável muda estas regras.</p>}
      {save.isError && <div className="mt-2"><Notice tone="error">{translateDbError(save.error as { message?: string })}</Notice></div>}
      <p className="mt-2 text-sm text-muted">Preços e contato do cliente nunca aparecem na pista. Áudios só a equipe ouve e são apagados 90 dias depois da entrega.</p>
    </Card>
  )
}
