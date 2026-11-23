// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {
  DeflectionDiagram,
  SAMPLE_ANSWERS,
  deflectionOutcome,
} from '@/components/docs/deflection-diagram'

const caption = (container: HTMLElement) => container.querySelector('figcaption') as HTMLElement
const slider = () => screen.getByRole('slider', { name: /Confidence threshold/ })
const toggle = () => screen.getByRole('switch', { name: /Automatic Deflections/ })
const pick = async (user: ReturnType<typeof userEvent.setup>, question: RegExp) =>
  user.click(screen.getByRole('radio', { name: question }))
const activeOutcome = () =>
  screen
    .getByRole('list', { name: 'Possible outcomes' })
    .querySelector('[data-active="true"]')!.textContent

describe('deflectionOutcome', () => {
  const qualifying = { confidence: 0.9, answeredFully: true, threshold: 0.8 }

  it.each([
    [{ ...qualifying }, true, 'posted'],
    [{ ...qualifying }, false, 'review'],
    [{ ...qualifying, confidence: 0.5 }, true, 'escalated'],
    [{ ...qualifying, confidence: 0.5 }, false, 'review'],
    [{ ...qualifying, answeredFully: false }, true, 'escalated'],
    [{ ...qualifying, answeredFully: false }, false, 'review'],
  ] as const)('%j with Automatic Deflections %s gives %s', (input, automaticDeflections, expected) => {
    expect(deflectionOutcome({ ...input, automaticDeflections }).outcome).toBe(expected)
  })

  it('treats a score exactly at the threshold as qualifying', () => {
    expect(deflectionOutcome({ ...qualifying, confidence: 0.8, automaticDeflections: true })).toEqual({
      outcome: 'posted',
      qualifies: true,
    })
  })

  it('never posts when Automatic Deflections is off, whatever the score', () => {
    for (const confidence of [0, 0.5, 0.8, 1]) {
      expect(
        deflectionOutcome({ confidence, answeredFully: true, threshold: 0, automaticDeflections: false }).outcome,
      ).toBe('review')
    }
  })
})

describe('DeflectionDiagram', () => {
  it('starts at the default 0.8 threshold with Automatic Deflections on and a high-scoring answer posted', () => {
    const { container } = render(<DeflectionDiagram />)
    expect(slider()).toHaveValue('0.8')
    expect(toggle()).toHaveAttribute('aria-checked', 'true')
    expect(activeOutcome()).toContain('Posted automatically')
    expect(caption(container)).toHaveTextContent('Posted automatically.')
  })

  it('offers one sample answer per outcome', async () => {
    const user = userEvent.setup()
    render(<DeflectionDiagram />)
    expect(SAMPLE_ANSWERS.length).toBeGreaterThanOrEqual(3)

    await pick(user, /rotate my API key/)
    expect(activeOutcome()).toContain('Posted automatically')

    await pick(user, /webhook return a 401/)
    expect(activeOutcome()).toContain('Escalated to a person')

    await user.click(toggle())
    expect(activeOutcome()).toContain('Held as a draft for review')
  })

  it('moves a borderline answer from posted to escalated as the threshold rises', () => {
    render(<DeflectionDiagram />)
    fireEvent.click(screen.getByRole('radio', { name: /single sign-on/ }))
    expect(activeOutcome()).toContain('Escalated to a person')

    fireEvent.change(slider(), { target: { value: '0.65' } })
    expect(activeOutcome()).toContain('Posted automatically')

    fireEvent.change(slider(), { target: { value: '0.7' } })
    expect(activeOutcome()).toContain('Escalated to a person')
  })

  it('posts an answer scoring exactly the threshold', () => {
    render(<DeflectionDiagram />)
    fireEvent.click(screen.getByRole('radio', { name: /CSV file/ }))
    expect(activeOutcome()).toContain('Posted automatically')
    fireEvent.change(slider(), { target: { value: '0.85' } })
    expect(activeOutcome()).toContain('Escalated to a person')
  })

  it('never posts a confident answer the reviewer judged not fully answered', () => {
    render(<DeflectionDiagram />)
    fireEvent.click(screen.getByRole('radio', { name: /webhook return a 401/ }))
    fireEvent.change(slider(), { target: { value: '0' } })
    expect(activeOutcome()).toContain('Escalated to a person')
  })

  it('holds every answer for review, with nothing posted, while Automatic Deflections is off', async () => {
    const user = userEvent.setup()
    const { container } = render(<DeflectionDiagram />)
    await user.click(toggle())
    expect(toggle()).toHaveAttribute('aria-checked', 'false')

    await pick(user, /rotate my API key/)
    expect(activeOutcome()).toContain('Held as a draft for review')
    expect(caption(container)).toHaveTextContent('approves it before anything is sent')

    await pick(user, /single sign-on/)
    expect(activeOutcome()).toContain('Held as a draft for review')
    expect(caption(container)).toHaveTextContent('nothing is posted to the channel')
  })

  it('uses a native range input so the browser steps it with the arrow keys', async () => {
    const user = userEvent.setup()
    render(<DeflectionDiagram />)
    expect(slider()).toHaveAttribute('type', 'range')
    expect(slider()).toHaveAttribute('min', '0')
    expect(slider()).toHaveAttribute('max', '1')
    expect(slider()).toHaveAttribute('step', '0.05')
    expect(slider()).toHaveAttribute('aria-valuetext', '0.80 out of 1')
    await user.tab()
    expect(screen.getAllByRole('radio')[0]).toHaveFocus()
    fireEvent.change(slider(), { target: { value: '0.85' } })
    expect(slider()).toHaveAttribute('aria-valuetext', '0.85 out of 1')
  })

  it('operates the toggle and the sample answers from the keyboard', async () => {
    const user = userEvent.setup()
    render(<DeflectionDiagram />)
    toggle().focus()
    await user.keyboard('{Enter}')
    expect(toggle()).toHaveAttribute('aria-checked', 'false')
    await user.keyboard(' ')
    expect(toggle()).toHaveAttribute('aria-checked', 'true')

    screen.getByRole('radio', { name: /rotate my API key/ }).focus()
    await user.keyboard('{ArrowDown}')
    expect(screen.getByRole('radio', { name: /CSV file/ })).toBeChecked()
  })

  it('announces the result politely and spells out the full situation for screen readers', () => {
    const { container } = render(<DeflectionDiagram />)
    expect(caption(container)).toHaveAttribute('aria-live', 'polite')
    expect(caption(container)).toHaveTextContent(
      'scores 0.94 against a threshold of 0.80, and the reviewer judged it fully answered. Automatic Deflections is on. Result: Posted automatically.',
    )
    expect(screen.getByRole('list', { name: 'Possible outcomes' }).querySelector('[aria-current="true"]')).not.toBeNull()
  })

  it('lights up the five pipeline steps with the selected answer and settings', () => {
    render(<DeflectionDiagram />)
    const steps = screen.getByRole('list', { name: 'Pipeline steps for the selected answer' })
    expect(steps.querySelectorAll(':scope > li')).toHaveLength(5)
    expect(steps).toHaveTextContent('How do I rotate my API key?')
    expect(steps).toHaveTextContent('Score 0.94. Fully answers the question')
    expect(steps).toHaveTextContent('Score at or above the 0.80 threshold. Automatic Deflections on')
  })

  it('keeps motion off for people who prefer reduced motion and avoids fixed widths', () => {
    const { container } = render(<DeflectionDiagram />)
    expect(container.innerHTML).toContain('motion-reduce:transition-none')
    expect(container.innerHTML).not.toMatch(/\bw-\[\d+px\]|\bmin-w-\[\d+px\]/)
  })
})
