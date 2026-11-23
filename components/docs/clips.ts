import clipsData from '@/lib/docs/clips.generated.json'

export interface Clip {
  title: string
  description: string
  webm: string
  mp4: string
  /** Still image shown before the clip loads, and instead of it for readers who prefer reduced motion. */
  poster: string
  width: number
  height: number
  durationSeconds: number
}

const CLIPS = clipsData as Record<string, Clip>

/** A clip written by `pnpm docs:clips`. Fails loudly at build time if the id is wrong. */
export function getClip(id: string): Clip {
  const clip = CLIPS[id]
  if (!clip) {
    throw new Error(
      `Unknown demo clip "${id}". Known clips: ${Object.keys(CLIPS).join(', ') || '(none)'}. Run pnpm docs:clips to regenerate.`,
    )
  }
  return clip
}
