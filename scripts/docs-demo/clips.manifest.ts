/**
 * Short looping clips of scripted flows in the demo workspace, recorded by
 * `pnpm docs:clips` (see clips.ts and README.md, "Clips").
 *
 * Selectors are Playwright selectors, as in shots.manifest.ts. Every selector a
 * step uses must resolve; the run fails loudly otherwise, so a UI refactor is
 * caught instead of recording a flow that no longer works.
 */

import type { ViewportSize } from './shots.manifest'

export type ClipStep =
  /** Glide the cursor to the element, then click it. */
  | { click: string }
  /** Type into the field one key at a time, so the clip shows it being filled in. */
  | { type: string; value: string }
  /** Scroll the page's main column so this element sits near the top. */
  | { scrollTo: string }
  | { waitFor: string }
  /** Hold the current frame for this many milliseconds. */
  | { pause: number }
  /** Save the current screen as the still image shown instead of the video. Exactly once per clip. */
  | { poster: true }

export interface Clip {
  /** kebab-case; becomes public/docs/clips/<id>.{webm,mp4,webp} and the JSON key */
  id: string
  /** Short name, used as the accessible name of the player. */
  title: string
  /** What the clip shows, in a sentence or two. Shown under it and read by screen readers. */
  description: string
  route: string
  /** Defaults to 1280x720. */
  viewport?: ViewportSize
  /** Run before recording starts (not part of the video) to put the workspace in the starting state. */
  setup?: ClipStep[]
  /** Selectors that must be visible before recording starts. */
  waitFor: string[]
  /** The recorded flow. */
  steps: ClipStep[]
}

export const DEFAULT_CLIP_VIEWPORT: ViewportSize = { width: 1280, height: 720 }

/**
 * Shaped like a Telegram bot token so the form accepts it. Built at run time
 * rather than written out, and entered into a password field, so it is never
 * shown and never looks like a real credential.
 */
const DEMO_TELEGRAM_TOKEN = `${'0'.repeat(9)}:${'demo-workspace-clip-'.padEnd(35, '0')}`

export const CLIPS: Clip[] = [
  {
    id: 'approve-draft',
    title: 'Approving a draft in the review queue',
    description:
      'A ticket flagged for human review. The reviewer reads the AI draft answer and clicks Approve, and the draft is marked approved and posted back to the channel the question came from.',
    route: '/tickets/73',
    waitFor: ['h1:has-text("Scout-L2 wiring diagram")', 'text=AI needs review', 'text=AI Draft Answer'],
    steps: [
      { scrollTo: 'text=AI Draft Answer' },
      { poster: true },
      { pause: 1500 },
      { click: 'form:has(input[name="action"][value="approve"]) button' },
      { waitFor: 'span:text-is("Approved")' },
      { pause: 2500 },
    ],
  },
  {
    id: 'connect-channel',
    title: 'Connecting a channel',
    description:
      'The Telegram tab of the Integrations page. The reviewer pastes a bot token, names the chat to monitor and clicks Connect, and the card switches to Active.',
    route: '/integrations?tab=telegram',
    setup: [
      { click: 'button:has-text("Edit chats")' },
      { click: 'button:text-is("Disconnect")' },
      { waitFor: 'text=Not connected' },
    ],
    waitFor: ['text=Not connected', 'input[name="botToken"]'],
    steps: [
      { poster: true },
      { pause: 1200 },
      { click: 'input[name="botToken"]' },
      { type: 'input[name="botToken"]', value: DEMO_TELEGRAM_TOKEN },
      { pause: 500 },
      { click: 'input[name="chatIds"]' },
      { type: 'input[name="chatIds"]', value: '-1009000000001' },
      { pause: 800 },
      { click: 'button:text-is("Connect")' },
      { waitFor: 'span:text-is("Active")' },
      { pause: 2500 },
    ],
  },
]
