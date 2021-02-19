import * as fs from 'fs'
import * as path from 'path'
import { Server } from 'http'
import { AddressInfo } from 'net'
import { until } from '@open-draft/until'
import * as express from 'express'
import { IFs, createFsFromVolume, Volume } from 'memfs'
import { webpack, Chunk, Configuration } from 'webpack'
import merge from 'webpack-merge'
import { render } from 'mustache'
import { staticFromMemory } from '../middleware/staticFromMemory'
import { asyncCompile } from '../utils/asyncCompile'
import { createLogger } from '../internal/createLogger'
import { webpackConfig } from '../webpack.config'

export interface ServerOptions {
  router?(app: express.Express): void
  webpackConfig?: Configuration
}

interface ServerConnectionInfo {
  port: number
  host: string
  url: string
}

interface CacheEntry {
  lastModified: number
  chunks: Set<Chunk>
}
type Cache = Map<string, CacheEntry>

export class PreviewServer {
  private options: ServerOptions
  private baseWebpackConfig: Configuration
  private memoryFs: IFs
  private app: express.Express
  private connection: Server | null
  private cache: Cache
  private log: debug.Debugger

  public connectionInfo: ServerConnectionInfo | null

  constructor(options: ServerOptions = {}) {
    this.log = createLogger('server')
    this.options = options
    this.baseWebpackConfig = merge(
      webpackConfig,
      this.options.webpackConfig || {},
    )
    this.memoryFs = createFsFromVolume(new Volume())
    this.cache = new Map()
    this.app = express()
    this.connection = null
    this.connectionInfo = null

    this.initSettings()
    this.applyMiddleware()
    this.applyRoutes()
  }

  private initSettings() {
    this.app.set('title', 'Preview')
    this.app.set('markup', null)
    this.app.set('contentBase', null)
  }

  public async listen(
    port = 0,
    host = 'localhost',
  ): Promise<ServerConnectionInfo> {
    return new Promise((resolve, reject) => {
      this.log('establishing server connection...')

      const connection = this.app.listen(port, host, () => {
        const { address, port } = connection.address() as AddressInfo
        const url = `http://${address}:${port}`
        this.connectionInfo = {
          port,
          host: address,
          url,
        }
        this.connection = connection
        this.log('preview server established at %s', url)
        resolve(this.connectionInfo)
      })

      connection.on('error', reject)
    })
  }

  public async compile(entryPath: string): Promise<Set<Chunk>> {
    this.log('compiling', entryPath)

    const absoluteEntryPath = path.isAbsolute(entryPath)
      ? entryPath
      : path.resolve(process.cwd(), entryPath)

    this.log('resolved absolute entry path', absoluteEntryPath)

    const entryStats = fs.statSync(absoluteEntryPath)
    const cachedEntry = this.cache.get(absoluteEntryPath)
    this.log('looking up a cached compilation...')

    if (cachedEntry?.lastModified === entryStats.mtimeMs) {
      this.log('found a cached compilation!', cachedEntry.lastModified)
      return cachedEntry.chunks
    }

    this.log('no cache found, compiling...')
    const webpackConfig = Object.assign({}, this.baseWebpackConfig, {
      entry: {
        main: absoluteEntryPath,
      },
    })
    const compiler = webpack(webpackConfig)
    // @ts-expect-error Incompatible types per official example.
    compiler.outputFileSystem = this.memoryFs
    const [compilationError, stats] = await until(() => asyncCompile(compiler))

    if (compilationError) {
      this.log('failed to compile', absoluteEntryPath)
      throw compilationError
    }

    const { chunks } = stats.compilation

    this.log('caching the compilation...', entryStats.mtimeMs, chunks.size)
    this.cache.set(absoluteEntryPath, {
      lastModified: entryStats.mtimeMs,
      chunks,
    })

    return chunks
  }

  public getCompilationUrl(entryPath: string): string {
    const url = new URL('/preview', this.connectionInfo?.url)

    if (entryPath) {
      url.searchParams.append('entry', entryPath)
    }

    return url.toString()
  }

  public use(middleware: (app: express.Express) => void): () => void {
    const prevRoutesCount = this.app._router.stack.length
    middleware(this.app)
    const nextRoutesCount = this.app._router.stack.length

    return () => {
      const runtimeRoutesCount = nextRoutesCount - prevRoutesCount
      this.app._router.stack.splice(-runtimeRoutesCount)
    }
  }

  public async close(): Promise<void> {
    this.log('closing the server...')

    if (!this.connection) {
      throw new Error('Failed to close a server: server is not running.')
    }

    return new Promise<void>((resolve, reject) => {
      this.connection?.close((error) => {
        if (error) {
          return reject(error)
        }

        this.log('successfully closed the server!')
        resolve()
      })
    })
  }

  private applyMiddleware() {
    this.applyContentBaseMiddleware()
    this.applyMemoryFsMiddleware()
  }

  private applyContentBaseMiddleware() {
    this.app.use((req, res, next) => {
      const contentBase = this.app.get('contentBase')

      if (contentBase) {
        return express.static(contentBase)(req, res, next)
      }

      return next()
    })
  }

  private applyMemoryFsMiddleware() {
    this.app.use('/assets', staticFromMemory(this.memoryFs))
  }

  private applyRoutes(): void {
    this.options.router?.(this.app)

    this.app.get<void, unknown, void, { entry: string }>(
      '/preview',
      async (req, res) => {
        this.log('[get] /preview')
        const { entry } = req.query
        const chunks = await this.compile(entry)
        const html = this.renderHtml(chunks)
        return res.send(html)
      },
    )
  }

  private renderHtml(chunks: Set<Chunk> | null): string {
    this.log('rendering html...')
    const assets = []

    for (const chunk of chunks || new Set()) {
      for (const filename of chunk.files) {
        assets.push(filename)
      }
    }

    const template = fs.readFileSync(
      path.resolve(__dirname, 'template.mustache'),
      'utf8',
    )
    let markup = ''
    const customMarkup = this.app.get('markup')

    if (customMarkup) {
      markup = fs.existsSync(customMarkup)
        ? fs.readFileSync(customMarkup, 'utf8')
        : customMarkup
    }

    const html = render(template, {
      title: 'Preview',
      markup,
      assets,
    })
    this.log('rendered html', '\n', html)

    return html
  }
}
