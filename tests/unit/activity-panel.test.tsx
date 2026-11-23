// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import { ActivityPanel, type ChannelCount } from '@/components/dashboard/activity-panel'
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

  describe('channel chips', () => {
    const chips = () => within(screen.getByRole('list', { name: 'New replies by channel' })).getAllByRole('link')
    const renderWith = (channels: ChannelCount[]) =>
      render(<ActivityPanel tickets={[ticket({})]} total={channels.reduce((n, c) => n + c.count, 0)} channels={channels} />)

    it('shows a chip per channel in the given order, each linking to that channel’s unseen replies', () => {
      renderWith([
        { platform: 'github', count: 8 },
        { platform: 'discord', count: 3 },
        { platform: 'email', count: 1 },
      ])
      expect(chips().map((c) => c.textContent)).toEqual(['GitHub8', 'Discord3', 'Email1'])
      expect(chips().map((c) => c.getAttribute('href'))).toEqual([
        '/tickets?newActivity=1&sort=activity&platform=github',
        '/tickets?newActivity=1&sort=activity&platform=discord',
        '/tickets?newActivity=1&sort=activity&platform=email',
      ])
    })

    it('gives each chip an accessible name with the exact count, singular for one', () => {
      renderWith([
        { platform: 'github', count: 150 },
        { platform: 'email', count: 1 },
      ])
      expect(screen.getByRole('link', { name: 'GitHub, 150 tickets with new replies' })).toBeTruthy()
      expect(screen.getByRole('link', { name: 'Email, 1 ticket with new replies' })).toBeTruthy()
    })

    it('shows counts exactly up to 99 and 99+ above', () => {
      renderWith([
        { platform: 'github', count: 100 },
        { platform: 'slack', count: 99 },
      ])
      expect(chips().map((c) => c.textContent)).toEqual(['GitHub99+', 'Slack99'])
    })

    it('shows no chips when only one channel has unseen replies', () => {
      renderWith([{ platform: 'github', count: 8 }])
      expect(screen.queryByRole('list', { name: 'New replies by channel' })).toBeNull()
    })

    it('shows no chips without channel data', () => {
      render(<ActivityPanel tickets={[ticket({})]} total={3} />)
      expect(screen.queryByRole('list', { name: 'New replies by channel' })).toBeNull()
    })

    it('shows four channels as they are', () => {
      renderWith([
        { platform: 'github', count: 4 },
        { platform: 'discord', count: 3 },
        { platform: 'email', count: 2 },
        { platform: 'slack', count: 1 },
      ])
      expect(chips().map((c) => c.textContent)).toEqual(['GitHub4', 'Discord3', 'Email2', 'Slack1'])
    })

    it('with more than four channels shows three chips plus an Other chip summing the rest, linking to the unfiltered list', () => {
      renderWith([
        { platform: 'github', count: 8 },
        { platform: 'discord', count: 3 },
        { platform: 'email', count: 2 },
        { platform: 'slack', count: 2 },
        { platform: 'telegram', count: 1 },
      ])
      expect(chips().map((c) => c.textContent)).toEqual(['GitHub8', 'Discord3', 'Email2', 'Other3'])
      const other = screen.getByRole('link', { name: 'Other, 3 tickets with new replies' })
      expect(other.getAttribute('href')).toBe('/tickets?newActivity=1&sort=activity')
    })

    it('wraps instead of scrolling sideways', () => {
      renderWith([
        { platform: 'github', count: 8 },
        { platform: 'discord', count: 3 },
      ])
      expect(screen.getByRole('list', { name: 'New replies by channel' }).className).toContain('flex-wrap')
    })
  })

  it('falls back to the content when there is no summary, and to "A customer" with no author', () => {
    render(<ActivityPanel tickets={[ticket({ ai_summary: null, content: 'How do I reset my password?', source_author_name: null })]} total={1} />)
    const row = screen.getByText(/How do I reset my password\?/).closest('a') as HTMLElement
    expect(row.textContent).toContain('A customer on Slack')
  })
})
