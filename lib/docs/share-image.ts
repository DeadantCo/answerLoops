import type { Root } from 'fumadocs-core/page-tree'

export const DOCS_SHARE_IMAGE_SIZE = { width: 1200, height: 630 }

const DEFAULT_SECTION = 'Docs'

function containsUrl(node: Root['children'][number], url: string): boolean {
  if (node.type === 'page') return node.url === url
  if (node.type !== 'folder') return false
  if (node.index?.url === url) return true
  return node.children.some((child) => containsUrl(child, url))
}

/**
 * The sidebar section a docs page sits in: the top-level folder that holds it
 * ("Integrations"), or the group heading above it for top-level pages
 * ("Get started"). Falls back to "Docs".
 */
export function docsSectionForUrl(tree: Root, url: string): string {
  let heading: string | undefined
  for (const node of tree.children) {
    if (node.type === 'separator') {
      if (typeof node.name === 'string') heading = node.name
      continue
    }
    if (!containsUrl(node, url)) continue
    if (node.type === 'folder' && typeof node.name === 'string') return node.name
    return heading ?? DEFAULT_SECTION
  }
  return DEFAULT_SECTION
}

/** Step the title font size down as the title gets longer so it stays inside the card. */
export function docsShareTitleFontSize(title: string): number {
  const length = title.length
  if (length <= 24) return 84
  if (length <= 40) return 68
  if (length <= 64) return 56
  if (length <= 96) return 46
  return 38
}

const MAX_TITLE_LENGTH = 120

export function clampDocsShareTitle(title: string): string {
  const trimmed = title.trim()
  if (trimmed.length <= MAX_TITLE_LENGTH) return trimmed
  return `${trimmed.slice(0, MAX_TITLE_LENGTH - 1).trimEnd()}…`
}

export function docsShareImageAlt(title: string): string {
  return `${title} — answerLoops docs`
}

/** Public URL of a page's share image; next.config.ts rewrites it to app/docs/og/[...slug]. */
export function docsShareImagePath(pageUrl: string): string {
  return `${pageUrl}/opengraph-image`
}
