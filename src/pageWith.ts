import * as fs from 'fs'
import * as path from 'path'
import debug from 'debug'
import { ChromiumBrowserContext, Page } from 'playwright'
import { browser, server } from './createBrowser'

const log = debug('pageWith:pageWith')

export interface PageWithOptions {
  example: string
}

export interface ScenarioApi {
  page: Page
  origin: string
  context: ChromiumBrowserContext
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

  const pendingCompilation = server.compileExample(fullExamplePath)

  const [context, compiledExample] = await Promise.all([
    browser.newContext(),
    pendingCompilation,
  ])

  log('Compiled example running at', compiledExample.url)

  const page = await context.newPage()
  await page.goto(compiledExample.url, { waitUntil: 'networkidle' })

  return {
    page,
    origin: compiledExample.url,
    context,
  }
}
