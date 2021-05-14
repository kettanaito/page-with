import * as fs from 'fs'
import * as path from 'path'
import { Express } from 'express'
import { ChromiumBrowserContext, Page } from 'playwright'
import { browser, server } from './createBrowser'
import { PreviewServer, ServerOptions } from './server/PreviewServer'
import { createLogger } from './internal/createLogger'
import { RequestHelperFn, createRequestUtil } from './utils/request'
import { debug } from './utils/debug'
import { ConsoleMessages, spyOnConsole } from './utils/spyOnConsole'

const log = createLogger('page')

export interface PageWithOptions {
  example: string
  markup?: string
  contentBase?: string
  routes?(app: Express): void
  title?: string
  env?: Record<string, string | number | boolean>
  serverOptions?: ServerOptions
}

export interface ScenarioApi {
  page: Page
  origin: string
  makeUrl(chunk: string): string
  debug(page?: Page): Promise<void>
  request: RequestHelperFn
  context: ChromiumBrowserContext
  consoleSpy: ConsoleMessages
  server: PreviewServer
}

/**
 * Open a new page with the given usage scenario.
 */
export async function pageWith(options: PageWithOptions): Promise<ScenarioApi> {
  const { example, markup, contentBase, title } = options

  /**
   * @todo Pass that `pageId` to the server to establish a unique route
   * for this page!
   */

  log(`loading example at "${example}"`)

  if (example) {
    const fullExamplePath = path.isAbsolute(example)
      ? example
      : path.resolve(process.cwd(), example)
    if (!fs.existsSync(fullExamplePath)) {
      throw new Error(
        `Failed to load a scenario at "${fullExamplePath}": given file does not exist.`,
      )
    }
  }

  if (markup) {
    log('using a custom markup', markup)
  }

  if (contentBase) {
    log('using a custom content base', contentBase)
  }

  server.use((app) => {
    if (title) {
      app.set('title', title)
    }

    if (markup) {
      app.set('markup', markup)
    }

    if (contentBase) {
      app.set('contentBase', contentBase)
    }
  })

  const cleanupRoutes = options.routes ? server.use(options.routes) : null

  if (options.serverOptions) {
    Object.entries(options.serverOptions).forEach(([name, value]) => {
      server.setOption(name as any, value)
    })
  }

  const [context] = await Promise.all([
    browser.newContext(),
    server.compile(example),
  ])

  const serverContext = server.createContext(example, {
    title: options.title,
    markup: options.markup,
  })

  log('compiled example running at', serverContext.previewUrl)

  const page = await context.newPage()
  const consoleSpy = spyOnConsole(page)

  log('navigating to the compiled example...', serverContext.previewUrl)
  await page.goto(serverContext.previewUrl, { waitUntil: 'networkidle' })

  if (options.env) {
    await page.evaluate((variables) => {
      variables.forEach(([variableName, value]) => {
        // @ts-expect-error Adding a custom "window" property.
        window[variableName] = value
      })
    }, Object.entries(options.env))
  }

  page.on('close', () => {
    log('closing the page...')
    cleanupRoutes?.()
  })

  return {
    page,
    origin: serverContext.previewUrl,
    context,
    makeUrl(chunk) {
      return new URL(chunk, server.connectionInfo?.url).toString()
    },
    debug(customPage) {
      return debug(customPage || page)
    },
    request: createRequestUtil(page, server),
    consoleSpy,
    server,
  }
}
