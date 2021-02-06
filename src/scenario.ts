import * as fs from 'fs'
import * as path from 'path'
import { createFsFromVolume, Volume } from 'memfs'
import { webpack } from 'webpack'
import { ChromiumBrowserContext, Page } from 'playwright'
import { browser } from './createBrowser'

export interface ScenarioOptions {
  usage: string
}

export interface ScenarioApi {
  browser: ChromiumBrowserContext
  page: Page
  newPage(): Promise<Page>
}

async function compileExample(entryPath: string): Promise<string> {
  const compiler = webpack({
    mode: 'development',
    entry: entryPath,
    output: {
      filename: 'main.js',
    },
    devtool: false,
    resolve: {
      modules: ['node_modules', path.resolve(process.cwd(), 'node_modules')],
    },
  })

  const memoryFs = createFsFromVolume(new Volume())
  // @ts-expect-error Incompatible callback arguments signature.
  compiler.outputFileSystem = memoryFs

  await new Promise<void>((resolve, reject) => {
    compiler.run((error, stats) => {
      if (error) {
        return reject(error)
      }

      if (!stats) {
        return reject()
      }

      resolve()
    })
  })

  const fileBuffer = memoryFs.readFileSync('dist/main.js', 'utf8')
  return fileBuffer.toString()
}

/**
 * Open a new page with the given usage scenario.
 */
export async function scenario(options: ScenarioOptions): Promise<ScenarioApi> {
  const { usage } = options
  const resolvedUsage = path.isAbsolute(usage)
    ? usage
    : path.resolve(process.cwd(), usage)

  if (!fs.existsSync(resolvedUsage)) {
    throw new Error(
      `Failed to load a scenario at "${resolvedUsage}": given file does not exist.`,
    )
  }

  const context = await browser.newContext()

  async function newPage() {
    const page = await context.newPage()
    const code = await compileExample(resolvedUsage)
    page.addScriptTag({
      content: code,
    })

    return page
  }

  const page = await newPage()

  return {
    browser: context,
    page,
    newPage,
  }
}
