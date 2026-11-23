import { describe, expect, it } from 'vitest'
import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import { Script } from 'node:vm'
import clipsData from '@/lib/docs/clips.generated.json'
import {
  assertClipsPreflight,
  buildEncodeArgs,
  CURSOR_SCRIPT,
  liveMasksScript,
  parseDurationSeconds,
  validateClips,
} from '@/scripts/docs-demo/clips'
import { CLIPS, type Clip } from '@/scripts/docs-demo/clips.manifest'
import { DEFAULT_TEXT_MASKS } from '@/scripts/docs-demo/shots.manifest'

const LOCAL_ENV = {
  DATABASE_URL: 'postgres://community:community@localhost:5545/community',
  DOCS_BASE_URL: 'http://localhost:3112',
}

const read = (file: string) => readFile(path.join(process.cwd(), file), 'utf8')

function clipWith(overrides: Partial<Clip>): Clip {
  return { ...CLIPS[0], ...overrides }
}

describe('clip script refuses to run outside a local demo setup', () => {
  it('accepts a local database and a local app', () => {
    expect(assertClipsPreflight(LOCAL_ENV).origin).toBe('http://localhost:3112')
  })

  it.each([
    ['a hosted database', { DATABASE_URL: 'postgres://user:pw@db.example.net:5432/community' }],
    ['a look-alike host', { DATABASE_URL: 'postgres://user:pw@localhost.example.net/community' }],
    ['a missing database url', { DATABASE_URL: undefined }],
    ['a non-local direct database url', { DIRECT_DATABASE_URL: 'postgres://user:pw@db.example.net:5432/community' }],
    ['a database host override', { DATABASE_URL: 'postgres://user:pw@localhost/community?host=db.example.net' }],
    ['production mode', { NODE_ENV: 'production' }],
    ['a hosting platform', { RAILWAY_ENVIRONMENT: 'production' }],
    ['a non-local app', { DOCS_BASE_URL: 'https://app.answerloops.com' }],
  ])('refuses %s', (_label, override) => {
    expect(() => assertClipsPreflight({ ...LOCAL_ENV, ...override })).toThrow()
  })

  it('runs the preflight before anything else in main', async () => {
    const source = await read('scripts/docs-demo/clips.ts')
    const main = source.slice(source.indexOf('async function main()'))
    expect(main.indexOf('assertClipsPreflight()')).toBeGreaterThan(-1)
    expect(main.indexOf('assertClipsPreflight()')).toBeLessThan(main.indexOf('reseed()'))
    expect(main.indexOf('assertClipsPreflight()')).toBeLessThan(main.indexOf('launchBrowser()'))
  })

  it('is wired to one command', async () => {
    const pkg = JSON.parse(await read('package.json')) as { scripts: Record<string, string> }
    expect(pkg.scripts['docs:clips']).toBe('tsx scripts/docs-demo/clips.ts')
  })
})

describe('clip manifest', () => {
  it('is valid', () => {
    expect(() => validateClips(CLIPS)).not.toThrow()
  })

  it('starts with the review-queue approval and connecting a channel', () => {
    expect(CLIPS.map((c) => c.id)).toEqual(['approve-draft', 'connect-channel'])
  })

  it('gives every clip a title, a text description and an in-app route', () => {
    for (const clip of CLIPS) {
      expect(clip.title.trim(), clip.id).not.toBe('')
      expect(clip.description.trim().length, clip.id).toBeGreaterThan(40)
      expect(clip.route, clip.id).toMatch(/^\/[^/]/)
    }
  })

  it('never types a secret-looking value or an email address into a clip', () => {
    for (const clip of CLIPS) {
      for (const step of [...(clip.setup ?? []), ...clip.steps]) {
        if (!('type' in step)) continue
        expect(step.value, clip.id).not.toMatch(/@/)
        expect(step.value, clip.id).not.toMatch(/[0-9a-f]{24,}/i)
      }
    }
  })

  it.each([
    ['a bad id', { id: 'Not Kebab' }, /kebab-case/],
    ['no description', { description: '  ' }, /text description/],
    ['no title', { title: '' }, /title/],
    ['no steps', { steps: [] }, /at least one step/],
    ['no poster step', { steps: [{ pause: 100 }] }, /exactly one/],
    ['two poster steps', { steps: [{ poster: true }, { poster: true }] }, /exactly one/],
    ['a poster in setup', { setup: [{ poster: true }] }, /setup/],
  ] as Array<[string, Partial<Clip>, RegExp]>)('rejects %s', (_label, override, message) => {
    expect(() => validateClips([clipWith(override)])).toThrow(message)
  })

  it('rejects duplicate ids', () => {
    expect(() => validateClips([CLIPS[0], CLIPS[0]])).toThrow(/duplicate/)
  })
})

