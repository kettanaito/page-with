import * as fs from 'fs'
import * as path from 'path'
import { Express } from 'express'
import { ChromiumBrowserContext, Page } from 'playwright'
import { browser, server } from './createBrowser'
import { PreviewServer } from './server/PreviewServer'
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

  const [context] = await Promise.all([
    browser.newContext(),
    server.compile(example),
  ])

  const compilationUrl = server.getCompilationUrl(example)
  log('compiled example running at', compilationUrl)

  const page = await context.newPage()
  const consoleSpy = spyOnConsole(page)

  log('navigating to the compiled example...', compilationUrl)
  await page.goto(compilationUrl, { waitUntil: 'networkidle' })

  page.on('close', () => {
    log('closing the page...')
    cleanupRoutes?.()
  })

  return {
    page,
    origin: compilationUrl,
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
