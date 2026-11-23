'use client'

import { useId, useState } from 'react'
import { ArrowDown } from 'lucide-react'

export type DeflectionOutcome = 'posted' | 'review' | 'escalated'

export interface SampleAnswer {
  id: string
  question: string
  confidence: number
  answeredFully: boolean
}

export const DEFAULT_THRESHOLD = 0.8

export const SAMPLE_ANSWERS: SampleAnswer[] = [
  { id: 'api-key', question: 'How do I rotate my API key?', confidence: 0.94, answeredFully: true },
  { id: 'exports', question: 'Can I export my data as a CSV file?', confidence: 0.8, answeredFully: true },
  { id: 'sso', question: 'Does the Team plan include single sign-on?', confidence: 0.68, answeredFully: true },
  { id: 'webhook', question: 'Why does my webhook return a 401?', confidence: 0.91, answeredFully: false },
]

/**
 * The rule from the product: a draft qualifies when the reviewer's confidence
 * is at or above the threshold AND it judged the question fully answered.
 * Qualifying drafts post only while Automatic Deflections is on. With it off,
 * nothing at all is posted to the channel, so every draft waits for a person.
 */
export function deflectionOutcome({
  confidence,
  answeredFully,
  threshold,
  automaticDeflections,
}: {
  confidence: number
  answeredFully: boolean
  threshold: number
  automaticDeflections: boolean
}): { outcome: DeflectionOutcome; qualifies: boolean } {
  const qualifies = confidence >= threshold && answeredFully
  if (!automaticDeflections) return { outcome: 'review', qualifies }
  return { outcome: qualifies ? 'posted' : 'escalated', qualifies }
}

const OUTCOMES: Record<DeflectionOutcome, { title: string; dot: string; style: string }> = {
  posted: {
    title: 'Posted automatically',
    dot: 'bg-fd-primary',
    style: 'border-fd-primary/30 bg-fd-card',
  },
  review: {
    title: 'Held as a draft for review',
    dot: 'bg-amber-500',
    style: 'border-amber-300 bg-amber-50 dark:border-amber-500 dark:text-slate-900',
  },
  escalated: {
    title: 'Escalated to a person',
    dot: 'bg-orange-500',
    style: 'border-orange-300 bg-orange-50 dark:border-orange-500 dark:text-slate-900',
  },
}

const OUTCOME_ORDER: DeflectionOutcome[] = ['posted', 'review', 'escalated']

function explainOutcome(outcome: DeflectionOutcome, qualifies: boolean): string {
  if (outcome === 'posted') {
    return 'The answer is posted in the channel, with a prompt for the customer to react with a thumbs up or down.'
  }
  if (outcome === 'escalated') {
    return 'The draft is not posted. A short acknowledgment goes to the channel and mentions your escalation contact, and the draft waits on the ticket for your team.'
  }
  return qualifies
    ? 'The draft would qualify, but Automatic Deflections is off, so your team approves it before anything is sent. The customer gets no automated answer.'
    : 'The draft does not qualify, and Automatic Deflections is off, so nothing is posted to the channel, not even an acknowledgment. The draft and a notification wait for your team.'
}

/**
 * The confidence threshold and Automatic Deflections as something you can
 * move. Pick a made-up answer, drag the threshold, flip the toggle, and the
 * pipeline lights up to the place the answer would end up.
 */
