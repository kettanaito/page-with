import * as fs from 'fs'
import { Chunk, webpack } from 'webpack'
import { v4 } from 'uuid'
import * as express from 'express'
import { until } from '@open-draft/until'
import { ServerContext, ClusterOptions } from './server'
import { useCache } from './useCache'
import { invariant } from './utils/invariant'
import { toAbsolutePath } from './utils/toAbsolutePath'
import { asyncCompile } from '../utils/asyncCompile'
import { makeUrl } from './utils/makeUrl'
import { createFsFromVolume, Volume } from 'memfs'
import { staticFromMemory } from 'src/middleware/staticFromMemory'

export interface ClusterApi {
  id: string
  compile(entry: string): Promise<CompileResult>
  getUrl(url: string): string
  getStaticUrl(url: string): string
}

export interface CompileResult {
  url: string
  chunks: Set<Chunk>
}

function getChunkFiles(chunks: Set<Chunk>): string[] {
  const files = []

  for (const chunk of chunks) {
    files.push(...chunk.files)
  }

  return files
}

export function createCluster(
  context: ServerContext,
  options?: ClusterOptions,
): ClusterApi {
  const clusterId = v4()
  const memoryFs = createFsFromVolume(new Volume())
  const cache = useCache()
  const clusterUrl = `/${clusterId}`
  const absoluteClusterUrl = makeUrl(clusterUrl, context.connection.url) + '/'

  const clusterRouter = express.Router()
  clusterRouter.use('/fs', staticFromMemory(memoryFs))
  clusterRouter.get('/', (_, res) => {
    res.status(200).send('OK')
  })

  if (options?.contentBase) {
    invariant(
      fs.existsSync(options.contentBase),
      `Failed to use "${options.contentBase}" as a content base: given directory doesn't exist.`,
    )

    clusterRouter.use('/static', express.static(options.contentBase))
  }

  context.app.use(clusterUrl, clusterRouter)

  return {
    id: clusterId,

    getUrl(url) {
      return makeUrl(url, absoluteClusterUrl)
    },

    getStaticUrl(url) {
      const absoluteStaticUrl = this.getUrl('static') + '/'
      return makeUrl(url, absoluteStaticUrl)
    },

    async compile(entry) {
      const resolvedEntryPath = toAbsolutePath(entry)
      invariant(fs.existsSync(resolvedEntryPath), 'Entry path does not exist')

      // Lookup a cached compilation for the same entry
      // if it hasn't been edited since the last compilation.
      const cachedCompilation = cache.get(resolvedEntryPath)

      if (cachedCompilation) {
        const { chunks } = cachedCompilation

        return {
          url: '???',
          chunks,
        }
      }

      const compiler = webpack({
        entry: resolvedEntryPath,
      })
      // @ts-expect-error Incompatible types per official example.
      compiler.outputFileSystem = memoryFs

      const [compilerError, compilerStats] = await until(() =>
        asyncCompile(compiler),
      )

      if (compilerError) {
        throw compilerError
      }

      const { chunks } = compilerStats.compilation
      const files = getChunkFiles(chunks)

      cache.set(resolvedEntryPath, chunks)

      return {
        url: this.getUrl(`/fs/${files[0]}`),
        chunks,
      }
    },
  }
}
