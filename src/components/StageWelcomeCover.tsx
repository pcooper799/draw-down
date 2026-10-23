type StageWelcomeCoverProps = {
  orgName: string
  brandImageDataUrl: string | null
  totalTickets: number
}

const COLOR_MEANINGS = [
  {
    key: 'insured',
    label: 'Insured',
    meaning: 'Still in — one free return',
    swatch: 'var(--safe)',
    ink: '#e8fff1',
  },
  {
    key: 'open',
    label: 'No-Insurance',
    meaning: 'Still in the draw',
    swatch: 'var(--warn)',
    ink: '#1a1206',
  },
  {
    key: 'held',
    label: 'Held',
    meaning: 'Out for auction — not drawn',
    swatch: 'var(--held)',
    ink: '#062022',
  },
  {
    key: 'out',
    label: 'Out',
    meaning: 'Eliminated from the board',
    swatch: 'var(--danger)',
    ink: '#fff5f3',
  },
] as const

export function StageWelcomeCover({
  orgName,
  brandImageDataUrl,
  totalTickets,
}: StageWelcomeCoverProps) {
  const name = orgName.trim() || 'Your Organization'

  return (
    <div
      className="stage-welcome absolute inset-0 z-30 flex flex-col overflow-hidden"
      role="region"
      aria-label={`Welcome cover for ${name}`}
    >
      <div className="absolute inset-0">
        {brandImageDataUrl ? (
          <>
            <img
              src={brandImageDataUrl}
              alt=""
              className="h-full w-full object-cover opacity-[0.28] stage-brand-drift"
            />
            <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(8,12,10,0.4)_0%,rgba(8,12,10,0.78)_48%,rgba(8,12,10,0.94)_100%)]" />
          </>
        ) : (
          <>
            <div className="h-full w-full stage-fallback-grid" aria-hidden />
            <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(8,12,10,0.3)_0%,rgba(8,12,10,0.88)_100%)]" />
          </>
        )}
        <div className="absolute inset-0 stage-vignette" />
      </div>

      <div className="relative z-10 flex min-h-0 flex-1 flex-col items-center justify-center px-6 py-10 text-center sm:px-12">
        <p className="stage-welcome-kicker text-[0.7rem] font-semibold uppercase tracking-[0.32em] text-[var(--accent)] sm:text-xs">
          Welcome to
        </p>

        <div className="stage-welcome-brand mt-4 flex max-w-[min(92vw,52rem)] flex-col items-center gap-5 sm:mt-5 sm:gap-6">
          {brandImageDataUrl ? (
            <div className="brand-mark brand-mark--welcome shrink-0">
              <img src={brandImageDataUrl} alt={`${name} logo`} className="brand-mark-img" />
            </div>
          ) : null}
          <h1 className="font-display text-[clamp(2.75rem,9vw,6.5rem)] leading-[0.92] tracking-[0.02em] text-[var(--ink)]">
            {name}
          </h1>
        </div>

        <p className="stage-welcome-product mt-5 font-display text-[clamp(1.15rem,2.8vw,1.85rem)] tracking-[0.14em] text-[var(--accent)] sm:mt-6">
          Draw Down
        </p>
        <p className="mt-2 max-w-xl text-sm text-[var(--ink-muted)] sm:text-base">
          Ticket board is being set up · {totalTickets.toLocaleString()} tickets
        </p>

        <ul className="stage-welcome-colors mt-10 grid w-full max-w-3xl grid-cols-2 gap-3 text-left sm:mt-12 sm:grid-cols-4 sm:gap-4">
          {COLOR_MEANINGS.map((item, index) => (
            <li
              key={item.key}
              className="stage-welcome-swatch flex flex-col gap-2 border border-[var(--line)] bg-black/30 px-3 py-3 sm:px-3.5 sm:py-3.5"
              style={{ animationDelay: `${0.18 + index * 0.08}s` }}
            >
              <span
                className="inline-flex h-9 w-full items-center justify-center text-[0.7rem] font-semibold uppercase tracking-[0.14em] sm:h-10 sm:text-xs"
                style={{ background: item.swatch, color: item.ink }}
              >
                {item.label}
              </span>
              <span className="text-xs leading-snug text-[var(--ink-muted)] sm:text-sm">
                {item.meaning}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
