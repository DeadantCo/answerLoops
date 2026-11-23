'use client'

import {
  Children,
  isValidElement,
  useState,
  useSyncExternalStore,
  type ReactElement,
  type ReactNode,
} from 'react'

type TourStepProps = { title: string; children?: ReactNode }

/** One step of a SetupTour. Only the props are read; SetupTour renders the step itself. */
export function TourStep({ children }: TourStepProps) {
  return <>{children}</>
}

// The URL hash is the single source of truth for the current step. replaceState
// does not fire hashchange, so our own navigation notifies listeners directly.
const hashListeners = new Set<() => void>()

function subscribeToHash(listener: () => void) {
  hashListeners.add(listener)
  window.addEventListener('hashchange', listener)
  return () => {
    hashListeners.delete(listener)
    window.removeEventListener('hashchange', listener)
  }
}

function subscribeNever() {
  return () => {}
}

const HASH_PATTERN = /^#step-(\d+)$/

function stepFromHash(hash: string, count: number): number | null {
  const match = HASH_PATTERN.exec(hash)
  if (!match) return null
  const n = Number(match[1])
  return n >= 1 && n <= count ? n - 1 : null
}

/**
 * A guided, one-step-at-a-time view of a setup guide. Every step is rendered
 * into the page, so without JavaScript, in print and in the "Show all steps"
 * view the reader gets the full guide. The current step lives in the URL hash
 * as `#step-N`, so a step can be linked to.
 */
export function SetupTour({ children, label = 'Setup tour' }: { children: ReactNode; label?: string }) {
  const steps = Children.toArray(children).filter((child): child is ReactElement<TourStepProps> =>
    isValidElement(child),
  )
  const count = steps.length
  const hydrated = useSyncExternalStore(subscribeNever, () => true, () => false)
  const hash = useSyncExternalStore(subscribeToHash, () => window.location.hash, () => '')
  const [showAll, setShowAll] = useState(false)

  const goTo = (next: number) => {
    if (next < 0 || next >= count) return
    window.history.replaceState(null, '', `#step-${next + 1}`)
    hashListeners.forEach((listener) => listener())
  }

  if (count === 0) return null

  const current = stepFromHash(hash, count) ?? 0
  const touring = hydrated && !showAll
  const atFirst = current === 0
  const atLast = current === count - 1
  const currentTitle = steps[current].props.title

  const navButton =
    'rounded-lg border border-fd-border px-4 py-2 text-sm font-medium transition-colors hover:bg-fd-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fd-ring aria-disabled:cursor-not-allowed aria-disabled:opacity-50 aria-disabled:hover:bg-transparent'

  return (
    <section aria-label={label} className="my-6">
      {hydrated && (
        <div className="not-prose mb-4 space-y-3 rounded-xl border border-fd-border bg-fd-card p-3 sm:p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold">
              {touring ? `Step ${current + 1} of ${count}` : `${count} steps`}
            </p>
            <button
              type="button"
              aria-pressed={!touring}
              onClick={() => setShowAll(touring)}
              className="rounded-lg px-2 py-1 text-sm text-fd-muted-foreground underline underline-offset-2 hover:text-fd-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fd-ring"
            >
              {touring ? 'Show all steps' : 'Show one step at a time'}
            </button>
          </div>
          {touring && (
            <>
              <div
                role="progressbar"
                aria-label="Setup progress"
                aria-valuemin={1}
                aria-valuemax={count}
                aria-valuenow={current + 1}
                aria-valuetext={`Step ${current + 1} of ${count}`}
                className="h-1.5 overflow-hidden rounded-full bg-fd-muted"
              >
                <div
                  className="h-full rounded-full bg-fd-primary transition-all"
                  style={{ width: `${((current + 1) / count) * 100}%` }}
                />
              </div>
              <ol className="flex flex-wrap gap-1.5">
                {steps.map((step, i) => (
                  <li key={i}>
                    <button
                      type="button"
                      aria-label={`Go to step ${i + 1}: ${step.props.title}`}
                      aria-current={i === current ? 'step' : undefined}
                      onClick={() => goTo(i)}
                      className={`flex size-8 items-center justify-center rounded-full border text-xs font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fd-ring ${
                        i === current
                          ? 'border-fd-primary bg-fd-primary text-fd-primary-foreground'
                          : 'border-fd-border hover:bg-fd-accent'
                      }`}
                    >
                      {i + 1}
                    </button>
                  </li>
                ))}
              </ol>
            </>
          )}
        </div>
      )}

      <output aria-live="polite" className="sr-only">
        {touring ? `Step ${current + 1} of ${count}: ${currentTitle}` : ''}
      </output>

      <ol className="m-0 list-none space-y-6 p-0">
        {steps.map((step, i) => {
          const hidden = touring && i !== current
          return (
            <li key={i} hidden={hidden} className="print:block">
              <h3 className="not-prose mb-2 flex items-center gap-3 text-lg font-semibold">
                <span
                  aria-hidden="true"
                  className="flex size-7 shrink-0 items-center justify-center rounded-full bg-fd-primary text-sm font-semibold text-fd-primary-foreground"
                >
                  {i + 1}
                </span>
                <span className="min-w-0 wrap-break-word">{step.props.title}</span>
              </h3>
              <div className="min-w-0 sm:pl-10">{step.props.children}</div>
            </li>
          )
        })}
      </ol>

      {touring && (
        <div className="not-prose mt-4 flex items-center justify-between gap-2">
          <button
            type="button"
            aria-disabled={atFirst}
            onClick={() => goTo(current - 1)}
            className={navButton}
          >
            Back
          </button>
          <button
            type="button"
            aria-disabled={atLast}
            onClick={() => goTo(current + 1)}
            className={navButton}
          >
            Next
          </button>
        </div>
      )}
    </section>
  )
}
