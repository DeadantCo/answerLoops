/**
 * Records short looping clips of scripted flows in the real app, running
 * against the seeded demo workspace, and writes a manifest for the DemoClip
 * docs component.
 *
 * Usage (app and database running as described in README.md):
 *   pnpm docs:clips                    all clips
 *   pnpm docs:clips approve-draft      only these clip ids
 *
 * Environment:
 *   DATABASE_URL    the local demo database (also used to re-seed it)
 *   DOCS_BASE_URL   defaults to http://localhost:3112
 *
 * Needs `ffmpeg` (with libvpx-vp9 and libx264) on the PATH.
 *
 * The flows change the workspace (a draft is approved, a channel is
 * reconnected), so the demo workspace is re-seeded before every clip and once
 * more at the end, which leaves it exactly as `pnpm docs:seed` does.
 *
 * Outputs:
 *   public/docs/clips/<id>.webm, <id>.mp4 and <id>.webp (the still image)
 *   lib/docs/clips.generated.json
 */

import { execFileSync, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { chromium, type Browser, type BrowserContext, type Page } from '@playwright/test'
import { assertLocalDatabaseUrl, assertLocalEnvironment } from './guard'
import { resolveBaseUrl } from './open'
import { applyMasks, assertSafe, pageStyles } from './page-safety'
import { loadSharp } from './sharp'
import { CLIPS, DEFAULT_CLIP_VIEWPORT, type Clip, type ClipStep } from './clips.manifest'
import { DEFAULT_TEXT_MASKS, type TextMaskRule } from './shots.manifest'

const ROOT = path.resolve(__dirname, '..', '..')
const OUT_DIR = path.join(ROOT, 'public', 'docs', 'clips')
const JSON_PATH = path.join(ROOT, 'lib', 'docs', 'clips.generated.json')
const STORAGE_STATE_PATH = path.join(__dirname, '.tmp', 'storage-state.json') // written by session.ts

const NAV_TIMEOUT_MS = 120_000
const SELECTOR_TIMEOUT_MS = 20_000
const FPS = 15
const MAX_CLIP_BYTES = 1_000_000
const MAX_CLIP_SECONDS = 15
const TYPE_DELAY_MS = 35
const GLIDE_STEPS = 14
/** Quality settings tried in order (best first) until the file fits MAX_CLIP_BYTES. */
const CRF_LADDER: Record<ClipFormat, number[]> = {
  webm: [34, 38, 42, 46, 50, 54, 58],
  mp4: [26, 29, 32, 35, 38, 41, 44],
}
const POSTER_QUALITY = 80

export type ClipFormat = 'webm' | 'mp4'

export interface ClipOut {
  title: string
  description: string
  webm: string
  mp4: string
  poster: string
  width: number
  height: number
  durationSeconds: number
}

const kebab = /^[a-z0-9]+(-[a-z0-9]+)*$/

export function validateClips(clips: Clip[]): void {
  const seen = new Set<string>()
  for (const clip of clips) {
    if (!kebab.test(clip.id)) throw new Error(`clip id is not kebab-case: ${clip.id}`)
    if (seen.has(clip.id)) throw new Error(`duplicate clip id: ${clip.id}`)
    seen.add(clip.id)
    if (!clip.title.trim()) throw new Error(`[${clip.id}] a clip needs a title`)
    if (!clip.description.trim()) throw new Error(`[${clip.id}] a clip needs a text description`)
    if (!clip.steps.length) throw new Error(`[${clip.id}] a clip needs at least one step`)
    const posters = clip.steps.filter((s) => 'poster' in s).length
    if (posters !== 1) throw new Error(`[${clip.id}] a clip needs exactly one { poster: true } step (found ${posters})`)
    if ((clip.setup ?? []).some((s) => 'poster' in s)) throw new Error(`[${clip.id}] setup steps cannot take the poster`)
  }
}

/**
 * Every refusal the clip script makes before it touches anything: it re-seeds
 * the database and drives a signed-in browser, so it only runs on a developer
 * machine, against a local database and a local app.
 */
export function assertClipsPreflight(env: Record<string, string | undefined> = process.env): URL {
  assertLocalEnvironment(env)
  assertLocalDatabaseUrl(env.DATABASE_URL)
  if (env.DIRECT_DATABASE_URL) assertLocalDatabaseUrl(env.DIRECT_DATABASE_URL, 'DIRECT_DATABASE_URL')
  return resolveBaseUrl(env.DOCS_BASE_URL)
}

export function buildEncodeArgs(
  format: ClipFormat,
  input: string,
  output: string,
  opts: { trimStartSeconds: number; crf: number; width: number },
): string[] {
  const common = [
    '-y',
    '-hide_banner',
    '-loglevel',
    'error',
    '-i',
    input,
    '-ss',
    opts.trimStartSeconds.toFixed(2),
    '-an',
    '-vf',
    `fps=${FPS},scale=${opts.width}:-2:flags=lanczos`,
    '-map_metadata',
    '-1',
    '-fflags',
    '+bitexact',
    '-flags:v',
    '+bitexact',
    '-threads',
    '1',
  ]
  if (format === 'webm') {
    return [
      ...common,
      '-c:v',
      'libvpx-vp9',
      '-b:v',
      '0',
      '-crf',
      String(opts.crf),
      '-deadline',
      'good',
      '-cpu-used',
      '1',
      '-pix_fmt',
      'yuv420p',
      output,
    ]
  }
  return [
    ...common,
    '-c:v',
    'libx264',
    '-preset',
    'veryslow',
    '-crf',
    String(opts.crf),
    '-pix_fmt',
    'yuv420p',
    '-movflags',
    '+faststart',
    output,
  ]
}

function assertFfmpeg(): void {
  let encoders: string
  try {
    encoders = execFileSync('ffmpeg', ['-hide_banner', '-encoders'], { encoding: 'utf8' })
  } catch {
    throw new Error('ffmpeg was not found on the PATH. Install it (for example `brew install ffmpeg` or `apt install ffmpeg`) and run again.')
  }
  for (const encoder of ['libvpx-vp9', 'libx264']) {
    if (!encoders.includes(encoder)) throw new Error(`This ffmpeg build has no ${encoder} encoder. Install a full build.`)
  }
}

export function parseDurationSeconds(ffmpegInfo: string): number {
  const match = /Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(ffmpegInfo)
  if (!match) throw new Error('could not read the duration of the encoded clip')
  const seconds = Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3])
  return Math.round(seconds * 10) / 10
}

