import { describe, expect, it } from 'vitest'
import type { Root } from 'fumadocs-core/page-tree'
import {
  clampDocsShareTitle,
  docsSectionForUrl,
  docsShareImageAlt,
  docsShareImagePath,
  docsShareTitleFontSize,
} from '@/lib/docs/share-image'

const tree = {
  name: 'Docs',
  children: [
    { type: 'separator', name: 'Get started' },
    { type: 'page', name: 'Introduction', url: '/docs/introduction' },
    { type: 'separator', name: 'Use answerLoops' },
    {
      type: 'folder',
      name: 'Integrations',
      children: [
        { type: 'page', name: 'Slack', url: '/docs/integrations/slack' },
        {
          type: 'folder',
          name: 'Nested',
          children: [{ type: 'page', name: 'Deep', url: '/docs/integrations/nested/deep' }],
        },
      ],
    },
  ],
} as unknown as Root

describe('docs share image helpers', () => {
  it('names the top-level folder as the section', () => {
    expect(docsSectionForUrl(tree, '/docs/integrations/slack')).toBe('Integrations')
    expect(docsSectionForUrl(tree, '/docs/integrations/nested/deep')).toBe('Integrations')
  })

  it('uses the group heading for top-level pages and falls back to Docs', () => {
    expect(docsSectionForUrl(tree, '/docs/introduction')).toBe('Get started')
    expect(docsSectionForUrl(tree, '/docs/missing')).toBe('Docs')
  })

  it('shrinks the font as titles get longer and never grows back', () => {
    const sizes = ['a'.repeat(10), 'a'.repeat(30), 'a'.repeat(50), 'a'.repeat(80), 'a'.repeat(120)].map(
      docsShareTitleFontSize,
    )
    for (let i = 1; i < sizes.length; i++) expect(sizes[i]).toBeLessThan(sizes[i - 1])
  })

  it('truncates very long titles with an ellipsis and leaves short ones alone', () => {
    expect(clampDocsShareTitle('  Slack  ')).toBe('Slack')
    const clamped = clampDocsShareTitle('word '.repeat(60))
    expect(clamped.length).toBeLessThanOrEqual(120)
    expect(clamped.endsWith('…')).toBe(true)
  })

  it('builds the alt text and image path from the page', () => {
    expect(docsShareImageAlt('Slack')).toBe('Slack — answerLoops docs')
    expect(docsShareImagePath('/docs/integrations/slack')).toBe('/docs/integrations/slack/opengraph-image')
  })
})
