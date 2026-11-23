'use client'

import { useId, useState, type ReactNode } from 'react'
import Link from 'next/link'

const MAX_BADGE_COUNT = 99

export function ActivityDisclosure({
  total,
  viewAllHref,
  children,
}: {
  total: number
  viewAllHref: string
  children: ReactNode
}) {
  const [open, setOpen] = useState(false)
  const listId = useId()
  const badge = total > MAX_BADGE_COUNT ? `${MAX_BADGE_COUNT}+` : String(total)
  const label = `Activity, ${total} ${total === 1 ? 'ticket' : 'tickets'} with new customer replies`

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-5 py-2">
        <div className="min-w-0">
          <h2 id="activity-heading" className="text-sm font-semibold text-slate-950">
            <button
              type="button"
              aria-expanded={open}
              aria-controls={listId}
              aria-label={label}
              onClick={() => setOpen((value) => !value)}
              className="flex min-h-11 items-center gap-2 rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
            >
              <svg
                aria-hidden="true"
                className={`h-4 w-4 shrink-0 text-slate-500 transition-transform ${open ? 'rotate-90' : ''}`}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="9 6 15 12 9 18" />
              </svg>
              Activity
              <span className="rounded-full bg-blue-600 px-2 py-0.5 text-[0.6875rem] font-semibold text-white">{badge}</span>
            </button>
          </h2>
          <p className="pb-1 text-xs text-slate-500 sm:pb-0">Customers replied on these tickets. Opening one marks it seen.</p>
        </div>
        <Link
          href={viewAllHref}
          className="inline-flex min-h-11 shrink-0 items-center rounded-lg text-xs font-medium text-brand-600 hover:text-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        >
          View all {total} →
        </Link>
      </div>
      <div id={listId} hidden={!open} className="border-t border-blue-100">
        {children}
      </div>
    </>
  )
}
