// Página de passaporte de exemplo — peça central da identidade visual.
// Dados fictícios e identificados como exemplo. Sem placa: a placa nunca é pública (ADR-008).

type Origin = 'owner' | 'document' | 'workshop'

const ORIGIN_LABEL: Record<Origin, string> = {
  owner: 'Informado pelo dono',
  document: 'Com comprovante',
  workshop: 'Confirmado por oficina',
}

const ORIGIN_COLOR: Record<Origin, string> = {
  owner: 'var(--color-origin-owner)',
  document: 'var(--color-origin-document)',
  workshop: 'var(--color-origin-workshop)',
}

const STAMPS: Array<{ title: string; km: string; date: string; origin: Origin; rotate: number }> = [
  { title: 'Revisão 12 mil', km: '12.400 km', date: 'mar 2024', origin: 'workshop', rotate: -6 },
  { title: 'Pneus novos', km: '18.950 km', date: 'nov 2024', origin: 'document', rotate: 4 },
  { title: 'Troca de óleo', km: '24.010 km', date: 'jun 2025', origin: 'owner', rotate: -2 },
]

function MotoSilhouette() {
  return (
    <svg viewBox="0 0 120 90" className="h-full w-full" aria-hidden="true">
      <g fill="none" stroke="var(--color-ink)" strokeLinecap="round" strokeLinejoin="round">
        {/* rodas */}
        <circle cx="24" cy="64" r="15" strokeWidth="5" />
        <circle cx="96" cy="64" r="15" strokeWidth="5" />
        <circle cx="24" cy="64" r="3" fill="var(--color-ink)" strokeWidth="0" />
        <circle cx="96" cy="64" r="3" fill="var(--color-ink)" strokeWidth="0" />
        {/* garfo e guidão */}
        <path d="M96 64 L84 30 L78 26 M84 30 L92 28" strokeWidth="3.5" />
        {/* balança traseira */}
        <path d="M24 64 L52 58" strokeWidth="3.5" />
      </g>
      {/* tanque, banco, motor e escape */}
      <path d="M50 38 Q56 28 72 30 L82 34 L76 44 L54 46 Z" fill="var(--color-ink)" />
      <path d="M26 40 L50 38 L52 44 L30 46 Z" fill="var(--color-ink-soft)" />
      <rect x="52" y="47" width="22" height="15" rx="3" fill="var(--color-ink)" />
      <path d="M60 62 L34 70" stroke="var(--color-brass)" strokeWidth="3.5" strokeLinecap="round" />
    </svg>
  )
}

function Stamp({ title, km, date, origin, rotate, index }: (typeof STAMPS)[number] & { index: number }) {
  const color = ORIGIN_COLOR[origin]
  return (
    <li
      className="stamp-in rounded-[0.6rem] border-2 px-3 py-2 text-center"
      style={{
        borderColor: color,
        color,
        transform: `rotate(${rotate}deg)`,
        animationDelay: `${400 + index * 260}ms`,
        boxShadow: `inset 0 0 0 2px var(--color-sheet), inset 0 0 0 3px ${color}`,
      }}
    >
      <p className="heading text-[0.82rem]">{title}</p>
      <p className="text-[0.78rem] font-semibold">{km}</p>
      <p className="text-[0.7rem]">{date}</p>
      <p className="mt-1 border-t pt-1 text-[0.66rem]" style={{ borderColor: color }}>
        {ORIGIN_LABEL[origin]}
      </p>
    </li>
  )
}

export function PassportSpecimen() {
  return (
    <figure
      className="guilloche relative w-full max-w-[30rem] overflow-hidden rounded-sheet border border-rule shadow-[0_1px_0_var(--color-rule),0_24px_48px_-28px_rgba(28,43,74,0.45)]"
      aria-label="Exemplo de página do Moto Passaporte"
    >
      <div className="flex items-center justify-between bg-ink px-5 py-3 text-sheet">
        <span className="heading text-sm">Moto Passaporte</span>
        <span className="text-xs text-sheet/80">Exemplo</span>
      </div>

      <div className="grid grid-cols-[6.5rem_1fr] gap-4 p-5">
        <div className="aspect-[3/4] rounded-doc border border-rule bg-paper-deep p-2">
          <MotoSilhouette />
        </div>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5 text-sm">
          <div>
            <dt className="text-[0.72rem] text-muted">Marca</dt>
            <dd className="font-semibold text-ink">Honda</dd>
          </div>
          <div>
            <dt className="text-[0.72rem] text-muted">Modelo</dt>
            <dd className="font-semibold text-ink">CB 500F</dd>
          </div>
          <div>
            <dt className="text-[0.72rem] text-muted">Ano</dt>
            <dd className="font-semibold text-ink">2022/2023</dd>
          </div>
          <div>
            <dt className="text-[0.72rem] text-muted">Cilindrada</dt>
            <dd className="font-semibold text-ink">471 cm³</dd>
          </div>
          <div className="col-span-2">
            <dt className="text-[0.72rem] text-muted">Passaporte criado em</dt>
            <dd className="font-semibold text-ink">14 de março de 2024</dd>
          </div>
        </dl>
      </div>

      <div className="px-5 pb-4">
        <p className="mb-3 text-[0.72rem] text-muted">Registros</p>
        <ol className="grid grid-cols-3 gap-3">
          {STAMPS.map((s, i) => (
            <Stamp key={s.title} {...s} index={i} />
          ))}
        </ol>
      </div>

      <div className="border-t border-dashed border-rule bg-sheet/80 px-5 py-3 text-ink/80" aria-hidden="true">
        <p className="mrz overflow-hidden">MP&lt;HONDA&lt;&lt;CB500F&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;</p>
        <p className="mrz overflow-hidden">7F3A9C2E81D0&lt;&lt;2022&lt;0471&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;</p>
      </div>
    </figure>
  )
}
