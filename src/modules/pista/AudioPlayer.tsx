import { useEffect, useRef, useState } from 'react'

/** Player com velocidade 1x, 1,5x e 2x para ouvir rápido os áudios da pista. */
export function AudioPlayer({ src }: { src?: string }) {
  const ref = useRef<HTMLAudioElement>(null)
  const [rate, setRate] = useState(1)
  useEffect(() => { if (ref.current) ref.current.playbackRate = rate }, [rate, src])
  if (!src) return <p className="text-sm text-muted">Carregando áudio…</p>
  return (
    <div className="mt-1 flex items-center gap-2">
      <audio ref={ref} controls preload="none" src={src} className="min-w-0 flex-1" />
      <button type="button" onClick={() => setRate(rate === 1 ? 1.5 : rate === 1.5 ? 2 : 1)}
        className="h-10 shrink-0 rounded-lg border border-rule bg-sheet px-2 text-sm font-bold" aria-label="Velocidade">{rate}x</button>
    </div>
  )
}