function probeDurationSeconds(file: string): number {
  // `ffmpeg -i` with no output exits non-zero but prints the stream info, so ffprobe is not needed.
  const result = spawnSync('ffmpeg', ['-hide_banner', '-i', file], { encoding: 'utf8' })
  return parseDurationSeconds(`${result.stderr}`)
}

function encode(clip: Clip, format: ClipFormat, input: string, outDir: string, trimStartSeconds: number, width: number): string {
  const output = path.join(outDir, `${clip.id}.${format}`)
  for (const crf of CRF_LADDER[format]) {
    execFileSync('ffmpeg', buildEncodeArgs(format, input, output, { trimStartSeconds, crf, width }), { stdio: 'inherit' })
    const bytes = fs.statSync(output).size
    if (bytes < MAX_CLIP_BYTES) {
      console.log(`[docs-clips] ${clip.id}.${format}: ${(bytes / 1024).toFixed(0)} KB (crf ${crf})`)
      return output
    }
  }
  fs.rmSync(output, { force: true })
  throw new Error(`[${clip.id}] ${format} stays over ${MAX_CLIP_BYTES} bytes at the lowest quality. Shorten the clip.`)
}

async function launchBrowser(): Promise<Browser> {
  try {
    return await chromium.launch({ channel: 'chrome' })
  } catch (err) {
    console.warn(
      `[docs-clips] Chrome unavailable (${(err as Error).message.split('\n')[0]}); falling back to bundled chromium`,
    )
    return await chromium.launch()
  }
}

