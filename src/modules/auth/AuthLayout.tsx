import type { ReactNode } from 'react'
import { Notice } from '@/components/Notice'
import { isSupabaseConfigured } from '@/core/config/env'

export function AuthLayout({ title, intro, children, footer }: { title: string; intro?: ReactNode; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="mx-auto flex max-w-md flex-col px-5 py-12 sm:py-16">
      <div className="guilloche rounded-sheet border border-rule p-6 sm:p-8">
        <h1 className="heading text-3xl text-ink">{title}</h1>
        {intro && <div className="mt-2 text-muted">{intro}</div>}
        {!isSupabaseConfigured && (
          <div className="mt-6">
            <Notice tone="error" title="Ambiente sem conexão com o banco">
              Defina VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY para usar esta tela.
            </Notice>
          </div>
        )}
        <div className="mt-6">{children}</div>
      </div>
      {footer && <div className="mt-6 text-center text-sm text-muted">{footer}</div>}
    </div>
  )
}
