import { ImageResponse } from 'next/og'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { docsSource } from '@/lib/docs/source'
import {
  DOCS_SHARE_IMAGE_SIZE,
  clampDocsShareTitle,
  docsSectionForUrl,
  docsShareTitleFontSize,
} from '@/lib/docs/share-image'

// A route handler rather than an opengraph-image file: Next requires a
// catch-all to be the last URL segment, so that file cannot sit beside
// app/docs/[...slug]/page.tsx. The docs layout renders per request, but the
// image depends only on a page's title and section, so it is rendered once per
// page at build time and cached. Colors are the docs navy (#082e50) and teal
// (#168fa3).
export const dynamic = 'force-static'
const size = DOCS_SHARE_IMAGE_SIZE

export function generateStaticParams() {
  return docsSource.generateParams()
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string[] }> },
) {
  const { slug } = await params
  const page = docsSource.getPage(slug)
  if (!page) return new Response('Not found', { status: 404 })
  const title = clampDocsShareTitle(page.data.title)
  const section = docsSectionForUrl(docsSource.pageTree, page.url)
  const logo = await readFile(join(process.cwd(), 'public/icon.png'))
  const fonts = [
    {
      name: 'Geist',
      data: await readFile(join(process.cwd(), 'lib/marketing/fonts/Geist-Bold.ttf')),
      weight: 700 as const,
      style: 'normal' as const,
    },
  ]

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          background: '#082e50',
          color: '#ffffff',
          padding: '64px 72px',
          fontFamily: 'Geist',
          fontWeight: 700,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, fontSize: 36 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 72,
              height: 72,
              borderRadius: 18,
              background: '#ffffff',
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`data:image/png;base64,${logo.toString('base64')}`}
              width={48}
              height={48}
              alt=""
            />
          </div>
          <div style={{ display: 'flex' }}>
            answer<span style={{ color: '#168fa3' }}>Loops</span>
          </div>
          <div style={{ display: 'flex', color: '#b9e0e5', marginLeft: 8 }}>Docs</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <div
            style={{
              display: 'flex',
              fontSize: 28,
              color: '#19c3d6',
              textTransform: 'uppercase',
              letterSpacing: 3,
            }}
          >
            {section}
          </div>
          <div
            style={{
              display: 'flex',
              fontSize: docsShareTitleFontSize(title),
              lineHeight: 1.12,
              maxWidth: 1056,
              maxHeight: 340,
              overflow: 'hidden',
            }}
          >
            {title}
          </div>
        </div>
        <div
          style={{
            display: 'flex',
            borderTop: '2px solid #168fa3',
            paddingTop: 20,
            fontSize: 26,
            color: '#b9e0e5',
          }}
        >
          answerloops.com/docs
        </div>
      </div>
    ),
    { ...size, fonts },
  )
}
