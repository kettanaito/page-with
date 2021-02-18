import * as fs from 'fs'
import { createFsFromVolume, Volume } from 'memfs'
import { Server } from 'http'
import { AddressInfo } from 'net'
import * as express from 'express'
import { Chunk, Configuration, webpack } from 'webpack'
import { merge } from 'webpack-merge'
import { webpackConfig } from './webpack.config'
import { createLogger } from './internal/createLogger'
import { staticFromMemory } from './middleware/staticFromMemory'

const log = createLogger('server')
const memfs = createFsFromVolume(new Volume())

const PREVIEW_ROUTE = '/preview'

export interface ServerOptions {
  router?(app: express.Express): void
  webpackConfig?: Configuration
}

interface ExampleCompilationResult {
  url: string
}

export interface ServerApi {
  connection: Server
  url: string
  compileExample(examplePath: string): Promise<ExampleCompilationResult>
  appendRoutes(middleware: (app: express.Express) => void): () => void
  close(): Promise<void>
}

interface CacheEntry {
  lastModified: number
  chunks: Set<Chunk>
}
type Cache = Map<string, CacheEntry>

function makeHtmlWithChunks(chunks: Set<Chunk>, title: string, markup: string) {
  const files = []
  for (const chunk of chunks) {
    for (const filename of chunk.files) {
      files.push(filename)
    }
  }

  const scriptTags = files.map((filePath) => {
    return `<script type="application/javascript" src="/assets/${filePath}"></script>`
  })

  let resolvedMarkup = ''

  if (markup) {
    resolvedMarkup = fs.existsSync(markup)
      ? fs.readFileSync(markup, 'utf8')
      : markup
    log('using custom markup', resolvedMarkup)
  }

  const html = `
<!DOCTYPE html>
<html>
  <head>
    <title>${title}</title>
  </head>
  <body>
    ${resolvedMarkup}
    <section id="assets">
      ${scriptTags.join('\n')}
    </section>
  </body>
</html>
    `

  log(
    'appending %d chunk(s) (%s script tags)...',
    chunks.size,
    scriptTags.length,
  )

  return html
}

export async function createServer(
  options: ServerOptions = {
    webpackConfig: {},
  },
): Promise<ServerApi> {
  const HOST = 'localhost'
  const config = merge(webpackConfig, options.webpackConfig || {})
  const app = express()

  app.set('title', 'Preview')
  app.set('markup', null)
  app.set('contentBase', null)

  const cache: Cache = new Map()

  // Append custom routes and middleware.
  options.router?.(app)

  app.use((req, res, next) => {
    if (app.get('contentBase')) {
      return express.static(app.get('contentBase'))(req, res, next)
    }

    next()
  })

  // Serve compilation assets from memory.
  app.use('/assets', staticFromMemory(memfs))

  app.get<void, any, void, { example: string }>(
    PREVIEW_ROUTE,
    async (req, res) => {
      const { example } = req.query
      log('compiling usage example...', example)

      const entryStats = fs.statSync(example)
      const cachedEntry = cache.get(example)

      const compiler = webpack(
        Object.assign({}, config, { entry: { main: example } }),
      )
      // @ts-expect-error Incompatible types.
      compiler.outputFileSystem = memfs

      log('looking up the chunks from cache...', entryStats.mtimeMs)

      // Look up the compiled entry chunks from cache
      // if the entry file hasn't changed since the last compilation.
      if (cachedEntry && cachedEntry.lastModified === entryStats.mtimeMs) {
        log('found a cached build!')
        return res.send(
          makeHtmlWithChunks(
            cachedEntry.chunks,
            app.get('title'),
            app.get('markup'),
          ),
        )
      }

      log('no cached build found, compiling...')

      const chunks = await new Promise<Set<Chunk>>((resolve, reject) => {
        compiler.run((error, stats) => {
          if (error) {
            log('compilation error', error)
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

      log('cached the build under', entryStats.mtimeMs, chunks.size)
      cache.set(example, {
        lastModified: entryStats.mtimeMs,
        chunks,
      })

      return res.send(
        makeHtmlWithChunks(chunks, app.get('title'), app.get('markup')),
      )
    },
  )

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

    /**
     * Address of the running preview server.
     */
    url,

    /**
     * Compile an example module at the given path.
     */
    async compileExample(examplePath) {
      log('compiling example...', examplePath)

      const previewUrl = new URL(PREVIEW_ROUTE, url)
      previewUrl.searchParams.append('example', examplePath)

      return { url: previewUrl.toString() }
    },
    appendRoutes(middleware) {
      const prevRoutesCount = app._router.stack.length
      middleware(app)
      const nextRoutesCount = app._router.stack.length

      return () => {
        const runtimeRoutesCount = nextRoutesCount - prevRoutesCount
        log('cleaning up routes...', runtimeRoutesCount)

        // Remove the exact amount of routes that were added by the pge.
        app._router.stack.splice(-runtimeRoutesCount)
      }
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
