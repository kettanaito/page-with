import * as path from 'path'

export function toAbsolutePath(...chunks: string[]): string {
  const endPath = path.resolve(...chunks)

  if (path.isAbsolute(endPath)) {
    return endPath
  }

  return path.resolve(process.cwd(), endPath)
}
