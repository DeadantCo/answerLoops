// @vitest-environment happy-dom
import { act, createElement } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { DemoClip } from '@/components/docs/demo-clip'
import { DemoClipPlayer } from '@/components/docs/demo-clip-player'

vi.mock('next/image', () => ({
  default: ({ src, alt, width, height }: { src: string; alt: string; width: number; height: number }) =>
    createElement('img', { src, alt, width, height }),
}))

vi.mock('@/components/docs/clips', () => ({
  getClip: (id: string) => {
    if (id !== 'demo') throw new Error(`Unknown demo clip "${id}"`)
    return clip
  },
}))

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const clip = {
  title: 'Approving a draft',
  description: 'The reviewer reads the draft and clicks Approve.',
  webm: '/docs/clips/demo.webm',
  mp4: '/docs/clips/demo.mp4',
  poster: '/docs/clips/demo.webp',
  width: 1280,
  height: 720,
  durationSeconds: 8,
}

type ObserverCallback = (entries: Array<{ isIntersecting: boolean }>) => void
let observerCallback: ObserverCallback | null = null
let observerOptions: IntersectionObserverInit | undefined
let reducedMotion = false
const play = vi.fn(() => Promise.resolve())
const pause = vi.fn()

function scrollIntoRange(isIntersecting: boolean) {
  act(() => observerCallback?.([{ isIntersecting }]))
}

beforeEach(() => {
  observerCallback = null
  observerOptions = undefined
  reducedMotion = false
  play.mockClear()
  pause.mockClear()
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      constructor(callback: ObserverCallback, options?: IntersectionObserverInit) {
        observerCallback = callback
        observerOptions = options
      }
      observe() {}
      disconnect() {}
    },
  )
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query.includes('prefers-reduced-motion') && reducedMotion,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }))
  HTMLMediaElement.prototype.play = play
  HTMLMediaElement.prototype.pause = pause
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('DemoClip', () => {
  it('fails loudly for an unknown clip id', () => {
    expect(() => render(<DemoClip clip="nope" />)).toThrow(/Unknown demo clip "nope"/)
  })

  it('renders the clip it is given', () => {
    render(<DemoClip clip="demo" />)
    expect(screen.getByRole('img', { name: clip.title })).toHaveAttribute('src', clip.poster)
  })
})

describe('DemoClipPlayer: loading', () => {
  it('shows only the still image, and loads no video, until it is near the viewport', () => {
    const { container } = render(<DemoClipPlayer clip={clip} />)
    expect(container.querySelector('video')).toBeNull()
    expect(container.querySelector('source')).toBeNull()
    const still = screen.getByRole('img', { name: clip.title })
    expect(still).toHaveAttribute('src', clip.poster)
    expect(still).toHaveAttribute('width', '1280')
    expect(still).toHaveAttribute('height', '720')
  })

  it('starts observing with a margin so the video is ready as it scrolls in', () => {
    render(<DemoClipPlayer clip={clip} />)
    expect(observerOptions?.rootMargin).toBe('200px')
  })

  it('mounts a muted, looping, inline video with both formats once it is near the viewport', () => {
    const { container } = render(<DemoClipPlayer clip={clip} />)
    scrollIntoRange(true)
    const video = container.querySelector('video') as HTMLVideoElement
    expect(video).not.toBeNull()
    expect(video.muted).toBe(true)
    expect(video.loop).toBe(true)
    expect(video).toHaveAttribute('playsinline')
    expect(video).toHaveAttribute('poster', clip.poster)
    expect(video).not.toHaveAttribute('controls')
    const sources = Array.from(container.querySelectorAll('source')).map((s) => [s.getAttribute('src'), s.getAttribute('type')])
    expect(sources).toEqual([
      [clip.webm, 'video/webm'],
      [clip.mp4, 'video/mp4'],
    ])
    expect(play).toHaveBeenCalled()
  })

  it('pauses when scrolled away and plays again when it returns', () => {
    render(<DemoClipPlayer clip={clip} />)
    scrollIntoRange(true)
    play.mockClear()
    scrollIntoRange(false)
    expect(pause).toHaveBeenCalled()
    scrollIntoRange(true)
    expect(play).toHaveBeenCalled()
  })

  it('lets the reader pause and resume an autoplaying clip, even after scrolling away and back', () => {
    render(<DemoClipPlayer clip={clip} />)
    scrollIntoRange(true)
    fireEvent.click(screen.getByRole('button', { name: `Pause clip: ${clip.title}` }))
    expect(pause).toHaveBeenCalled()
    play.mockClear()
    scrollIntoRange(false)
    scrollIntoRange(true)
    expect(play).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: `Play clip: ${clip.title}` }))
    expect(play).toHaveBeenCalled()
  })

  it('treats the clip as near the viewport when IntersectionObserver is unavailable', () => {
    vi.stubGlobal('IntersectionObserver', undefined)
    const { container } = render(<DemoClipPlayer clip={clip} />)
    expect(container.querySelector('video')).not.toBeNull()
  })
})

describe('DemoClipPlayer: reduced motion', () => {
  beforeEach(() => {
    reducedMotion = true
  })

  it('never autoplays: it keeps the still and offers a play button, even in view', () => {
    const { container } = render(<DemoClipPlayer clip={clip} />)
    scrollIntoRange(true)
    expect(container.querySelector('video')).toBeNull()
    expect(screen.getByRole('img', { name: clip.title })).toHaveAttribute('src', clip.poster)
    expect(screen.getByRole('button', { name: `Play clip: ${clip.title}` })).toBeInTheDocument()
    expect(play).not.toHaveBeenCalled()
  })

  it('plays once, with controls and no loop, when the reader presses play', () => {
    const { container } = render(<DemoClipPlayer clip={clip} />)
    scrollIntoRange(true)
    fireEvent.click(screen.getByRole('button', { name: `Play clip: ${clip.title}` }))
    const video = container.querySelector('video') as HTMLVideoElement
    expect(video).not.toBeNull()
    expect(video.loop).toBe(false)
    expect(video).toHaveAttribute('controls')
    expect(video.autoplay).toBe(true)
    expect(screen.queryByRole('button', { name: /Play clip/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /Pause clip/ })).toBeNull()
  })

  it('does not show a play button to readers who have not asked to reduce motion', () => {
    reducedMotion = false
    render(<DemoClipPlayer clip={clip} />)
    scrollIntoRange(true)
    expect(screen.queryByRole('button', { name: /Play clip/ })).toBeNull()
  })
})

describe('DemoClipPlayer: text description', () => {
  it('shows the description under the clip and links it to the video', () => {
    const { container } = render(<DemoClipPlayer clip={clip} />)
    const caption = screen.getByText(clip.description)
    expect(caption.tagName).toBe('FIGCAPTION')
    scrollIntoRange(true)
    const video = container.querySelector('video') as HTMLVideoElement
    expect(video.getAttribute('aria-describedby')).toBe(caption.id)
    expect(video).toHaveAttribute('aria-label', clip.title)
  })

  it('shows the description in reduced-motion mode too', () => {
    reducedMotion = true
    render(<DemoClipPlayer clip={clip} />)
    expect(screen.getByText(clip.description)).toBeInTheDocument()
  })
})
