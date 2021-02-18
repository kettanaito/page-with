import * as fs from 'fs'
import * as path from 'path'
import { Express } from 'express'
import { ChromiumBrowserContext, Page } from 'playwright'
import { browser, server } from './createBrowser'
import { ServerApi } from './createServer'
import { RequestHelperFn, createRequestUtil } from './utils/request'
import { debug } from './utils/debug'
import { ConsoleMessages, spyOnConsole } from './utils/spyOnConsole'
import { createLogger } from './internal/createLogger'

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
  server: ServerApi
}

/**
 * Open a new page with the given usage scenario.
 */
export async function pageWith(options: PageWithOptions): Promise<ScenarioApi> {
  const { example, markup, contentBase, title } = options

  log(`loading example at "${example}"`)

  const fullExamplePath = path.isAbsolute(example)
    ? example
    : path.resolve(process.cwd(), example)

  log(`resolved usage path to "${fullExamplePath}"`)

  if (!fs.existsSync(fullExamplePath)) {
    throw new Error(
      `Failed to load a scenario at "${fullExamplePath}": given file does not exist.`,
    )
  }

  if (markup) {
    log('using a custom markup', markup)
  }

  if (contentBase) {
    log('using a custom content base', contentBase)
  }

  server.appendRoutes((app) => {
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

  const cleanupRoutes = options.routes
    ? server.appendRoutes(options.routes)
    : null

  const [context, compiledExample] = await Promise.all([
    browser.newContext(),
    server.compileExample(fullExamplePath),
  ])

  log('Compiled example running at', compiledExample.url)

  const page = await context.newPage()
  const consoleSpy = spyOnConsole(page)
  await page.goto(compiledExample.url, { waitUntil: 'networkidle' })

  page.on('close', () => {
    log('closing the page...')
    cleanupRoutes?.()
  })

  return {
    page,
    origin: compiledExample.url,
    context,
    makeUrl(chunk) {
      return new URL(chunk, server.url).toString()
    },
    debug(customPage) {
      return debug(customPage || page)
    },
    request: createRequestUtil(page, server),
    consoleSpy,
    server,
  }
}
