import type { ReactNode } from 'react'

type Tone = 'info' | 'error' | 'success'

const tones: Record<Tone, string> = {
  info: 'border-ink/25 bg-sheet text-graphite',
  error: 'border-danger/40 bg-[#f7ecea] text-danger',
  success: 'border-ok/40 bg-[#e8f1ea] text-ok',
}

export function Notice({ tone = 'info', title, children }: { tone?: Tone; title?: string; children: ReactNode }) {
  return (
    <div role={tone === 'error' ? 'alert' : 'status'} className={`rounded-doc border px-4 py-3 text-sm ${tones[tone]}`}>
      {title && <p className="mb-0.5 font-semibold">{title}</p>}
      <div>{children}</div>
    </div>
  )
}
