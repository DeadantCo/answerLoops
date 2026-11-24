import { describe, expect, it, vi } from 'vitest'

// The real docs source pulls .mdx through vite, which fails to parse under
// vitest. This test only exercises the metadata path for one docs page.
vi.mock('@/lib/docs/source', () => ({
  docsSource: {
    getPage: (slug: string[]) =>
      slug.join('/') === 'integrations/slack'
        ? {
            url: '/docs/integrations/slack',
            data: { title: 'Slack', description: 'Connect Slack to answerLoops.' },
          }
        : undefined,
  },
}))
vi.mock('@/mdx-components', () => ({ getMDXComponents: () => ({}) }))
vi.mock('fumadocs-ui/page', () => ({
  DocsPage: () => null,
  DocsBody: () => null,
  DocsDescription: () => null,
  DocsTitle: () => null,
}))
vi.mock('@/components/marketing/page-schema', () => ({ PageSchema: () => null }))

import { generateMetadata } from '@/app/docs/[...slug]/page'

describe('docs page share image metadata', () => {
  it('includes a per-page Open Graph and Twitter image with size and alt text', async () => {
    const metadata = await generateMetadata({
      params: Promise.resolve({ slug: ['integrations', 'slack'] }),
    })

    const og = metadata.openGraph?.images as Array<Record<string, unknown>> | undefined
    expect(og).toBeDefined()
    expect(og).toEqual([
      expect.objectContaining({
        url: expect.stringContaining('/docs/integrations/slack'),
        width: 1200,
        height: 630,
        alt: expect.stringContaining('Slack'),
      }),
    ])
    expect(metadata.twitter?.images).toBeDefined()
  })
})
