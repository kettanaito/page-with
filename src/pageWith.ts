import * as fs from 'fs'
import * as path from 'path'
import debug from 'debug'
import { Express } from 'express'
import { ChromiumBrowserContext, Page } from 'playwright'
import { browser, server } from './createBrowser'
import { RequestHelperFn, createRequestUtil } from './utils/request'
import { ConsoleMessages, spyOnConsole } from './utils/spyOnConsole'

const log = debug('pageWith:pageWith')

export interface PageWithOptions {
  example: string
  routes?(app: Express): void
}

export interface ScenarioApi {
  page: Page
  origin: string
  makeUrl(chunk: string): string
  request: RequestHelperFn
  context: ChromiumBrowserContext
  debug(): Promise<void>
  consoleSpy: ConsoleMessages
}

/**
 * Open a new page with the given usage scenario.
 */
export async function pageWith(options: PageWithOptions): Promise<ScenarioApi> {
  const { example } = options

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
    request: createRequestUtil(page, server),
    consoleSpy,
  }
}
