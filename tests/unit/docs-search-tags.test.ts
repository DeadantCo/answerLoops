import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { createFromSource, createSearchAPI } from 'fumadocs-core/search/server'
import { buildDocsSearchIndex } from '@/lib/docs/search-index'

const structured = {
  headings: [],
  contents: [{ heading: undefined, content: 'Connect your server to answerLoops with a sending domain.' }],
}

describe('docs search by frontmatter tags', () => {
  it('the docs frontmatter schema declares an optional tags list', () => {
    const config = fs.readFileSync(path.join(process.cwd(), 'source.config.ts'), 'utf-8')
    const docsBlock = config.slice(config.indexOf('export const docs ='), config.indexOf('export const blog ='))
    expect(docsBlock).toMatch(/tags:\s*z\.array\(z\.string\(\)\)\.optional\(\)/)
  })

  it('a search for a tag that is not in the page body finds the page', async () => {
    const page = {
      url: '/docs/integrations/email',
      data: { title: 'Email', description: 'Email setup', tags: ['webhook'], structuredData: structured },
    } as never
    const index = await buildDocsSearchIndex(page)
    const api = createSearchAPI('advanced', { indexes: [index] })
    const results = await api.search('webhook')
    expect(results.map((r) => r.url)).toContain('/docs/integrations/email')
  })

  it('a page with no tags indexes exactly as before', async () => {
    const page = {
      url: '/docs/product/team',
      data: { title: 'Team', description: 'Team setup', structuredData: structured },
    } as never
    const index = await buildDocsSearchIndex(page)
    expect(index.structuredData.contents).toHaveLength(1)
  })

  it('drops blank and repeated tags and shows the tags as a readable record', async () => {
    const page = {
      url: '/docs/integrations/email',
      data: { title: 'Email', tags: ['webhook', ' webhook ', '', 'inbound email'], structuredData: structured },
    } as never
    const index = await buildDocsSearchIndex(page)
    expect(index.structuredData.contents[0].content).toBe('Related topics: webhook, inbound email')
  })

  it('the search endpoint, built the way the docs route builds it, returns a page for a tag', async () => {
    const pages = [
      { url: '/docs/integrations/openai', data: { title: 'OpenAI', description: 'Use your own key', tags: ['byok'], structuredData: structured } },
      { url: '/docs/product/team', data: { title: 'Team', description: 'Invite teammates', structuredData: structured } },
    ]
    const loader = {
      getPages: () => pages,
      getPageTree: () => ({ name: 'Docs', children: [] }),
      getNodePage: () => undefined,
      getPageByHref: () => undefined,
      _i18n: undefined,
    } as never
    const { GET } = createFromSource(loader, { buildIndex: buildDocsSearchIndex as never })
    const res = await GET(new Request('http://localhost/docs/api/search?query=byok'))
    const urls = ((await res.json()) as { url: string }[]).map((r) => r.url.split('#')[0])
    expect(urls).toContain('/docs/integrations/openai')
    expect(urls).not.toContain('/docs/product/team')
  })

  it('the docs route indexes through buildDocsSearchIndex', () => {
    const route = fs.readFileSync(path.join(process.cwd(), 'app/docs/api/search/route.ts'), 'utf-8')
    expect(route).toMatch(/buildIndex: buildDocsSearchIndex/)
  })

  it('the most-visited docs pages declare tags', () => {
    const root = path.join(process.cwd(), 'content/docs')
    const walk = (dir: string): string[] =>
      fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
        e.isDirectory() ? walk(path.join(dir, e.name)) : e.name.endsWith('.mdx') ? [path.join(dir, e.name)] : [],
      )
    const tagged = walk(root).filter((f) => /^tags:\s*\[.+\]\s*$/m.test(fs.readFileSync(f, 'utf-8').split('\n---\n')[0]))
    expect(tagged.length).toBeGreaterThanOrEqual(15)
  })
})