// Playwright's recording has no mouse pointer, so draw one that follows it.
// Created on the first mouse move, after the page has hydrated. These are
// plain strings, not functions, because tsx rewrites function names in a way
// that does not survive being sent to the browser.
export const CURSOR_SCRIPT = `(() => {
  let cursor = null
  const ensure = () => {
    if (cursor) return cursor
    cursor = document.createElement('div')
    cursor.setAttribute('aria-hidden', 'true')
    cursor.style.cssText =
      'position:fixed;z-index:2147483647;width:20px;height:20px;margin:-10px 0 0 -10px;border-radius:50%;' +
      'background:rgba(17,24,39,.55);border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.35);pointer-events:none;'
    document.body.appendChild(cursor)
    return cursor
  }
  document.addEventListener('mousemove', (e) => {
    const el = ensure()
    el.style.left = e.clientX + 'px'
    el.style.top = e.clientY + 'px'
  }, true)
  document.addEventListener('mousedown', () => ensure().style.setProperty('transform', 'scale(0.7)'), true)
  document.addEventListener('mouseup', () => ensure().style.setProperty('transform', 'scale(1)'), true)
})()`

// Rewrites secret-looking text the moment it appears, so no recorded frame can
// show it. Started only once the page is ready, because changing server
// rendered text before hydration would cause a mismatch.
export function liveMasksScript(rules: TextMaskRule[]): string {
  const compiled = JSON.stringify(rules.map((r) => ({ source: r.pattern.source, flags: r.pattern.flags, to: r.replacement })))
  return `(() => {
  if (window.clipMasksStarted) return
  window.clipMasksStarted = true
  const rules = ${compiled}.map((r) => ({ re: new RegExp(r.source, r.flags), to: r.to }))
  const run = () => {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
    while (walker.nextNode()) {
      const node = walker.currentNode
      let value = node.nodeValue || ''
      for (const { re, to } of rules) value = value.replace(re, to)
      if (value !== node.nodeValue) node.nodeValue = value
    }
  }
  run()
  new MutationObserver(run).observe(document.body, { subtree: true, childList: true, characterData: true })
})()`
}

async function glideTo(page: Page, selector: string): Promise<void> {
  const locator = page.locator(selector).first()
  await locator.waitFor({ state: 'visible' })
  await locator.scrollIntoViewIfNeeded()
  const box = await locator.boundingBox()
  if (!box) throw new Error(`no bounding box for ${selector}`)
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: GLIDE_STEPS })
}

async function runStep(page: Page, step: ClipStep): Promise<void> {
  if ('click' in step) {
    await glideTo(page, step.click)
    await page.waitForTimeout(150)
    await page.locator(step.click).first().click()
  } else if ('type' in step) {
    await page.locator(step.type).first().pressSequentially(step.value, { delay: TYPE_DELAY_MS })
  } else if ('scrollTo' in step) {
    // The dashboard scrolls inside <main>, not the window: put the element near the top edge.
    await page.locator(step.scrollTo).first().evaluate((el) => {
      const scroller = el.closest('main') as HTMLElement | null
      if (!scroller) return
      scroller.scrollTop += el.getBoundingClientRect().top - scroller.getBoundingClientRect().top - 24
    })
  } else if ('waitFor' in step) {
    await page.locator(step.waitFor).first().waitFor({ state: 'visible', timeout: 60_000 })
  } else if ('pause' in step) {
    await page.waitForTimeout(step.pause)
  }
}

function newContext(browser: Browser, clip: Clip, recordDir?: string): Promise<BrowserContext> {
  const viewport = clip.viewport ?? DEFAULT_CLIP_VIEWPORT
  return browser.newContext({
    storageState: STORAGE_STATE_PATH,
    viewport,
    deviceScaleFactor: 1,
    colorScheme: 'light',
    reducedMotion: 'reduce',
    locale: 'en-US',
    timezoneId: 'UTC',
    ...(recordDir ? { recordVideo: { dir: recordDir, size: viewport } } : {}),
  })
}

