import * as fs from 'fs'
import { Server } from 'http'
import { AddressInfo } from 'net'
import * as express from 'express'
import { Chunk, Configuration, webpack } from 'webpack'
import { debug } from 'debug'
import { merge } from 'webpack-merge'
import { createFsFromVolume, Volume } from 'memfs'
import { webpackConfig } from './webpack.config'

const log = debug('pageWith:server')
const memfs = createFsFromVolume(new Volume())

interface CreateServerOptions {
  webpackConfig: Configuration
}

export interface ServerApi {
  connection: Server
  url: string
  compileExample(
    entry: string,
  ): Promise<{
    url: string
  }>
  close(): Promise<void>
}

function makeHtmlWithChunks(chunks: Set<Chunk>) {
  const files = []
  for (const chunk of chunks) {
    for (const filename of chunk.files) {
      files.push(filename)
    }
  }

  const fileContents = files.map((filepath) => {
    return memfs.readFileSync(`dist/${filepath}`, 'utf8')
  })

  return `
<html>
<body>
  <h1>Hi from server!</h1>
  ${fileContents.map((content) => `<script>${content}</script>`)}
</body>
</html>
    `
}

export async function createServer(
  options: CreateServerOptions = {
    webpackConfig: {},
  },
): Promise<ServerApi> {
  const HOST = 'localhost'
  const config = merge(webpackConfig, options.webpackConfig)
  const app = express()

  const cache: Map<
    string,
    { lastModified: number; chunks: Set<Chunk> }
  > = new Map()

  app.get('/example', async (req, res) => {
    const entry = req.query.entry as string
    log('compiles usage example...', entry)

    const entryStats = fs.statSync(entry)
    const cachedEntry = cache.get(entry)

    const compiler = webpack(
      Object.assign({}, config, { entry: { main: entry } }),
    )
    // @ts-expect-error Incompatible types.
    compiler.outputFileSystem = memfs

    log('looking up the chunks from cache...', entryStats.mtimeMs)

    // Look up the compiled entry chunks from cache
    // if the entry file hasn't changed since the last compilation.
    if (cachedEntry && cachedEntry.lastModified === entryStats.mtimeMs) {
      log('using a cached entry')
      return res.send(makeHtmlWithChunks(cachedEntry.chunks))
    }

    log('no cached entry found, compiling...')

    const chunks = await new Promise<Set<Chunk>>((resolve, reject) => {
      compiler.run((error, stats) => {
        if (error) {
          log('compiler error', error)
          reject(error)
        }

        if (stats?.hasErrors()) {
          const errors = stats.toJson('errors')
          log('stats errors', errors)
          reject()
        }

        resolve(stats?.compilation.chunks || new Set())
      })
    }).catch((error) => {
      res.status(500).json({ error }).end()
      return null
    })

    if (!chunks) {
      res.status(404).json({ chunks }).end()
      return
    }

    log('caching the compilation', entryStats.mtimeMs, chunks.size)
    cache.set(entry, {
      lastModified: entryStats.mtimeMs,
      chunks,
    })

    return res.send(makeHtmlWithChunks(chunks))
  })

  const { url, connection } = await new Promise<{
    url: string
    connection: Server
  }>((resolve) => {
    const connection = app.listen(0, HOST, () => {
      const { port } = connection.address() as AddressInfo
      resolve({ url: `http://${HOST}:${port}`, connection })
    })
  })

  return {
    connection,
    url,
    async compileExample(entry) {
      log('loading example into WDS', entry)

      const exampleUrl = new URL(`/example?entry=${entry}`, url)

      return { url: exampleUrl.toString() }
    },
    close() {
      log('closing the server...')
      return new Promise<void>((resolve) => {
        connection.close(() => {
          log('successfully closed the server!')
          resolve()
        })
      })
    },
  }
}
