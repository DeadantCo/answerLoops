import { createRequire } from 'node:module'

// `sharp` ships with Next.js (image optimisation) but is not a direct
// dependency of this repo, so resolve it from next's own location.
// Only the calls the capture scripts make are typed, because the package's own
// types are not resolvable from the repo root either.
export interface SharpImage {
  metadata(): Promise<{ width?: number; height?: number }>
  resize(options: { width: number; withoutEnlargement?: boolean }): SharpImage
  webp(options: { quality: number; effort: number }): SharpImage
  png(): SharpImage
  composite(layers: Array<{ input: Buffer }>): SharpImage
  toFile(file: string): Promise<unknown>
  toBuffer(options: { resolveWithObject: true }): Promise<{ data: Buffer; info: { width: number; height: number } }>
}
export type Sharp = (input: Buffer) => SharpImage

export function loadSharp(): Sharp {
  const fromNext = createRequire(require.resolve('next/package.json'))
  return fromNext('sharp') as Sharp
}
