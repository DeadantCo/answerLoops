// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { TicketContent } from '@/components/tickets/ticket-content'

afterEach(cleanup)

describe('TicketContent per-channel rendering', () => {
  it.each(['discord', 'discourse'] as const)('renders Markdown for %s tickets', (platform) => {
    render(
      <TicketContent
        sourcePlatform={platform}
        content={'**bold** and `code` and [label](https://example.com)'}
      />
    )
    expect(screen.getByText('bold').tagName).toBe('STRONG')
    expect(screen.getByText('code').tagName).toBe('CODE')
    expect(screen.getByRole('link', { name: 'label' })).toHaveAttribute('href', 'https://example.com')
  })

  it('converts Slack link and mention syntax to readable text', () => {
    const { container } = render(
      <TicketContent
        sourcePlatform="slack"
        content={'See <https://example.com|label> cc <@U123>'}
      />
    )
    expect(container.textContent).not.toContain('<https://example.com|label>')
    expect(container.textContent).not.toContain('<@U123>')
    expect(screen.getByRole('link', { name: 'label' })).toHaveAttribute('href', 'https://example.com')
  })

  it.each(['discord', 'discourse', 'mcp'] as const)('renders headings, lists and italics for %s tickets', (platform) => {
    render(
      <TicketContent
        sourcePlatform={platform}
        content={'## Steps\n\n- one\n- two\n\n*soft* text'}
      />
    )
    expect(screen.getByRole('heading', { name: 'Steps' })).toBeInTheDocument()
    expect(screen.getAllByRole('listitem')).toHaveLength(2)
    expect(screen.getByText('soft').tagName).toBe('EM')
  })

  it.each(['discord', 'discourse', 'slack', 'google_chat', 'mcp'] as const)(
    'never renders raw HTML as elements for %s tickets',
    (platform) => {
      const { container } = render(
        <TicketContent
          sourcePlatform={platform}
          content={'<script>alert(1)</script> <img src=x onerror=alert(1)> <b>hi</b>'}
        />
      )
      expect(container.querySelector('script')).toBeNull()
      expect(container.querySelector('img')).toBeNull()
      expect(container.querySelector('b')).toBeNull()
    }
  )

  it.each(['discord', 'discourse', 'slack', 'google_chat'] as const)(
    'opens links in a new tab for %s tickets',
    (platform) => {
      render(
        <TicketContent
          sourcePlatform={platform}
          content={platform === 'slack' || platform === 'google_chat' ? '<https://example.com|label>' : '[label](https://example.com)'}
        />
      )
      const link = screen.getByRole('link', { name: 'label' })
      expect(link).toHaveAttribute('target', '_blank')
      expect(link).toHaveAttribute('rel', 'noopener noreferrer')
    }
  )

  it('shows dashboard-relative Markdown links as text', () => {
    render(<TicketContent sourcePlatform="discord" content="[settings](/settings/billing)" />)
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
    expect(screen.getByText('settings')).toBeInTheDocument()
  })

  it('renders Slack formatting, mentions, channels and code', () => {
    const { container } = render(
      <TicketContent
        sourcePlatform="slack"
        content={'*bold* and _italic_ and ~gone~ in <#C123|general> from <@U123|dana> &amp; `x &lt; y`\n```\nconst a = 1\n```\n&gt; quoted'}
      />
    )
    expect(screen.getByText('bold').tagName).toBe('STRONG')
    expect(screen.getByText('italic').tagName).toBe('EM')
    expect(screen.getByText('gone').tagName).toBe('S')
    expect(container.textContent).toContain('#general')
    expect(container.textContent).toContain('@dana & ')
    expect(screen.getByText('x < y').tagName).toBe('CODE')
    expect(container.querySelector('pre')?.textContent).toBe('const a = 1')
    expect(container.querySelector('blockquote')?.textContent).toBe('quoted')
  })

  it('leaves literal asterisks and underscores in Slack text alone', () => {
    const { container } = render(
      <TicketContent sourcePlatform="slack" content="set snake_case_name to 2 * 3 * 4" />
    )
    expect(container.textContent).toBe('set snake_case_name to 2 * 3 * 4')
    expect(container.querySelector('em, strong')).toBeNull()
  })

  it('only links http(s) targets in Slack text', () => {
    const { container } = render(
      <TicketContent
        sourcePlatform="slack"
        content="<javascript:alert(1)|click> <mailto:a@b.com|a@b.com> <!here> <https://x.dev/a?b=1&amp;c=2>"
      />
    )
    expect(container.querySelectorAll('a')).toHaveLength(1)
    expect(container.querySelector('a')).toHaveAttribute('href', 'https://x.dev/a?b=1&c=2')
    expect(container.textContent).toContain('click')
    expect(container.textContent).toContain('@here')
  })

  it('renders Google Chat formatting and user mentions', () => {
    const { container } = render(
      <TicketContent sourcePlatform="google_chat" content="hey <users/123> *urgent* please" />
    )
    expect(container.textContent).toBe('hey @user urgent please')
    expect(screen.getByText('urgent').tagName).toBe('STRONG')
  })

  it.each(['slack', 'google_chat', 'discord', 'discourse', 'mcp'] as const)(
    'keeps attachment lines as links for %s tickets',
    (platform) => {
      render(
        <TicketContent
          sourcePlatform={platform}
          content={'see attached\n[Attachment: shot.png] — https://files.example/shot.png'}
        />
      )
      expect(screen.getByRole('link', { name: /shot\.png/ })).toHaveAttribute('href', 'https://files.example/shot.png')
      expect(screen.getByText('see attached')).toBeInTheDocument()
    }
  )

  it.each(['telegram', 'email', 'circle'] as const)('keeps %s tickets as literal plain text', (platform) => {
    const content = '**not bold** `not code` [x](https://example.com) <https://a.com|b> *star*'
    const { container } = render(<TicketContent sourcePlatform={platform} content={content} />)
    expect(container.textContent).toBe(content)
    expect(container.querySelector('strong, em, code, a')).toBeNull()
  })
})
