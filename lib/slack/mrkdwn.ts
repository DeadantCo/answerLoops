// Slack (and Google Chat) store message text in their own "mrkdwn" syntax,
// which is not Markdown: links are <url|label>, mentions are <@U123>,
// channels are <#C123|name>, bold is *x*, italic is _x_, and only &, < and >
// are HTML-escaped. This parses that syntax into a small node tree that the
// UI renders as React elements, so nothing is ever interpreted as HTML and
// literal characters such as snake_case or 2 * 3 are left alone.

export type MrkdwnInlineNode =
  | { type: 'text'; text: string }
  | { type: 'link'; url: string; label: string }
  | { type: 'bold' | 'italic' | 'strike'; children: MrkdwnInlineNode[] }
  | { type: 'code'; text: string }

export type MrkdwnBlock =
  | { type: 'text'; children: MrkdwnInlineNode[] }
  | { type: 'quote'; children: MrkdwnInlineNode[] }
  | { type: 'codeblock'; text: string }

const STYLE_MARKERS = { '*': 'bold', _: 'italic', '~': 'strike' } as const
type StyleMarker = keyof typeof STYLE_MARKERS

function decodeEntities(value: string): string {
  return value.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
}

function isSafeHttpUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

function isWordChar(char: string | undefined): boolean {
  return char !== undefined && /[\p{L}\p{N}]/u.test(char)
}

function isSpace(char: string | undefined): boolean {
  return char !== undefined && /\s/.test(char)
}

// Turns the inside of a <...> token into a node. Covers links, mailto/tel,
// user and channel references, special mentions and dates (Slack) and
// <users/ID> mentions (Google Chat).
function parseAngleToken(body: string): MrkdwnInlineNode {
  const pipe = body.indexOf('|')
  const target = decodeEntities(pipe === -1 ? body : body.slice(0, pipe))
  const label = pipe === -1 ? '' : decodeEntities(body.slice(pipe + 1))

  if (target.startsWith('@')) return { type: 'text', text: `@${label || target.slice(1)}` }
  if (target.startsWith('#')) return { type: 'text', text: `#${label || target.slice(1)}` }

  if (target.startsWith('!')) {
    const command = target.slice(1)
    if (command.startsWith('subteam^')) return { type: 'text', text: label || '@group' }
    if (command.startsWith('date')) return { type: 'text', text: label || 'date' }
    if (label) return { type: 'text', text: label }
    return { type: 'text', text: `@${command.split('^')[0]}` }
  }

  const googleChatUser = /^users\/(.+)$/.exec(target)
  if (googleChatUser) {
    return { type: 'text', text: googleChatUser[1] === 'all' ? '@all' : label || '@user' }
  }

  if (isSafeHttpUrl(target)) return { type: 'link', url: target, label: label || target }
  return { type: 'text', text: label || target.replace(/^(mailto|tel):/, '') }
}

// A style marker opens only at a word boundary before non-space text and closes
// at a matching marker after non-space text, on the same line.
function findClosingMarker(source: string, marker: StyleMarker, open: number): number {
  for (let j = open + 2; j < source.length; j++) {
    if (source[j] === '\n') return -1
    if (source[j] !== marker) continue
    if (isSpace(source[j - 1])) continue
    if (isWordChar(source[j + 1])) continue
    return j
  }
  return -1
}

export function parseMrkdwnInline(source: string): MrkdwnInlineNode[] {
  const nodes: MrkdwnInlineNode[] = []
  let buffer = ''

  const flush = () => {
    if (buffer) nodes.push({ type: 'text', text: decodeEntities(buffer) })
    buffer = ''
  }

  let i = 0
  while (i < source.length) {
    const char = source[i]

    if (char === '<') {
      const match = /^<([^<>\n]+)>/.exec(source.slice(i))
      if (match) {
        flush()
        nodes.push(parseAngleToken(match[1]))
        i += match[0].length
        continue
      }
    }

    if (char === '`') {
      const match = /^`([^`\n]+)`/.exec(source.slice(i))
      if (match) {
        flush()
        nodes.push({ type: 'code', text: decodeEntities(match[1]) })
        i += match[0].length
        continue
      }
    }

    if (char === '*' || char === '_' || char === '~') {
      const opensAtBoundary = !isWordChar(source[i - 1]) && source[i - 1] !== char
      const next = source[i + 1]
      if (opensAtBoundary && next !== undefined && !isSpace(next) && next !== char) {
        const close = findClosingMarker(source, char, i)
        if (close !== -1) {
          flush()
          nodes.push({
            type: STYLE_MARKERS[char],
            children: parseMrkdwnInline(source.slice(i + 1, close)),
          })
          i = close + 1
          continue
        }
      }
    }

    buffer += char
    i++
  }

  flush()
  return nodes
}

const QUOTE_LINE = /^(?:&gt;|>) ?/

function parseTextBlocks(segment: string): MrkdwnBlock[] {
  const blocks: MrkdwnBlock[] = []
  let current: { kind: 'text' | 'quote'; lines: string[] } | null = null

  const close = () => {
    if (!current) return
    const joined = current.lines.join('\n').replace(/^\n+|\n+$/g, '')
    if (joined.trim() !== '') blocks.push({ type: current.kind, children: parseMrkdwnInline(joined) })
    current = null
  }

  for (const line of segment.split('\n')) {
    const isQuote = QUOTE_LINE.test(line)
    const kind = isQuote ? 'quote' : 'text'
    if (!current || current.kind !== kind) {
      close()
      current = { kind, lines: [] }
    }
    current.lines.push(isQuote ? line.replace(QUOTE_LINE, '') : line)
  }
  close()

  return blocks
}

export function parseMrkdwn(source: string): MrkdwnBlock[] {
  const blocks: MrkdwnBlock[] = []
  const fence = /```([\s\S]*?)```/g
  let last = 0
  let match: RegExpExecArray | null

  while ((match = fence.exec(source)) !== null) {
    blocks.push(...parseTextBlocks(source.slice(last, match.index)))
    blocks.push({ type: 'codeblock', text: decodeEntities(match[1].replace(/^\n/, '').replace(/\n$/, '')) })
    last = match.index + match[0].length
  }
  blocks.push(...parseTextBlocks(source.slice(last)))

  return blocks
}
