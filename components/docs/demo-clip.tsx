import { getClip } from './clips'
import { DemoClipPlayer } from './demo-clip-player'

/**
 * A short looping clip of a workflow in the demo workspace, in the same window
 * frame as <Screenshot>. `clip` is an id from lib/docs/clips.generated.json;
 * the files, size, title and text description all come from there, so a
 * re-recording updates every page. Plays muted and inline once it is near the
 * viewport; readers who prefer reduced motion get the still image and a play
 * button.
 */
export function DemoClip({ clip }: { clip: string }) {
  const data = getClip(clip)
  return <DemoClipPlayer clip={data} />
}
