// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { renderToString } from 'react-dom/server'
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SetupTour, TourStep } from '@/components/docs/setup-tour'

function Tour() {
  return (
    <SetupTour>
      <TourStep title="Allow your domain">Add your domain.</TourStep>
      <TourStep title="Copy the snippet">Copy the embed snippet.</TourStep>
      <TourStep title="Preview and test">Ask a question.</TourStep>
    </SetupTour>
  )
}

const stepItem = (text: string) => screen.getByText(text, { selector: 'div' }).closest('li')!

beforeEach(() => {
  window.history.replaceState(null, '', '/')
})

afterEach(() => {
  window.history.replaceState(null, '', '/')
})

describe('SetupTour', () => {
  it('renders every step, with no tour controls, before JavaScript runs', () => {
    const html = renderToString(<Tour />)
    expect(html).toContain('Add your domain.')
    expect(html).toContain('Copy the embed snippet.')
    expect(html).toContain('Ask a question.')
    expect(html).not.toMatch(/<li[^>]* hidden/)
    expect(html).not.toContain('>Next<')
    expect(html).not.toContain('>Back<')
  })

  it('starts on the first step with Back inactive and the other steps hidden', () => {
    render(<Tour />)
    expect(screen.getAllByText('Step 1 of 3').length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: 'Back' })).toHaveAttribute('aria-disabled', 'true')
    expect(screen.getByRole('button', { name: 'Next' })).toHaveAttribute('aria-disabled', 'false')
    expect(stepItem('Add your domain.')).not.toHaveAttribute('hidden')
    expect(stepItem('Copy the embed snippet.')).toHaveAttribute('hidden')
    expect(stepItem('Ask a question.')).toHaveAttribute('hidden')
  })

  it('moves forward with Next and back with Back, updating the hash and the progress bar', async () => {
    const user = userEvent.setup()
    render(<Tour />)

    await user.click(screen.getByRole('button', { name: 'Next' }))
    expect(stepItem('Copy the embed snippet.')).not.toHaveAttribute('hidden')
    expect(stepItem('Add your domain.')).toHaveAttribute('hidden')
    expect(window.location.hash).toBe('#step-2')
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '2')
    expect(screen.getByRole('button', { name: 'Back' })).toHaveAttribute('aria-disabled', 'false')

    await user.click(screen.getByRole('button', { name: 'Back' }))
    expect(stepItem('Add your domain.')).not.toHaveAttribute('hidden')
    expect(window.location.hash).toBe('#step-1')
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '1')
  })

  it('stops at the last step and keeps focus on the Next button', async () => {
    const user = userEvent.setup()
    render(<Tour />)
    const next = screen.getByRole('button', { name: 'Next' })
    await user.click(next)
    await user.click(next)
    expect(stepItem('Ask a question.')).not.toHaveAttribute('hidden')
    expect(next).toHaveAttribute('aria-disabled', 'true')
    expect(next).toHaveFocus()

    await user.click(next)
    expect(stepItem('Ask a question.')).not.toHaveAttribute('hidden')
    expect(window.location.hash).toBe('#step-3')
  })

  it('does not go before the first step', async () => {
    const user = userEvent.setup()
    render(<Tour />)
    await user.click(screen.getByRole('button', { name: 'Back' }))
    expect(stepItem('Add your domain.')).not.toHaveAttribute('hidden')
    expect(window.location.hash).toBe('')
  })

  it('opens on the step named in the URL hash', () => {
    window.history.replaceState(null, '', '/#step-3')
    render(<Tour />)
    expect(stepItem('Ask a question.')).not.toHaveAttribute('hidden')
    expect(stepItem('Add your domain.')).toHaveAttribute('hidden')
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '3')
  })

  it('ignores a hash that is not a step of this tour', () => {
    window.history.replaceState(null, '', '/#step-9')
    render(<Tour />)
    expect(stepItem('Add your domain.')).not.toHaveAttribute('hidden')
  })

  it('follows the hash when it changes after load', () => {
    render(<Tour />)
    act(() => {
      window.history.replaceState(null, '', '/#step-2')
      window.dispatchEvent(new HashChangeEvent('hashchange'))
    })
    expect(stepItem('Copy the embed snippet.')).not.toHaveAttribute('hidden')
  })

  it('jumps to a step from the numbered buttons', async () => {
    const user = userEvent.setup()
    render(<Tour />)
    await user.click(screen.getByRole('button', { name: 'Go to step 3: Preview and test' }))
    expect(stepItem('Ask a question.')).not.toHaveAttribute('hidden')
    expect(screen.getByRole('button', { name: 'Go to step 3: Preview and test' })).toHaveAttribute(
      'aria-current',
      'step',
    )
  })

  it('announces each step change to screen readers', async () => {
    const user = userEvent.setup()
    render(<Tour />)
    const status = screen.getByRole('status')
    expect(status).toHaveAttribute('aria-live', 'polite')
    expect(status).toHaveTextContent('Step 1 of 3: Allow your domain')
    await user.click(screen.getByRole('button', { name: 'Next' }))
    expect(status).toHaveTextContent('Step 2 of 3: Copy the snippet')
  })

  it('works from the keyboard', async () => {
    const user = userEvent.setup()
    render(<Tour />)
    await user.tab()
    await user.tab()
    expect(screen.getByRole('button', { name: 'Go to step 1: Allow your domain' })).toHaveFocus()
    await user.keyboard('{Enter}')
    await user.tab()
    await user.tab()
    await user.tab()
    await user.tab()
    expect(screen.getByRole('button', { name: 'Next' })).toHaveFocus()
    await user.keyboard('{Enter}')
    expect(stepItem('Copy the embed snippet.')).not.toHaveAttribute('hidden')
  })

  it('shows every step again on request and returns to the tour', async () => {
    const user = userEvent.setup()
    render(<Tour />)
    await user.click(screen.getByRole('button', { name: 'Show all steps' }))
    expect(stepItem('Add your domain.')).not.toHaveAttribute('hidden')
    expect(stepItem('Copy the embed snippet.')).not.toHaveAttribute('hidden')
    expect(stepItem('Ask a question.')).not.toHaveAttribute('hidden')
    expect(screen.queryByRole('button', { name: 'Next' })).toBeNull()

    await user.click(screen.getByRole('button', { name: 'Show one step at a time' }))
    expect(stepItem('Copy the embed snippet.')).toHaveAttribute('hidden')
    expect(screen.getByRole('button', { name: 'Next' })).toBeInTheDocument()
  })
})
