import Image from 'next/image'
import ReactMarkdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { parseAttachmentLines } from '@/lib/slack/attachment-lines'
import { parseMrkdwn, type MrkdwnInlineNode } from '@/lib/slack/mrkdwn'
import type { SourcePlatform } from '@/types'

function isSafeExternalUrl(value: string | undefined): value is string {
  if (!value) return false

  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

// Keep Markdown renderers outside TicketContent to avoid recreating
// component definitions on every render.
const markdownComponents: Components = {
  h1: ({ children }) => <h1 className="mt-3 mb-2 text-lg font-semibold text-gray-900">{children}</h1>,
  h2: ({ children }) => <h2 className="mt-3 mb-2 text-base font-semibold text-gray-900">{children}</h2>,
  h3: ({ children }) => <h3 className="mt-3 mb-1.5 text-sm font-semibold text-gray-900">{children}</h3>,
  h4: ({ children }) => <h4 className="mt-3 mb-1.5 text-sm font-semibold text-gray-900">{children}</h4>,
  h5: ({ children }) => <h5 className="mt-3 mb-1.5 text-sm font-medium text-gray-900">{children}</h5>,
  h6: ({ children }) => <h6 className="mt-3 mb-1.5 text-sm font-medium text-gray-700">{children}</h6>,
  p: ({ children }) => <p className="my-2">{children}</p>,
  ul: ({ children, className }) => (
    <ul className={`my-2 list-disc space-y-1 pl-5 ${className?.includes('contains-task-list') ? 'list-none pl-0' : ''}`}>
      {children}
    </ul>
  ),
  ol: ({ children }) => <ol className="my-2 list-decimal space-y-1 pl-5">{children}</ol>,
  blockquote: ({ children }) => (
    <blockquote className="my-2 border-l-2 border-gray-300 pl-3 text-gray-600">{children}</blockquote>
  ),
  pre: ({ children }) => (
    <pre className="my-2 overflow-x-auto rounded bg-gray-100 p-2 text-xs [&>code]:bg-transparent [&>code]:p-0">
      {children}
    </pre>
  ),
  code: ({ children }) => <code className="rounded bg-gray-100 px-1 py-0.5 font-mono text-[0.85em]">{children}</code>,
  hr: () => <hr className="my-3 border-gray-200" />,
  table: ({ children }) => (
    <div className="my-2 overflow-x-auto">
      <table className="min-w-full border-collapse text-xs">{children}</table>
    </div>
  ),
  th: ({ children }) => <th className="border border-gray-200 bg-gray-50 px-2 py-1 text-left font-medium">{children}</th>,
  td: ({ children }) => <td className="border border-gray-200 px-2 py-1">{children}</td>,

  a: ({ href, children }) =>
    isSafeExternalUrl(href) ? (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="text-blue-600 underline break-all hover:text-blue-800"
      >
        {children}
      </a>
    ) : (
      <>{children}</>
    ),

  img: ({ src, alt }) =>
    typeof src === 'string' && isSafeExternalUrl(src) ? (
      <Image
        src={src}
        alt={alt ?? ''}
        width={1200}
        height={800}
        unoptimized
        className="block max-w-full h-auto rounded"
      />
    ) : (
      <>{alt}</>
    ),
}

// Platforms whose messages are stored as Markdown. Discord and Discourse
// (raw post body) store the sender's Markdown; MCP content comes from a
// calling agent, which writes Markdown.
const MARKDOWN_PLATFORMS: ReadonlySet<SourcePlatform> = new Set(['github', 'discord', 'discourse', 'mcp'])

// Platforms whose messages use Slack-style mrkdwn rather than Markdown.
const MRKDWN_PLATFORMS: ReadonlySet<SourcePlatform> = new Set(['slack', 'google_chat'])

function MrkdwnInline({ nodes }: { nodes: MrkdwnInlineNode[] }) {
  return (
    <>
      {nodes.map((node, i) => {
        switch (node.type) {
          case 'text':
            return node.text
          case 'link':
            return (
              <a
                key={i}
                href={node.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 underline break-all hover:text-blue-800"
              >
                {node.label}
              </a>
            )
          case 'bold':
            return <strong key={i}><MrkdwnInline nodes={node.children} /></strong>
          case 'italic':
            return <em key={i}><MrkdwnInline nodes={node.children} /></em>
          case 'strike':
            return <s key={i}><MrkdwnInline nodes={node.children} /></s>
          case 'code':
            return <code key={i} className="rounded bg-gray-100 px-1 py-0.5 font-mono text-[0.85em]">{node.text}</code>
        }
      })}
    </>
  )
}

function MrkdwnText({ text }: { text: string }) {
  return (
    <div className="space-y-2 text-sm text-gray-800 break-words">
      {parseMrkdwn(text).map((block, i) => {
        if (block.type === 'codeblock') {
          return (
            <pre key={i} className="overflow-x-auto rounded bg-gray-100 p-2 text-xs">
              <code>{block.text}</code>
            </pre>
          )
        }
        if (block.type === 'quote') {
          return (
            <blockquote key={i} className="border-l-2 border-gray-300 pl-3 whitespace-pre-wrap text-gray-600">
              <MrkdwnInline nodes={block.children} />
            </blockquote>
          )
        }
        return (
          <p key={i} className="whitespace-pre-wrap">
            <MrkdwnInline nodes={block.children} />
          </p>
        )
      })}
    </div>
  )
}

// Renders ticket/reply content, turning any [Attachment: name] — url
// lines into clickable links. Markdown channels (GitHub, Discord, Discourse,
// MCP) render safe Markdown, Slack and Google Chat render their mrkdwn syntax,
// and every other channel stays plain text.
export function TicketContent({
  content,
  className,
  sourcePlatform,
}: {
  content: string
  className?: string
  sourcePlatform?: SourcePlatform
}) {
  const { text, attachments } = parseAttachmentLines(content)

  return (
    <div className={className}>
      {text &&
        (sourcePlatform && MARKDOWN_PLATFORMS.has(sourcePlatform) ? (
          <div className="text-sm text-gray-800 break-words [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
              {text}
            </ReactMarkdown>
          </div>
        ) : sourcePlatform && MRKDWN_PLATFORMS.has(sourcePlatform) ? (
          <MrkdwnText text={text} />
        ) : (
          <p className="text-sm text-gray-800 whitespace-pre-wrap">{text}</p>
        ))}

      {attachments.length > 0 && (
        <div className={text ? 'mt-2 flex flex-col gap-1' : 'flex flex-col gap-1'}>
          {attachments.map((a, i) => (
            <a
              key={i}
              href={a.url ?? undefined}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex w-fit max-w-full items-center gap-1.5 rounded border border-gray-200 bg-gray-50 px-2 py-1 text-xs font-medium text-blue-600 hover:bg-gray-100 hover:text-blue-800"
            >
              <span aria-hidden="true">📎</span>
              <span className="min-w-0 break-all">{a.name}</span>
            </a>
          ))}
        </div>
      )}
    </div>
  )
}
