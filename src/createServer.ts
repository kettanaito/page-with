import * as fs from 'fs'
import { createFsFromVolume, Volume } from 'memfs'
import { Server } from 'http'
import { AddressInfo } from 'net'
import * as express from 'express'
import { Chunk, Configuration, webpack } from 'webpack'
import { merge } from 'webpack-merge'
import { webpackConfig } from './webpack.config'
import { createLogger } from './internal/createLogger'

const log = createLogger('server')
const memfs = createFsFromVolume(new Volume())

export interface ServerOptions {
  router?(app: express.Express): void
  webpackConfig?: Configuration
}

export interface ServerApi {
  connection: Server
  url: string
  compileExample(
    entry: string,
  ): Promise<{
    url: string
  }>
  appendRoutes(middleware: (app: express.Express) => void): () => void
  close(): Promise<void>
}

function makeHtmlWithChunks(chunks: Set<Chunk>, customTemplate?: string) {
  const files = []
  for (const chunk of chunks) {
    for (const filename of chunk.files) {
      files.push(filename)
    }
  }

  const fileContents = files.map((filepath) => {
    return memfs.readFileSync(`dist/${filepath}`, 'utf8')
  })

  const assets = fileContents
    .map((content) => `<script>${content}</script>`)
    .join('\n')

  let template = `
<!DOCTYPE html>
<html>
  <body>
  </body>
</html>
    `

  if (customTemplate) {
    log('using custom template', customTemplate)
    template = fs.existsSync(customTemplate)
      ? fs.readFileSync(customTemplate, 'utf8')
      : customTemplate
  }

  log('template for page', template)

  return template.concat(assets)
}

export async function createServer(
  options: ServerOptions = {
    webpackConfig: {},
  },
): Promise<ServerApi> {
  const HOST = 'localhost'
  const config = merge(webpackConfig, options.webpackConfig || {})
  const app = express()
  app.set('template', null)

  const cache: Map<
    string,
    { lastModified: number; chunks: Set<Chunk> }
  > = new Map()

  // Append custom routes and middleware.
  options.router?.(app)

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
      return res.send(
        makeHtmlWithChunks(cachedEntry.chunks, app.get('template')),
      )
    }

    log('no cached entry found, compiling...')

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

    log('cached the compilation under', entryStats.mtimeMs, chunks.size)
    cache.set(entry, {
      lastModified: entryStats.mtimeMs,
      chunks,
    })

    return res.send(makeHtmlWithChunks(chunks, app.get('template')))
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
      log('compiling example...', entry)

      const exampleUrl = new URL(`/example?entry=${entry}`, url)

      return { url: exampleUrl.toString() }
    },
    appendRoutes(middleware) {
      const prevRoutesCount = app._router.stack.length
      middleware(app)
      const nextRoutesCount = app._router.stack.length

      return () => {
        const runtimeRoutesCount = nextRoutesCount - prevRoutesCount
        log('cleaning up routes...', runtimeRoutesCount)
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
