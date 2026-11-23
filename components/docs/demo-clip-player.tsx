'use client'

import { useEffect, useId, useRef, useState, useSyncExternalStore } from 'react'
import Image from 'next/image'
import { Pause, Play } from 'lucide-react'
import type { Clip } from './clips'

const NEAR_VIEWPORT_MARGIN = '200px'
const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)'

function subscribeToReducedMotion(onChange: () => void): () => void {
  const query = window.matchMedia(REDUCED_MOTION_QUERY)
  query.addEventListener('change', onChange)
  return () => query.removeEventListener('change', onChange)
}

const prefersReducedMotion = (): boolean | null => window.matchMedia(REDUCED_MOTION_QUERY).matches
// Unknown on the server, so the first paint never promises motion.
const reducedMotionOnServer = (): boolean | null => null

const subscribeToNothing = () => () => undefined
const hasIntersectionObserver = () => typeof IntersectionObserver !== 'undefined'
const assumeIntersectionObserver = () => true

export function DemoClipPlayer({ clip }: { clip: Clip }) {
  const descriptionId = useId()
  const frameRef = useRef<HTMLDivElement>(null)
  const [video, setVideo] = useState<HTMLVideoElement | null>(null)
  const reducedMotion = useSyncExternalStore(subscribeToReducedMotion, prefersReducedMotion, reducedMotionOnServer)
  const canObserve = useSyncExternalStore(subscribeToNothing, hasIntersectionObserver, assumeIntersectionObserver)
  const [seenNearViewport, setSeenNearViewport] = useState(false)
  const [intersecting, setIntersecting] = useState(false)
  const [startedByReader, setStartedByReader] = useState(false)
  const [pausedByReader, setPausedByReader] = useState(false)

  useEffect(() => {
    const frame = frameRef.current
    if (!frame || !canObserve) return
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[entries.length - 1]
        if (!entry) return
        if (entry.isIntersecting) setSeenNearViewport(true)
        setIntersecting(entry.isIntersecting)
      },
      { rootMargin: NEAR_VIEWPORT_MARGIN },
    )
    observer.observe(frame)
    return () => observer.disconnect()
  }, [canObserve])

  const near = !canObserve || seenNearViewport
  const inView = !canObserve || intersecting
  // Motion is only ever started automatically for readers who have not asked to reduce it.
  const showVideo = near && (reducedMotion === false || startedByReader)
  const showPlayButton = reducedMotion === true && !startedByReader

  // A reader who pressed play gets the browser's own controls and autoplay, and is left in charge of them.
  useEffect(() => {
    if (!video || startedByReader) return
    if (inView && !pausedByReader) void video.play().catch(() => undefined)
    else video.pause()
  }, [video, inView, pausedByReader, startedByReader])

  return (
    <figure className="not-prose my-8">
      <div className="overflow-hidden rounded-xl border border-fd-border bg-fd-card shadow-md">
        <div className="flex items-center gap-1.5 border-b border-fd-border bg-fd-muted px-3 py-2" aria-hidden="true">
          <span className="size-2.5 rounded-full bg-fd-border" />
          <span className="size-2.5 rounded-full bg-fd-border" />
          <span className="size-2.5 rounded-full bg-fd-border" />
        </div>
        <div ref={frameRef} className="relative w-full bg-fd-muted" style={{ aspectRatio: `${clip.width} / ${clip.height}` }}>
          {showVideo ? (
            <video
              ref={setVideo}
              className="block h-full w-full"
              width={clip.width}
              height={clip.height}
              poster={clip.poster}
              muted
              playsInline
              loop={!startedByReader}
              controls={startedByReader}
              autoPlay={startedByReader}
              preload="auto"
              aria-label={clip.title}
              aria-describedby={descriptionId}
            >
              <source src={clip.webm} type="video/webm" />
              <source src={clip.mp4} type="video/mp4" />
            </video>
          ) : (
            <Image
              src={clip.poster}
              width={clip.width}
              height={clip.height}
              alt={clip.title}
              sizes="(min-width: 1024px) 760px, 100vw"
              className="block h-full w-full"
            />
          )}
          {showVideo && !startedByReader && (
            <button
              type="button"
              onClick={() => setPausedByReader((paused) => !paused)}
              aria-label={`${pausedByReader ? 'Play' : 'Pause'} clip: ${clip.title}`}
              className="absolute bottom-3 right-3 flex size-9 items-center justify-center rounded-full bg-fd-background/90 text-fd-foreground shadow-md hover:bg-fd-background focus-visible:outline-2 focus-visible:outline-fd-primary"
            >
              {pausedByReader ? <Play className="ml-0.5 size-4" aria-hidden="true" /> : <Pause className="size-4" aria-hidden="true" />}
            </button>
          )}
          {showPlayButton && (
            <button
              type="button"
              onClick={() => setStartedByReader(true)}
              aria-label={`Play clip: ${clip.title}`}
              className="absolute inset-0 flex items-center justify-center bg-black/10 transition-colors hover:bg-black/20 focus-visible:outline-2 focus-visible:outline-offset-[-4px] focus-visible:outline-fd-primary"
            >
              <span className="flex size-14 items-center justify-center rounded-full bg-fd-background text-fd-foreground shadow-lg">
                <Play className="ml-0.5 size-6" aria-hidden="true" />
              </span>
            </button>
          )}
        </div>
      </div>
      <figcaption id={descriptionId} className="mt-2 text-center text-sm text-fd-muted-foreground">
        {clip.description}
      </figcaption>
    </figure>
  )
}