async function openAndWait(page: Page, clip: Clip, baseUrl: URL, waitFor: string[]): Promise<void> {
  const consoleErrors: string[] = []
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text().split('\n')[0].slice(0, 200))
  })
  page.on('pageerror', (e) => consoleErrors.push(`uncaught: ${e.message.slice(0, 200)}`))
  const response = await page.goto(new URL(clip.route, baseUrl).toString(), { waitUntil: 'networkidle', timeout: NAV_TIMEOUT_MS })
  const status = response?.status() ?? 0
  if (status >= 400) throw new Error(`[${clip.id}] ${clip.route} returned HTTP ${status}`)
  if (new URL(page.url()).pathname.startsWith('/login')) {
    throw new Error(`[${clip.id}] redirected to /login: the session is missing or expired. Run \`pnpm docs:session\` again.`)
  }
  await page.addStyleTag({ content: pageStyles() })
  for (const selector of waitFor) await page.locator(selector).first().waitFor({ state: 'visible' })
  await page.evaluate(() => document.fonts.ready)
  if (consoleErrors.length) throw new Error(`[${clip.id}] console errors on ${clip.route}:\n  ${consoleErrors.join('\n  ')}`)
}

function reseed(): void {
  const result = spawnSync('pnpm', ['docs:seed'], { stdio: 'inherit', env: process.env })
  if (result.status !== 0) throw new Error('Re-seeding the demo workspace failed.')
}

async function runSetup(browser: Browser, clip: Clip, baseUrl: URL): Promise<void> {
  if (!clip.setup?.length) return
  const context = await newContext(browser, clip)
  try {
    const page = await context.newPage()
    page.setDefaultTimeout(SELECTOR_TIMEOUT_MS)
    await openAndWait(page, clip, baseUrl, [])
    for (const step of clip.setup) await runStep(page, step)
    await page.waitForLoadState('networkidle')
  } finally {
    await context.close()
  }
}

async function runClip(browser: Browser, clip: Clip, baseUrl: URL): Promise<ClipOut> {
  const viewport = clip.viewport ?? DEFAULT_CLIP_VIEWPORT
  const rules = DEFAULT_TEXT_MASKS
  const sharp = loadSharp()
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), `docs-clip-${clip.id}-`))

  try {
    await runSetup(browser, clip, baseUrl)

    const context = await newContext(browser, clip, workDir)
    let rawVideo = ''
    let posterPng: Buffer | null = null
    let trimStartSeconds = 0
    try {
      const startedAt = Date.now()
      const page = await context.newPage()
      page.setDefaultTimeout(SELECTOR_TIMEOUT_MS)
      await page.addInitScript({ content: CURSOR_SCRIPT })
      await openAndWait(page, clip, baseUrl, clip.waitFor)
      await page.evaluate(liveMasksScript(rules))
      await applyMasks(page, [], rules)
      await assertSafe(page, clip.id)
      await page.waitForLoadState('networkidle')
      // Everything before this point (page load, compile time) is cut from the video.
      trimStartSeconds = (Date.now() - startedAt) / 1000

      for (const step of clip.steps) {
        if ('poster' in step) {
          posterPng = await page.screenshot({ type: 'png', animations: 'disabled', caret: 'hide' })
        } else {
          await runStep(page, step)
        }
        await assertSafe(page, clip.id)
      }
      await page.waitForTimeout(300)
      const video = page.video()
      if (!video) throw new Error(`[${clip.id}] Playwright did not record a video`)
      await context.close()
      rawVideo = await video.path()
    } finally {
      await context.close().catch(() => undefined)
    }
    if (!posterPng) throw new Error(`[${clip.id}] the poster step did not run`)

    const width = Math.min(viewport.width, 1280)
    const height = Math.round((viewport.height * width) / viewport.width / 2) * 2
    const webm = encode(clip, 'webm', rawVideo, workDir, trimStartSeconds, width)
    const mp4 = encode(clip, 'mp4', rawVideo, workDir, trimStartSeconds, width)

    const { data } = await sharp(posterPng)
      .resize({ width, withoutEnlargement: true })
      .webp({ quality: POSTER_QUALITY, effort: 6 })
      .toBuffer({ resolveWithObject: true })

    const durationSeconds = probeDurationSeconds(webm)
    if (durationSeconds > MAX_CLIP_SECONDS) {
      throw new Error(`[${clip.id}] the clip is ${durationSeconds}s long; keep clips under ${MAX_CLIP_SECONDS}s`)
    }

    // Only a clip that passed every check replaces the files already committed.
    fs.mkdirSync(OUT_DIR, { recursive: true })
    fs.copyFileSync(webm, path.join(OUT_DIR, `${clip.id}.webm`))
    fs.copyFileSync(mp4, path.join(OUT_DIR, `${clip.id}.mp4`))
    fs.writeFileSync(path.join(OUT_DIR, `${clip.id}.webp`), data)

    console.log(`[docs-clips] ${clip.id}: ${width}x${height}, ${durationSeconds}s, poster ${(data.length / 1024).toFixed(0)} KB`)
    return {
      title: clip.title,
      description: clip.description,
      webm: `/docs/clips/${clip.id}.webm`,
      mp4: `/docs/clips/${clip.id}.mp4`,
      poster: `/docs/clips/${clip.id}.webp`,
      width,
      height,
      durationSeconds,
    }
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true })
  }
}

