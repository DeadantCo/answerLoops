import type { SourcePlatform } from '@/types'

const LABELS: Record<SourcePlatform, string> = {
  discord: 'Discord',
  slack: 'Slack',
  google_chat: 'Google Chat',
  telegram: 'Telegram',
  email: 'Email',
  github: 'GitHub',
  discourse: 'Discourse',
  circle: 'Circle',
  mcp: 'Agent',
}

/** Every channel a ticket can come from, in the order the filter bar lists them. */
export const SOURCE_PLATFORMS = Object.keys(LABELS) as SourcePlatform[]

/** Customer-facing name of a ticket's source channel. */
export function platformLabel(platform: string | null | undefined): string {
  return (LABELS as Record<string, string>)[platform ?? 'discord'] ?? platform ?? 'Discord'
}

/** A known channel from untrusted input such as a URL parameter, or undefined for anything else. */
export function parseSourcePlatform(value: unknown): SourcePlatform | undefined {
  return typeof value === 'string' && (SOURCE_PLATFORMS as string[]).includes(value) ? (value as SourcePlatform) : undefined
}
