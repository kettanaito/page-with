import * as fs from 'fs'
import * as path from 'path'
import { Server } from 'http'
import { AddressInfo } from 'net'
import { until } from '@open-draft/until'
import * as express from 'express'
import { v4 } from 'uuid'
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
  compileInMemory?: boolean
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

type PagesMap = Map<
  string,
  {
    entryPath: string
    options: PageOptions
  }
>

interface PageOptions {
  title?: string
  markup?: string
}

interface PageContext {
  previewUrl: string
}

const DEFAULT_SERVER_OPTIONS: ServerOptions = {
  compileInMemory: true,
}

export class PreviewServer {
  private options: ServerOptions
  private baseWebpackConfig: Configuration
  private memoryFs: IFs
  private app: express.Express
  private connection: Server | null
  private cache: Cache
  private pages: PagesMap
  private log: debug.Debugger

  public connectionInfo: ServerConnectionInfo | null

  public setOption<Name extends keyof ServerOptions>(
    name: Name,
    value: ServerOptions[Name],
  ): void {
    this.options[name] = value

    if (name === 'webpackConfig') {
      const prevBaseConfig = this.baseWebpackConfig
      const nextWebpackConfig = value as any
      this.baseWebpackConfig = merge(prevBaseConfig, nextWebpackConfig || {})
    }
  }

  constructor(options: ServerOptions = {}) {
    this.log = createLogger('server')
    this.options = { ...DEFAULT_SERVER_OPTIONS, ...options }
    this.baseWebpackConfig = merge(
      webpackConfig,
      this.options.webpackConfig || {},
    )
    this.memoryFs = createFsFromVolume(new Volume())
    this.cache = new Map()
    this.app = express()
    this.connection = null
    this.connectionInfo = null
    this.pages = new Map()

    this.initSettings()
    this.applyMiddleware()
    this.applyRoutes()
  }

  private initSettings() {
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

  public async compile(entryPath?: string): Promise<Set<Chunk>> {
    this.log('compiling entry...', entryPath)
    this.log('compiling to memory?', this.options.compileInMemory)

    if (!entryPath) {
      this.log('no entry given, skipping the compilation')
      return new Set()
    }

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

    this.log('resolved webpack configuration', webpackConfig)

    if (!this.options.compileInMemory) {
      this.log('compiling to dist:', webpackConfig.output)
    }

    if (this.options.compileInMemory) {
      compiler.outputFileSystem = this.memoryFs
    }

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

  private createPreviewUrl(pageId: string): string {
    const url = new URL(`/preview/${pageId}`, this.connectionInfo?.url)
    this.log('created a preview URL for %s (%s)', pageId, url.toString())

    return url.toString()
  }

  public createContext(entryPath: string, options: PageOptions): PageContext {
    const pageId = v4()
    this.pages.set(pageId, {
      entryPath,
      options,
    })

    const previewUrl = this.createPreviewUrl(pageId)

    return {
      previewUrl,
    }
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

    this.app.get<{ pageId: string }, string, void, { entry: string }>(
      '/preview/:pageId',
      async (req, res) => {
        this.log('[get] %s', req.url)
        const { pageId } = req.params
        const page = this.pages.get(pageId)

        if (!page) {
          return res.status(404).end()
        }

        const chunks = await this.compile(page.entryPath)
        const html = this.renderHtml(chunks, pageId)
        return res.send(html)
      },
    )
  }

  private renderHtml(chunks: Set<Chunk> | null, pageId: string): string {
    this.log('rendering html...')
    const page = this.pages.get(pageId)

    if (!page) {
      return `<p>Page with ID "${pageId}" not found.</p>`
    }

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
    const customMarkup = page?.options.markup

    if (customMarkup) {
      markup = fs.existsSync(customMarkup)
        ? fs.readFileSync(customMarkup, 'utf8')
        : customMarkup
    }

    const html = render(template, {
      title: page?.options.title,
      markup,
      assets,
    })
    this.log('rendered html', '\n', html)

    return html
  }
}
