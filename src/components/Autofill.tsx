import { useEffect, useId, useState } from 'react'
import { TextField } from '@/components/Field'
import { findBrand, fipeMotoBrands, fipeMotoModels, formatCep, lookupCep, lookupCnpj, type CepAddress, type CnpjData, type FipeBrand } from '@/lib/brasil'

type Status = 'idle' | 'loading' | 'found' | 'notfound'

/** Campo de CEP: com 8 números busca o endereço sozinho (ADR-055). */
export function CepField({ onFound, defaultValue = '', className = '' }: { onFound: (a: CepAddress) => void; defaultValue?: string; className?: string }) {
  const [cep, setCep] = useState(formatCep(defaultValue))
  const [status, setStatus] = useState<Status>('idle')
  const [last, setLast] = useState('')
  useEffect(() => {
    const digits = cep.replace(/\D/g, '')
    if (digits.length !== 8 || digits === last) return
    let alive = true
    setStatus('loading')
    void lookupCep(digits).then((a) => {
      if (!alive) return
      setLast(digits)
      if (a) {
        setStatus('found')
        onFound(a)
      } else setStatus('notfound')
    })
    return () => { alive = false }
    // onFound muda a cada render; a busca depende só do CEP
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cep])
  const hint = status === 'loading' ? 'Buscando endereço…'
    : status === 'found' ? 'Endereço preenchido. Confira e complete o número.'
    : status === 'notfound' ? 'CEP não encontrado. Preencha o endereço à mão.'
    : 'Digite o CEP e o endereço é preenchido sozinho.'
  return (
    <TextField label="CEP" value={cep} inputMode="numeric" autoComplete="postal-code" placeholder="00000-000" maxLength={9}
      onChange={(e) => setCep(formatCep(e.target.value))} hint={hint} className={className} />
  )
}

/** Busca dados públicos do CNPJ ao sair do campo; devolve o resultado para quem chamou decidir o que preencher. */
export function useCnpjLookup() {
  const [status, setStatus] = useState<Status>('idle')
  const lookup = async (raw: string): Promise<CnpjData | null> => {
    if (raw.replace(/\D/g, '').length !== 14) { setStatus('idle'); return null }
    setStatus('loading')
    const d = await lookupCnpj(raw)
    setStatus(d ? 'found' : 'notfound')
    return d
  }
  const hint = status === 'loading' ? 'Buscando dados da empresa…'
    : status === 'found' ? 'Dados da Receita preenchidos nos campos vazios. Confira.'
    : status === 'notfound' ? 'CNPJ não encontrado. Preencha à mão.'
    : 'Com o CNPJ, razão social, cidade e contato são preenchidos sozinhos.'
  return { lookup, hint, status }
}

/** Sugestões de marca e modelo da Tabela FIPE para campos de texto (o usuário pode digitar outro). */
export function useFipeSuggestions(brand: string) {
  const [brands, setBrands] = useState<FipeBrand[]>([])
  const [models, setModels] = useState<string[]>([])
  const brandListId = useId()
  const modelListId = useId()
  useEffect(() => {
    let alive = true
    void fipeMotoBrands().then((b) => { if (alive) setBrands(b) })
    return () => { alive = false }
  }, [])
  const code = findBrand(brands, brand)?.code ?? ''
  useEffect(() => {
    let alive = true
    if (!code) { setModels([]); return }
    void fipeMotoModels(code).then((m) => { if (alive) setModels(m) })
    return () => { alive = false }
  }, [code])
  const lists = (
    <>
      <datalist id={brandListId}>{brands.map((b) => <option key={b.code} value={b.name} />)}</datalist>
      <datalist id={modelListId}>{models.map((m) => <option key={m} value={m} />)}</datalist>
    </>
  )
  return { brandListId, modelListId, lists, hasModels: models.length > 0 }
}
