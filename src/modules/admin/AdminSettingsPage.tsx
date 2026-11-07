import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/Button'
import { TextField } from '@/components/Field'
import { Notice } from '@/components/Notice'
import { translateDbError } from '@/core/shared/dbErrors'
import { listSettings, parseSettingInput, updateSetting, validReason, type AdminSetting } from './adminApi'

const show = (s: AdminSetting) => (s.value === null ? '' : typeof s.value === 'string' ? s.value : String(s.value))

function SettingRow({ s }: { s: AdminSetting }) {
  const qc = useQueryClient()
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(show(s))
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  const save = useMutation({
    mutationFn: (v: string | number | null) => updateSetting(s.key, v, reason.trim()),
    onSuccess: () => {
      setEditing(false)
      setReason('')
      qc.invalidateQueries({ queryKey: ['admin-settings'] })
      qc.invalidateQueries({ queryKey: ['public-settings'] })
    },
    onError: (e) => setError(translateDbError(e as { code?: string; message?: string })),
  })

  function submit() {
    const parsed = parseSettingInput(s.spec, value)
    if (typeof parsed === 'string') return setError(parsed)
    const r = validReason(reason)
    if (r) return setError(r)
    setError(null)
    save.mutate(parsed.value)
  }

  const range = s.spec.kind === 'int' ? ` (de ${s.spec.min} a ${s.spec.max})` : ''
  return (
    <li className="py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <p className="font-semibold text-ink">{s.spec.label}</p>
          <p className="text-sm text-muted">
            {show(s) || 'Não definido'}
            {s.is_public ? ' · aparece no site' : ''}
            {s.updated_by_name ? ` · alterado por ${s.updated_by_name} em ${new Date(s.updated_at).toLocaleDateString('pt-BR')}` : ''}
          </p>
        </div>
        {!editing && <Button size="sm" variant="secondary" onClick={() => { setValue(show(s)); setEditing(true) }} aria-label={`Alterar ${s.spec.label}`}>Alterar</Button>}
      </div>
      {editing && (
        <form className="mt-3 grid gap-3 rounded-doc border border-rule bg-sheet p-4 sm:grid-cols-2" aria-label={`Alterar ${s.spec.label}`}
          onSubmit={(e) => { e.preventDefault(); submit() }} noValidate>
          <TextField label={`Novo valor${range}`} value={value} onChange={(e) => setValue(e.target.value)}
            inputMode={s.spec.kind === 'int' ? 'numeric' : s.spec.kind === 'email' ? 'email' : 'tel'} />
          <TextField label="Motivo (fica na auditoria)" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} />
          {error && <div className="sm:col-span-2"><Notice tone="error">{error}</Notice></div>}
          <div className="flex gap-3 sm:col-span-2">
            <Button type="submit" size="sm" loading={save.isPending}>Salvar</Button>
            <Button type="button" size="sm" variant="secondary" onClick={() => { setEditing(false); setError(null) }}>Cancelar</Button>
          </div>
        </form>
      )}
    </li>
  )
}

/** Configurações gerais (PRD 7.8). Só chaves do catálogo, validadas no servidor; segredos ficam em Pagamentos. */
export function AdminSettingsPage() {
  const list = useQuery({ queryKey: ['admin-settings'], queryFn: listSettings })
  const groups = (list.data ?? []).reduce<Record<string, AdminSetting[]>>((acc, s) => {
    ;(acc[s.spec.group] ??= []).push(s)
    return acc
  }, {})
  return (
    <div>
      <Link to="/admin" className="text-sm text-muted underline underline-offset-4">Administração</Link>
      <h1 className="heading mt-2 text-3xl text-ink">Configurações</h1>
      <p className="mt-1 max-w-2xl text-muted">
        Contatos, limites e regras da plataforma. Cada alteração pede motivo e fica na auditoria. Planos e a conta do Mercado Pago têm telas próprias.
      </p>
      {list.isLoading && <p className="mt-6 text-muted" role="status">Carregando…</p>}
      {list.isError && <div className="mt-6"><Notice tone="error">Não foi possível carregar as configurações.</Notice></div>}
      {Object.entries(groups).map(([g, items]) => (
        <section key={g} className="mt-8" aria-label={g}>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted">{g}</h2>
          <ul className="mt-2 divide-y divide-rule border-y border-rule">
            {items.map((s) => <SettingRow key={s.key} s={s} />)}
          </ul>
        </section>
      ))}
    </div>
  )
}
