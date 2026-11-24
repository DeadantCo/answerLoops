import Link from 'next/link'
import { ActivityDisclosure } from '@/components/dashboard/activity-disclosure'
import { LocalDate } from '@/components/ui/local-date'
import { parseAttachmentLines } from '@/lib/slack/attachment-lines'
import { platformLabel } from '@/lib/tickets/platform-label'
import type { SourcePlatform, Ticket } from '@/types'

export const ACTIVITY_PREVIEW_LIMIT = 5
const ACTIVITY_HEADING_ID = 'activity-heading'

function title(ticket: Ticket): string {
  if (ticket.ai_summary) return ticket.ai_summary
  const { text, attachments } = parseAttachmentLines(ticket.content)
  return text.slice(0, 80) || `Shared ${attachments.length} attachment${attachments.length === 1 ? '' : 's'}`
}

const ALL_ACTIVITY_HREF = '/tickets?newActivity=1&sort=activity'
const MAX_CHIPS = 4

export interface ChannelCount {
  platform: SourcePlatform
  count: number
}

interface ChannelChip {
  key: string
  label: string
  count: number
  href: string
}

function shownCount(count: number): string {
  return count > 99 ? '99+' : String(count)
}

function chipName(chip: ChannelChip): string {
  return `${chip.label}, ${chip.count} ${chip.count === 1 ? 'ticket' : 'tickets'} with new replies`
}

/**
 * At most four chips, largest channel first. With more channels than that the
 * last slot sums the rest into "Other", which links to the unfiltered list.
 * A single channel gets none, since its chip would only repeat the total.
 */
export function channelChips(channels: ChannelCount[]): ChannelChip[] {
  const active = channels.filter((channel) => channel.count > 0)
  if (active.length < 2) return []
  const toChip = ({ platform, count }: ChannelCount): ChannelChip => ({
    key: platform,
    label: platformLabel(platform),
    count,
    href: `${ALL_ACTIVITY_HREF}&platform=${encodeURIComponent(platform)}`,
  })
  if (active.length <= MAX_CHIPS) return active.map(toChip)
  const other = active.slice(MAX_CHIPS - 1).reduce((sum, channel) => sum + channel.count, 0)
  return [...active.slice(0, MAX_CHIPS - 1).map(toChip), { key: 'other', label: 'Other', count: other, href: ALL_ACTIVITY_HREF }]
}

/**
 * Tickets the customer has written on since the team last opened them, most
 * recent first. Shows nothing when there is nothing new, so a quiet workspace
 * has no empty box on its dashboard.
 */
export function ActivityPanel({ tickets, total, channels = [], snapshot, proof }: {
  tickets: Ticket[]
  total: number
  channels?: ChannelCount[]
  snapshot?: string
  proof?: string
}) {
  const chips = channelChips(channels)
  const viewAll = (
    <Link href={ALL_ACTIVITY_HREF} prefetch={false} className="inline-flex min-h-11 shrink-0 items-center text-xs font-medium text-brand-600 hover:text-brand-700">
      View all {total} →
    </Link>
  )
  return (
    <ActivityDisclosure
      headingId={ACTIVITY_HEADING_ID}
      total={tickets.length ? total : 0}
      viewAll={viewAll}
      previewNote={total > ACTIVITY_PREVIEW_LIMIT ? `Showing the latest ${ACTIVITY_PREVIEW_LIMIT} of ${total}` : undefined}
      snapshot={snapshot}
      proof={proof}
      channels={
        chips.length > 0 && (
          <ul aria-label="New replies by channel" className="mt-1 flex flex-wrap gap-1.5">
            {chips.map((chip) => (
              <li key={chip.key} className="max-w-full">
                <Link
                  href={chip.href}
                  prefetch={false}
                  aria-label={chipName(chip)}
                  className="inline-flex min-h-8 max-w-full items-center gap-1.5 rounded-full border border-blue-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 transition hover:border-blue-300 hover:bg-blue-50"
                >
                  <span className="truncate">{chip.label}</span>
                  <span className="font-semibold text-blue-700">{shownCount(chip.count)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )
      }
    >
      <ul className="divide-y divide-blue-100">
        {tickets.map((ticket) => (
          <li key={ticket.id}>
            <Link
              href={`/tickets/${ticket.org_ticket_number}`}
              prefetch={false}
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
    </ActivityDisclosure>
  )
}
