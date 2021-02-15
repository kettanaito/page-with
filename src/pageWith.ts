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
  template?: string
  routes?(app: Express): void
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
  const { example, template } = options

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

  if (template) {
    log('using custom template', template)
    server.appendRoutes((app) => {
      app.set('template', template)
    })
  }

  const cleanupRoutes = options.routes
    ? server.appendRoutes(options.routes)
    : null
  const pendingCompilation = server.compileExample(fullExamplePath)

  const [context, compiledExample] = await Promise.all([
    browser.newContext(),
    pendingCompilation,
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
