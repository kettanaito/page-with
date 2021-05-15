import * as fs from 'fs'
import { Chunk } from 'webpack'

export interface CacheEntry {
  chunks: Set<Chunk>
  createdAt: number
}

interface CreateCacheReturnType {
  set(key: string, chunks: Set<Chunk>): void
  get(key: string): CacheEntry | undefined
}

export function useCache(): CreateCacheReturnType {
  const entries = new Map<string, CacheEntry>()

  return {
    set(key, chunks) {
      entries.set(key, {
        chunks,
        createdAt: Date.now(),
      })
    },
    get(key) {
      const cachedEntry = entries.get(key)

      if (typeof cachedEntry === 'undefined') {
        return undefined
      }

      const fileStats = fs.statSync(key)

      if (fileStats.mtimeMs > cachedEntry.createdAt) {
        return undefined
      }

      return cachedEntry
    },
  }
}
