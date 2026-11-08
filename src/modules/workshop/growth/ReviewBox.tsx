import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/Button'
import { CheckboxField, TextAreaField, TextField } from '@/components/Field'
import { Notice } from '@/components/Notice'
import { translateDbError } from '@/core/shared/dbErrors'
import { stars, submitReview } from './api'

type Review = { done: false } | { done: true; rating: number; comment: string | null; reply: string | null }

/** Avaliação pelo comprovante (PRD 2.1 §18): só quem recebeu o link da OS concluída, uma vez por OS. */
export function ReviewBox({ token, review, workshop, slug, customerName, onDone }: {
  token: string; review: Review; workshop: string; slug: string | null; customerName: string; onDone: () => void
}) {
  const [rating, setRating] = useState(0)
  const [comment, setComment] = useState('')
  const [name, setName] = useState(customerName)
  const [consent, setConsent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  if (review.done) {
    return (
      <section className="rounded-sheet border border-rule bg-sheet p-4 sm:p-6">
        <h2 className="heading text-xl text-ink">Sua avaliação</h2>
        <p className="mt-2 text-lg tracking-wide text-amber-600" aria-label={`${review.rating} de 5`}>{stars(review.rating)}</p>
        {review.comment && <p className="mt-1 whitespace-pre-line text-graphite">{review.comment}</p>}
        {review.reply && <div className="mt-3 border-l-2 border-rule pl-3 text-sm"><p className="font-semibold text-ink">Resposta da oficina</p><p className="text-graphite">{review.reply}</p></div>}
        {slug && <Link to={`/oficinas/${slug}`} className="mt-3 inline-block text-sm font-semibold text-ink underline underline-offset-4">Ver o perfil da oficina</Link>}
      </section>
    )
  }

  async function send() {
    if (rating < 1) return setError('Escolha de 1 a 5 estrelas.')
    if (!consent) return setError('Marque a autorização para publicar.')
    setBusy(true)
    setError(null)
    try {
      await submitReview(token, rating, comment.trim(), name.trim(), true)
      onDone()
    } catch (err) {
      setError(translateDbError(err as { code?: string; message?: string }))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="rounded-sheet border border-rule bg-sheet p-4 sm:p-6">
      <h2 className="heading text-xl text-ink">Como foi o atendimento da {workshop}?</h2>
      <p className="mt-1 text-sm text-muted">Sua avaliação aparece no perfil público da oficina e ajuda outros motociclistas.</p>
      <div className="mt-3 flex gap-1" role="radiogroup" aria-label="Nota">
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} type="button" role="radio" aria-checked={rating === n} aria-label={`${n} estrela${n > 1 ? 's' : ''}`} onClick={() => setRating(n)}
            className={`h-11 w-11 rounded-doc text-3xl leading-none ${n <= rating ? 'text-amber-500' : 'text-rule hover:text-amber-300'}`}>★</button>
        ))}
      </div>
      <div className="mt-3 grid gap-4">
        <TextAreaField label="Comentário (opcional)" value={comment} onChange={(e) => setComment(e.target.value)} rows={3} maxLength={1000} />
        <TextField label="Nome exibido" value={name} onChange={(e) => setName(e.target.value)} hint='Aparece só o primeiro nome e a inicial do sobrenome (ex.: "João S.").' />
        <CheckboxField checked={consent} onChange={(e) => setConsent(e.target.checked)} label="Autorizo publicar esta avaliação no perfil da oficina. Ela não pode ser editada depois." />
      </div>
      {error && <div className="mt-3"><Notice tone="error">{error}</Notice></div>}
      <Button className="mt-4" onClick={send} loading={busy}>Enviar avaliação</Button>
    </section>
  )
}