export function DeflectionDiagram() {
  const id = useId()
  const [threshold, setThreshold] = useState(DEFAULT_THRESHOLD)
  const [automaticDeflections, setAutomaticDeflections] = useState(true)
  const [answerId, setAnswerId] = useState(SAMPLE_ANSWERS[0].id)

  const answer = SAMPLE_ANSWERS.find((a) => a.id === answerId) ?? SAMPLE_ANSWERS[0]
  const { outcome, qualifies } = deflectionOutcome({
    confidence: answer.confidence,
    answeredFully: answer.answeredFully,
    threshold,
    automaticDeflections,
  })
  const thresholdText = threshold.toFixed(2)
  const scoreText = answer.confidence.toFixed(2)
  const confidenceClears = answer.confidence >= threshold

  const summary = `Sample answer "${answer.question}" scores ${scoreText} against a threshold of ${thresholdText}, and the reviewer ${
    answer.answeredFully ? 'judged it fully answered' : 'judged it not fully answered'
  }. Automatic Deflections is ${automaticDeflections ? 'on' : 'off'}. Result: ${OUTCOMES[outcome].title}. ${explainOutcome(outcome, qualifies)}`

  const steps = [
    { title: 'A question arrives', detail: answer.question },
    { title: 'Relevant knowledge is found', detail: 'Your knowledge base and your team’s earlier answers' },
    { title: 'A drafting step writes a reply', detail: 'Based on that material' },
    {
      title: 'A separate review scores the draft',
      detail: `Score ${scoreText}. ${answer.answeredFully ? 'Fully answers the question' : 'Does not fully answer the question'}`,
    },
    {
      title: 'Your settings decide',
      detail: `${confidenceClears ? 'Score at or above' : 'Score below'} the ${thresholdText} threshold. Automatic Deflections ${
        automaticDeflections ? 'on' : 'off'
      }`,
    },
  ]

  return (
    <figure
      className="not-prose mt-2 mb-8 overflow-hidden rounded-2xl border border-fd-border bg-fd-card"
      aria-label="Interactive diagram: how the confidence threshold and Automatic Deflections decide what happens to an answer"
    >
      <div className="grid gap-4 p-4 sm:p-5">
        <fieldset className="min-w-0">
          <legend className="mb-2 text-xs font-medium uppercase tracking-wide text-fd-muted-foreground">
            Sample answer (made-up examples)
          </legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {SAMPLE_ANSWERS.map((sample) => (
              <label
                key={sample.id}
                htmlFor={`${id}-answer-${sample.id}`}
                className="grid min-w-0 cursor-pointer grid-cols-[auto_minmax(0,1fr)] items-start gap-x-2 gap-y-0.5 rounded-xl border border-fd-border p-3 text-sm transition-colors hover:border-fd-primary/50 has-[:checked]:border-fd-primary has-[:checked]:bg-fd-accent has-[:checked]:ring-2 has-[:checked]:ring-fd-primary/20 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-fd-ring motion-reduce:transition-none"
              >
                <input
                  type="radio"
                  id={`${id}-answer-${sample.id}`}
                  name={`${id}-answer`}
                  value={sample.id}
                  checked={answerId === sample.id}
                  onChange={() => setAnswerId(sample.id)}
                  className="mt-1 shrink-0 accent-fd-primary"
                />
                <span className="min-w-0 break-words font-medium">{sample.question}</span>
                <span className="col-start-2 min-w-0 text-xs text-fd-muted-foreground">
                  Score {sample.confidence.toFixed(2)},{' '}
                  {sample.answeredFully ? 'fully answered' : 'not fully answered'}
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
          <div className="min-w-0">
            <div className="flex items-baseline justify-between gap-2 text-sm font-medium">
              <label htmlFor={`${id}-threshold`}>Confidence threshold</label>
              <output htmlFor={`${id}-threshold`} className="font-mono text-fd-primary">
                {thresholdText}
              </output>
            </div>
            <input
              id={`${id}-threshold`}
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={threshold}
              onChange={(e) => setThreshold(Number(e.target.value))}
              aria-valuetext={`${thresholdText} out of 1`}
              className="mt-2 w-full accent-fd-primary"
            />
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              role="switch"
              id={`${id}-toggle`}
              aria-checked={automaticDeflections}
              aria-labelledby={`${id}-toggle-label`}
              onClick={() => setAutomaticDeflections((on) => !on)}
              className={`relative h-6 w-11 shrink-0 rounded-full border transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fd-ring motion-reduce:transition-none ${
                automaticDeflections ? 'border-fd-primary bg-fd-primary' : 'border-fd-border bg-fd-muted'
              }`}
            >
              <span
                aria-hidden="true"
                className={`absolute top-0.5 left-0.5 size-4.5 rounded-full bg-white shadow transition-transform motion-reduce:transition-none ${
                  automaticDeflections ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
            <span id={`${id}-toggle-label`} className="text-sm font-medium">
              Automatic Deflections
              <span className="ml-1 text-fd-muted-foreground">{automaticDeflections ? 'On' : 'Off'}</span>
            </span>
          </div>
        </div>

        <ol className="flex flex-col gap-1" aria-label="Pipeline steps for the selected answer">
          {steps.map((step, i) => (
            <li key={step.title} className="flex flex-col gap-1">
              <div className="flex min-w-0 items-start gap-3 rounded-xl border border-fd-primary bg-fd-accent p-3 transition-colors motion-reduce:transition-none">
                <span
                  aria-hidden="true"
                  className="flex size-7 shrink-0 items-center justify-center rounded-full bg-fd-primary text-xs font-semibold text-fd-primary-foreground"
                >
                  {i + 1}
                </span>
                <span className="min-w-0 break-words text-sm">
                  <span className="block font-medium">{step.title}</span>
                  <span className="block text-fd-muted-foreground">{step.detail}</span>
                </span>
              </div>
              <ArrowDown aria-hidden="true" className="mx-auto size-4 text-fd-muted-foreground" />
            </li>
          ))}
        </ol>

        <ul className="grid gap-2 sm:grid-cols-3" aria-label="Possible outcomes">
          {OUTCOME_ORDER.map((key) => {
            const active = key === outcome
            const { title, dot, style } = OUTCOMES[key]
            return (
              <li
                key={key}
                aria-current={active ? 'true' : undefined}
                data-active={active}
                className={`flex min-w-0 items-center gap-2 rounded-xl border p-3 text-sm transition-all motion-reduce:transition-none ${
                  active ? `${style} font-semibold ring-2 ring-fd-primary` : 'border-fd-border opacity-50'
                }`}
              >
                <span aria-hidden="true" className={`size-2.5 shrink-0 rounded-full ${dot}`} />
                <span className="min-w-0 break-words">
                  {title}
                  {active ? <span className="sr-only"> (this answer ends up here)</span> : null}
                </span>
              </li>
            )
          })}
        </ul>
      </div>

      <figcaption
        aria-live="polite"
        className="border-t border-fd-border bg-fd-muted/60 px-4 py-3 text-sm sm:px-5"
      >
        <span className="font-semibold">{OUTCOMES[outcome].title}.</span>{' '}
        <span className="text-fd-muted-foreground">{explainOutcome(outcome, qualifies)}</span>
        <span className="sr-only"> {summary}</span>
      </figcaption>
    </figure>
  )
}
