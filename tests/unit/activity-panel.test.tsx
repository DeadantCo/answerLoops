// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { ActivityPanel, ACTIVITY_PREVIEW_LIMIT } from '@/components/dashboard/activity-panel'
import type { Ticket } from '@/types'

afterEach(cleanup)

function ticket(overrides: Partial<Ticket>): Ticket {
  return {
    id: 1,
    org_ticket_number: 5,
    content: 'raw content',
    ai_summary: 'Login fails',
    source_platform: 'slack',
    source_author_name: 'alice',
    last_activity_at: '2026-10-02T00:00:00.000Z',
    last_customer_reply_at: '2026-10-02T00:00:00.000Z',
    last_seen_at: null,
    ...overrides,
  } as Ticket
}

describe('ActivityPanel', () => {
  it('renders nothing for an empty list', () => {
    const { container } = render(<ActivityPanel tickets={[]} total={0} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('shows the Activity section with the total and a View all link', () => {
    render(<ActivityPanel tickets={[ticket({})]} total={14} />)
    const section = screen.getByRole('region', { name: /Activity/ })
    expect(within(section).getByText('14')).toBeTruthy()
    expect(screen.getByRole('link', { name: /View all/ }).getAttribute('href')).toBe('/tickets?newActivity=1&sort=activity')
  })

  it('renders a linked row per ticket with number, summary, author and platform', () => {
    render(
      <ActivityPanel
        tickets={[ticket({}), ticket({ id: 2, org_ticket_number: 9, ai_summary: 'Billing question', source_platform: 'discord', source_author_name: 'bob' })]}
        total={2}
      />
    )
    const first = screen.getByText('Login fails').closest('a') as HTMLElement
    expect(first.getAttribute('href')).toBe('/tickets/5')
    expect(first.textContent).toContain('#5')
    expect(first.textContent).toContain('alice on Slack')
    const second = screen.getByText('Billing question').closest('a') as HTMLElement
    expect(second.getAttribute('href')).toBe('/tickets/9')
    expect(second.textContent).toContain('bob on Discord')
  })

  it('falls back to the content when there is no summary, and to "A customer" with no author', () => {
    render(<ActivityPanel tickets={[ticket({ ai_summary: null, content: 'How do I reset my password?', source_author_name: null })]} total={1} />)
    const row = screen.getByText(/How do I reset my password\?/).closest('a') as HTMLElement
    expect(row.textContent).toContain('A customer on Slack')
  })

  it('starts collapsed, with a 99+ badge whose accessible name carries the exact count and a View all link with the exact total', () => {
    render(<ActivityPanel tickets={[ticket({})]} total={200} />)
    const toggle = screen.getByRole('button', { name: /Activity, 200 tickets with new customer replies/ })
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    expect(screen.getByText('99+')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'View all 200 →' }).getAttribute('href')).toBe('/tickets?newActivity=1&sort=activity')
  })

  it('opens and closes again from the toggle, wiring aria-controls to the list', () => {
    render(<ActivityPanel tickets={[ticket({})]} total={1} />)
    const toggle = screen.getByRole('button', { name: /Activity, 1 ticket with new customer replies/ })
    const list = document.getElementById(toggle.getAttribute('aria-controls') as string) as HTMLElement
    expect(list.hidden).toBe(true)
    fireEvent.click(toggle)
    expect(toggle.getAttribute('aria-expanded')).toBe('true')
    expect(list.hidden).toBe(false)
    expect(within(list).getByText('Login fails')).toBeTruthy()
    fireEvent.click(toggle)
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    expect(list.hidden).toBe(true)
  })

  it('shows the exact count up to 99 and 99+ above it, keeping the exact total in the accessible name', () => {
    const { unmount } = render(<ActivityPanel tickets={[ticket({})]} total={99} />)
    expect(screen.getByText('99')).toBeTruthy()
    expect(screen.getByRole('button', { name: /Activity, 99 tickets/ })).toBeTruthy()
    unmount()
    render(<ActivityPanel tickets={[ticket({})]} total={100} />)
    expect(screen.getByText('99+')).toBeTruthy()
    expect(screen.getByRole('button', { name: /Activity, 100 tickets/ })).toBeTruthy()
  })

  it('previews at most the shared limit of rows', () => {
    expect(ACTIVITY_PREVIEW_LIMIT).toBe(5)
    const tickets = Array.from({ length: 8 }, (_, i) => ticket({ id: i + 1, org_ticket_number: i + 1, ai_summary: `Summary ${i + 1}` }))
    render(<ActivityPanel tickets={tickets} total={8} />)
    expect(screen.getByText('Summary 5')).toBeTruthy()
    expect(screen.queryByText('Summary 6')).toBeNull()
  })

  it('shows the footer only when the total is above the preview limit', () => {
    const five = Array.from({ length: 5 }, (_, i) => ticket({ id: i + 1, org_ticket_number: i + 1 }))
    const { unmount } = render(<ActivityPanel tickets={five} total={5} />)
    expect(screen.queryByText(/Showing the latest/)).toBeNull()
    unmount()
    render(<ActivityPanel tickets={five} total={200} />)
    const footer = screen.getByText('Showing the latest 5 of 200').parentElement as HTMLElement
    const link = within(footer).getByText('View all 200 \u2192').closest('a') as HTMLElement
    expect(link.getAttribute('href')).toBe('/tickets?newActivity=1&sort=activity')
  })

  it('keeps the View all link outside the toggle button', () => {
    render(<ActivityPanel tickets={[ticket({})]} total={14} />)
    const toggle = screen.getByRole('button', { name: /Activity, 14 tickets/ })
    expect(toggle.querySelector('a')).toBeNull()
    expect(screen.getByRole('link', { name: 'View all 14 \u2192' })).toBeTruthy()
  })
})