async function main() {
  const ids = process.argv.slice(2).filter((a) => !a.startsWith('--'))

  const baseUrl = assertClipsPreflight()
  validateClips(CLIPS)
  const unknown = ids.filter((id) => !CLIPS.some((c) => c.id === id))
  if (unknown.length) {
    throw new Error(`unknown clip id(s): ${unknown.join(', ')}. Known: ${CLIPS.map((c) => c.id).join(', ')}`)
  }
  if (!fs.existsSync(STORAGE_STATE_PATH)) {
    throw new Error('No saved session. Run `pnpm docs:session` first (see scripts/docs-demo/README.md).')
  }
  assertFfmpeg()

  const selected = ids.length ? CLIPS.filter((c) => ids.includes(c.id)) : CLIPS
  const browser = await launchBrowser()
  const results: Record<string, ClipOut> = {}
  const failures: string[] = []
  try {
    for (const clip of selected) {
      // Every clip starts from a freshly seeded workspace, so the flow always
      // begins in the same state however often it is recorded.
      reseed()
      try {
        results[clip.id] = await runClip(browser, clip, baseUrl)
      } catch (err) {
        const raw = (err as Error).message
        const message = raw.startsWith('[') ? raw : `[${clip.id}] ${raw.split('\n')[0]}`
        failures.push(message)
        console.error(`[docs-clips] FAILED ${message}`)
      }
    }
  } finally {
    await browser.close()
    try {
      reseed()
    } catch (err) {
      failures.push((err as Error).message)
    }
  }

  // Merge into the existing file so a single-clip run keeps the others.
  let existing: Record<string, ClipOut> = {}
  if (fs.existsSync(JSON_PATH)) existing = JSON.parse(fs.readFileSync(JSON_PATH, 'utf8'))
  const known = new Set(CLIPS.map((c) => c.id))
  const merged: Record<string, ClipOut> = {}
  for (const key of [...Object.keys({ ...existing, ...results })].filter((k) => known.has(k)).sort()) {
    merged[key] = results[key] ?? existing[key]
  }
  fs.mkdirSync(path.dirname(JSON_PATH), { recursive: true })
  fs.writeFileSync(JSON_PATH, JSON.stringify(merged, null, 2) + '\n')

  if (failures.length) {
    console.error(`\n[docs-clips] ${failures.length} clip(s) failed.`)
    process.exit(1)
  }
  console.log(`[docs-clips] wrote ${Object.keys(results).length} clip(s); manifest at lib/docs/clips.generated.json`)
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err)
    process.exit(1)
  })
}