describe('buildEncodeArgs', () => {
  const opts = { trimStartSeconds: 2.345, crf: 38, width: 1280 }

  it('writes a silent, metadata-free, single-threaded VP9 WebM, trimmed to the start of the flow', () => {
    const args = buildEncodeArgs('webm', 'in.webm', 'out.webm', opts)
    expect(args).toEqual(expect.arrayContaining(['-an', '-map_metadata', '-1', '-threads', '1', '-c:v', 'libvpx-vp9']))
    expect(args[args.indexOf('-ss') + 1]).toBe('2.35')
    expect(args[args.indexOf('-crf') + 1]).toBe('38')
    expect(args[args.indexOf('-vf') + 1]).toContain('scale=1280:-2')
    expect(args[args.indexOf('-i') + 1]).toBe('in.webm')
    expect(args.at(-1)).toBe('out.webm')
  })

  it('writes a fast-start H.264 MP4 that plays in every browser', () => {
    const args = buildEncodeArgs('mp4', 'in.webm', 'out.mp4', opts)
    expect(args).toEqual(expect.arrayContaining(['-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-movflags', '+faststart']))
    expect(args.at(-1)).toBe('out.mp4')
  })
})

describe('scripts injected into the recorded page', () => {
  it('are valid JavaScript', () => {
    expect(() => new Script(CURSOR_SCRIPT)).not.toThrow()
    expect(() => new Script(liveMasksScript(DEFAULT_TEXT_MASKS))).not.toThrow()
  })

  it('carry every default text mask, so the video is masked like a screenshot', () => {
    const script = liveMasksScript(DEFAULT_TEXT_MASKS)
    for (const rule of DEFAULT_TEXT_MASKS) {
      expect(script).toContain(JSON.stringify(rule.pattern.source))
      expect(script).toContain(JSON.stringify(rule.replacement))
    }
  })
})

describe('parseDurationSeconds', () => {
  it('reads the duration from ffmpeg stream info', () => {
    expect(parseDurationSeconds('Input #0, matroska,webm\n  Duration: 00:00:08.04, start: 0.000000, bitrate: 210 kb/s')).toBe(8)
    expect(parseDurationSeconds('  Duration: 00:01:02.50, start: 0')).toBe(62.5)
  })

  it('fails when there is no duration', () => {
    expect(() => parseDurationSeconds('No such file')).toThrow(/duration/)
  })
})

describe('generated clip manifest', () => {
  const generated = clipsData as Record<string, { title: string; description: string; webm: string; mp4: string; poster: string }>

  it('only holds clips that are in the clip manifest', () => {
    const known = new Set(CLIPS.map((c) => c.id))
    for (const id of Object.keys(generated)) expect(known.has(id), id).toBe(true)
  })

  it('describes every clip it holds', () => {
    for (const [id, clip] of Object.entries(generated)) {
      expect(clip.title.trim(), id).not.toBe('')
      expect(clip.description.trim(), id).not.toBe('')
      for (const url of [clip.webm, clip.mp4, clip.poster]) expect(url, id).toMatch(new RegExp(`^/docs/clips/${id}\\.`))
    }
  })

  it('has a file on disk for every clip it holds', async () => {
    for (const clip of Object.values(generated)) {
      for (const url of [clip.webm, clip.mp4, clip.poster]) {
        const info = await readFile(path.join(process.cwd(), 'public', url))
        expect(info.length).toBeGreaterThan(0)
        if (url !== clip.poster) expect(info.length).toBeLessThan(1_000_000)
      }
    }
  })

  it('has every clip that a docs page embeds', async () => {
    const files: string[] = []
    async function walk(dir: string) {
      for (const entry of await readdir(path.join(process.cwd(), dir), { withFileTypes: true })) {
        const rel = path.join(dir, entry.name)
        if (entry.isDirectory()) await walk(rel)
        else if (entry.name.endsWith('.mdx')) files.push(rel)
      }
    }
    await walk('content/docs')
    for (const file of files) {
      const source = await read(file)
      for (const match of source.matchAll(/<DemoClip\s+clip="([^"]+)"/g)) {
        expect(Object.keys(generated), `${file} embeds clip "${match[1]}"`).toContain(match[1])
      }
    }
  })
})
