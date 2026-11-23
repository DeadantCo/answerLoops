import Link from 'next/link'
import { ActivityDisclosure } from '@/components/dashboard/activity-disclosure'
import { LocalDate } from '@/components/ui/local-date'
import { parseAttachmentLines } from '@/lib/slack/attachment-lines'
import { platformLabel } from '@/lib/tickets/platform-label'
import type { Ticket } from '@/types'

/** How many tickets the panel previews; the dashboard query and the rendered rows both use it. */
export const ACTIVITY_PREVIEW_LIMIT = 5

const VIEW_ALL_HREF = '/tickets?newActivity=1&sort=activity'

function title(ticket: Ticket): string {
  if (ticket.ai_summary) return ticket.ai_summary
  const { text, attachments } = parseAttachmentLines(ticket.content)
  return text.slice(0, 80) || `Shared ${attachments.length} attachment${attachments.length === 1 ? '' : 's'}`
}

/**
 * Tickets the customer has written on since the team last opened them, most
 * recent first. Shows nothing when there is nothing new, so a quiet workspace
 * has no empty box on its dashboard.
 */
export function ActivityPanel({ tickets, total }: { tickets: Ticket[]; total: number }) {
  if (tickets.length === 0) return null
  const preview = tickets.slice(0, ACTIVITY_PREVIEW_LIMIT)
  return (
    <section
      aria-labelledby="activity-heading"
      className="overflow-hidden rounded-2xl border border-blue-200 bg-blue-50/50 shadow-[0_16px_45px_rgba(30,64,175,0.06)]"
    >
      <ActivityDisclosure total={total} viewAllHref={VIEW_ALL_HREF}>
        <ul className="divide-y divide-blue-100">
          {preview.map((ticket) => (
            <li key={ticket.id}>
              <Link
                href={`/tickets/${ticket.org_ticket_number}`}
                className="flex flex-col gap-1 px-5 py-3 transition hover:bg-white sm:flex-row sm:items-center sm:justify-between sm:gap-4"
              >
                <span className="min-w-0">
                  <span className="block break-words text-sm font-medium text-slate-900 line-clamp-2">
                    <span className="mr-1.5 text-xs font-normal text-slate-400">#{ticket.org_ticket_number}</span>
                    {title(ticket)}
                  </span>
                  <span className="block break-words text-xs text-slate-500">
                    {ticket.source_author_name ?? 'A customer'} on {platformLabel(ticket.source_platform)}
                  </span>
                </span>
                <span className="shrink-0 text-xs text-slate-400">
                  <LocalDate iso={ticket.last_customer_reply_at ?? ticket.last_activity_at} />
                </span>
              </Link>
            </li>
          ))}
        </ul>
        {total > ACTIVITY_PREVIEW_LIMIT && (
          <p className="flex flex-wrap items-center justify-between gap-x-3 border-t border-blue-100 px-5 py-1 text-xs text-slate-500">
            <span>
              Showing the latest {preview.length} of {total}
            </span>
            <Link
              href={VIEW_ALL_HREF}
              className="inline-flex min-h-11 items-center rounded-lg font-medium text-brand-600 hover:text-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            >
              View all {total} →
            </Link>
          </p>
        )}
      </ActivityDisclosure>
    </section>
  )
}
